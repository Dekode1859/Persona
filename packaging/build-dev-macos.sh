#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
VERSION="$(sed -n 's/^version = "\([^"]*\)"$/\1/p' pyproject.toml | head -n 1)"
if [[ -z "$VERSION" ]]; then
  echo "Could not read the Persona version from pyproject.toml" >&2
  exit 1
fi
DEV_VERSION="${VERSION}-dev"
ENGINE="packaging/build-assets/engine/opencode=engine"
uv run python packaging/prepare-assets.py
uv run spiritus bundle --project-root "$ROOT" \
  --entrypoint main_dev.py --name PersonaDev --app-id persona-dev --app-version "$DEV_VERSION" \
  --data "ui=ui" --data "schemas=schemas" --data "opencode.json=." \
  --data "spiritus.bundle.dev.toml=spiritus.bundle.toml" \
  --data "scanner/linkedin_scan.py=scanner" \
  --data "packaging/build-assets/ms-playwright=ms-playwright" \
  --binary "$ENGINE" \
  --collect-package playwright --collect-package pypdf --collect-package webview \
  --runtime-env-path "PLAYWRIGHT_BROWSERS_PATH=ms-playwright" \
  --seed-file "opencode.json=opencode.json" \
  --output-dir dist-dev --work-dir build/spiritus-dev
uv run spiritus bundle-check "$ROOT/dist-dev/PersonaDev.app" --app-id persona-dev
"$ROOT/dist-dev/PersonaDev.app/Contents/MacOS/PersonaDev" --check-bundle

mkdir -p "$ROOT/release-dev"
rm -f "$ROOT/release-dev/Persona-Dev-${DEV_VERSION}-macos.dmg"
hdiutil create \
  -volname "Persona Dev" \
  -srcfolder "$ROOT/dist-dev/PersonaDev.app" \
  -ov \
  -format UDZO \
  "$ROOT/release-dev/Persona-Dev-${DEV_VERSION}-macos.dmg"
