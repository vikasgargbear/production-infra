from pathlib import Path

from app.api.services.purchase.parsers.invoice_parser import InvoiceParser
from app.api.services.purchase.parsers.schemas import ParsedInvoice, ParsedItem


ROOT = Path(__file__).resolve().parents[3]


def test_missing_invoice_facts_remain_missing_until_reviewed() -> None:
    item = ParsedItem(product_name="Extracted description only")
    invoice = ParsedInvoice(items=[item])

    assert item.quantity is None
    assert item.free_quantity is None
    assert item.unit is None
    assert item.pack_size is None
    assert item.mrp is None
    assert item.cost_price is None
    assert item.discount_percent is None
    assert item.tax_percent is None
    assert item.amount is None
    assert invoice.invoice_date is None
    assert invoice.subtotal is None
    assert invoice.tax_amount is None
    assert invoice.discount_amount is None
    assert invoice.grand_total is None


def test_invalid_or_absent_amount_is_not_converted_to_zero() -> None:
    parser = InvoiceParser()

    assert parser._parse_amount("") is None
    assert parser._parse_amount("not-a-number") is None
    assert str(parser._parse_amount("0")) == "0"


def test_active_purchase_upload_boundary_has_no_business_fact_defaults() -> None:
    upload = (ROOT / "backend/app/api/routes/purchase/upload/routes.py").read_text()
    custom_parser = (ROOT / "backend/app/api/routes/purchase/pharma_invoice_parser.py").read_text()
    schema = (ROOT / "backend/app/api/services/purchase/parsers/schemas.py").read_text()

    for source in (upload, custom_parser, schema):
        assert 'tax_percent", 12' not in source
        assert 'tax_percent": 12' not in source
        assert 'Decimal("12")' not in source
    assert "date.today().isoformat()" not in custom_parser
    assert '"invoice_date": date.today().isoformat()' not in upload
    assert "DEFAULT_TAX_PERCENT" not in schema
