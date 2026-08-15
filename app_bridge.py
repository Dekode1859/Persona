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

from jsonschema import ValidationError, validate
from spiritus.bridge import Bridge
from spiritus.runtime.windows import hidden_console_kwargs

from profile_documents import (
    PdfImportError,
    extract_pdf_links,
    import_pdf,
    normalize_profile_import,
)
from scanner import store
from persona_updates import check_for_updates, launch_staged_update, stage_update

_SCAN_SCRIPT = Path(__file__).resolve().parent / "scanner" / "linkedin_scan.py"
_PROFILE_SCHEMA = Path(__file__).resolve().parent / "schemas" / "profile.schema.json"


class PersonaBridge(Bridge):
    @staticmethod
    def _profile_schema() -> dict:
        """Load the single profile contract used by the agent and persistence."""
        try:
            return json.loads(_PROFILE_SCHEMA.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise RuntimeError(f"Profile schema could not be loaded: {error}") from error

    def profile_import_run(self, session_id: str, text: str) -> dict:
        """Start a schema-bound PDF profile import with durable diagnostics."""
        return self.agent_run(
            session_id,
            "profile-pdf",
            None,
            text,
            operation="profile.import",
            output_schema=self._profile_schema(),
        )

    def profile_import_diagnostics(self, run_id: str) -> dict:
        """Return safe terminal diagnostics for one Persona profile import."""
        try:
            record = self._runs.get(run_id)
        except (KeyError, ValueError):
            return {"ok": False, "error": "Profile import run was not found"}
        if record.operation != "profile.import":
            return {"ok": False, "error": "Run is not a profile import"}

        failure = record.failure
        failed_stage = next(
            (stage.name for stage in reversed(record.stages)
             if stage.status.value == "failed"),
            None,
        )
        return {
            "ok": True,
            "run_id": record.run_id,
            "status": record.status.value,
            "stages": [
                {"name": stage.name, "status": stage.status.value}
                for stage in record.stages
            ],
            "failure": None if failure is None else {
                "kind": failure.kind.value,
                "owner": failure.owner,
                "message": failure.message,
                "field_paths": list(failure.field_paths),
                "stage": failed_stage,
            },
        }

    def _profile_document_path(self, path: str) -> Path:
        """Resolve a direct child of the profile documents folder only."""
        documents = (self._workspace / "documents").resolve()
        target = (self._workspace / path).resolve()
        if target.parent != documents:
            raise ValueError("Invalid document path")
        return target

    def profile_import_pdf(self, name: str, data_url: str) -> dict:
        """Import a PDF source and retain extracted text for the profile agent."""
        try:
            return {"ok": True, "document": import_pdf(self._workspace, name, data_url)}
        except PdfImportError as error:
            return {"ok": False, "error": str(error)}

    def profile_list_documents(self) -> list[dict]:
        """List ordinary text sources plus retained PDF sources, not PDF sidecars."""
        documents = self._workspace / "documents"
        text_documents = []
        if documents.is_dir():
            for path in sorted(documents.iterdir(), key=lambda item: item.name.lower()):
                if path.is_file() and path.suffix.lower() in {".txt", ".md", ".markdown", ".json"} \
                        and not path.name.lower().endswith((".pdf.txt", ".pdf.links.json")):
                    text_documents.append({
                        "name": path.name,
                        "path": f"documents/{path.name}",
                        "source": "text",
                        "size": path.stat().st_size,
                        "modified": int(path.stat().st_mtime * 1000),
                    })
        pdf_documents = []
        if documents.is_dir():
            for path in sorted(documents.glob("*.pdf"), key=lambda item: item.name.lower()):
                if path.with_suffix(".pdf.txt").is_file():
                    pdf_documents.append({
                        "name": path.name,
                        "path": f"documents/{path.name}",
                        "source": "pdf",
                        "size": path.stat().st_size,
                        "modified": int(path.stat().st_mtime * 1000),
                    })
        return [*text_documents, *pdf_documents]

    def profile_read_document_text(self, path: str) -> dict:
        """Read source text, selecting a PDF's extraction sidecar when needed."""
        try:
            candidate = self._profile_document_path(path)
        except ValueError:
            return {"error": "Invalid document path"}
        links = []
        if candidate.suffix.lower() == ".pdf":
            links_path = candidate.with_suffix(".pdf.links.json")
            if links_path.is_file():
                try:
                    loaded = json.loads(links_path.read_text(encoding="utf-8"))
                    links = loaded if isinstance(loaded, list) else []
                except (OSError, json.JSONDecodeError):
                    links = []
            if not links:
                try:
                    links = extract_pdf_links(candidate.read_bytes())
                except OSError:
                    links = []
            candidate = candidate.with_suffix(".pdf.txt")
        result = self.workspace_read(candidate.relative_to(self._workspace).as_posix())
        if links and result.get("content") is not None:
            result["links"] = links
        return result

    def profile_delete_document(self, path: str) -> dict:
        """Delete one user-selected source and its PDF extraction sidecar."""
        try:
            target = self._profile_document_path(path)
        except ValueError:
            return {"error": "Invalid document path"}
        if not target.exists():
            return {"error": f"File not found: {path}"}
        target.unlink()
        if target.suffix.lower() == ".pdf":
            sidecar = target.with_suffix(".pdf.txt")
            if sidecar.exists():
                sidecar.unlink()
            links_sidecar = target.with_suffix(".pdf.links.json")
            if links_sidecar.exists():
                links_sidecar.unlink()
        return {"ok": True, "path": path}

    def profile_validate(self, profile: dict) -> dict:
        """Validate agent output before it can become the stored candidate profile."""
        try:
            validate(instance=profile, schema=self._profile_schema())
            return {"ok": True}
        except RuntimeError as error:
            return {"ok": False, "error": str(error)}
        except ValidationError as error:
            location = ".".join(str(part) for part in error.absolute_path) or "profile"
            return {"ok": False, "error": f"Invalid {location}: {error.message}"}

    def profile_normalize(self, profile: dict) -> dict:
        """Normalize documented agent aliases before schema validation."""
        return normalize_profile_import(profile)

    def updates_check(self) -> dict:
        return check_for_updates()

    def updates_stage(self) -> dict:
        return stage_update()

    def updates_launch(self, path: str) -> dict:
        return launch_staged_update(path)

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
