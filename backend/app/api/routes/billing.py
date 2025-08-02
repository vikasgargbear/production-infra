"""
Billing and GST API endpoints
Handles invoice generation, payment recording, and GST reports
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date
from uuid import UUID

from ...core.database import get_db
from ...core.config import DEFAULT_ORG_ID
from ..schemas.billing import (
    InvoiceCreate, InvoiceResponse,
    PaymentCreate, PaymentResponse,
    GSTR1Summary, InvoiceSummary
)
from ..services.billing_service import BillingService
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["Billing & GST"])

@router.post("/invoices", response_model=InvoiceResponse)
async def generate_invoice(
    invoice_data: InvoiceCreate,
    db: Session = Depends(get_db),
    org_id: UUID = UUID(DEFAULT_ORG_ID)
):
    """
    Generate invoice from a confirmed/delivered order
    
    - Validates order status (must be confirmed or delivered)
    - Prevents duplicate invoice generation
    - Calculates GST based on customer state (CGST/SGST vs IGST)
    - Generates unique invoice number
    """
    try:
        logger.info(f"Generating invoice for order {invoice_data.order_id}")
        invoice = BillingService.create_invoice_from_order(db, invoice_data, org_id)
        logger.info(f"Generated invoice {invoice.invoice_number}")
        return invoice
    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error generating invoice: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate invoice")

@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    org_id: UUID = UUID(DEFAULT_ORG_ID)
):
    """Get invoice details with all line items"""
    try:
        # Verify invoice belongs to organization
        result = db.execute(text("""
            SELECT org_id FROM sales.invoices 
            WHERE invoice_id = :invoice_id
        """), {"invoice_id": invoice_id}).fetchone()
        
        if not result:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        if result.org_id != org_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        invoice = BillingService.get_invoice(db, invoice_id)
        return invoice
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching invoice: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch invoice")

@router.get("/invoices", response_model=List[InvoiceResponse])
async def list_invoices(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    status: Optional[str] = None,
    customer_id: Optional[int] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db),
    org_id: UUID = UUID(DEFAULT_ORG_ID)
):
    """
    List invoices with filtering options
    
    - Filter by status (draft, generated, sent, paid, partially_paid, cancelled)
    - Filter by customer
    - Filter by date range
    """
    try:
        # Build query
        query = """
            SELECT i.*, 
                   i.final_amount - COALESCE(i.paid_amount, 0) as balance_amount
            FROM sales.invoices i
            WHERE i.org_id = :org_id
        """
        params = {"org_id": org_id}
        
        if status:
            query += " AND i.invoice_status = :status"
            params["status"] = status
        
        if customer_id:
            query += " AND i.customer_id = :customer_id"
            params["customer_id"] = customer_id
        
        if from_date:
            query += " AND i.invoice_date >= :from_date"
            params["from_date"] = from_date
        
        if to_date:
            query += " AND i.invoice_date <= :to_date"
            params["to_date"] = to_date
        
        query += " ORDER BY i.invoice_date DESC, i.invoice_id DESC"
        query += " LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        from sqlalchemy import text
        result = db.execute(text(query), params)
        invoices = []
        
        for row in result:
            invoice_dict = dict(row._mapping)
            # Get items for each invoice
            items_result = db.execute(text("""
                SELECT * FROM invoice_items
                WHERE invoice_id = :invoice_id
                ORDER BY product_name
            """), {"invoice_id": row.invoice_id})
            
            invoice_dict["items"] = [dict(item._mapping) for item in items_result]
            invoices.append(InvoiceResponse(**invoice_dict))
        
        return invoices
    except Exception as e:
        logger.error(f"Error listing invoices: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to list invoices")

@router.post("/payments", response_model=PaymentResponse)
async def record_payment(
    payment_data: PaymentCreate,
    db: Session = Depends(get_db),
    org_id: UUID = UUID(DEFAULT_ORG_ID)
):
    """
    Record payment against an invoice
    
    - Updates invoice paid amount and status
    - Updates order paid amount
    - Validates payment amount doesn't exceed balance
    """
    try:
        # Verify invoice belongs to organization
        from sqlalchemy import text
        result = db.execute(text("""
            SELECT org_id FROM sales.invoices 
            WHERE invoice_id = :invoice_id
        """), {"invoice_id": payment_data.invoice_id}).fetchone()
        
        if not result:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        if result.org_id != org_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        payment = BillingService.record_payment(db, payment_data)
        logger.info(f"Recorded payment of {payment.amount} for invoice {payment.invoice_number}")
        return payment
    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error recording payment: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to record payment")

@router.get("/payments", response_model=List[PaymentResponse])
async def list_payments(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    invoice_id: Optional[int] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db),
    org_id: UUID = UUID(DEFAULT_ORG_ID)
):
    """List payments with filtering options"""
    try:
        query = """
            SELECT p.*, i.invoice_number, c.customer_name
            FROM invoice_payments p
            JOIN sales.invoices i ON p.invoice_id = i.invoice_id
            JOIN parties.customers c ON i.customer_id = c.customer_id
            WHERE i.org_id = :org_id
        """
        params = {"org_id": org_id}
        
        if invoice_id:
            query += " AND p.invoice_id = :invoice_id"
            params["invoice_id"] = invoice_id
        
        if from_date:
            query += " AND p.payment_date >= :from_date"
            params["from_date"] = from_date
        
        if to_date:
            query += " AND p.payment_date <= :to_date"
            params["to_date"] = to_date
        
        query += " ORDER BY p.payment_date DESC, p.payment_id DESC"
        query += " LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        from sqlalchemy import text
        result = db.execute(text(query), params)
        
        return [PaymentResponse(**dict(row._mapping)) for row in result]
    except Exception as e:
        logger.error(f"Error listing payments: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to list payments")

@router.get("/gst/gstr1", response_model=GSTR1Summary)
async def get_gstr1_summary(
    from_date: date = Query(..., description="Start date for GSTR-1 report"),
    to_date: date = Query(..., description="End date for GSTR-1 report"),
    db: Session = Depends(get_db),
    org_id: UUID = UUID(DEFAULT_ORG_ID)
):
    """
    Generate GSTR-1 summary for outward supplies
    
    - B2B supplies (with GSTIN)
    - B2C supplies (without GSTIN)
    - Tax breakup (CGST, SGST, IGST)
    """
    try:
        if to_date < from_date:
            raise HTTPException(status_code=400, detail="To date must be after from date")
        
        summary = BillingService.get_gstr1_summary(db, org_id, from_date, to_date)
        return summary
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating GSTR-1: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate GSTR-1 summary")

@router.get("/summary", response_model=InvoiceSummary)
async def get_invoice_summary(
    db: Session = Depends(get_db),
    org_id: UUID = UUID(DEFAULT_ORG_ID)
):
    """Get invoice summary for dashboard"""
    try:
        summary = BillingService.get_invoice_summary(db, org_id)
        return summary
    except Exception as e:
        logger.error(f"Error getting invoice summary: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get invoice summary")

@router.put("/invoices/{invoice_id}/cancel")
async def cancel_invoice(
    invoice_id: int,
    reason: str = Query(..., description="Reason for cancellation"),
    db: Session = Depends(get_db),
    org_id: UUID = UUID(DEFAULT_ORG_ID)
):
    """Cancel an invoice (only if not paid)"""
    try:
        from sqlalchemy import text
        
        # Check invoice status
        result = db.execute(text("""
            SELECT org_id, invoice_status, paid_amount
            FROM sales.invoices 
            WHERE invoice_id = :invoice_id
        """), {"invoice_id": invoice_id}).fetchone()
        
        if not result:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        if result.org_id != org_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        if result.paid_amount > 0:
            raise HTTPException(status_code=400, detail="Cannot cancel invoice with payments")
        
        if result.invoice_status == "cancelled":
            raise HTTPException(status_code=400, detail="Invoice already cancelled")
        
        # Cancel invoice
        db.execute(text("""
            UPDATE sales.invoices
            SET invoice_status = 'cancelled',
                notes = COALESCE(notes, '') || E'\\nCancelled: ' || :reason,
                updated_at = CURRENT_TIMESTAMP
            WHERE invoice_id = :invoice_id
        """), {
            "invoice_id": invoice_id,
            "reason": reason
        })
        
        db.commit()
        
        return {"message": "Invoice cancelled successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error cancelling invoice: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to cancel invoice")

@router.get("/invoices/{invoice_id}/print")
async def get_printable_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    org_id: UUID = UUID(DEFAULT_ORG_ID)
):
    """
    Get invoice data formatted for printing
    Returns complete invoice data with organization details
    """
    try:
        from sqlalchemy import text
        
        # Get invoice with organization details
        result = db.execute(text("""
            SELECT i.*, o.org_name, o.address as org_address,
                   o.city as org_city, o.state as org_state,
                   o.pincode as org_pincode, o.gstin as org_gstin,
                   o.phone as org_phone, o.email as org_email
            FROM sales.invoices i
            JOIN organizations o ON i.org_id = o.org_id
            WHERE i.invoice_id = :invoice_id
                AND i.org_id = :org_id
        """), {
            "invoice_id": invoice_id,
            "org_id": org_id
        }).fetchone()
        
        if not result:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        invoice = BillingService.get_invoice(db, invoice_id)
        
        # Add organization details
        invoice_dict = invoice.dict()
        invoice_dict["organization"] = {
            "name": result.org_name,
            "address": result.org_address,
            "city": result.org_city,
            "state": result.org_state,
            "pincode": result.org_pincode,
            "gstin": result.org_gstin,
            "phone": result.org_phone,
            "email": result.org_email
        }
        
        return invoice_dict
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting printable invoice: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get printable invoice")