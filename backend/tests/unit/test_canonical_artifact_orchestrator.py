from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest


REPO = Path(__file__).resolve().parents[3]
SCRIPT = REPO / "backend/scripts/check_canonical_artifacts.py"
SPEC = importlib.util.spec_from_file_location("canonical_artifact_orchestrator", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
orchestrator = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = orchestrator
SPEC.loader.exec_module(orchestrator)


def test_every_canonical_generator_is_registered_once() -> None:
    sources = [contract.source for contract in orchestrator.CONTRACTS]
    assert len(sources) == len(set(sources))
    assert set(sources) == orchestrator._discovered_sources()


def test_inventory_fails_closed_for_unregistered_generator(monkeypatch) -> None:
    monkeypatch.setattr(
        orchestrator,
        "_discovered_sources",
        lambda: orchestrator._registered_sources() | {"new/generate_unreviewed.py"},
    )
    with pytest.raises(orchestrator.ArtifactError, match="unregistered"):
        orchestrator.validate_inventory()


def test_generated_output_must_stay_under_canonical_root(tmp_path: Path) -> None:
    class FakeModule:
        OUTPUT_PATH = tmp_path / "outside.json"

        @staticmethod
        def generated_artifacts():
            return ("{}\n",)

    contract = orchestrator.GeneratorContract("fake/generate_fake.py", ("OUTPUT_PATH",))
    with pytest.raises(orchestrator.ArtifactError, match="outside canonical root"):
        orchestrator._generated_outputs(contract, FakeModule())


def test_check_mode_reports_drift_without_writing(monkeypatch, tmp_path: Path) -> None:
    output = orchestrator.CANONICAL_ROOT / "test-artifact-orchestrator-output.txt"
    output.write_text("old\n", encoding="utf-8")

    class FakeModule:
        OUTPUT_PATH = output

        @staticmethod
        def generated_artifacts():
            return ("new\n",)

    contract = orchestrator.GeneratorContract("fake/generate_fake.py", ("OUTPUT_PATH",))
    monkeypatch.setattr(orchestrator, "validate_inventory", lambda: None)
    monkeypatch.setattr(orchestrator, "CONTRACTS", (contract,))
    monkeypatch.setattr(orchestrator, "_load_module", lambda *_args: FakeModule())
    try:
        assert orchestrator.run(write=False) == [
            "database/canonical/test-artifact-orchestrator-output.txt"
        ]
        assert output.read_text(encoding="utf-8") == "old\n"
    finally:
        output.unlink(missing_ok=True)
