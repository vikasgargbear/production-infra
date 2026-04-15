"""
Payment management endpoints
Handles invoice payments, tracking, and reconciliation

MODERNIZED: Uses centralized schemas from schemas/billing.py
"""
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel, Field
import logging

# Removed: get_db - using TenantAwareSession instead
# Removed: get_org_id_from_header - using tenant service instead
from .....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from .....core.auth.org_context import get_org_context, OrgContext
from .....core.security.permissions import PermissionChecker  # RBAC
from .....core.utils.constants import PaymentStatus, PaymentRecordStatus, PaymentMethod, PartyType
from ....services.finance.payment.service import PaymentService
from ....services.document_number_service import DocumentNumberService
from ....schemas.sales.billing import (
    GeneralPaymentCreate, InvoicePaymentCreate, 
    PaymentListResponse, PaymentSummaryResponse, PaymentResponse
)

logger = logging.getLogger(__name__)
# Fixed notification trigger issues - Jan 15, 2025

router = APIRouter(tags=["payments"])

@router.get("/")
@with_tenant_context
async def get_payments_overview(
    _: dict = Depends(PermissionChecker("sales", "view")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get payments overview"""
    try:
        # Use PaymentService instead of inline SQL
        return PaymentService.get_overview(db)
    except Exception as e:
        logger.error(f"Error getting payments overview: {str(e)}")
        return {
            "total_payments": 0,
            "total_amount": 0,
            "receipts_count": 0,
            "payments_count": 0
        }


# ========================================
# MISSING ENDPOINTS (Frontend expects these)
# ========================================

@router.get("/search")
@with_tenant_context
async def search_payments(
    q: Optional[str] = Query(None, description="Search query"),
    party_id: Optional[int] = None,
    party_type: Optional[str] = None,
    payment_mode: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = Query(50, le=100),
    offset: int = 0,
    _: dict = Depends(PermissionChecker("sales", "view")),
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Search payments with filters"""
    try:
        # Use PaymentService instead of inline SQL
        return PaymentService.search_payments(
            db=db,
            q=q,
            party_id=party_id,
            party_type=party_type,
            payment_mode=payment_mode,
            date_from=date_from,
            date_to=date_to,
            limit=limit,
            offset=offset
        )
    except Exception as e:
        logger.error(f"Error searching payments: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to search payments")


@router.get("/pending")
@with_tenant_context
async def get_pending_payments(
    party_type: Optional[str] = Query(None, description="customer or supplier"),
    party_id: Optional[int] = None,
    _: dict = Depends(PermissionChecker("sales", "view")),
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get pending/uncleared payments"""
    try:
        # Use PaymentService instead of inline SQL
        return PaymentService.get_pending_payments(
            db=db,
            party_type=party_type,
            party_id=party_id
        )
    except Exception as e:
        logger.error(f"Error getting pending payments: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get pending payments")


@router.get("/methods")
@with_tenant_context
async def get_payment_methods(
    _: dict = Depends(PermissionChecker("sales", "view")),
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get available payment methods"""
    try:
        # Use PaymentService instead of inline SQL
        return PaymentService.get_payment_methods(db)
    except Exception as e:
        logger.error(f"Error getting payment methods: {str(e)}")
        # Return default methods on error
        return {"methods": [
            {"method_type": "cash", "method_name": "Cash"},
            {"method_type": "cheque", "method_name": "Cheque"},
            {"method_type": "upi", "method_name": "UPI"},
            {"method_type": "neft", "method_name": "NEFT/RTGS"}
        ]}


@router.get("/outstanding")
@with_tenant_context
async def get_outstanding_invoices(
    customer_id: Optional[int] = None,
    overdue_only: bool = False,
    _: dict = Depends(PermissionChecker("sales", "view")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Get list of outstanding invoices

    - Filter by customer
    - Option to show only overdue invoices
    - Includes aging analysis
    """
    try:
        # Use service method for all outstanding invoice logic
        return PaymentService.get_outstanding_invoices(
            db=db,
            org_id=str(context.org_id),
            customer_id=customer_id,
            overdue_only=overdue_only
        )

    except Exception as e:
        logger.error(f"Error getting outstanding invoices: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get outstanding invoices")


@router.get("/generate-receipt-number")
@with_tenant_context
async def generate_receipt_number(
    payment_type: str = Query("receipt", description="Type: receipt or payment"),
    _: dict = Depends(PermissionChecker("sales", "view")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Generate unique receipt/payment number
    
    Uses atomic sequence to prevent duplicates
    Format: RCT-YYYYMMDD-NNNN or PAY-YYYYMMDD-NNNN
    """
    try:
        # Use centralized DocumentNumberService via service method
        return PaymentService.generate_receipt_sequence(
            db=db,
            payment_type=payment_type,
            org_id=str(context.org_id)
        )
        
    except Exception as e:
        logger.error(f"Error generating receipt number: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate receipt number: {str(e)}")

# Note: Schema classes moved to schemas/billing.py
# - GeneralPaymentCreate
# - InvoicePaymentCreate (was PaymentCreate)
# - PaymentListResponse
# - PaymentSummaryResponse
# - PaymentResponse

@router.post("/", response_model=dict)
@with_tenant_context
async def create_payment(
    payment: GeneralPaymentCreate,
    _: dict = Depends(PermissionChecker("sales", "create")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Create a general payment (advance payment, invoice payment, or adjustment)
    
    - Supports advance payments without specific invoice
    - Handles multiple payment modes
    - Creates proper payment records in payments table
    """
    try:
        # Use org_id from context
        org_id = str(context.org_id)
        branch_id = context.primary_branch_id
        
        # Prepare payment data for service
        payment_data = {
            "payment_number": payment.payment_number,
            "payment_date": payment.payment_date,
            "customer_id": payment.customer_id,
            "supplier_id": payment.supplier_id,
            "amount": payment.amount,
            "payment_mode": payment.payment_mode,
            "reference_number": payment.reference_number,
            "notes": payment.notes,
            "cleared_date": payment.cleared_date
        }
        
        # Use service method for all payment creation logic
        result = PaymentService.create_general_payment(
            db=db,
            org_id=org_id,
            branch_id=branch_id,
            payment_data=payment_data,
            user_id=context.user_id
        )
        
        db.commit()
        
        return {
            "message": "Payment created successfully",
            "data": result
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating payment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create payment: {str(e)}")

@router.post("/record")
@with_tenant_context
async def record_payment(
    payment: InvoicePaymentCreate,
    _: dict = Depends(PermissionChecker("sales", "create")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Record a payment against an invoice
    
    - Validates payment amount against balance
    - Updates invoice payment status
    - Creates payment history record
    """
    try:
        payment_data = payment.dict()
        payment_data["created_by"] = context.user_id
        result = PaymentService.record_payment(db, payment.invoice_id, payment_data)
        db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        logger.error(f"Error recording payment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to record payment: {str(e)}")

@router.get("/invoice/{invoice_id}")
@with_tenant_context
async def get_invoice_payments(
    invoice_id: int,
    _: dict = Depends(PermissionChecker("sales", "view")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get all payments for a specific invoice"""
    try:
        payments = PaymentService.get_invoice_payments(db, invoice_id)
        return {"payments": payments, "total": len(payments)}
    except Exception as e:
        logger.error(f"Error getting invoice payments: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve payments")

@router.get("/summary", response_model=PaymentSummaryResponse)
@with_tenant_context
async def get_payment_summary(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    _: dict = Depends(PermissionChecker("sales", "view")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Get payment summary and analytics
    
    - Total collections by payment mode
    - Pending payment amounts
    - Payment trends
    """
    try:
        summary = PaymentService.get_payment_summary(
            db, context.org_id, from_date, to_date
        )
        return PaymentSummaryResponse(**summary)
    except Exception as e:
        logger.error(f"Error getting payment summary: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get payment summary")

@router.post("/{payment_id}/cancel")  # Changed from PUT to POST to match frontend
@with_tenant_context
async def cancel_payment(
    payment_id: int,
    reason: str = Query(..., description="Cancellation reason"),
    _: dict = Depends(PermissionChecker("sales", "delete")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Cancel a payment
    
    - Reverses the payment amount from invoice
    - Updates payment status to cancelled
    - Maintains audit trail with user context
    """
    try:
        result = PaymentService.cancel_payment(
            db=db, 
            payment_id=payment_id, 
            reason=reason,
            org_id=str(context.org_id),
            cancelled_by=context.user_id
        )
        db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        logger.error(f"Error cancelling payment: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to cancel payment")

@router.post("/customer-receipt", response_model=dict)
@with_tenant_context
async def create_customer_receipt(
    receipt_data: dict,
    _: dict = Depends(PermissionChecker("sales", "create")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Create a customer payment receipt
    
    Uses PaymentService for consolidated business logic.
    """
    try:
        from decimal import Decimal
        result = PaymentService.create_customer_receipt(
            db=db,
            org_id=str(context.org_id),
            customer_id=receipt_data.get("customer_id"),
            amount=Decimal(str(receipt_data.get("amount", 0))),
            payment_mode=receipt_data.get("payment_mode", "cash"),
            payment_date=receipt_data.get("payment_date"),
            reference_number=receipt_data.get("reference_number"),
            notes=receipt_data.get("notes"),
            created_by=context.user_id
        )
        db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating customer receipt: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create receipt: {str(e)}")

@router.post("/bank-reconciliation")
@with_tenant_context
async def create_bank_reconciliation(
    reconciliation_data: dict,
    _: dict = Depends(PermissionChecker("sales", "create")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Create bank reconciliation entry
    
    - Match bank statement with system records
    - Identify unmatched transactions
    - Update payment clearing status
    """
    try:
        # Extract reconciliation details
        bank_account = reconciliation_data.get("bank_account")
        statement_date = reconciliation_data.get("statement_date")
        opening_balance = reconciliation_data.get("opening_balance", 0)
        closing_balance = reconciliation_data.get("closing_balance", 0)
        transactions = reconciliation_data.get("transactions", [])
        
        # Use service method for all reconciliation logic
        result = PaymentService.process_bank_reconciliation(
            db=db,
            org_id=str(context.org_id),
            bank_account=bank_account,
            statement_date=statement_date,
            opening_balance=opening_balance,
            closing_balance=closing_balance,
            reconciled_by=context.user_id,
            transactions=transactions
        )
        
        db.commit()
        
        return result
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating bank reconciliation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create bank reconciliation: {str(e)}")

@router.post("/payment-allocation")
@with_tenant_context
async def allocate_payment(
    allocation_data: dict,
    _: dict = Depends(PermissionChecker("sales", "edit")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Allocate a payment to multiple invoices
    
    - Split payment across invoices
    - Handle advance payments
    - Update invoice payment status
    """
    try:
        payment_id = allocation_data.get("payment_id")
        allocations = allocation_data.get("allocations", [])
        
        # Use service method for all allocation logic
        result = PaymentService.allocate_payment_to_invoices(
            db=db,
            org_id=str(context.org_id),
            payment_id=payment_id,
            allocations=allocations,
            user_id=context.user_id
        )
        
        db.commit()
        
        return result
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        logger.error(f"Error allocating payment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to allocate payment: {str(e)}")

@router.get("/aging-report")
@with_tenant_context
async def get_aging_report(
    as_of_date: Optional[date] = Query(None, description="Aging as of date"),
    customer_id: Optional[int] = Query(None, description="Filter by customer"),
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Get detailed aging report for outstanding invoices
    
    - Categorize by aging buckets (0-30, 31-60, 61-90, 90+)
    - Customer-wise breakdown
    - Summary statistics
    """
    try:
        aging_date = as_of_date or date.today()
        
        # Use service method for all aging report logic
        return PaymentService.get_aging_report(
            db=db,
            aging_date=aging_date,
            customer_id=customer_id
        )
        
    except Exception as e:
        logger.error(f"Error generating aging report: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate aging report: {str(e)}")
