$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $Root
try {
    uv run spiritus bundle --project-root $Root --config 'spiritus.bundle.toml'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    uv run spiritus bundle-check --project-root $Root --config 'spiritus.bundle.toml' --run-verify
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}
