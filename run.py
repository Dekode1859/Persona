"""
Bootstrap script: installs dependencies, the OpenCode engine, and Playwright
Chromium if any are missing, then launches the app. Run with:
    uv run python run.py
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent


def run(*args, check=True, **kwargs):
    return subprocess.run(args, check=check, **kwargs)


def ensure_engine() -> None:
    """Make sure an OpenCode engine exists before the app needs it.

    Spiritus never downloads implicitly — that is the app's call to make, in a
    bootstrap where a one-time ~60 MB fetch is expected and visible. Without
    this the app still starts, but chat and every agent are dead.
    """
    from spiritus import engine

    found = engine.resolve()
    if found is not None:
        version = engine.binary_version(found)
        print(f"==> OpenCode engine present: {found} ({version or 'unknown version'})")
        warning = engine.version_warning(version)
        if warning:
            print(f"    warning: {warning}")
        return

    print(f"==> installing OpenCode {engine.PINNED_VERSION} ({engine.asset_name()})")

    def progress(done, total):
        if total:
            sys.stderr.write(f"\r    {done * 100 // total:3d}%  "
                             f"({done / 1e6:.1f} / {total / 1e6:.1f} MB)")
            sys.stderr.flush()

    path = engine.install(on_progress=progress)
    sys.stderr.write("\n")
    print(f"==> engine installed: {path}")


def chromium_installed() -> bool:
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch()
            browser.close()
        return True
    except Exception:
        return False


def main():
    print("==> uv sync")
    run("uv", "sync", cwd=ROOT)

    ensure_engine()

    print("==> checking Playwright Chromium...")
    if not chromium_installed():
        print("==> installing Playwright Chromium")
        run("uv", "run", "playwright", "install", "chromium", cwd=ROOT)
    else:
        print("==> Playwright Chromium already installed")

    print("==> launching app")
    run("uv", "run", "python", str(ROOT / "main.py"), cwd=ROOT)


if __name__ == "__main__":
    main()
