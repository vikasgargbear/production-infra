"""
Challan Validator - Business Rule Validation
No database access - pure validation logic
"""
from typing import Any
import logging

from ..shared import SalesSharedValidator

logger = logging.getLogger(__name__)


class ChallanValidator:
    """Challan business rule validation"""
    
    # Reuse shared validation methods
    validate_customer_id = SalesSharedValidator.validate_customer_id
    validate_items = SalesSharedValidator.validate_items
    
    @staticmethod
    def validate_challan_data(challan_data: Any) -> None:
        """
        Validate challan data before creation.
        Raises ValueError if validation fails.
        """
        # Use shared validators
        SalesSharedValidator.validate_customer_id(challan_data.customer_id)
        SalesSharedValidator.validate_items(challan_data.items, "challan")
        
        logger.info(f"✅ Challan validation passed: {len(challan_data.items)} items")
