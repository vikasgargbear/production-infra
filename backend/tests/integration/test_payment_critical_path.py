"""
Integration Test: Payment Processing Critical Path

Tests payment processing to prevent bugs like overpayment validation failures.
"""
import pytest
from decimal import Decimal
from datetime import date


class TestPaymentProcessingCriticalPath:
    """Critical path tests for payment processing"""
    
    def test_single_payment_within_limit(self, db_session, test_org, test_customer, test_product):
        """Single payment within invoice amount should succeed"""
        invoice_data = {
            "customer_id": test_customer.customer_id,
            "invoice_date": date.today(),
            "items": [{"product_id": test_product.product_id, "quantity": 1, "unit_price": 100.00}],
            "payments": [{"payment_method": "cash", "amount": 100.00}]
        }
        
        result = InvoiceService.create_invoice_with_items(
            db=db_session,
            org_id=test_org.org_id,
            branch_id=1,
            user_id=1,
            invoice_data=invoice_data
        )
        
        invoice = db_session.execute(
            "SELECT payment_status, paid_amount, credit_amount FROM sales.invoices WHERE invoice_id = :id",
            {"id": result["invoice_id"]}
        ).fetchone()
        
        assert invoice.payment_status == "paid"
        assert float(invoice.paid_amount) == 100.00
        assert float(invoice.credit_amount) == 0.00
    
    def test_split_payment_within_limit(self, db_session, test_org, test_customer, test_product):
        """Split payments totaling invoice amount should succeed"""
        invoice_data = {
            "customer_id": test_customer.customer_id,
            "invoice_date": date.today(),
            "items": [{"product_id": test_product.product_id, "quantity": 1, "unit_price": 100.00}],
            "payments": [
                {"payment_method": "cash", "amount": 60.00},
                {"payment_method": "card", "amount": 40.00}
            ]
        }
        
        result = InvoiceService.create_invoice_with_items(
            db=db_session,
            org_id=test_org.org_id,
            branch_id=1,
            user_id=1,
            invoice_data=invoice_data
        )
        
        invoice = db_session.execute(
            "SELECT payment_status, paid_amount FROM sales.invoices WHERE invoice_id = :id",
            {"id": result["invoice_id"]}
        ).fetchone()
        
        assert invoice.payment_status == "paid"
        assert float(invoice.paid_amount) == 100.00
    
    def test_overpayment_exact_rejected(self, db_session, test_org, test_customer, test_product):
        """Payment exactly 0.01 over limit must be rejected"""
        invoice_data = {
            "customer_id": test_customer.customer_id,
            "invoice_date": date.today(),
            "items": [{"product_id": test_product.product_id, "quantity": 1, "unit_price": 100.00}],
            "payments": [{"payment_method": "cash", "amount": 100.01}]
        }
        
        with pytest.raises(ValueError, match="exceeds final amount"):
            InvoiceService.create_invoice_with_items(
                db=db_session,
                org_id=test_org.org_id,
                branch_id=1,
                user_id=1,
                invoice_data=invoice_data
            )
    
    def test_split_payment_overpayment_rejected(self, db_session, test_org, test_customer, test_product):
        """Split payments exceeding total must be rejected"""
        invoice_data = {
            "customer_id": test_customer.customer_id,
            "invoice_date": date.today(),
            "items": [{"product_id": test_product.product_id, "quantity": 1, "unit_price": 100.00}],
            "payments": [
                {"payment_method": "cash", "amount": 60.00},
                {"payment_method": "card", "amount": 50.00}  # Total = 110
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
    
    def test_partial_payment_status(self, db_session, test_org, test_customer, test_product):
        """Partial payment should set status correctly"""
        invoice_data = {
            "customer_id": test_customer.customer_id,
            "invoice_date": date.today(),
            "items": [{"product_id": test_product.product_id, "quantity": 1, "unit_price": 100.00}],
            "payments": [{"payment_method": "cash", "amount": 50.00}]
        }
        
        result = InvoiceService.create_invoice_with_items(
            db=db_session,
            org_id=test_org.org_id,
            branch_id=1,
            user_id=1,
            invoice_data=invoice_data
        )
        
        invoice = db_session.execute(
            "SELECT payment_status, paid_amount, credit_amount FROM sales.invoices WHERE invoice_id = :id",
            {"id": result["invoice_id"]}
        ).fetchone()
        
        assert invoice.payment_status == "partial"
        assert float(invoice.paid_amount) == 50.00
        assert float(invoice.credit_amount) == 50.00
