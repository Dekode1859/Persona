#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
uv run spiritus bundle --project-root "$ROOT" --config spiritus.bundle.toml
uv run spiritus bundle-check --project-root "$ROOT" --config spiritus.bundle.toml --run-verify
