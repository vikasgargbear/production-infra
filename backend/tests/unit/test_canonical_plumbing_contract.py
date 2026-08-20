import importlib.util
import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOT = REPO_ROOT / "database" / "canonical" / "plumbing"
GENERATOR = ROOT / "generate_plumbing_contract.py"


def _module():
    spec = importlib.util.spec_from_file_location("canonical_plumbing", GENERATOR)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_checked_in_plumbing_artifacts_are_deterministic():
    mapping, manifest, sql = _module().generated_artifacts()
    assert (ROOT / "baseline-plumbing-enforcements.json").read_text() == mapping
    assert (ROOT / "plumbing-manifest.json").read_text() == manifest
    assert (ROOT / "canonical_plumbing.sql").read_text() == sql


def test_plumbing_resolves_exactly_three_reviewed_platform_blockers():
    mapping = json.loads((ROOT / "baseline-plumbing-enforcements.json").read_text())
    entries = mapping["platform_enforcements"]
    assert {entry["key"] for entry in entries} == {
        "trigger_plumbing:audit",
        "trigger_plumbing:immutability",
        "trigger_plumbing:outbox",
    }
    assert all(entry["reviewed"] is True and entry["statements"] for entry in entries)


def test_audit_bindings_are_exhaustive_and_non_recursive():
    module = _module()
    catalog, _requirements, _digest = module._catalog()
    expected = {
        table["name"]
        for table in catalog.tables
        if table["tenant_class"] != "global_reference"
        and table["name"] not in module.AUDIT_EXCLUSIONS
    }
    manifest = json.loads((ROOT / "plumbing-manifest.json").read_text())
    assert set(manifest["audit_bindings"]) == expected
    assert "core.audit_events" not in manifest["audit_bindings"]
    assert manifest["hash_contract"] == "pg-jsonb-sha256-v1"


def test_immutable_bindings_follow_reviewed_mutation_classes():
    module = _module()
    catalog, _requirements, _digest = module._catalog()
    expected = {
        table["name"]
        for table in catalog.tables
        if table["mutation_class"] in module.IMMUTABLE_CLASSES
    }
    manifest = json.loads((ROOT / "plumbing-manifest.json").read_text())
    assert set(manifest["immutable_bindings"]) == expected


def test_audit_and_outbox_sql_are_private_bounded_and_transactional():
    sql = (ROOT / "canonical_plumbing.sql").read_text()
    assert "SECURITY DEFINER\nSET search_path = ''" in sql
    assert 'REVOKE ALL ON FUNCTION "erp_plumbing"."audit_row_mutation"()' in sql
    assert "pg_advisory_xact_lock" in sql
    assert "event.chain_sequence + 1" in sql
    assert "ORDER BY event.chain_sequence DESC" in sql
    assert "'chain_sequence', next_chain_sequence" in sql
    assert "before_state_hash" in sql and "after_state_hash" in sql
    assert "ON CONFLICT (org_id, aggregate_type, aggregate_id, event_type, event_version) DO NOTHING" in sql
    assert "payload_bytes" in sql and "application/json" in sql
    assert "EXECUTE FUNCTION" in sql
    assert "EXECUTE pg_catalog.format" not in sql
    assert "EXECUTE format" not in sql
    assert "IF NOT EXISTS" not in sql


def test_outbox_bindings_target_real_reviewed_lifecycle_states():
    module = _module()
    catalog, _requirements, _digest = module._catalog()
    tables = {table["name"]: table for table in catalog.tables}
    for name, (_aggregate, statuses) in module.OUTBOX_BINDINGS.items():
        assert set(statuses) <= set(tables[name]["lifecycle"]["states"])
