import importlib.util
import json
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def _load_audit():
    path = REPOSITORY_ROOT / "backend/scripts/audit/payment_idempotency_readiness.py"
    spec = importlib.util.spec_from_file_location("payment_idempotency_readiness", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_store_contract_has_required_financial_safety_invariants():
    contract = json.loads((
        REPOSITORY_ROOT / "docs/architecture/payment-idempotency-store.json"
    ).read_text(encoding="utf-8"))

    assert contract["status"] == "required_unimplemented"
    assert set(contract["scope_identity"]) == {
        "organization_id",
        "actor_id",
        "operation_id",
        "idempotency_key_hash",
    }
    assert {
        "request_hash_mismatch_is_rejected",
        "claim_and_business_effect_share_one_transaction",
        "completed_response_is_replayed_exactly",
        "organization_scope_is_database_enforced",
    } <= set(contract["required_invariants"])
    assert set(contract["required_operations"]) == {
        "payment.create",
        "payment.record",
        "payment.customer_receipt",
        "payment.cancel",
        "payment.reconcile",
        "payment.allocate",
    }
    assert contract["temporary_backend_allowed_environments"] == [
        "development",
        "test",
    ]


def test_readiness_gate_fails_closed_without_live_baseline_and_dedicated_store():
    codes = {issue.code for issue in _load_audit().collect_issues()}

    assert "DEDICATED_IDEMPOTENCY_STORE_UNIMPLEMENTED" in codes
    assert "LIVE_SCHEMA_BASELINE_REQUIRED" in codes
    assert "TEMPORARY_IDEMPOTENCY_BACKEND" in codes
    assert "PAYMENT_MUTATIONS_NOT_COVERED" in codes
