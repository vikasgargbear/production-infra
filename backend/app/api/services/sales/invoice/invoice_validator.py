"""
Invoice Validator - Business Rule Validation
No database access - pure validation logic
"""
from typing import Any, Dict, List
import logging

from ..shared import SalesSharedValidator

logger = logging.getLogger(__name__)


class InvoiceValidator:
    """Invoice business rule validation"""
    
    # Reuse shared validation methods
    validate_customer_id = SalesSharedValidator.validate_customer_id
    validate_items = SalesSharedValidator.validate_items
    validate_discount = SalesSharedValidator.validate_discount
    validate_payment_data = SalesSharedValidator.validate_payment_data
    validate_gst_type = SalesSharedValidator.validate_gst_type
    
    @staticmethod
    def validate_invoice_data(invoice_data: Any) -> None:
        """
        Validate invoice data before creation.
        Raises ValueError if validation fails.
        """
        # Use shared validators
        SalesSharedValidator.validate_customer_id(invoice_data.customer_id)
        SalesSharedValidator.validate_items(invoice_data.items, "invoice")
        
        # Invoice-specific discount validation
        if hasattr(invoice_data, 'discount_type') or hasattr(invoice_data, 'discount_percent') or hasattr(invoice_data, 'discount_amount'):
            SalesSharedValidator.validate_discount(
                discount_type=getattr(invoice_data, 'discount_type', None),
                discount_percent=getattr(invoice_data, 'discount_percent', None),
                discount_amount=getattr(invoice_data, 'discount_amount', None)
            )
        
        # GST type validation
        if hasattr(invoice_data, 'gst_type') and invoice_data.gst_type:
            SalesSharedValidator.validate_gst_type(invoice_data.gst_type)
        
        logger.info(f"✅ Invoice validation passed: {len(invoice_data.items)} items")

