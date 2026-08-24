from __future__ import annotations

import inspect
import json
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.routes.internal import mcp_canonical_resolution_reads as reads
from app.api.routes.internal.mcp_canonical_reads import CanonicalDelegation
from app.api.routes.internal.mcp_contract import (
    CANONICAL_READ_POLICIES,
    PLANNED_RESOLUTION_READ_POLICIES,
    policy_for,
)


ROOT = Path(__file__).resolve().parents[3]


class _Result:
    def __init__(self, rows):
        self.rows = rows

    def fetchall(self):
        return self.rows


class _Database:
    def __init__(self, *results):
        self.results = list(results)
        self.calls = []

    def execute(self, statement, params=None):
        self.calls.append((str(statement), params or {}))
        return _Result(self.results.pop(0))


def _row(**values):
    return SimpleNamespace(_mapping=values)


def _context(operation_key, branch=True, sensitive=False):
    return CanonicalDelegation(
        auth_user_id=uuid4(),
        user_id=uuid4(),
        organization_id=uuid4(),
        membership_id=uuid4(),
        agent_grant_id=uuid4(),
        client_id="client-1",
        policy=PLANNED_RESOLUTION_READ_POLICIES[operation_key],
        branch_id=uuid4() if branch else None,
        allow_sensitive_read=sensitive,
    )


def test_ten_resolution_policies_match_operator_contract_and_are_published():
    contract = json.loads(
        (ROOT / "docs/architecture/mcp-operator-actions.json").read_text(encoding="utf-8")
    )
    declared = {item["operation_key"]: item for item in contract["resolution_reads"]}
    assert set(PLANNED_RESOLUTION_READ_POLICIES) == set(declared)
    for operation_key, policy in PLANNED_RESOLUTION_READ_POLICIES.items():
        item = declared[operation_key]
        assert policy.capability_code == operation_key
        assert policy.permission_code == item["permission"]
        assert policy.maximum_records == item["max_records"]
        assert policy.path.startswith("/internal/mcp/resolution/")
        assert policy.exposed_in_mcp is True
        assert policy.readiness_verified is True
        assert policy_for(operation_key) is policy

    assert set(CANONICAL_READ_POLICIES) == {
        "master.products.search", "master.suppliers.search", "gst.settings.get"
    }
    service = json.loads(
        (ROOT / "backend/mcp_runtime/service-contract.json").read_text(encoding="utf-8")
    )
    assert {
        item["tool"] for item in contract["resolution_reads"]
    }.issubset(service["tools"])


def test_ten_resolution_routes_are_hidden_get_only_and_have_no_generic_filter():
    assert {route.path for route in reads.router.routes} == {
        policy.path for policy in PLANNED_RESOLUTION_READ_POLICIES.values()
    }
    assert len(reads.router.routes) == 10
    assert all(route.include_in_schema is False for route in reads.router.routes)
    assert all(route.methods == {"GET"} for route in reads.router.routes)

    allowed_parameters = {
        "canonical_customer_search": {"search_term", "limit", "context", "db"},
        "canonical_location_search": {"search_term", "limit", "context", "db"},
        "canonical_stock_batch_search": {"product_id", "location_id", "limit", "context", "db"},
        "canonical_sales_order_get": {"sales_order_id", "order_number", "fiscal_year", "context", "db"},
        "canonical_sales_invoice_get": {"sales_invoice_id", "invoice_number", "fiscal_year", "context", "db"},
        "canonical_purchase_order_get": {"purchase_order_id", "purchase_order_number", "fiscal_year", "context", "db"},
        "canonical_goods_receipt_get": {"goods_receipt_id", "goods_receipt_number", "fiscal_year", "context", "db"},
        "canonical_supplier_invoice_get": {"supplier_invoice_id", "supplier_invoice_number", "fiscal_year", "context", "db"},
        "canonical_open_item_search": {"party_id", "item_side", "currency_code", "due_on_or_before", "limit", "context", "db"},
        "canonical_settlement_choice_search": {"currency_code", "limit", "context", "db"},
    }
    for name, expected in allowed_parameters.items():
        assert set(inspect.signature(getattr(reads, name)).parameters) == expected


def test_sql_contract_uses_only_canonical_relations_and_exact_scope_predicates():
    source = (ROOT / "backend/app/api/routes/internal/mcp_canonical_resolution_reads.py").read_text(
        encoding="utf-8"
    )
    for relation in (
        "parties.customer_accounts", "inventory.locations", "inventory.stock_balances",
        "sales.orders", "sales.invoices", "procurement.purchase_orders",
        "procurement.goods_receipts", "procurement.supplier_invoices", "finance.open_items",
        "finance.accounts", "finance.bank_accounts",
    ):
        assert relation in source
    for forbidden in (
        "master.customers", "master.products", "stock.current_stock",
        "invoice_service", "purchase_service", "SUPABASE_SERVICE_ROLE_KEY",
    ):
        assert forbidden not in source
    assert source.count("org_id=:org_id") >= 9
    assert "branch_id=:branch_id" in source
    assert "LIMIT :limit" in source
    assert "LIMIT 2" in source
    assert "get_canonical_delegation" in source


def test_customer_search_signals_ambiguous_exact_matches_without_guessing():
    customer_rows = [
        _row(
            customer_account_id=uuid4(), party_id=uuid4(), customer_code="C-1",
            legal_name="Same Name", trade_name=None, gstin=None, phone=None,
            account_status="active", party_status="active", row_version=1,
            _exact_match=True,
        ),
        _row(
            customer_account_id=uuid4(), party_id=uuid4(), customer_code="C-2",
            legal_name="Same Name", trade_name=None, gstin=None, phone=None,
            account_status="active", party_status="active", row_version=3,
            _exact_match=True,
        ),
    ]
    database = _Database(customer_rows)
    result = reads.canonical_customer_search(
        "Same Name", 50, _context("parties.customers.search", branch=False, sensitive=True), database
    )
    assert result.match_state == "ambiguous"
    assert result.requires_selection is True
    assert result.exact_match_count == 2
    assert len(result.results) == 2
    assert database.calls[0][1]["limit"] == 50


def test_branch_reads_fail_closed_without_exact_delegated_branch():
    with pytest.raises(HTTPException) as denied:
        reads.canonical_location_search(
            "MAIN", 20, _context("inventory.locations.search", branch=False), _Database()
        )
    assert denied.value.status_code == 403

    with pytest.raises(HTTPException) as settlement_denied:
        reads.canonical_settlement_choice_search(
            "INR", 20,
            _context("finance.settlement_choices.search", branch=False),
            _Database(),
        )
    assert settlement_denied.value.status_code == 403


def test_document_number_collision_is_explicit_and_does_not_load_lines():
    rows = [
        _row(sales_order_id=uuid4()),
        _row(sales_order_id=uuid4()),
    ]
    database = _Database(rows)
    result = reads.canonical_sales_order_get(
        None, "SO-1", None, _context("sales.orders.get"), database
    )
    assert result.match_state == "ambiguous"
    assert result.document is None
    assert result.requires_selection is True
    assert len(database.calls) == 1


def test_all_ten_routes_execute_bounded_canonical_queries_for_empty_results():
    calls = [
        lambda: reads.canonical_customer_search(
            "missing", 20, _context("parties.customers.search", branch=False, sensitive=True), _Database([])
        ),
        lambda: reads.canonical_location_search(
            "MISSING", 20, _context("inventory.locations.search"), _Database([])
        ),
        lambda: reads.canonical_stock_batch_search(
            uuid4(), None, 50, _context("inventory.stock_batches.search"), _Database([])
        ),
        lambda: reads.canonical_sales_order_get(
            uuid4(), None, None, _context("sales.orders.get"), _Database([])
        ),
        lambda: reads.canonical_sales_invoice_get(
            uuid4(), None, None, _context("sales.invoices.get"), _Database([])
        ),
        lambda: reads.canonical_purchase_order_get(
            uuid4(), None, None, _context("procurement.purchase_orders.get"), _Database([])
        ),
        lambda: reads.canonical_goods_receipt_get(
            uuid4(), None, None, _context("procurement.goods_receipts.get"), _Database([])
        ),
        lambda: reads.canonical_supplier_invoice_get(
            uuid4(), None, None, _context("procurement.supplier_invoices.get"), _Database([])
        ),
        lambda: reads.canonical_open_item_search(
            uuid4(), "payable", "INR", None, 50,
            _context("finance.open_items.search"), _Database([])
        ),
        lambda: reads.canonical_settlement_choice_search(
            "INR", 50, _context("finance.settlement_choices.search"), _Database([])
        ),
    ]
    results = [call() for call in calls]
    assert len(results) == 10


def test_decimal_fields_serialize_as_exact_json_strings():
    payload = reads.StockBatchMatch(
        product_id=uuid4(), batch_id=uuid4(), batch_number="B-1",
        lot_kind="manufacturer_batch", batch_status="released",
        manufactured_on=None, expires_on=None, mrp=Decimal("123.45"),
        mrp_uom_conversion_id=uuid4(), mrp_marketed_uom_code="BOX",
        mrp_base_uom_code="EA", mrp_pack_to_base_multiplier=Decimal("10.000000"),
        batch_row_version=1, branch_id=uuid4(), location_id=uuid4(),
        location_code="MAIN", location_name="Main", location_type="saleable",
        uom_code="EA", uom_conversions=[{
            "uom_conversion_id": uuid4(), "from_uom_code": "BOX",
            "to_uom_code": "EA", "conversion_factor": "10.000000",
            "valid_from": "2026-04-01", "valid_until": None,
        }], on_hand_quantity=Decimal("10.000000"),
        reserved_quantity=Decimal("3.000000"), available_quantity=Decimal("7.000000"),
        stock_row_version=2, fefo_expiry_tier=1,
    )
    encoded = payload.model_dump_json()
    assert '"mrp":"123.45"' in encoded
    assert '"mrp_marketed_uom_code":"BOX"' in encoded
    assert '"mrp_pack_to_base_multiplier":"10.000000"' in encoded
    assert '"available_quantity":"7.000000"' in encoded
    assert '"conversion_factor":"10.000000"' in encoded
    assert '"fefo_expiry_tier":1' in encoded


def test_resolution_sql_returns_exact_action_lineage_identifiers():
    product_source = (
        ROOT / "backend/app/api/routes/internal/mcp_canonical_reads.py"
    ).read_text(encoding="utf-8")
    resolution_source = (
        ROOT / "backend/app/api/routes/internal/mcp_canonical_resolution_reads.py"
    ).read_text(encoding="utf-8")
    assert "'uom_conversion_id', conversion.id" in product_source
    assert "'conversion_factor', conversion.multiplier::text" in product_source
    assert "'uom_conversion_id', conversion.id" in resolution_source
    assert "batch.mrp_uom_conversion_id" in resolution_source
    assert "mrp_conversion.from_uom_code AS mrp_marketed_uom_code" in resolution_source
    assert "dense_rank() OVER (" in resolution_source
    assert "PARTITION BY balance.product_id, balance.location_id" in resolution_source
    assert "ORDER BY batch.expires_on" in resolution_source
    assert "row_number() OVER (" not in resolution_source
    assert "batch.expires_on>CURRENT_DATE" in resolution_source
    assert "allocation.id AS invoice_dispatch_allocation_id" in resolution_source
    assert "allocation.id AS supplier_invoice_receipt_allocation_id" in resolution_source
    assert "return_line.invoice_dispatch_allocation_id=allocation.id" in resolution_source
    assert "return_line.supplier_invoice_receipt_allocation_id=allocation.id" in resolution_source


def test_sales_invoice_resolution_associates_batch_dispatch_allocation_balances():
    invoice_id, line_id, allocation_id = uuid4(), uuid4(), uuid4()
    header = _row(
        sales_invoice_id=invoice_id, branch_id=uuid4(), customer_account_id=uuid4(),
        seller_tax_registration_id=uuid4(), customer_tax_registration_id=None,
        invoice_number="INV-1", fiscal_year=2026, invoice_date=date(2026, 8, 20),
        due_date=None, invoice_type="tax_invoice", supply_type="intra_state",
        place_of_supply_state_code="27", currency_code="INR",
        grand_total=Decimal("118.00"), calculation_ruleset_version="gst-v1",
        posted_at=datetime(2026, 8, 20, 10), row_version=2,
    )
    line = _row(
        invoice_line_id=line_id, line_number=1, line_kind="product",
        order_line_id=uuid4(), product_id=uuid4(), charge_code=None, uom_code="BOX",
        base_billed_quantity=Decimal("10"), base_free_quantity=Decimal("2"),
        returned_base_billed_quantity=Decimal("3"), returned_base_free_quantity=Decimal("1"),
        returnable_base_billed_quantity=Decimal("7"), returnable_base_free_quantity=Decimal("1"),
        tax_code_version_id=uuid4(), taxability_snapshot="taxable",
        line_total=Decimal("118.00"),
    )
    allocation = _row(
        invoice_line_id=line_id, invoice_dispatch_allocation_id=allocation_id,
        inventory_document_id=uuid4(), inventory_document_line_id=uuid4(),
        dispatch_id=uuid4(), dispatch_line_id=uuid4(), dispatch_number="DSP-1",
        dispatch_date=date(2026, 8, 19), product_id=line._mapping["product_id"],
        batch_id=uuid4(), batch_number="BATCH-1", expires_on=date(2028, 9, 1),
        from_location_id=uuid4(), uom_code="BOX",
        allocated_base_billed_quantity=Decimal("10"),
        allocated_base_free_quantity=Decimal("2"),
        returned_base_billed_quantity=Decimal("3"),
        returned_base_free_quantity=Decimal("1"),
        remaining_base_billed_quantity=Decimal("7"),
        remaining_base_free_quantity=Decimal("1"),
    )
    database = _Database([header], [line], [allocation], [])
    result = reads.canonical_sales_invoice_get(
        invoice_id, None, None, _context("sales.invoices.get"), database,
    )
    lineage = result.document.lines[0].dispatch_allocations[0]
    assert lineage.invoice_dispatch_allocation_id == allocation_id
    assert lineage.remaining_base_billed_quantity == Decimal("7")
    assert lineage.remaining_base_free_quantity == Decimal("1")
    assert lineage.batch_number == "BATCH-1"
    assert lineage.expires_on == date(2028, 9, 1)
    dispatch_sql = database.calls[2][0]
    assert "inventory_line.sales_dispatch_line_id=dispatch_line.id" in dispatch_sql
    assert "inventory_document.sales_dispatch_id=dispatch.id" in dispatch_sql
    assert "inventory_document.status='posted'" in dispatch_sql


def test_sales_invoice_resolution_projects_authoritative_direct_issue_allocations():
    invoice_id, line_id = uuid4(), uuid4()
    header = _row(
        sales_invoice_id=invoice_id, branch_id=uuid4(), customer_account_id=uuid4(),
        seller_tax_registration_id=uuid4(), customer_tax_registration_id=None,
        invoice_number="INV-DIRECT-1", fiscal_year=2026,
        invoice_date=date(2026, 8, 24), due_date=date(2026, 8, 24),
        invoice_type="tax_invoice", supply_type="intra_state",
        place_of_supply_state_code="27", currency_code="INR",
        grand_total=Decimal("168.00"), calculation_ruleset_version="gst-v1",
        posted_at=datetime(2026, 8, 24, 17, 22), row_version=2,
    )
    line = _row(
        invoice_line_id=line_id, line_number=1, line_kind="product",
        order_line_id=None, product_id=uuid4(), charge_code=None, uom_code="EA",
        base_billed_quantity=Decimal("1"), base_free_quantity=Decimal("0"),
        returned_base_billed_quantity=Decimal("0"),
        returned_base_free_quantity=Decimal("0"),
        returnable_base_billed_quantity=Decimal("1"),
        returnable_base_free_quantity=Decimal("0"),
        tax_code_version_id=uuid4(), taxability_snapshot="taxable",
        line_total=Decimal("168.00"),
    )
    inventory_document_id, inventory_line_id, batch_id = uuid4(), uuid4(), uuid4()
    direct_issue = _row(
        invoice_line_id=line_id, inventory_document_id=inventory_document_id,
        inventory_document_line_id=inventory_line_id, batch_id=batch_id,
        batch_number="DEMO-BATCH-1", expires_on=date(2028, 9, 1),
        from_location_id=uuid4(), uom_code="EA", base_quantity=Decimal("1.000000"),
        unit_cost=Decimal("95.2382"), extended_cost=Decimal("95.24"),
    )
    database = _Database([header], [line], [], [direct_issue])

    result = reads.canonical_sales_invoice_get(
        invoice_id, None, None, _context("sales.invoices.get"), database,
    )

    assert result.document is not None
    assert result.document.lines[0].dispatch_allocations == []
    allocation = result.document.lines[0].direct_issue_allocations[0]
    assert allocation.inventory_document_id == inventory_document_id
    assert allocation.inventory_document_line_id == inventory_line_id
    assert allocation.batch_id == batch_id
    assert allocation.batch_number == "DEMO-BATCH-1"
    assert allocation.expires_on == date(2028, 9, 1)
    assert allocation.base_quantity == Decimal("1.000000")
    assert allocation.extended_cost == Decimal("95.24")

    sql = database.calls[3][0]
    assert "inventory_line.sales_invoice_line_id=invoice_line.id" in sql
    assert "inventory_document.sales_invoice_id=invoice_line.invoice_id" in sql
    assert "inventory_document.document_type='sales_issue'" in sql
    assert "inventory_document.status='posted'" in sql


def test_supplier_receipt_allocation_dto_preserves_ids_and_exact_balances():
    allocation_id = uuid4()
    database = _Database([_row(
        supplier_invoice_receipt_allocation_id=allocation_id,
        supplier_invoice_id=uuid4(), supplier_invoice_line_id=uuid4(),
        supplier_invoice_number="SUP-INV-1", supplier_invoice_date=date(2026, 8, 18),
        goods_receipt_id=uuid4(), goods_receipt_line_id=uuid4(),
        product_id=uuid4(), batch_id=uuid4(), location_id=uuid4(), uom_code="BOX",
        allocated_base_billed_quantity=Decimal("20.000000"),
        allocated_base_free_quantity=Decimal("2.000000"),
        returned_base_billed_quantity=Decimal("5.000000"),
        returned_base_free_quantity=Decimal("1.000000"),
        remaining_base_billed_quantity=Decimal("15.000000"),
        remaining_base_free_quantity=Decimal("1.000000"),
    )])
    rows = reads._load_supplier_receipt_allocations(
        database, uuid4(), uuid4(), goods_receipt_id=uuid4()
    )
    payload = reads.SupplierInvoiceReceiptAllocation(**rows[0])
    assert payload.supplier_invoice_receipt_allocation_id == allocation_id
    assert payload.remaining_base_billed_quantity == Decimal("15.000000")
    assert '"remaining_base_billed_quantity":"15.000000"' in payload.model_dump_json()
    sql = database.calls[0][0]
    assert "invoice.status='posted'" in sql
    assert "receipt.status='posted'" in sql
    assert "invoice.branch_id=:branch_id" in sql
    assert "receipt.branch_id=:branch_id" in sql


def test_settlement_choices_separate_cash_from_bank_and_expose_no_secret_identity():
    cash_account_id, bank_account_id, bank_id = uuid4(), uuid4(), uuid4()
    context = _context("finance.settlement_choices.search")
    database = _Database([
        _row(
            choice_kind="cash", branch_id=context.branch_id,
            settlement_account_id=cash_account_id, settlement_account_code="CASH-MAIN",
            settlement_account_name="Main Cash", currency_code="INR",
            settlement_account_row_version=4, bank_account_id=None, bank_name=None,
            bank_account_row_version=None, supported_methods=["cash"],
        ),
        _row(
            choice_kind="bank", branch_id=context.branch_id,
            settlement_account_id=bank_account_id, settlement_account_code="BANK-MAIN",
            settlement_account_name="Main Bank", currency_code="INR",
            settlement_account_row_version=4, bank_account_id=bank_id,
            bank_name="Reviewed Bank", bank_account_row_version=2,
            supported_methods=["bank_transfer", "cheque", "card", "upi", "other"],
        ),
    ])
    result = reads.canonical_settlement_choice_search("INR", 50, context, database)
    cash, bank = result.results
    assert cash.supported_methods == ["cash"]
    assert cash.bank_account_id is None
    assert bank.bank_account_id == bank_id
    assert "cash" not in bank.supported_methods
    assert cash.settlement_account_id == cash_account_id
    assert bank.settlement_account_id == bank_account_id

    sql, params = database.calls[0]
    assert "account.account_type='asset'" in sql
    assert "account.status='active'" in sql
    assert "bank.status='active'" in sql
    assert "bank.account_id=account.id" in sql
    assert params["branch_id"] == context.branch_id
    for forbidden in (
        "account_number_ciphertext", "account_number_hash", "account_holder_name", "ifsc"
    ):
        assert forbidden not in sql
