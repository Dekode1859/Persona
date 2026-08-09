"""Prepare Persona-owned native assets before Spiritus builds the bundle."""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

from spiritus import engine


ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "packaging" / "build-assets"


def prepare_engine() -> None:
    destination = ASSETS / "engine"
    destination.mkdir(parents=True, exist_ok=True)
    binary = engine.install(force=False)
    target = destination / ("opencode.exe" if sys.platform == "win32" else "opencode")
    shutil.copy2(binary, target)
    if sys.platform != "win32":
        target.chmod(target.stat().st_mode | 0o111)
    print(f"Prepared OpenCode {engine.binary_version(target) or 'unknown'}: {target}")


def prepare_playwright() -> None:
    browser_dir = ASSETS / "ms-playwright"
    browser_dir.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "PLAYWRIGHT_BROWSERS_PATH": str(browser_dir)}
    subprocess.run(
        [sys.executable, "-m", "playwright", "install", "chromium"],
        cwd=ROOT,
        env=env,
        check=True,
    )


def main() -> None:
    if ASSETS.exists():
        shutil.rmtree(ASSETS)
    prepare_engine()
    prepare_playwright()


if __name__ == "__main__":
    main()
