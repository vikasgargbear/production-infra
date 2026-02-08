"""
Stock Write-off Service
Handles all database operations for stock writeoffs and ITC reversal tracking
"""
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text
from decimal import Decimal
from datetime import date, timedelta
import logging

logger = logging.getLogger(__name__)


class WriteoffService:
    """Service class for Stock Write-off operations"""
    
    @staticmethod
    def get_expiry_report(
        db: Session, org_id: str, days_ahead: int = 90, include_expired: bool = True
    ) -> List[Dict[str, Any]]:
        """Get report of expiring and expired stock."""
        today = date.today()
        future_date = today + timedelta(days=days_ahead)
        
        query = """
            SELECT 
                b.batch_id, b.batch_number, b.expiry_date,
                b.product_id, p.product_name, p.hsn_code,
                COALESCE(p.gst_percent, 0) as gst_percent,
                b.quantity_available as current_stock,
                COALESCE(b.cost_per_unit, 0) as cost_price,
                b.mrp_per_unit as mrp,
                CASE WHEN b.expiry_date < :today THEN true ELSE false END as is_expired,
                b.expiry_date - :today as days_to_expiry
            FROM inventory.batches b
            JOIN inventory.products p ON b.product_id = p.product_id AND b.org_id = p.org_id
            WHERE b.org_id = :org_id
            AND b.quantity_available > 0
            AND b.expiry_date <= :future_date
        """
        
        params = {"org_id": org_id, "today": today, "future_date": future_date}
        
        if not include_expired:
            query += " AND b.expiry_date >= :today"
        
        query += " ORDER BY b.expiry_date ASC"
        
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def insert_writeoff(db: Session, org_id: str, data: Dict[str, Any]) -> None:
        """Insert a new writeoff record."""
        db.execute(text("""
            INSERT INTO inventory.stock_writeoffs (
                writeoff_id, org_id, writeoff_number, writeoff_date,
                reason, reason_notes, total_cost_value, total_itc_reversal,
                requires_itc_reversal, status, created_by, branch_id
            ) VALUES (
                :writeoff_id, :org_id, :writeoff_number, :writeoff_date,
                :reason, :reason_notes, :total_cost, :itc_reversal,
                :requires_itc, 'approved', :created_by, :branch_id
            )
        """), {"org_id": org_id, **data})
    
    @staticmethod
    def insert_writeoff_item(db: Session, data: Dict[str, Any]) -> None:
        """Insert a writeoff item."""
        db.execute(text("""
            INSERT INTO inventory.stock_writeoff_items (
                item_id, writeoff_id, product_id, batch_id,
                quantity, cost_price, gst_percent
            ) VALUES (
                :item_id, :writeoff_id, :product_id, :batch_id,
                :quantity, :cost_price, :gst_percent
            )
        """), data)
    
    @staticmethod
    def reduce_batch_quantity(db: Session, org_id: str, batch_id: int, quantity: Decimal) -> None:
        """Reduce batch quantity for writeoff. Raises if insufficient stock."""
        result = db.execute(text("""
            UPDATE inventory.batches
            SET quantity_available = quantity_available - :quantity,
                updated_at = CURRENT_TIMESTAMP
            WHERE batch_id = :batch_id
            AND org_id = :org_id
            AND quantity_available >= :quantity
        """), {"batch_id": batch_id, "org_id": org_id, "quantity": quantity})
        if result.rowcount == 0:
            raise ValueError(f"Insufficient stock in batch {batch_id} for writeoff of {quantity}")
    
    @staticmethod
    def update_location_wise_stock(db: Session, org_id: str, product_id: int, batch_id: int, location_id: int, quantity: Decimal) -> None:
        """Decrement location_wise_stock for writeoff."""
        db.execute(text("""
            UPDATE inventory.location_wise_stock
            SET quantity_available = quantity_available - :quantity,
                last_updated = CURRENT_TIMESTAMP
            WHERE batch_id = :batch_id
            AND location_id = :location_id
            AND org_id = :org_id
        """), {"batch_id": batch_id, "location_id": location_id, "org_id": org_id, "quantity": quantity})

    @staticmethod
    def insert_stock_movement(db: Session, data: Dict[str, Any]) -> None:
        """Insert stock movement record for writeoff into inventory.inventory_movements."""
        db.execute(text("""
            INSERT INTO inventory.inventory_movements (
                org_id, movement_date, movement_type, movement_direction,
                product_id, batch_id, quantity, reference_type,
                reference_number, reason, notes, created_by, created_at
            ) VALUES (
                :org_id, :date, 'writeoff', 'out',
                :product_id, :batch_id, :quantity, 'stock_writeoff',
                :writeoff_id, :reason, :notes, :created_by, CURRENT_TIMESTAMP
            )
        """), data)
    
    @staticmethod
    def insert_gst_adjustment(db: Session, data: Dict[str, Any]) -> None:
        """Insert GST ITC adjustment record."""
        db.execute(text("""
            INSERT INTO compliance.gst_adjustments (
                adjustment_id, org_id, adjustment_date, adjustment_type,
                reference_type, reference_id, amount, description
            ) VALUES (
                :adj_id, :org_id, :date, 'itc_reversal',
                'stock_writeoff', :writeoff_id, :amount, :description
            )
        """), data)
    
    @staticmethod
    def list_writeoffs(
        db: Session, org_id: str, from_date: Optional[date] = None,
        to_date: Optional[date] = None, reason: Optional[str] = None,
        limit: int = 20, offset: int = 0
    ) -> Tuple[List[Dict[str, Any]], int]:
        """List writeoffs with filters. Returns (writeoffs, total_count)."""
        query = """
            SELECT 
                w.writeoff_id, w.writeoff_number, w.writeoff_date,
                w.reason, w.reason_notes, w.total_cost_value, w.total_itc_reversal,
                w.requires_itc_reversal, w.status,
                COUNT(wi.item_id) as item_count
            FROM inventory.stock_writeoffs w
            LEFT JOIN inventory.stock_writeoff_items wi ON w.writeoff_id = wi.writeoff_id
            WHERE w.org_id = :org_id
        """
        params = {"org_id": org_id, "limit": limit, "offset": offset}
        
        count_query = "SELECT COUNT(*) FROM inventory.stock_writeoffs WHERE org_id = :org_id"
        
        if from_date:
            query += " AND w.writeoff_date >= :from_date"
            count_query += " AND writeoff_date >= :from_date"
            params["from_date"] = from_date
        
        if to_date:
            query += " AND w.writeoff_date <= :to_date"
            count_query += " AND writeoff_date <= :to_date"
            params["to_date"] = to_date
        
        if reason:
            query += " AND w.reason = :reason"
            count_query += " AND reason = :reason"
            params["reason"] = reason
        
        query += """
            GROUP BY w.writeoff_id
            ORDER BY w.writeoff_date DESC, w.created_at DESC
            LIMIT :limit OFFSET :offset
        """
        
        result = db.execute(text(query), params)
        writeoffs = [dict(row._mapping) for row in result]
        
        total = db.execute(text(count_query), params).scalar() or 0
        
        return writeoffs, total
    
    @staticmethod
    def get_writeoff(db: Session, org_id: str, writeoff_id: str) -> Optional[Dict[str, Any]]:
        """Get writeoff by ID."""
        result = db.execute(text("""
            SELECT * FROM inventory.stock_writeoffs
            WHERE writeoff_id = :id AND org_id = :org_id
        """), {"id": writeoff_id, "org_id": org_id})
        row = result.fetchone()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_writeoff_items(db: Session, writeoff_id: str) -> List[Dict[str, Any]]:
        """Get items for a writeoff."""
        result = db.execute(text("""
            SELECT 
                wi.*, p.product_name, b.batch_number
            FROM inventory.stock_writeoff_items wi
            LEFT JOIN inventory.products p ON wi.product_id = p.product_id
            LEFT JOIN inventory.batches b ON wi.batch_id = b.batch_id
            WHERE wi.writeoff_id = :id
        """), {"id": writeoff_id})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_itc_summary(
        db: Session, org_id: str, from_date: Optional[date] = None, to_date: Optional[date] = None
    ) -> Tuple[List[Dict[str, Any]], float]:
        """Get ITC reversal summary for GST filing."""
        query = """
            SELECT 
                DATE_TRUNC('month', writeoff_date) as month,
                reason,
                COUNT(*) as writeoff_count,
                SUM(total_cost_value) as total_cost,
                SUM(total_itc_reversal) as total_itc_reversed
            FROM inventory.stock_writeoffs
            WHERE org_id = :org_id AND requires_itc_reversal = true
        """
        params = {"org_id": org_id}
        
        total_query = """
            SELECT SUM(total_itc_reversal) FROM inventory.stock_writeoffs
            WHERE org_id = :org_id AND requires_itc_reversal = true
        """
        
        if from_date:
            query += " AND writeoff_date >= :from_date"
            total_query += " AND writeoff_date >= :from_date"
            params["from_date"] = from_date
        
        if to_date:
            query += " AND writeoff_date <= :to_date"
            total_query += " AND writeoff_date <= :to_date"
            params["to_date"] = to_date
        
        query += """
            GROUP BY DATE_TRUNC('month', writeoff_date), reason
            ORDER BY month DESC, reason
        """
        
        result = db.execute(text(query), params)
        summary = []
        for row in result:
            summary.append({
                "month": row.month.strftime("%Y-%m") if row.month else None,
                "reason": row.reason,
                "writeoff_count": row.writeoff_count,
                "total_cost": float(row.total_cost or 0),
                "total_itc_reversed": float(row.total_itc_reversed or 0)
            })
        
        grand_total = db.execute(text(total_query), params).scalar() or 0
        
        return summary, float(grand_total)
