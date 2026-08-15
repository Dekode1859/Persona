"""Persona's small integration surface for Spiritus update discovery."""
from __future__ import annotations

import hashlib
import json
import os
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
    UpdateArtifact,
    UpdateClient,
    UpdateConfig,
    UpdateError,
    UpdateInstallerError,
)
from spiritus.runtime.paths import app_data_dir, is_bundled


_STAGED_UPDATE: StagedUpdate | None = None
_STAGED_VERSION: str | None = None


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


def _staged_manifest_path(root: Path) -> Path:
    return _staging_dir(root) / "staged.json"


def _staged_payload(staged: StagedUpdate, version: str, current_version: str) -> dict[str, object]:
    return {
        "status": "ready",
        "available": False,
        "current_version": current_version,
        "version": version,
        "staged_path": str(staged.path),
        "staged_bytes": staged.bytes,
        "staged_sha256": staged.sha256,
    }


def _load_staged_update(root: Path) -> tuple[StagedUpdate, str] | None:
    manifest_path = _staged_manifest_path(root)
    if not manifest_path.is_file():
        return None
    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        artifact_payload = payload["artifact"]
        artifact = UpdateArtifact(
            filename=str(artifact_payload["filename"]),
            url=str(artifact_payload["url"]),
            platform=artifact_payload.get("platform"),
            architecture=artifact_payload.get("architecture"),
            kind=artifact_payload.get("kind"),
            sha256=artifact_payload.get("sha256"),
            signature_url=artifact_payload.get("signature_url"),
            size=artifact_payload.get("size"),
        )
        staged_path = Path(str(payload["path"])).resolve()
        staging_dir = _staging_dir(root).resolve()
        if staged_path.parent != staging_dir or not staged_path.is_file():
            raise ValueError("staged update file is missing")
        staged = StagedUpdate(
            artifact=artifact,
            path=staged_path,
            bytes=int(payload["bytes"]),
            sha256=str(payload["sha256"]),
        )
        version = str(payload["version"]).strip()
        if not version:
            raise ValueError("staged update version is missing")
        return staged, version
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        manifest_path.unlink(missing_ok=True)
        return None


def _remember_staged_update(root: Path, staged: StagedUpdate, version: str) -> None:
    manifest_path = _staged_manifest_path(root)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": version,
        "path": str(staged.path.resolve()),
        "bytes": staged.bytes,
        "sha256": staged.sha256,
        "artifact": {
            "filename": staged.artifact.filename,
            "url": staged.artifact.url,
            "platform": staged.artifact.platform,
            "architecture": staged.artifact.architecture,
            "kind": staged.artifact.kind,
            "sha256": staged.artifact.sha256,
            "signature_url": staged.artifact.signature_url,
            "size": staged.artifact.size,
        },
    }
    temporary = manifest_path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, manifest_path)


def _test_mode() -> str:
    """Return the explicit development-only update simulation mode."""
    if is_bundled():
        return ""
    return os.environ.get("PERSONA_UPDATE_TEST_MODE", "").strip().lower()


def _test_version() -> str:
    return os.environ.get("PERSONA_UPDATE_TEST_VERSION", "99.0.0").strip() or "99.0.0"


def _create_test_staged_update(root: Path, version: str) -> StagedUpdate:
    payload = b"Persona development update fixture; do not install."
    staging = _staging_dir(root)
    staging.mkdir(parents=True, exist_ok=True)
    path = staging / f"Persona-Setup-{version}.exe"
    path.write_bytes(payload)
    digest = hashlib.sha256(payload).hexdigest()
    artifact = UpdateArtifact(
        filename=path.name,
        url="https://example.test/persona-development-update.exe",
        sha256=digest,
        size=len(payload),
    )
    staged = StagedUpdate(artifact, path, len(payload), digest)
    _remember_staged_update(root, staged, version)
    return staged


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
    global _STAGED_UPDATE, _STAGED_VERSION

    root = root or _resource_root()
    mode = _test_mode()
    current_version = _current_version(root)
    if mode == "available":
        return {
            "status": "available",
            "available": True,
            "current_version": current_version,
            "version": _test_version(),
        }
    if mode == "ready":
        staged = _load_staged_update(root)
        if staged is None:
            version = _test_version()
            staged = (_create_test_staged_update(root, version), version)
        _STAGED_UPDATE, _STAGED_VERSION = staged
        return _staged_payload(_STAGED_UPDATE, _STAGED_VERSION, current_version)
    existing = _load_staged_update(root)
    if existing:
        _STAGED_UPDATE, _STAGED_VERSION = existing
        return _staged_payload(_STAGED_UPDATE, _STAGED_VERSION, _current_version(root))
    return _result_payload(_client(root, session=session).check())


def stage_update(
    *,
    session: Any = None,
    root: Path | None = None,
    destination: Path | None = None,
) -> dict[str, object]:
    """Download and verify the selected installer without launching it."""
    global _STAGED_UPDATE, _STAGED_VERSION

    root = root or _resource_root()
    mode = _test_mode()
    current_version = _current_version(root)
    if mode in {"available", "ready"}:
        staged = _load_staged_update(root)
        if staged is None:
            version = _test_version()
            staged = (_create_test_staged_update(root, version), version)
        _STAGED_UPDATE, _STAGED_VERSION = staged
        return {
            "status": "available",
            "available": True,
            "current_version": current_version,
            "version": _STAGED_VERSION,
            "staged_path": str(_STAGED_UPDATE.path),
            "staged_bytes": _STAGED_UPDATE.bytes,
            "staged_sha256": _STAGED_UPDATE.sha256,
        }
    existing = _load_staged_update(root)
    if existing:
        _STAGED_UPDATE, _STAGED_VERSION = existing
        return _staged_payload(_STAGED_UPDATE, _STAGED_VERSION, _current_version(root))
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
    _STAGED_VERSION = payload.get("version") if isinstance(payload.get("version"), str) else None
    if not _STAGED_VERSION:
        _STAGED_UPDATE = None
        return {"status": "error", "error": "The update did not include a release version."}
    try:
        _remember_staged_update(root, staged, _STAGED_VERSION)
    except OSError as exc:
        _STAGED_UPDATE = None
        _STAGED_VERSION = None
        payload.update({"status": "error", "error": f"Could not save the downloaded update: {exc}"})
        return payload
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
    global _STAGED_UPDATE, _STAGED_VERSION

    staged = _STAGED_UPDATE
    if staged is None:
        loaded = _load_staged_update(_resource_root())
        if loaded:
            staged, _STAGED_VERSION = loaded
            _STAGED_UPDATE = staged
    if staged is None:
        raise UpdateInstallerError("no verified installer is ready to launch")
    candidate = Path(path).resolve()
    if candidate != staged.path.resolve():
        raise UpdateInstallerError("installer path does not match the verified update")

    if _test_mode() in {"available", "ready"}:
        result = {"status": "launched", "staged_path": str(candidate), "test_mode": True}
        _STAGED_UPDATE = None
        _STAGED_VERSION = None
        _staged_manifest_path(_resource_root()).unlink(missing_ok=True)
        return result
    if sys.platform == "darwin":
        subprocess.Popen(["open", str(staged.path)], shell=False)
    else:
        SubprocessInstallerHandoff().launch(staged)

    _STAGED_UPDATE = None
    _STAGED_VERSION = None
    _staged_manifest_path(_resource_root()).unlink(missing_ok=True)
    try:
        import webview

        if webview.windows:
            webview.windows[0].destroy()
    except Exception:
        pass
    return {"status": "launched", "staged_path": str(candidate)}
