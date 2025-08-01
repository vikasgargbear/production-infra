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

from ...database import get_db
from ...models import Purchase
from ...core.crud_base import create_crud

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/purchases", tags=["purchases"])

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
            SELECT p.*, s.supplier_name,
                   COUNT(pi.purchase_item_id) as item_count,
                   STRING_AGG(DISTINCT pr.product_name, ', ') as products
            FROM purchases p
            LEFT JOIN suppliers s ON p.supplier_id = s.supplier_id
            LEFT JOIN purchase_items pi ON p.purchase_id = pi.purchase_id
            LEFT JOIN products pr ON pi.product_id = pr.product_id
            WHERE 1=1
        """
        params = {}
        
        if supplier_id:
            query += " AND p.supplier_id = :supplier_id"
            params["supplier_id"] = supplier_id
            
        if product_id:
            query += " AND pi.product_id = :product_id"
            params["product_id"] = product_id
            
        if start_date:
            query += " AND p.purchase_date >= :start_date"
            params["start_date"] = start_date
            
        if end_date:
            query += " AND p.purchase_date <= :end_date"
            params["end_date"] = end_date
            
        query += " GROUP BY p.purchase_id, s.supplier_name"
        query += " ORDER BY p.purchase_date DESC LIMIT :limit OFFSET :skip"
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
                SELECT p.*, s.supplier_name, pr.product_name 
                FROM purchases p
                LEFT JOIN suppliers s ON p.supplier_id = s.supplier_id
                LEFT JOIN products pr ON p.product_id = pr.product_id
                WHERE p.purchase_id = :purchase_id
            """),
            {"purchase_id": purchase_id}
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
    """Create a new purchase record"""
    try:
        purchase = Purchase(**purchase_data)
        db.add(purchase)
        db.commit()
        db.refresh(purchase)
        return purchase
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating purchase: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create purchase: {str(e)}")

@router.put("/{purchase_id}")
def update_purchase(purchase_id: int, purchase_data: dict, db: Session = Depends(get_db)):
    """Update a purchase record"""
    try:
        purchase = db.query(Purchase).filter(Purchase.purchase_id == purchase_id).first()
        if not purchase:
            raise HTTPException(status_code=404, detail="Purchase not found")
        
        for key, value in purchase_data.items():
            setattr(purchase, key, value)
        
        db.commit()
        db.refresh(purchase)
        return purchase
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating purchase {purchase_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update purchase: {str(e)}")

@router.delete("/{purchase_id}")
def delete_purchase(purchase_id: int, db: Session = Depends(get_db)):
    """Delete a purchase record"""
    try:
        purchase = db.query(Purchase).filter(Purchase.purchase_id == purchase_id).first()
        if not purchase:
            raise HTTPException(status_code=404, detail="Purchase not found")
        
        db.delete(purchase)
        db.commit()
        return {"message": "Purchase deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting purchase {purchase_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete purchase: {str(e)}")

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
                COUNT(DISTINCT supplier_id) as unique_suppliers,
                COUNT(DISTINCT product_id) as unique_products
            FROM purchases 
            WHERE 1=1
        """
        params = {}
        
        if start_date:
            query += " AND purchase_date >= :start_date"
            params["start_date"] = start_date
            
        if end_date:
            query += " AND purchase_date <= :end_date"
            params["end_date"] = end_date
            
        if supplier_id:
            query += " AND supplier_id = :supplier_id"
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