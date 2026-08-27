from __future__ import annotations

import importlib.util
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "backend/scripts/provision_canonical_demo.py"
BUSINESS_DATE = date(2026, 8, 26)
UUID_A = "d3000000-0000-7000-8000-0000000000aa"
UUID_B = "d3000000-0000-7000-8000-0000000000ab"
UUID_C = "d3000000-0000-7000-8000-0000000000ac"


def _module():
    spec = importlib.util.spec_from_file_location(
        "provision_canonical_demo_business_clock", SCRIPT
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _Cursor:
    def __init__(self, rows) -> None:
        self.rows = rows
        self.executions: list[tuple[str, tuple | None]] = []

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc, _traceback):
        return False

    def execute(self, statement: str, parameters: tuple | None = None) -> None:
        self.executions.append((statement, parameters))

    def fetchall(self):
        return self.rows


class _Connection:
    def __init__(self, rows) -> None:
        self.cursor_value = _Cursor(rows)

    def cursor(self) -> _Cursor:
        return self.cursor_value


def test_demo_business_date_is_resolved_from_the_canonical_postgres_clock() -> None:
    module = _module()
    connection = _Connection([(BUSINESS_DATE,)])

    assert module.organization_business_date(connection) == BUSINESS_DATE
    statements = [statement for statement, _parameters in connection.cursor_value.executions]
    assert statements == [
        "SELECT erp_security.activate_context(%s, %s)",
        "SELECT erp_core_commands.current_organization_business_date()",
    ]


def test_customer_address_eligibility_uses_the_same_business_date() -> None:
    module = _module()
    connection = _Connection([(7,)])

    assert module.selected_customer_delivery_address_row_version(
        connection, business_date=BUSINESS_DATE
    ) == 7
    _statement, parameters = connection.cursor_value.executions[-1]
    assert parameters is not None
    assert parameters[-2:] == (BUSINESS_DATE, BUSINESS_DATE)


def test_demo_transaction_chains_are_monotonic_on_one_business_clock() -> None:
    module = _module()
    portal = {
        "supplier_invoice_number": "DEMO-SUP-CLOCK",
        "portal_document_line_id": UUID_A,
        "supplier_credit_note_portal_line_id": UUID_B,
    }
    dispatch_line = {
        "dispatch_line_id": UUID_A,
        "base_billed_quantity": "12",
        "base_free_quantity": "2",
        "allocated_base_billed_quantity": "12",
        "allocated_base_free_quantity": "2",
        "invoice_dispatch_allocation_id": UUID_B,
        "batch_id": UUID_C,
        "uom_conversion_factor": "1",
    }

    purchase_order = module.purchase_order_payload(business_date=BUSINESS_DATE)
    supplier_advance = module.supplier_advance_payload(
        UUID_A, UUID_B, business_date=BUSINESS_DATE
    )
    goods_receipt = module.goods_receipt_payload(
        UUID_A, UUID_B, business_date=BUSINESS_DATE
    )
    supplier_invoice = module.supplier_invoice_payload(
        UUID_A, UUID_B, portal, business_date=BUSINESS_DATE
    )
    supplier_payment = module.supplier_payment_payload(
        UUID_A, business_date=BUSINESS_DATE
    )

    sales_order = module.sales_order_payload(
        7, business_date=BUSINESS_DATE, delivery_offset_days="2"
    )
    dispatch = module.sales_dispatch_payload(
        UUID_A,
        UUID_B,
        [{"batch_id": UUID_C, "billed_quantity": "12", "free_quantity": "2"}],
        business_date=BUSINESS_DATE,
        requested_delivery_date=sales_order["requested_delivery_date"],
    )
    sales_invoice = module.sales_invoice_payload(
        [dispatch_line], 7, business_date=BUSINESS_DATE
    )
    customer_receipt = module.customer_receipt_payload(
        UUID_A, business_date=BUSINESS_DATE
    )
    sales_return = module.sales_return_payload(
        UUID_A, UUID_B, [dispatch_line], business_date=BUSINESS_DATE
    )
    purchase_return = module.purchase_return_payload(
        UUID_A, UUID_B, UUID_C, UUID_A, portal, business_date=BUSINESS_DATE
    )

    purchase_dates = [
        purchase_order["order_date"],
        supplier_advance["payment_date"],
        goods_receipt["supplier_challan_date"],
        supplier_invoice["invoice_date"],
        supplier_invoice["received_date"],
        supplier_payment["payment_date"],
        purchase_return["return_date"],
        purchase_return["logistics"]["transport_document_date"],
    ]
    sales_dates = [
        sales_order["order_date"],
        dispatch["dispatch_date"],
        dispatch["logistics"]["transport_document_date"],
        sales_invoice["invoice_date"],
        customer_receipt["payment_date"],
        sales_return["return_date"],
    ]
    assert purchase_dates == sorted(purchase_dates)
    assert sales_dates == sorted(sales_dates)
    assert set(purchase_dates + sales_dates) == {BUSINESS_DATE.isoformat()}
    assert sales_order["requested_delivery_date"] > sales_order["order_date"]
    assert dispatch["dispatch_date"] < sales_order["requested_delivery_date"]


def test_source_retrieval_date_is_only_regulatory_provenance() -> None:
    source = SCRIPT.read_text(encoding="utf-8")

    assert source.count("SOURCE_RETRIEVED_ON") == 2
    assert "INDIA_BUSINESS_DATE" not in source
    adjustment_import = source.split("def import_adjustment_release", 1)[1].split(
        "\ndef itc_reversal_dataset_bytes", 1
    )[0]
    assert "SOURCE_RETRIEVED_ON" in adjustment_import
    assert "ADJUSTMENT_SOURCE_PUBLICATION_DATE" in adjustment_import


def test_business_calendar_helpers_derive_periods_without_fixed_years() -> None:
    module = _module()

    assert module.fiscal_year_start(date(2026, 3, 31)) == date(2025, 4, 1)
    assert module.fiscal_year_start(date(2026, 4, 1)) == date(2026, 4, 1)
    assert module.monthly_period(date(2028, 2, 15)) == (
        date(2028, 2, 1),
        date(2028, 2, 29),
        date(2028, 3, 20),
    )
