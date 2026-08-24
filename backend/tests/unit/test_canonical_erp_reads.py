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
    "/api/grn/",
    "/api/sale-returns/",
    "/api/purchase-returns/",
    "/api/payments/search",
    "/api/gst/dashboard",
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
    detail_source = inspect.getsource(canonical_erp_reads.canonical_invoice)

    for source in (list_source, detail_source):
        assert "buyer_gstin_snapshot AS customer_gst_number" in source
        assert "gst_taxable_total" in source and "AS taxable_amount" in source
        assert "cgst_total" in source and "AS cgst_amount" in source
        assert "sgst_total" in source and "AS sgst_amount" in source
        assert "igst_total" in source and "AS igst_amount" in source
        assert "cess_total" in source and "AS cess_amount" in source


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
