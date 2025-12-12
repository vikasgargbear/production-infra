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

from .inventory_service import InventoryService
from ..schemas.inventory import StockMovementCreate
from ...core.constants import ReturnStatus, DispositionType

logger = logging.getLogger(__name__)

# Damaged reasons for inventory disposition decisions
DAMAGED_REASONS = [
    "damaged", "broken", "expired", "expiry", "quality issue", "defective",
    "contaminated", "leaking", "melted", "manufacturing defect"
]



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
        location_id: int,
        return_id: int,
        return_number: str,
        reason: str,
        created_by: int,
        movement_type: str = "return",
        reference_type: str = "sales_return"
    ) -> None:
        """Record inventory movement for returns using InventoryService."""
        movement_data = StockMovementCreate(
            org_id=org_id,
            product_id=product_id,
            batch_id=batch_id,
            movement_type=movement_type,
            quantity=Decimal(str(quantity)),
            reference_type=reference_type,
            reference_id=return_id,
            reference_number=return_number,
            location_id=location_id,
            reason=reason,
            notes=f"Return #{return_number}",
            created_by=created_by
        )
        InventoryService.record_stock_movement(db, movement_data)
    
    @staticmethod
    def determine_disposition(
        return_reason: str,
        explicit_restock: Optional[bool] = None
    ) -> Tuple[str, bool]:
        """
        Determine item disposition based on reason and restock flag.
        Uses DAMAGED_REASONS constant for consistency.
        
        Returns:
            Tuple of (disposition, is_damaged)
        """
        is_damaged = any(reason in return_reason.lower() for reason in DAMAGED_REASONS)
        
        if explicit_restock is False or is_damaged:
            disposition = "DESTROY" if is_damaged else "QUARANTINE"
        else:
            disposition = "RESTOCK"
        
        return disposition, is_damaged

    @staticmethod
    def calculate_return_totals(
        items: list,
        gst_type: str = "CGST/SGST"
    ) -> Dict[str, Any]:
        """
        Calculate all return totals from items list.
        
        Args:
            items: List of item dicts with return_quantity/quantity, rate, discount_percent, tax_percent
            gst_type: CGST/SGST for intra-state, IGST for inter-state
            
        Returns:
            Dict with subtotal, tax_amount, cgst_amount, sgst_amount, igst_amount, total_amount
        """
        from .gst_service import GSTService
        
        subtotal = Decimal("0")
        tax_amount = Decimal("0")
        cgst_amount = Decimal("0")
        sgst_amount = Decimal("0")
        igst_amount = Decimal("0")
        total_amount = Decimal("0")
        
        for item in items:
            # Handle both return_quantity and quantity field names
            qty = Decimal(str(item.get("return_quantity") or item.get("quantity", 0)))
            rate = Decimal(str(item.get("rate", 0)))
            discount_percent = Decimal(str(item.get("discount_percent", 0)))
            tax_percent = Decimal(str(item.get("tax_percent", 0)))
            
            # Calculate with discount
            base_amount = qty * rate
            discount_amount = (base_amount * discount_percent) / 100
            taxable_amount = base_amount - discount_amount
            
            # Use GSTService for consistent tax calculations
            gst_components = GSTService.calculate_gst_components(taxable_amount, tax_percent, gst_type)
            item_tax = gst_components["total_tax_amount"]
            item_cgst = gst_components["cgst_amount"]
            item_sgst = gst_components["sgst_amount"]
            item_igst = gst_components["igst_amount"]
            
            subtotal += taxable_amount
            tax_amount += item_tax
            cgst_amount += item_cgst
            sgst_amount += item_sgst
            igst_amount += item_igst
            total_amount += taxable_amount + item_tax
        
        return {
            "subtotal": subtotal,
            "tax_amount": tax_amount,
            "cgst_amount": cgst_amount,
            "sgst_amount": sgst_amount,
            "igst_amount": igst_amount,
            "total_amount": total_amount
        }
