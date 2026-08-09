#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${PERSONA_VERSION:-$(sed -n 's/^version = "\([^"]*\)"$/\1/p' "$ROOT/pyproject.toml" | head -n 1)}"

uv run python "$ROOT/packaging/build.py" --platform macos

"$ROOT/dist/Persona.app/Contents/MacOS/Persona" --check-bundle

mkdir -p "$ROOT/release"
rm -f "$ROOT/release/Persona-${VERSION}-macos.dmg"
hdiutil create \
  -volname "Persona" \
  -srcfolder "$ROOT/dist/Persona.app" \
  -ov \
  -format UDZO \
  "$ROOT/release/Persona-${VERSION}-macos.dmg"
