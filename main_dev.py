"""Development Persona entrypoint with isolated application identity."""
from __future__ import annotations

import os
import sys

os.environ.setdefault("PERSONA_APP_ID", "persona-dev")
os.environ.setdefault("PERSONA_APP_TITLE", "Persona Dev")

from spiritus import run  # noqa: E402
from main import APP, _verify_bundle  # noqa: E402


if __name__ == "__main__":
    if "--check-bundle" in sys.argv:
        _verify_bundle()
    else:
        run(APP)
