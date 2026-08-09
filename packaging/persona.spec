from pathlib import Path
import sys

from PyInstaller.utils.hooks import collect_all, collect_submodules


ROOT = Path(SPEC).resolve().parent.parent
ASSETS = ROOT / "packaging" / "build-assets"
ENGINE_NAME = "opencode.exe" if sys.platform == "win32" else "opencode"

spiritus_datas, spiritus_binaries, spiritus_hidden = collect_all("spiritus")
playwright_datas, playwright_binaries, playwright_hidden = collect_all("playwright")
webview_datas, webview_binaries, webview_hidden = collect_all("webview")

datas = [
    (str(ROOT / "ui"), "ui"),
    (str(ROOT / "opencode.json"), "."),
    (str(ROOT / "scanner" / "linkedin_scan.py"), "scanner"),
    (str(ASSETS / "ms-playwright"), "ms-playwright"),
    *spiritus_datas,
    *playwright_datas,
    *webview_datas,
]
binaries = [
    (str(ASSETS / "engine" / ENGINE_NAME), "engine"),
    *spiritus_binaries,
    *playwright_binaries,
    *webview_binaries,
]
hiddenimports = [
    *spiritus_hidden,
    *playwright_hidden,
    *webview_hidden,
    *collect_submodules("webview.platforms"),
]

a = Analysis(
    [str(ROOT / "main.py")],
    pathex=[str(ROOT)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Persona",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
)

if sys.platform == "darwin":
    BUNDLE(
        exe,
        a.binaries,
        a.zipfiles,
        a.datas,
        name="Persona.app",
        icon=None,
        bundle_identifier="com.dekode.persona",
    )
else:
    COLLECT(
        exe,
        a.binaries,
        a.zipfiles,
        a.datas,
        strip=False,
        upx=False,
        name="Persona",
    )
