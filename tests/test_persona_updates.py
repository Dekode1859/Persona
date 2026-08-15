"""Persona-owned update lifecycle and restart-persistence tests."""
from __future__ import annotations

import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import persona_updates
from spiritus import (
    ReleaseCandidate,
    StagedUpdate,
    UpdateArtifact,
    UpdateCheck,
    UpdateStatus,
)


class _FakeClient:
    def __init__(self, staged: StagedUpdate):
        self.staged = staged
        self.artifact = staged.artifact

    def check(self) -> UpdateCheck:
        return UpdateCheck(
            UpdateStatus.AVAILABLE,
            "0.1.6",
            candidate=ReleaseCandidate(version="0.2.0", artifacts=(self.artifact,)),
            artifact=self.artifact,
        )

    def stage_update(self, result: UpdateCheck, destination: Path) -> StagedUpdate:
        destination.mkdir(parents=True, exist_ok=True)
        target = destination / self.staged.path.name
        target.write_bytes(self.staged.path.read_bytes())
        return StagedUpdate(
            artifact=self.staged.artifact,
            path=target,
            bytes=self.staged.bytes,
            sha256=self.staged.sha256,
        )


class PersonaUpdateTests(unittest.TestCase):
    def setUp(self) -> None:
        persona_updates._STAGED_UPDATE = None
        persona_updates._STAGED_VERSION = None

    def tearDown(self) -> None:
        persona_updates._STAGED_UPDATE = None
        persona_updates._STAGED_VERSION = None
        os.environ.pop("PERSONA_UPDATE_TEST_MODE", None)
        os.environ.pop("PERSONA_UPDATE_TEST_VERSION", None)

    def test_staged_update_is_restored_after_startup(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "pyproject.toml").write_text('[project]\nversion = "0.1.6"\n', encoding="utf-8")
            payload = b"fake verified installer"
            source = root / "source.exe"
            source.write_bytes(payload)
            digest = hashlib.sha256(payload).hexdigest()
            artifact = UpdateArtifact(
                filename="Persona-Setup-0.2.0.exe",
                url="https://example.test/Persona-Setup-0.2.0.exe",
                sha256=digest,
                size=len(payload),
            )
            staged = StagedUpdate(artifact, source, len(payload), digest)
            client = _FakeClient(staged)

            with patch.object(persona_updates, "_client", return_value=client):
                result = persona_updates.stage_update(root=root)
            self.assertEqual(result["status"], "available")
            self.assertEqual(result["version"], "0.2.0")
            self.assertTrue((root / ".spiritus-update-staging" / "staged.json").is_file())

            persona_updates._STAGED_UPDATE = None
            persona_updates._STAGED_VERSION = None
            with patch.object(persona_updates, "_client", side_effect=AssertionError("network called")):
                restored = persona_updates.check_for_updates(root=root)
            self.assertEqual(restored["status"], "ready")
            self.assertEqual(restored["version"], "0.2.0")
            self.assertTrue(Path(restored["staged_path"]).is_file())

    def test_invalid_staged_manifest_is_discarded(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "pyproject.toml").write_text('[project]\nversion = "0.1.6"\n', encoding="utf-8")
            staging = root / ".spiritus-update-staging"
            staging.mkdir()
            (staging / "staged.json").write_text(json.dumps({"path": "missing.exe"}), encoding="utf-8")

            with patch.object(persona_updates, "_client") as client:
                client.return_value.check.return_value = UpdateCheck(UpdateStatus.CURRENT, "0.1.6")
                result = persona_updates.check_for_updates(root=root)

            self.assertEqual(result["status"], "current")
            self.assertFalse((staging / "staged.json").exists())

    def test_development_update_simulation_covers_toast_lifecycle(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "pyproject.toml").write_text('[project]\nversion = "0.1.6"\n', encoding="utf-8")
            os.environ["PERSONA_UPDATE_TEST_MODE"] = "available"
            os.environ["PERSONA_UPDATE_TEST_VERSION"] = "0.2.0"

            available = persona_updates.check_for_updates(root=root)
            self.assertEqual(available["status"], "available")
            staged = persona_updates.stage_update(root=root)
            self.assertEqual(staged["status"], "available")
            self.assertTrue(Path(staged["staged_path"]).is_file())

            os.environ["PERSONA_UPDATE_TEST_MODE"] = "ready"
            persona_updates._STAGED_UPDATE = None
            persona_updates._STAGED_VERSION = None
            ready = persona_updates.check_for_updates(root=root)
            self.assertEqual(ready["status"], "ready")


if __name__ == "__main__":
    unittest.main(verbosity=2)
