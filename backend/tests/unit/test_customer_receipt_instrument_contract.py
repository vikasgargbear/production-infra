from uuid import uuid4

import pytest

from app.domain.operator_actions.contract import (
    PREPARE_PAYLOAD_MODELS,
    validate_prepare_payload_semantics,
)


def _cheque_payload() -> dict[str, object]:
    return {
        "idempotency_key": "CODEX-E2E-receipt-cheque-001",
        "branch_id": str(uuid4()),
        "payment_date": "2026-08-27",
        "customer_account_id": str(uuid4()),
        "payment_method": "cheque",
        "receipt_purpose": "invoice_settlement",
        "amount": "100.00",
        "allocations": [{"open_item_id": str(uuid4()), "amount": "100.00"}],
        "external_reference": "CHQ-0001",
        "evidence_attachment_id": str(uuid4()),
        "instrument_number": "000001",
        "instrument_date": "2026-08-26",
        "drawee_bank_name": "Verified bank evidence",
        "account_payee_confirmed": True,
    }


def test_uncleared_cheque_uses_branch_role_without_bank_identity() -> None:
    operation = "finance.customer_receipt.prepare"
    payload = PREPARE_PAYLOAD_MODELS[operation].model_validate(_cheque_payload())
    validate_prepare_payload_semantics(operation, payload)


def test_uncleared_cheque_rejects_bank_identity() -> None:
    operation = "finance.customer_receipt.prepare"
    value = _cheque_payload()
    value["bank_account_id"] = str(uuid4())
    payload = PREPARE_PAYLOAD_MODELS[operation].model_validate(value)
    with pytest.raises(ValueError, match="uncleared cheque"):
        validate_prepare_payload_semantics(operation, payload)


def test_customer_advance_is_zero_allocation_and_goods_order_bound() -> None:
    operation = "finance.customer_receipt.prepare"
    value = _cheque_payload()
    value.update({
        "receipt_purpose": "customer_advance",
        "sales_order_id": str(uuid4()),
        "allocations": [],
    })
    payload = PREPARE_PAYLOAD_MODELS[operation].model_validate(value)
    validate_prepare_payload_semantics(operation, payload)

    value["allocations"] = [{"open_item_id": str(uuid4()), "amount": "100.00"}]
    invalid = PREPARE_PAYLOAD_MODELS[operation].model_validate(value)
    with pytest.raises(ValueError, match="zero invoice allocations"):
        validate_prepare_payload_semantics(operation, invalid)


def test_receipt_and_supplier_payment_inputs_expose_no_gst_rate_authority() -> None:
    forbidden = {"gst_rate", "tax_rate", "cgst_rate", "sgst_rate", "igst_rate"}

    for operation in (
        "finance.customer_receipt.prepare",
        "finance.supplier_payment.prepare",
    ):
        model = PREPARE_PAYLOAD_MODELS[operation]
        assert forbidden.isdisjoint(model.model_fields)
        allocations = model.model_fields["allocations"].annotation
        assert "gst_rate" not in str(allocations).lower()
        assert "tax_rate" not in str(allocations).lower()
