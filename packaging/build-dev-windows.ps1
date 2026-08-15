$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\")).Path
Push-Location $Root
try {
    $Version = (Get-Content (Join-Path $Root "pyproject.toml") |
        Select-String '^version\s*=\s*"([^"]+)"$').Matches.Groups[1].Value
    if (-not $Version) { throw "Could not read the Persona version from pyproject.toml" }
    $DevVersion = "$Version-dev"
    $Engine = "packaging/build-assets/engine/opencode.exe=engine"
    uv run python packaging/prepare-assets.py
    uv run spiritus bundle --project-root $Root `
        --entrypoint main_dev.py --name PersonaDev --app-id persona-dev --app-version $DevVersion `
        --data "ui=ui" --data "schemas=schemas" --data "opencode.json=." `
        --data "spiritus.bundle.dev.toml=spiritus.bundle.toml" `
        --data "scanner/linkedin_scan.py=scanner" `
        --data "packaging/build-assets/ms-playwright=ms-playwright" `
        --binary $Engine `
        --collect-package playwright --collect-package pypdf --collect-package webview `
        --runtime-env-path "PLAYWRIGHT_BROWSERS_PATH=ms-playwright" `
        --seed-file "opencode.json=opencode.json" `
        --output-dir dist-dev --work-dir build/spiritus-dev
    if ($LASTEXITCODE -ne 0) { throw "Spiritus Persona Dev bundle workflow failed" }
    uv run spiritus bundle-check (Join-Path $Root "dist-dev\PersonaDev") --app-id persona-dev
    if ($LASTEXITCODE -ne 0) { throw "Persona Dev bundle verification failed" }
    & (Join-Path $Root "dist-dev\PersonaDev\PersonaDev.exe") --check-bundle
    if ($LASTEXITCODE -ne 0) { throw "Persona Dev application verification failed" }

    $Iscc = Get-Command iscc -ErrorAction SilentlyContinue
    if (-not $Iscc) {
        $KnownIscc = @(
            "${env:LOCALAPPDATA}\Programs\Inno Setup 6\ISCC.exe",
            "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
            "${env:ProgramFiles}\Inno Setup 6\ISCC.exe"
        ) | Where-Object { Test-Path $_ } | Select-Object -First 1
        if ($KnownIscc) { $Iscc = @{ Source = $KnownIscc } }
        else { throw "Inno Setup compiler (iscc) is required for the dev installer." }
    }
    New-Item -ItemType Directory -Force -Path (Join-Path $Root "release-dev") | Out-Null
    & $Iscc.Source "/DAppVersion=$DevVersion" (Join-Path $Root "packaging\Persona-dev.iss")
} finally {
    Pop-Location
}
