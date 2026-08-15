"""
Persona - a Spiritus application.

A Profile ("About Me") workspace. Upload / paste candidate documents, extract a
structured profile via the `profile` agent, render and edit it, then track and
tailor applications against it.

The reusable runtime, storage, providers, and bridge come from Spiritus. This
app supplies its configuration, domain assets, and custom bridge methods, plus
its own UI (an About Me dashboard) via AppConfig.ui_dir.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from spiritus import run, AppConfig, WorkspaceFolder
from spiritus import engine
from spiritus.runtime.paths import is_bundled, project_root

from app_bridge import PersonaBridge
from persona_updates import check_for_updates


_APP_ID = os.environ.get("PERSONA_APP_ID", "persona")
_APP_TITLE = os.environ.get("PERSONA_APP_TITLE", "Persona")


def _bundle_root() -> Path:
    """Return the read-only resource directory used by PyInstaller."""
    if is_bundled():
        return Path(getattr(sys, "_MEIPASS"))
    return Path(__file__).resolve().parent


def _sync_bundled_agent_config(
    bundle_root: Path | None = None,
    app_data_root: Path | None = None,
) -> bool:
    """Merge the packaged Persona agents into writable app data.

    Spiritus seed files are intentionally copied only when they do not exist,
    so an upgrade can otherwise keep an old ``opencode.json`` forever. Persona
    owns the agents shipped in that file; merge those definitions on startup
    while preserving user-owned agents and unrelated configuration.
    """
    source_path = (bundle_root or _bundle_root()) / "opencode.json"
    target_root = app_data_root or project_root(Path(__file__).resolve().parent, _APP_ID)
    target_path = target_root / "opencode.json"
    if not source_path.is_file():
        return False

    source = json.loads(source_path.read_text(encoding="utf-8-sig"))
    if not isinstance(source, dict):
        raise ValueError(f"bundled OpenCode config must be an object: {source_path}")
    source_agents = source.get("agent") or {}
    if not isinstance(source_agents, dict):
        raise ValueError(f"bundled OpenCode agents must be an object: {source_path}")

    if target_path.is_file():
        target = json.loads(target_path.read_text(encoding="utf-8-sig"))
        if not isinstance(target, dict):
            raise ValueError(f"writable OpenCode config must be an object: {target_path}")
    else:
        target = {}

    target_agents = target.get("agent")
    if not isinstance(target_agents, dict):
        target_agents = {}
        target["agent"] = target_agents

    changed = False
    for name, definition in source_agents.items():
        if target_agents.get(name) != definition:
            target_agents[name] = definition
            changed = True

    if changed or not target_path.is_file():
        target_root.mkdir(parents=True, exist_ok=True)
        target_path.write_text(
            json.dumps(target, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    return changed


def _verify_bundle() -> None:
    """Smoke-test resources used by CI without opening a native window."""
    if not is_bundled():
        raise SystemExit("bundle verification must run from a frozen build")

    root = _bundle_root()
    binary_name = "opencode.exe" if sys.platform == "win32" else "opencode"
    bundled_engine = root / "engine" / binary_name
    if not bundled_engine.is_file():
        raise SystemExit(f"missing bundled OpenCode engine: {bundled_engine}")
    resolved_engine = engine.resolve()
    if resolved_engine != bundled_engine:
        raise SystemExit(
            f"Spiritus did not resolve the bundled engine: {resolved_engine}"
        )
    version = engine.binary_version(bundled_engine)
    if not version:
        raise SystemExit(f"bundled OpenCode engine did not report a version: {bundled_engine}")
    if not (root / "ui" / "index.html").is_file():
        raise SystemExit("missing bundled Persona UI")
    if not (root / "scanner" / "linkedin_scan.py").is_file():
        raise SystemExit("missing bundled scanner script")
    if not (root / "schemas" / "profile.schema.json").is_file():
        raise SystemExit("missing bundled profile schema")
    if not (root / "ms-playwright").is_dir():
        raise SystemExit("missing bundled Playwright browsers")
    browser_path = os.environ.get("PLAYWRIGHT_BROWSERS_PATH")
    if not browser_path or Path(browser_path).resolve() != (root / "ms-playwright").resolve():
        raise SystemExit(
            "Spiritus did not configure the bundled Playwright browser path"
        )
    seeded_config = project_root(Path(__file__).resolve().parent, _APP_ID) / "opencode.json"
    try:
        _sync_bundled_agent_config(root, seeded_config.parent)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        raise SystemExit(f"could not prepare writable OpenCode config: {exc}") from exc
    if not seeded_config.is_file():
        raise SystemExit(f"missing seeded writable OpenCode config: {seeded_config}")
    try:
        config = json.loads(seeded_config.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"invalid writable OpenCode config: {seeded_config}: {exc}") from exc
    if "profile-pdf" not in (config.get("agent") or {}):
        raise SystemExit(f"writable OpenCode config is missing profile-pdf: {seeded_config}")
    print(f"Persona bundle OK (OpenCode {version})")


APP = AppConfig(
    app_id=_APP_ID,
    app_title=_APP_TITLE,
    app_root=Path(__file__).resolve().parent,
    ui_dir="ui",                      # this app ships its own front-end
    workspace_dirname="workspace",
    workspace_folders=(
        WorkspaceFolder("documents", "file-text", "documents"),
        WorkspaceFolder("profile",   "user",      "profile"),
    ),
    default_capture_folder="documents",
    default_agent="profile",
    bridge_cls=PersonaBridge,         # adds Scanner methods; see app_bridge.py
)


if __name__ == "__main__":
    if "--check-bundle" in sys.argv:
        _verify_bundle()
    elif "--check-updates" in sys.argv:
        print(json.dumps(check_for_updates(), sort_keys=True))
    else:
        if is_bundled():
            try:
                _sync_bundled_agent_config()
            except (OSError, ValueError, json.JSONDecodeError) as exc:
                raise SystemExit(f"could not prepare writable OpenCode config: {exc}") from exc
        run(APP)
