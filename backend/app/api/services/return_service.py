"""
Return Service - Shared utilities for Sales and Purchase Returns

Provides DRY methods for:
- Tax resolution from source documents
- Batch ID resolution
- Inventory movement recording
- Return value calculations
"""
from typing import Optional, Tuple, Dict, Any
from decimal import Decimal
from sqlalchemy import text
from sqlalchemy.orm import Session
import logging

logger = logging.getLogger(__name__)


class ReturnService:
    """Shared service for sales and purchase returns processing"""
    
    @staticmethod
    def resolve_tax_from_sales_invoice(
        db: Session,
        invoice_item_id: int,
        provided_tax_percent: Optional[Decimal] = None,
        tax_percent_explicitly_provided: bool = False
    ) -> Tuple[Decimal, Decimal]:
        """
        Fetch tax and discount from original sales invoice if not explicitly provided.
        Respects frontend's explicit choice (e.g., tax_percent=0 means no GST return).
        
        Returns:
            Tuple of (tax_percent, discount_percent)
        """
        tax_percent = provided_tax_percent or Decimal("0")
        discount_percent = Decimal("0")
        
        if not invoice_item_id or tax_percent_explicitly_provided:
            return tax_percent, discount_percent
        
        try:
            result = db.execute(
                text("""
                    SELECT gst_percent, discount_percent
                    FROM sales.invoice_items
                    WHERE invoice_item_id = :invoice_item_id
                """),
                {"invoice_item_id": invoice_item_id}
            ).fetchone()
            
            if result:
                if result.gst_percent and tax_percent == 0:
                    tax_percent = Decimal(str(result.gst_percent))
                    logger.info(f"Fetched tax_percent {tax_percent}% from invoice item {invoice_item_id}")
                if result.discount_percent:
                    discount_percent = Decimal(str(result.discount_percent))
        except Exception as e:
            logger.warning(f"Could not fetch tax from invoice item {invoice_item_id}: {e}")
        
        return tax_percent, discount_percent
    
    @staticmethod
    def resolve_tax_from_supplier_invoice(
        db: Session,
        invoice_item_id: int,
        grn_item_id: Optional[int] = None,
        tax_percent_explicitly_provided: bool = False
    ) -> Decimal:
        """
        Fetch tax from supplier invoice or GRN if not explicitly provided.
        
        Returns:
            tax_percent as Decimal
        """
        if tax_percent_explicitly_provided:
            return Decimal("0")
        
        tax_percent = Decimal("0")
        
        try:
            # Try supplier invoice first
            if invoice_item_id:
                result = db.execute(
                    text("""
                        SELECT 
                            COALESCE(cgst_percent, 0) + COALESCE(sgst_percent, 0) + COALESCE(igst_percent, 0) as gst_percent
                        FROM procurement.supplier_invoice_items
                        WHERE invoice_item_id = :invoice_item_id
                    """),
                    {"invoice_item_id": invoice_item_id}
                ).fetchone()
                
                if result and result.gst_percent:
                    tax_percent = Decimal(str(result.gst_percent))
                    logger.info(f"Fetched tax_percent {tax_percent}% from supplier invoice item {invoice_item_id}")
                    return tax_percent
            
            # Fallback to GRN
            if grn_item_id:
                result = db.execute(
                    text("SELECT tax_percent FROM procurement.grn_items WHERE grn_item_id = :grn_item_id"),
                    {"grn_item_id": grn_item_id}
                ).fetchone()
                
                if result and result.tax_percent:
                    tax_percent = Decimal(str(result.tax_percent))
                    logger.info(f"Fetched tax_percent {tax_percent}% from GRN item {grn_item_id}")
        except Exception as e:
            logger.warning(f"Could not fetch tax from source document: {e}")
        
        return tax_percent
    
    @staticmethod
    def resolve_batch(
        db: Session,
        product_id: int,
        batch_number: Optional[str] = None,
        batch_id: Optional[int] = None,
        source_item_id: Optional[int] = None,
        source_type: str = "sales_invoice"  # or "grn"
    ) -> Tuple[Optional[int], Optional[str]]:
        """
        Resolve batch_id from batch_number, or fetch from source document.
        
        Returns:
            Tuple of (batch_id, batch_number)
        """
        # If we already have both, return
        if batch_id and batch_number:
            return batch_id, batch_number
        
        try:
            # Try to get from source document if we don't have batch info
            if source_item_id and not batch_number and not batch_id:
                if source_type == "sales_invoice":
                    result = db.execute(
                        text("""
                            SELECT batch_number, batch_id
                            FROM sales.invoice_items
                            WHERE invoice_item_id = :item_id
                        """),
                        {"item_id": source_item_id}
                    ).fetchone()
                elif source_type == "grn":
                    result = db.execute(
                        text("""
                            SELECT batch_number, batch_id
                            FROM procurement.grn_items
                            WHERE grn_item_id = :item_id
                        """),
                        {"item_id": source_item_id}
                    ).fetchone()
                else:
                    result = None
                
                if result:
                    batch_number = result.batch_number or getattr(result, '_mapping', {}).get('batch_number')
                    batch_id = result.batch_id or getattr(result, '_mapping', {}).get('batch_id')
            
            # If we have batch_number but no batch_id, look it up
            if batch_number and not batch_id:
                result = db.execute(
                    text("""
                        SELECT batch_id 
                        FROM inventory.batches 
                        WHERE batch_number = :batch_number 
                        AND product_id = :product_id
                        LIMIT 1
                    """),
                    {"batch_number": batch_number, "product_id": product_id}
                ).fetchone()
                
                if result:
                    batch_id = result.batch_id
        except Exception as e:
            logger.warning(f"Could not resolve batch for product {product_id}: {e}")
        
        return batch_id, batch_number
    
    @staticmethod
    def calculate_return_value(
        quantity: Decimal,
        unit_price: Decimal,
        discount_percent: Decimal = Decimal("0"),
        tax_percent: Decimal = Decimal("0")
    ) -> Dict[str, Decimal]:
        """
        Calculate return value components.
        
        Returns:
            Dict with base_value, discount_amount, return_value, tax_amount, total
        """
        base_value = quantity * unit_price
        discount_amount = base_value * discount_percent / 100
        return_value = base_value - discount_amount
        tax_amount = return_value * tax_percent / 100
        total = return_value + tax_amount
        
        return {
            "base_value": base_value,
            "discount_amount": discount_amount,
            "return_value": return_value,
            "tax_amount": tax_amount,
            "total": total
        }
    
    @staticmethod
    def record_inventory_movement(
        db: Session,
        org_id: str,
        product_id: int,
        batch_id: Optional[int],
        quantity: float,
        location_id: int,  # Required - callers must ensure valid location
        return_id: int,
        return_number: str,
        reason: str,
        created_by: int,
        movement_type: str = "RETURN",
        direction: str = "IN",
        reference_type: str = "SALES_RETURN"
    ) -> None:
        """Record standard inventory movement for returns."""
        try:
            notes = f"Return #{return_number}"
            
            db.execute(
                text("""
                    INSERT INTO inventory.inventory_movements (
                        org_id, movement_type, movement_date, movement_direction,
                        product_id, batch_id, quantity, base_quantity,
                        location_id, reference_type, reference_id, reference_number,
                        reason, notes, created_by
                    ) VALUES (
                        :org_id, :movement_type, CURRENT_TIMESTAMP, :direction,
                        :product_id, :batch_id, :quantity, :quantity,
                        :location_id, :reference_type, :return_id, :return_number,
                        :reason, :notes, :created_by
                    )
                """),
                {
                    "org_id": org_id,
                    "movement_type": movement_type,
                    "direction": direction,
                    "product_id": product_id,
                    "batch_id": batch_id,
                    "quantity": quantity,
                    "location_id": location_id,
                    "reference_type": reference_type,
                    "return_id": return_id,
                    "return_number": return_number,
                    "reason": reason,
                    "notes": notes,
                    "created_by": created_by
                }
            )
            logger.debug(f"Recorded {movement_type} movement for product {product_id}")
        except Exception as e:
            logger.error(f"Failed to record inventory movement: {e}")
            raise
    
    @staticmethod
    def determine_disposition(
        return_reason: str,
        explicit_restock: Optional[bool] = None
    ) -> Tuple[str, bool]:
        """
        Determine item disposition based on reason and restock flag.
        
        Returns:
            Tuple of (disposition, is_damaged)
        """
        damaged_reasons = [
            "damaged", "broken", "expired", "expiry", "quality issue", "defective",
            "contaminated", "leaking", "melted", "manufacturing defect"
        ]
        
        is_damaged = any(reason in return_reason.lower() for reason in damaged_reasons)
        
        if explicit_restock is False or is_damaged:
            disposition = "DESTROY" if is_damaged else "QUARANTINE"
        else:
            disposition = "RESTOCK"
        
        return disposition, is_damaged
