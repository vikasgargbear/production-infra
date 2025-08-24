"""
Enhanced Purchase API endpoints
Comprehensive purchase order and GRN management
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Dict, Any
from datetime import datetime, date
import logging

from ...core.database import get_db
from ...core.auth_utils import get_org_id_from_header

logger = logging.getLogger(__name__)
router = APIRouter()

# Default organization ID

@router.post("/purchases", response_model=Dict[str, Any])
async def create_purchase_order(po_data: Dict[str, Any], db: Session = Depends(get_db)):
    """Create a new purchase order"""
    try:
        # Generate PO number if not provided
        po_number = po_data.get("po_number")
        if not po_number:
            current_year = datetime.now().year
            timestamp = int(datetime.now().timestamp())
            po_number = f"PO-{current_year}-{timestamp % 10000:04d}"
        
        # Insert purchase order
        po_query = text("""
            INSERT INTO procurement.purchase_orders (
                org_id, po_number, supplier_id, po_date, expected_delivery_date,
                billing_address, shipping_address, payment_terms,
                subtotal_amount, discount_percent, discount_amount,
                cgst_amount, sgst_amount, igst_amount, total_tax_amount,
                round_off_amount, total_amount, advance_amount, balance_amount,
                status, approval_status, created_by
            ) VALUES (
                :org_id, :po_number, :supplier_id, :po_date, :expected_delivery_date,
                :billing_address, :shipping_address, :payment_terms,
                :subtotal_amount, :discount_percent, :discount_amount,
                :cgst_amount, :sgst_amount, :igst_amount, :total_tax_amount,
                :round_off_amount, :total_amount, :advance_amount, :balance_amount,
                :status, :approval_status, :created_by
            ) RETURNING purchase_order_id, po_number
        """)
        
        result = db.execute(po_query, {
            "org_id": org_id,
            "po_number": po_number,
            "supplier_id": po_data.get("supplier_id"),
            "po_date": po_data.get("po_date", datetime.now().date()),
            "expected_delivery_date": po_data.get("delivery_date"),
            "billing_address": po_data.get("billing_address", {}),
            "shipping_address": po_data.get("shipping_address", {}),
            "payment_terms": po_data.get("payment_terms"),
            "subtotal_amount": po_data.get("subtotal", 0),
            "discount_percent": po_data.get("discount_percent", 0),
            "discount_amount": po_data.get("discount_amount", 0),
            "cgst_amount": po_data.get("cgst_amount", 0),
            "sgst_amount": po_data.get("sgst_amount", 0),
            "igst_amount": po_data.get("igst_amount", 0),
            "total_tax_amount": po_data.get("tax_amount", 0),
            "round_off_amount": po_data.get("round_off", 0),
            "total_amount": po_data.get("total_amount", 0),
            "advance_amount": po_data.get("advance_amount", 0),
            "balance_amount": po_data.get("balance_amount", po_data.get("total_amount", 0)),
            "status": po_data.get("status", "draft"),
            "approval_status": "pending",
            "created_by": 1
        })
        
        po_row = result.first()
        po_id = po_row[0]
        
        # Insert purchase order items
        if po_data.get("items"):
            for item in po_data["items"]:
                item_query = text("""
                    INSERT INTO procurement.purchase_order_items (
                        purchase_order_id, product_id, batch_number,
                        ordered_quantity, free_quantity, received_quantity,
                        uom, pack_type, pack_size,
                        rate_per_unit, mrp, discount_percent, discount_amount,
                        taxable_amount, cgst_rate, sgst_rate, igst_rate,
                        cgst_amount, sgst_amount, igst_amount,
                        line_total, status
                    ) VALUES (
                        :po_id, :product_id, :batch_number,
                        :ordered_quantity, :free_quantity, :received_quantity,
                        :uom, :pack_type, :pack_size,
                        :rate_per_unit, :mrp, :discount_percent, :discount_amount,
                        :taxable_amount, :cgst_rate, :sgst_rate, :igst_rate,
                        :cgst_amount, :sgst_amount, :igst_amount,
                        :line_total, :status
                    )
                """)
                
                db.execute(item_query, {
                    "po_id": po_id,
                    "product_id": item.get("product_id"),
                    "batch_number": item.get("batch_number"),
                    "ordered_quantity": item.get("quantity", 0),
                    "free_quantity": item.get("free_quantity", 0),
                    "received_quantity": 0,
                    "uom": item.get("uom", "Tablets"),
                    "pack_type": item.get("pack_type", "Box"),
                    "pack_size": item.get("pack_size", 1),
                    "rate_per_unit": item.get("rate", 0),
                    "mrp": item.get("mrp", 0),
                    "discount_percent": item.get("discount_percent", 0),
                    "discount_amount": item.get("discount_amount", 0),
                    "taxable_amount": item.get("taxable_amount", item.get("rate", 0) * item.get("quantity", 0)),
                    "cgst_rate": item.get("cgst_rate", 6),
                    "sgst_rate": item.get("sgst_rate", 6),
                    "igst_rate": item.get("igst_rate", 0),
                    "cgst_amount": item.get("cgst_amount", 0),
                    "sgst_amount": item.get("sgst_amount", 0),
                    "igst_amount": item.get("igst_amount", 0),
                    "line_total": item.get("line_total", 0),
                    "status": "pending"
                })
        
        db.commit()
        
        return {
            "purchase_order_id": po_id,
            "po_number": po_row[1],
            "message": "Purchase order created successfully"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating purchase order: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/purchases")
async def list_purchase_orders(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    supplier_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """List purchase orders with filtering"""
    try:
        query = text("""
            SELECT po.purchase_order_id, po.po_number, po.po_date,
                   po.supplier_id, s.supplier_name, po.total_amount,
                   po.status, po.approval_status
            FROM procurement.purchase_orders po
            LEFT JOIN parties.suppliers s ON po.supplier_id = s.supplier_id
            WHERE 1=1
                AND (:supplier_id IS NULL OR po.supplier_id = :supplier_id)
                AND (:status IS NULL OR po.status = :status)
            ORDER BY po.po_date DESC
            LIMIT :limit OFFSET :offset
        """)
        
        result = db.execute(query, {
            "supplier_id": supplier_id,
            "status": status,
            "limit": limit,
            "offset": offset
        })
        
        orders = []
        for row in result:
            orders.append({
                "purchase_order_id": row[0],
                "po_number": row[1],
                "po_date": str(row[2]) if row[2] else None,
                "supplier_id": row[3],
                "supplier_name": row[4],
                "total_amount": float(row[5]) if row[5] else 0,
                "status": row[6],
                "approval_status": row[7]
            })
        
        return {
            "purchase_orders": orders,
            "total": len(orders),
            "limit": limit,
            "offset": offset
        }
        
    except Exception as e:
        logger.error(f"Error listing purchase orders: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/purchases/{po_id}")
async def get_purchase_order(po_id: int, db: Session = Depends(get_db)):
    """Get purchase order details"""
    try:
        # Get purchase order
        po_query = text("""
            SELECT po.*, s.supplier_name, s.gst_number as supplier_gst
            FROM procurement.purchase_orders po
            LEFT JOIN parties.suppliers s ON po.supplier_id = s.supplier_id
            WHERE po.purchase_order_id = :po_id
        """)
        
        po_result = db.execute(po_query, {"po_id": po_id})
        po = po_result.first()
        
        if not po:
            raise HTTPException(status_code=404, detail="Purchase order not found")
        
        # Get order items
        items_query = text("""
            SELECT poi.*, p.product_name, p.product_code
            FROM procurement.purchase_order_items poi
            LEFT JOIN inventory.products p ON poi.product_id = p.product_id
            WHERE poi.purchase_order_id = :po_id
        """)
        
        items_result = db.execute(items_query, {"po_id": po_id})
        items = []
        for item in items_result:
            items.append(dict(item._mapping))
        
        po_dict = dict(po._mapping)
        po_dict["items"] = items
        
        return po_dict
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching purchase order: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))