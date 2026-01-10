"""
Schema Validation Tests

Tests that critical API responses match defined schemas.
"""
import pytest
from jsonschema import validate, ValidationError
from app.api.shared.schemas import get_schema


class TestSchemaValidation:
    """Tests for schema validation"""
    
    def test_valid_invoice_passes_schema(self):
        """Valid invoice data should pass schema validation"""
        invoice_data = {
            "invoice_id": 1,
            "invoice_number": "INV-001",
            "invoice_date": "2026-01-10",
            "customer_id": 100,
            "final_amount": 1000.00,
            "paid_amount": 500.00,
            "credit_amount": 500.00,
            "payment_status": "partial",
            "invoice_status": "posted",
            "items": [{
                "invoice_item_id": 1,
                "product_id": 50,
                "quantity": 5,
                "unit_price": 100.00,
                "discount_percent": 10,
                "discount_amount": 50.00,
                "taxable_amount": 450.00,
                "cgst_amount": 40.50,
                "sgst_amount": 40.50,
                "igst_amount": 0.00,
                "line_total": 531.00
            }]
        }
        
        schema = get_schema("invoice")
        validate(instance=invoice_data, schema=schema)  # Should not raise
    
    def test_invoice_with_zero_line_total_fails(self):
        """Invoice item with zero line_total should fail validation"""
        invoice_data = {
            "invoice_id": 1,
            "invoice_number": "INV-001",
            "invoice_date": "2026-01-10",
            "customer_id": 100,
            "final_amount": 0.00,
            "paid_amount": 0.00,
            "credit_amount": 0.00,
            "payment_status": "unpaid",
            "invoice_status": "draft",
            "items": [{
                "invoice_item_id": 1,
                "product_id": 50,
                "quantity": 5,
                "unit_price": 100.00,
                "discount_amount": 0.00,
                "taxable_amount": 0.00,
                "line_total": 0.00  # Should fail
            }]
        }
        
        schema = get_schema("invoice")
        with pytest.raises(ValidationError):
            validate(instance=invoice_data, schema=schema)
    
    def test_batch_without_updated_at_fails(self):
        """Batch without updated_at should fail validation"""
        batch_data = {
            "batch_id": 1,
            "product_id": 50,
            "batch_number": "BATCH-001",
            "quantity_available": 100.0,
            "mrp": 150.00
            # Missing updated_at
        }
        
        schema = get_schema("batch")
        with pytest.raises(ValidationError):
            validate(instance=batch_data, schema=schema)
    
    def test_valid_batch_passes_schema(self):
        """Valid batch with updated_at should pass"""
        batch_data = {
            "batch_id": 1,
            "product_id": 50,
            "batch_number": "BATCH-001",
            "quantity_available": 100.0,
            "mrp": 150.00,
            "updated_at": "2026-01-10T10:30:00Z"
        }
        
        schema = get_schema("batch")
        validate(instance=batch_data, schema=schema)
    
    def test_payment_with_zero_amount_fails(self):
        """Payment with zero or negative amount should fail"""
        payment_data = {
            "payment_id": 1,
            "amount": 0.00,  # Should fail
            "payment_method": "cash",
            "payment_status": "completed",
            "payment_date": "2026-01-10"
        }
        
        schema = get_schema("payment")
        with pytest.raises(ValidationError):
            validate(instance=payment_data, schema=schema)
