"""Build the platform-native Persona bundle.

The build intentionally obtains both runtime payloads from the installed
dependencies: Spiritus supplies the pinned OpenCode release URL, and
Playwright installs Chromium into a build-local directory. Nothing is fetched
at application startup after this script has completed.
"""
from __future__ import annotations

import argparse
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "packaging" / "build-assets"


def run(*args: str, env: dict[str, str] | None = None) -> None:
    subprocess.run(args, cwd=ROOT, env=env, check=True)


def platform_name() -> str:
    if sys.platform == "win32":
        return "windows"
    if sys.platform == "darwin":
        return "macos"
    raise RuntimeError("Persona desktop packaging supports Windows and macOS only")


def prepare_engine() -> None:
    from spiritus import engine

    destination = ASSETS / "engine"
    destination.mkdir(parents=True, exist_ok=True)
    binary = engine.install(force=False)
    target = destination / ("opencode.exe" if sys.platform == "win32" else "opencode")
    shutil.copy2(binary, target)
    if sys.platform != "win32":
        target.chmod(target.stat().st_mode | 0o111)
    print(f"Prepared OpenCode {engine.binary_version(target) or 'unknown'}: {target}")


def prepare_playwright() -> dict[str, str]:
    browser_dir = ASSETS / "ms-playwright"
    browser_dir.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["PLAYWRIGHT_BROWSERS_PATH"] = str(browser_dir)
    run(sys.executable, "-m", "playwright", "install", "chromium", env=env)
    return env


def build(target: str) -> None:
    actual = platform_name()
    if target != actual:
        raise RuntimeError(f"requested {target}, but this runner is {actual}")

    if ASSETS.exists():
        shutil.rmtree(ASSETS)
    windows_output = ROOT / "dist" / "Persona"
    macos_output = ROOT / "dist" / "Persona.app"
    if windows_output.exists():
        shutil.rmtree(windows_output)
    if macos_output.exists():
        shutil.rmtree(macos_output)

    prepare_engine()
    env = prepare_playwright()
    run(
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--distpath",
        str(ROOT / "dist"),
        "--workpath",
        str(ROOT / "build" / "pyinstaller"),
        str(ROOT / "packaging" / "persona.spec"),
        env=env,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--platform", choices=("windows", "macos"), default=platform_name())
    args = parser.parse_args()
    build(args.platform)


if __name__ == "__main__":
    main()
