from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.routes.internal import mcp_actions
from app.core.api_contract import _route_index
from app.domain.operator_actions import (
    ACTION_POLICIES,
    PREPARE_PAYLOAD_MODELS,
    ActionContext,
    CommandExecution,
    CommandReview,
    CommandState,
    PreparedCommand,
    get_operator_action_service,
)
from mcp_runtime.aasopharma_mcp.operator_actions import PREPARE_ACTIONS


PREVIEW_HASH = "sha256:" + "a" * 64
BRANCH_ID = uuid4()
COMMAND_ID = uuid4()


class FakeOperatorActionService:
    def __init__(self, *, deployment_verified=True) -> None:
        self.calls = []
        self.last_idempotency_key = None
        self.deployment_verified = deployment_verified

    def deployment_readiness(self):
        return self.deployment_verified

    def adapter_readiness(self):
        return {operation_key: True for operation_key in ACTION_POLICIES}

    def prepare(self, *, policy, payload, idempotency_key, context):
        self.last_idempotency_key = idempotency_key
        self.calls.append(("prepare", policy, payload, context))
        return PreparedCommand(
            command_request_id=COMMAND_ID,
            command_type=policy.operation_key,
            preview_hash=PREVIEW_HASH,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
            resolved_references=(
                {
                    "resource": "source",
                    "id": str(
                        payload.get("customer_account_id")
                        or payload.get("sales_order_id")
                    ),
                },
            ),
            source_versions=({"resource": "customer", "row_version": 7},),
            calculation_ruleset=({"rule": "gst", "version": "2026-08-20"},),
            inventory_impact=(),
            financial_impact=({"currency": "INR", "grand_total": "118.00"},),
            tax_impact=({"tax_type": "IGST", "amount": "18.00"},),
            policy_warnings=(),
            required_approvals=({"policy": policy.approval_policy},),
        )

    def approve(self, *, command_request_id, preview_hash, idempotency_key, context):
        self.calls.append(
            ("approve", command_request_id, preview_hash, idempotency_key, context)
        )
        return CommandExecution(
            command_request_id=command_request_id,
            command_type="sales.order.prepare",
            status="approved",
            preview_hash=preview_hash,
            approved_at=datetime.now(timezone.utc),
        )

    def review(self, *, command_request_id, context):
        self.calls.append(("review", command_request_id, context))
        preview = '{"financial_impact":[{"amount":"168.00"}]}'
        return CommandReview(
            command_request_id=command_request_id,
            command_type="finance.adjustment_note.post",
            capability_code="finance.adjustment_note.prepare",
            status="pending_approval",
            requested_by_membership_id=uuid4(),
            branch_id=BRANCH_ID,
            destination_branch_id=None,
            target_resource_type="adjustment_note",
            target_resource_id=uuid4(),
            target_row_version=1,
            serializer_version="canonical-json-v1",
            preview_media_type="application/json",
            preview_canonical_json=preview,
            preview_hash=PREVIEW_HASH,
            request_hash="sha256:" + "b" * 64,
            aggregate_version_hash="sha256:" + "c" * 64,
            approval_policy="separate_approver",
            required_approval_count=1,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
            resolved_references=(), source_versions=(), calculation_ruleset=(),
            inventory_impact=(), financial_impact=({"amount": "168.00"},),
            tax_impact=(), required_approvals=({"policy": "separate_approver", "count": 1},),
        )

    def execute(self, *, command_request_id, preview_hash, idempotency_key, context):
        self.calls.append(
            ("execute", command_request_id, preview_hash, idempotency_key, context)
        )
        return CommandExecution(
            command_request_id=command_request_id,
            command_type="sales.order.prepare",
            status="executed",
            preview_hash=preview_hash,
            resource_type="sales_order",
            resource_id=uuid4(),
            executed_at=datetime.now(timezone.utc),
        )

    def get_status(self, *, command_request_id, context):
        self.calls.append(("status", command_request_id, context))
        return CommandState(
            command_request_id=command_request_id,
            command_type="sales.order.prepare",
            status="executed",
            preview_hash=PREVIEW_HASH,
            audit_references=({"event_id": str(uuid4())},),
        )


def _context(operation_key: str, permission: str) -> ActionContext:
    return ActionContext(
        auth_user_id=uuid4(),
        user_id=uuid4(),
        organization_id=uuid4(),
        membership_id=uuid4(),
        agent_grant_id=uuid4(),
        client_id="test-client",
        operation_key=operation_key,
        permission=permission,
        branch_ids=(BRANCH_ID,),
        delegated_command_request_id=(
            COMMAND_ID if operation_key.startswith("automation.command.") else None
        ),
    )


def _app(fake: FakeOperatorActionService, context_holder: dict[str, ActionContext]):
    application = FastAPI()
    api = APIRouter(prefix="/api")
    api.include_router(mcp_actions.router)
    application.include_router(api)
    application.dependency_overrides[mcp_actions.get_action_context] = (
        lambda: context_holder["value"]
    )
    application.dependency_overrides[get_operator_action_service] = lambda: fake
    return application


def _sales_order_payload():
    return {
        "idempotency_key": "sales-order:test:0001",
        "branch_id": str(BRANCH_ID),
        "order_date": "2026-08-20",
        "customer_account_id": str(uuid4()),
        "delivery_address_id": str(uuid4()),
        "delivery_address_row_version": "3",
        "lines": [
            {
                "product_id": str(uuid4()),
                "uom_conversion_id": str(uuid4()),
                "billed_quantity": "10.000000",
                "free_quantity": "0.000000",
                "free_supply_tax_treatment": "excluded_from_taxable_value",
                "quoted_unit_rate": "100.0000",
                "price_basis": "tax_exclusive",
                "line_discount": {
                    "line_discount_kind": "percent",
                    "line_discount_basis": "taxable_value",
                    "line_discount_value": "5.000000",
                },
                "document_discount_eligible": True,
            }
        ],
        "document_discount": {
            "document_discount_kind": "none",
            "document_discount_basis": "taxable_value",
            "document_discount_value": "0.000000",
        },
        "rounding_policy": "none",
        "zero_rated_payment_mode": "not_applicable",
    }


def _sales_invoice_payload():
    payload = _sales_order_payload()
    payload.update(
        {
            "idempotency_key": "sales-invoice:test:0001",
            "invoice_date": payload.pop("order_date"),
            "tax_charge_mechanism": "normal",
            "from_location_id": str(uuid4()),
            "logistics": {
                "transport_mode": "road",
                "distance_km": "148.50",
                "transporter_party_id": str(uuid4()),
                "vehicle_number": "MH12AB1234",
                "vehicle_type": "regular",
            },
        }
    )
    line = payload["lines"][0]
    line.update(
        {
            "fulfillment_source": "direct_issue",
            "batch_allocations": [
                {
                    "batch_id": str(uuid4()),
                    "billed_quantity": "10.000000",
                    "free_quantity": "0.000000",
                }
            ],
        }
    )
    return payload


def _sales_return_payload(*, treatment: str = "statutory"):
    payload = {
        "idempotency_key": "sales-return:test:0001",
        "branch_id": str(BRANCH_ID),
        "return_date": "2026-08-20",
        "original_invoice_id": str(uuid4()),
        "reason_code": "customer_rejection",
        "gst_tax_treatment": treatment,
        "lines": [{
            "original_invoice_line_id": str(uuid4()),
            "invoice_dispatch_allocation_id": str(uuid4()),
            "billed_quantity": "2.000000",
            "free_quantity": "1.000000",
            "batch_allocation": {
                "batch_id": str(uuid4()),
                "billed_quantity": "2.000000",
                "free_quantity": "1.000000",
            },
            "to_location_id": str(uuid4()),
            "return_condition": "sealed_resaleable",
        }],
    }
    if treatment == "statutory":
        payload.update({
            "recipient_itc_reversal_evidence_attachment_id": str(uuid4()),
            "recipient_itc_reversal_confirmed_at": "2026-08-20T10:30:00+05:30",
        })
    return payload


def _purchase_order_payload():
    payload = _sales_order_payload()
    payload.update(
        {
            "idempotency_key": "purchase-order:test:0001",
            "supplier_account_id": str(uuid4()),
            "expected_on": "2026-08-25",
            "tax_charge_mechanism": "normal",
        }
    )
    payload.pop("customer_account_id")
    payload.pop("delivery_address_id")
    payload.pop("delivery_address_row_version")
    return payload


def _goods_receipt_payload():
    return {
        "idempotency_key": "goods-receipt:test:0001",
        "branch_id": str(BRANCH_ID),
        "received_at": "2026-08-20T10:30:00+05:30",
        "purchase_order_id": str(uuid4()),
        "supplier_account_id": str(uuid4()),
        "supplier_challan_number": "CH-2026-0001",
        "supplier_challan_date": "2026-08-20",
        "lines": [{
            "purchase_order_line_id": str(uuid4()),
            "batches": [{
                "manufacturer_batch_number": "MFG-BATCH-001",
                "manufactured_on": "2026-07-01",
                "expires_on": "2027-07-01",
                "mrp": "125.00",
                "mrp_uom_conversion_id": str(uuid4()),
                "received_quantity": "10.000000",
                "accepted_quantity": "8.000000",
                "rejected_quantity": "2.000000",
                "free_quantity": "1.000000",
                "qc_status": "partial",
                "qc_notes": "Two packs damaged in transit",
                "to_location_id": str(uuid4()),
            }],
        }],
    }


def _supplier_invoice_payload():
    return {
        "idempotency_key": "supplier-invoice:test:0001",
        "branch_id": str(BRANCH_ID),
        "invoice_date": "2026-08-20",
        "received_date": "2026-08-21",
        "supplier_account_id": str(uuid4()),
        "supplier_tax_registration_id": str(uuid4()),
        "supplier_invoice_number": "SUP-2026-0042",
        "tax_charge_mechanism": "normal",
        "portal_document_line_id": str(uuid4()),
        "goods_receipt_ids": [str(uuid4())],
        "document_discount": {
            "document_discount_kind": "none",
            "document_discount_basis": "price_value",
            "document_discount_value": "0",
        },
        "rounding_policy": "none",
        "zero_rated_payment_mode": "not_applicable",
        "lines": [{
            "billed_quantity": "2.000000",
            "free_quantity": "1.000000",
            "free_supply_tax_treatment": "included_at_unit_rate",
            "quoted_unit_rate": "100.0000",
            "price_basis": "tax_exclusive",
            "line_discount": {
                "line_discount_kind": "none",
                "line_discount_basis": "price_value",
                "line_discount_value": "0",
            },
            "document_discount_eligible": True,
            "goods_receipt_line_id": str(uuid4()),
            "allocated_base_billed_quantity": "20.000000",
            "allocated_base_free_quantity": "10.000000",
            "product_inventory_cost_treatment": "capitalize",
            "itc_eligibility": "eligible",
            "itc_eligibility_basis": (
                "taxable_resale_not_blocked_under_section_17"
            ),
        }],
        "expense_charge_lines": [{
            "expense_charge_code": "freight",
            "quoted_amount": "10.00",
            "expense_price_basis": "tax_exclusive",
            "expense_document_discount_eligible": True,
            "charge_inventory_cost_treatment": "expense",
            "net_value_account_id": str(uuid4()),
            "itc_eligibility": "eligible",
            "itc_eligibility_basis": (
                "taxable_resale_not_blocked_under_section_17"
            ),
        }],
    }


def _adjustment_note_payload():
    return {
        "idempotency_key": "adjustment-note:test:source-authority",
        "branch_id": str(BRANCH_ID),
        "note_date": "2026-08-25",
        "side": "sales",
        "direction": "credit",
        "original_document_id": str(uuid4()),
        "gst_tax_treatment": "commercial_only",
        "reason_code": "customer_rejection",
        "reason": "Exact source policy correction",
        "rounding_policy": "nearest_rupee",
        "document_discount": {
            "document_discount_kind": "percent",
            "document_discount_basis": "price_value",
            "document_discount_value": "5.000000",
        },
        "lines": [{
            "original_line_id": str(uuid4()),
            "billed_quantity": "1.000000",
            "free_quantity": "0.000000",
            "free_supply_tax_treatment": "excluded_from_taxable_value",
            "quoted_unit_rate": "150.0000",
            "price_basis": "tax_exclusive",
            "line_discount": {
                "line_discount_kind": "amount",
                "line_discount_basis": "taxable_value",
                "line_discount_value": "10.000000",
            },
            "document_discount_eligible": False,
        }],
    }


def _purchase_return_payload(*, treatment: str = "statutory"):
    payload = {
        "idempotency_key": "purchase-return:test:0001",
        "branch_id": str(BRANCH_ID),
        "return_date": "2026-08-20",
        "return_source_kind": "invoiced",
        "original_supplier_invoice_id": str(uuid4()),
        "reason_code": "wrong_supply",
        "gst_tax_treatment": treatment,
        "supplier_destination_address_id": str(uuid4()),
        "logistics": {
            "transport_mode": "road",
            "distance_km": "148.50",
            "transporter_party_id": str(uuid4()),
            "vehicle_number": "MH12AB1234",
            "vehicle_type": "regular",
        },
        "lines": [{
            "goods_receipt_line_id": str(uuid4()),
            "supplier_invoice_receipt_allocation_id": str(uuid4()),
            "billed_quantity": "2.000000",
            "free_quantity": "1.000000",
            "batch_allocation": {
                "batch_id": str(uuid4()),
                "billed_quantity": "2.000000",
                "free_quantity": "1.000000",
            },
            "from_location_id": str(uuid4()),
        }],
    }
    if treatment == "statutory":
        payload["supplier_credit_note_portal_line_id"] = str(uuid4())
    return payload


def _sales_dispatch_payload():
    return {
        "idempotency_key": "sales-dispatch:test:0001",
        "branch_id": str(BRANCH_ID),
        "dispatch_date": "2026-08-20",
        "sales_order_id": str(uuid4()),
        "from_location_id": str(uuid4()),
        "lines": [{
            "sales_order_line_id": str(uuid4()),
            "billed_quantity": "10.000000",
            "free_quantity": "2.000000",
            "batch_allocations": [{
                "batch_id": str(uuid4()),
                "billed_quantity": "10.000000",
                "free_quantity": "2.000000",
            }],
        }],
        "logistics": {
            "transport_mode": "road",
            "distance_km": "148.50",
            "transporter_party_id": str(uuid4()),
            "vehicle_number": "MH12AB1234",
            "vehicle_type": "regular",
        },
    }


@pytest.fixture(autouse=True)
def enabled_boundary(monkeypatch):
    # The injected fake service proves the deployed boundary for route tests.
    monkeypatch.setattr(mcp_actions, "require_canonical_session_authority", lambda _db: None)
    monkeypatch.setattr(
        mcp_actions, "require_canonical_provisioning_authority", lambda _db: None
    )
    yield


def test_registry_and_strict_models_are_derived_from_exact_machine_contract():
    expected = {action.operation_key: action for action in PREPARE_ACTIONS.values()}
    assert set(PREPARE_PAYLOAD_MODELS) == set(expected)
    assert set(expected) < set(ACTION_POLICIES)
    for operation_key, action in expected.items():
        assert ACTION_POLICIES[operation_key].permission == action.permission
        assert ACTION_POLICIES[operation_key].schema_profile == action.schema_profile
        assert ACTION_POLICIES[operation_key].approval_policy == action.approval_policy

    assert ACTION_POLICIES["sales.invoice.prepare"].approval_policy == "actor_confirmation"
    assert ACTION_POLICIES["sales.return.prepare"].approval_policy == "separate_approver"
    assert ACTION_POLICIES["automation.command.execute"].approval_policy == "command_policy"

    payload = _sales_order_payload()
    parsed = PREPARE_PAYLOAD_MODELS["sales.order.prepare"].model_validate(payload)
    assert parsed.branch_id == BRANCH_ID
    assert parsed.lines[0].billed_quantity == "10.000000"
    assert parsed.lines[0].free_quantity == "0.000000"

    with pytest.raises(ValidationError):
        PREPARE_PAYLOAD_MODELS["sales.order.prepare"].model_validate(
            {**payload, "gst_rate": "18.000000"}
        )
    numeric_payload = _sales_order_payload()
    numeric_payload["lines"][0]["billed_quantity"] = 10
    with pytest.raises(ValidationError):
        PREPARE_PAYLOAD_MODELS["sales.order.prepare"].model_validate(numeric_payload)
    overflow_payload = _sales_order_payload()
    overflow_payload["lines"][0]["billed_quantity"] = "100000000000000.000000"
    with pytest.raises(ValidationError):
        PREPARE_PAYLOAD_MODELS["sales.order.prepare"].model_validate(overflow_payload)
    rate_overflow_payload = _sales_order_payload()
    rate_overflow_payload["lines"][0]["quoted_unit_rate"] = (
        "10000000000000000.0000"
    )
    with pytest.raises(ValidationError):
        PREPARE_PAYLOAD_MODELS["sales.order.prepare"].model_validate(
            rate_overflow_payload
        )


def test_prepare_validates_branch_and_calls_only_injected_canonical_service(enabled_boundary):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["sales.order.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))

    response = client.post(
        "/api/internal/mcp/actions/sales.order.prepare/prepare",
        json=_sales_order_payload(),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["command_request_id"] == str(COMMAND_ID)
    assert body["preview_hash"] == PREVIEW_HASH
    assert body["operation_policy"]["permission"] == "sales.order.create"
    call = fake.calls[0]
    assert call[0] == "prepare"
    assert call[2]["branch_id"] == BRANCH_ID
    assert call[2]["lines"][0]["quoted_unit_rate"] == "100.0000"
    assert "idempotency_key" not in call[2]
    assert fake.last_idempotency_key == "sales-order:test:0001"


def test_dispatch_prepare_accepts_only_order_line_quantities_batches_and_logistics(
    enabled_boundary,
):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["sales.dispatch.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))

    response = client.post(
        "/api/internal/mcp/actions/sales.dispatch.prepare/prepare",
        json=_sales_dispatch_payload(),
    )

    assert response.status_code == 200, response.text
    call = fake.calls[0]
    assert call[0] == "prepare"
    assert call[2]["lines"][0]["billed_quantity"] == "10.000000"
    assert call[2]["lines"][0]["free_quantity"] == "2.000000"
    assert call[2]["lines"][0]["batch_allocations"][0]["batch_id"]
    assert call[2]["logistics"]["transport_mode"] == "road"
    assert "product_id" not in call[2]["lines"][0]
    assert "quoted_unit_rate" not in call[2]["lines"][0]
    assert "tax_code_version_id" not in call[2]["lines"][0]
    assert "idempotency_key" not in call[2]
    assert fake.last_idempotency_key == "sales-dispatch:test:0001"


def test_prepare_rejects_tax_injection_and_cross_branch_before_service(enabled_boundary):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["sales.order.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))
    payload = _sales_order_payload()
    payload["tax_amount"] = "18.00"

    response = client.post(
        "/api/internal/mcp/actions/sales.order.prepare/prepare",
        json=payload,
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "VALIDATION_FAILED"
    assert fake.calls == []


def test_customer_receipt_requires_reviewed_non_cash_bank_identity(enabled_boundary):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["finance.customer_receipt.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))
    payload = {
        "idempotency_key": "receipt:test:0001",
        "branch_id": str(BRANCH_ID),
        "payment_date": "2026-08-20",
        "customer_account_id": str(uuid4()),
        "settlement_account_id": str(uuid4()),
        "payment_method": "upi",
        "amount": "118.00",
        "allocations": [
            {"open_item_id": str(uuid4()), "amount": "118.00"}
        ],
        "external_reference": "UPI-TEST-0001",
    }

    response = client.post(
        "/api/internal/mcp/actions/finance.customer_receipt.prepare/prepare",
        json=payload,
    )
    assert response.status_code == 422
    assert response.json()["detail"]["message"] == (
        "non-cash payment requires bank_account_id"
    )

    payload["bank_account_id"] = str(uuid4())
    response = client.post(
        "/api/internal/mcp/actions/finance.customer_receipt.prepare/prepare",
        json=payload,
    )
    assert response.status_code == 200, response.text
    assert fake.calls[-1][2]["payment_method"] == "upi"
    assert fake.calls[-1][2]["amount"] == "118.00"

    payload.update(
        {
            "payment_method": "cash",
            "bank_account_id": str(uuid4()),
            "external_reference": None,
        }
    )
    response = client.post(
        "/api/internal/mcp/actions/finance.customer_receipt.prepare/prepare",
        json=payload,
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "VALIDATION_FAILED"


def test_customer_receipt_rejects_duplicate_partial_or_unapplied_allocations(enabled_boundary):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["finance.customer_receipt.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))
    open_item_id = str(uuid4())
    payload = {
        "idempotency_key": "receipt:test:allocation",
        "branch_id": str(BRANCH_ID),
        "payment_date": "2026-08-20",
        "customer_account_id": str(uuid4()),
        "settlement_account_id": str(uuid4()),
        "bank_account_id": str(uuid4()),
        "payment_method": "bank_transfer",
        "amount": "118.00",
        "allocations": [
            {"open_item_id": open_item_id, "amount": "50.00"},
            {"open_item_id": open_item_id, "amount": "50.00"},
        ],
        "external_reference": "BANK-RECEIPT-0001",
    }
    response = client.post(
        "/api/internal/mcp/actions/finance.customer_receipt.prepare/prepare",
        json=payload,
    )
    assert response.status_code == 422
    assert response.json()["detail"]["message"] == (
        "customer receipt allocations require unique open_item_id"
    )
    payload["allocations"] = [{"open_item_id": str(uuid4()), "amount": "100.00"}]
    response = client.post(
        "/api/internal/mcp/actions/finance.customer_receipt.prepare/prepare",
        json=payload,
    )
    assert response.status_code == 422
    assert response.json()["detail"]["message"] == (
        "customer receipt allocations must exactly equal amount"
    )


def test_supplier_advance_requires_one_exact_non_cheque_goods_allocation(enabled_boundary):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["finance.supplier_advance.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))
    payload = {
        "idempotency_key": "advance:test:0001",
        "branch_id": str(BRANCH_ID),
        "payment_date": "2026-08-20",
        "supplier_account_id": str(uuid4()),
        "purchase_order_id": str(uuid4()),
        "settlement_account_id": str(uuid4()),
        "bank_account_id": str(uuid4()),
        "payment_method": "bank_transfer",
        "gross_amount": "50000.00",
        "allocations": [
            {
                "purchase_order_line_id": str(uuid4()),
                "gross_amount": "50000.00",
            }
        ],
        "external_reference": "BANK-ADVANCE-0001",
    }

    response = client.post(
        "/api/internal/mcp/actions/finance.supplier_advance.prepare/prepare",
        json=payload,
    )
    assert response.status_code == 200, response.text
    assert fake.calls[-1][2]["payment_method"] == "bank_transfer"
    assert fake.calls[-1][2]["gross_amount"] == "50000.00"

    payload["payment_method"] = "cheque"
    response = client.post(
        "/api/internal/mcp/actions/finance.supplier_advance.prepare/prepare",
        json=payload,
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "VALIDATION_FAILED"

    payload["payment_method"] = "upi"
    payload["allocations"][0]["gross_amount"] = "49000.00"
    response = client.post(
        "/api/internal/mcp/actions/finance.supplier_advance.prepare/prepare",
        json=payload,
    )
    assert response.status_code == 422
    assert response.json()["detail"]["message"] == (
        "supplier advance allocation must exactly equal gross_amount"
    )

    payload["allocations"] = [
        {
            "purchase_order_line_id": str(uuid4()),
            "gross_amount": "25000.00",
        },
        {
            "purchase_order_line_id": str(uuid4()),
            "gross_amount": "25000.00",
        },
    ]
    response = client.post(
        "/api/internal/mcp/actions/finance.supplier_advance.prepare/prepare",
        json=payload,
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "VALIDATION_FAILED"


def test_supplier_payment_requires_exact_inr_bank_allocations(enabled_boundary):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["finance.supplier_payment.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))
    first_open_item_id = str(uuid4())
    payload = {
        "idempotency_key": "supplier-payment:test:0001",
        "branch_id": str(BRANCH_ID),
        "payment_date": "2026-08-20",
        "supplier_account_id": str(uuid4()),
        "settlement_account_id": str(uuid4()),
        "bank_account_id": str(uuid4()),
        "payment_method": "bank_transfer",
        "gross_amount": "900.00",
        "allocations": [
            {"open_item_id": first_open_item_id, "amount": "400.00"},
            {"open_item_id": str(uuid4()), "amount": "500.00"},
        ],
        "external_reference": "UTR-SUPPLIER-0001",
    }

    response = client.post(
        "/api/internal/mcp/actions/finance.supplier_payment.prepare/prepare",
        json=payload,
    )
    assert response.status_code == 200, response.text
    assert fake.calls[-1][2]["gross_amount"] == "900.00"
    assert [item["amount"] for item in fake.calls[-1][2]["allocations"]] == [
        "400.00",
        "500.00",
    ]

    payload["payment_method"] = "cheque"
    response = client.post(
        "/api/internal/mcp/actions/finance.supplier_payment.prepare/prepare",
        json=payload,
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "VALIDATION_FAILED"

    payload["payment_method"] = "upi"
    payload["allocations"][1]["amount"] = "499.00"
    response = client.post(
        "/api/internal/mcp/actions/finance.supplier_payment.prepare/prepare",
        json=payload,
    )
    assert response.status_code == 422
    assert response.json()["detail"]["message"] == (
        "supplier payment allocations must exactly equal gross_amount"
    )

    payload["allocations"] = [
        {"open_item_id": first_open_item_id, "amount": "450.00"},
        {"open_item_id": first_open_item_id, "amount": "450.00"},
    ]
    response = client.post(
        "/api/internal/mcp/actions/finance.supplier_payment.prepare/prepare",
        json=payload,
    )
    assert response.status_code == 422
    assert response.json()["detail"]["message"] == (
        "supplier payment allocations require unique open_item_id"
    )


def test_invoice_prepare_enforces_exactly_one_physical_fulfillment_mode(enabled_boundary):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["sales.invoice.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))
    payload = _sales_invoice_payload()
    payload["lines"][0]["dispatch_allocations"] = [
        {
            "dispatch_line_id": str(uuid4()),
            "allocated_base_billed_quantity": "10.000000",
            "allocated_base_free_quantity": "0.000000",
        }
    ]

    response = client.post(
        "/api/internal/mcp/actions/sales.invoice.prepare/prepare",
        json=payload,
    )
    assert response.status_code == 422
    assert response.json()["detail"]["message"] == (
        "lines[0] direct_issue forbids dispatch_allocations"
    )
    assert fake.calls == []

    line = payload["lines"][0]
    line["fulfillment_source"] = "dispatch_allocated"
    line.pop("batch_allocations")
    line["dispatch_allocations"][0]["billed_quantity"] = "10.000000"
    response = client.post(
        "/api/internal/mcp/actions/sales.invoice.prepare/prepare",
        json=payload,
    )
    assert response.status_code == 422
    assert "billed_quantity" in response.text


@pytest.mark.parametrize(
    ("scope", "field", "value"),
    (
        ("header", "supply_type", "inter_state"),
        ("header", "zero_rated_payment_mode", "with_igst"),
        ("header", "tax_charge_mechanism", "reverse_charge"),
        ("line", "tax_code_version_id", "d3000000-0000-7000-8000-000000000099"),
        ("line", "igst_rate", "12.000000"),
    ),
)
def test_adjustment_note_api_rejects_caller_owned_supply_and_tax_fields(
    enabled_boundary, scope, field, value
):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["finance.adjustment_note.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))
    payload = _adjustment_note_payload()
    target = payload if scope == "header" else payload["lines"][0]
    target[field] = value

    response = client.post(
        "/api/internal/mcp/actions/finance.adjustment_note.prepare/prepare",
        json=payload,
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "VALIDATION_FAILED"
    assert fake.calls == []


@pytest.mark.parametrize("fulfillment_source", ["direct_issue", "dispatch_allocated"])
def test_invoice_prepare_accepts_each_reviewed_fulfillment_mode(
    enabled_boundary, fulfillment_source
):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["sales.invoice.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))
    payload = _sales_invoice_payload()
    if fulfillment_source == "dispatch_allocated":
        line = payload["lines"][0]
        line["fulfillment_source"] = "dispatch_allocated"
        line.pop("batch_allocations")
        line["dispatch_allocations"] = [{
            "dispatch_line_id": str(uuid4()),
            "allocated_base_billed_quantity": "10.000000",
            "allocated_base_free_quantity": "0.000000",
        }]
        payload.pop("from_location_id")
        payload.pop("logistics")

    response = client.post(
        "/api/internal/mcp/actions/sales.invoice.prepare/prepare",
        json=payload,
    )

    assert response.status_code == 200, response.text
    assert fake.last_idempotency_key == "sales-invoice:test:0001"
    business_payload = fake.calls[-1][2]
    assert "idempotency_key" not in business_payload
    assert business_payload["tax_charge_mechanism"] == "normal"
    assert business_payload["lines"][0]["fulfillment_source"] == fulfillment_source
    if fulfillment_source == "dispatch_allocated":
        assert "from_location_id" not in business_payload
        assert "logistics" not in business_payload


def test_invoice_prepare_accepts_default_auto_fefo_without_caller_batches(
    enabled_boundary,
):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["sales.invoice.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))
    payload = _sales_invoice_payload()
    payload["lines"][0].pop("batch_allocations")

    response = client.post(
        "/api/internal/mcp/actions/sales.invoice.prepare/prepare",
        json=payload,
    )

    assert response.status_code == 200, response.text
    line = fake.calls[-1][2]["lines"][0]
    assert line["fulfillment_source"] == "direct_issue"
    assert "batch_allocations" not in line
    assert "batch_allocation_mode" not in line


@pytest.mark.parametrize(
    ("mode", "with_batches", "message"),
    (
        ("auto_fefo", True, "auto_fefo forbids caller batch_allocations"),
        ("explicit_fefo", False, "explicit_fefo requires batch_allocations"),
    ),
)
def test_invoice_prepare_rejects_conflicting_batch_allocation_policy(
    enabled_boundary, mode, with_batches, message,
):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["sales.invoice.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))
    payload = _sales_invoice_payload()
    line = payload["lines"][0]
    line["batch_allocation_mode"] = mode
    if not with_batches:
        line.pop("batch_allocations")

    response = client.post(
        "/api/internal/mcp/actions/sales.invoice.prepare/prepare",
        json=payload,
    )

    assert response.status_code == 422
    assert message in response.json()["detail"]["message"]
    assert fake.calls == []


def test_invoice_prepare_fails_closed_for_unreviewed_sez_without_payment(
    enabled_boundary,
):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["sales.invoice.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))
    payload = _sales_invoice_payload()
    payload["zero_rated_payment_mode"] = "without_payment"

    response = client.post(
        "/api/internal/mcp/actions/sales.invoice.prepare/prepare",
        json=payload,
    )

    assert response.status_code == 422
    assert response.json()["detail"]["message"] == (
        "sales invoice SEZ without_payment is unavailable until effective LUT "
        "or bond evidence is reviewed"
    )
    assert fake.calls == []


def test_dispatch_allocated_invoice_forbids_direct_issue_logistics(enabled_boundary):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["sales.invoice.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))
    payload = _sales_invoice_payload()
    line = payload["lines"][0]
    line["fulfillment_source"] = "dispatch_allocated"
    line.pop("batch_allocations")
    line["dispatch_allocations"] = [{
        "dispatch_line_id": str(uuid4()),
        "allocated_base_billed_quantity": "10.000000",
        "allocated_base_free_quantity": "0.000000",
    }]

    response = client.post(
        "/api/internal/mcp/actions/sales.invoice.prepare/prepare",
        json=payload,
    )

    assert response.status_code == 422
    assert response.json()["detail"]["message"] == (
        "dispatch_allocated invoice must not include from_location_id or logistics"
    )
    assert fake.calls == []


@pytest.mark.parametrize("treatment", ["statutory", "commercial_only"])
def test_sales_return_accepts_exact_reviewed_gst_paths(enabled_boundary, treatment):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["sales.return.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))

    response = client.post(
        "/api/internal/mcp/actions/sales.return.prepare/prepare",
        json=_sales_return_payload(treatment=treatment),
    )

    assert response.status_code == 200, response.text
    assert fake.last_idempotency_key == "sales-return:test:0001"
    business_payload = fake.calls[-1][2]
    assert "idempotency_key" not in business_payload
    assert business_payload["gst_tax_treatment"] == treatment


@pytest.mark.parametrize("treatment", ["statutory", "commercial_only"])
def test_purchase_return_accepts_only_exact_invoiced_pilot_paths(
    enabled_boundary, treatment
):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["procurement.purchase_return.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))

    response = client.post(
        "/api/internal/mcp/actions/procurement.purchase_return.prepare/prepare",
        json=_purchase_return_payload(treatment=treatment),
    )

    assert response.status_code == 200, response.text
    assert fake.last_idempotency_key == "purchase-return:test:0001"
    business_payload = fake.calls[-1][2]
    assert "idempotency_key" not in business_payload
    assert business_payload["return_source_kind"] == "invoiced"
    assert business_payload["gst_tax_treatment"] == treatment
    assert business_payload["lines"][0]["supplier_invoice_receipt_allocation_id"]


def test_purchase_return_rejects_portal_mismatch_and_batch_quantity_drift(
    enabled_boundary,
):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["procurement.purchase_return.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))
    commercial = _purchase_return_payload(treatment="commercial_only")
    commercial["supplier_credit_note_portal_line_id"] = str(uuid4())

    response = client.post(
        "/api/internal/mcp/actions/procurement.purchase_return.prepare/prepare",
        json=commercial,
    )
    assert response.status_code == 422
    assert "must not include" in response.json()["detail"]["message"]

    statutory = _purchase_return_payload()
    statutory["lines"][0]["batch_allocation"]["free_quantity"] = "0.000000"
    response = client.post(
        "/api/internal/mcp/actions/procurement.purchase_return.prepare/prepare",
        json=statutory,
    )
    assert response.status_code == 422
    assert "batch allocation must equal returned billed/free quantities" in response.json()["detail"]["message"]
    assert fake.calls == []


def test_sales_return_fails_closed_on_evidence_and_lineage_ambiguity(enabled_boundary):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["sales.return.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))
    payload = _sales_return_payload(treatment="statutory")
    payload.pop("recipient_itc_reversal_evidence_attachment_id")

    response = client.post(
        "/api/internal/mcp/actions/sales.return.prepare/prepare", json=payload
    )
    assert response.status_code == 422
    assert "requires recipient ITC-reversal evidence" in response.text

    payload = _sales_return_payload(treatment="commercial_only")
    payload["recipient_itc_reversal_evidence_attachment_id"] = str(uuid4())
    payload["recipient_itc_reversal_confirmed_at"] = "2026-08-20T10:30:00+05:30"
    response = client.post(
        "/api/internal/mcp/actions/sales.return.prepare/prepare", json=payload
    )
    assert response.status_code == 422
    assert "must not include recipient ITC-reversal evidence" in response.text

    payload = _sales_return_payload(treatment="commercial_only")
    payload["lines"].append(dict(payload["lines"][0]))
    response = client.post(
        "/api/internal/mcp/actions/sales.return.prepare/prepare", json=payload
    )
    assert response.status_code == 422
    assert "repeats original_invoice_line_id" in response.text

    payload = _sales_return_payload(treatment="commercial_only")
    payload["lines"][0]["batch_allocation"]["free_quantity"] = "0.000000"
    response = client.post(
        "/api/internal/mcp/actions/sales.return.prepare/prepare", json=payload
    )
    assert response.status_code == 422
    assert "batch allocation must equal returned billed/free quantities" in response.text
    assert fake.calls == []


def test_purchase_order_prepare_accepts_domestic_normal_charge(enabled_boundary):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["procurement.purchase_order.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))

    response = client.post(
        "/api/internal/mcp/actions/procurement.purchase_order.prepare/prepare",
        json=_purchase_order_payload(),
    )

    assert response.status_code == 200, response.text
    assert fake.last_idempotency_key == "purchase-order:test:0001"
    business_payload = fake.calls[-1][2]
    assert "idempotency_key" not in business_payload
    assert business_payload["tax_charge_mechanism"] == "normal"
    assert business_payload["supplier_account_id"] is not None


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        (
            "zero_rated_payment_mode",
            "with_igst",
            "purchase order SEZ zero-rated modes are unavailable in the domestic pilot",
        ),
        (
            "expected_on",
            "2026-08-19",
            "purchase order expected_on must not precede order_date",
        ),
    ],
)
def test_purchase_order_prepare_rejects_unsupported_legal_or_date_scope(
    enabled_boundary, field, value, message
):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["procurement.purchase_order.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))
    payload = _purchase_order_payload()
    payload[field] = value

    response = client.post(
        "/api/internal/mcp/actions/procurement.purchase_order.prepare/prepare",
        json=payload,
    )

    assert response.status_code == 422
    assert response.json()["detail"]["message"] == message
    assert fake.calls == []


def test_purchase_order_prepare_rejects_reverse_charge_before_service(
    enabled_boundary,
):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["procurement.purchase_order.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))
    payload = _purchase_order_payload()
    payload["tax_charge_mechanism"] = "reverse_charge"

    response = client.post(
        "/api/internal/mcp/actions/procurement.purchase_order.prepare/prepare",
        json=payload,
    )

    assert response.status_code == 422
    assert fake.calls == []


def test_goods_receipt_prepare_accepts_exact_batch_qc_and_mrp_evidence(
    enabled_boundary,
):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["procurement.goods_receipt.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))

    response = client.post(
        "/api/internal/mcp/actions/procurement.goods_receipt.prepare/prepare",
        json=_goods_receipt_payload(),
    )

    assert response.status_code == 200, response.text
    assert fake.last_idempotency_key == "goods-receipt:test:0001"
    business_payload = fake.calls[-1][2]
    assert "idempotency_key" not in business_payload
    batch = business_payload["lines"][0]["batches"][0]
    assert batch["mrp"] == "125.00"
    assert batch["qc_status"] == "partial"
    assert batch["accepted_quantity"] == "8.000000"
    assert batch["rejected_quantity"] == "2.000000"
    assert batch["free_quantity"] == "1.000000"


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        (
            {"accepted_quantity": "7.000000"},
            "accepted_quantity plus rejected_quantity must equal received_quantity",
        ),
        (
            {"qc_notes": None},
            "partial QC requires accepted and rejected quantities plus qc_notes",
        ),
        (
            {
                "accepted_quantity": "0.000000",
                "rejected_quantity": "10.000000",
                "free_quantity": "0.000000",
            },
            "fully rejected receipt is unavailable in the pilot",
        ),
        (
            {"expires_on": "2026-08-20"},
            "expires_on must be after received_at",
        ),
        (
            {"manufactured_on": "2026-08-21"},
            "manufactured_on must not follow received_at",
        ),
    ],
)
def test_goods_receipt_prepare_rejects_invalid_quantity_qc_or_dates(
    enabled_boundary, mutation, message
):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["procurement.goods_receipt.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))
    payload = _goods_receipt_payload()
    payload["lines"][0]["batches"][0].update(mutation)

    response = client.post(
        "/api/internal/mcp/actions/procurement.goods_receipt.prepare/prepare",
        json=payload,
    )

    assert response.status_code == 422
    assert message in response.json()["detail"]["message"]
    assert fake.calls == []


def test_goods_receipt_prepare_requires_paired_challan_facts(enabled_boundary):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["procurement.goods_receipt.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))
    payload = _goods_receipt_payload()
    payload.pop("supplier_challan_date")

    response = client.post(
        "/api/internal/mcp/actions/procurement.goods_receipt.prepare/prepare",
        json=payload,
    )

    assert response.status_code == 422
    assert response.json()["detail"]["message"] == (
        "goods receipt supplier challan number and date must be supplied together"
    )
    assert fake.calls == []


def test_goods_receipt_prepare_requires_explicit_received_timezone(enabled_boundary):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["procurement.goods_receipt.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))
    payload = _goods_receipt_payload()
    payload["received_at"] = "2026-08-20T10:30:00"

    response = client.post(
        "/api/internal/mcp/actions/procurement.goods_receipt.prepare/prepare",
        json=payload,
    )

    assert response.status_code == 422
    assert response.json()["detail"]["message"] == (
        "goods receipt received_at must include an explicit timezone offset"
    )
    assert fake.calls == []


def test_supplier_invoice_prepare_accepts_exact_attested_receipt_match(
    enabled_boundary,
):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["procurement.supplier_invoice.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))
    payload = _supplier_invoice_payload()

    response = client.post(
        "/api/internal/mcp/actions/procurement.supplier_invoice.prepare/prepare",
        json=payload,
    )

    assert response.status_code == 200, response.text
    assert fake.last_idempotency_key == "supplier-invoice:test:0001"
    business_payload = fake.calls[-1][2]
    assert "idempotency_key" not in business_payload
    assert business_payload["goods_receipt_ids"]
    assert business_payload["lines"][0]["itc_eligibility_basis"] == (
        "taxable_resale_not_blocked_under_section_17"
    )
    assert business_payload["expense_charge_lines"][0][
        "charge_inventory_cost_treatment"
    ] == "expense"


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        ("duplicate_grn", "goods_receipt_ids must be a unique exact GRN set"),
        (
            "duplicate_receipt_line",
            "one goods_receipt_line_id may appear only once in a supplier invoice",
        ),
        (
            "received_before_invoice",
            "supplier invoice received_date must not precede invoice_date",
        ),
    ],
)
def test_supplier_invoice_prepare_rejects_ambiguous_or_invalid_match(
    enabled_boundary, mutation, message
):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["procurement.supplier_invoice.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))
    payload = _supplier_invoice_payload()
    if mutation == "duplicate_grn":
        payload["goods_receipt_ids"].append(payload["goods_receipt_ids"][0])
    elif mutation == "duplicate_receipt_line":
        payload["lines"].append(dict(payload["lines"][0]))
    else:
        payload["received_date"] = "2026-08-19"

    response = client.post(
        "/api/internal/mcp/actions/procurement.supplier_invoice.prepare/prepare",
        json=payload,
    )

    assert response.status_code == 422
    assert response.json()["detail"]["message"] == message
    assert fake.calls == []


def test_supplier_invoice_schema_rejects_capitalized_or_generic_charge(
    enabled_boundary,
):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["procurement.supplier_invoice.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))
    payload = _supplier_invoice_payload()
    payload["expense_charge_lines"][0][
        "charge_inventory_cost_treatment"
    ] = "capitalize"

    response = client.post(
        "/api/internal/mcp/actions/procurement.supplier_invoice.prepare/prepare",
        json=payload,
    )
    assert response.status_code == 422
    assert fake.calls == []

    payload = _supplier_invoice_payload()
    payload["expense_charge_lines"][0]["expense_charge_code"] = "other"
    response = client.post(
        "/api/internal/mcp/actions/procurement.supplier_invoice.prepare/prepare",
        json=payload,
    )
    assert response.status_code == 422
    assert fake.calls == []


def test_organization_grant_token_remains_bound_to_issuer_branches(enabled_boundary):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["sales.order.prepare"]
    context = _context(policy.operation_key, policy.permission)
    holder = {
        "value": ActionContext(
            **{
                **context.__dict__,
                "organization_scope": True,
            }
        )
    }
    client = TestClient(_app(fake, holder))
    payload = _sales_order_payload()
    payload["branch_id"] = str(uuid4())

    response = client.post(
        "/api/internal/mcp/actions/sales.order.prepare/prepare",
        json=payload,
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "BRANCH_DENIED"
    assert fake.calls == []

    payload = _sales_order_payload()
    payload["branch_id"] = str(uuid4())
    response = client.post(
        "/api/internal/mcp/actions/sales.order.prepare/prepare",
        json=payload,
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "BRANCH_DENIED"
    assert fake.calls == []


def test_approve_execute_and_status_have_narrow_immutable_inputs(enabled_boundary):
    fake = FakeOperatorActionService()
    holder = {
        "value": _context(
            "automation.command.approve", "automation.command.approve"
        )
    }
    client = TestClient(_app(fake, holder))

    review = client.get(f"/api/internal/mcp/commands/{COMMAND_ID}/review")
    assert review.status_code == 200, review.text
    assert review.json()["preview_canonical_json"].encode() == (
        b'{"financial_impact":[{"amount":"168.00"}]}'
    )
    assert review.json()["preview_hash"] == PREVIEW_HASH

    approval = client.post(
        f"/api/internal/mcp/commands/{COMMAND_ID}/approve",
        json={
            "preview_hash": PREVIEW_HASH,
            "approval_intent": "approve",
            "idempotency_key": "approval:test:0001",
        },
    )
    assert approval.status_code == 200, approval.text
    assert approval.json()["status"] == "approved"

    holder["value"] = _context(
        "automation.command.execute", "automation.command.execute"
    )
    forbidden = client.post(
        f"/api/internal/mcp/commands/{COMMAND_ID}/execute",
        json={
            "preview_hash": PREVIEW_HASH,
            "idempotency_key": "execution:test:0001",
            "lines": [],
        },
    )
    assert forbidden.status_code == 422
    assert not any(call[0] == "execute" for call in fake.calls)

    execution = client.post(
        f"/api/internal/mcp/commands/{COMMAND_ID}/execute",
        json={
            "preview_hash": PREVIEW_HASH,
            "idempotency_key": "execution:test:0001",
        },
    )
    assert execution.status_code == 200, execution.text
    assert execution.json()["status"] == "executed"

    holder["value"] = _context(
        "automation.command.status.get", "automation.command.view"
    )
    status = client.get(f"/api/internal/mcp/commands/{COMMAND_ID}")
    assert status.status_code == 200, status.text
    assert status.json()["command_request_id"] == str(COMMAND_ID)


def test_shared_delegation_is_bound_to_one_command_id(enabled_boundary):
    fake = FakeOperatorActionService()
    holder = {
        "value": _context(
            "automation.command.execute", "automation.command.execute"
        )
    }
    client = TestClient(_app(fake, holder))

    response = client.post(
        f"/api/internal/mcp/commands/{uuid4()}/execute",
        json={
            "preview_hash": PREVIEW_HASH,
            "idempotency_key": "execution:test:bound",
        },
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "SCOPE_DENIED"
    assert fake.calls == []


def test_routes_are_hidden_from_public_openapi_and_keep_auth_dependency():
    fake = FakeOperatorActionService()
    holder = {
        "value": _context(
            "automation.command.status.get", "automation.command.view"
        )
    }
    application = _app(fake, holder)
    assert not any("/internal/mcp/" in path for path in application.openapi()["paths"])

    action_routes = [
        route
        for (path, _method), routes in _route_index(application).items()
        if path.startswith("/api/internal/mcp/")
        for route in routes
    ]
    assert len(action_routes) == 16
    assert all(route.include_in_schema is False for route in action_routes)
    assert all(
        mcp_actions.get_action_context
        in {dependency.call for dependency in route.dependant.dependencies}
        for route in action_routes
    )


def test_inventory_adjustment_prepare_accepts_only_typed_signed_cycle_count_facts(enabled_boundary):
    fake = FakeOperatorActionService()
    policy = ACTION_POLICIES["inventory.adjustment.prepare"]
    holder = {"value": _context(policy.operation_key, policy.permission)}
    client = TestClient(_app(fake, holder))
    counted_at = datetime.now(timezone.utc)
    payload = {
        "idempotency_key": "inventory-count:test:0001",
        "branch_id": str(BRANCH_ID),
        "adjustment_date": counted_at.astimezone(
            timezone(timedelta(hours=5, minutes=30))
        ).date().isoformat(),
        "counted_at": counted_at.isoformat(),
        "counted_by_membership_id": str(uuid4()),
        "location_id": str(uuid4()),
        "reason_code": "cycle_count",
        "evidence_attachment_id": str(uuid4()),
        "lines": [{
            "product_id": str(uuid4()),
            "uom_conversion_id": str(uuid4()),
            "batch_counts": [{
                "batch_id": str(uuid4()),
                "counted_quantity": "12.000000",
                "stock_balance_row_version": 7,
            }],
        }],
    }

    response = client.post(
        "/api/internal/mcp/actions/inventory.adjustment.prepare/prepare",
        json=payload,
        headers={"Idempotency-Key": payload["idempotency_key"]},
    )
    assert response.status_code == 200
    assert fake.calls[-1][2]["reason_code"] == "cycle_count"
    assert fake.calls[-1][2]["lines"][0]["batch_counts"][0]["counted_quantity"] == "12.000000"
    assert "idempotency_key" not in fake.calls[-1][2]

    accepted_call_count = len(fake.calls)
    for invalid_quantity in (
        12,
        "9007199254740993",
        "12.0000001",
        "-1",
        "NaN",
    ):
        invalid_payload = {
            **payload,
            "lines": [{
                **payload["lines"][0],
                "batch_counts": [{
                    **payload["lines"][0]["batch_counts"][0],
                    "counted_quantity": invalid_quantity,
                }],
            }],
        }
        invalid_quantity_response = client.post(
            "/api/internal/mcp/actions/inventory.adjustment.prepare/prepare",
            json=invalid_payload,
            headers={"Idempotency-Key": payload["idempotency_key"]},
        )
        assert invalid_quantity_response.status_code == 422
        assert len(fake.calls) == accepted_call_count

    duplicate_batch_payload = {
        **payload,
        "lines": [{
            **payload["lines"][0],
            "batch_counts": payload["lines"][0]["batch_counts"] * 2,
        }],
    }
    duplicate_batch_response = client.post(
        "/api/internal/mcp/actions/inventory.adjustment.prepare/prepare",
        json=duplicate_batch_payload,
        headers={"Idempotency-Key": payload["idempotency_key"]},
    )
    assert duplicate_batch_response.status_code == 422
    assert len(fake.calls) == accepted_call_count

    payload["direction"] = "decrease"
    invalid = client.post(
        "/api/internal/mcp/actions/inventory.adjustment.prepare/prepare",
        json=payload,
        headers={"Idempotency-Key": payload["idempotency_key"]},
    )
    assert invalid.status_code == 422


def test_service_and_operator_delegation_are_both_required(monkeypatch):
    monkeypatch.setenv("MCP_INTERNAL_SERVICE_TOKEN", "s" * 32)
    claims = {
        "operator_delegated": True,
        "token_profile": "canonical_operator_delegation_v1",
        "operator_operation": "sales.order.prepare",
        "operator_permission": "sales.order.create",
        "mcp_client_id": "client-1",
        "branch_ids": [str(BRANCH_ID)],
        "auth_user_id": str(uuid4()),
        "user_id": str(uuid4()),
        "org_id": str(uuid4()),
        "membership_id": str(uuid4()),
        "agent_grant_id": str(uuid4()),
    }
    monkeypatch.setattr(mcp_actions, "decode_jwt", lambda *_args, **_kwargs: claims)

    context = mcp_actions.get_action_context(
        "Bearer delegated-token",
        HTTPAuthorizationCredentials(scheme="Bearer", credentials="s" * 32),
        object(),
    )
    assert context.operation_key == "sales.order.prepare"
    assert context.branch_ids == (BRANCH_ID,)

    with pytest.raises(Exception) as error:
        mcp_actions.get_action_context(
            "Bearer delegated-token",
            HTTPAuthorizationCredentials(scheme="Bearer", credentials="wrong"),
            object(),
        )
    assert getattr(error.value, "status_code", None) == 401


def test_public_operator_delegation_is_blocked_while_session_authority_is_closed(
    monkeypatch,
):
    monkeypatch.setenv("MCP_INTERNAL_SERVICE_TOKEN", "s" * 32)
    monkeypatch.setattr(
        mcp_actions,
        "decode_jwt",
        lambda *_args, **_kwargs: {
            "operator_delegated": True,
            "token_profile": mcp_actions.ACTION_TOKEN_PROFILE,
        },
    )
    monkeypatch.setattr(
        mcp_actions,
        "require_canonical_session_authority",
        lambda _db: (_ for _ in ()).throw(
            HTTPException(status_code=503, detail={"error": "erp_maintenance"})
        ),
    )

    with pytest.raises(HTTPException) as blocked:
        mcp_actions.get_action_context(
            "Bearer stale-token",
            HTTPAuthorizationCredentials(scheme="Bearer", credentials="s" * 32),
            object(),
        )
    assert blocked.value.status_code == 503


@pytest.mark.parametrize(
    ("provider", "sha_environment"),
    (("railway", "RAILWAY_GIT_COMMIT_SHA"), ("render", "RENDER_GIT_COMMIT")),
)
def test_provisioning_operator_delegation_is_provider_and_exact_sha_bound(
    monkeypatch, provider, sha_environment
):
    deployed_sha = "a" * 40
    monkeypatch.setenv("MCP_INTERNAL_SERVICE_TOKEN", "s" * 32)
    monkeypatch.setenv("CANONICAL_APPLICATION_PROVIDER", provider)
    monkeypatch.setenv(sha_environment, deployed_sha)
    claims = {
        "operator_delegated": True,
        "token_profile": mcp_actions.PROVISIONING_ACTION_TOKEN_PROFILE,
        "provisioning_provider": provider,
        "provisioning_deployment_sha": deployed_sha,
        "provisioning_run_id": "32984377332",
        "provisioning_run_attempt": "1",
        "operator_operation": "sales.order.prepare",
        "operator_permission": "sales.order.create",
        "mcp_client_id": "client-1",
        "branch_ids": [str(BRANCH_ID)],
        "auth_user_id": str(uuid4()),
        "user_id": str(uuid4()),
        "org_id": str(uuid4()),
        "membership_id": str(uuid4()),
        "agent_grant_id": str(uuid4()),
    }
    monkeypatch.setattr(mcp_actions, "decode_jwt", lambda *_args, **_kwargs: claims)
    provisioning_checks = []
    monkeypatch.setattr(
        mcp_actions,
        "require_canonical_provisioning_authority",
        lambda db: provisioning_checks.append(db),
    )

    database = object()
    context = mcp_actions.get_action_context(
        "Bearer provisioning-token",
        HTTPAuthorizationCredentials(scheme="Bearer", credentials="s" * 32),
        database,
    )
    assert context.operation_key == "sales.order.prepare"
    assert provisioning_checks == [database]

    claims["provisioning_deployment_sha"] = "b" * 40
    with pytest.raises(HTTPException) as blocked:
        mcp_actions.get_action_context(
            "Bearer provisioning-token",
            HTTPAuthorizationCredentials(scheme="Bearer", credentials="s" * 32),
            database,
        )
    assert blocked.value.status_code == 401


def test_default_readiness_fails_closed_with_explicit_blockers(monkeypatch):
    fake = FakeOperatorActionService(deployment_verified=False)
    holder = {
        "value": _context(
            "automation.command.status.get", "automation.command.view"
        )
    }
    client = TestClient(_app(fake, holder))
    response = client.get("/api/internal/mcp/actions/ready")
    assert response.status_code == 503
    assert "baseline deployment is not verified" in response.json()["detail"]["message"]


def test_action_boundary_does_not_import_legacy_services_or_sql():
    root = Path(__file__).resolve().parents[2]
    route_source = (root / "app/api/routes/internal/mcp_actions.py").read_text(
        encoding="utf-8"
    )
    domain_source = (root / "app/domain/operator_actions/service.py").read_text(
        encoding="utf-8"
    )
    source = f"{route_source}\n{domain_source}"
    assert "api.services" not in source
    # The transport obtains a scoped SQLAlchemy Session through ``get_db`` for
    # authoritative readbacks.  Persistence and SQL remain behind the domain
    # service boundary; the route must not embed database statements itself.
    assert "sqlalchemy" not in domain_source
    assert "SELECT " not in source
    assert "INSERT " not in source
