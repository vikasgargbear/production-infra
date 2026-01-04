"""
Shared Sales Validator - Common Validation Patterns
Reusable validation logic across invoice, order, and challan modules
"""
from typing import Any, List, Dict
import logging

logger = logging.getLogger(__name__)


class SalesSharedValidator:
    """Common validation patterns for all sales documents"""
    
    @staticmethod
    def validate_customer_id(customer_id: Any) -> None:
        """Validate customer ID is present and valid"""
        if not customer_id:
            raise ValueError("Customer ID is required")
        
        try:
            int(customer_id)
        except (ValueError, TypeError):
            raise ValueError(f"Invalid customer ID: {customer_id}")
    
    @staticmethod
    def validate_items(items: List[Any], document_type: str = "document") -> None:
        """
        Validate line items for any sales document.
        Used by: Invoice, Order, Challan
        """
        if not items or len(items) == 0:
            raise ValueError(f"At least one item is required for {document_type}")
        
        for i, item in enumerate(items):
            # Product ID validation
            if not hasattr(item, 'product_id') or not item.product_id:
                raise ValueError(f"Item {i+1}: Product ID is required")
            
            # Quantity validation
            quantity = getattr(item, 'quantity', 0)
            if not quantity or quantity <= 0:
                raise ValueError(f"Item {i+1}: Quantity must be greater than 0")
            
            # Price validation
            unit_price = getattr(item, 'unit_price', None)
            if unit_price is not None and unit_price < 0:
                raise ValueError(f"Item {i+1}: Unit price cannot be negative")
            
            # Discount validation
            discount_percent = getattr(item, 'discount_percent', 0) or 0
            if discount_percent < 0 or discount_percent > 100:
                raise ValueError(f"Item {i+1}: Discount percent must be between 0 and 100")
        
        logger.info(f"✅ Items validation passed: {len(items)} items for {document_type}")
    
    @staticmethod
    def validate_discount(
        discount_type: str = None,
        discount_percent: float = None,
        discount_amount: float = None
    ) -> None:
        """
        Validate discount parameters.
        Used by: Invoice, Order
        """
        if discount_percent is not None:
            if discount_percent < 0 or discount_percent > 100:
                raise ValueError("Discount percent must be between 0 and 100")
        
        if discount_amount is not None:
            if discount_amount < 0:
                raise ValueError("Discount amount cannot be negative")
        
        if discount_type and discount_type not in ['percentage', 'fixed']:
            raise ValueError("Discount type must be 'percentage' or 'fixed'")
    
    @staticmethod
    def validate_payment_data(
        payments: List[Dict[str, Any]], 
        final_amount: float,
        allow_overpayment: bool = True
    ) -> None:
        """
        Validate payment data.
        Used by: Invoice
        """
        if not payments:
            return
        
        total_paid = sum(float(p.get("amount", 0)) for p in payments)
        
        if total_paid < 0:
            raise ValueError("Total payment amount cannot be negative")
        
        if not allow_overpayment and total_paid > final_amount:
            raise ValueError(f"Payment amount (₹{total_paid}) exceeds invoice amount (₹{final_amount})")
        
        if allow_overpayment and total_paid > final_amount * 1.1:
            raise ValueError(f"Payment amount (₹{total_paid}) exceeds invoice amount (₹{final_amount}) by more than 10%")
        
        # Validate each payment
        for i, payment in enumerate(payments):
            if not payment.get("method"):
                raise ValueError(f"Payment {i+1}: Payment method is required")
            
            amount = float(payment.get("amount", 0))
            if amount <= 0:
                raise ValueError(f"Payment {i+1}: Amount must be greater than 0")
        
        logger.info(f"✅ Payment validation passed: {len(payments)} payments, total ₹{total_paid}")
    
    @staticmethod
    def validate_date_range(
        start_date: Any,
        end_date: Any,
        field_name: str = "date"
    ) -> None:
        """
        Validate date range.
        Used by: All sales documents
        """
        if start_date and end_date:
            if start_date > end_date:
                raise ValueError(f"{field_name}: Start date cannot be after end date")
    
    @staticmethod
    def validate_gst_type(gst_type: str) -> None:
        """
        Validate GST type.
        Used by: Invoice, Order
        """
        valid_types = ['CGST/SGST', 'IGST']
        if gst_type and gst_type not in valid_types:
            raise ValueError(f"GST type must be one of: {', '.join(valid_types)}")
