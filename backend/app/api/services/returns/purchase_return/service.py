"""
Purchase Return Service
Handles database operations for purchase returns
"""
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)


class PurchaseReturnService:
    """Service class for Purchase Return operations"""
    
    @staticmethod
    def get_returnable_items_from_invoice(db: Session, invoice_id: int) -> List[Dict[str, Any]]:
        """Get returnable items from supplier invoice."""
        result = db.execute(text("""
            SELECT sii.invoice_item_id, sii.product_id, p.product_name, sii.batch_id, sii.batch_number,
                   sii.quantity as invoice_quantity, COALESCE(sii.quantity_returned, 0) as already_returned,
                   sii.quantity - COALESCE(sii.quantity_returned, 0) as returnable_quantity,
                   sii.unit_price, sii.discount_percent,
                   COALESCE(sii.cgst_percent, 0) + COALESCE(sii.sgst_percent, 0) + COALESCE(sii.igst_percent, 0) as tax_percent,
                   sii.total_amount, p.hsn_code, sii.unit, b.expiry_date, b.manufacturing_date
            FROM procurement.supplier_invoice_items sii
            JOIN inventory.products p ON sii.product_id = p.product_id
            LEFT JOIN inventory.batches b ON sii.batch_id = b.batch_id
            WHERE sii.supplier_invoice_id = :invoice_id
            AND sii.quantity - COALESCE(sii.quantity_returned, 0) > 0
            ORDER BY sii.invoice_item_id
        """), {"invoice_id": invoice_id})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_returnable_items_from_grn(db: Session, invoice_id: int) -> List[Dict[str, Any]]:
        """Get returnable items from GRN linked to invoice."""
        result = db.execute(text("""
            SELECT gi.grn_item_id as invoice_item_id, gi.product_id, p.product_name,
                   NULL as batch_id, gi.batch_number,
                   gi.received_quantity as invoice_quantity,
                   COALESCE(gi.quantity_returned, 0) as already_returned,
                   gi.received_quantity - COALESCE(gi.quantity_returned, 0) as returnable_quantity,
                   gi.unit_price, 0 as discount_percent, 0 as tax_percent,
                   gi.received_quantity * gi.unit_price as total_amount,
                   p.hsn_code, gi.uom as unit, gi.expiry_date, gi.manufacturing_date
            FROM procurement.supplier_invoices si
            JOIN procurement.goods_receipt_notes grn ON si.grn_ids @> ARRAY[grn.grn_id]
            JOIN procurement.grn_items gi ON grn.grn_id = gi.grn_id
            JOIN inventory.products p ON gi.product_id = p.product_id
            WHERE si.supplier_invoice_id = :invoice_id
            AND gi.received_quantity - COALESCE(gi.quantity_returned, 0) > 0
            ORDER BY gi.grn_item_id
        """), {"invoice_id": invoice_id})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_supplier(db: Session, supplier_id: int) -> Optional[Dict[str, Any]]:
        """Get supplier details."""
        result = db.execute(text("""
            SELECT supplier_id, supplier_name, gst_number
            FROM parties.suppliers WHERE supplier_id = :supplier_id
        """), {"supplier_id": supplier_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def create_purchase_return(db: Session, data: Dict[str, Any]) -> int:
        """Create purchase return header."""
        result = db.execute(text("""
            INSERT INTO procurement.purchase_returns (
                org_id, branch_id, return_number, return_date, return_type,
                supplier_invoice_id, grn_id, supplier_id, return_reason, detailed_reason,
                return_amount, tax_amount, total_amount, cgst_amount, sgst_amount, igst_amount,
                debit_note_number, debit_note_date, debit_note_status, notes, created_by
            ) VALUES (
                :org_id, :branch_id, :return_number, :return_date, 'PURCHASE',
                :supplier_invoice_id, :grn_id, :supplier_id, :return_reason, :detailed_reason,
                :return_amount, :tax_amount, :total_amount, :cgst_amount, :sgst_amount, :igst_amount,
                :debit_note_number, CURRENT_DATE, :debit_note_status, :notes, :created_by
            ) RETURNING return_id
        """), data)
        return result.scalar()
    
    @staticmethod
    def get_invoice_item_returnable(db: Session, invoice_item_id: int) -> Optional[Dict[str, Any]]:
        """Get invoice item returnable quantity."""
        result = db.execute(text("""
            SELECT sii.quantity as invoice_qty, COALESCE(sii.quantity_returned, 0) as already_returned
            FROM procurement.supplier_invoice_items sii WHERE sii.invoice_item_id = :invoice_item_id
        """), {"invoice_item_id": invoice_item_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_grn_item_returnable(db: Session, grn_item_id: int) -> Optional[Dict[str, Any]]:
        """Get GRN item returnable quantity."""
        result = db.execute(text("""
            SELECT gi.received_quantity as invoice_qty, COALESCE(gi.quantity_returned, 0) as already_returned
            FROM procurement.grn_items gi WHERE gi.grn_item_id = :grn_item_id
        """), {"grn_item_id": grn_item_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def insert_return_item(db: Session, data: Dict[str, Any]) -> None:
        """Insert purchase return item."""
        db.execute(text("""
            INSERT INTO procurement.purchase_return_items (
                return_id, grn_item_id, product_id, batch_id, batch_number,
                return_quantity, uom, damaged_quantity, saleable_quantity,
                unit_price, return_value, tax_amount, item_return_reason, disposition
            ) VALUES (
                :return_id, :grn_item_id, :product_id, :batch_id, :batch_number,
                :return_quantity, :uom, :damaged_quantity, :saleable_quantity,
                :unit_price, :return_value, :tax_amount, :item_return_reason, :disposition
            )
        """), data)
    
    @staticmethod
    def update_batch_stock_for_return(db: Session, batch_id: int, return_qty: float) -> None:
        """Update batch stock for return to supplier."""
        db.execute(text("""
            UPDATE inventory.batches 
            SET quantity_available = quantity_available - :return_qty,
                quantity_returned = COALESCE(quantity_returned, 0) + :return_qty
            WHERE batch_id = :batch_id AND quantity_available >= :return_qty
        """), {"return_qty": return_qty, "batch_id": batch_id})
