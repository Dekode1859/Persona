$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\")).Path
$Version = if ($env:PERSONA_VERSION) { $env:PERSONA_VERSION } else {
    (Get-Content (Join-Path $Root "pyproject.toml") | Select-String '^version\s*=\s*"([^"]+)"$').Matches.Groups[1].Value
}

& (Join-Path $Root "packaging\spiritus-bundle-windows.ps1")
if ($LASTEXITCODE -ne 0) {
    throw "Spiritus Persona bundle workflow failed"
}

$Iscc = Get-Command iscc -ErrorAction SilentlyContinue
if (-not $Iscc) {
    $KnownIscc = @(
        "${env:LOCALAPPDATA}\Programs\Inno Setup 6\ISCC.exe",
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "${env:ProgramFiles}\Inno Setup 6\ISCC.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($KnownIscc) {
        $Iscc = @{ Source = $KnownIscc }
    } else {
        throw "Inno Setup compiler (iscc) is required. Install Inno Setup before running this script."
    }
}

New-Item -ItemType Directory -Force -Path (Join-Path $Root "release") | Out-Null
& $Iscc.Source "/DAppVersion=$Version" (Join-Path $Root "packaging\Persona.iss")
