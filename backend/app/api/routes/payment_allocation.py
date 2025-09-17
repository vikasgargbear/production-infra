"""
Payment Allocation API
Handles linking payments to invoices for proper accounting
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from datetime import datetime, date
from decimal import Decimal

from ...core.database import get_db
from ...core.auth_utils import get_org_id_from_header

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payment-allocation", tags=["payment-allocation"])

# Pydantic models for request/response
class AllocationRequest(BaseModel):
    payment_id: int
    invoice_id: int
    amount: float = Field(gt=0, description="Amount to allocate")
    
class BulkAllocationRequest(BaseModel):
    payment_id: int
    allocations: List[Dict[str, Any]]  # [{"invoice_id": 1, "amount": 100}, ...]
    
class AutoAllocationRequest(BaseModel):
    payment_id: int
    method: str = Field(default="fifo", pattern="^(fifo|lifo|proportional)$")

@router.post("/allocate")
async def allocate_payment(
    allocation: AllocationRequest,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Manually allocate a payment to an invoice
    """
    try:
        # Validate payment exists and belongs to org
        payment_check = db.execute(
            text("""
                SELECT payment_id, payment_amount, allocated_amount, party_id, party_type
                FROM financial.payments
                WHERE payment_id = :payment_id AND org_id = :org_id
            """),
            {"payment_id": allocation.payment_id, "org_id": org_id}
        ).fetchone()
        
        if not payment_check:
            raise HTTPException(status_code=404, detail="Payment not found")
        
        # Validate invoice exists and belongs to same customer
        invoice_check = db.execute(
            text("""
                SELECT invoice_id, customer_id, final_amount, allocated_amount
                FROM sales.invoices
                WHERE invoice_id = :invoice_id
            """),
            {"invoice_id": allocation.invoice_id}
        ).fetchone()
        
        if not invoice_check:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        # Verify customer matches
        if payment_check.party_type == 'customer' and payment_check.party_id != invoice_check.customer_id:
            raise HTTPException(
                status_code=400, 
                detail="Payment and invoice belong to different customers"
            )
        
        # Check available amounts
        payment_available = float(payment_check.payment_amount) - float(payment_check.allocated_amount or 0)
        invoice_due = float(invoice_check.final_amount) - float(invoice_check.allocated_amount or 0)
        
        if allocation.amount > payment_available:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient payment balance. Available: {payment_available}"
            )
        
        if allocation.amount > invoice_due:
            raise HTTPException(
                status_code=400,
                detail=f"Allocation exceeds invoice due. Due: {invoice_due}"
            )
        
        # Create allocation
        result = db.execute(
            text("""
                INSERT INTO financial.payment_allocations 
                (org_id, payment_id, invoice_id, allocated_amount, allocation_type)
                VALUES (:org_id, :payment_id, :invoice_id, :amount, 'manual')
                RETURNING allocation_id
            """),
            {
                "org_id": org_id,
                "payment_id": allocation.payment_id,
                "invoice_id": allocation.invoice_id,
                "amount": allocation.amount
            }
        )
        
        allocation_id = result.scalar()
        db.commit()
        
        # Get updated status
        updated_payment = db.execute(
            text("""
                SELECT allocation_status, allocated_amount, unallocated_amount
                FROM financial.payments
                WHERE payment_id = :payment_id
            """),
            {"payment_id": allocation.payment_id}
        ).fetchone()
        
        updated_invoice = db.execute(
            text("""
                SELECT payment_status, allocated_amount, 
                       final_amount - allocated_amount as due_amount
                FROM sales.invoices
                WHERE invoice_id = :invoice_id
            """),
            {"invoice_id": allocation.invoice_id}
        ).fetchone()
        
        return {
            "success": True,
            "allocation_id": allocation_id,
            "payment": {
                "payment_id": allocation.payment_id,
                "allocation_status": updated_payment.allocation_status,
                "allocated": float(updated_payment.allocated_amount),
                "unallocated": float(updated_payment.unallocated_amount)
            },
            "invoice": {
                "invoice_id": allocation.invoice_id,
                "payment_status": updated_invoice.payment_status,
                "allocated": float(updated_invoice.allocated_amount),
                "due": float(updated_invoice.due_amount)
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Allocation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/allocate-bulk")
async def allocate_payment_bulk(
    request: BulkAllocationRequest,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Allocate a payment to multiple invoices
    """
    try:
        results = []
        
        for alloc in request.allocations:
            try:
                # Use the single allocation logic
                allocation = AllocationRequest(
                    payment_id=request.payment_id,
                    invoice_id=alloc["invoice_id"],
                    amount=alloc["amount"]
                )
                
                result = await allocate_payment(allocation, db, org_id)
                results.append(result)
                
            except HTTPException as e:
                results.append({
                    "invoice_id": alloc["invoice_id"],
                    "error": e.detail
                })
        
        return {
            "success": True,
            "allocations": results
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Bulk allocation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/auto-allocate")
async def auto_allocate_payment(
    request: AutoAllocationRequest,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Automatically allocate payment to outstanding invoices using FIFO/LIFO
    """
    try:
        # Call the database function for auto-allocation
        result = db.execute(
            text("SELECT * FROM financial.auto_allocate_payment(:payment_id, :method)"),
            {"payment_id": request.payment_id, "method": request.method}
        ).fetchall()
        
        allocations = [
            {
                "invoice_id": row.invoice_id,
                "allocated_amount": float(row.allocated_amount)
            }
            for row in result
        ]
        
        db.commit()
        
        # Get final payment status
        payment_status = db.execute(
            text("""
                SELECT allocation_status, allocated_amount, unallocated_amount
                FROM financial.payments
                WHERE payment_id = :payment_id
            """),
            {"payment_id": request.payment_id}
        ).fetchone()
        
        return {
            "success": True,
            "method": request.method,
            "allocations": allocations,
            "payment_status": {
                "allocation_status": payment_status.allocation_status,
                "total_allocated": float(payment_status.allocated_amount),
                "unallocated": float(payment_status.unallocated_amount)
            }
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Auto-allocation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/payment/{payment_id}/allocations")
async def get_payment_allocations(
    payment_id: int,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get all allocations for a payment
    """
    try:
        allocations = db.execute(
            text("""
                SELECT
                    pa.allocation_id,
                    pa.reference_id as invoice_id,
                    pa.reference_number as invoice_number,
                    pa.allocated_amount,
                    pa.created_at as allocation_date
                FROM financial.payment_allocations pa
                WHERE pa.payment_id = :payment_id
                AND pa.reference_type = 'invoice'
                AND pa.allocation_status = 'active'
                ORDER BY pa.created_at DESC
            """),
            {"payment_id": payment_id}
        ).fetchall()

        return {
            "payment_id": payment_id,
            "allocations": [
                {
                    "allocation_id": a.allocation_id,
                    "invoice_id": a.invoice_id,
                    "invoice_number": a.invoice_number,
                    "allocated_amount": float(a.allocated_amount),
                    "allocation_date": a.allocation_date.isoformat() if a.allocation_date else None,
                    "allocation_type": "manual"
                }
                for a in allocations
            ]
        }
        
    except Exception as e:
        logger.error(f"Error fetching allocations: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/invoice/{invoice_id}/payments")
async def get_invoice_payments(
    invoice_id: int,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get all payments allocated to an invoice
    """
    try:
        payments = db.execute(
            text("""
                SELECT
                    pa.allocation_id,
                    pa.payment_id,
                    p.payment_number,
                    p.payment_date,
                    p.payment_amount,
                    pa.allocated_amount,
                    pa.created_at as allocation_date
                FROM financial.payment_allocations pa
                JOIN financial.payments p ON pa.payment_id = p.payment_id
                WHERE pa.reference_type = 'invoice'
                AND pa.reference_id = :invoice_id
                AND pa.allocation_status = 'active'
                ORDER BY pa.created_at DESC
            """),
            {"invoice_id": invoice_id}
        ).fetchall()
        
        # Get invoice summary
        invoice = db.execute(
            text("""
                SELECT 
                    invoice_number,
                    final_amount,
                    allocated_amount,
                    payment_status
                FROM sales.invoices
                WHERE invoice_id = :invoice_id
            """),
            {"invoice_id": invoice_id}
        ).fetchone()
        
        return {
            "invoice": {
                "invoice_id": invoice_id,
                "invoice_number": invoice.invoice_number if invoice else None,
                "total_amount": float(invoice.final_amount) if invoice else 0,
                "allocated_amount": float(invoice.allocated_amount) if invoice else 0,
                "due_amount": float(invoice.final_amount - invoice.allocated_amount) if invoice else 0,
                "payment_status": invoice.payment_status if invoice else None
            },
            "payments": [
                {
                    "allocation_id": p.allocation_id,
                    "payment_id": p.payment_id,
                    "payment_number": p.payment_number,
                    "payment_date": p.payment_date.isoformat() if p.payment_date else None,
                    "payment_amount": float(p.payment_amount),
                    "allocated_amount": float(p.allocated_amount),
                    "allocation_date": p.allocation_date.isoformat() if p.allocation_date else None,
                    "allocation_type": "manual"
                }
                for p in payments
            ]
        }
        
    except Exception as e:
        logger.error(f"Error fetching invoice payments: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/allocation/{allocation_id}")
async def delete_allocation(
    allocation_id: int,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Delete an allocation (unallocate payment from invoice)
    """
    try:
        # Verify allocation exists and belongs to org
        allocation = db.execute(
            text("""
                SELECT pa.*, p.org_id
                FROM financial.payment_allocations pa
                JOIN financial.payments p ON pa.payment_id = p.payment_id
                WHERE pa.allocation_id = :allocation_id AND p.org_id = :org_id
            """),
            {"allocation_id": allocation_id, "org_id": org_id}
        ).fetchone()
        
        if not allocation:
            raise HTTPException(status_code=404, detail="Allocation not found")
        
        # Delete allocation (triggers will update payment and invoice)
        db.execute(
            text("DELETE FROM financial.payment_allocations WHERE allocation_id = :allocation_id"),
            {"allocation_id": allocation_id}
        )
        
        db.commit()
        
        return {
            "success": True,
            "message": "Allocation removed successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting allocation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/unallocated-payments")
async def get_unallocated_payments(
    party_id: Optional[int] = None,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get payments with unallocated amounts
    """
    try:
        query = """
            SELECT 
                payment_id,
                payment_number,
                payment_date,
                party_id,
                party_name,
                payment_amount,
                allocated_amount,
                unallocated_amount,
                allocation_status
            FROM financial.payments
            WHERE org_id = :org_id
            AND allocation_status != 'full'
            AND unallocated_amount > 0
            AND payment_status != 'cancelled'
        """
        
        params = {"org_id": org_id}
        
        if party_id:
            query += " AND party_id = :party_id"
            params["party_id"] = party_id
        
        query += " ORDER BY payment_date DESC"
        
        payments = db.execute(text(query), params).fetchall()
        
        return {
            "payments": [
                {
                    "payment_id": p.payment_id,
                    "payment_number": p.payment_number,
                    "payment_date": p.payment_date.isoformat() if p.payment_date else None,
                    "party_id": p.party_id,
                    "party_name": p.party_name,
                    "total_amount": float(p.payment_amount),
                    "allocated": float(p.allocated_amount),
                    "unallocated": float(p.unallocated_amount),
                    "status": p.allocation_status
                }
                for p in payments
            ]
        }
        
    except Exception as e:
        logger.error(f"Error fetching unallocated payments: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/unpaid-invoices")
async def get_unpaid_invoices(
    customer_id: Optional[int] = None,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get invoices with outstanding amounts
    """
    try:
        query = """
            SELECT 
                invoice_id,
                invoice_number,
                invoice_date,
                customer_id,
                customer_name,
                final_amount,
                allocated_amount,
                final_amount - allocated_amount as due_amount,
                payment_status
            FROM sales.invoices
            WHERE invoice_status != 'cancelled'
            AND payment_status != 'paid'
        """
        
        params = {}
        
        if customer_id:
            query += " AND customer_id = :customer_id"
            params["customer_id"] = customer_id
        
        query += " ORDER BY invoice_date ASC"  # FIFO order
        
        invoices = db.execute(text(query), params).fetchall()
        
        return {
            "invoices": [
                {
                    "invoice_id": i.invoice_id,
                    "invoice_number": i.invoice_number,
                    "invoice_date": i.invoice_date.isoformat() if i.invoice_date else None,
                    "customer_id": i.customer_id,
                    "customer_name": i.customer_name,
                    "total_amount": float(i.final_amount),
                    "allocated": float(i.allocated_amount),
                    "due": float(i.due_amount),
                    "payment_status": i.payment_status
                }
                for i in invoices
            ]
        }
        
    except Exception as e:
        logger.error(f"Error fetching unpaid invoices: {e}")
        raise HTTPException(status_code=500, detail=str(e))