import json
import inspect
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from app.api.routes.calculations import (
    preview_invoice_totals,
    preview_sales_order_totals,
)
from app.api.schemas.calculations import (
    InvoiceCalculationRequest,
    SalesOrderCalculationRequest,
)
from app.main import app


_ORG_UUID = "d3000000-0000-7000-8000-000000000001"
_AUTH_UUID = "d3000000-0000-7000-8000-000000000002"
_UUID = "d3000000-0000-7000-8000-000000000015"
_BRANCH_UUID = "d3000000-0000-7000-8000-000000000016"
_TAX_UUID = "d3000000-0000-7000-8000-000000000017"
_RELEASE_UUID = "d3000000-0000-7000-8000-000000000018"
_PARTY_UUID = "d3000000-0000-7000-8000-000000000019"
_ADDRESS_UUID = "d3000000-0000-7000-8000-000000000020"
_USER = {"org_id": _ORG_UUID, "auth_user_id": _AUTH_UUID}


def test_database_backed_calculation_routes_run_in_fastapi_worker_pool():
    assert not inspect.iscoroutinefunction(preview_invoice_totals)
    assert not inspect.iscoroutinefunction(preview_sales_order_totals)


class _Mappings:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class _Result:
    def __init__(self, rows=()):
        self.rows = rows

    def mappings(self):
        return _Mappings(self.rows)


class _ActivationSession:
    def __init__(self):
        self.calls = []

    def execute(self, statement, params):
        self.calls.append((str(statement), params))
        return _Result()


class _ForcedRlsSalesSession(_ActivationSession):
    """Expose canonical rows only after the database actor is activated."""

    def __init__(self):
        super().__init__()
        self.actor_active = False

    def execute(self, statement, params):
        sql = str(statement)
        self.calls.append((sql, params))
        if "erp_security.activate_context" in sql:
            self.actor_active = True
            return _Result()
        if not self.actor_active:
            return _Result()
        if "FROM core.branches" in sql:
            return _Result([{
                "branch_state_code": "27",
                "customer_party_id": UUID(_PARTY_UUID),
            }])
        if "FROM parties.addresses" in sql:
            return _Result([{
                "id": UUID(_ADDRESS_UUID),
                "address_kind": "billing",
                "state_code": "27",
                "country_code": "IN",
            }])
        if "FROM parties.tax_registrations" in sql:
            return _Result([])
        if "WITH requested AS" in sql:
            return _Result([{
                "line_number": 1,
                "product_id": UUID(_UUID),
                "hsn_code": "481910",
                "tax_code_version_id": UUID(_TAX_UUID),
                "tax_release_id": UUID(_RELEASE_UUID),
                "version_number": 1,
                "effective_from": date(2026, 4, 1),
                "effective_to": None,
                "taxability": "taxable",
                "cgst_rate": Decimal("6.00"),
                "sgst_rate": Decimal("6.00"),
                "igst_rate": Decimal("12.00"),
                "cess_rate": Decimal("0.00"),
                "ruleset_version": "gst-2026.04",
            }])
        raise AssertionError(sql)


def _json_body(response):
    return json.loads(response.model_dump_json(exclude_none=True))


def _sales_line(**overrides):
    return {
        "product_id": _UUID,
        "quantity": "1.000001",
        "free_quantity": "0",
        "unit_price": "0.10",
        "discount_percent": "0",
        **overrides,
    }


def _authority(line_count):
    line = SimpleNamespace(
        hsn_code="481910",
        gst_rate=Decimal("18"),
        taxability="taxable",
        tax_code_version_id=uuid4(),
        tax_release_id=uuid4(),
        tax_version_number=1,
        tax_effective_from=__import__("datetime").date(2026, 4, 1),
        tax_effective_to=None,
        tax_ruleset_version="gst-2026.04",
    )
    return SimpleNamespace(gst_type="IGST", lines=tuple(line for _ in range(line_count)))


def test_all_preview_response_decimal_fields_are_openapi_string_only():
    schema = app.openapi()["components"]["schemas"]
    models = {
        "CanonicalSalesCalculationPreviewLine": {
            "product_id", "batch_id", "free_supply_tax_treatment", "hsn_code",
            "taxability", "tax_code_version_id", "tax_release_id",
            "tax_version_number", "tax_effective_from", "tax_effective_to",
            "tax_ruleset_version",
        },
        "InvoiceCalculationPreviewTotals": set(),
    }

    for model_name, non_decimal_fields in models.items():
        for field_name, field_schema in schema[model_name]["properties"].items():
            if field_name in non_decimal_fields:
                continue
            candidates = field_schema.get("anyOf", [field_schema])
            non_null = [item for item in candidates if item.get("type") != "null"]
            assert non_null and all(item.get("type") == "string" for item in non_null), (
                model_name, field_name, field_schema
            )
            assert all(item.get("type") != "number" for item in non_null)

    for endpoint, response_name in {
        "invoice": "InvoiceCalculationPreviewResponse",
        "sales-order": "InvoiceCalculationPreviewResponse",
    }.items():
        response_schema = app.openapi()["paths"][f"/api/calculations/{endpoint}"][
            "post"
        ]["responses"]["200"]["content"]["application/json"]["schema"]
        assert response_schema["$ref"].endswith(f"/{response_name}")


def test_calculation_routes_use_canonical_actor_activation_not_legacy_tenant_wrapper():
    from app.api.routes import calculations

    source = inspect.getsource(calculations)
    assert "erp_security.activate_context(:auth_user_id, :org_id)" in source
    assert "TenantAwareSession" not in source
    assert "get_tenant_aware_db" not in source
    assert "with_tenant_context" not in source


@pytest.mark.asyncio
async def test_invoice_preview_activates_actor_before_forced_rls_tax_reads():
    session = _ForcedRlsSalesSession()
    invoice = InvoiceCalculationRequest.model_validate({
        "branch_id": _BRANCH_UUID,
        "customer_id": _UUID,
        "document_date": "2026-08-27",
        "items": [{
            **_sales_line(
                quantity="1.125000",
                free_quantity="1.000000",
                unit_price="84.1250",
            ),
            "free_supply_tax_treatment": "excluded_from_taxable_value",
        }],
        "freight_charges": "0.00",
        "discount_type": "percentage",
        "discount_percent": "0.000000",
        "discount_amount": "0.00",
    })

    response = preview_invoice_totals(invoice, _USER, session)
    body = _json_body(response)

    activation_sql, activation_params = session.calls[0]
    assert "erp_security.activate_context" in activation_sql
    assert activation_params["auth_user_id"] == UUID(_AUTH_UUID)
    assert activation_params["org_id"] == UUID(_ORG_UUID)
    UUID(activation_params["request_id"])
    assert "FROM core.branches" in session.calls[1][0]
    assert body["gst_type"] == "CGST/SGST"
    assert body["line_items"][0]["gst_percent"] == "12.00"
    assert body["line_items"][0]["free_supply_tax_treatment"] == (
        "excluded_from_taxable_value"
    )


@pytest.mark.asyncio
async def test_invoice_and_sales_order_wire_preserve_exact_decimal_inputs(monkeypatch):
    lines = [
        _sales_line(unit_price="0.10"),
        _sales_line(quantity="1", unit_price="0.20"),
        _sales_line(quantity="9007199254740993.000001", unit_price="1"),
    ]
    monkeypatch.setattr(
        "app.api.routes.calculations.resolve_sales_tax_authority",
        lambda *args, **kwargs: _authority(len(lines)),
    )
    invoice = InvoiceCalculationRequest.model_validate({
        "branch_id": _BRANCH_UUID,
        "customer_id": _UUID,
        "document_date": "2026-08-25",
        "items": lines,
    })
    invoice_db = _ActivationSession()
    invoice_response = preview_invoice_totals(invoice, _USER, invoice_db)
    invoice_body = _json_body(invoice_response)

    assert invoice_body["line_items"][0]["quantity"] == "1.000001"
    assert invoice_body["line_items"][0]["subtotal"] == "0.10"
    assert invoice_body["line_items"][1]["subtotal"] == "0.20"
    assert invoice_body["line_items"][2]["quantity"] == "9007199254740993.000001"
    assert invoice_body["totals"]["subtotal_amount"] == "9007199254740993.30"
    assert isinstance(invoice_body["totals"]["subtotal_amount"], str)
    assert "erp_security.activate_context" in invoice_db.calls[0][0]

    order = SalesOrderCalculationRequest.model_validate({
        "branch_id": _BRANCH_UUID,
        "customer_id": _UUID,
        "order_date": "2026-08-25",
        "items": lines,
    })
    order_db = _ActivationSession()
    order_response = preview_sales_order_totals(order, _USER, order_db)
    order_body = _json_body(order_response)
    assert order_body["line_items"][2]["quantity"] == "9007199254740993.000001"
    assert order_body["totals"]["subtotal_amount"] == "9007199254740993.30"
    assert "erp_security.activate_context" in order_db.calls[0][0]
