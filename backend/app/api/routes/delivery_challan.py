"""
Delivery Challan API Router
Manages delivery challans and shipment tracking
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from datetime import date, datetime

from ...database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/delivery-challan", tags=["delivery-challan"])

@router.get("/")
def get_delivery_challans(
    skip: int = 0,
    limit: int = 100,
    customer_id: Optional[int] = Query(None, description="Filter by customer"),
    status: Optional[str] = Query(None, description="Filter by status"),
    start_date: Optional[date] = Query(None, description="Filter from date"),
    end_date: Optional[date] = Query(None, description="Filter to date"),
    db: Session = Depends(get_db)
):
    """Get delivery challans with optional filtering"""
    try:
        # Since we don't have a dedicated challan table, we'll use orders with delivery info
        query = """
            SELECT 
                o.order_id as challan_id,
                o.customer_id,
                c.customer_name,
                o.order_date as challan_date,
                o.total_amount,
                o.delivery_status,
                o.delivery_address,
                o.delivery_date,
                'challan' as document_type
            FROM orders o
            LEFT JOIN customers c ON o.customer_id = c.customer_id
            WHERE o.order_status IN ('confirmed', 'delivered', 'shipped')
        """
        params = {}
        
        if customer_id:
            query += " AND o.customer_id = :customer_id"
            params["customer_id"] = customer_id
            
        if status:
            query += " AND o.delivery_status = :status"
            params["status"] = status
            
        if start_date:
            query += " AND o.order_date >= :start_date"
            params["start_date"] = start_date
            
        if end_date:
            query += " AND o.order_date <= :end_date"
            params["end_date"] = end_date
            
        query += " ORDER BY o.order_date DESC LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        challans = [dict(row._mapping) for row in result]
        
        return challans
        
    except Exception as e:
        logger.error(f"Error fetching delivery challans: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get delivery challans: {str(e)}")

@router.get("/{challan_id}")
def get_delivery_challan(challan_id: int, db: Session = Depends(get_db)):
    """Get a single delivery challan by ID"""
    try:
        result = db.execute(
            text("""
                SELECT 
                    o.order_id as challan_id,
                    o.customer_id,
                    c.customer_name,
                    c.customer_address,
                    c.customer_phone,
                    o.order_date as challan_date,
                    o.total_amount,
                    o.delivery_status,
                    o.delivery_address,
                    o.delivery_date,
                    o.notes,
                    'challan' as document_type
                FROM orders o
                LEFT JOIN customers c ON o.customer_id = c.customer_id
                WHERE o.order_id = :challan_id
                AND o.order_status IN ('confirmed', 'delivered', 'shipped')
            """),
            {"challan_id": challan_id}
        )
        challan = result.first()
        if not challan:
            raise HTTPException(status_code=404, detail="Delivery challan not found")
        
        # Get challan items (order items)
        items_result = db.execute(
            text("""
                SELECT 
                    oi.order_item_id,
                    oi.product_id,
                    p.product_name,
                    oi.quantity,
                    oi.price,
                    (oi.quantity * oi.price) as total_amount
                FROM order_items oi
                JOIN products p ON oi.product_id = p.product_id
                WHERE oi.order_id = :challan_id
            """),
            {"challan_id": challan_id}
        )
        items = [dict(row._mapping) for row in items_result]
        
        challan_data = dict(challan._mapping)
        challan_data["items"] = items
        
        return challan_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching delivery challan {challan_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get delivery challan: {str(e)}")

@router.post("/")
def create_delivery_challan(challan_data: dict, db: Session = Depends(get_db)):
    """Create a new delivery challan (actually creates an order)"""
    try:
        # For now, this creates an order with delivery status
        order_data = {
            "customer_id": challan_data.get("customer_id"),
            "order_date": challan_data.get("challan_date", datetime.utcnow()),
            "total_amount": challan_data.get("total_amount", 0),
            "order_status": "confirmed",
            "delivery_status": "pending",
            "delivery_address": challan_data.get("delivery_address"),
            "notes": challan_data.get("notes")
        }
        
        result = db.execute(
            text("""
                INSERT INTO orders (customer_id, order_date, total_amount, order_status, delivery_status, delivery_address, notes)
                VALUES (:customer_id, :order_date, :total_amount, :order_status, :delivery_status, :delivery_address, :notes)
                RETURNING order_id
            """),
            order_data
        )
        order_id = result.scalar()
        db.commit()
        
        return {"challan_id": order_id, "message": "Delivery challan created successfully"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating delivery challan: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create delivery challan: {str(e)}")

@router.put("/{challan_id}")
def update_delivery_challan(challan_id: int, challan_data: dict, db: Session = Depends(get_db)):
    """Update a delivery challan"""
    try:
        # Check if order exists
        check_result = db.execute(
            text("SELECT order_id FROM orders WHERE order_id = :order_id"),
            {"order_id": challan_id}
        )
        if not check_result.first():
            raise HTTPException(status_code=404, detail="Delivery challan not found")
        
        # Update order with challan data
        update_fields = []
        params = {"order_id": challan_id}
        
        if "delivery_status" in challan_data:
            update_fields.append("delivery_status = :delivery_status")
            params["delivery_status"] = challan_data["delivery_status"]
            
        if "delivery_address" in challan_data:
            update_fields.append("delivery_address = :delivery_address")
            params["delivery_address"] = challan_data["delivery_address"]
            
        if "delivery_date" in challan_data:
            update_fields.append("delivery_date = :delivery_date")
            params["delivery_date"] = challan_data["delivery_date"]
            
        if "notes" in challan_data:
            update_fields.append("notes = :notes")
            params["notes"] = challan_data["notes"]
        
        if update_fields:
            query = f"UPDATE orders SET {', '.join(update_fields)} WHERE order_id = :order_id"
            db.execute(text(query), params)
            db.commit()
        
        return {"message": "Delivery challan updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating delivery challan {challan_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update delivery challan: {str(e)}")

@router.delete("/{challan_id}")
def delete_delivery_challan(challan_id: int, db: Session = Depends(get_db)):
    """Delete a delivery challan"""
    try:
        result = db.execute(
            text("DELETE FROM orders WHERE order_id = :order_id RETURNING order_id"),
            {"order_id": challan_id}
        )
        deleted_id = result.scalar()
        if not deleted_id:
            raise HTTPException(status_code=404, detail="Delivery challan not found")
        
        db.commit()
        return {"message": "Delivery challan deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting delivery challan {challan_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete delivery challan: {str(e)}")

@router.put("/{challan_id}/mark-delivered")
def mark_challan_delivered(challan_id: int, db: Session = Depends(get_db)):
    """Mark a delivery challan as delivered"""
    try:
        result = db.execute(
            text("""
                UPDATE orders 
                SET delivery_status = 'delivered', delivery_date = :delivery_date 
                WHERE order_id = :order_id 
                RETURNING order_id
            """),
            {"order_id": challan_id, "delivery_date": datetime.utcnow()}
        )
        updated_id = result.scalar()
        if not updated_id:
            raise HTTPException(status_code=404, detail="Delivery challan not found")
        
        db.commit()
        return {"message": "Delivery challan marked as delivered"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error marking challan {challan_id} as delivered: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to mark challan as delivered: {str(e)}")

@router.get("/analytics/summary")
def get_delivery_analytics(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db)
):
    """Get delivery analytics and summary"""
    try:
        query = """
            SELECT 
                COUNT(*) as total_challans,
                COUNT(CASE WHEN delivery_status = 'delivered' THEN 1 END) as delivered_count,
                COUNT(CASE WHEN delivery_status = 'pending' THEN 1 END) as pending_count,
                COUNT(CASE WHEN delivery_status = 'shipped' THEN 1 END) as shipped_count,
                AVG(total_amount) as avg_challan_amount
            FROM orders 
            WHERE order_status IN ('confirmed', 'delivered', 'shipped')
        """
        params = {}
        
        if start_date:
            query += " AND order_date >= :start_date"
            params["start_date"] = start_date
            
        if end_date:
            query += " AND order_date <= :end_date"
            params["end_date"] = end_date
        
        result = db.execute(text(query), params)
        analytics = dict(result.first()._mapping)
        
        return analytics
        
    except Exception as e:
        logger.error(f"Error fetching delivery analytics: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get delivery analytics: {str(e)}")