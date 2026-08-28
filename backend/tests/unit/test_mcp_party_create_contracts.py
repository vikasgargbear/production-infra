from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import HTTPException
from jsonschema import Draft202012Validator, FormatChecker

from app.api.routes.internal import mcp_canonical_reads as reads
from app.api.routes.internal.mcp_canonical_reads import CanonicalDelegation
from app.api.routes.internal.mcp_contract import CANONICAL_READ_POLICIES
from app.api.schemas.master.customer import CanonicalCustomerCreate
from app.api.schemas.master.supplier import CanonicalSupplierCreate
from scripts.generate_mcp_party_create_contracts import build_contracts


ROOT = Path(__file__).resolve().parents[3]
CONTRACT_PATH = (
    ROOT / "backend/mcp_runtime/aasopharma_mcp/party_create_contracts.json"
)


class _MappedResult:
    def __init__(self, row):
        self.row = row

    def mappings(self):
        return self

    def one_or_none(self):
        return self.row


class _Database:
    def __init__(self, row):
        self.row = row
        self.calls = []

    def execute(self, statement, params=None):
        self.calls.append((str(statement), params or {}))
        return _MappedResult(self.row)


def _context(operation_key: str) -> CanonicalDelegation:
    return CanonicalDelegation(
        auth_user_id=uuid4(),
        user_id=uuid4(),
        organization_id=uuid4(),
        membership_id=uuid4(),
        agent_grant_id=uuid4(),
        client_id="party-contract-test",
        policy=CANONICAL_READ_POLICIES[operation_key],
        branch_id=None,
        allow_sensitive_read=True,
    )


def _contract() -> dict:
    return json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))


def test_published_party_create_contract_is_generated_from_canonical_models() -> None:
    published = _contract()
    assert published == build_contracts()
    assert set(published["erp_customer_create"]["properties"]) == {
        *CanonicalCustomerCreate.model_fields,
        "idempotency_key",
    }
    assert set(published["erp_supplier_create"]["properties"]) == {
        *CanonicalSupplierCreate.model_fields,
        "idempotency_key",
    }
    assert set(published["erp_customer_create"]["required"]) == {
        name
        for name, field in CanonicalCustomerCreate.model_fields.items()
        if field.is_required()
    } | {"idempotency_key"}
    assert set(published["erp_supplier_create"]["required"]) == {
        name
        for name, field in CanonicalSupplierCreate.model_fields.items()
        if field.is_required()
    } | {"idempotency_key"}


def test_generated_party_contract_accepts_explicitly_skipped_optional_facts() -> None:
    customer = {
        "customer_name": "Asha Medical",
        "customer_type": "organization",
        "primary_phone": "9876543210",
        "primary_email": None,
        "contact_person_name": None,
        "address_line1": None,
        "address_line2": None,
        "city": None,
        "state_code": None,
        "pincode": None,
        "gst_number": None,
        "pan_number": None,
        "credit_limit": "1000.00",
        "credit_days": 30,
        "idempotency_key": "customer-create-test-0001",
    }
    errors = list(
        Draft202012Validator(
            _contract()["erp_customer_create"], format_checker=FormatChecker()
        ).iter_errors(customer)
    )
    assert errors == []
    CanonicalCustomerCreate.model_validate(
        {key: value for key, value in customer.items() if key != "idempotency_key"}
    )


@pytest.mark.parametrize(
    ("tool_name", "payload"),
    (
        (
            "erp_customer_create",
            {
                "customer_name": "Asha Medical",
                "customer_type": "organization",
                "primary_phone": "9876543210",
                "credit_limit": "0",
                "credit_days": 0,
                "idempotency_key": "customer-create-test-0002",
                "gst_number": "invalid",
            },
        ),
        (
            "erp_supplier_create",
            {
                "supplier_name": "Asha Supply",
                "payment_days": 30,
                "idempotency_key": "supplier-create-test-0001",
                "unexpected_bank_account": "123",
            },
        ),
    ),
)
def test_generated_party_contract_rejects_invalid_or_out_of_scope_facts(
    tool_name: str, payload: dict
) -> None:
    errors = list(
        Draft202012Validator(
            _contract()[tool_name], format_checker=FormatChecker()
        ).iter_errors(payload)
    )
    assert errors


def test_customer_exact_readback_is_tenant_scoped_and_typed() -> None:
    customer_id, party_id = uuid4(), uuid4()
    database = _Database(
        {
            "customer_account_id": customer_id,
            "party_id": party_id,
            "customer_code": "CUST-000001",
            "customer_name": "Asha Medical",
            "customer_type": "organization",
            "primary_phone": "9876543210",
            "primary_email": "owner@example.com",
            "contact_person_name": "Asha",
            "address_line1": "1 Market Road",
            "address_line2": None,
            "city": "Mumbai",
            "state_code": "27",
            "pincode": "400001",
            "gst_number": "27AAPFU0939F1ZV",
            "pan_number": "AAPFU0939F",
            "credit_limit": Decimal("1000.00"),
            "credit_days": 30,
            "account_status": "active",
            "party_status": "active",
            "account_row_version": 1,
            "party_row_version": 2,
        }
    )
    context = _context("parties.customers.get")

    result = reads.canonical_customer_get(customer_id, context, database)

    assert result.customer_account_id == customer_id
    assert result.model_dump_json().find('"credit_limit":"1000.00"') > 0
    assert database.calls[0][1] == {
        "org_id": context.organization_id,
        "customer_account_id": customer_id,
    }
    assert "customer.org_id=:org_id" in database.calls[0][0]


def test_supplier_exact_readback_returns_404_without_cross_tenant_fallback() -> None:
    database = _Database(None)
    supplier_id = uuid4()

    with pytest.raises(HTTPException) as missing:
        reads.canonical_supplier_get(
            supplier_id, _context("parties.suppliers.get"), database
        )

    assert missing.value.status_code == 404
    assert database.calls[0][1]["supplier_account_id"] == supplier_id
    assert "supplier.org_id=:org_id" in database.calls[0][0]
