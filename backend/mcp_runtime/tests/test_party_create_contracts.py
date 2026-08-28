from __future__ import annotations

import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

from aasopharma_mcp.operations import MASTER_CREATE_SCHEMAS


def test_runtime_loads_the_generated_party_create_contracts_exactly() -> None:
    generated = json.loads(
        (
            Path(__file__).parents[1]
            / "aasopharma_mcp/party_create_contracts.json"
        ).read_text(encoding="utf-8")
    )
    assert MASTER_CREATE_SCHEMAS["erp_customer_create"] == generated[
        "erp_customer_create"
    ]
    assert MASTER_CREATE_SCHEMAS["erp_supplier_create"] == generated[
        "erp_supplier_create"
    ]


def test_runtime_party_contract_allows_explicit_optional_skip_but_not_extra_data() -> None:
    schema = MASTER_CREATE_SCHEMAS["erp_supplier_create"]
    proposed = {
        "supplier_name": "Asha Supply",
        "primary_phone": None,
        "primary_email": None,
        "contact_person": None,
        "address_line1": None,
        "address_line2": None,
        "city": None,
        "state_code": None,
        "pincode": None,
        "gst_number": None,
        "pan_number": None,
        "payment_days": 30,
        "idempotency_key": "supplier-create-runtime-0001",
    }
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    assert list(validator.iter_errors(proposed)) == []
    assert list(validator.iter_errors({**proposed, "bank_account": "unsupported"}))
