from datetime import date
from decimal import Decimal

import pytest

from app.core.idempotency import (
    IdempotencyConflictError,
    IdempotencyStateError,
    build_idempotency_claim,
    require_dedicated_payment_idempotency_store,
    replay_response,
)
from app.api.services.finance.payment.service import PaymentService


def _claim(payload=None, *, actor_id=7, operation="payment.record"):
    return build_idempotency_claim(
        org_id="org-1",
        actor_id=actor_id,
        operation=operation,
        key="payment_retry_123",
        request_payload=payload or {
            "invoice_id": 42,
            "amount": Decimal("100.50"),
            "payment_date": date(2026, 8, 19),
        },
    )


def test_claim_is_stable_for_equivalent_request_payloads():
    first = _claim({"amount": Decimal("100.50"), "invoice_id": 42})
    second = _claim({"invoice_id": 42, "amount": Decimal("100.50")})

    assert first == second
    assert "100.50" not in first.pending_marker
    assert "invoice_id" not in first.pending_marker


def test_claim_scope_separates_actor_and_operation():
    base = _claim()

    assert _claim(actor_id=8).scope_hash != base.scope_hash
    assert _claim(operation="payment.create").scope_hash != base.scope_hash


def test_completed_marker_replays_the_original_response():
    claim = _claim()
    response = {
        "payment_id": 10,
        "amount": 100.5,
        "payment_status": "partial",
    }

    assert replay_response(claim.completed_marker(response), claim) == response


def test_same_key_with_changed_payload_is_rejected():
    original = _claim({"invoice_id": 42, "amount": Decimal("100.50")})
    changed = _claim({"invoice_id": 42, "amount": Decimal("101.50")})

    with pytest.raises(IdempotencyConflictError, match="different payment request"):
        replay_response(original.completed_marker({"payment_id": 10}), changed)


def test_pending_or_corrupt_marker_fails_closed():
    claim = _claim()

    with pytest.raises(IdempotencyStateError, match="still pending"):
        replay_response(claim.pending_marker, claim)
    with pytest.raises(IdempotencyStateError, match="invalid"):
        replay_response(
            f"{claim.marker_prefix}{claim.request_hash}:complete:not-base64!",
            claim,
        )


@pytest.mark.parametrize("key", ["short", " leading-space", "trailing-space ", "x" * 256])
def test_invalid_keys_are_rejected(key):
    with pytest.raises(ValueError, match="Idempotency key"):
        build_idempotency_claim(
            org_id="org-1",
            actor_id=7,
            operation="payment.create",
            key=key,
            request_payload={"amount": 1},
        )


def test_temporary_backend_is_disabled_in_production(monkeypatch):
    class DatabaseMustNotBeCalled:
        def execute(self, *_args, **_kwargs):
            raise AssertionError("production guard must run before database access")

    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(IdempotencyStateError, match="disabled in production"):
        PaymentService._begin_idempotent_payment(
            DatabaseMustNotBeCalled(),
            org_id="org-1",
            actor_id=7,
            operation="payment.create",
            idempotency_key="payment_retry_123",
            request_payload={"amount": 1},
        )


@pytest.mark.parametrize(
    "operation",
    ["payment.cancel", "payment.reconcile", "payment.allocate"],
)
def test_unimplemented_dedicated_store_fails_closed(operation):
    with pytest.raises(IdempotencyStateError, match="live schema is baselined"):
        require_dedicated_payment_idempotency_store(
            operation=operation,
            key="payment_retry_123",
        )


def test_legacy_payment_creation_is_absent_from_openapi():
    from app.main import app

    schema = app.openapi()
    for path in (
        "/api/payments/",
        "/api/payments/record",
        "/api/payments/customer-receipt",
    ):
        assert "post" not in schema["paths"].get(path, {})


def test_all_legacy_consequential_payment_mutations_are_absent_from_openapi():
    from app.main import app

    schema = app.openapi()
    operations = (
        ("/api/payments/{payment_id}/cancel", "post"),
        ("/api/payments/bank-reconciliation", "post"),
        ("/api/payments/payment-allocation", "post"),
        ("/api/payment-allocation/allocate", "post"),
        ("/api/payment-allocation/allocate-bulk", "post"),
        ("/api/payment-allocation/auto-allocate", "post"),
        ("/api/payment-allocation/allocation/{allocation_id}", "delete"),
    )
    for path, method in operations:
        assert method not in schema["paths"].get(path, {})
