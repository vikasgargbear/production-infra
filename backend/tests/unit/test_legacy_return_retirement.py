from pathlib import Path

from app.main import app


ROOT = Path(__file__).resolve().parents[3]


def test_integer_return_and_credit_note_sources_are_retired() -> None:
    retired = (
        "backend/app/api/routes/returns/sales/routes.py",
        "backend/app/api/routes/returns/purchase/routes.py",
        "backend/app/api/services/returns/return_service.py",
        "backend/app/api/services/returns/purchase_return/service.py",
        "backend/app/api/routes/finance/credit_notes/routes.py",
        "backend/app/api/services/finance/credit_note/service.py",
        "frontend/src/services/api/modules/sales/returns.api.ts",
    )
    for relative_path in retired:
        assert not (ROOT / relative_path).exists(), relative_path


def test_openapi_exposes_only_canonical_return_reads() -> None:
    paths = app.openapi()["paths"]
    for retired_path in (
        "/api/sale-returns/",
        "/api/sale-returns/returnable-invoices",
        "/api/sale-returns/invoice/{invoice_id}/returns",
        "/api/sale-returns/invoice/{invoice_id}/returnable-items",
        "/api/sale-returns/invoice/{invoice_id}/items",
        "/api/purchase-returns/{return_id}",
        "/api/credit-debit-notes/",
        "/api/metadata/return-reasons",
    ):
        assert retired_path not in paths

    for canonical_path in (
        "/api/canonical/returns/sales-invoices/{invoice_id}/context",
        "/api/canonical/returns/supplier-invoices/{invoice_id}/context",
        "/api/canonical/returns/sales/{return_id}",
        "/api/canonical/returns/purchases/{return_id}",
        "/api/canonical/returns/approval-inbox",
        "/api/canonical/returns/requester-inbox",
        "/api/canonical/returns/requester/commands/{command_request_id}",
        "/api/canonical/returns/commands/{command_request_id}/review",
        "/api/purchase-returns/supplier-invoice/{invoice_id}/returnable-items",
    ):
        assert canonical_path in paths

    returnable = paths[
        "/api/purchase-returns/supplier-invoice/{invoice_id}/returnable-items"
    ]["get"]
    assert returnable["operationId"].startswith("returnable_supplier_invoice_items")
    invoice_parameter = next(
        parameter for parameter in returnable["parameters"]
        if parameter["name"] == "invoice_id"
    )
    assert invoice_parameter["schema"]["format"] == "uuid"


def test_preview_calculators_do_not_import_legacy_return_persistence() -> None:
    calculations = (ROOT / "backend/app/api/routes/calculations.py").read_text()
    return_calculator = (
        ROOT / "backend/app/api/services/returns/return_calculation.py"
    ).read_text()
    note_calculator = (
        ROOT / "backend/app/api/services/finance/adjustment_note_calculation.py"
    ).read_text()

    assert "ReturnCalculator" in calculations
    assert "AdjustmentNoteCalculator" in calculations
    combined = return_calculator + note_calculator
    for forbidden in (
        "financial.customer_outstanding",
        "master.organizations",
        "invoice_id: int",
        "return_id: int",
        "CreditNoteService",
        "ReturnService",
    ):
        assert forbidden not in combined


def test_retired_credit_note_service_has_no_invoice_cancellation_fallback() -> None:
    invoice_routes = (
        ROOT / "backend/app/api/routes/sales/invoices/routes.py"
    ).read_text()
    assert "CreditNoteService" not in invoice_routes
    assert "services.finance.credit_note" not in invoice_routes
    assert "canonical adjustment-note prepare, approve, and execute flow" in invoice_routes
