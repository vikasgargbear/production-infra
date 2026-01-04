"""
Order Validator - Business Rule Validation
No database access - pure validation logic
"""
from typing import Any
import logging

from ..shared import SalesSharedValidator

logger = logging.getLogger(__name__)


class OrderValidator:
    """Order business rule validation"""
    
    # Reuse shared validation methods
    validate_customer_id = SalesSharedValidator.validate_customer_id
    validate_items = SalesSharedValidator.validate_items
    validate_discount = SalesSharedValidator.validate_discount
    validate_gst_type = SalesSharedValidator.validate_gst_type
    
    @staticmethod
    def validate_order_data(order_data: Any) -> None:
        """
        Validate order data before creation.
        Raises ValueError if validation fails.
        """
        # Use shared validators
        SalesSharedValidator.validate_customer_id(order_data.customer_id)
        SalesSharedValidator.validate_items(order_data.items, "order")
        
        # Order-specific discount validation
        if hasattr(order_data, 'discount_type') or hasattr(order_data, 'discount_percent') or hasattr(order_data, 'discount_amount'):
            SalesSharedValidator.validate_discount(
                discount_type=getattr(order_data, 'discount_type', None),
                discount_percent=getattr(order_data, 'discount_percent', None),
                discount_amount=getattr(order_data, 'discount_amount', None)
            )
        
        # GST type validation
        if hasattr(order_data, 'gst_type') and order_data.gst_type:
            SalesSharedValidator.validate_gst_type(order_data.gst_type)
        
        logger.info(f"✅ Order validation passed: {len(order_data.items)} items")
