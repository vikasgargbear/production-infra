"""
Purchase Orders API
Handles purchase order creation and management for the enterprise pharma system
"""
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel, Field
import logging

from ...core.database import get_db
from ...core.config import DEFAULT_ORG_ID

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/purchase-orders", tags=["purchase-orders"])

# Pydantic Models for Purchase Orders
class PurchaseOrderItem(BaseModel):
    product_id: int = Field(..., gt=0)
    quantity: float = Field(..., gt=0) 
    unit_price: float = Field(..., ge=0)
    tax_percent: float = Field(default=12.0, ge=0)
    discount_percent: float = Field(default=0.0, ge=0)
    free_quantity: float = Field(default=0.0, ge=0)

class PurchaseOrderCreate(BaseModel):
    supplier_id: int = Field(..., gt=0)
    order_date: date = Field(default_factory=date.today)
    expected_delivery: Optional[date] = None
    payment_terms: str = Field(default="credit", pattern=r"^(cash|credit|advance)$")
    items: List[PurchaseOrderItem] = Field(..., min_items=1)
    notes: Optional[str] = None
    org_id: Optional[str] = None

class PurchaseOrderResponse(BaseModel):
    po_id: int
    po_number: str
    po_date: date
    supplier_id: int
    supplier_name: str
    total_amount: float
    po_status: str
    items_count: int

@router.post("/", response_model=PurchaseOrderResponse)
async def create_purchase_order(
    order: PurchaseOrderCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new purchase order with items
    
    - Validates supplier exists
    - Calculates taxes and totals
    - Creates PO header and items
    """
    try:
        # Use provided org_id or default
        org_id = order.org_id or DEFAULT_ORG_ID
        
        # Validate supplier exists
        supplier = db.execute(text("""
            SELECT supplier_id, supplier_name, gst_number, contact_phone
            FROM parties.suppliers 
            WHERE supplier_id = :id
        """), {"id": order.supplier_id}).fetchone()
        
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")
        
        # Calculate totals
        subtotal = Decimal("0")
        tax_total = Decimal("0")
        items_data = []
        
        for item in order.items:
            quantity = Decimal(str(item.quantity))
            unit_price = Decimal(str(item.unit_price))
            tax_percent = Decimal(str(item.tax_percent))
            discount_percent = Decimal(str(item.discount_percent))
            
            line_subtotal = quantity * unit_price
            discount_amount = line_subtotal * discount_percent / 100
            taxable_amount = line_subtotal - discount_amount
            tax_amount = taxable_amount * tax_percent / 100
            line_total = taxable_amount + tax_amount
            
            subtotal += taxable_amount
            tax_total += tax_amount
            
            items_data.append({
                "product_id": item.product_id,
                "quantity": quantity,
                "unit_price": unit_price,
                "tax_percent": tax_percent,
                "tax_amount": tax_amount,
                "discount_percent": discount_percent,
                "discount_amount": discount_amount,
                "line_total": line_total,
                "free_quantity": Decimal(str(item.free_quantity))
            })
        
        total_amount = subtotal + tax_total
        
        # Generate PO number
        po_number = db.execute(text("""
            SELECT 'PO-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
                   LPAD(COALESCE(MAX(CAST(SPLIT_PART(po_number, '-', 3) AS INTEGER)), 0) + 1, 4, '0')
            FROM procurement.purchase_orders
            WHERE po_number LIKE 'PO-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-%'
        """)).scalar() or f"PO-{datetime.now().strftime('%Y%m%d')}-0001"
        
        # Create purchase order
        result = db.execute(text("""
            INSERT INTO procurement.purchase_orders (
                org_id, branch_id, po_number, po_date, po_type,
                supplier_id, supplier_name, supplier_contact, supplier_gst,
                delivery_date, payment_terms,
                subtotal_amount, tax_amount, total_amount,
                po_status, grn_status, payment_status,
                internal_notes, created_at, updated_at
            ) VALUES (
                :org_id, 1, :po_number, :po_date, 'regular',
                :supplier_id, :supplier_name, :supplier_contact, :supplier_gst,
                :delivery_date, :payment_terms,
                :subtotal, :tax, :total,
                'draft', 'pending', 'unpaid',
                :notes, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING po_id
        """), {
            "org_id": org_id,
            "po_number": po_number,
            "po_date": order.order_date,
            "supplier_id": supplier.supplier_id,
            "supplier_name": supplier.supplier_name,
            "supplier_contact": supplier.contact_phone,
            "supplier_gst": supplier.gst_number,
            "delivery_date": order.expected_delivery,
            "payment_terms": order.payment_terms,
            "subtotal": subtotal,
            "tax": tax_total,
            "total": total_amount,
            "notes": order.notes
        })
        
        po_id = result.scalar()
        
        # Create PO items
        for item_data in items_data:
            # Get product details
            product = db.execute(text("""
                SELECT product_name, product_code 
                FROM inventory.products 
                WHERE product_id = :id
            """), {"id": item_data["product_id"]}).fetchone()
            
            db.execute(text("""
                INSERT INTO procurement.purchase_order_items (
                    po_id, product_id, product_name, product_code,
                    ordered_quantity, unit_price, free_quantity,
                    discount_percentage, discount_amount,
                    line_total, gst_percentage, 
                    cgst_amount, sgst_amount, igst_amount,
                    line_total_with_tax,
                    pending_quantity,
                    created_at, updated_at
                ) VALUES (
                    :po_id, :product_id, :product_name, :product_code,
                    :quantity, :unit_price, :free_quantity,
                    :discount_percent, :discount_amount,
                    :line_subtotal, :tax_percent,
                    :cgst, :sgst, :igst,
                    :line_total,
                    :quantity,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
            """), {
                "po_id": po_id,
                "product_id": item_data["product_id"],
                "product_name": product.product_name if product else f"Product {item_data['product_id']}",
                "product_code": product.product_code if product else "",
                "quantity": item_data["quantity"],
                "unit_price": item_data["unit_price"],
                "free_quantity": item_data["free_quantity"],
                "discount_percent": item_data["discount_percent"],
                "discount_amount": item_data["discount_amount"],
                "line_subtotal": item_data["line_total"] - item_data["tax_amount"],
                "tax_percent": item_data["tax_percent"],
                "cgst": item_data["tax_amount"] / 2,  # Assuming intra-state
                "sgst": item_data["tax_amount"] / 2,
                "igst": 0,
                "line_total": item_data["line_total"]
            })
        
        db.commit()
        
        # Return response
        return PurchaseOrderResponse(
            po_id=po_id,
            po_number=po_number,
            po_date=order.order_date,
            supplier_id=supplier.supplier_id,
            supplier_name=supplier.supplier_name,
            total_amount=float(total_amount),
            po_status="draft",
            items_count=len(items_data)
        )
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating purchase order: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create purchase order: {str(e)}")

@router.get("/")
async def list_purchase_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    supplier_id: Optional[int] = None,
    status: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db)
):
    """List purchase orders with filters"""
    try:
        query = """
            SELECT po.*, 
                   COUNT(poi.po_item_id) as items_count,
                   SUM(poi.pending_quantity) as total_pending
            FROM procurement.purchase_orders po
            LEFT JOIN procurement.purchase_order_items poi ON po.po_id = poi.po_id
            WHERE po.org_id = :org_id
        """
        params = {"org_id": DEFAULT_ORG_ID}
        
        if supplier_id:
            query += " AND po.supplier_id = :supplier_id"
            params["supplier_id"] = supplier_id
        
        if status:
            query += " AND po.po_status = :status"
            params["status"] = status
        
        if from_date:
            query += " AND po.po_date >= :from_date"
            params["from_date"] = from_date
        
        if to_date:
            query += " AND po.po_date <= :to_date"
            params["to_date"] = to_date
        
        query += """
            GROUP BY po.po_id
            ORDER BY po.po_date DESC, po.po_id DESC
            LIMIT :limit OFFSET :skip
        """
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        
        orders = []
        for row in result:
            order_dict = dict(row._mapping)
            orders.append(order_dict)
        
        return {"purchase_orders": orders}
        
    except Exception as e:
        logger.error(f"Error listing purchase orders: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list purchase orders: {str(e)}")

@router.get("/{po_id}")
async def get_purchase_order(
    po_id: int,
    db: Session = Depends(get_db)
):
    """Get purchase order details with items"""
    try:
        # Get PO header
        po_result = db.execute(text("""
            SELECT po.*, s.email as supplier_email, s.address as supplier_address
            FROM procurement.purchase_orders po
            LEFT JOIN parties.suppliers s ON po.supplier_id = s.supplier_id
            WHERE po.po_id = :id AND po.org_id = :org_id
        """), {"id": po_id, "org_id": DEFAULT_ORG_ID})
        
        po = po_result.fetchone()
        if not po:
            raise HTTPException(status_code=404, detail=f"Purchase order {po_id} not found")
        
        po_dict = dict(po._mapping)
        
        # Get PO items
        items_result = db.execute(text("""
            SELECT poi.*, p.hsn_code, p.manufacturer
            FROM procurement.purchase_order_items poi
            LEFT JOIN inventory.products p ON poi.product_id = p.product_id
            WHERE poi.po_id = :po_id
            ORDER BY poi.po_item_id
        """), {"po_id": po_id})
        
        po_dict["items"] = [dict(item._mapping) for item in items_result]
        
        return po_dict
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting purchase order: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get purchase order: {str(e)}")