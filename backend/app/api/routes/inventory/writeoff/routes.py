"""
Stock Write-off API - Inventory write-off with ITC reversal tracking

MODERNIZED: Uses TenantAwareSession + PermissionChecker + OrgContext
REFACTORED: All SQL moved to WriteoffService
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
import logging
from datetime import date
from decimal import Decimal
import uuid
from ....services.document_number_service import DocumentNumberService
from ....services.inventory.writeoff.service import WriteoffService

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
    "sample": "no_reversal",
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
    """Get report of expiring and expired stock"""
    try:
        items = WriteoffService.get_expiry_report(
            db, str(context.org_id), days_ahead, include_expired
        )
        
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
    """Create a stock write-off entry with ITC reversal tracking"""
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
        WriteoffService.insert_writeoff(db, org_id, {
            "writeoff_id": writeoff_id,
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
            WriteoffService.insert_writeoff_item(db, {
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
                WriteoffService.reduce_batch_quantity(db, org_id, item.batch_id, item.quantity)
            
            # Create stock movement record (quantity is positive; direction='out' in the INSERT)
            WriteoffService.insert_stock_movement(db, {
                "org_id": org_id,
                "date": request.write_off_date,
                "product_id": item.product_id,
                "batch_id": item.batch_id,
                "quantity": abs(float(item.quantity)),
                "writeoff_id": writeoff_id,
                "reason": request.reason,
                "notes": f"Stock writeoff - {request.reason}",
                "created_by": user_id
            })
        
        # If ITC reversal is required, create GST adjustment entry
        if requires_itc_reversal and total_itc_reversal > 0:
            WriteoffService.insert_gst_adjustment(db, {
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
        offset = (page - 1) * limit
        writeoffs, total = WriteoffService.list_writeoffs(
            db, str(context.org_id), from_date, to_date, reason, limit, offset
        )
        
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
        writeoff = WriteoffService.get_writeoff(db, str(context.org_id), writeoff_id)
        
        if not writeoff:
            raise HTTPException(status_code=404, detail="Write-off not found")
        
        items = WriteoffService.get_writeoff_items(db, writeoff_id)
        
        return {"writeoff": writeoff, "items": items}
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
    """Get summary of ITC reversals for GST filing"""
    try:
        summary, grand_total = WriteoffService.get_itc_summary(
            db, str(context.org_id), from_date, to_date
        )
        
        return {
            "summary": summary,
            "grand_total_itc_reversal": grand_total,
            "gst_note": "Use this data for Table 4(B)(2) in GSTR-3B - ITC reversed due to write-off/destruction"
        }
    except Exception as e:
        logger.error(f"Error getting ITC reversal summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))
