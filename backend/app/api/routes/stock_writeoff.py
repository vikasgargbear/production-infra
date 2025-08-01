"""
Stock Write-off API Router
Handles write-off of expired, damaged, or lost inventory with ITC reversal
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from datetime import datetime, date
from decimal import Decimal
import uuid

from ...database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/stock-writeoff", tags=["stock-writeoff"])

# GST action mapping for write-off reasons
WRITE_OFF_GST_ACTIONS = {
    "EXPIRED": "ITC_REVERSAL",
    "DAMAGED": "ITC_REVERSAL", 
    "THEFT": "ITC_REVERSAL",
    "SAMPLE": "NO_REVERSAL",  # Free samples don't require ITC reversal
    "PERSONAL_USE": "ITC_REVERSAL",
    "DESTROYED": "ITC_REVERSAL",
    "OTHER": "ITC_REVERSAL"
}

@router.get("/expiry-report")
async def get_expiry_report(
    days_ahead: int = Query(90, description="Days ahead to check for expiry"),
    include_expired: bool = Query(True, description="Include already expired items"),
    db: Session = Depends(get_db)
):
    """
    Get report of expiring and expired stock
    """
    try:
        # Calculate date range
        today = date.today()
        future_date = today + timedelta(days=days_ahead)
        
        query = """
            SELECT 
                b.batch_id,
                b.batch_number,
                b.expiry_date,
                b.product_id,
                p.product_name,
                p.hsn_code,
                p.gst_percent,
                COALESCE(i.current_stock, 0) as current_stock,
                COALESCE(b.cost_price, p.purchase_price, 0) as cost_price,
                p.mrp,
                CASE 
                    WHEN b.expiry_date < :today THEN true
                    ELSE false
                END as is_expired,
                DATE_PART('day', b.expiry_date - :today) as days_to_expiry
            FROM batches b
            JOIN products p ON b.product_id = p.product_id
            LEFT JOIN inventory i ON (
                i.product_id = b.product_id 
                AND i.batch_number = b.batch_number
                AND i.current_stock > 0
            )
            WHERE b.expiry_date <= :future_date
        """
        
        params = {
            "today": today,
            "future_date": future_date
        }
        
        # Add filter for expired status
        if not include_expired:
            query += " AND b.expiry_date >= :today"
            
        query += " ORDER BY b.expiry_date ASC"
        
        result = db.execute(text(query), params).fetchall()
        
        items = []
        for row in result:
            item = dict(row._mapping)
            # Only include if there's stock to write off
            if item['current_stock'] > 0:
                items.append(item)
                
        return {
            "success": True,
            "items": items,
            "total": len(items)
        }
        
    except Exception as e:
        logger.error(f"Error getting expiry report: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/")
async def create_stock_writeoff(
    writeoff_data: dict,
    db: Session = Depends(get_db)
):
    """
    Create a stock write-off entry with ITC reversal tracking
    """
    try:
        # Validate required fields
        required_fields = ["write_off_date", "reason", "items"]
        for field in required_fields:
            if field not in writeoff_data:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Missing required field: {field}"
                )
                
        if not writeoff_data["items"]:
            raise HTTPException(
                status_code=400,
                detail="At least one item must be written off"
            )
            
        # Generate write-off number
        writeoff_number = writeoff_data.get("write_off_no", f"WO-{datetime.now().strftime('%Y%m%d-%H%M%S')}")
        writeoff_id = str(uuid.uuid4())
        
        # Check if ITC reversal is required
        reason = writeoff_data["reason"]
        requires_itc_reversal = WRITE_OFF_GST_ACTIONS.get(reason, "ITC_REVERSAL") == "ITC_REVERSAL"
        
        # Calculate totals
        total_cost_value = Decimal("0")
        total_itc_reversal = Decimal("0")
        
        for item in writeoff_data["items"]:
            item_cost = Decimal(str(item["quantity"])) * Decimal(str(item["cost_price"]))
            total_cost_value += item_cost
            
            if requires_itc_reversal:
                # Calculate ITC to be reversed
                itc_amount = item_cost * Decimal(str(item.get("gst_percent", 18))) / 100
                total_itc_reversal += itc_amount
        
        # Create write-off record
        db.execute(
            text("""
                INSERT INTO stock_writeoffs (
                    writeoff_id, org_id, writeoff_number, writeoff_date,
                    reason, reason_notes, total_cost_value, total_itc_reversal,
                    requires_itc_reversal, status, created_by
                ) VALUES (
                    :writeoff_id, :org_id, :writeoff_number, :writeoff_date,
                    :reason, :reason_notes, :total_cost, :itc_reversal,
                    :requires_itc, 'approved', :created_by
                )
            """),
            {
                "writeoff_id": writeoff_id,
                "org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f",  # Default org
                "writeoff_number": writeoff_number,
                "writeoff_date": writeoff_data["write_off_date"],
                "reason": reason,
                "reason_notes": writeoff_data.get("reason_notes", ""),
                "total_cost": total_cost_value,
                "itc_reversal": total_itc_reversal,
                "requires_itc": requires_itc_reversal,
                "created_by": writeoff_data.get("created_by", "system")
            }
        )
        
        # Process each item
        for item in writeoff_data["items"]:
            item_id = str(uuid.uuid4())
            
            # Insert write-off item
            db.execute(
                text("""
                    INSERT INTO stock_writeoff_items (
                        item_id, writeoff_id, product_id, batch_id,
                        quantity, cost_price, gst_percent
                    ) VALUES (
                        :item_id, :writeoff_id, :product_id, :batch_id,
                        :quantity, :cost_price, :gst_percent
                    )
                """),
                {
                    "item_id": item_id,
                    "writeoff_id": writeoff_id,
                    "product_id": item["product_id"],
                    "batch_id": item["batch_id"],
                    "quantity": item["quantity"],
                    "cost_price": item["cost_price"],
                    "gst_percent": item.get("gst_percent", 18)
                }
            )
            
            # Update inventory - reduce stock
            db.execute(
                text("""
                    UPDATE inventory 
                    SET current_stock = current_stock - :quantity,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE product_id = :product_id 
                    AND batch_number = (
                        SELECT batch_number FROM batches 
                        WHERE batch_id = :batch_id
                    )
                    AND current_stock >= :quantity
                """),
                {
                    "product_id": item["product_id"],
                    "batch_id": item["batch_id"],
                    "quantity": item["quantity"]
                }
            )
            
            # Create stock movement record
            db.execute(
                text("""
                    INSERT INTO stock_movements (
                        movement_id, org_id, movement_date, movement_type,
                        product_id, batch_id, quantity, reference_type,
                        reference_id, reason
                    ) VALUES (
                        :movement_id, :org_id, :date, 'write_off',
                        :product_id, :batch_id, :quantity, 'stock_writeoff',
                        :writeoff_id, :reason
                    )
                """),
                {
                    "movement_id": str(uuid.uuid4()),
                    "org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f",
                    "date": writeoff_data["write_off_date"],
                    "product_id": item["product_id"],
                    "batch_id": item["batch_id"],
                    "quantity": -abs(item["quantity"]),  # Negative for reduction
                    "writeoff_id": writeoff_id,
                    "reason": reason
                }
            )
        
        # If ITC reversal is required, create GST adjustment entry
        if requires_itc_reversal and total_itc_reversal > 0:
            db.execute(
                text("""
                    INSERT INTO gst_adjustments (
                        adjustment_id, org_id, adjustment_date, adjustment_type,
                        reference_type, reference_id, amount, description
                    ) VALUES (
                        :adj_id, :org_id, :date, 'itc_reversal',
                        'stock_writeoff', :writeoff_id, :amount, :description
                    )
                """),
                {
                    "adj_id": str(uuid.uuid4()),
                    "org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f",
                    "date": writeoff_data["write_off_date"],
                    "writeoff_id": writeoff_id,
                    "amount": total_itc_reversal,
                    "description": f"ITC reversal for stock write-off {writeoff_number} - {reason}"
                }
            )
        
        db.commit()
        
        return {
            "success": True,
            "writeoff_id": writeoff_id,
            "writeoff_number": writeoff_number,
            "total_cost_value": float(total_cost_value),
            "total_itc_reversal": float(total_itc_reversal),
            "requires_itc_reversal": requires_itc_reversal,
            "message": f"Stock write-off {writeoff_number} created successfully" + 
                      (f" with ITC reversal of ₹{total_itc_reversal:.2f}" if requires_itc_reversal else "")
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating stock write-off: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/")
async def get_writeoffs(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    reason: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get list of stock write-offs with filters
    """
    try:
        query = """
            SELECT 
                w.*,
                COUNT(wi.item_id) as item_count,
                STRING_AGG(DISTINCT p.product_name, ', ' ORDER BY p.product_name) as products
            FROM stock_writeoffs w
            LEFT JOIN stock_writeoff_items wi ON w.writeoff_id = wi.writeoff_id
            LEFT JOIN products p ON wi.product_id = p.product_id
            WHERE 1=1
        """
        params = {"skip": skip, "limit": limit}
        
        if from_date:
            query += " AND w.writeoff_date >= :from_date"
            params["from_date"] = from_date
            
        if to_date:
            query += " AND w.writeoff_date <= :to_date"
            params["to_date"] = to_date
            
        if reason:
            query += " AND w.reason = :reason"
            params["reason"] = reason
            
        query += """
            GROUP BY w.writeoff_id
            ORDER BY w.writeoff_date DESC, w.created_at DESC 
            LIMIT :limit OFFSET :skip
        """
        
        writeoffs = db.execute(text(query), params).fetchall()
        
        # Get total count
        count_query = """
            SELECT COUNT(DISTINCT writeoff_id) FROM stock_writeoffs w WHERE 1=1
        """
        if from_date:
            count_query += " AND w.writeoff_date >= :from_date"
        if to_date:
            count_query += " AND w.writeoff_date <= :to_date"
        if reason:
            count_query += " AND w.reason = :reason"
            
        total = db.execute(text(count_query), params).scalar()
        
        return {
            "total": total,
            "writeoffs": [dict(w._mapping) for w in writeoffs]
        }
        
    except Exception as e:
        logger.error(f"Error fetching write-offs: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/itc-reversal-summary")
async def get_itc_reversal_summary(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db)
):
    """
    Get summary of ITC reversals for GST filing
    """
    try:
        query = """
            SELECT 
                DATE_TRUNC('month', writeoff_date) as month,
                reason,
                COUNT(*) as writeoff_count,
                SUM(total_cost_value) as total_cost,
                SUM(total_itc_reversal) as total_itc_reversed
            FROM stock_writeoffs
            WHERE requires_itc_reversal = true
        """
        params = {}
        
        if from_date:
            query += " AND writeoff_date >= :from_date"
            params["from_date"] = from_date
            
        if to_date:
            query += " AND writeoff_date <= :to_date"
            params["to_date"] = to_date
            
        query += """
            GROUP BY DATE_TRUNC('month', writeoff_date), reason
            ORDER BY month DESC, reason
        """
        
        result = db.execute(text(query), params).fetchall()
        
        summary = []
        for row in result:
            summary.append({
                "month": row.month.strftime("%Y-%m"),
                "reason": row.reason,
                "writeoff_count": row.writeoff_count,
                "total_cost": float(row.total_cost),
                "total_itc_reversed": float(row.total_itc_reversed)
            })
            
        # Get grand total
        total_query = """
            SELECT 
                SUM(total_itc_reversal) as grand_total
            FROM stock_writeoffs
            WHERE requires_itc_reversal = true
        """
        if from_date:
            total_query += " AND writeoff_date >= :from_date"
        if to_date:
            total_query += " AND writeoff_date <= :to_date"
            
        grand_total = db.execute(text(total_query), params).scalar() or 0
        
        return {
            "summary": summary,
            "grand_total_itc_reversal": float(grand_total),
            "message": "Use this data for Table 4(B) in GSTR-3B"
        }
        
    except Exception as e:
        logger.error(f"Error getting ITC reversal summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Import timedelta for date calculations
from datetime import timedelta