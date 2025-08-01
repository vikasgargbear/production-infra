"""
Invoice Fallback Router
Handles cases where frontend tries to invoice non-existent orders
"""

from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.orm import Session
from sqlalchemy import text

from ...database import get_db
from ...core.auth import get_current_org
from ...services.invoice_service import InvoiceService

router = APIRouter(
    prefix="/api/v1/orders",
    tags=["orders"]
)

@router.post("/{order_id}/invoice")
async def generate_invoice_with_fallback(
    order_id: int = Path(..., description="Order ID"),
    invoice_date: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_org = Depends(get_current_org)
):
    """
    Enhanced invoice generation that provides better error handling
    and suggestions when order doesn't exist
    """
    org_id = current_org["org_id"]
    
    # First check if order exists
    order = db.execute(text("""
        SELECT order_id, order_status, customer_id, final_amount
        FROM orders
        WHERE order_id = :order_id AND org_id = :org_id
    """), {
        "order_id": order_id,
        "org_id": org_id
    }).first()
    
    if not order:
        # Get the latest orders to help debug
        latest_orders = db.execute(text("""
            SELECT order_id, order_number, created_at
            FROM orders
            WHERE org_id = :org_id
            ORDER BY order_id DESC
            LIMIT 5
        """), {"org_id": org_id}).fetchall()
        
        # Check if an invoice already exists for this "order_id" 
        # (in case frontend is confusing order_id with invoice_id)
        existing_invoice = db.execute(text("""
            SELECT invoice_id, invoice_number, order_id
            FROM invoices
            WHERE order_id = :order_id OR invoice_id = :order_id
            LIMIT 1
        """), {"order_id": order_id}).first()
        
        error_detail = f"Order {order_id} not found. "
        
        if latest_orders:
            latest_ids = [str(o.order_id) for o in latest_orders]
            error_detail += f"Latest order IDs are: {', '.join(latest_ids)}. "
        
        if existing_invoice:
            error_detail += f"Note: Invoice {existing_invoice.invoice_number} exists with invoice_id={existing_invoice.invoice_id}. "
        
        error_detail += "Please use /api/v1/invoices/create-with-order to create both order and invoice together."
        
        raise HTTPException(
            status_code=404,
            detail={
                "error": f"Order {order_id} not found",
                "message": error_detail,
                "latest_orders": [
                    {
                        "order_id": o.order_id,
                        "order_number": o.order_number,
                        "created_at": o.created_at.isoformat() if o.created_at else None
                    } for o in latest_orders
                ] if latest_orders else [],
                "suggestion": "Use POST /api/v1/invoices/create-with-order instead"
            }
        )
    
    # If order exists but already has invoice, return that info
    existing_invoice = db.execute(text("""
        SELECT invoice_id, invoice_number, created_at, total_amount
        FROM invoices
        WHERE order_id = :order_id
    """), {"order_id": order_id}).first()
    
    if existing_invoice:
        return {
            "status": "already_exists",
            "invoice_id": existing_invoice.invoice_id,
            "invoice_number": existing_invoice.invoice_number,
            "created_at": existing_invoice.created_at,
            "total_amount": float(existing_invoice.total_amount),
            "message": f"Invoice {existing_invoice.invoice_number} already exists for order {order_id}"
        }
    
    # Order exists and has no invoice - proceed with generation
    try:
        result = InvoiceService.generate_invoice_for_order(
            db=db,
            order_id=order_id,
            org_id=org_id,
            invoice_date=invoice_date or datetime.utcnow()
        )
        
        db.commit()
        return {
            "status": "created",
            **result
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate invoice: {str(e)}"
        )