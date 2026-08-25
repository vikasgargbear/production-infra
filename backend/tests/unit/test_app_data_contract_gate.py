import copy
import hashlib
import importlib.util
import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
GATE_PATH = REPO_ROOT / "backend" / "scripts" / "audit" / "app_data_contract_gate.py"
SPEC = importlib.util.spec_from_file_location("app_data_contract_gate", GATE_PATH)
assert SPEC and SPEC.loader
gate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gate)


def _contract():
    return gate.load_contract()


def test_repository_contract_and_sql_dependencies_are_complete():
    assert gate.validate_contract(_contract()) == []


def test_duplicate_canonical_model_table_fails_closed():
    model = gate.load_model()
    first_group = next(iter(model["canonical_tables"].values()))
    first_group.append(copy.deepcopy(first_group[0]))

    errors = gate.validate_contract(_contract(), source_root=None, model=model)

    assert any("duplicate canonical model table" in error for error in errors)


def test_unknown_workflow_relation_fails_closed():
    contract = _contract()
    contract["workflows"][0]["relations"].append("missing.relation")

    errors = gate.validate_contract(contract, source_root=None)

    assert any("unknown canonical relation" in error for error in errors)


def test_every_canonical_relation_requires_one_scope_decision():
    contract = _contract()
    relation = contract["relation_scope"]["active_retained"]["organization"].pop()

    errors = gate.validate_contract(contract, source_root=None)

    assert any(
        error == f"canonical relation has no scope decision: {relation}"
        for error in errors
    )


def test_identity_resolution_uses_canonical_access_and_rls_boundaries():
    contract = _contract()
    steps = contract["identity_resolution_contract"]["steps"]
    steps[4] = steps[4].replace("core.access_grants", "core.membership_roles")
    steps[5] = steps[5].replace(
        "erp_security.activate_context",
        "core.activate_tenant with SET LOCAL ROLE",
    )

    errors = gate.validate_contract(contract, source_root=None)

    assert "identity resolution omits canonical boundary core.access_grants" in errors
    assert "identity resolution omits canonical boundary erp_security.activate_context" in errors
    assert "identity resolution references retired boundary core.membership_roles" in errors
    assert "identity resolution references retired boundary core.activate_tenant" in errors
    assert "identity resolution references retired boundary SET LOCAL ROLE" in errors


def test_deferred_module_requires_backend_and_frontend_actions():
    contract = _contract()
    module = contract["relation_scope"]["deferred_unmount"]["payroll"]
    module.pop("frontend_action")

    errors = gate.validate_contract(contract, source_root=None)

    assert "deferred module payroll lacks frontend_action" in errors


def test_retired_relation_requires_reason_and_no_target():
    contract = _contract()
    contract["legacy_relation_map"]["system_config.api_logs"] = {
        "action": "retire",
        "canonical": "operations.audit_events",
    }

    errors = gate.validate_contract(contract, source_root=None)

    assert any("retire requires a reason" in error for error in errors)
    assert any("retire must not claim a canonical target" in error for error in errors)


def test_write_without_idempotency_or_approval_fails_closed():
    contract = _contract()
    operation = next(
        item for item in contract["mcp_operations"] if item["mode"] == "write"
    )
    operation["idempotency"] = "optional"
    operation["approval"] = "none"

    errors = gate.validate_contract(contract, source_root=None)

    assert any("MCP writes require idempotency" in error for error in errors)
    assert any("MCP writes require an approval boundary" in error for error in errors)


def test_regulated_external_action_requires_human_approver():
    contract = _contract()
    contract["mcp_operations"].append(
        {
            "tool": "erp_unsafe_external_submission",
            "resource": "tax",
            "mode": "write",
            "risk": "regulated_external",
            "idempotency": "required",
            "approval": "actor_confirmation",
        }
    )

    errors = gate.validate_contract(contract, source_root=None)

    assert any("regulated external action requires human approver" in error for error in errors)


def test_new_sql_relation_must_be_added_to_migration_inventory(tmp_path):
    source_root = tmp_path / "backend" / "app"
    source_root.mkdir(parents=True)
    (source_root / "service.py").write_text(
        'QUERY = "SELECT * FROM sales.unreviewed_table"\n', encoding="utf-8"
    )

    errors = gate.validate_contract(_contract(), source_root=source_root)

    assert any("unmapped SQL relation sales.unreviewed_table" in error for error in errors)


def test_direct_sql_for_a_declared_canonical_relation_is_not_legacy_drift(tmp_path):
    source_root = tmp_path / "backend" / "app"
    source_root.mkdir(parents=True)
    (source_root / "canonical_read.py").write_text(
        'QUERY = "SELECT * FROM parties.supplier_accounts"\n', encoding="utf-8"
    )

    assert gate.validate_contract(_contract(), source_root=source_root) == []


def test_duplicate_json_keys_are_rejected(tmp_path):
    path = tmp_path / "contract.json"
    path.write_text('{"schema_version":"1", "schema_version":"2"}', encoding="utf-8")

    try:
        gate.load_contract(path)
    except ValueError as exc:
        assert "duplicate JSON key" in str(exc)
    else:
        raise AssertionError("duplicate JSON key was accepted")


def test_approved_contract_requires_every_promotion_predicate():
    contract = _contract()
    contract["decision_status"] = "approved_app_contract_v1"

    errors = gate.validate_contract(contract, source_root=None)

    for section in gate.PROMOTION_EVIDENCE_SECTIONS:
        assert f"promotion evidence {section} is not verified" in errors


def test_promotion_manifest_is_hash_bound(tmp_path):
    manifest = tmp_path / "promotion.json"
    manifest.write_text(
        json.dumps({
            "schema_version": 2,
            "evidence_state": "incomplete",
            **{
                section: {"state": "missing"}
                for section in gate.PROMOTION_EVIDENCE_SECTIONS
            },
        }),
        encoding="utf-8",
    )
    contract = {
        "decision_status": "proposed_app_contract_v1",
        "promotion_evidence": {
            "manifest": "promotion.json",
            "manifest_sha256": "0" * 64,
        },
    }

    _, errors = gate.validate_promotion_evidence(contract, root=tmp_path)

    assert any("manifest_sha256 hash differs" in error for error in errors)
    contract["promotion_evidence"]["manifest_sha256"] = hashlib.sha256(
        manifest.read_bytes()
    ).hexdigest()
    _, errors = gate.validate_promotion_evidence(contract, root=tmp_path)
    assert errors == []
