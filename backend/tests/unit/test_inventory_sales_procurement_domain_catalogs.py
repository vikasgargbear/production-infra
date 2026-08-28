"""First-principles gates for inventory, sales, and procurement catalogs."""

from __future__ import annotations

import json
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
DOMAIN_ROOT = REPO_ROOT / "database" / "canonical" / "domains"
MODEL = json.loads((REPO_ROOT / "docs/architecture/canonical-data-model.json").read_text())
CATALOGS = {
    domain: json.loads((DOMAIN_ROOT / f"{domain}.json").read_text())
    for domain in ("inventory", "sales", "procurement")
}
ALL_CATALOGS = {
    path.stem: json.loads(path.read_text())
    for path in DOMAIN_ROOT.glob("*.json")
    if not path.name.startswith("_")
}
ALL_TABLES = {
    table["name"]: table
    for catalog in ALL_CATALOGS.values()
    for table in catalog["tables"]
}

EXPECTED = {
    "inventory": {
        "inventory.locations", "inventory.batches",
        "inventory.inventory_documents", "inventory.inventory_document_lines",
        "inventory.stock_ledger_entries", "inventory.stock_balances",
        "inventory.reservations",
    },
    "sales": {
        "sales.orders", "sales.order_lines", "sales.dispatches",
        "sales.dispatch_lines", "sales.invoices", "sales.invoice_lines",
        "sales.invoice_dispatch_allocations", "sales.returns",
        "sales.return_lines",
    },
    "procurement": {
        "procurement.purchase_orders", "procurement.purchase_order_lines",
        "procurement.goods_receipts", "procurement.goods_receipt_lines",
        "procurement.supplier_invoices", "procurement.supplier_invoice_lines",
        "procurement.supplier_invoice_receipt_allocations",
        "procurement.purchase_returns", "procurement.purchase_return_lines",
        "procurement.purchase_order_advance_allocations",
    },
}


def _table(name: str) -> dict:
    return ALL_TABLES[name]


def _columns(name: str) -> dict[str, list]:
    return {column[0]: column for column in _table(name)["columns"]}


def _checks(name: str) -> str:
    return " ".join(item["expression"] for item in _table(name)["checks"])


def _rules(name: str) -> str:
    return " ".join(item["rule"] for item in _table(name)["cross_row_invariants"])


def _has_fk(name: str, local: list[str], target: str, remote: list[str]) -> bool:
    return any(
        item["columns"] == local
        and item["references"] == target
        and item["referenced_columns"] == remote
        for item in _table(name)["foreign_keys"]
    )


def test_trade_catalogs_cover_exact_26_table_authority() -> None:
    assert sum(map(len, EXPECTED.values())) == 26
    for domain, expected in EXPECTED.items():
        catalog = CATALOGS[domain]
        actual = {table["name"] for table in catalog["tables"]}
        assert catalog["domain"] == domain
        assert catalog["table_count"] == len(catalog["tables"]) == len(expected)
        assert actual == expected == set(MODEL["canonical_tables"][domain])


def test_every_trade_table_has_direct_org_ownership_rls_and_trusted_actors() -> None:
    actor_default = "current_setting('app.membership_id')::uuid"
    action_actor_prefixes = ("approved_", "posted_", "released_")

    for catalog in CATALOGS.values():
        for table in catalog["tables"]:
            columns = {column[0]: column for column in table["columns"]}
            org_fks = [
                item for item in table["foreign_keys"]
                if item["columns"] == ["org_id"]
                and item["references"] == "core.organizations"
                and item["referenced_columns"] == ["id"]
            ]
            assert len(org_fks) == 1, table["name"]
            assert table["rls"]["force"] is True
            assert table["rls"]["class"] == "tenant_membership"
            assert table["cross_row_invariants"]
            for name, column in columns.items():
                if name in {"created_by_membership_id", "updated_by_membership_id"}:
                    assert column[3] == actor_default, (table["name"], name)
                if name.endswith("_by_membership_id") and name.startswith(action_actor_prefixes):
                    assert column[3] is None, (table["name"], name)
                if name.endswith("_by_membership_id"):
                    assert _has_fk(
                        table["name"], ["org_id", name],
                        "core.memberships", ["org_id", "id"],
                    )


def test_every_trade_fk_target_exists_and_column_types_match_exactly() -> None:
    for catalog in CATALOGS.values():
        for table in catalog["tables"]:
            local_columns = {item[0]: item for item in table["columns"]}
            for foreign_key in table["foreign_keys"]:
                target = _table(foreign_key["references"])
                target_columns = {item[0]: item for item in target["columns"]}
                assert len(foreign_key["columns"]) == len(foreign_key["referenced_columns"])
                for local, remote in zip(foreign_key["columns"], foreign_key["referenced_columns"]):
                    assert local_columns[local][1] == target_columns[remote][1], (
                        table["name"], foreign_key["name"], local, remote
                    )


@pytest.mark.parametrize(
    "name",
    [
        "inventory.inventory_document_lines",
        "sales.order_lines", "sales.dispatch_lines", "sales.invoice_lines",
        "procurement.purchase_order_lines", "procurement.goods_receipt_lines",
        "procurement.supplier_invoice_lines",
    ],
)
def test_uom_is_the_stable_typed_code_reference(name: str) -> None:
    columns = _columns(name)
    assert "uom_id" not in columns
    assert columns["uom_code"][:4] == ["uom_code", "varchar(16)", columns["uom_code"][2], None]
    assert _has_fk(name, ["uom_code"], "catalog.units_of_measure", ["code"])


@pytest.mark.parametrize(
    "name",
    [
        "sales.order_lines", "sales.invoice_lines", "sales.return_lines",
        "procurement.purchase_order_lines", "procurement.supplier_invoice_lines",
        "procurement.purchase_return_lines",
    ],
)
def test_fiscal_lines_reference_immutable_tax_version_and_snapshot_amounts(name: str) -> None:
    columns = _columns(name)
    required = {
        "tax_code_version_id", "cgst_rate", "sgst_rate", "igst_rate", "cess_rate",
        "taxability_snapshot", "net_value_amount", "gst_taxable_value",
        "cgst_amount", "sgst_amount", "igst_amount",
        "cess_amount", "line_total",
    }
    assert required <= columns.keys()
    assert _has_fk(name, ["tax_code_version_id"], "tax.tax_code_versions", ["id"])
    for rate in ("cgst_rate", "sgst_rate", "igst_rate", "cess_rate"):
        assert columns[rate][1] == "numeric(9,6)"
    for amount in required & {key for key in columns if key.endswith("_amount")}:
        assert columns[amount][1] == "numeric(20,2)"
    assert columns["net_value_amount"][1:4] == ["numeric(20,2)", False, None]
    assert columns["gst_taxable_value"][1:4] == ["numeric(20,2)", False, None]
    assert columns["taxability_snapshot"][1:4] == ["text", False, None]
    checks = _checks(name)
    assert "taxability_snapshot IN ('taxable','zero_rated','exempt','nil_rated','non_gst')" in checks
    assert "gst_taxable_value=net_value_amount" in checks
    assert "taxability_snapshot IN ('exempt','nil_rated','non_gst') AND gst_taxable_value=0" in checks


@pytest.mark.parametrize(
    "name",
    [
        "sales.order_lines", "sales.invoice_lines",
        "procurement.purchase_order_lines", "procurement.supplier_invoice_lines",
    ],
)
def test_commercial_lines_own_product_or_typed_charge_facts(name: str) -> None:
    columns = _columns(name)
    expression = _checks(name)
    rules = _rules(name)

    assert {
        "line_kind", "charge_code", "product_id", "tax_classification_code_snapshot",
        "quoted_unit_rate", "price_basis", "free_supply_tax_treatment",
        "uom_conversion_factor", "line_discount_kind", "line_discount_basis",
        "line_discount_value", "document_discount_eligible",
        "line_discount_amount", "line_taxable_discount_amount",
        "document_discount_amount", "document_taxable_discount_amount",
    } <= columns.keys()
    assert columns["product_id"][2] is True
    assert columns["uom_code"][2] is True
    assert columns["charge_code"][2] is True
    assert columns["quoted_unit_rate"][1:4] == ["numeric(20,4)", True, None]
    assert columns["price_basis"][1:4] == ["text", False, None]
    assert columns["free_supply_tax_treatment"][1:4] == ["text", True, None]
    assert columns["uom_conversion_factor"][1:4] == ["numeric(20,6)", True, None]
    assert columns["line_discount_kind"][1:4] == ["text", False, None]
    assert columns["line_discount_basis"][1:4] == ["text", False, None]
    assert columns["line_discount_value"][1:4] == ["numeric(20,6)", False, None]
    assert columns["document_discount_eligible"][1:4] == ["boolean", False, None]
    for output in (
        "line_discount_amount", "line_taxable_discount_amount",
        "document_discount_amount", "document_taxable_discount_amount",
    ):
        assert columns[output][1:4] == ["numeric(20,2)", False, None]
    assert "allocated_charge_amount" not in columns
    assert not ({"unit_rate", "unit_rate_snapshot", "price_mode"} & columns.keys())
    assert "line_kind IN ('product','charge')" in expression
    assert "line_kind='product' AND product_id IS NOT NULL" in expression
    assert "line_kind='charge' AND product_id IS NULL AND charge_code IS NOT NULL" in expression
    assert "freight" in expression and "packing" in expression
    assert "price_basis IN ('tax_exclusive','tax_inclusive')" in expression
    assert "free_supply_tax_treatment IN ('excluded_from_taxable_value','included_at_unit_rate')" in expression
    assert "line_kind='charge' AND free_supply_tax_treatment IS NULL" in expression
    assert "uom_conversion_factor>0" in expression
    assert "base_billed_quantity=round(billed_quantity*uom_conversion_factor,6)" in expression
    assert "base_free_quantity=round(free_quantity*uom_conversion_factor,6)" in expression
    assert "billed_quantity>=0" in expression and "billed_quantity+free_quantity>0" in expression
    assert "base_billed_quantity>=0" in expression and "base_billed_quantity+base_free_quantity>0" in expression
    assert "line_discount_kind IN ('none','percent','amount')" in expression
    assert "line_discount_basis IN ('taxable_value','price_value')" in expression
    assert "line_discount_kind='none' AND line_discount_value=0" in expression
    assert "Only product lines" in rules
    assert all(token in rules for token in (
        "price_basis", "free_supply_tax_treatment", "uom_conversion_factor",
        "line discount kind/basis/value", "document-discount eligibility",
        "taxability_snapshot", "net_value_amount", "gst_taxable_value",
    ))


def test_header_charge_and_tax_totals_are_recomputed_from_typed_lines() -> None:
    for name in (
        "sales.orders", "sales.invoices",
        "procurement.purchase_orders", "procurement.supplier_invoices",
    ):
        columns = _columns(name)
        rules = _rules(name)
        assert {
            "calculation_ruleset_version", "subtotal", "discount_total",
            "charges_total", "net_value_total", "gst_taxable_total",
            "document_discount_kind", "document_discount_basis",
            "document_discount_value", "cgst_total", "sgst_total",
            "igst_total", "cess_total", "grand_total",
        } <= columns.keys()
        assert columns["document_discount_kind"][1:4] == ["text", False, None]
        assert columns["document_discount_basis"][1:4] == ["text", False, None]
        assert columns["document_discount_value"][1:4] == ["numeric(20,6)", False, None]
        assert "product" in rules and "charge" in rules
        assert "recompute" in rules.lower()
        assert all(token in rules for token in (
            "document_discount_kind", "document_discount_basis",
            "document_discount_value", "net_value_total", "gst_taxable_total",
        ))


@pytest.mark.parametrize(
    "name",
    [
        "sales.orders", "sales.invoices", "sales.returns",
        "procurement.purchase_orders", "procurement.supplier_invoices",
        "procurement.purchase_returns",
    ],
)
def test_headers_persist_zero_rated_rounding_and_reverse_charge_context(name: str) -> None:
    columns = _columns(name)
    checks = _checks(name)
    rules = _rules(name)

    assert columns["zero_rated_payment_mode"][1:4] == ["text", False, None]
    assert columns["tax_charge_mechanism"][1:4] == ["text", False, None]
    assert columns["recipient_assessed_tax_total"][1:4] == ["numeric(20,2)", False, "0"]
    assert columns["rounding_policy"][1:4] == ["text", False, None]
    assert "zero_rated_payment_mode IN ('not_applicable','without_payment','with_igst')" in checks
    assert "tax_charge_mechanism IN ('normal','reverse_charge')" in checks
    assert "rounding_policy IN ('none','nearest_rupee')" in checks
    if name in {"sales.returns", "procurement.purchase_returns"}:
        assert "grand_total=net_value_total+" in checks
        assert "+rounding_adjustment" in checks
        assert "grand_total=round(" not in checks
    else:
        assert "rounding_adjustment=grand_total-" in checks
    assert all(token in rules for token in (
        "zero_rated", "without_payment", "with_igst",
        "tax_charge_mechanism", "recipient_assessed_tax_total", "rounding_policy",
    ))
    if name in {"sales.orders", "sales.invoices", "procurement.purchase_orders", "procurement.supplier_invoices"}:
        assert columns["supply_type"][1:4] == ["text", False, None]
        if name.startswith("sales."):
            assert "supply_type IN ('export','sez')" in checks
        else:
            assert "supply_type='sez'" in checks
            assert "'import'" in checks
            assert "'export'" not in checks
    if name in {"sales.invoices", "sales.returns"}:
        assert "zero organization self-assessed tax" in rules
    if name in {"procurement.supplier_invoices", "procurement.purchase_returns"}:
        assert "as organization self-assessed tax" in rules


@pytest.mark.parametrize(
    "name",
    [
        "sales.order_lines", "sales.invoice_lines", "sales.return_lines",
        "procurement.purchase_order_lines", "procurement.supplier_invoice_lines",
        "procurement.purchase_return_lines",
    ],
)
def test_line_tax_components_and_reverse_charge_payable_are_unambiguous(name: str) -> None:
    columns = _columns(name)
    checks = _checks(name)
    rules = _rules(name)

    assert columns["tax_charge_mechanism"][1:4] == ["text", False, None]
    assert "tax_charge_mechanism IN ('normal','reverse_charge')" in checks
    assert "tax_charge_mechanism='reverse_charge' AND line_total=net_value_amount" in checks
    assert "cgst_rate=sgst_rate AND cgst_amount=sgst_amount" in checks
    assert "cgst_rate=0 AND sgst_rate=0 AND cgst_amount=0 AND sgst_amount=0" in checks
    assert "with_igst" in rules and "without_payment" in rules
    assert "reverse_charge" in rules and "excludes those components from line_total" in rules
    if name in {
        "sales.order_lines", "sales.invoice_lines",
        "procurement.purchase_order_lines", "procurement.supplier_invoice_lines",
    }:
        assert "price_basis='tax_exclusive'" in checks
        assert "line_discount_basis='taxable_value'" in checks


def test_inventory_has_one_append_only_owner_and_one_rebuildable_projection() -> None:
    ledger = _table("inventory.stock_ledger_entries")
    ledger_columns = _columns(ledger["name"])
    balance = _table("inventory.stock_balances")
    balance_columns = _columns(balance["name"])

    assert ledger["mutation_class"] == "append_only_posting_fact"
    assert {"quantity_delta", "unit_cost", "value_delta", "batch_id"} <= ledger_columns.keys()
    assert "transfer_pair_id" not in ledger_columns
    assert "signed" in ledger["fact_owner"].lower()
    assert all(token in _checks(ledger["name"]) for token in ("quantity_delta", "value_delta", "entry_kind"))
    assert all(token in _rules(ledger["name"]) for token in ("Only the inventory posting function", "UPDATE", "DELETE", "cost"))

    assert balance["tenant_class"] == "tenant_projection"
    assert balance["primary_key"] == ["org_id", "location_id", "product_id", "batch_id"]
    assert "id" not in balance_columns
    assert "on_hand_quantity" in balance_columns
    assert not ({"reserved_quantity", "available_quantity"} & balance_columns.keys())
    assert "excludes reservations" in _rules(balance["name"])


def test_lot_identity_branch_consistency_and_system_lot_expiry_are_explicit() -> None:
    batches = _columns("inventory.batches")
    batch_checks = _checks("inventory.batches")

    assert batches["lot_kind"][2] is False
    assert batches["expires_on"][2] is True
    assert batches["mrp"][1:4] == ["numeric(20,2)", False, None]
    assert batches["mrp_uom_conversion_id"][1:4] == ["uuid", False, None]
    assert _has_fk(
        "inventory.batches",
        ["org_id", "mrp_uom_conversion_id"],
        "catalog.uom_conversions",
        ["org_id", "id"],
    )
    assert "manufacturer_batch" in batch_checks and "untracked_system" in batch_checks
    assert "expires_on IS NOT NULL" in batch_checks
    batch_rules = _rules("inventory.batches")
    assert "document_date strictly earlier than expires_on" in batch_rules
    assert "released state" in batch_rules
    assert "tax-inclusive Maximum Retail Price in INR" in batch_rules
    assert "marketed from_uom_code to the product base_uom_code" in batch_rules
    assert "effective on the batch created_at timestamp interpreted in the locked organization timezone" in batch_rules

    conversion_checks = _checks("catalog.uom_conversions")
    assert "from_uom_code <> to_uom_code OR multiplier = 1" in conversion_checks

    for name in (
        "inventory.inventory_document_lines", "inventory.stock_ledger_entries",
        "inventory.stock_balances", "inventory.reservations",
    ):
        assert _columns(name)["batch_id"][2] is False
    for name in (
        "inventory.stock_ledger_entries", "inventory.stock_balances",
        "inventory.reservations",
    ):
        assert _has_fk(name, ["org_id", "branch_id"], "core.branches", ["org_id", "id"])
        assert "branch" in _rules(name).lower()


def test_inventory_documents_are_typed_and_the_only_stock_posting_command() -> None:
    columns = _columns("inventory.inventory_documents")
    expression = _checks("inventory.inventory_documents")
    rules = _rules("inventory.inventory_documents")

    assert {
        "document_type", "sales_dispatch_id", "sales_invoice_id", "sales_return_id",
        "goods_receipt_id", "purchase_return_id", "destruction_id", "recall_id",
        "reverses_document_id",
    } <= columns.keys()
    assert "stock_count" in expression and "transfer" in expression and "reversal" in expression
    assert all(kind in expression for kind in ("recall_quarantine", "recall_recovery", "recall_release"))
    assert _has_fk(
        "inventory.inventory_documents", ["org_id", "recall_id"],
        "compliance.recalls", ["org_id", "id"],
    )
    assert "num_nonnulls(" in expression
    assert "sole approved stock-posting command" in _table("inventory.inventory_documents")["fact_owner"]
    assert all(term in rules for term in ("recomputes", "ledger", "exactly once", "reversal"))


def test_interbranch_and_physical_logistics_snapshots_are_explicit() -> None:
    inventory = _columns("inventory.inventory_documents")
    inventory_checks = _checks("inventory.inventory_documents")
    inventory_rules = _rules("inventory.inventory_documents")
    dispatch = _columns("sales.dispatches")
    dispatch_checks = _checks("sales.dispatches")
    dispatch_rules = _rules("sales.dispatches")

    required = {
        "destination_branch_id", "physical_movement_required",
        "origin_address_line1", "origin_state_code", "origin_pincode",
        "destination_address_line1", "destination_state_code", "destination_pincode",
        "transport_mode", "distance_km", "transporter_party_id",
        "vehicle_number_snapshot", "vehicle_type_snapshot",
        "transport_document_number_snapshot", "transport_document_date",
        "movement_started_at",
    }
    assert required <= inventory.keys()
    assert _has_fk(
        "inventory.inventory_documents", ["org_id", "destination_branch_id"],
        "core.branches", ["org_id", "id"],
    )
    assert "document_type='transfer' AND destination_branch_id IS NOT NULL" in inventory_checks
    assert "document_date < expires_on" in inventory_rules
    assert "physical inventory document" in inventory_rules
    assert {name.replace("_snapshot", "") for name in required if name.endswith("_snapshot")} <= dispatch.keys()
    assert {"origin_address_line1", "destination_address_line1", "transport_mode", "distance_km", "movement_started_at"} <= dispatch.keys()
    assert "transport_mode IN" in dispatch_checks
    assert "inventory document physical snapshot must equal" in dispatch_rules.lower()


def test_landed_cost_uses_typed_zero_quantity_value_adjustments() -> None:
    header = _columns("inventory.inventory_documents")
    header_checks = _checks("inventory.inventory_documents")
    header_rules = _rules("inventory.inventory_documents")
    line = _columns("inventory.inventory_document_lines")
    line_checks = _checks("inventory.inventory_document_lines")
    line_rules = _rules("inventory.inventory_document_lines")
    ledger_checks = _checks("inventory.stock_ledger_entries")
    ledger_rules = _rules("inventory.stock_ledger_entries")

    assert header["costing_method_snapshot"][1:4] == ["text", False, None]
    assert header["supplier_invoice_id"][1:4] == ["uuid", True, None]
    assert "cost_adjustment" in header_checks
    assert "costing_method_snapshot='moving_weighted_average'" in header_checks
    assert _has_fk(
        "inventory.inventory_documents", ["org_id", "supplier_invoice_id"],
        "procurement.supplier_invoices", ["org_id", "id"],
    )
    assert all(token in header_rules for token in (
        "moving_weighted_average", "supplier invoice", "price variances",
        "capitalized charge", "reversal",
    ))

    expected_line_shapes = {
        "supplier_invoice_line_id": ["uuid", True, None],
        "cost_allocation_method": ["text", True, None],
        "cost_allocation_basis_quantity": ["numeric(20,6)", True, None],
        "cost_allocation_basis_value": ["numeric(20,2)", True, None],
        "cost_allocation_weight": ["numeric(20,12)", True, None],
    }
    for field, shape in expected_line_shapes.items():
        assert line[field][1:4] == shape
    assert "cost_allocation_method IN ('direct','quantity_weighted','value_weighted')" in line_checks
    assert "cost_allocation_weight>0" in line_checks
    assert all(token in line_rules for token in (
        "weights summing exactly to 1", "signed extended_cost",
        "positive on-hand", "receipt/product lineage",
    ))

    assert "entry_kind='value_adjustment' AND quantity_delta=0 AND value_delta<>0" in ledger_checks
    assert "quantity_delta=0 AND entry_kind IN ('value_adjustment','reversal')" in ledger_checks
    assert all(token in ledger_rules for token in (
        "zero quantity", "moving weighted average", "empty stock identity", "inverse",
    ))
    supplier_line = _columns("procurement.supplier_invoice_lines")
    assert supplier_line["inventory_cost_treatment"][1:4] == ["text", False, None]
    assert "inventory_cost_treatment IN ('capitalize','expense')" in _checks("procurement.supplier_invoice_lines")


@pytest.mark.parametrize(
    ("name", "left", "right"),
    [
        ("sales.invoice_dispatch_allocations", "invoice_line_id", "dispatch_line_id"),
        (
            "procurement.supplier_invoice_receipt_allocations",
            "supplier_invoice_line_id", "goods_receipt_line_id",
        ),
    ],
)
def test_many_to_many_allocations_are_auditable_and_ceiling_guarded(
    name: str, left: str, right: str
) -> None:
    table = _table(name)
    columns = _columns(name)
    expression = _checks(name)
    rules = _rules(name)

    assert table["primary_key"] == ["org_id", "id"]
    assert {left, right, "allocated_base_billed_quantity", "allocated_base_free_quantity"} <= columns.keys()
    assert "allocated_base_billed_quantity>=0" in expression
    assert "may not exceed either source line" in rules
    assert "line_kind product" in rules
    assert "immutable" in rules


def test_sales_and_purchase_return_ceilings_cover_allocated_and_direct_flows() -> None:
    sales = _rules("sales.return_lines")
    purchase = _rules("procurement.purchase_return_lines")

    assert all(term in sales for term in ("invoice-dispatch allocation", "direct-invoice", "invoice line"))
    assert all(term in purchase for term in ("supplier-invoice receipt allocation", "uninvoiced", "goods-receipt line"))
    for name in ("sales.return_lines", "procurement.purchase_return_lines"):
        columns = _columns(name)
        checks = _checks(name)
        rules = _rules(name)
        assert columns["batch_id"][2] is False
        assert columns["base_billed_quantity"][1] == "numeric(20,6)"
        assert columns["base_free_quantity"][1] == "numeric(20,6)"
        assert columns["billed_quantity"][1:4] == ["numeric(20,6)", False, None]
        assert columns["free_quantity"][1:4] == ["numeric(20,6)", False, None]
        assert columns["uom_conversion_factor"][1:4] == ["numeric(20,6)", False, None]
        assert columns["quoted_unit_rate"][1:4] == ["numeric(20,4)", False, None]
        assert columns["price_basis"][1:4] == ["text", False, None]
        assert columns["free_supply_tax_treatment"][1:4] == ["text", False, None]
        assert columns["reversal_value_basis"][1:4] == ["text", False, None]
        assert columns["gst_tax_treatment"][1:4] == ["text", False, None]
        assert "price_basis IN ('tax_exclusive','tax_inclusive')" in checks
        assert "free_supply_tax_treatment IN ('excluded_from_taxable_value','included_at_unit_rate')" in checks
        assert "reversal_value_basis IN ('billed_quantity','base_quantity')" in checks
        assert "gst_tax_treatment IN ('statutory','commercial_only')" in checks
        assert "base_billed_quantity=round(billed_quantity*uom_conversion_factor,6)" in checks
        assert "base_free_quantity=round(free_quantity*uom_conversion_factor,6)" in checks
        assert "reversal_value_basis<>'billed_quantity' OR billed_quantity>0" in checks
        assert all(token in rules for token in (
            "reversal_value_basis", "quoted_unit_rate", "price_basis",
            "free_supply_tax_treatment",
        ))


@pytest.mark.parametrize(
    ("name", "side_effects"),
    [
        ("sales.invoices", ("tax document", "receivable open item", "accounting event")),
        ("sales.returns", ("tax document", "receivable adjustment", "accounting event")),
        ("procurement.supplier_invoices", ("tax document", "payable open item", "accounting event")),
        ("procurement.purchase_returns", ("tax document", "payable adjustment", "accounting event")),
    ],
)
def test_posting_contracts_are_atomic_immutable_and_exactly_once(
    name: str, side_effects: tuple[str, ...]
) -> None:
    table = _table(name)
    rules = _rules(name)
    assert "posted_immutable" in table["mutation_class"]
    assert "Posting" in rules
    assert "freezes" in rules
    assert "exactly one" in rules
    assert all(effect in rules for effect in side_effects)


def test_trade_catalogs_have_no_unbounded_json_or_deferred_module_tables() -> None:
    serialized = json.dumps(CATALOGS).lower()
    forbidden = ("jsonb", "payroll", "loyalty", "scheme_master", "price_list", "todo", "tbd")
    assert not any(token in serialized for token in forbidden)
