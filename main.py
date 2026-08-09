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

import os
import sys
from pathlib import Path

from spiritus import run, AppConfig, WorkspaceFolder
from spiritus import engine
from spiritus.runtime.paths import is_bundled, project_root

from app_bridge import PersonaBridge


def _bundle_root() -> Path:
    """Return the read-only resource directory used by PyInstaller."""
    if is_bundled():
        return Path(getattr(sys, "_MEIPASS"))
    return Path(__file__).resolve().parent


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
    if not (root / "ms-playwright").is_dir():
        raise SystemExit("missing bundled Playwright browsers")
    browser_path = os.environ.get("PLAYWRIGHT_BROWSERS_PATH")
    if not browser_path or Path(browser_path).resolve() != (root / "ms-playwright").resolve():
        raise SystemExit(
            "Spiritus did not configure the bundled Playwright browser path"
        )
    seeded_config = project_root(Path(__file__).resolve().parent, "persona") / "opencode.json"
    if not seeded_config.is_file():
        raise SystemExit(f"missing seeded writable OpenCode config: {seeded_config}")
    print(f"Persona bundle OK (OpenCode {version})")


APP = AppConfig(
    app_id="persona",
    app_title="Persona",
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
    else:
        run(APP)
