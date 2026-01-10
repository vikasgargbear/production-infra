"""
Integration Test: Invoice Creation Critical Path

Tests the complete invoice creation flow to prevent production bugs:
- Line item calculations (discount, tax, totals)
- Stock deduction and batch updates
- Delta sync timestamp updates
- Data integrity
"""
import pytest
from decimal import Decimal
from datetime import date, datetime

from app.api.services.sales.invoice.invoice_service import InvoiceService
from app.api.shared.calculations import calculate_line_item


class TestInvoiceCreationCriticalPath:
    """Critical path tests for invoice creation"""
    
    def test_line_item_calculations_not_zero(self, db_session, test_org, test_customer, test_product):
        """CRITICAL: All line item calculated fields must have values, not zeros"""
        invoice_data = {
            "customer_id": test_customer.customer_id,
            "invoice_date": date.today(),
            "items": [{
                "product_id": test_product.product_id,
                "quantity": 3,
                "unit_price": 20.00,
                "discount_percent": 5,
                "gst_percent": 12
            }]
        }
        
        result = InvoiceService.create_invoice_with_items(
            db=db_session,
            org_id=test_org.org_id,
            branch_id=1,
            user_id=1,
            invoice_data=invoice_data
        )
        
        invoice_id = result["invoice_id"]
        
        # Fetch invoice items
        items = db_session.execute(
            "SELECT * FROM sales.invoice_items WHERE invoice_id = :id",
            {"id": invoice_id}
        ).fetchall()
        
        assert len(items) == 1
        item = items[0]
        
        # CRITICAL: These should NEVER be zero
        assert item.discount_amount > 0, "discount_amount should not be zero with 5% discount"
        assert item.taxable_amount > 0, "taxable_amount should not be zero"
        assert item.cgst_amount > 0, "cgst_amount should not be zero"
        assert item.sgst_amount > 0, "sgst_amount should not be zero"
        assert item.line_total > 0, "line_total should not be zero"
        
        # Verify calculations match expected
        expected = calculate_line_item(
            quantity=3,
            unit_price=20.00,
            discount_percent=5,
            gst_percent=12,
            gst_type="CGST/SGST"
        )
        
        assert float(item.discount_amount) == expected['discount_amount']
        assert float(item.taxable_amount) == expected['taxable_amount']
        assert float(item.line_total) == expected['line_total']
    
    def test_line_totals_sum_matches_invoice_subtotal(self, db_session, test_org, test_customer, test_products):
        """Sum of line totals must equal invoice subtotal"""
        invoice_data = {
            "customer_id": test_customer.customer_id,
            "invoice_date": date.today(),
            "items": [
                {"product_id": test_products[0].product_id, "quantity": 2, "unit_price": 50.00, "gst_percent": 18},
                {"product_id": test_products[1].product_id, "quantity": 3, "unit_price": 30.00, "gst_percent": 12},
                {"product_id": test_products[2].product_id, "quantity": 1, "unit_price": 100.00, "gst_percent": 5},
            ]
        }
        
        result = InvoiceService.create_invoice_with_items(
            db=db_session,
            org_id=test_org.org_id,
            branch_id=1,
            user_id=1,
            invoice_data=invoice_data
        )
        
        # Get invoice
        invoice = db_session.execute(
            "SELECT subtotal_amount FROM sales.invoices WHERE invoice_id = :id",
            {"id": result["invoice_id"]}
        ).fetchone()
        
        # Get items
        items = db_session.execute(
            "SELECT line_total FROM sales.invoice_items WHERE invoice_id = :id",
            {"id": result["invoice_id"]}
        ).fetchall()
        
        sum_line_totals = sum(float(item.line_total) for item in items)
        
        assert abs(sum_line_totals - float(invoice.subtotal_amount)) < 0.01, \
            f"Line totals sum ({sum_line_totals}) must match invoice subtotal ({invoice.subtotal_amount})"
    
    def test_batch_stock_updated_with_timestamp(self, db_session, test_org, test_customer, test_product_with_batch):
        """Stock deduction must update batch quantity AND updated_at timestamp"""
        product, batch = test_product_with_batch
        initial_qty = batch.quantity_available
        initial_updated_at = batch.updated_at
        
        invoice_data = {
            "customer_id": test_customer.customer_id,
            "invoice_date": date.today(),
            "items": [{
                "product_id": product.product_id,
                "batch_id": batch.batch_id,
                "quantity": 5,
                "unit_price": 10.00
            }]
        }
        
        InvoiceService.create_invoice_with_items(
            db=db_session,
            org_id=test_org.org_id,
            branch_id=1,
            user_id=1,
            invoice_data=invoice_data
        )
        
        # Check batch was updated
        updated_batch = db_session.execute(
            "SELECT quantity_available, updated_at FROM inventory.batches WHERE batch_id = :id",
            {"id": batch.batch_id}
        ).fetchone()
        
        # CRITICAL: Stock must be deducted
        assert updated_batch.quantity_available == initial_qty - 5, \
            f"Stock should be deducted: {initial_qty} - 5 = {initial_qty - 5}"
        
        # CRITICAL: updated_at must change for delta sync
        assert updated_batch.updated_at > initial_updated_at, \
            "updated_at must be updated for delta sync to detect changes"
    
    def test_payment_overpayment_rejected(self, db_session, test_org, test_customer, test_product):
        """System must reject payments exceeding invoice amount"""
        invoice_data = {
            "customer_id": test_customer.customer_id,
            "invoice_date": date.today(),
            "items": [{"product_id": test_product.product_id, "quantity": 1, "unit_price": 100.00}],
            "payments": [
                {"payment_method": "cash", "amount": 150.00}  # Overpayment
            ]
        }
        
        with pytest.raises(ValueError, match="exceeds final amount"):
            InvoiceService.create_invoice_with_items(
                db=db_session,
                org_id=test_org.org_id,
                branch_id=1,
                user_id=1,
                invoice_data=invoice_data
            )


# Fixtures (to be defined in conftest.py)
@pytest.fixture
def test_org(db_session):
    """Create test organization"""
    # Implementation
    pass

@pytest.fixture
def test_customer(db_session, test_org):
    """Create test customer"""
    # Implementation
    pass

@pytest.fixture
def test_product(db_session, test_org):
    """Create test product"""
    # Implementation
    pass

@pytest.fixture
def test_products(db_session, test_org):
    """Create multiple test products"""
    # Implementation
    pass

@pytest.fixture
def test_product_with_batch(db_session, test_org):
    """Create test product with batch"""
    # Implementation
    pass
