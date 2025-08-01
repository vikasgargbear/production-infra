"""
Stock Adjustments API Router (Simplified)
Uses existing inventory_movements table for adjustments
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from datetime import date, datetime
from decimal import Decimal

from ...database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/stock-adjustments", tags=["stock-adjustments"])

@router.get("/")
def get_stock_adjustments(
    skip: int = 0,
    limit: int = 100,
    product_id: Optional[int] = Query(None, description="Filter by product"),
    batch_id: Optional[int] = Query(None, description="Filter by batch"),
    adjustment_type: Optional[str] = Query(None, description="Filter by type: damage, expiry, count, other"),
    start_date: Optional[date] = Query(None, description="Filter from date"),
    end_date: Optional[date] = Query(None, description="Filter to date"),
    db: Session = Depends(get_db)
):
    """Get stock adjustments from inventory movements"""
    try:
        # Map adjustment types to movement types
        type_mapping = {
            "damage": "stock_damage",
            "expiry": "stock_expiry", 
            "count": "stock_count",
            "other": "stock_adjustment"
        }
        
        query = """
            SELECT 
                im.movement_id as adjustment_id,
                im.movement_date as adjustment_date,
                im.movement_type as adjustment_type,
                im.product_id,
                p.product_name,
                p.brand_name,
                im.batch_id,
                b.batch_number,
                b.expiry_date,
                CASE 
                    WHEN im.quantity_in > 0 THEN im.quantity_in
                    ELSE -im.quantity_out
                END as quantity_adjusted,
                im.notes as reason,
                im.reference_number,
                u.full_name as adjusted_by_name
            FROM inventory_movements im
            JOIN products p ON im.product_id = p.product_id
            LEFT JOIN batches b ON im.batch_id = b.batch_id
            LEFT JOIN org_users u ON im.performed_by = u.user_id
            WHERE im.movement_type IN ('stock_damage', 'stock_expiry', 'stock_count', 'stock_adjustment')
        """
        params = {}
        
        if product_id:
            query += " AND im.product_id = :product_id"
            params["product_id"] = product_id
            
        if batch_id:
            query += " AND im.batch_id = :batch_id"
            params["batch_id"] = batch_id
            
        if adjustment_type:
            movement_type = type_mapping.get(adjustment_type, 'stock_adjustment')
            query += " AND im.movement_type = :movement_type"
            params["movement_type"] = movement_type
            
        if start_date:
            query += " AND im.movement_date >= :start_date"
            params["start_date"] = start_date
            
        if end_date:
            query += " AND im.movement_date <= :end_date"
            params["end_date"] = end_date
            
        query += " ORDER BY im.movement_date DESC LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        adjustments = [dict(row._mapping) for row in result]
        
        return adjustments
        
    except Exception as e:
        logger.error(f"Error fetching stock adjustments: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get stock adjustments: {str(e)}")

@router.post("/")
def create_stock_adjustment(adjustment_data: dict, db: Session = Depends(get_db)):
    """
    Create a stock adjustment using inventory movements
    """
    try:
        # Validate batch exists
        batch = db.execute(
            text("""
                SELECT b.*, p.product_name 
                FROM batches b
                JOIN products p ON b.product_id = p.product_id
                WHERE b.batch_id = :batch_id
            """),
            {"batch_id": adjustment_data.get("batch_id")}
        ).first()
        
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
            
        quantity_adjusted = adjustment_data.get("quantity_adjusted", 0)
        
        # Check available quantity for negative adjustments
        if quantity_adjusted < 0 and abs(quantity_adjusted) > batch.quantity_available:
            raise HTTPException(
                status_code=400, 
                detail=f"Insufficient stock. Available: {batch.quantity_available}"
            )
        
        # Map adjustment type to movement type
        type_mapping = {
            "damage": "stock_damage",
            "expiry": "stock_expiry",
            "count": "stock_count",
            "other": "stock_adjustment"
        }
        movement_type = type_mapping.get(adjustment_data.get("adjustment_type"), "stock_adjustment")
        
        # Create inventory movement
        movement_id = db.execute(
            text("""
                INSERT INTO inventory_movements (
                    org_id, movement_date, movement_type,
                    product_id, batch_id, 
                    quantity_in, quantity_out,
                    reference_type, reference_number,
                    notes, performed_by
                ) VALUES (
                    '12de5e22-eee7-4d25-b3a7-d16d01c6170f', -- Default org
                    :movement_date, :movement_type,
                    :product_id, :batch_id,
                    :quantity_in, :quantity_out,
                    'adjustment', :reference_number,
                    :notes, :performed_by
                ) RETURNING movement_id
            """),
            {
                "movement_date": adjustment_data.get("adjustment_date", datetime.utcnow()),
                "movement_type": movement_type,
                "product_id": batch.product_id,
                "batch_id": adjustment_data.get("batch_id"),
                "quantity_in": quantity_adjusted if quantity_adjusted > 0 else 0,
                "quantity_out": abs(quantity_adjusted) if quantity_adjusted < 0 else 0,
                "reference_number": adjustment_data.get("reference_number", f"ADJ-{datetime.now().strftime('%Y%m%d%H%M')}"),
                "notes": adjustment_data.get("reason"),
                "performed_by": adjustment_data.get("adjusted_by")
            }
        ).scalar()
        
        # Update batch quantity
        new_quantity = batch.quantity_available + quantity_adjusted
        db.execute(
            text("""
                UPDATE batches 
                SET quantity_available = :new_quantity
                WHERE batch_id = :batch_id
            """),
            {
                "new_quantity": new_quantity,
                "batch_id": adjustment_data.get("batch_id")
            }
        )
        
        db.commit()
        
        return {
            "movement_id": movement_id,
            "message": "Stock adjustment created successfully",
            "old_quantity": batch.quantity_available,
            "new_quantity": new_quantity,
            "adjustment_type": movement_type
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating stock adjustment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create stock adjustment: {str(e)}")

@router.post("/physical-count")
def process_physical_count(count_data: dict, db: Session = Depends(get_db)):
    """
    Process physical inventory count
    Creates stock adjustments for differences
    """
    try:
        adjustments_created = []
        
        for item in count_data.get("count_items", []):
            batch_id = item.get("batch_id")
            counted_quantity = item.get("counted_quantity")
            
            # Get current quantity
            batch = db.execute(
                text("SELECT * FROM batches WHERE batch_id = :batch_id"),
                {"batch_id": batch_id}
            ).first()
            
            if not batch:
                continue
                
            system_quantity = batch.quantity_available
            difference = counted_quantity - system_quantity
            
            # Only adjust if there's a difference
            if difference != 0:
                movement_id = db.execute(
                    text("""
                        INSERT INTO inventory_movements (
                            org_id, movement_date, movement_type,
                            product_id, batch_id,
                            quantity_in, quantity_out,
                            reference_type, reference_number,
                            notes, performed_by
                        ) VALUES (
                            '12de5e22-eee7-4d25-b3a7-d16d01c6170f',
                            :movement_date, 'stock_count',
                            :product_id, :batch_id,
                            :quantity_in, :quantity_out,
                            'physical_count', :reference_number,
                            :notes, :performed_by
                        ) RETURNING movement_id
                    """),
                    {
                        "movement_date": count_data.get("count_date", datetime.utcnow()),
                        "product_id": batch.product_id,
                        "batch_id": batch_id,
                        "quantity_in": difference if difference > 0 else 0,
                        "quantity_out": abs(difference) if difference < 0 else 0,
                        "reference_number": count_data.get("count_reference", f"COUNT-{datetime.now().strftime('%Y%m%d')}"),
                        "notes": f"Physical count adjustment: System {system_quantity}, Counted {counted_quantity}",
                        "performed_by": count_data.get("counted_by")
                    }
                ).scalar()
                
                # Update batch quantity
                db.execute(
                    text("""
                        UPDATE batches 
                        SET quantity_available = :new_quantity
                        WHERE batch_id = :batch_id
                    """),
                    {
                        "new_quantity": counted_quantity,
                        "batch_id": batch_id
                    }
                )
                
                adjustments_created.append({
                    "movement_id": movement_id,
                    "batch_id": batch_id,
                    "system_quantity": system_quantity,
                    "counted_quantity": counted_quantity,
                    "difference": difference
                })
        
        db.commit()
        
        return {
            "message": "Physical count processed successfully",
            "adjustments_created": len(adjustments_created),
            "details": adjustments_created
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error processing physical count: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process physical count: {str(e)}")

@router.post("/expire-batches")
def expire_batches(db: Session = Depends(get_db)):
    """
    Mark expired batches and create stock adjustments
    """
    try:
        # Find expired batches
        expired_batches = db.execute(
            text("""
                SELECT b.*, p.product_name
                FROM batches b
                JOIN products p ON b.product_id = p.product_id
                WHERE b.expiry_date <= CURRENT_DATE
                AND b.quantity_available > 0
                AND b.batch_status != 'expired'
            """)
        ).fetchall()
        
        adjustments_created = []
        
        for batch in expired_batches:
            # Create expiry movement
            movement_id = db.execute(
                text("""
                    INSERT INTO inventory_movements (
                        org_id, movement_date, movement_type,
                        product_id, batch_id,
                        quantity_in, quantity_out,
                        reference_type, reference_number,
                        notes
                    ) VALUES (
                        '12de5e22-eee7-4d25-b3a7-d16d01c6170f',
                        CURRENT_DATE, 'stock_expiry',
                        :product_id, :batch_id,
                        0, :quantity_out,
                        'expiry', :reference_number,
                        :notes
                    ) RETURNING movement_id
                """),
                {
                    "product_id": batch.product_id,
                    "batch_id": batch.batch_id,
                    "quantity_out": batch.quantity_available,
                    "reference_number": f"EXP-{batch.batch_number}",
                    "notes": f"Batch expired on {batch.expiry_date}"
                }
            ).scalar()
            
            # Update batch
            db.execute(
                text("""
                    UPDATE batches 
                    SET quantity_available = 0,
                        batch_status = 'expired'
                    WHERE batch_id = :batch_id
                """),
                {"batch_id": batch.batch_id}
            )
            
            adjustments_created.append({
                "movement_id": movement_id,
                "batch_id": batch.batch_id,
                "batch_number": batch.batch_number,
                "product_name": batch.product_name,
                "quantity_expired": batch.quantity_available,
                "expiry_date": str(batch.expiry_date)
            })
        
        db.commit()
        
        return {
            "message": "Expired batches processed",
            "batches_expired": len(adjustments_created),
            "details": adjustments_created
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error processing expired batches: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process expired batches: {str(e)}")

@router.get("/analytics/summary")
def get_adjustment_analytics(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db)
):
    """Get stock adjustment analytics"""
    try:
        query = """
            SELECT 
                COUNT(*) as total_adjustments,
                SUM(quantity_in) as total_quantity_added,
                SUM(quantity_out) as total_quantity_removed,
                COUNT(DISTINCT product_id) as products_affected,
                COUNT(DISTINCT batch_id) as batches_affected,
                COUNT(CASE WHEN movement_type = 'stock_damage' THEN 1 END) as damage_adjustments,
                COUNT(CASE WHEN movement_type = 'stock_expiry' THEN 1 END) as expiry_adjustments,
                COUNT(CASE WHEN movement_type = 'stock_count' THEN 1 END) as count_adjustments
            FROM inventory_movements
            WHERE movement_type IN ('stock_damage', 'stock_expiry', 'stock_count', 'stock_adjustment')
        """
        params = {}
        
        if start_date:
            query += " AND movement_date >= :start_date"
            params["start_date"] = start_date
            
        if end_date:
            query += " AND movement_date <= :end_date"
            params["end_date"] = end_date
        
        result = db.execute(text(query), params)
        analytics = dict(result.first()._mapping)
        
        return analytics
        
    except Exception as e:
        logger.error(f"Error fetching adjustment analytics: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get adjustment analytics: {str(e)}")