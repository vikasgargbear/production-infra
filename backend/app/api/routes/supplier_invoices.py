"""
Supplier Invoice API Router
Handles supplier invoices and related operations
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from datetime import datetime
from decimal import Decimal

from ...core.database import get_db
from ...core.auth_utils import get_org_id_from_header

logger = logging.getLogger(__name__)

router = APIRouter(tags=["supplier-invoices"])

@router.get("/returnable/")
async def get_returnable_invoices(
    supplier_id: Optional[int] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get supplier invoices that have returnable items
    """
    try:
        query = """
            SELECT 
                si.supplier_invoice_id,
                si.supplier_invoice_number,
                si.invoice_date,
                si.supplier_id,
                s.supplier_name,
                s.gst_number as supplier_gst,
                si.total_amount as invoice_amount,
                si.grn_ids,
                -- Count items from supplier_invoice_items or GRN items
                COALESCE(
                    (SELECT COUNT(*) FROM procurement.supplier_invoice_items 
                     WHERE supplier_invoice_id = si.supplier_invoice_id),
                    (SELECT COUNT(*) FROM procurement.grn_items gi
                     JOIN procurement.goods_receipt_notes grn ON gi.grn_id = grn.grn_id
                     WHERE grn.grn_id = ANY(si.grn_ids))
                ) as total_items,
                -- Check if has returns
                EXISTS (
                    SELECT 1 FROM procurement.purchase_returns pr
                    WHERE pr.supplier_invoice_id = si.supplier_invoice_id
                ) as has_returns,
                true as can_return
            FROM procurement.supplier_invoices si
            LEFT JOIN parties.suppliers s ON si.supplier_id = s.supplier_id
            WHERE 1=1
        """
        
        params = {"skip": skip, "limit": limit}
        
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
        
        invoices = db.execute(text(query), params).fetchall()
        
        result = []
        for invoice in invoices:
            invoice_dict = dict(invoice._mapping)
            # Add additional info
            invoice_dict["invoice_type"] = "supplier"
            invoice_dict["has_grn"] = bool(invoice.grn_ids and len(invoice.grn_ids) > 0)
            result.append(invoice_dict)
            
        return {
            "invoices": result,
            "total": len(result),
            "skip": skip,
            "limit": limit
        }
        
    except Exception as e:
        logger.error(f"Error fetching returnable invoices: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{invoice_id}")
async def get_invoice_details(
    invoice_id: int,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get detailed information about a supplier invoice
    """
    try:
        invoice = db.execute(
            text("""
                SELECT 
                    si.*,
                    s.supplier_name,
                    s.gst_number as supplier_gst,
                    s.phone as supplier_phone,
                    s.address as supplier_address
                FROM procurement.supplier_invoices si
                LEFT JOIN parties.suppliers s ON si.supplier_id = s.supplier_id
                WHERE si.supplier_invoice_id = :invoice_id
            """),
            {"invoice_id": invoice_id}
        ).fetchone()
        
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
            
        return dict(invoice._mapping)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching invoice details: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{invoice_id}/items")
async def get_invoice_items(
    invoice_id: int,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get items for a supplier invoice
    """
    try:
        # First try supplier_invoice_items table
        items = db.execute(
            text("""
                SELECT 
                    sii.*,
                    p.product_name,
                    p.hsn_code,
                    b.batch_number,
                    b.expiry_date
                FROM procurement.supplier_invoice_items sii
                JOIN inventory.products p ON sii.product_id = p.product_id
                LEFT JOIN inventory.batches b ON sii.batch_id = b.batch_id
                WHERE sii.supplier_invoice_id = :invoice_id
                ORDER BY sii.invoice_item_id
            """),
            {"invoice_id": invoice_id}
        ).fetchall()
        
        # If no items in supplier_invoice_items, try GRN items
        if not items:
            items = db.execute(
                text("""
                    SELECT 
                        gi.grn_item_id as invoice_item_id,
                        gi.product_id,
                        p.product_name,
                        p.hsn_code,
                        gi.batch_id,
                        gi.batch_number,
                        gi.received_quantity as quantity,
                        gi.unit_price,
                        gi.discount_percent,
                        gi.tax_percent,
                        gi.total_amount,
                        gi.uom as unit,
                        b.expiry_date
                    FROM procurement.supplier_invoices si
                    JOIN procurement.goods_receipt_notes grn ON si.grn_ids @> ARRAY[grn.grn_id]
                    JOIN procurement.grn_items gi ON grn.grn_id = gi.grn_id
                    JOIN inventory.products p ON gi.product_id = p.product_id
                    LEFT JOIN inventory.batches b ON gi.batch_id = b.batch_id
                    WHERE si.supplier_invoice_id = :invoice_id
                    ORDER BY gi.grn_item_id
                """),
                {"invoice_id": invoice_id}
            ).fetchall()
        
        return {
            "items": [dict(item._mapping) for item in items],
            "total": len(items)
        }
        
    except Exception as e:
        logger.error(f"Error fetching invoice items: {e}")
        raise HTTPException(status_code=500, detail=str(e))