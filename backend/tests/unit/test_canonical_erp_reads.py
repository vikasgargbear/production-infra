import inspect
import json
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.routing import APIRoute
from pydantic import ValidationError

from app.api.routes import canonical_erp_reads, canonical_inventory_reads
from app.core.utils import schema_validator
from app.main import app


def _effective_route_leaves(routes):
    for route in routes:
        effective_contexts = getattr(route, "effective_route_contexts", None)
        if callable(effective_contexts):
            yield from effective_contexts()
        else:
            yield route


CRITICAL_UI_READS = {
    "/api/canonical/business-context",
    "/api/products",
    "/api/products/{product_id}/batches",
    "/api/customers",
    "/api/suppliers",
    "/api/employees",
    "/api/invoices/",
    "/api/sales-orders/",
    "/api/challan/",
    "/api/purchases/",
    "/api/supplier-invoices/",
    "/api/supplier-invoices/returnable/",
    "/api/purchase-returns/supplier-invoice/{invoice_id:uuid}/returnable-items",
    "/api/grn/",
    "/api/gst/dashboard",
    "/api/ledger/aging",
    "/api/collection-center/collection/aging-data",
    "/api/dashboard/stats",
    "/api/settings/features",
}


def test_business_context_uses_server_clock_in_organization_timezone(monkeypatch) -> None:
    org_id = uuid4()
    captured = {}
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: org_id)

    def fake_rows(_db, sql, params):
        captured["sql"] = sql
        captured["params"] = params
        return [{
            "organization_id": org_id,
            "organization_timezone": "Asia/Kolkata",
            "business_date": date(2026, 8, 25),
        }]

    monkeypatch.setattr(canonical_erp_reads, "_rows", fake_rows)
    result = canonical_erp_reads.canonical_business_context(user={}, db=object())

    assert result.business_date == date(2026, 8, 25)
    assert result.organization_timezone == "Asia/Kolkata"
    assert result.document_policy.default_rounding_policy == "none"
    assert result.document_policy.default_zero_rated_payment_mode == "not_applicable"
    assert result.document_policy.default_tax_charge_mechanism == "normal"
    assert result.document_policy.default_price_basis == "tax_exclusive"
    assert [mode.transport_mode for mode in result.document_policy.logistics_modes] == ["in_person"]
    assert "transaction_timestamp() AT TIME ZONE organization.timezone" in captured["sql"]
    assert captured["params"] == {"org_id": org_id}


def test_business_context_fails_closed_without_one_active_organization(monkeypatch) -> None:
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: uuid4())
    monkeypatch.setattr(canonical_erp_reads, "_rows", lambda *_args, **_kwargs: [])

    with pytest.raises(HTTPException) as exc:
        canonical_erp_reads.canonical_business_context(user={}, db=object())

    assert exc.value.status_code == 503


def test_canonical_router_covers_reads_and_bounded_master_writes() -> None:
    routes = [route for route in canonical_erp_reads.router.routes if isinstance(route, APIRoute)]
    assert {route.path for route in routes} >= {path.removeprefix("/api") for path in CRITICAL_UI_READS}
    writes = [route for route in routes if not route.methods <= {"GET", "HEAD"}]
    assert [(route.path, route.methods) for route in writes] == [
        ("/products/", {"POST"}),
        ("/products/{product_id}", {"PUT"}),
        ("/products/{product_id}", {"DELETE"}),
        ("/customers/", {"POST"}),
        ("/suppliers/", {"POST"}),
        ("/customers/{customer_id:uuid}/addresses/", {"POST"}),
        ("/customers/{customer_id:uuid}/addresses/{address_id:uuid}", {"PUT"}),
    ]


def test_sales_order_import_projects_its_true_source_kind() -> None:
    source = inspect.getsource(canonical_erp_reads.canonical_sales_order_compatibility_detail)
    assert "'source_document_kind', 'sales_order'" in source
    assert "'source_document_kind', 'delivery_challan'" not in source


def test_canonical_routes_precede_legacy_compatibility_routes() -> None:
    # FastAPI 0.137+ preserves included routers instead of flattening copies of
    # their APIRoutes.  Its effective route contexts expose the fully-prefixed
    # request path while older supported versions still expose APIRoute objects.
    routes = []
    for route in app.routes:
        effective_contexts = getattr(route, "effective_route_contexts", None)
        if callable(effective_contexts):
            routes.extend(effective_contexts())
        elif isinstance(route, APIRoute):
            routes.append(route)
    for path in CRITICAL_UI_READS:
        matches = [route for route in routes if route.path == path]
        assert matches, path
        assert matches[0].endpoint.__module__ == canonical_erp_reads.__name__

    product_writes = [
        route for route in routes
        if route.path == "/api/products/" and "POST" in route.methods
    ]
    assert product_writes
    assert product_writes[0].endpoint is canonical_erp_reads.create_product_draft

    product_updates = [
        route for route in routes
        if route.path == "/api/products/{product_id}" and "PUT" in route.methods
    ]
    assert product_updates
    assert product_updates[0].endpoint is canonical_erp_reads.update_product_draft

    for path, endpoint in (
        ("/api/customers/", canonical_erp_reads.create_customer),
        ("/api/suppliers/", canonical_erp_reads.create_supplier),
    ):
        writes = [
            route for route in routes
            if route.path == path and "POST" in route.methods
        ]
        assert writes
        assert writes[0].endpoint is endpoint


def test_uuid_customer_address_routes_precede_legacy_integer_routes() -> None:
    routes = [route for route in canonical_erp_reads.router.routes if isinstance(route, APIRoute)]
    paths = {(route.path, frozenset(route.methods)) for route in routes}

    assert ("/customers/{customer_id:uuid}/addresses", frozenset({"GET"})) in paths
    assert ("/customers/{customer_id:uuid}/addresses/", frozenset({"POST"})) in paths
    assert (
        "/customers/{customer_id:uuid}/addresses/{address_id:uuid}",
        frozenset({"PUT"}),
    ) in paths


def test_uuid_sales_document_detail_routes_precede_legacy_integer_routes() -> None:
    routes = []
    for route in app.routes:
        effective_contexts = getattr(route, "effective_route_contexts", None)
        if callable(effective_contexts):
            routes.extend(effective_contexts())
        elif isinstance(route, APIRoute):
            routes.append(route)

    expected = {
        "/api/invoices/{invoice_id:uuid}": canonical_erp_reads.canonical_invoice_compatibility_detail,
        "/api/sales-orders/{order_id:uuid}": canonical_erp_reads.canonical_sales_order_compatibility_detail,
        "/api/challan/{challan_id:uuid}": canonical_erp_reads.canonical_challan_compatibility_detail,
    }
    for path, endpoint in expected.items():
        matches = [route for route in routes if route.path == path and "GET" in route.methods]
        assert matches, path
        assert matches[0].endpoint is endpoint


def test_uuid_sales_document_detail_reads_include_importable_lines(monkeypatch) -> None:
    captured = []
    org_id = uuid4()
    invoice_id = uuid4()
    order_id = uuid4()
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: org_id)

    def fake_rows(_db, sql, params):
        captured.append((sql, params))
        if "FROM sales.invoices invoice" in sql:
            return [{"invoice_id": invoice_id, "items": [{"product_id": uuid4()}]}]
        return [{
            "order_id": order_id, "status": "approved",
            "source_item_count": 1, "importable_item_count": 1,
            "items": [{"product_id": uuid4()}],
        }]

    monkeypatch.setattr(canonical_erp_reads, "_rows", fake_rows)
    invoice = canonical_erp_reads.canonical_invoice_compatibility_detail(
        invoice_id=invoice_id, user={}, db=object(),
    )
    order = canonical_erp_reads.canonical_sales_order_compatibility_detail(
        order_id=order_id, user={}, db=object(),
    )

    assert invoice["invoice_id"] == invoice_id
    assert order["order_id"] == order_id
    assert captured[0][1] == {"org_id": org_id, "invoice_id": invoice_id}
    assert captured[1][1] == {"org_id": org_id, "order_id": order_id}
    assert "FROM sales.invoice_lines line" in captured[0][0]
    assert "invoice_dispatch_allocations" in captured[0][0]
    assert "line.line_discount_kind='percent'" in captured[0][0]
    assert "FROM sales.order_lines line" in captured[1][0]
    assert "registration_type='GSTIN'" in captured[1][0]
    assert "line.line_discount_kind='percent'" in captured[1][0]
    for sql, _params in captured:
        assert "'product_name', product.name" in sql
        assert "to_char(line.billed_quantity" in sql
        assert "to_char(line.quoted_unit_rate" in sql
        assert "FM999999999999999990.000000" in sql
        assert "FM999999999999999990.0000" in sql
        assert "FM999999999999999990.00" in sql


def test_order_and_challan_import_details_include_canonical_batch_allocations(monkeypatch) -> None:
    captured = []
    org_id = uuid4()
    order_id = uuid4()
    challan_id = uuid4()
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: org_id)

    def fake_rows(_db, sql, params):
        captured.append((sql, params))
        if "FROM sales.dispatches dispatch" in sql:
            return [{
                "challan_id": challan_id, "status": "posted",
                "source_item_count": 1, "importable_item_count": 1,
                "items": [{"batch_id": uuid4()}],
            }]
        return [{
            "order_id": order_id, "status": "approved",
            "source_item_count": 1, "importable_item_count": 1,
            "items": [{"batch_id": uuid4()}],
        }]

    monkeypatch.setattr(canonical_erp_reads, "_rows", fake_rows)
    canonical_erp_reads.canonical_sales_order_compatibility_detail(
        order_id=order_id, user={}, db=object(),
    )
    canonical_erp_reads.canonical_challan_compatibility_detail(
        challan_id=challan_id, user={}, db=object(),
    )

    order_sql, order_params = captured[0]
    challan_sql, challan_params = captured[1]
    assert "inventory.reservations held" in order_sql
    assert "held.status='active'" in order_sql
    assert "'batch_number', reservation.batch_number" in order_sql
    assert order_params == {"org_id": org_id, "order_id": order_id}
    assert "FROM sales.dispatch_lines line" in challan_sql
    assert "JOIN inventory.batches batch" in challan_sql
    assert "'batch_number', batch.batch_number" in challan_sql
    assert challan_params == {"org_id": org_id, "challan_id": challan_id}


def test_order_and_challan_import_routes_publish_strict_authoritative_contracts() -> None:
    routes = {
        route.path: route for route in canonical_erp_reads.router.routes
        if isinstance(route, APIRoute) and route.path in {
            "/sales-orders/{order_id:uuid}", "/challan/{challan_id:uuid}",
        }
    }
    assert routes["/sales-orders/{order_id:uuid}"].response_model is (
        canonical_erp_reads.CanonicalSalesOrderImportDetail
    )
    assert routes["/challan/{challan_id:uuid}"].response_model is (
        canonical_erp_reads.CanonicalChallanImportDetail
    )

    order_source = inspect.getsource(
        canonical_erp_reads.canonical_sales_order_compatibility_detail
    )
    for evidence in (
        "'free_supply_tax_treatment', line.free_supply_tax_treatment",
        "'branch_id', document.branch_id",
        "'location_id', reservation.location_id",
        "'uom_conversion_id', conversion.id",
        "candidate.candidate_count=1",
        "source_item_count",
        "importable_item_count",
    ):
        assert evidence in order_source

    challan_source = inspect.getsource(
        canonical_erp_reads.canonical_challan_compatibility_detail
    )
    for evidence in (
        "'source_kind', 'dispatch_allocation'",
        "'allocation_id', line.id",
        "'command_request_id', command.command_request_id",
        "'inventory_document_id', inventory_document.id",
        "'inventory_document_line_id', inventory_line.id",
        "'dispatch_line_id', line.id",
        "line.base_billed_quantity",
        "line.base_free_quantity",
        "candidate_command.status='succeeded'",
        "candidate_document.status='posted'",
        "source_item_count",
        "importable_item_count",
    ):
        assert evidence in challan_source


def test_canonical_sales_detail_openapi_publishes_only_exact_decimal_strings() -> None:
    schema = app.openapi()
    components = schema["components"]["schemas"]
    exact_fields = {
        "CanonicalInvoiceExecutedBatchAllocation": {
            "base_quantity": 6, "entered_quantity": 6,
            "base_billed_quantity": 6, "base_free_quantity": 6,
            "billed_quantity": 6, "free_quantity": 6,
        },
        "CanonicalInvoiceDetailItem": {
            "quantity": 6, "free_quantity": 6,
            "base_billed_quantity": 6, "base_free_quantity": 6,
            "unit_price": 4, "discount_percent": 6, "tax_rate": 6,
            "gst_percent": 6, "taxable_amount": 2, "cgst_amount": 2,
            "sgst_amount": 2, "igst_amount": 2, "cess_amount": 2,
            "line_total": 2,
        },
        "CanonicalSalesOrderImportItem": {
            "quantity": 6, "free_quantity": 6, "unit_price": 4,
            "discount_percent": 6, "tax_rate": 6, "gst_percent": 6,
            "taxable_amount": 2, "cgst_amount": 2, "sgst_amount": 2,
            "igst_amount": 2, "line_total": 2, "mrp": 4,
            "available_quantity": 6,
        },
        "CanonicalDispatchImportAllocation": {
            "base_quantity": 6, "base_billed_quantity": 6,
            "base_free_quantity": 6, "billed_quantity": 6,
            "free_quantity": 6,
        },
        "CanonicalChallanImportItem": {
            "quantity": 6, "dispatched_quantity": 6, "free_quantity": 6,
            "unit_price": 4, "discount_percent": 6, "tax_rate": 6,
            "gst_percent": 6, "taxable_amount": 2, "cgst_amount": 2,
            "sgst_amount": 2, "igst_amount": 2, "line_total": 2, "mrp": 4,
        },
        "CanonicalInvoiceDetailResponse": {
            "taxable_amount": 2, "cgst_amount": 2, "sgst_amount": 2,
            "igst_amount": 2, "cess_amount": 2, "total_amount": 2,
        },
        "CanonicalSalesOrderImportDetail": {"total_amount": 2},
        "CanonicalChallanImportDetail": {"total_amount": 2},
    }
    for model, fields in exact_fields.items():
        properties = components[model]["properties"]
        for field, scale in fields.items():
            assert field in components[model]["required"]
            assert properties[field]["type"] == "string"
            assert "anyOf" not in properties[field]
            assert properties[field]["pattern"].endswith(rf"\.[0-9]{{{scale}}}$")

    route_models = {
        "/api/canonical/invoices/{invoice_id}": (
            "CanonicalInvoiceDetailResponse", "canonical_invoice_exact_detail",
        ),
        "/api/canonical/sales-orders/{order_id}/import-detail": (
            "CanonicalSalesOrderImportDetail", "canonical_sales_order_import_detail",
        ),
        "/api/canonical/challans/{challan_id}/import-detail": (
            "CanonicalChallanImportDetail", "canonical_challan_import_detail",
        ),
    }
    for path, (model, operation_id) in route_models.items():
        operation = schema["paths"][path]["get"]
        assert operation["operationId"] == operation_id
        response_schema = operation["responses"]["200"][
            "content"
        ]["application/json"]["schema"]
        assert response_schema == {"$ref": f"#/components/schemas/{model}"}

    compatibility_operation_ids = {
        route.operation_id
        for route in _effective_route_leaves(app.routes)
        if getattr(route, "endpoint", None) in {
            canonical_erp_reads.canonical_invoice_compatibility_detail,
            canonical_erp_reads.canonical_sales_order_compatibility_detail,
            canonical_erp_reads.canonical_challan_compatibility_detail,
        }
    }
    assert compatibility_operation_ids >= {
        "canonical_invoice_uuid_compatibility_detail",
        "canonical_sales_order_uuid_compatibility_detail",
        "canonical_challan_uuid_compatibility_detail",
    }


def test_import_response_models_fail_closed_on_cardinality_lineage_and_extra_fields() -> None:
    now = datetime(2026, 8, 25, 12, 0)
    ids = {name: uuid4() for name in (
        "order", "challan", "customer", "branch", "location", "uom",
        "product", "batch", "dispatch_line", "command", "inventory_document",
        "inventory_line",
    )}
    order_item = {
        "id": uuid4(), "product_id": ids["product"], "product_name": "Carton",
        "source_document_kind": "sales_order",
        "product_code": "BOX", "hsn_code": "481910",
        "branch_id": ids["branch"], "location_id": ids["location"],
        "uom_conversion_id": ids["uom"], "uom_code": "EA", "unit": "EA",
        "quantity": "1.250000", "free_quantity": "0.250000",
        "free_supply_tax_treatment": "included_at_unit_rate",
        "unit_price": "100.0000", "discount_percent": "0.000000",
        "tax_rate": "12.000000", "gst_percent": "12.000000",
        "taxable_amount": "150.00", "cgst_amount": "9.00",
        "sgst_amount": "9.00", "igst_amount": "0.00",
        "line_total": "168.00",
        "batch_id": ids["batch"], "batch_number": "B-1", "expiry_date": None,
        "mrp": "150.0000", "available_quantity": "1.500000",
    }
    order = {
        "order_id": ids["order"], "id": ids["order"], "order_number": "SO-1",
        "order_date": date(2026, 8, 25), "delivery_date": None,
        "order_status": "approved", "status": "approved",
        "customer_id": ids["customer"], "customer_name": "Customer",
        "customer_phone": None, "customer_email": None, "customer_gst_number": None,
        "billing_address": "A", "billing_city": "Pune", "billing_state": "27",
        "billing_pincode": "411001", "shipping_address": "A",
        "shipping_city": "Pune", "shipping_state": "27",
        "shipping_pincode": "411001", "total_amount": "168.00",
        "items": [order_item], "source_item_count": 1, "importable_item_count": 1,
        "created_at": now, "updated_at": now,
    }
    order_response = canonical_erp_reads.CanonicalSalesOrderImportDetail.model_validate(order)
    order_wire = json.loads(order_response.model_dump_json())
    assert order_wire["total_amount"] == "168.00"
    assert order_wire["items"][0]["quantity"] == "1.250000"
    assert order_wire["items"][0]["unit_price"] == "100.0000"
    with pytest.raises(ValidationError, match="cardinality"):
        canonical_erp_reads.CanonicalSalesOrderImportDetail.model_validate({
            **order, "source_item_count": 2,
        })
    with pytest.raises(ValidationError, match="Extra inputs"):
        canonical_erp_reads.CanonicalSalesOrderImportDetail.model_validate({
            **order, "offline_fallback": True,
        })

    allocation = {
        "source_kind": "dispatch_allocation",
        "allocation_id": ids["dispatch_line"],
        "source_line_id": ids["dispatch_line"],
        "command_request_id": ids["command"],
        "inventory_document_id": ids["inventory_document"],
        "inventory_document_line_id": ids["inventory_line"],
        "invoice_dispatch_allocation_id": None,
        "dispatch_id": ids["challan"], "dispatch_line_id": ids["dispatch_line"],
        "batch_id": ids["batch"], "batch_number": "B-1", "expiry_date": None,
        "from_location_id": ids["location"], "base_quantity": "15.000000",
        "base_billed_quantity": "12.500000", "base_free_quantity": "2.500000",
        "billed_quantity": "1.250000", "free_quantity": "0.250000",
    }
    challan_item = {
        **{key: value for key, value in order_item.items() if key not in {
            "location_id", "available_quantity", "source_document_kind",
        }},
        "id": ids["dispatch_line"],
        "source_document_kind": "delivery_challan",
        "dispatched_quantity": "1.250000",
        "batch_allocations": [allocation],
    }
    challan = {
        "challan_id": ids["challan"], "id": ids["challan"],
        "challan_number": "DC-1", "challan_date": date(2026, 8, 25),
        "status": "posted", "customer_id": ids["customer"],
        "customer_name": "Customer", "customer_phone": None,
        "customer_email": None, "delivery_address": "A", "delivery_city": "Pune",
        "delivery_state": "27", "delivery_pincode": "411001",
        "transport_company": None, "vehicle_number": None, "lr_number": None,
        "items": [challan_item], "source_item_count": 1,
        "importable_item_count": 1, "total_amount": "168.00",
        "created_at": now, "updated_at": now,
    }
    challan_response = canonical_erp_reads.CanonicalChallanImportDetail.model_validate(challan)
    challan_wire = json.loads(challan_response.model_dump_json())
    assert challan_wire["total_amount"] == "168.00"
    assert challan_wire["items"][0]["dispatched_quantity"] == "1.250000"
    assert challan_wire["items"][0]["batch_allocations"][0][
        "base_quantity"
    ] == "15.000000"
    with pytest.raises(ValidationError, match="quantities do not reconcile"):
        canonical_erp_reads.CanonicalChallanImportDetail.model_validate({
            **challan,
            "items": [{**challan_item, "quantity": 1}],
        })


@pytest.mark.parametrize("source,status", [
    ("order", "draft"),
    ("order", "cancelled"),
    ("challan", "draft"),
    ("challan", "cancelled"),
    ("challan", "reversed"),
])
def test_import_details_reject_non_authoritative_source_states(
    monkeypatch, source: str, status: str,
) -> None:
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda *_args: uuid4())
    monkeypatch.setattr(canonical_erp_reads, "_rows", lambda *_args: [{
        "status": status,
        "source_item_count": 1,
        "importable_item_count": 1,
    }])

    with pytest.raises(HTTPException) as blocked:
        if source == "order":
            canonical_erp_reads.canonical_sales_order_compatibility_detail(
                order_id=uuid4(), user={}, db=object(),
            )
        else:
            canonical_erp_reads.canonical_challan_compatibility_detail(
                challan_id=uuid4(), user={}, db=object(),
            )

    assert blocked.value.status_code == 409


def test_challan_import_rejects_already_invoiced_or_partial_lineage(monkeypatch) -> None:
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda *_args: uuid4())
    monkeypatch.setattr(canonical_erp_reads, "_rows", lambda *_args: [{
        "status": "posted",
        "source_item_count": 2,
        "importable_item_count": 1,
    }])

    with pytest.raises(HTTPException) as blocked:
        canonical_erp_reads.canonical_challan_compatibility_detail(
            challan_id=uuid4(), user={}, db=object(),
        )
    assert blocked.value.status_code == 409
    assert "already invoiced" in str(blocked.value.detail)
    assert "NOT EXISTS" in inspect.getsource(
        canonical_erp_reads.canonical_challan_compatibility_detail
    )


def test_sales_order_search_uses_canonical_number_and_customer_fields(monkeypatch) -> None:
    captured = {}
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: uuid4())

    def fake_rows(_db, sql, params):
        captured.update(sql=sql, params=params)
        return []

    monkeypatch.setattr(canonical_erp_reads, "_rows", fake_rows)
    result = canonical_erp_reads.sales_orders(
        limit=50, skip=0, search="DEMO-SO", user={}, db=object(),
    )

    assert result == {"orders": [], "total": 0, "page": 1, "per_page": 50, "total_pages": 0}
    assert "document.order_number ILIKE :search_pattern" in captured["sql"]
    assert "party.legal_name ILIKE :search_pattern" in captured["sql"]
    assert captured["params"]["search_pattern"] == "%DEMO-SO%"


def test_sales_order_pagination_uses_filtered_database_total(monkeypatch) -> None:
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: uuid4())
    monkeypatch.setattr(canonical_erp_reads, "_sales_rows", lambda *_args, **_kwargs: [{
        "id": uuid4(), "document_number": "SO-2", "document_date": "2026-08-24",
        "filtered_total": 7,
    }])

    result = canonical_erp_reads.sales_orders(
        limit=2, skip=2, search="", user={}, db=object(),
    )

    assert result["total"] == 7
    assert result["page"] == 2
    assert result["total_pages"] == 4
    assert "filtered_total" not in result["orders"][0]


def test_offline_sync_routes_are_not_registered() -> None:
    routes = [route for route in canonical_erp_reads.router.routes if isinstance(route, APIRoute)]
    assert not any(route.path.startswith("/sync/") for route in routes)


def test_party_creation_activates_party_before_active_account_commit() -> None:
    source = Path(canonical_erp_reads.__file__).read_text(encoding="utf-8")
    assert "SET status='active', updated_at=transaction_timestamp()" in source
    assert "WHERE org_id=:org_id AND id=:party_id AND status='draft'" in source
    assert "Party activation failed" in source


def test_reviewed_customer_create_contract_accepts_the_active_form_shape() -> None:
    customer = canonical_erp_reads.CanonicalCustomerCreate.model_validate({
        "customer_name": "E2E Browser Customer",
        "customer_code": "CUST-E2E",
        "customer_type": "organization",
        "primary_phone": "9876543210",
        "primary_email": "buyer@example.com",
        "address_line1": "Test Lane 1",
        "city": "Mumbai",
        "state_code": "27",
        "pincode": "400001",
        "credit_limit": 5000,
        "credit_days": 30,
    })

    assert customer.primary_phone == "9876543210"
    assert customer.model_dump(exclude_none=True) == {
        "customer_name": "E2E Browser Customer",
        "customer_code": "CUST-E2E",
        "customer_type": "organization",
        "primary_phone": "9876543210",
        "primary_email": "buyer@example.com",
        "address_line1": "Test Lane 1",
        "city": "Mumbai",
        "state_code": "27",
        "pincode": "400001",
        "credit_limit": customer.credit_limit,
        "credit_days": 30,
    }


def test_reviewed_party_create_contracts_reject_unowned_and_partial_facts() -> None:
    try:
        canonical_erp_reads.CanonicalCustomerCreate.model_validate({
            "customer_name": "Bad Boundary",
            "customer_code": "CUST-BAD-BOUNDARY",
            "customer_type": "organization",
            "primary_phone": "9876543210",
            "credit_limit": "0.00",
            "credit_days": 0,
            "org_id": str(uuid4()),
        })
    except ValidationError as exc:
        assert "Extra inputs are not permitted" in str(exc)
    else:
        raise AssertionError("tenant identity must not be accepted from the browser")

    try:
        canonical_erp_reads.CanonicalSupplierCreate.model_validate({
            "supplier_name": "Partial Address Supplier",
            "supplier_code": "SUP-PARTIAL",
            "primary_phone": "9876543210",
            "city": "Mumbai",
            "payment_days": 30,
        })
    except ValidationError as exc:
        assert "must be supplied together" in str(exc)
    else:
        raise AssertionError("partial canonical addresses must be rejected")


class _CreatedAccountResult:
    def __init__(self, account_id):
        self.account_id = account_id

    def scalar_one(self):
        return self.account_id


class _CreatedAccountSession:
    def __init__(self, account_id):
        self.account_id = account_id
        self.committed = False

    def execute(self, *_args, **_kwargs):
        return _CreatedAccountResult(self.account_id)

    def commit(self):
        self.committed = True

    def rollback(self):
        raise AssertionError("valid party creation must not roll back")


def test_created_customer_and_supplier_resolve_to_active_account_ids(monkeypatch) -> None:
    org_id = uuid4()
    party_id = uuid4()
    posting_id = uuid4()
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: org_id)
    monkeypatch.setattr(
        canonical_erp_reads,
        "_party_posting_account",
        lambda _db, _org_id, _account_type: posting_id,
    )
    monkeypatch.setattr(
        canonical_erp_reads,
        "_insert_party_contact_address_and_tax",
        lambda *_args, **_kwargs: party_id,
    )

    customer_account_id = uuid4()
    customer_db = _CreatedAccountSession(customer_account_id)
    customer = canonical_erp_reads.create_customer(
        canonical_erp_reads.CanonicalCustomerCreate(
            customer_name="Active Customer",
            customer_code="CUST-ACTIVE",
            primary_phone="9876543210",
            customer_type="organization",
            credit_limit="0.00",
            credit_days=0,
        ),
        user={},
        db=customer_db,
    )
    assert customer["customer_id"] == customer_account_id
    assert customer["party_id"] == party_id
    assert customer["is_active"] is True
    assert customer["status"] == "active"
    assert customer["customer_code"] == "CUST-ACTIVE"
    assert customer_db.committed

    supplier_account_id = uuid4()
    supplier_db = _CreatedAccountSession(supplier_account_id)
    supplier = canonical_erp_reads.create_supplier(
        canonical_erp_reads.CanonicalSupplierCreate(
            supplier_name="Active Supplier",
            supplier_code="SUP-ACTIVE",
            primary_phone="9876543210",
            payment_days=30,
        ),
        user={},
        db=supplier_db,
    )
    assert supplier["supplier_id"] == supplier_account_id
    assert supplier["party_id"] == party_id
    assert supplier["is_active"] is True
    assert supplier["status"] == "active"
    assert supplier["supplier_code"] == "SUP-ACTIVE"
    assert supplier_db.committed


def test_customer_address_primary_is_scoped_by_address_kind() -> None:
    source = Path(canonical_erp_reads.__file__).read_text(encoding="utf-8")
    assert source.count("address_kind=:kind") >= 4
    assert "other.address_kind=:kind" in source


def test_canonical_reads_activate_rls_and_do_not_use_legacy_schemas() -> None:
    source = canonical_erp_reads.__file__
    text = open(source, encoding="utf-8").read()
    assert "erp_security.activate_context" in text
    for sql_verb in ("FROM", "JOIN", "INTO", "UPDATE"):
        assert f"{sql_verb} master." not in text
        assert f"{sql_verb} public." not in text
    assert "legacy" not in text.lower().replace("legacy routes", "")


def test_canonical_read_sql_matches_checked_in_domain_catalogs() -> None:
    result = schema_validator.validate_module(Path(canonical_erp_reads.__file__))
    assert result["errors"] == []


def test_batch_reads_use_canonical_inventory_lifecycle_states() -> None:
    source = Path(canonical_erp_reads.__file__).read_text(encoding="utf-8")

    assert "batch.status IN ('released','blocked')" in source
    assert "batch.status IN ('active','blocked')" not in source


def test_batch_reads_project_branch_from_authoritative_stock_balance() -> None:
    source = Path(canonical_erp_reads.__file__).read_text(encoding="utf-8")

    assert source.count("COUNT(DISTINCT balance.branch_id)=1") == 1
    assert "JOIN inventory.stock_balances balance" in source
    assert "balance.on_hand_quantity>0" in source
    assert "location.allows_sale" in source
    assert "COUNT(DISTINCT location.branch_id)=1" not in source


def test_invoice_history_filters_and_payment_projection_use_canonical_finance(monkeypatch) -> None:
    captured = {}
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: uuid4())

    def fake_rows(_db, sql, params):
        captured["sql"] = sql
        captured["params"] = params
        return [{
            "id": uuid4(),
            "document_number": "INV-E2E-001",
            "document_date": "2026-08-24",
            "payment_status": "partial",
            "paid_amount": 25,
            "pending_amount": 75,
            "filtered_total": 31,
        }]

    monkeypatch.setattr(canonical_erp_reads, "_rows", fake_rows)
    result = canonical_erp_reads.invoices(
        limit=25,
        offset=0,
        date_from=None,
        date_to=None,
        search="Acme",
        payment_status="partial",
        user={},
        db=object(),
    )

    assert result["total"] == 31
    assert result["invoices"][0]["payment_status"] == "partial"
    assert "filtered_total" not in result["invoices"][0]
    sql = captured["sql"]
    assert "finance.accounting_events" in sql
    assert "finance.open_items" in sql
    assert "finance.allocations" in sql
    assert "reversal.reversal_of_allocation_id=allocation.id" in sql
    assert "document.invoice_number ILIKE :search_pattern" in sql
    assert "CAST(:payment_status AS text) IS NULL" in sql
    assert captured["params"]["search_pattern"] == "%Acme%"
    assert captured["params"]["payment_status"] == "partial"


def test_product_and_batch_reads_project_effective_canonical_gst_rate() -> None:
    source = Path(canonical_erp_reads.__file__).read_text(encoding="utf-8")

    assert source.count("FROM tax.tax_code_versions") >= 4
    assert "tax_version.taxability='taxable'" in source
    assert "tax_version.taxability IS NULL THEN NULL" in source
    assert "tax_version.igst_rate" in source


def test_http_batch_read_projects_expiry_equivalent_fefo_tiers() -> None:
    source = inspect.getsource(canonical_erp_reads.product_batches)

    assert "AS fefo_expiry_tier" in source
    assert "dense_rank() OVER (" in source
    assert "PARTITION BY batch.product_id, balance.location_id" in source
    assert "ORDER BY batch.expires_on" in source
    assert "ORDER BY batch.expires_on, batch.id" not in source


def test_company_profile_projects_canonical_invoice_identity_and_settlement_details() -> None:
    source = Path(canonical_erp_reads.__file__).read_text(encoding="utf-8")

    assert "organization.legal_name" in source
    assert "registration.gstin AS gst_number" in source
    assert "COALESCE(license.licenses, '[]'::jsonb) AS licenses" in source
    assert "COALESCE(bank.accounts, '[]'::jsonb) AS bank_accounts" in source
    assert "FROM compliance.licenses" in source
    assert "FROM finance.bank_accounts bank_account" in source
    assert "JOIN finance.accounts ledger_account" in source
    assert "bank_account.status='active'" in source
    assert "ledger_account.status='active'" in source
    assert "ledger_account.allows_bank_reconciliation" in source
    assert "ledger_account.allows_bank_reconciliation=true" not in source


def test_unpublished_hsn_and_gstr2a_projections_stay_unavailable() -> None:
    paths = app.openapi()["paths"]

    assert "/api/reports/tax/hsn" not in paths
    assert "/api/gst/reports/tax/gstr2a" not in paths


def test_sales_invoice_reads_project_authoritative_gst_header_totals() -> None:
    list_source = inspect.getsource(canonical_erp_reads._sales_rows)
    detail_source = inspect.getsource(canonical_erp_reads._canonical_invoice_detail)

    for source in (list_source, detail_source):
        assert "buyer_gstin_snapshot AS customer_gst_number" in source
        assert "gst_taxable_total" in source and "AS taxable_amount" in source
        assert "cgst_total" in source and "AS cgst_amount" in source
        assert "sgst_total" in source and "AS sgst_amount" in source
        assert "igst_total" in source and "AS igst_amount" in source
        assert "cess_total" in source and "AS cess_amount" in source
    assert "COALESCE(document.cess_total, 0) AS cess_amount," in list_source


def test_sales_invoice_detail_projects_executed_batch_allocations() -> None:
    source = inspect.getsource(canonical_erp_reads._canonical_invoice_detail)

    assert "inventory_line.sales_invoice_line_id=line.id" in source
    assert "inventory_document.sales_invoice_id=invoice.id" in source
    assert source.count("inventory_document.branch_id=invoice.branch_id") == 2
    assert "inventory_document.sales_dispatch_id=dispatch.id" in source
    assert "'inventory_document_line_id', executed.inventory_document_line_id" in source
    assert "executed.invoice_dispatch_allocation_id" in source
    assert "invoice_allocation.id AS invoice_dispatch_allocation_id" in source
    assert "inventory_line.id AS inventory_document_line_id" in source
    assert "executed.base_billed_quantity" in source
    assert "executed.base_free_quantity" in source
    assert "executed.billed_quantity" in source
    assert "executed.free_quantity" in source
    assert source.count("FM999999999999999990.000000") >= 10
    assert "command.status='succeeded'" in source
    assert "command.result_resource_id=invoice.id" in source
    assert "command.request_hash=extensions.digest(" not in source
    assert "command.request_hash=pg_catalog.sha256(" in source
    assert "count(*)::integer AS command_evidence_count" in source
    assert "CASE WHEN count(*)=1 THEN" in source
    assert "LEFT JOIN LATERAL" in source
    assert "HAVING count(*)=1" not in source
    assert "evidence_match_count" in source
    assert "candidate.value->>'inventory_line_id'" in source
    assert "executed.entered_quantity" in source
    assert "inventory_document.document_type='sales_issue'" in source
    assert "inventory_document.status='posted'" in source
    assert "dispatch.status='posted'" in source
    assert "'batch_allocations', COALESCE(allocation.batch_allocations" in source
    assert "CASE WHEN allocation.allocation_count=1" in source
    assert "'source_kind', executed.source_kind" in source
    assert "jsonb_agg(jsonb_build_object(" in source
    assert "UNION ALL" in source
    assert "ORDER BY dispatch_line.id LIMIT 1" not in source
    assert "line.free_supply_tax_treatment" in source

    detail_routes = [
        route for route in canonical_erp_reads.router.routes
        if isinstance(route, APIRoute) and route.path in {
            "/canonical/invoices/{invoice_id}",
            "/invoices/{invoice_id:uuid}",
        }
    ]
    assert len(detail_routes) == 2
    assert all(
        route.response_model is canonical_erp_reads.CanonicalInvoiceDetailResponse
        for route in detail_routes
    )
    item_schema = canonical_erp_reads.CanonicalInvoiceDetailItem.model_json_schema()
    assert "batch_allocations" in item_schema["properties"]
    assert "batch_allocations" in item_schema["required"]
    allocation_schema = (
        canonical_erp_reads.CanonicalInvoiceExecutedBatchAllocation.model_json_schema()
    )
    assert allocation_schema["properties"]["source_kind"]["enum"] == [
        "direct_issue", "dispatch_allocation"
    ]


def test_invoice_detail_relies_on_immutable_canonical_command_hash_evidence() -> None:
    detail_source = inspect.getsource(canonical_erp_reads._canonical_invoice_detail)
    canonical_sql = (
        Path(__file__).parents[2] / "alembic/sql/20260820_0001_canonical_v1.sql"
    ).read_text(encoding="utf-8")

    assert "extensions.digest" not in detail_source
    assert "command.request_hash=pg_catalog.sha256(" in detail_source
    assert (
        "NEW.request_hash IS DISTINCT FROM extensions.digest(NEW.request_bytes,'sha256')"
        in canonical_sql
    )
    assert "command request evidence cannot be deleted" in canonical_sql
    assert "terminal command request is immutable" in canonical_sql
    assert "approved command snapshot facts are immutable" in canonical_sql


def test_sales_invoice_detail_response_validates_zero_one_and_many_allocations() -> None:
    def allocation(source_kind: str, *, expires):
        inventory_line_id = uuid4()
        invoice_line_id = uuid4()
        dispatch_allocation_id = (
            uuid4() if source_kind == "dispatch_allocation" else None
        )
        dispatch_line_id = uuid4() if source_kind == "dispatch_allocation" else None
        return {
            "source_kind": source_kind,
            "allocation_id": dispatch_allocation_id or inventory_line_id,
            "invoice_line_id": invoice_line_id,
            "source_line_id": dispatch_line_id or invoice_line_id,
            "command_request_id": uuid4() if source_kind == "direct_issue" else None,
            "command_evidence_count": 1 if source_kind == "direct_issue" else 0,
            "request_line_count": 1 if source_kind == "direct_issue" else 0,
            "evidenced_allocation_count": 1 if source_kind == "direct_issue" else None,
            "evidence_match_count": 1 if source_kind == "direct_issue" else 0,
            "inventory_document_id": uuid4(),
            "inventory_document_line_id": inventory_line_id,
            "invoice_dispatch_allocation_id": dispatch_allocation_id,
            "dispatch_id": uuid4() if source_kind == "dispatch_allocation" else None,
            "dispatch_line_id": dispatch_line_id,
            "batch_id": uuid4(),
            "batch_number": f"BATCH-{source_kind}",
            "expiry_date": expires,
            "from_location_id": uuid4(),
            "uom_code": "EA",
            "base_quantity": 1,
            "entered_quantity": 1,
            "base_billed_quantity": 1,
            "base_free_quantity": 0,
            "billed_quantity": 1,
            "free_quantity": 0,
        }

    def item(batch_allocations):
        allocations = [{**value} for value in batch_allocations]
        line_id = allocations[0]["invoice_line_id"] if allocations else uuid4()
        for value in allocations:
            value["invoice_line_id"] = line_id
            if value["source_kind"] == "direct_issue":
                value["source_line_id"] = line_id
                value["evidenced_allocation_count"] = len(allocations)
        singular = allocations[0] if len(allocations) == 1 else None
        return {
            "id": line_id, "product_id": uuid4(), "product_name": "Product",
            "product_code": "SKU", "hsn_code": "481910", "uom_code": "EA",
            "unit": "EA", "quantity": len(allocations) or 1,
            "free_quantity": 0, "base_billed_quantity": len(allocations) or 1,
            "base_free_quantity": 0, "unit_price": 150, "discount_percent": 0,
            "free_supply_tax_treatment": "excluded_from_taxable_value",
            "tax_rate": 12, "gst_percent": 12, "taxable_amount": 150,
            "cgst_amount": 9, "sgst_amount": 9, "igst_amount": 0,
            "cess_amount": 0, "line_total": 168,
            "batch_id": singular["batch_id"] if singular else None,
            "batch_number": singular["batch_number"] if singular else None,
            "expiry_date": singular["expiry_date"] if singular else None,
            "batch_allocations": allocations,
        }

    direct = allocation("direct_issue", expires=None)
    direct_two = allocation("direct_issue", expires=date(2029, 9, 1))
    direct_two["command_request_id"] = direct["command_request_id"]
    direct_two["inventory_document_id"] = direct["inventory_document_id"]
    dispatch = allocation("dispatch_allocation", expires=date(2028, 9, 1))
    payload = {
        "invoice_id": uuid4(), "invoice_number": "INV-1",
        "invoice_date": date(2026, 8, 24), "status": "draft",
        "seller_legal_name": "Canonical Seller Private Limited",
        "seller_gstin": "27ABCDE1234F1Z5", "seller_address": "Seller Address",
        "customer_id": uuid4(), "customer_name": "Customer",
        "customer_phone": None, "customer_email": None,
        "customer_gst_number": None, "billing_address": "Address",
        "shipping_address": "Address", "due_date": None, "currency_code": "INR",
        "taxable_amount": 300, "cgst_amount": 18, "sgst_amount": 18,
        "igst_amount": 0, "cess_amount": 0, "total_amount": 336,
        "items": [item([]), item([direct]), item([direct, direct_two]), item([dispatch])],
        "created_at": datetime(2026, 8, 24, 17, 0),
        "updated_at": datetime(2026, 8, 24, 17, 0),
    }

    response = canonical_erp_reads.CanonicalInvoiceDetailResponse.model_validate(payload)
    assert response.items[0].batch_allocations == []
    assert response.items[1].batch_allocations[0].expiry_date is None
    assert response.items[1].batch_id == direct["batch_id"]
    assert len(response.items[2].batch_allocations) == 2
    assert response.items[2].batch_id is None
    assert response.items[2].batch_allocations[1].source_kind == "direct_issue"
    assert response.items[3].batch_allocations[0].source_kind == "dispatch_allocation"

    missing_line_identity = {**direct}
    missing_line_identity.pop("inventory_document_line_id")
    with pytest.raises(ValidationError):
        canonical_erp_reads.CanonicalInvoiceExecutedBatchAllocation.model_validate(
            missing_line_identity
        )
    dispatch_without_allocation_id = {
        **dispatch, "invoice_dispatch_allocation_id": None
    }
    with pytest.raises(ValidationError, match="dispatch allocation requires"):
        canonical_erp_reads.CanonicalInvoiceExecutedBatchAllocation.model_validate(
            dispatch_without_allocation_id
        )
    direct_without_command = {**direct, "command_request_id": None}
    with pytest.raises(ValidationError, match="succeeded command evidence"):
        canonical_erp_reads.CanonicalInvoiceExecutedBatchAllocation.model_validate(
            direct_without_command
        )
    with pytest.raises(ValidationError, match="identities must be unique"):
        canonical_erp_reads.CanonicalInvoiceDetailItem.model_validate(
            item([direct, {**direct}])
        )
    mixed_sources = item([direct, dispatch])
    with pytest.raises(ValidationError, match="cannot mix"):
        canonical_erp_reads.CanonicalInvoiceDetailItem.model_validate(mixed_sources)
    quantity_mismatch = item([direct])
    quantity_mismatch["quantity"] = 2
    with pytest.raises(ValidationError, match="do not reconcile"):
        canonical_erp_reads.CanonicalInvoiceDetailItem.model_validate(quantity_mismatch)
    three_way_dispatch = [
        allocation("dispatch_allocation", expires=date(2028, 9, 1))
        for _ in range(3)
    ]
    thirds = ["0.333333", "0.333333", "0.333334"]
    for value, exact_third in zip(three_way_dispatch, thirds):
        value.update({
            "base_quantity": "1.000000",
            "entered_quantity": exact_third,
            "base_billed_quantity": "1.000000",
            "base_free_quantity": "0.000000",
            "billed_quantity": exact_third,
            "free_quantity": "0.000000",
        })
    apportioned = item(three_way_dispatch)
    apportioned["quantity"] = 1
    apportioned["base_billed_quantity"] = 3
    response_item = canonical_erp_reads.CanonicalInvoiceDetailItem.model_validate(
        apportioned
    )
    assert len(response_item.batch_allocations) == 3
    wire_item = json.loads(response_item.model_dump_json())
    assert wire_item["quantity"] == "1.000000"
    assert wire_item["unit_price"] == "150.0000"
    assert wire_item["discount_percent"] == "0.000000"
    assert wire_item["line_total"] == "168.00"
    assert [
        allocation["billed_quantity"]
        for allocation in wire_item["batch_allocations"]
    ] == thirds
    base_drift = {**apportioned, "base_billed_quantity": 2.999999}
    with pytest.raises(ValidationError, match="do not reconcile"):
        canonical_erp_reads.CanonicalInvoiceDetailItem.model_validate(base_drift)
    posted_without_allocations = {**payload, "status": "posted", "items": [item([])]}
    with pytest.raises(ValidationError, match="posted product invoice lines require"):
        canonical_erp_reads.CanonicalInvoiceDetailResponse.model_validate(
            posted_without_allocations
        )
    ambiguous_evidence = {**direct, "command_evidence_count": 2}
    with pytest.raises(ValidationError, match="exactly one matched"):
        canonical_erp_reads.CanonicalInvoiceExecutedBatchAllocation.model_validate(
            ambiguous_evidence
        )
    other_document = {**direct_two, "inventory_document_id": uuid4()}
    multiple_documents = item([direct, other_document])
    with pytest.raises(ValidationError, match="share one inventory document"):
        canonical_erp_reads.CanonicalInvoiceDetailItem.model_validate(
            multiple_documents
        )
    identity_mismatch = item([direct])
    identity_mismatch["batch_allocations"][0]["invoice_line_id"] = uuid4()
    identity_mismatch["batch_allocations"][0]["source_line_id"] = identity_mismatch[
        "batch_allocations"
    ][0]["invoice_line_id"]
    with pytest.raises(ValidationError, match="invoice line identity"):
        canonical_erp_reads.CanonicalInvoiceDetailItem.model_validate(identity_mismatch)


def test_supplier_invoice_reads_project_tax_totals_and_filter_invoice_dates() -> None:
    source = inspect.getsource(canonical_erp_reads.supplier_invoices)

    assert "FROM procurement.supplier_invoices" in source
    assert "supplier_gstin_snapshot AS supplier_gst_number" in source
    assert "gst_taxable_total AS taxable_amount" in source
    assert "cgst_total AS cgst_amount" in source
    assert "sgst_total AS sgst_amount" in source
    assert "igst_total AS igst_amount" in source
    assert "cess_total AS cess_amount" in source
    assert ":from_date IS NULL OR invoice.supplier_invoice_date" in source
    assert ":to_date IS NULL OR invoice.supplier_invoice_date" in source
    assert "item.item_side='payable'" in source
    assert "item.status<>'reversed'" in source
    assert "allocation.reversal_of_allocation_id IS NULL" in source
    assert "reversal.reversal_of_allocation_id=allocation.id" in source


def test_gst_dashboard_applies_the_selected_period_to_both_tax_sides(monkeypatch) -> None:
    captured = {}
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: uuid4())

    def fake_rows(_db, sql, params):
        captured["sql"] = sql
        captured["params"] = params
        return [{
            "date_from": "2026-07-01", "date_to": "2026-07-31",
            "output_tax": 12, "input_credit": 5, "net_payable": 7,
        }]

    monkeypatch.setattr(canonical_erp_reads, "_rows", fake_rows)
    result = canonical_erp_reads.gst_dashboard(period="previous", user={}, db=object())

    assert result["period"] == {
        "key": "previous", "start": "2026-07-01", "end": "2026-07-31",
    }
    assert result["outputTax"] == "12.00"
    assert result["inputCredit"] == "5.00"
    assert result["netPayable"] == "7.00"
    assert captured["params"]["period"] == "previous"
    assert "tax_document.document_date BETWEEN period.date_from AND period.date_to" in captured["sql"]
    assert "return_period.period_start>=period.date_from" in captured["sql"]
    assert "return_period.period_end<=period.date_to" in captured["sql"]
    assert "line.itc_eligibility='eligible'" in captured["sql"]
    assert "portal_document.portal_document_type='gstr2b'" in captured["sql"]
    assert "portal_document.status='parsed'" in captured["sql"]


def test_gstr1_adjustment_notes_are_posted_date_bounded_and_side_aware(monkeypatch) -> None:
    captured = {}
    org_id = uuid4()
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: org_id)

    def fake_rows(_db, sql, params):
        captured.update(sql=sql, params=params)
        return [{"note_type": "sales_credit", "side": "sales", "direction": "credit"}]

    monkeypatch.setattr(canonical_erp_reads, "_rows", fake_rows)
    result = canonical_erp_reads.gst_adjustment_notes(
        from_date="2026-08-01", to_date="2026-08-31", note_type="all",
        side="sales", user={}, db=object(),
    )

    assert result["total"] == 1
    assert captured["params"] == {
        "org_id": org_id, "from_date": "2026-08-01", "to_date": "2026-08-31",
        "side": "sales", "note_type": "all",
    }
    assert "note.status='posted'" in captured["sql"]
    assert "note.note_date >= CAST(:from_date AS date)" in captured["sql"]
    assert "note.note_date <= CAST(:to_date AS date)" in captured["sql"]
    assert "note.side=:side" in captured["sql"]
    assert "note.side, note.direction, note.document_effect" in captured["sql"]


def test_canonical_receivables_use_effective_allocations_and_tenant_scope() -> None:
    source = inspect.getsource(canonical_erp_reads._canonical_receivable_rows)

    assert "finance.open_items" in source
    assert "finance.allocations" in source
    assert "item.org_id=:org_id" in source
    assert "allocation.org_id=:org_id" in source
    assert "reversal.reversal_of_allocation_id=allocation.id" in source
    assert "item.item_side='receivable'" in source
    # Outstanding receivables must exclude both reversed and already-settled
    # items. The canonical state constraint permits only open/settled/reversed.
    assert "item.status='open'" in source
    assert "finance.accounting_events" in source
    assert "event.sales_invoice_id IS NOT NULL" in source
    assert "sales.invoices" in source
    assert "invoice.status='posted'" in source
    assert "invoice.branch_id=ANY(CAST(:branch_ids AS uuid[]))" in source
    assert "'invoice_id', receivable.sales_invoice_id" in source
    assert "'open_item_id', receivable.open_item_id" in source
    assert "parties.customer_accounts" in source
    assert "customer.status='active'" not in source
    assert "party.status='active'" not in source
    assert "jsonb_agg(jsonb_build_object(" in source


def test_canonical_receivables_bind_signed_branch_visibility(monkeypatch) -> None:
    captured = {}
    branch_id = uuid4()

    def fake_rows(_db, sql, params):
        captured.update(sql=sql, params=params)
        return []

    monkeypatch.setattr(canonical_erp_reads, "_rows", fake_rows)
    canonical_erp_reads._canonical_receivable_rows(
        object(), uuid4(), {"branch_ids": [str(branch_id)], "data_access_level": "branch"},
    )

    assert captured["params"]["organization_scope"] is False
    assert captured["params"]["branch_ids"] == [branch_id]


def test_customer_and_sales_order_gstin_reads_require_active_registration() -> None:
    assert "r.registration_type='GSTIN' AND r.status='active'" in canonical_erp_reads._PARTY_CONTACTS
    detail_source = inspect.getsource(
        canonical_erp_reads.canonical_sales_order_compatibility_detail
    )
    assert "registration_type='GSTIN' AND status='active'" in detail_source


def test_ledger_aging_returns_ui_compatible_canonical_summary(monkeypatch) -> None:
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: uuid4())
    monkeypatch.setattr(canonical_erp_reads, "_canonical_receivable_rows", lambda *_args: [{
        "customer_id": uuid4(), "total_outstanding": 100, "overdue_amount": 60,
        "current": 40, "days_1_30": 20, "days_31_60": 40,
        "days_61_90": 0, "over_90": 0, "current_count": 1,
        "days_1_30_count": 1, "days_31_60_count": 1,
        "days_61_90_count": 0, "over_90_count": 0,
    }])

    result = canonical_erp_reads.canonical_ledger_aging(
        party_type="customer", user={}, db=object(),
    )

    assert result["summary"] == {
        "total": "100.00", "current": "40.00", "overdue": "60.00", "party_count": 1,
        "1_30": "20.00", "31_60": "40.00", "61_90": "0.00", "over_90": "0.00",
        "current_count": 1, "1_30_count": 1, "31_60_count": 1,
        "61_90_count": 0, "over_90_count": 0,
    }


def test_collection_aging_exposes_real_contact_and_collection_metrics(monkeypatch) -> None:
    customer_id = uuid4()
    party_id = uuid4()
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: uuid4())
    monkeypatch.setattr(canonical_erp_reads, "_canonical_receivable_rows", lambda *_args: [{
        "customer_id": customer_id, "party_id": party_id, "customer_name": "Test Buyer",
        "phone": "9876543210", "email": "buyer@example.com", "location": "Mumbai",
        "credit_limit": 200, "total_outstanding": 100, "overdue_amount": 60,
        "max_overdue_days": 45, "oldest_invoice_date": "2026-06-01",
        "last_payment_date": "2026-08-20", "current": 40,
        "days_1_30": 0, "days_31_60": 60, "days_61_90": 0, "over_90": 0,
    }])
    monkeypatch.setattr(canonical_erp_reads, "_rows", lambda *_args: [{
        "today_collections": 10, "week_collections": 20, "month_collections": 25,
    }])

    result = canonical_erp_reads.canonical_collection_aging(user={}, db=object())

    assert result["summary"]["currentDayCollections"] == "10.00"
    assert result["summary"]["currentMonthCollections"] == "25.00"
    assert result["summary"]["collectionEfficiency"] is None
    assert result["parties"][0] == {
        "id": customer_id, "partyId": party_id, "name": "Test Buyer",
        "phone": "9876543210", "email": "buyer@example.com", "location": "Mumbai",
        "outstandingAmount": "100.00", "overdueAmount": "60.00", "daysOverdue": 45,
        "creditLimit": "200.00",
        "oldestInvoiceDate": "2026-06-01", "lastPayment": "2026-08-20",
        "agingStatus": "overdue", "agingBand": "31-60",
        "agingBreakdown": [
            {"range": "Current", "amount": "40.00"}, {"range": "1-30", "amount": "0.00"},
            {"range": "31-60", "amount": "60.00"}, {"range": "61-90", "amount": "0.00"},
            {"range": "90+", "amount": "0.00"},
        ],
    }


def test_gst_dashboard_current_and_previous_are_distinct_exact_projections(monkeypatch) -> None:
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: uuid4())

    def fake_rows(_db, _sql, params):
        if params["period"] == "current":
            return [{"date_from": "2026-08-01", "date_to": "2026-08-25", "output_tax": Decimal("9007199254740993.01"), "input_credit": 0, "net_payable": Decimal("9007199254740993.01")}]
        return [{"date_from": "2026-07-01", "date_to": "2026-07-31", "output_tax": Decimal("1.00"), "input_credit": 0, "net_payable": Decimal("1.00")}]

    monkeypatch.setattr(canonical_erp_reads, "_rows", fake_rows)
    current = canonical_erp_reads.gst_dashboard(period="current", user={}, db=object())
    previous = canonical_erp_reads.gst_dashboard(period="previous", user={}, db=object())

    assert current["period"] != previous["period"]
    assert current["outputTax"] == "9007199254740993.01"
    assert previous["outputTax"] == "1.00"


def test_gstr3b_returns_exact_money_and_rejects_an_inverted_period(monkeypatch) -> None:
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: uuid4())
    monkeypatch.setattr(canonical_erp_reads, "_rows", lambda *_args: [{
        "output_cgst": Decimal("9007199254740993.01"), "output_sgst": Decimal("2.00"),
        "output_igst": 0, "output_cess": 0, "input_cgst": Decimal("0.01"),
        "input_sgst": 0, "input_igst": 0, "input_cess": 0,
    }])

    result = canonical_erp_reads.canonical_gstr3b_report(
        date_from=date(2026, 8, 1), date_to=date(2026, 8, 31), user={}, db=object(),
    )
    assert result["outputTax"]["cgst"] == "9007199254740993.01"
    assert result["netPayable"] == "9007199254740995.00"
    with pytest.raises(HTTPException) as exc:
        canonical_erp_reads.canonical_gstr3b_report(
            date_from=date(2026, 9, 1), date_to=date(2026, 8, 31), user={}, db=object(),
        )
    assert exc.value.status_code == 422


def test_gstr1_threshold_is_date_effective_reviewed_data_and_has_no_application_default() -> None:
    source = inspect.getsource(canonical_erp_reads.canonical_gstr1_report)
    coverage = inspect.getsource(canonical_erp_reads._ensure_gstr1_rule_coverage)

    assert "250000" not in source
    assert "100000" not in source
    assert "reporting_rule.b2cl_threshold_amount" in source
    assert "invoice.grand_total>reporting_rule.b2cl_threshold_amount" in source
    assert "invoice.supply_type='inter_state'" in source
    assert "invoice.buyer_gstin_snapshot" in source
    assert "rule.effective_from<=invoice.invoice_date" in source
    assert "rule.effective_to>=invoice.invoice_date" in source
    assert "COUNT(release.id) AS rule_count" in coverage
    assert "candidate.rule_count<>1" in coverage


def test_gstr1_fails_closed_when_reviewed_rules_are_not_installed(monkeypatch) -> None:
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: uuid4())
    monkeypatch.setattr(canonical_erp_reads, "_rows", lambda *_args: [{"relation": None}])

    with pytest.raises(HTTPException) as exc:
        canonical_erp_reads.canonical_gstr1_report(
            date_from=date(2024, 7, 31), date_to=date(2024, 8, 1), user={}, db=object(),
        )
    assert exc.value.status_code == 503
    assert "not installed" in exc.value.detail


def test_gstr1_rule_coverage_rejects_a_gap_or_overlap_at_the_effective_date_boundary(monkeypatch) -> None:
    calls = []

    def fake_rows(_db, sql, params):
        calls.append((sql, params))
        if "to_regclass" in sql:
            return [{"relation": "tax.gstr1_reporting_rule_versions"}]
        return [{"invalid_dates": 1}]

    monkeypatch.setattr(canonical_erp_reads, "_rows", fake_rows)
    with pytest.raises(HTTPException) as exc:
        canonical_erp_reads._ensure_gstr1_rule_coverage(
            object(), uuid4(), date(2024, 7, 31), date(2024, 8, 1),
        )

    assert exc.value.status_code == 503
    assert "Exactly one reviewed" in exc.value.detail
    coverage_sql, coverage_params = calls[1]
    assert "COUNT(release.id) AS rule_count" in coverage_sql
    assert "candidate.rule_count<>1" in coverage_sql
    assert coverage_params["date_from"] == date(2024, 7, 31)
    assert coverage_params["date_to"] == date(2024, 8, 1)


def test_gstr3b_and_dashboard_itc_require_eligible_lines_and_parsed_gstr2b() -> None:
    gstr3b = inspect.getsource(canonical_erp_reads.canonical_gstr3b_report)
    dashboard = inspect.getsource(canonical_erp_reads.gst_dashboard)
    for source in (gstr3b, dashboard):
        assert "line.itc_eligibility='eligible'" in source
        assert "portal_document.portal_document_type='gstr2b'" in source
        assert "portal_document.status='parsed'" in source
        assert "portal_document.parsed_at IS NOT NULL" in source
        assert "command.status='succeeded'" in source
        assert "AND EXISTS (" in source
        assert "Eligible purchase adjustments require canonical GSTR-2B ITC projection" in source
    assert "return_period.period_start>=:date_from" in gstr3b
    assert "return_period.period_end<=:date_to" in gstr3b
    assert "supplier_invoice_date BETWEEN :date_from AND :date_to" not in gstr3b


@pytest.mark.parametrize("itc_eligibility", ["ineligible", "blocked", "pending", None])
def test_gstr3b_query_excludes_ineligible_or_unattested_supplier_tax(
    itc_eligibility,
) -> None:
    """The SQL predicate admits only eligible lines; inner EXISTS excludes unmatched 2B facts."""
    source = inspect.getsource(canonical_erp_reads.canonical_gstr3b_report)

    assert itc_eligibility != "eligible"
    assert "line.itc_eligibility='eligible'" in source
    assert "command.status='succeeded'" in source
    assert "portal_document.portal_document_type='gstr2b'" in source
    assert "portal_document.status='parsed'" in source


def test_gstr3b_fails_closed_for_eligible_matched_purchase_adjustments(monkeypatch) -> None:
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: uuid4())
    monkeypatch.setattr(canonical_erp_reads, "_rows", lambda *_args: [{
        "unsupported_input_adjustments": 1,
    }])

    with pytest.raises(HTTPException) as exc:
        canonical_erp_reads.canonical_gstr3b_report(
            date_from=date(2026, 8, 1), date_to=date(2026, 8, 31), user={}, db=object(),
        )
    assert exc.value.status_code == 503
    assert "purchase adjustments" in exc.value.detail


def test_supplier_aging_fails_closed_instead_of_returning_a_fake_empty_success(monkeypatch) -> None:
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: uuid4())
    with pytest.raises(HTTPException) as exc:
        canonical_erp_reads.canonical_ledger_aging(
            party_type="supplier", user={}, db=object(),
        )
    assert exc.value.status_code == 503


def test_legacy_inventory_aggregates_are_replaced_by_branch_scoped_authority() -> None:
    source = Path(canonical_erp_reads.__file__).read_text(encoding="utf-8")
    assert '@router.get("/inventory/stock/current")' not in source
    assert '@router.get("/inventory/list")' not in source
    matches = [
        route for route in _effective_route_leaves(app.routes)
        if route.path == "/api/canonical/inventory/current-stock"
        and "GET" in (route.methods or set())
    ]
    assert len(matches) == 1
    assert matches[0].endpoint.__module__ == "app.api.routes.canonical_inventory_reads"


class ProductDraftDatabase:
    def __init__(self) -> None:
        self.statements = []
        self.commits = 0

    def execute(self, statement, params):
        sql = str(statement)
        self.statements.append(sql)
        if "activate_context" in sql:
            return SimpleNamespace()
        if "SELECT 1 FROM catalog.products" in sql:
            return SimpleNamespace(first=lambda: None)
        if "INSERT INTO catalog.products" in sql:
            row = SimpleNamespace(id=uuid4(), sku=params["sku"], name=params["name"])
            return SimpleNamespace(one=lambda: row)
        raise AssertionError(sql)

    def commit(self):
        self.commits += 1


def test_product_draft_write_uses_canonical_catalog_and_returns_uuid() -> None:
    database = ProductDraftDatabase()
    result = canonical_erp_reads.create_product_draft(
        canonical_erp_reads.CanonicalProductDraftCreate(
            product_name="E2E draft",
            product_code="PROD-E2E",
            product_kind="medicine",
        ),
        user={"org_id": str(uuid4()), "auth_user_id": str(uuid4())},
        db=database,
    )

    assert result["lifecycle_status"] == "draft"
    assert result["product_code"] == "PROD-E2E"
    assert str(result["product_id"])
    assert database.commits == 1
    sql = "\n".join(database.statements)
    assert "catalog.products" in sql
    assert "inventory.products" not in sql


def test_master_write_classifications_have_no_hidden_business_defaults() -> None:
    with pytest.raises(ValidationError) as product_error:
        canonical_erp_reads.CanonicalProductDraftCreate(product_name="Unclassified")
    assert {error["loc"] for error in product_error.value.errors()} == {
        ("product_code",),
        ("product_kind",),
    }

    with pytest.raises(ValidationError) as address_error:
        canonical_erp_reads.CanonicalCustomerAddressWrite(
            address_line1="202 Synthetic Retail Lane",
            city="Pune",
            state_code="27",
            pincode="411001",
        )
    assert {error["loc"] for error in address_error.value.errors()} == {
        ("address_type",),
        ("is_default",),
    }

    with pytest.raises(ValidationError) as customer_error:
        canonical_erp_reads.CanonicalCustomerCreate(
            customer_name="Unclassified customer",
            primary_phone="9876543210",
        )
    assert {error["loc"] for error in customer_error.value.errors()} == {
        ("customer_code",),
        ("customer_type",),
        ("credit_limit",),
        ("credit_days",),
    }

    with pytest.raises(ValidationError) as supplier_error:
        canonical_erp_reads.CanonicalSupplierCreate(supplier_name="Unclassified supplier")
    assert {error["loc"] for error in supplier_error.value.errors()} == {
        ("supplier_code",),
        ("payment_days",),
    }


def test_master_codes_are_explicit_and_never_derived_from_request_uuids() -> None:
    source = Path(canonical_erp_reads.__file__).read_text(encoding="utf-8")
    for generated_prefix in ("CUST-{uuid4", "SUP-{uuid4", "DRAFT-{uuid4"):
        assert generated_prefix not in source

    assert canonical_erp_reads.CanonicalProductDraftCreate(
        product_name="Explicit product",
        product_code="PROD-001",
        product_kind="medicine",
    ).product_code == "PROD-001"


def test_party_address_state_code_has_no_application_owned_name_mapping() -> None:
    source = Path(canonical_erp_reads.__file__).read_text(encoding="utf-8")
    assert "INDIAN_STATE_CODES" not in source
    assert "Unsupported Indian state" not in source

    assert canonical_erp_reads._validated_state_code("27", None) == "27"
    assert canonical_erp_reads._validated_state_code(None, "27AAPFU0939F1ZV") == "27"

    with pytest.raises(HTTPException) as error:
        canonical_erp_reads._validated_state_code("29", "27AAPFU0939F1ZV")
    assert error.value.status_code == 422
    assert error.value.detail == (
        "GSTIN state code does not match the address state code"
    )

    with pytest.raises(ValidationError):
        canonical_erp_reads.CanonicalCustomerAddressWrite(
            address_line1="202 Synthetic Retail Lane",
            city="Pune",
            state_code="Maharashtra",
            pincode="411001",
            address_type="billing",
            is_default=True,
        )


class ProductDraftDeleteDatabase:
    def __init__(self) -> None:
        self.product_id = uuid4()
        self.statements = []
        self.commits = 0
        self.rollbacks = 0

    def execute(self, statement, params):
        sql = str(statement)
        self.statements.append(sql)
        if "activate_context" in sql:
            return SimpleNamespace()
        if "DELETE FROM catalog.products" in sql:
            row = SimpleNamespace(id=self.product_id, sku="DRAFT-E2E", name="E2E draft")
            return SimpleNamespace(first=lambda: row)
        raise AssertionError(sql)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


def test_delete_product_draft_is_bounded_to_draft_lifecycle() -> None:
    database = ProductDraftDeleteDatabase()
    result = canonical_erp_reads.delete_product_draft(
        database.product_id,
        user={"org_id": str(uuid4()), "auth_user_id": str(uuid4())},
        db=database,
    )

    assert result["success"] is True
    assert result["product_id"] == database.product_id
    assert database.commits == 1
    assert database.rollbacks == 0
    sql = "\n".join(database.statements)
    assert "DELETE FROM catalog.products" in sql
    assert "status='draft'" in sql


def test_tax_master_does_not_double_count_intra_and_interstate_rates() -> None:
    source = inspect.getsource(canonical_erp_reads.tax_codes)
    assert "GREATEST(cgst_rate+sgst_rate, igst_rate)+cess_rate AS total_rate" in source
    assert "cgst_rate+sgst_rate+igst_rate+cess_rate AS total_rate" not in source


def test_purchase_return_reads_use_canonical_receipt_allocation_lineage() -> None:
    list_source = inspect.getsource(canonical_erp_reads.returnable_supplier_invoices)
    item_source = inspect.getsource(canonical_erp_reads.returnable_supplier_invoice_items)

    for source in (list_source, item_source):
        assert "procurement.supplier_invoice_receipt_allocations" in source
        assert "procurement.purchase_return_lines" in source
        assert "return_header.status='posted'" in source
    assert "supplier_invoice_receipt_allocation_id" in item_source
    assert "invoice_id: UUID" in item_source
    assert "user: dict = PURCHASE_USER" in item_source
    assert "remaining_base_billed_quantity" in item_source
    assert "remaining_base_free_quantity" in item_source
    assert "returnable_free_quantity" in item_source
    assert "invoice_line.uom_conversion_factor" in item_source
    assert "product.base_uom_code" in item_source
    assert "allocation.allocated_base_free_quantity>returned.base_free" in item_source
    assert "FROM procurement.supplier_invoice_items" not in item_source
    assert "grn_items" not in item_source


def test_purchase_history_reads_apply_search_status_dates_and_real_totals() -> None:
    purchase_source = inspect.getsource(canonical_erp_reads.purchase_orders)
    invoice_source = inspect.getsource(canonical_erp_reads.supplier_invoices)
    receipt_source = inspect.getsource(canonical_erp_reads.goods_receipts)

    assert "purchase.purchase_order_number ILIKE" in purchase_source
    assert "purchase.status=:status" in purchase_source
    assert "count(*) OVER() AS _total" in purchase_source
    assert "payment_status" in invoice_source
    assert "finance.open_items" in invoice_source
    assert "invoice.supplier_invoice_number ILIKE" in invoice_source
    assert "receipt.status=:status" in receipt_source
    assert "SUM(line.extended_cost) AS total_amount" in receipt_source
    assert "receipt.status='posted' AS stock_updated" in receipt_source


def test_inventory_movements_are_canonical_and_uuid_filterable() -> None:
    source = inspect.getsource(canonical_inventory_reads.movements)

    assert "product_id: Optional[UUID]" in source
    assert "batch_id: Optional[UUID]" in source
    assert "entry.product_id=:product_id" in source
    assert "entry.batch_id=:batch_id" in source
    assert "inventory.stock_ledger_entries" in source
    assert "inventory.batches" in source
    assert "entry.posted_at" in source
    assert "entry.entry_kind" in source
    assert "document.document_number" in source
