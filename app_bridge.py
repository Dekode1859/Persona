"""Persona's Bridge extension — Scanner methods only.

Uses AppConfig.bridge_cls so Scanner's LinkedIn specifics never have to live in
Spiritus remains domain-agnostic while this app owns its scanner methods and
extends the JS↔Python surface without forking the runtime.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from spiritus.bridge import Bridge
from spiritus.runtime.windows import hidden_console_kwargs

from scanner import store

_SCAN_SCRIPT = Path(__file__).resolve().parent / "scanner" / "linkedin_scan.py"


class PersonaBridge(Bridge):
    def scanner_get_settings(self) -> dict:
        return store.get_settings(self._workspace)

    def scanner_save_settings(self, settings: dict) -> dict:
        return store.save_settings(self._workspace, settings)

    def scanner_get_feed(self) -> list:
        return store.get_feed(self._workspace)

    def scanner_promote(self, job_id: str) -> list:
        return store.mark_promoted(self._workspace, job_id)

    def scanner_dismiss(self, job_id: str) -> list:
        return store.dismiss(self._workspace, job_id)

    def scanner_run(self) -> dict:
        """Run one scan pass (recommended feed + configured searches) and
        merge results into the scanner feed. Reuses the same persistent
        Chromium profile dir as browser_open/browser_scrape, so an existing
        LinkedIn login carries over with no separate auth flow."""
        settings = store.get_settings(self._workspace)
        profile_dir = str(self._workspace / "browser-profile")

        try:
            result = subprocess.run(
                [sys.executable, str(_SCAN_SCRIPT), profile_dir, json.dumps(settings)],
                capture_output=True, text=True, timeout=240,
                **hidden_console_kwargs(),
            )
        except subprocess.TimeoutExpired:
            return {"ok": False, "error": "Scan timed out (>240s)"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

        lines = [ln for ln in (result.stdout or "").splitlines() if ln.strip()]
        if not lines:
            err = (result.stderr or "scan produced no output").strip()
            return {"ok": False, "error": err[-400:]}

        try:
            payload = json.loads(lines[-1])
        except Exception as e:
            return {"ok": False, "error": f"Could not parse scan output: {e}"}

        if not payload.get("ok"):
            return payload

        feed = store.merge_feed(self._workspace, payload.get("jobs") or [])
        return {"ok": True, "feed": feed, "found": len(payload.get("jobs") or [])}
