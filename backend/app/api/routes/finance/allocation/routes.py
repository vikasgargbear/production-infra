"""
Payment Allocation API
REFACTORED: Uses AllocationService for database operations
"""
from typing import List, Optional, Dict, Any
from decimal import Decimal
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
import logging

from .....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from .....core.auth.org_context import get_org_context, OrgContext
from .....core.security.permissions import PermissionChecker
from .....core.money import money_json
from .....core.idempotency import (
    IdempotencyStateError,
    require_dedicated_payment_idempotency_store,
)
from .....core.utils.constants import PaymentRecordStatus, PartyType
from ....services.finance.allocation.service import AllocationService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payment-allocation", tags=["payment-allocation"])


def _require_allocation_idempotency(idempotency_key: str) -> None:
    try:
        require_dedicated_payment_idempotency_store(
            operation="payment.allocate",
            key=idempotency_key,
        )
    except IdempotencyStateError as error:
        raise HTTPException(status_code=503, detail={
            "code": "IDEMPOTENCY_STATE_UNAVAILABLE",
            "message": str(error),
        }) from error

class AllocationRequest(BaseModel):
    payment_id: int
    invoice_id: int
    amount: Decimal = Field(gt=0)
    
class BulkAllocationRequest(BaseModel):
    payment_id: int
    allocations: List[Dict[str, Any]]
    
class AutoAllocationRequest(BaseModel):
    payment_id: int
    method: str = Field(default="fifo", pattern="^(fifo|lifo|proportional)$")

@router.post("/allocate")
@with_tenant_context
async def allocate_payment(
    allocation: AllocationRequest,
    idempotency_key: str = Header(
        ...,
        alias="X-Idempotency-Key",
        min_length=8,
        max_length=255,
    ),
    _: dict = Depends(PermissionChecker("finance", "edit")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Manually allocate a payment to an invoice"""
    _require_allocation_idempotency(idempotency_key)
    try:
        org_id = str(context.org_id)
        payment = AllocationService.get_payment(db, org_id, allocation.payment_id)
        if not payment:
            raise HTTPException(status_code=404, detail="Payment not found")
        
        invoice = AllocationService.get_invoice(db, org_id, allocation.invoice_id)
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        if payment["party_type"] == PartyType.CUSTOMER.value and payment["party_id"] != invoice["customer_id"]:
            raise HTTPException(status_code=400, detail="Payment and invoice belong to different customers")
        
        payment_available = Decimal(str(payment["payment_amount"])) - Decimal(
            str(payment.get("allocated_amount") or 0)
        )
        invoice_due = Decimal(str(invoice["final_amount"])) - Decimal(
            str(invoice.get("allocated_amount") or 0)
        )
        
        if allocation.amount > payment_available:
            raise HTTPException(status_code=400, detail=f"Insufficient payment balance. Available: {payment_available}")
        if allocation.amount > invoice_due:
            raise HTTPException(status_code=400, detail=f"Allocation exceeds invoice due. Due: {invoice_due}")
        
        invoice_number = invoice.get("invoice_number", "")
        user_id = getattr(context, 'user_id', None)
        allocation_id = AllocationService.create_allocation(
            db, org_id, allocation.payment_id, allocation.invoice_id,
            allocation.amount, invoice_number, user_id
        )
        
        updated_payment = AllocationService.get_payment_status(db, org_id, allocation.payment_id)
        updated_invoice = AllocationService.get_invoice_status(db, org_id, allocation.invoice_id)
        db.commit()
        
        return {
            "success": True, "allocation_id": allocation_id,
            "payment": {"payment_id": allocation.payment_id, "allocation_status": updated_payment["allocation_status"],
                       "allocated": money_json(updated_payment["allocated_amount"]), "unallocated": money_json(updated_payment["unallocated_amount"])},
            "invoice": {"invoice_id": allocation.invoice_id, "payment_status": updated_invoice["payment_status"],
                       "allocated": money_json(updated_invoice["allocated_amount"]), "due": money_json(updated_invoice["due_amount"])}
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Allocation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/allocate-bulk")
@with_tenant_context
async def allocate_payment_bulk(
    request: BulkAllocationRequest,
    idempotency_key: str = Header(
        ...,
        alias="X-Idempotency-Key",
        min_length=8,
        max_length=255,
    ),
    _: dict = Depends(PermissionChecker("finance", "edit")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Allocate a payment to multiple invoices"""
    _require_allocation_idempotency(idempotency_key)
    try:
        results = []
        for alloc in request.allocations:
            try:
                allocation = AllocationRequest(payment_id=request.payment_id, invoice_id=alloc["invoice_id"], amount=alloc["amount"])
                result = await allocate_payment(
                    allocation, idempotency_key, db=db, context=context
                )
                results.append(result)
            except HTTPException as e:
                results.append({"invoice_id": alloc["invoice_id"], "error": e.detail})
        return {"success": True, "allocations": results}
    except Exception as e:
        db.rollback()
        logger.error(f"Bulk allocation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/auto-allocate")
@with_tenant_context
async def auto_allocate_payment(
    request: AutoAllocationRequest,
    idempotency_key: str = Header(
        ...,
        alias="X-Idempotency-Key",
        min_length=8,
        max_length=255,
    ),
    _: dict = Depends(PermissionChecker("finance", "edit")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Automatically allocate payment to outstanding invoices"""
    _require_allocation_idempotency(idempotency_key)
    try:
        org_id = str(context.org_id)
        allocations = AllocationService.auto_allocate(db, org_id, request.payment_id, request.method)
        payment_status = AllocationService.get_payment_status(db, org_id, request.payment_id)
        return {
            "success": True, "method": request.method, "allocations": allocations,
            "payment_status": {"allocation_status": payment_status["allocation_status"],
                              "total_allocated": money_json(payment_status["allocated_amount"]),
                              "unallocated": money_json(payment_status["unallocated_amount"])}
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Auto-allocation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/payment/{payment_id}/allocations")
@with_tenant_context
async def get_payment_allocations(
    payment_id: int,
    _: dict = Depends(PermissionChecker("finance", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get all allocations for a payment"""
    try:
        allocations = AllocationService.get_payment_allocations(db, str(context.org_id), payment_id)
        return {
            "payment_id": payment_id,
            "allocations": [{"allocation_id": a["allocation_id"], "invoice_id": a["invoice_id"],
                            "invoice_number": a["invoice_number"], "allocated_amount": money_json(a["allocated_amount"]),
                            "allocation_date": a["allocation_date"].isoformat() if a.get("allocation_date") else None,
                            "allocation_type": "manual"} for a in allocations]
        }
    except Exception as e:
        logger.error(f"Error fetching allocations: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/allocation/{allocation_id}")
@with_tenant_context
async def delete_allocation(
    allocation_id: int,
    idempotency_key: str = Header(
        ...,
        alias="X-Idempotency-Key",
        min_length=8,
        max_length=255,
    ),
    _: dict = Depends(PermissionChecker("finance", "delete")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Delete an allocation"""
    _require_allocation_idempotency(idempotency_key)
    try:
        allocation = AllocationService.get_allocation_with_org(db, str(context.org_id), allocation_id)
        if not allocation:
            raise HTTPException(status_code=404, detail="Allocation not found")
        AllocationService.delete_allocation(
            db,
            str(context.org_id),
            allocation_id,
            allocation["payment_id"],
            allocation["reference_id"],
        )
        db.commit()
        return {"success": True, "message": "Allocation removed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting allocation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/unallocated-payments")
@with_tenant_context
async def get_unallocated_payments(
    party_id: Optional[int] = None,
    _: dict = Depends(PermissionChecker("finance", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get payments with unallocated amounts"""
    try:
        payments = AllocationService.get_unallocated_payments(db, str(context.org_id), party_id, PaymentRecordStatus.CANCELLED.value)
        return {
            "payments": [{"payment_id": p["payment_id"], "payment_number": p["payment_number"],
                         "payment_date": p["payment_date"].isoformat() if p.get("payment_date") else None,
                         "party_id": p["party_id"], "party_name": p["party_name"],
                         "total_amount": money_json(p["payment_amount"]), "allocated": money_json(p["allocated_amount"]),
                         "unallocated": money_json(p["unallocated_amount"]), "status": p["allocation_status"]} for p in payments]
        }
    except Exception as e:
        logger.error(f"Error fetching unallocated payments: {e}")
        raise HTTPException(status_code=500, detail=str(e))
