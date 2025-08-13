"""
Purchases API Router
Manages purchase orders and inventory procurement
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from datetime import date

from ...core.database import get_db
from ...models import Purchase
from ...core.crud_base import create_crud

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/purchases", tags=["purchases"])

# Create CRUD instance
purchase_crud = create_crud(Purchase)

@router.get("/")
def get_purchases(
    skip: int = 0,
    limit: int = 100,
    supplier_id: Optional[int] = Query(None, description="Filter by supplier"),
    product_id: Optional[int] = Query(None, description="Filter by product"),
    start_date: Optional[date] = Query(None, description="Filter from date"),
    end_date: Optional[date] = Query(None, description="Filter to date"),
    db: Session = Depends(get_db)
):
    """Get purchases with optional filtering"""
    try:
        query = """
            SELECT DISTINCT p.*, s.supplier_name
            FROM procurement.purchase_orders p
            LEFT JOIN parties.suppliers s ON p.supplier_id = s.supplier_id
        """
        
        if product_id:
            query += """
            INNER JOIN procurement.purchase_order_items poi ON p.po_id = poi.po_id
            """
        
        query += " WHERE 1=1"
        params = {}
        
        if supplier_id:
            query += " AND p.supplier_id = :supplier_id"
            params["supplier_id"] = supplier_id
            
        if product_id:
            query += " AND poi.product_id = :product_id"
            params["product_id"] = product_id
            
        if start_date:
            query += " AND p.po_date >= :start_date"
            params["start_date"] = start_date
            
        if end_date:
            query += " AND p.po_date <= :end_date"
            params["end_date"] = end_date
            
        query += " ORDER BY p.po_date DESC LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        purchases = [dict(row._mapping) for row in result]
        
        return purchases
        
    except Exception as e:
        logger.error(f"Error fetching purchases: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get purchases: {str(e)}")

@router.get("/{purchase_id}")
def get_purchase(purchase_id: int, db: Session = Depends(get_db)):
    """Get a single purchase by ID with related data"""
    try:
        result = db.execute(
            text("""
                SELECT p.*, s.supplier_name
                FROM procurement.purchase_orders p
                LEFT JOIN parties.suppliers s ON p.supplier_id = s.supplier_id
                WHERE p.po_id = :po_id
            """),
            {"po_id": purchase_id}
        )
        purchase = result.first()
        if not purchase:
            raise HTTPException(status_code=404, detail="Purchase not found")
        return dict(purchase._mapping)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching purchase {purchase_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get purchase: {str(e)}")

@router.post("/")
def create_purchase(purchase_data: dict, db: Session = Depends(get_db)):
    """Create a new purchase order"""
    try:
        items = purchase_data.pop('items', [])
        
        # Ensure required fields have defaults
        if 'created_by' not in purchase_data or purchase_data['created_by'] is None:
            purchase_data['created_by'] = 2  # Use existing admin user
        if 'po_status' not in purchase_data:
            purchase_data['po_status'] = 'draft'
        if 'po_type' not in purchase_data:
            purchase_data['po_type'] = 'regular'
        if 'org_id' not in purchase_data:
            purchase_data['org_id'] = 'ad808530-1ddb-4377-ab20-67bef145d80d'  # DEFAULT_ORG_ID
        if 'branch_id' not in purchase_data:
            purchase_data['branch_id'] = 1
        
        # Add defaults for missing fields
        if 'supplier_contact' not in purchase_data:
            purchase_data['supplier_contact'] = None
        if 'supplier_gst' not in purchase_data:
            purchase_data['supplier_gst'] = None
        if 'delivery_date' not in purchase_data:
            purchase_data['delivery_date'] = None
        if 'payment_terms' not in purchase_data:
            purchase_data['payment_terms'] = None
        if 'payment_days' not in purchase_data:
            purchase_data['payment_days'] = None
        if 'discount_percent' not in purchase_data:
            purchase_data['discount_percent'] = 0
        if 'discount_amount' not in purchase_data:
            purchase_data['discount_amount'] = 0
        if 'freight_amount' not in purchase_data:
            purchase_data['freight_amount'] = 0
        if 'other_charges' not in purchase_data:
            purchase_data['other_charges'] = 0
            
        # Insert purchase order
        po_query = text("""
            INSERT INTO procurement.purchase_orders (
                org_id, branch_id, po_number, po_date, po_type,
                supplier_id, supplier_name, supplier_contact, supplier_gst,
                delivery_date, payment_terms, payment_days,
                subtotal_amount, discount_percent, discount_amount,
                freight_amount, other_charges, tax_amount, total_amount,
                po_status, created_by
            ) VALUES (
                :org_id, :branch_id, :po_number, :po_date, :po_type,
                :supplier_id, :supplier_name, :supplier_contact, :supplier_gst,
                :delivery_date, :payment_terms, :payment_days,
                :subtotal_amount, :discount_percent, :discount_amount,
                :freight_amount, :other_charges, :tax_amount, :total_amount,
                :po_status, :created_by
            ) RETURNING *
        """)
        
        result = db.execute(po_query, purchase_data)
        po = dict(result.first()._mapping)
        
        # Insert purchase order items
        if items:
            for item in items:
                item['po_id'] = po['po_id']
                item_query = text("""
                    INSERT INTO procurement.purchase_order_items (
                        po_id, product_id, product_name, product_code,
                        ordered_quantity, unit_price, discount_percentage,
                        discount_amount, line_total, tax_percentage, tax_amount,
                        total_amount
                    ) VALUES (
                        :po_id, :product_id, :product_name, :product_code,
                        :ordered_quantity, :unit_price, :discount_percentage,
                        :discount_amount, :line_total, :tax_percentage, :tax_amount,
                        :total_amount
                    )
                """)
                db.execute(item_query, item)
        
        db.commit()
        return po
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating purchase: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create purchase: {str(e)}")

@router.put("/{purchase_id}")
def update_purchase(purchase_id: int, purchase_data: dict, db: Session = Depends(get_db)):
    """Update a purchase order"""
    try:
        # Check if PO exists
        check_query = text("SELECT po_id FROM procurement.purchase_orders WHERE po_id = :po_id")
        result = db.execute(check_query, {"po_id": purchase_id})
        if not result.first():
            raise HTTPException(status_code=404, detail="Purchase order not found")
        
        # Build update query dynamically
        update_fields = []
        params = {"po_id": purchase_id}
        
        allowed_fields = [
            'po_date', 'po_type', 'supplier_id', 'supplier_name', 'delivery_date',
            'payment_terms', 'payment_days', 'subtotal_amount', 'discount_percent',
            'discount_amount', 'freight_amount', 'other_charges', 'tax_amount',
            'total_amount', 'po_status', 'approval_status', 'special_instructions'
        ]
        
        for field in allowed_fields:
            if field in purchase_data:
                update_fields.append(f"{field} = :{field}")
                params[field] = purchase_data[field]
        
        if update_fields:
            update_query = text(f"""
                UPDATE procurement.purchase_orders
                SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP
                WHERE po_id = :po_id
                RETURNING *
            """)
            
            result = db.execute(update_query, params)
            db.commit()
            return dict(result.first()._mapping)
        
        return {"message": "No fields to update"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating purchase {purchase_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update purchase: {str(e)}")

@router.delete("/{purchase_id}")
def delete_purchase(purchase_id: int, db: Session = Depends(get_db)):
    """Delete a purchase order"""
    try:
        # Check if PO exists
        check_query = text("SELECT po_id FROM procurement.purchase_orders WHERE po_id = :po_id")
        result = db.execute(check_query, {"po_id": purchase_id})
        if not result.first():
            raise HTTPException(status_code=404, detail="Purchase order not found")
        
        # Delete PO items first (foreign key constraint)
        delete_items = text("DELETE FROM procurement.purchase_order_items WHERE po_id = :po_id")
        db.execute(delete_items, {"po_id": purchase_id})
        
        # Delete PO
        delete_po = text("DELETE FROM procurement.purchase_orders WHERE po_id = :po_id")
        db.execute(delete_po, {"po_id": purchase_id})
        
        db.commit()
        return {"message": "Purchase order deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting purchase {purchase_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete purchase: {str(e)}")

@router.get("/{purchase_id}/items")
def get_purchase_items(purchase_id: int, db: Session = Depends(get_db)):
    """Get items for a specific purchase order"""
    try:
        query = text("""
            SELECT poi.*, p.product_name as product_display_name, p.manufacturer
            FROM procurement.purchase_order_items poi
            LEFT JOIN master.products p ON poi.product_id = p.product_id
            WHERE poi.po_id = :po_id
            ORDER BY poi.po_item_id
        """)
        
        result = db.execute(query, {"po_id": purchase_id})
        items = [dict(row._mapping) for row in result]
        
        return items
    except Exception as e:
        logger.error(f"Error fetching purchase items: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get purchase items: {str(e)}")

@router.post("/{purchase_id}/items")
def add_purchase_item(purchase_id: int, item_data: dict, db: Session = Depends(get_db)):
    """Add an item to a purchase order"""
    try:
        item_data['po_id'] = purchase_id
        
        query = text("""
            INSERT INTO procurement.purchase_order_items (
                po_id, product_id, product_name, product_code,
                ordered_quantity, unit_price, discount_percentage,
                discount_amount, line_total, tax_percentage, tax_amount,
                total_amount
            ) VALUES (
                :po_id, :product_id, :product_name, :product_code,
                :ordered_quantity, :unit_price, :discount_percentage,
                :discount_amount, :line_total, :tax_percentage, :tax_amount,
                :total_amount
            ) RETURNING *
        """)
        
        result = db.execute(query, item_data)
        db.commit()
        
        return dict(result.first()._mapping)
    except Exception as e:
        db.rollback()
        logger.error(f"Error adding purchase item: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to add purchase item: {str(e)}")

@router.delete("/{purchase_id}/items/{item_id}")
def delete_purchase_item(purchase_id: int, item_id: int, db: Session = Depends(get_db)):
    """Delete an item from a purchase order"""
    try:
        query = text("""
            DELETE FROM procurement.purchase_order_items 
            WHERE po_id = :po_id AND po_item_id = :item_id
            RETURNING po_item_id
        """)
        
        result = db.execute(query, {"po_id": purchase_id, "item_id": item_id})
        deleted = result.first()
        
        if not deleted:
            raise HTTPException(status_code=404, detail="Purchase item not found")
        
        db.commit()
        return {"message": "Purchase item deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting purchase item: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete purchase item: {str(e)}")

@router.get("/analytics/summary")
def get_purchase_analytics(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    supplier_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """Get purchase analytics and summary"""
    try:
        query = """
            SELECT 
                COUNT(*) as total_purchases,
                SUM(total_amount) as total_amount,
                AVG(total_amount) as avg_purchase_amount,
                COUNT(DISTINCT supplier_id) as unique_suppliers
                -- TODO: Fix after verifying purchase_order_items table structure
                -- COUNT(DISTINCT pi.product_id) as unique_products
            FROM procurement.purchase_orders p
            -- LEFT JOIN procurement.purchase_order_items pi ON p.po_id = pi.po_id 
            WHERE 1=1
        """
        params = {}
        
        if start_date:
            query += " AND po_date >= :start_date"
            params["start_date"] = start_date
            
        if end_date:
            query += " AND po_date <= :end_date"
            params["end_date"] = end_date
            
        if supplier_id:
            query += " AND p.supplier_id = :supplier_id"
            params["supplier_id"] = supplier_id
        
        result = db.execute(text(query), params)
        analytics = dict(result.first()._mapping)
        
        return analytics
        
    except Exception as e:
        logger.error(f"Error fetching purchase analytics: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get purchase analytics: {str(e)}")

@router.get("/analytics/by-supplier")
def get_purchases_by_supplier(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    limit: int = Query(10, description="Number of top suppliers"),
    db: Session = Depends(get_db)
):
    """Get purchase summary grouped by supplier"""
    try:
        query = """
            SELECT 
                s.supplier_name,
                s.supplier_id,
                COUNT(p.purchase_id) as purchase_count,
                SUM(p.total_amount) as total_amount,
                AVG(p.total_amount) as avg_amount
            FROM purchases p
            JOIN suppliers s ON p.supplier_id = s.supplier_id
            WHERE 1=1
        """
        params = {"limit": limit}
        
        if start_date:
            query += " AND p.purchase_date >= :start_date"
            params["start_date"] = start_date
            
        if end_date:
            query += " AND p.purchase_date <= :end_date"
            params["end_date"] = end_date
        
        query += """
            GROUP BY s.supplier_id, s.supplier_name
            ORDER BY total_amount DESC
            LIMIT :limit
        """
        
        result = db.execute(text(query), params)
        supplier_analytics = [dict(row._mapping) for row in result]
        
        return supplier_analytics
        
    except Exception as e:
        logger.error(f"Error fetching supplier purchase analytics: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get supplier analytics: {str(e)}")