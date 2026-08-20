import importlib.util
import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT = REPO_ROOT / "backend" / "scripts" / "audit" / "runtime_environment_contract.py"


def _module():
    spec = importlib.util.spec_from_file_location("runtime_environment_contract", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def test_runtime_environment_contract_covers_sources_and_deployments() -> None:
    module = _module()
    assert module.validate() == []

    document = json.loads(module.CONTRACT_PATH.read_text(encoding="utf-8"))
    keys = [(entry["service"], entry["name"]) for entry in document["variables"]]
    assert len(keys) == len(set(keys))
    assert all(entry["description"].strip() for entry in document["variables"])
    assert not {entry["name"] for entry in document["variables"]} & module.RETIRED_NAMES

    test_branch = next(
        entry for entry in document["variables"] if entry["name"] == "TEST_BRANCH_ID"
    )
    assert test_branch["semantic_id"] == "legacy_test.integer_branch_id"
    assert "legacy positive integer" in test_branch["format"]
    assert "PHARMA_CANONICAL_LIVE_TEST_BRANCH_ID" in test_branch["description"]


def test_duplicate_and_divergent_environment_meanings_fail_closed(
    tmp_path: Path, monkeypatch
) -> None:
    module = _module()
    document = json.loads(module.CONTRACT_PATH.read_text(encoding="utf-8"))
    duplicate = dict(document["variables"][0])
    duplicate["semantic_id"] = "unrelated.meaning"
    document["variables"].append(duplicate)
    contract = tmp_path / "runtime-environment-contract.json"
    contract.write_text(json.dumps(document), encoding="utf-8")
    monkeypatch.setattr(module, "CONTRACT_PATH", contract)

    issues = module.validate()
    assert any("duplicate service variable" in issue for issue in issues)
    assert any("divergent meanings" in issue for issue in issues)


def test_render_does_not_reintroduce_retired_runtime_aliases() -> None:
    blueprint = (REPO_ROOT / "render.yaml").read_text(encoding="utf-8")
    provisioner = (
        REPO_ROOT / "backend" / "scripts" / "provision_render_pilot.py"
    ).read_text(encoding="utf-8")
    for retired in ("DEBUG", "ENVIRONMENT", "SECRET_KEY", "ALLOWED_ORIGINS"):
        assert f"key: {retired}" not in blueprint
        assert f'"{retired}":' not in provisioner


def test_render_covers_every_required_runtime_variable(monkeypatch) -> None:
    module = _module()
    actual = module.render_environment_names

    def missing_calculator():
        names = actual()
        names["backend_api"].discard("ERP_CALCULATOR_DATABASE_URL")
        return names

    monkeypatch.setattr(module, "render_environment_names", missing_calculator)
    assert any(
        issue
        == "Render omits required service variable: backend_api.ERP_CALCULATOR_DATABASE_URL"
        for issue in module.validate()
    )
