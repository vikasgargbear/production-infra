"""
Supplier Invoice Service
Handles all database operations for supplier invoices
"""
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)


class SupplierInvoiceService:
    """Service class for Supplier Invoice operations"""
    
    @staticmethod
    def list_supplier_invoices(
        db: Session, org_id: str, from_date: str = None, to_date: str = None,
        supplier_id: int = None, limit: int = 100, skip: int = 0
    ) -> List[Dict[str, Any]]:
        """Get supplier invoices with GST details."""
        query = """
            SELECT si.supplier_invoice_id, si.supplier_invoice_number, si.invoice_date, si.supplier_id,
                   s.supplier_name, s.gst_number as supplier_gstin, si.subtotal_amount, si.discount_amount,
                   si.taxable_amount, si.cgst_amount, si.sgst_amount, si.igst_amount, si.cess_amount,
                   si.tax_amount, si.invoice_total, si.payment_status, si.itc_eligible,
                   si.gstr2a_matched, si.invoice_status
            FROM procurement.supplier_invoices si
            LEFT JOIN parties.suppliers s ON si.supplier_id = s.supplier_id
            WHERE si.org_id = :org_id AND si.invoice_status != 'cancelled' AND si.itc_eligible = true
        """
        params = {"org_id": org_id, "skip": skip, "limit": limit}
        if from_date:
            query += " AND si.invoice_date >= :from_date"
            params["from_date"] = from_date
        if to_date:
            query += " AND si.invoice_date <= :to_date"
            params["to_date"] = to_date
        if supplier_id:
            query += " AND si.supplier_id = :supplier_id"
            params["supplier_id"] = supplier_id
        query += " ORDER BY si.invoice_date DESC LIMIT :limit OFFSET :skip"
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def list_returnable_invoices(
        db: Session, org_id: str, supplier_id: int = None, from_date: str = None, to_date: str = None,
        limit: int = 50, skip: int = 0
    ) -> List[Dict[str, Any]]:
        """Get supplier invoices that have returnable items."""
        query = """
            SELECT si.supplier_invoice_id, si.supplier_invoice_number, si.invoice_date, si.supplier_id,
                   s.supplier_name, s.gst_number as supplier_gst, si.invoice_total as invoice_amount,
                   si.grn_ids,
                   COALESCE((SELECT COUNT(*) FROM procurement.supplier_invoice_items sii WHERE sii.supplier_invoice_id = si.supplier_invoice_id),
                            (SELECT COUNT(*) FROM procurement.grn_items gi JOIN procurement.goods_receipt_notes grn ON gi.grn_id = grn.grn_id WHERE grn.grn_id = ANY(si.grn_ids))) as total_items,
                   EXISTS (SELECT 1 FROM procurement.purchase_returns pr WHERE pr.supplier_invoice_id = si.supplier_invoice_id) as has_returns,
                   true as can_return
            FROM procurement.supplier_invoices si
            LEFT JOIN parties.suppliers s ON si.supplier_id = s.supplier_id AND s.org_id = :org_id
            WHERE si.org_id = :org_id
        """
        params = {"org_id": org_id, "skip": skip, "limit": limit}
        if supplier_id:
            query += " AND si.supplier_id = :supplier_id"
            params["supplier_id"] = supplier_id
        if from_date:
            query += " AND si.invoice_date >= :from_date"
            params["from_date"] = from_date
        if to_date:
            query += " AND si.invoice_date <= :to_date"
            params["to_date"] = to_date
        query += " ORDER BY si.invoice_date DESC LIMIT :limit OFFSET :skip"
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_invoice_details(db: Session, invoice_id: int) -> Optional[Dict[str, Any]]:
        """Get detailed information about a supplier invoice."""
        result = db.execute(text("""
            SELECT si.*, s.supplier_name, s.gst_number as supplier_gst, s.primary_phone as supplier_phone
            FROM procurement.supplier_invoices si
            LEFT JOIN parties.suppliers s ON si.supplier_id = s.supplier_id
            WHERE si.supplier_invoice_id = :invoice_id
        """), {"invoice_id": invoice_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_invoice_items(db: Session, invoice_id: int) -> List[Dict[str, Any]]:
        """Get items for a supplier invoice."""
        result = db.execute(text("""
            SELECT sii.*, p.product_name, p.hsn_code, b.batch_number, b.expiry_date
            FROM procurement.supplier_invoice_items sii
            JOIN inventory.products p ON sii.product_id = p.product_id
            LEFT JOIN inventory.batches b ON sii.batch_id = b.batch_id
            WHERE sii.supplier_invoice_id = :invoice_id ORDER BY sii.invoice_item_id
        """), {"invoice_id": invoice_id})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_invoice_items_from_grn(db: Session, invoice_id: int) -> List[Dict[str, Any]]:
        """Get items from GRN if no direct invoice items."""
        result = db.execute(text("""
            SELECT gi.grn_item_id as invoice_item_id, gi.product_id, p.product_name, gi.batch_number,
                   gi.received_quantity as quantity, gi.unit_price, 0 as discount_percent, 0 as tax_percent,
                   gi.received_quantity * gi.unit_price as total_amount, gi.uom as unit, gi.expiry_date
            FROM procurement.supplier_invoices si
            JOIN procurement.goods_receipt_notes grn ON si.grn_ids @> ARRAY[grn.grn_id]
            JOIN procurement.grn_items gi ON grn.grn_id = gi.grn_id
            JOIN inventory.products p ON gi.product_id = p.product_id
            WHERE si.supplier_invoice_id = :invoice_id ORDER BY gi.grn_item_id
        """), {"invoice_id": invoice_id})
        return [dict(row._mapping) for row in result]
