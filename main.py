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
import shutil
import sys
from pathlib import Path

from spiritus import run, AppConfig, WorkspaceFolder
from spiritus import engine
from spiritus.runtime.paths import app_data_dir, is_bundled

from app_bridge import PersonaBridge


def _bundle_root() -> Path:
    """Return the read-only resource directory used by PyInstaller."""
    if is_bundled():
        return Path(getattr(sys, "_MEIPASS"))
    return Path(__file__).resolve().parent


def _prepare_bundled_runtime() -> None:
    """Point Spiritus at resources shipped inside an installed app.

    Spiritus intentionally does not assume that every application bundles an
    OpenCode engine. Persona does, so the frozen entry point supplies the
    explicit binary path and keeps Playwright pointed at its bundled browser.
    The app config is copied once to writable app data because Spiritus treats
    installed resources as read-only and provider/model settings are mutable.
    """
    if not is_bundled():
        return

    root = _bundle_root()
    binary_name = "opencode.exe" if sys.platform == "win32" else "opencode"
    bundled_engine = root / "engine" / binary_name
    if bundled_engine.is_file():
        os.environ.setdefault(engine.ENV_BIN, str(bundled_engine))

    bundled_browsers = root / "ms-playwright"
    if bundled_browsers.is_dir():
        os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", str(bundled_browsers))

    data_root = app_data_dir("persona")
    shipped_config = root / "opencode.json"
    installed_config = data_root / "opencode.json"
    if shipped_config.is_file() and not installed_config.exists():
        shutil.copy2(shipped_config, installed_config)


def _verify_bundle() -> None:
    """Smoke-test resources used by CI without opening a native window."""
    if not is_bundled():
        raise SystemExit("bundle verification must run from a frozen build")

    root = _bundle_root()
    binary_name = "opencode.exe" if sys.platform == "win32" else "opencode"
    bundled_engine = root / "engine" / binary_name
    if not bundled_engine.is_file():
        raise SystemExit(f"missing bundled OpenCode engine: {bundled_engine}")
    version = engine.binary_version(bundled_engine)
    if not version:
        raise SystemExit(f"bundled OpenCode engine did not report a version: {bundled_engine}")
    if not (root / "ui" / "index.html").is_file():
        raise SystemExit("missing bundled Persona UI")
    if not (root / "scanner" / "linkedin_scan.py").is_file():
        raise SystemExit("missing bundled scanner script")
    if not (root / "ms-playwright").is_dir():
        raise SystemExit("missing bundled Playwright browsers")
    print(f"Persona bundle OK (OpenCode {version})")


_prepare_bundled_runtime()


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
