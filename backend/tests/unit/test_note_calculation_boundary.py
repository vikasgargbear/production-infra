from decimal import Decimal

from app.api.services.finance.credit_note.service import CreditNoteService
from app.main import app


def test_note_preview_is_typed_authenticated_and_not_mcp_exported():
    operation = app.openapi()["paths"]["/api/calculations/note"]["post"]

    assert operation["security"] == [{"HTTPBearer": []}]
    assert "x-erp-tool-name" not in operation
    request_schema = operation["requestBody"]["content"]["application/json"]["schema"]
    assert request_schema["$ref"].endswith("/NoteCalculationRequest")


def test_note_lines_reconcile_discount_and_intrastate_gst():
    result = CreditNoteService.calculate_note_totals({
        "include_gst": True,
        "items": [{
            "quantity": "2",
            "unit_price": "100",
            "discount_percent": "10",
            "gst_percent": "18",
        }],
    }, "CGST/SGST")

    assert result["subtotal_amount"] == Decimal("200.00")
    assert result["discount_amount"] == Decimal("20.00")
    assert result["taxable_amount"] == Decimal("180.00")
    assert result["cgst_amount"] == Decimal("16.20")
    assert result["sgst_amount"] == Decimal("16.20")
    assert result["igst_amount"] == Decimal("0.00")
    assert result["tax_amount"] == Decimal("32.40")
    assert result["total_amount"] == Decimal("212.40")


def test_note_gst_exclusion_is_authoritative():
    result = CreditNoteService.calculate_note_totals({
        "include_gst": False,
        "items": [{"quantity": 1, "unit_price": 100, "gst_percent": 18}],
    }, "IGST")

    assert result["tax_amount"] == Decimal("0.00")
    assert result["total_amount"] == Decimal("100.00")


def test_note_rejects_invalid_lines():
    try:
        CreditNoteService.calculate_note_totals({
            "items": [{"quantity": 0, "unit_price": 100}],
        }, "IGST")
    except ValueError as exc:
        assert "quantity" in str(exc)
    else:
        raise AssertionError("zero-quantity note line must fail closed")
