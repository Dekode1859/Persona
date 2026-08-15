"""Persona's schema-bound bridge integration with Spiritus run diagnostics."""
from __future__ import annotations

import json
import os
import tempfile
import tomllib
import unittest
from pathlib import Path
from unittest.mock import patch

from app_bridge import PersonaBridge
from main import _sync_bundled_agent_config
from spiritus.config import AppConfig, WorkspaceFolder


class _Server:
    port = 4096


class _Client:
    def __init__(self, structured: object):
        self.structured = structured
        self.body = None

    def prompt_async(self, session_id: str, body: dict) -> None:
        self.body = body

    def events(self):
        yield {"payload": {"type": "session.status", "properties": {
            "sessionID": "ses_profile", "status": {"type": "busy"},
        }}}
        yield {"payload": {"type": "message.updated", "properties": {
            "info": {
                "id": "msg_profile",
                "sessionID": "ses_profile",
                "role": "assistant",
                "time": {"completed": 1},
                "structured": self.structured,
            },
        }}}
        yield {"payload": {"type": "session.idle", "properties": {"sessionID": "ses_profile"}}}

    def messages(self, session_id: str) -> list[dict]:
        return [{
            "info": {"id": "msg_profile", "sessionID": session_id, "role": "assistant",
                     "structured": self.structured},
            "parts": [{"type": "text", "text": json.dumps(self.structured)}],
        }]


def _empty_profile() -> dict:
    return {
        "identity": {}, "contact": {}, "skill_buckets": [], "experience": [],
        "projects": [], "education": [], "certifications": [], "publications": [],
    }


class ProfileImportRunTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.previous_workspace = os.environ.get("WORKSPACE_PATH")
        os.environ["WORKSPACE_PATH"] = str(self.root / "workspace")
        self.config = AppConfig(
            app_id="persona-test",
            app_title="Persona",
            app_root=self.root,
            workspace_folders=(WorkspaceFolder("documents"),),
        )

    def tearDown(self) -> None:
        if self.previous_workspace is None:
            os.environ.pop("WORKSPACE_PATH", None)
        else:
            os.environ["WORKSPACE_PATH"] = self.previous_workspace
        self.temporary.cleanup()

    def _bridge(self, structured: object) -> tuple[PersonaBridge, _Client]:
        client = _Client(structured)
        with patch("spiritus.bridge.OpenCodeClient", return_value=client):
            bridge = PersonaBridge(self.config, _Server())
        bridge._opencode = lambda: client
        return bridge, client

    def test_pdf_import_uses_profile_operation_and_schema(self) -> None:
        bridge, client = self._bridge(_empty_profile())

        started = bridge.profile_import_run("ses_profile", "Extract this PDF")

        self.assertEqual(started["session_id"], "ses_profile")
        self.assertTrue(started["run_id"].startswith("run_"))
        self.assertEqual(client.body["agent"], "profile-pdf")
        self.assertEqual(client.body["format"]["type"], "json_schema")
        self.assertEqual(client.body["format"]["schema"]["title"], "Candidate Profile (v2)")

    def test_pdf_link_sidecar_is_private_from_document_listing(self) -> None:
        bridge, _ = self._bridge(_empty_profile())
        documents = self.root / "workspace" / "documents"
        documents.mkdir(parents=True, exist_ok=True)
        (documents / "resume.pdf").write_bytes(b"%PDF-test")
        (documents / "resume.pdf.txt").write_text("Resume text", encoding="utf-8")
        (documents / "resume.pdf.links.json").write_text("[]", encoding="utf-8")
        (documents / "notes.json").write_text("{}", encoding="utf-8")

        names = [item["name"] for item in bridge.profile_list_documents()]

        self.assertEqual(names, ["notes.json", "resume.pdf"])

    def test_profile_schema_is_declared_as_a_bundle_resource(self) -> None:
        spec = tomllib.loads(Path("spiritus.bundle.toml").read_text(encoding="utf-8"))
        self.assertIn("schemas=schemas", spec["datas"])

    def test_profile_pdf_agent_is_declared_in_the_packaged_config(self) -> None:
        config = json.loads(Path("opencode.json").read_text(encoding="utf-8"))
        self.assertIn("profile-pdf", config["agent"])
        spec = tomllib.loads(Path("spiritus.bundle.toml").read_text(encoding="utf-8"))
        self.assertIn("opencode.json=.", spec["datas"])
        self.assertEqual(spec["seed_files"]["opencode.json"], "opencode.json")

    def test_bundled_agents_migrate_into_existing_app_data(self) -> None:
        bundle = self.root / "bundle"
        app_data = self.root / "app-data"
        bundle.mkdir()
        app_data.mkdir()
        (bundle / "opencode.json").write_text(json.dumps({
            "agent": {
                "profile": {"prompt": "new prompt"},
                "profile-pdf": {"mode": "primary", "prompt": "verbatim"},
            },
            "model": "keep-the-user-setting",
        }), encoding="utf-8")
        (app_data / "opencode.json").write_text(json.dumps({
            "agent": {
                "profile": {"prompt": "old prompt"},
                "custom": {"prompt": "user agent"},
            },
            "model": "user-selected-model",
        }), encoding="utf-8")

        self.assertTrue(_sync_bundled_agent_config(bundle, app_data))
        migrated = json.loads((app_data / "opencode.json").read_text(encoding="utf-8"))
        self.assertEqual(migrated["agent"]["profile"], {"prompt": "new prompt"})
        self.assertEqual(migrated["agent"]["profile-pdf"]["mode"], "primary")
        self.assertEqual(migrated["agent"]["custom"], {"prompt": "user agent"})
        self.assertEqual(migrated["model"], "user-selected-model")
        self.assertFalse(_sync_bundled_agent_config(bundle, app_data))

    def test_bundled_agents_are_seeded_when_app_data_is_new(self) -> None:
        bundle = self.root / "bundle"
        app_data = self.root / "new-app-data"
        bundle.mkdir()
        (bundle / "opencode.json").write_text(json.dumps({
            "agent": {"profile-pdf": {"mode": "primary"}},
        }), encoding="utf-8")

        self.assertTrue(_sync_bundled_agent_config(bundle, app_data))
        migrated = json.loads((app_data / "opencode.json").read_text(encoding="utf-8"))
        self.assertIn("profile-pdf", migrated["agent"])

    def test_schema_failure_is_a_durable_profile_diagnostic(self) -> None:
        near_miss = _empty_profile()
        near_miss["skill_buckets"] = [{"name": "Tools", "skills": ["Python"]}]
        bridge, _ = self._bridge(near_miss)
        started = bridge.profile_import_run("ses_profile", "Extract this PDF")

        list(bridge.session_events("ses_profile"))
        diagnostics = bridge.profile_import_diagnostics(started["run_id"])

        self.assertTrue(diagnostics["ok"])
        self.assertEqual(diagnostics["status"], "failed")
        self.assertEqual(diagnostics["failure"]["kind"], "output_schema_invalid")
        self.assertEqual(diagnostics["failure"]["owner"], "application_contract")
        self.assertEqual(diagnostics["failure"]["field_paths"], ["skill_buckets[0]"])

    def test_completed_import_exposes_artifact_and_application_checkpoints(self) -> None:
        bridge, _ = self._bridge(_empty_profile())
        started = bridge.profile_import_run("ses_profile", "Extract this PDF")

        list(bridge.session_events("ses_profile"))
        artifact = bridge.run_artifact(started["run_id"], "agent.structured")
        bridge.run_checkpoint(started["run_id"], "profile.output_retrieved")
        diagnostics = bridge.profile_import_diagnostics(started["run_id"])

        self.assertEqual(diagnostics["status"], "completed")
        self.assertIsNone(diagnostics["failure"])
        self.assertEqual(artifact["identity"], {})
        self.assertEqual([stage["name"] for stage in diagnostics["stages"]], [
            "agent.started", "agent.completed", "output.parsed", "output.validated",
            "profile.output_retrieved",
        ])

    def test_application_failure_is_persisted_after_agent_completion(self) -> None:
        bridge, _ = self._bridge(_empty_profile())
        started = bridge.profile_import_run("ses_profile", "Extract this PDF")
        list(bridge.session_events("ses_profile"))

        bridge.run_failure(
            started["run_id"], "runtime_failed", "persona",
            "profile write failed", "profile.postprocess",
        )
        diagnostics = bridge.profile_import_diagnostics(started["run_id"])

        self.assertEqual(diagnostics["status"], "failed")
        self.assertEqual(diagnostics["failure"]["owner"], "persona")
        self.assertEqual(diagnostics["failure"]["message"], "profile write failed")

    def test_application_failure_does_not_replace_agent_failure(self) -> None:
        near_miss = _empty_profile()
        near_miss["skill_buckets"] = [{"name": "Tools", "skills": ["Python"]}]
        bridge, _ = self._bridge(near_miss)
        started = bridge.profile_import_run("ses_profile", "Extract this PDF")
        list(bridge.session_events("ses_profile"))

        result = bridge.run_failure(
            started["run_id"], "runtime_failed", "persona",
            "post-processing failed", "profile.postprocess",
        )

        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], "failed")
        diagnostics = bridge.profile_import_diagnostics(started["run_id"])
        self.assertEqual(diagnostics["failure"]["kind"], "output_schema_invalid")


if __name__ == "__main__":
    unittest.main(verbosity=2)
