import inspect
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

from fastapi.routing import APIRoute
from pydantic import ValidationError

from app.api.routes import canonical_erp_reads
from app.core.utils import schema_validator
from app.main import app


CRITICAL_UI_READS = {
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
    "/api/sale-returns/",
    "/api/purchase-returns/",
    "/api/payments/search",
    "/api/gst/dashboard",
    "/api/ledger/aging",
    "/api/collection-center/collection/aging-data",
    "/api/inventory/list",
    "/api/financial/summary",
    "/api/dashboard/stats",
    "/api/settings/features",
}


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
        return [{"order_id": order_id, "items": [{"product_id": uuid4()}]}]

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
        assert "'quantity', line.billed_quantity" in sql
        assert "'unit_price', line.quoted_unit_rate" in sql


def test_order_and_challan_import_details_include_canonical_batch_allocations(monkeypatch) -> None:
    captured = []
    org_id = uuid4()
    order_id = uuid4()
    challan_id = uuid4()
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: org_id)

    def fake_rows(_db, sql, params):
        captured.append((sql, params))
        if "FROM sales.dispatches dispatch" in sql:
            return [{"challan_id": challan_id, "items": [{"batch_id": uuid4()}]}]
        return [{"order_id": order_id, "items": [{"batch_id": uuid4()}]}]

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


def test_return_history_reads_filter_and_project_original_documents(monkeypatch) -> None:
    captured = []
    org_id = uuid4()
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: org_id)

    def fake_rows(_db, sql, params):
        captured.append((sql, params))
        return [{"return_id": uuid4(), "filtered_total": 3}]

    monkeypatch.setattr(canonical_erp_reads, "_rows", fake_rows)
    sales = canonical_erp_reads.sales_returns(
        limit=25, skip=0, offset=25, search="DEMO", status="posted",
        from_date="2026-08-01", to_date="2026-08-31", user={}, db=object(),
    )
    purchases = canonical_erp_reads.purchase_returns(
        limit=25, skip=0, offset=0, search="SUPPLIER", status="approved",
        from_date=None, to_date=None, user={}, db=object(),
    )

    assert sales["total"] == 3
    assert purchases["total"] == 3
    assert "invoice.invoice_number AS original_document_no" in captured[0][0]
    assert "FROM sales.return_lines line" in captured[0][0]
    assert captured[0][1]["offset"] == 25
    assert captured[0][1]["status"] == "posted"
    assert "invoice.supplier_invoice_number AS original_document_no" in captured[1][0]
    assert "FROM procurement.purchase_return_lines line" in captured[1][0]


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

    assert result == {"orders": [], "total": 0, "page": 1, "per_page": 50, "total_pages": 1}
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
        "customer_type": "pharmacy",
        "primary_phone": "9876543210",
        "primary_email": "buyer@example.com",
        "address_line1": "Test Lane 1",
        "city": "Mumbai",
        "state": "Maharashtra",
        "pincode": "400001",
        "credit_limit": 5000,
        "credit_days": 30,
    })

    assert customer.primary_phone == "9876543210"
    assert customer.model_dump(exclude_none=True) == {
        "customer_name": "E2E Browser Customer",
        "customer_type": "pharmacy",
        "primary_phone": "9876543210",
        "primary_email": "buyer@example.com",
        "address_line1": "Test Lane 1",
        "city": "Mumbai",
        "state": "Maharashtra",
        "pincode": "400001",
        "credit_limit": customer.credit_limit,
        "credit_days": 30,
    }


def test_reviewed_party_create_contracts_reject_unowned_and_partial_facts() -> None:
    try:
        canonical_erp_reads.CanonicalCustomerCreate.model_validate({
            "customer_name": "Bad Boundary",
            "customer_type": "retail",
            "primary_phone": "9876543210",
            "org_id": str(uuid4()),
        })
    except ValidationError as exc:
        assert "Extra inputs are not permitted" in str(exc)
    else:
        raise AssertionError("tenant identity must not be accepted from the browser")

    try:
        canonical_erp_reads.CanonicalSupplierCreate.model_validate({
            "supplier_name": "Partial Address Supplier",
            "primary_phone": "9876543210",
            "city": "Mumbai",
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
            primary_phone="9876543210",
        ),
        user={},
        db=customer_db,
    )
    assert customer["customer_id"] == customer_account_id
    assert customer["party_id"] == party_id
    assert customer["is_active"] is True
    assert customer["status"] == "active"
    assert customer_db.committed

    supplier_account_id = uuid4()
    supplier_db = _CreatedAccountSession(supplier_account_id)
    supplier = canonical_erp_reads.create_supplier(
        canonical_erp_reads.CanonicalSupplierCreate(
            supplier_name="Active Supplier",
            primary_phone="9876543210",
        ),
        user={},
        db=supplier_db,
    )
    assert supplier["supplier_id"] == supplier_account_id
    assert supplier["party_id"] == party_id
    assert supplier["is_active"] is True
    assert supplier["status"] == "active"
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


def test_company_profile_projects_canonical_invoice_identity_and_settlement_details() -> None:
    source = Path(canonical_erp_reads.__file__).read_text(encoding="utf-8")

    assert "organization.legal_name" in source
    assert "registration.gstin AS gst_number" in source
    assert "COALESCE(license.licenses, '[]'::jsonb) AS licenses" in source
    assert "COALESCE(bank.accounts, '[]'::jsonb) AS bank_accounts" in source
    assert "FROM compliance.licenses" in source
    assert "FROM finance.bank_accounts" in source


def test_hsn_report_projects_complete_numeric_contract_for_selected_period() -> None:
    source = Path(canonical_erp_reads.__file__).read_text(encoding="utf-8")

    assert "AS tax_amount" in source
    assert "AS tax_rate" in source
    assert ":date_from IS NULL OR invoice.invoice_date" in source
    assert ":date_to IS NULL OR invoice.invoice_date" in source


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
    assert result["outputTax"] == 12
    assert captured["params"]["period"] == "previous"
    assert "invoice_date BETWEEN period.date_from AND period.date_to" in captured["sql"]
    assert "supplier_invoice_date BETWEEN period.date_from AND period.date_to" in captured["sql"]
    assert captured["sql"].count("status='posted'") == 2


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
    assert "item.status<>'reversed'" in source
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
        "total": 100, "current": 40, "overdue": 60, "party_count": 1,
        "1_30": 20, "31_60": 40, "61_90": 0, "over_90": 0,
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

    assert result["summary"]["currentDayCollections"] == 10
    assert result["summary"]["currentMonthCollections"] == 25
    assert result["summary"]["collectionEfficiency"] == 20.0
    assert result["parties"][0] == {
        "id": customer_id, "partyId": party_id, "name": "Test Buyer",
        "phone": "9876543210", "email": "buyer@example.com", "location": "Mumbai",
        "outstandingAmount": 100, "overdueAmount": 60, "daysOverdue": 45,
        "creditLimit": 200, "creditUtilization": 50.0,
        "oldestInvoiceDate": "2026-06-01", "lastPayment": "2026-08-20",
        "lastFollowUp": None, "promiseDate": None, "assignedAgent": None,
        "riskScore": 20, "paymentHistory": "Average", "collectionSuccess": 80,
        "agingBreakdown": [
            {"range": "Current", "amount": 40}, {"range": "1-30", "amount": 0},
            {"range": "31-60", "amount": 60}, {"range": "61-90", "amount": 0},
            {"range": "90+", "amount": 0},
        ],
    }


def test_current_stock_projects_one_canonical_row_per_product() -> None:
    source = Path(canonical_erp_reads.__file__).read_text(encoding="utf-8")

    assert "SUM(balance.on_hand_quantity) AS total_quantity_available" in source
    assert "SUM(balance.inventory_value) AS total_value" in source
    assert "GROUP BY balance.product_id" in source


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
        canonical_erp_reads.CanonicalProductDraftCreate(product_name="E2E draft"),
        user={"org_id": str(uuid4()), "auth_user_id": str(uuid4())},
        db=database,
    )

    assert result["lifecycle_status"] == "draft"
    assert str(result["product_id"])
    assert database.commits == 1
    sql = "\n".join(database.statements)
    assert "catalog.products" in sql
    assert "inventory.products" not in sql


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
    source = inspect.getsource(canonical_erp_reads.inventory_movements)

    assert "product_id: Optional[UUID]" in source
    assert "batch_id: Optional[UUID]" in source
    assert "entry.product_id=:product_id" in source
    assert "entry.batch_id=:batch_id" in source
    assert "inventory.stock_ledger_entries" in source
    assert "inventory.batches" in source
    assert "movement_date" in source
    assert "movement_type" in source
    assert "reference_number" in source
