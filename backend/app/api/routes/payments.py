"""
Payment management endpoints
Handles invoice payments, tracking, and reconciliation
"""
from typing import Optional, List
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel, Field
import logging

from ...database import get_db
from ...services.payment_service import PaymentService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])

# Default organization ID (should come from auth in production)
DEFAULT_ORG_ID = "12de5e22-eee7-4d25-b3a7-d16d01c6170f"


class PaymentCreate(BaseModel):
    """Schema for recording a payment"""
    invoice_id: int
    payment_date: date = Field(default_factory=date.today)
    payment_mode: str = Field(..., pattern="^(cash|cheque|online|card|upi|neft|rtgs)$")
    amount: Decimal = Field(..., gt=0)
    transaction_reference: Optional[str] = None
    bank_name: Optional[str] = None
    cheque_number: Optional[str] = None
    cheque_date: Optional[date] = None
    notes: Optional[str] = None


class GeneralPaymentCreate(BaseModel):
    """Schema for creating a general payment (advance or against multiple invoices)"""
    org_id: str = Field(default=DEFAULT_ORG_ID)
    payment_number: Optional[str] = None
    payment_date: date = Field(default_factory=date.today)
    customer_id: Optional[int] = None
    supplier_id: Optional[int] = None
    payment_type: str = Field(..., pattern="^(advance_payment|invoice_payment|regular_payment|adjustment_entry)$")
    amount: Decimal = Field(..., gt=0)
    payment_mode: str = Field(..., pattern="^(cash|cheque|upi|bank_transfer|credit_adjustment)$")
    reference_number: Optional[str] = None
    bank_name: Optional[str] = None
    payment_status: str = Field(default="completed")
    cleared_date: Optional[date] = None
    branch_id: Optional[int] = None
    created_by: Optional[int] = None
    approved_by: Optional[int] = None
    notes: Optional[str] = None


class PaymentResponse(BaseModel):
    """Schema for payment response"""
    payment_id: int
    payment_reference: str
    invoice_id: int
    amount: Decimal
    balance_amount: Decimal
    payment_status: str
    message: str


class PaymentListResponse(BaseModel):
    """Schema for payment list"""
    payments: List[dict]
    total: int


class PaymentSummaryResponse(BaseModel):
    """Schema for payment summary"""
    total_payments: int
    invoices_paid: int
    total_collected: Decimal
    payment_modes: dict
    pending: dict


@router.post("/", response_model=dict)
async def create_payment(
    payment: GeneralPaymentCreate,
    db: Session = Depends(get_db)
):
    """
    Create a general payment (advance payment, invoice payment, or adjustment)
    
    - Supports advance payments without specific invoice
    - Handles multiple payment modes
    - Creates proper payment records in payments table
    """
    try:
        # Generate payment number if not provided
        if not payment.payment_number:
            payment.payment_number = f"PAY-{payment.payment_date.strftime('%Y%m%d')}-{payment.customer_id or payment.supplier_id or 'ADV'}-{int(date.today().timestamp())}"
        
        # Prepare payment data for database using CORRECT column names
        payment_data = {
            'org_id': payment.org_id,  # FIXED: Using org_id not organization_id
            'payment_number': payment.payment_number,
            'payment_date': payment.payment_date,
            'customer_id': payment.customer_id,
            'supplier_id': payment.supplier_id,
            'payment_type': payment.payment_type,
            'amount': payment.amount,
            'payment_mode': payment.payment_mode,
            'reference_number': payment.reference_number,
            'bank_name': payment.bank_name,
            'payment_status': payment.payment_status,
            'cleared_date': payment.cleared_date,
            'branch_id': payment.branch_id,
            'created_by': payment.created_by,
            'approved_by': payment.approved_by,
            'notes': payment.notes
        }
        
        # Insert into payments table
        insert_query = """
            INSERT INTO payments (
                org_id, payment_number, payment_date, customer_id, supplier_id,
                payment_type, amount, payment_mode, reference_number, bank_name,
                payment_status, cleared_date, branch_id, created_by, approved_by, notes
            ) VALUES (
                :org_id, :payment_number, :payment_date, :customer_id, :supplier_id,
                :payment_type, :amount, :payment_mode, :reference_number, :bank_name,
                :payment_status, :cleared_date, :branch_id, :created_by, :approved_by, :notes
            ) RETURNING payment_id, payment_number, amount, payment_status
        """
        
        result = db.execute(text(insert_query), payment_data).fetchone()
        db.commit()
        
        return {
            "message": "Payment created successfully",
            "data": {
                "payment_id": result.payment_id,
                "payment_number": result.payment_number,
                "amount": float(result.amount),
                "status": result.payment_status
            }
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating payment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create payment: {str(e)}")


@router.post("/record", response_model=PaymentResponse)
async def record_payment(
    payment: PaymentCreate,
    db: Session = Depends(get_db)
):
    """
    Record a payment against an invoice
    
    - Validates payment amount against balance
    - Updates invoice payment status
    - Creates payment history record
    """
    try:
        result = PaymentService.record_payment(db, payment.invoice_id, payment.dict())
        db.commit()
        return PaymentResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        logger.error(f"Error recording payment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to record payment: {str(e)}")


@router.get("/invoice/{invoice_id}", response_model=PaymentListResponse)
async def get_invoice_payments(
    invoice_id: int,
    db: Session = Depends(get_db)
):
    """Get all payments for a specific invoice"""
    try:
        payments = PaymentService.get_invoice_payments(db, invoice_id)
        return PaymentListResponse(payments=payments, total=len(payments))
    except Exception as e:
        logger.error(f"Error getting invoice payments: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve payments")


@router.get("/summary", response_model=PaymentSummaryResponse)
async def get_payment_summary(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Get payment summary and analytics
    
    - Total collections by payment mode
    - Pending payment amounts
    - Payment trends
    """
    try:
        summary = PaymentService.get_payment_summary(
            db, DEFAULT_ORG_ID, from_date, to_date
        )
        return PaymentSummaryResponse(**summary)
    except Exception as e:
        logger.error(f"Error getting payment summary: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get payment summary")


@router.put("/{payment_id}/cancel")
async def cancel_payment(
    payment_id: int,
    reason: str = Query(..., description="Cancellation reason"),
    db: Session = Depends(get_db)
):
    """
    Cancel a payment
    
    - Reverses the payment amount from invoice
    - Updates payment status to cancelled
    - Maintains audit trail
    """
    try:
        result = PaymentService.cancel_payment(db, payment_id, reason)
        db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        logger.error(f"Error cancelling payment: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to cancel payment")


@router.get("/outstanding")
async def get_outstanding_invoices(
    customer_id: Optional[int] = None,
    overdue_only: bool = False,
    db: Session = Depends(get_db)
):
    """
    Get list of outstanding invoices
    
    - Filter by customer
    - Option to show only overdue invoices
    - Includes aging analysis
    """
    try:
        query = """
            SELECT 
                i.invoice_id, i.invoice_number, i.invoice_date, i.due_date,
                c.customer_id, c.customer_name, c.customer_code,
                i.total_amount, 
                COALESCE(i.paid_amount, 0) as paid_amount, 
                (i.total_amount - COALESCE(i.paid_amount, 0)) as balance_amount,
                i.payment_status,
                CASE 
                    WHEN i.due_date < CURRENT_DATE THEN 
                        CURRENT_DATE - i.due_date 
                    ELSE 0 
                END as days_overdue
            FROM invoices i
            JOIN customers c ON i.customer_id = c.customer_id
            WHERE i.org_id = :org_id
                AND i.payment_status IN ('unpaid', 'partial')
        """
        
        params = {"org_id": DEFAULT_ORG_ID}
        
        if customer_id:
            query += " AND c.customer_id = :customer_id"
            params["customer_id"] = customer_id
        
        if overdue_only:
            query += " AND i.due_date < CURRENT_DATE"
        
        query += " ORDER BY i.due_date, i.invoice_date"
        
        result = db.execute(text(query), params)
        invoices = [dict(row._mapping) for row in result]
        
        # Calculate summary
        total_outstanding = sum(inv["balance_amount"] for inv in invoices)
        total_overdue = sum(inv["balance_amount"] for inv in invoices if inv["days_overdue"] > 0)
        
        return {
            "invoices": invoices,
            "summary": {
                "total_invoices": len(invoices),
                "total_outstanding": total_outstanding,
                "total_overdue": total_overdue,
                "overdue_invoices": len([inv for inv in invoices if inv["days_overdue"] > 0])
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting outstanding invoices: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get outstanding invoices")