"""Persona's small integration surface for Spiritus update discovery."""
from __future__ import annotations

import json
import platform
import subprocess
import sys
import tomllib
from pathlib import Path
from typing import Any

from spiritus import (
    StagedUpdate,
    SubprocessInstallerHandoff,
    UpdateCheck,
    UpdateClient,
    UpdateConfig,
    UpdateError,
    UpdateInstallerError,
)
from spiritus.runtime.paths import app_data_dir, is_bundled


_STAGED_UPDATE: StagedUpdate | None = None


def _resource_root() -> Path:
    if is_bundled():
        return Path(getattr(sys, "_MEIPASS"))
    return Path(__file__).resolve().parent


def _current_version(root: Path) -> str:
    manifest_paths = [root / "spiritus-bundle.json"]
    if is_bundled():
        manifest_paths.append(Path(sys.executable).resolve().parent / "spiritus-bundle.json")
    for manifest in manifest_paths:
        if manifest.is_file():
            payload = json.loads(manifest.read_text(encoding="utf-8"))
            version = str(payload.get("version") or "").strip()
            if version:
                return version

    with (root / "pyproject.toml").open("rb") as handle:
        return str(tomllib.load(handle)["project"]["version"])


def _config(root: Path, *, session: Any = None) -> UpdateConfig:
    with (root / "spiritus.bundle.toml").open("rb") as handle:
        payload = tomllib.load(handle)
    return UpdateConfig.from_mapping(
        payload["updates"],
        app_id="persona",
        current_version=_current_version(root),
        session=session,
    )


def _client(root: Path, *, session: Any = None) -> UpdateClient:
    return UpdateClient(
        _config(root, session=session),
        platform=sys.platform,
        architecture=platform.machine(),
    )


def _staging_dir(root: Path) -> Path:
    if is_bundled():
        return app_data_dir("persona") / "updates"
    return root / ".spiritus-update-staging"


def _result_payload(result: UpdateCheck) -> dict[str, object]:
    payload: dict[str, object] = {
        "status": result.status.value,
        "current_version": result.current_version,
        "available": result.available,
    }
    if result.error:
        payload["error"] = result.error
    if result.candidate:
        payload.update(
            {
                "version": result.candidate.version,
                "release_notes": result.candidate.release_notes,
                "release_notes_url": result.candidate.release_notes_url,
            }
        )
    if result.artifact:
        payload["artifact"] = {
            "filename": result.artifact.filename,
            "url": result.artifact.url,
            "sha256": result.artifact.sha256,
        }
    return payload


def check_for_updates(*, session: Any = None, root: Path | None = None) -> dict[str, object]:
    """Return JSON-safe update status for the Persona bridge/UI."""
    root = root or _resource_root()
    return _result_payload(_client(root, session=session).check())


def stage_update(
    *,
    session: Any = None,
    root: Path | None = None,
    destination: Path | None = None,
) -> dict[str, object]:
    """Download and verify the selected installer without launching it."""
    global _STAGED_UPDATE

    root = root or _resource_root()
    client = _client(root, session=session)
    result = client.check()
    payload = _result_payload(result)
    if not result.available:
        return payload
    try:
        staged = client.stage_update(result, destination or _staging_dir(root))
    except UpdateError as exc:
        payload.update({"status": "error", "error": str(exc)})
        return payload
    _STAGED_UPDATE = staged
    payload.update(
        {
            "staged_path": str(staged.path),
            "staged_bytes": staged.bytes,
            "staged_sha256": staged.sha256,
        }
    )
    return payload


def launch_staged_update(path: str | Path) -> dict[str, object]:
    """Launch the verified installer and close Persona so it can update safely."""
    global _STAGED_UPDATE

    staged = _STAGED_UPDATE
    if staged is None:
        raise UpdateInstallerError("no verified installer is ready to launch")
    candidate = Path(path).resolve()
    if candidate != staged.path.resolve():
        raise UpdateInstallerError("installer path does not match the verified update")

    if sys.platform == "darwin":
        subprocess.Popen(["open", str(staged.path)], shell=False)
    else:
        SubprocessInstallerHandoff().launch(staged)

    _STAGED_UPDATE = None
    try:
        import webview

        if webview.windows:
            webview.windows[0].destroy()
    except Exception:
        pass
    return {"status": "launched", "staged_path": str(candidate)}
