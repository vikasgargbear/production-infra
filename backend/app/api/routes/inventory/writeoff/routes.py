"""
Stock Write-off API - Inventory write-off with ITC reversal tracking

MODERNIZED: Uses TenantAwareSession + PermissionChecker + OrgContext
Supports: Expired, Damaged, Stolen, Sample write-offs with GST ITC reversal
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
import logging
from datetime import date, datetime, timedelta
from decimal import Decimal
import uuid
from ....services.document_number_service import DocumentNumberService

from .....core.auth.tenant_service import TenantAwareSession, get_tenant_aware_db, with_tenant_context
from .....core.auth.org_context import OrgContext, get_org_context
from .....core.security.permissions import PermissionChecker

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stock-writeoff", tags=["Stock Write-off"])


# GST ITC reversal rules by reason
WRITE_OFF_GST_ACTIONS = {
    "expired": "itc_reversal",
    "damaged": "itc_reversal",
    "theft": "itc_reversal",
    "sample": "no_reversal",  # Free samples don't require ITC reversal
    "personal_use": "itc_reversal",
    "destroyed": "itc_reversal",
    "other": "itc_reversal"
}


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class WriteOffItem(BaseModel):
    product_id: int
    batch_id: Optional[int] = None
    quantity: Decimal = Field(..., gt=0)
    cost_price: Decimal = Field(..., ge=0)
    gst_percent: Optional[Decimal] = Field(0, ge=0, le=28)


class WriteOffRequest(BaseModel):
    write_off_date: date
    reason: str = Field(..., pattern="^(expired|damaged|theft|sample|personal_use|destroyed|other)$")
    reason_notes: Optional[str] = None
    items: List[WriteOffItem] = Field(..., min_length=1)


class WriteOffResponse(BaseModel):
    success: bool
    writeoff_id: str
    writeoff_number: str
    total_cost_value: float
    total_itc_reversal: float
    requires_itc_reversal: bool
    message: str


# ============================================================================
# EXPIRY REPORT
# ============================================================================

@router.get("/expiry-report")
@with_tenant_context
async def get_expiry_report(
    days_ahead: int = Query(90, ge=1, le=365, description="Days ahead to check"),
    include_expired: bool = Query(True, description="Include already expired items"),
    _: dict = Depends(PermissionChecker("inventory", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get report of expiring and expired stock
    
    Use this to identify items that need write-off
    """
    try:
        org_id = str(context.org_id)
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
        items = [dict(row._mapping) for row in result]
        
        # Calculate summary
        expired_count = sum(1 for i in items if i.get("is_expired"))
        expiring_value = sum(
            float(i["current_stock"]) * float(i["cost_price"]) 
            for i in items
        )
        
        return {
            "success": True,
            "items": items,
            "summary": {
                "total_items": len(items),
                "already_expired": expired_count,
                "expiring_soon": len(items) - expired_count,
                "total_value_at_risk": round(expiring_value, 2)
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting expiry report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# CREATE WRITE-OFF
# ============================================================================

@router.post("/", response_model=WriteOffResponse)
@with_tenant_context
async def create_stock_writeoff(
    request: WriteOffRequest,
    _: dict = Depends(PermissionChecker("inventory", "delete")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Create a stock write-off entry with ITC reversal tracking
    
    - Reduces inventory
    - Creates stock movement record
    - Tracks ITC reversal for GST compliance
    """
    try:
        org_id = str(context.org_id)
        user_id = context.user_id
        branch_id = context.primary_branch_id
        
        # Generate writeoff ID and number
        writeoff_id = str(uuid.uuid4())
        writeoff_number = DocumentNumberService.generate_number(db, "writeoff", org_id)
        
        # Check if ITC reversal is required
        requires_itc_reversal = WRITE_OFF_GST_ACTIONS.get(request.reason, "itc_reversal") == "itc_reversal"
        
        # Calculate totals
        total_cost_value = Decimal("0")
        total_itc_reversal = Decimal("0")
        
        for item in request.items:
            item_cost = item.quantity * item.cost_price
            total_cost_value += item_cost
            
            if requires_itc_reversal and item.gst_percent:
                itc_amount = item_cost * item.gst_percent / 100
                total_itc_reversal += itc_amount
        
        # Create write-off record
        db.execute(text("""
            INSERT INTO stock_writeoffs (
                writeoff_id, org_id, writeoff_number, writeoff_date,
                reason, reason_notes, total_cost_value, total_itc_reversal,
                requires_itc_reversal, status, created_by, branch_id
            ) VALUES (
                :writeoff_id, :org_id, :writeoff_number, :writeoff_date,
                :reason, :reason_notes, :total_cost, :itc_reversal,
                :requires_itc, 'approved', :created_by, :branch_id
            )
        """), {
            "writeoff_id": writeoff_id,
            "org_id": org_id,
            "writeoff_number": writeoff_number,
            "writeoff_date": request.write_off_date,
            "reason": request.reason,
            "reason_notes": request.reason_notes,
            "total_cost": total_cost_value,
            "itc_reversal": total_itc_reversal,
            "requires_itc": requires_itc_reversal,
            "created_by": user_id,
            "branch_id": branch_id
        })
        
        # Process each item
        for item in request.items:
            item_id = str(uuid.uuid4())
            
            # Insert write-off item
            db.execute(text("""
                INSERT INTO stock_writeoff_items (
                    item_id, writeoff_id, product_id, batch_id,
                    quantity, cost_price, gst_percent
                ) VALUES (
                    :item_id, :writeoff_id, :product_id, :batch_id,
                    :quantity, :cost_price, :gst_percent
                )
            """), {
                "item_id": item_id,
                "writeoff_id": writeoff_id,
                "product_id": item.product_id,
                "batch_id": item.batch_id,
                "quantity": item.quantity,
                "cost_price": item.cost_price,
                "gst_percent": item.gst_percent or 0
            })
            
            # Update batch inventory
            if item.batch_id:
                db.execute(text("""
                    UPDATE inventory.batches 
                    SET quantity_available = quantity_available - :quantity,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE batch_id = :batch_id 
                    AND org_id = :org_id
                    AND quantity_available >= :quantity
                """), {
                    "batch_id": item.batch_id,
                    "org_id": org_id,
                    "quantity": item.quantity
                })
            
            # Create stock movement record
            db.execute(text("""
                INSERT INTO inventory.stock_movements (
                    org_id, movement_date, movement_type,
                    product_id, batch_id, quantity, reference_type,
                    reference_id, reason, created_by, branch_id
                ) VALUES (
                    :org_id, :date, 'write_off',
                    :product_id, :batch_id, :quantity, 'stock_writeoff',
                    :writeoff_id, :reason, :created_by, :branch_id
                )
            """), {
                "org_id": org_id,
                "date": request.write_off_date,
                "product_id": item.product_id,
                "batch_id": item.batch_id,
                "quantity": -abs(float(item.quantity)),  # Negative for reduction
                "writeoff_id": writeoff_id,
                "reason": request.reason,
                "created_by": user_id,
                "branch_id": branch_id
            })
        
        # If ITC reversal is required, create GST adjustment entry
        if requires_itc_reversal and total_itc_reversal > 0:
            db.execute(text("""
                INSERT INTO gst_adjustments (
                    adjustment_id, org_id, adjustment_date, adjustment_type,
                    reference_type, reference_id, amount, description
                ) VALUES (
                    :adj_id, :org_id, :date, 'itc_reversal',
                    'stock_writeoff', :writeoff_id, :amount, :description
                )
            """), {
                "adj_id": str(uuid.uuid4()),
                "org_id": org_id,
                "date": request.write_off_date,
                "writeoff_id": writeoff_id,
                "amount": total_itc_reversal,
                "description": f"ITC reversal for stock write-off {writeoff_number} - {request.reason}"
            })
        
        db.commit()
        
        return WriteOffResponse(
            success=True,
            writeoff_id=writeoff_id,
            writeoff_number=writeoff_number,
            total_cost_value=float(total_cost_value),
            total_itc_reversal=float(total_itc_reversal),
            requires_itc_reversal=requires_itc_reversal,
            message=f"Stock write-off {writeoff_number} created" + 
                   (f" with ITC reversal of ₹{total_itc_reversal:.2f}" if requires_itc_reversal else "")
        )
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating stock write-off: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# LIST & VIEW
# ============================================================================

@router.get("/")
@with_tenant_context
async def get_writeoffs(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    reason: Optional[str] = None,
    _: dict = Depends(PermissionChecker("inventory", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get list of stock write-offs with filters"""
    try:
        org_id = str(context.org_id)
        offset = (page - 1) * limit
        
        query = """
            SELECT 
                w.writeoff_id, w.writeoff_number, w.writeoff_date,
                w.reason, w.reason_notes, w.total_cost_value, w.total_itc_reversal,
                w.requires_itc_reversal, w.status,
                COUNT(wi.item_id) as item_count
            FROM stock_writeoffs w
            LEFT JOIN stock_writeoff_items wi ON w.writeoff_id = wi.writeoff_id
            WHERE w.org_id = :org_id
        """
        params = {"org_id": org_id, "limit": limit, "offset": offset}
        
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
            LIMIT :limit OFFSET :offset
        """
        
        result = db.execute(text(query), params)
        writeoffs = [dict(row._mapping) for row in result]
        
        # Get total count
        count_query = "SELECT COUNT(*) FROM stock_writeoffs WHERE org_id = :org_id"
        if from_date:
            count_query += " AND writeoff_date >= :from_date"
        if to_date:
            count_query += " AND writeoff_date <= :to_date"
        if reason:
            count_query += " AND reason = :reason"
        
        total = db.execute(text(count_query), params).scalar() or 0
        
        return {
            "writeoffs": writeoffs,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "pages": (total + limit - 1) // limit
            }
        }
        
    except Exception as e:
        logger.error(f"Error fetching write-offs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{writeoff_id}")
@with_tenant_context
async def get_writeoff_details(
    writeoff_id: str,
    _: dict = Depends(PermissionChecker("inventory", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get write-off details with items"""
    try:
        org_id = str(context.org_id)
        
        writeoff = db.execute(text("""
            SELECT * FROM stock_writeoffs
            WHERE writeoff_id = :id AND org_id = :org_id
        """), {"id": writeoff_id, "org_id": org_id}).fetchone()
        
        if not writeoff:
            raise HTTPException(status_code=404, detail="Write-off not found")
        
        items = db.execute(text("""
            SELECT 
                wi.*, p.product_name, b.batch_number
            FROM stock_writeoff_items wi
            LEFT JOIN inventory.products p ON wi.product_id = p.product_id
            LEFT JOIN inventory.batches b ON wi.batch_id = b.batch_id
            WHERE wi.writeoff_id = :id
        """), {"id": writeoff_id}).fetchall()
        
        return {
            "writeoff": dict(writeoff._mapping),
            "items": [dict(i._mapping) for i in items]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching write-off details: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# GST ITC SUMMARY
# ============================================================================

@router.get("/itc-summary")
@with_tenant_context
async def get_itc_reversal_summary(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    _: dict = Depends(PermissionChecker("reports", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get summary of ITC reversals for GST filing
    
    Use this data for Table 4(B) in GSTR-3B
    """
    try:
        org_id = str(context.org_id)
        
        query = """
            SELECT 
                DATE_TRUNC('month', writeoff_date) as month,
                reason,
                COUNT(*) as writeoff_count,
                SUM(total_cost_value) as total_cost,
                SUM(total_itc_reversal) as total_itc_reversed
            FROM stock_writeoffs
            WHERE org_id = :org_id AND requires_itc_reversal = true
        """
        params = {"org_id": org_id}
        
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
        
        # Grand total
        total_query = """
            SELECT SUM(total_itc_reversal) FROM stock_writeoffs
            WHERE org_id = :org_id AND requires_itc_reversal = true
        """
        if from_date:
            total_query += " AND writeoff_date >= :from_date"
        if to_date:
            total_query += " AND writeoff_date <= :to_date"
        
        grand_total = db.execute(text(total_query), params).scalar() or 0
        
        return {
            "summary": summary,
            "grand_total_itc_reversal": float(grand_total),
            "gst_note": "Use this data for Table 4(B)(2) in GSTR-3B - ITC reversed due to write-off/destruction"
        }
        
    except Exception as e:
        logger.error(f"Error getting ITC reversal summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))
