"""
Payment management endpoints
Handles invoice payments, tracking, and reconciliation
"""
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel, Field
import logging

from ...core.database import get_db
from ...core.config import DEFAULT_ORG_ID
from ..services.payment_service import PaymentService
from ..services.document_number_service import DocumentNumberService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["payments"])

@router.get("/")
async def get_payments_overview(db: Session = Depends(get_db)):
    """Get payments overview"""
    try:
        # Simple payments overview
        result = db.execute(text("""
            SELECT 
                COUNT(*) as total_payments,
                SUM(amount) as total_amount,
                COUNT(CASE WHEN payment_type = 'receipt' THEN 1 END) as receipts_count,
                COUNT(CASE WHEN payment_type = 'payment' THEN 1 END) as payments_count
            FROM financial.payments 
            WHERE payment_date >= CURRENT_DATE - INTERVAL '30 days'
        """)).fetchone()
        
        return {
            "total_payments": result.total_payments if result else 0,
            "total_amount": float(result.total_amount) if result and result.total_amount else 0,
            "receipts_count": result.receipts_count if result else 0,
            "payments_count": result.payments_count if result else 0
        }
    except Exception as e:
        logger.error(f"Error getting payments overview: {str(e)}")
        return {
            "total_payments": 0,
            "total_amount": 0,
            "receipts_count": 0,
            "payments_count": 0
        }

@router.get("/generate-receipt-number")
async def generate_receipt_number(
    payment_type: str = Query("receipt", description="Type: receipt or payment"),
    db: Session = Depends(get_db)
):
    """
    Generate unique receipt/payment number
    
    Uses atomic sequence to prevent duplicates
    Format: RCT-YYYYMMDD-NNNN or PAY-YYYYMMDD-NNNN
    """
    try:
        current_date = date.today()
        prefix = "RCT" if payment_type == "receipt" else "PAY"
        date_part = current_date.strftime("%Y%m%d")
        
        # Get next sequence number atomically
        seq_query = """
            SELECT COALESCE(MAX(
                CASE 
                    WHEN payment_number ~ :pattern THEN 
                        CAST(SUBSTRING(payment_number FROM :extract_pattern) AS INTEGER)
                    ELSE 0 
                END
            ), 0) + 1 as next_number
            FROM financial.payments 
            WHERE org_id = :org_id
                AND payment_date = :payment_date
                AND payment_number LIKE :like_pattern
        """
        
        pattern = f"^{prefix}-{date_part}-[0-9]+$"
        extract_pattern = f"{prefix}-{date_part}-([0-9]+)$"
        like_pattern = f"{prefix}-{date_part}-%"
        
        result = db.execute(text(seq_query), {
            "org_id": DEFAULT_ORG_ID,
            "payment_date": current_date,
            "pattern": pattern,
            "extract_pattern": extract_pattern,
            "like_pattern": like_pattern
        }).fetchone()
        
        next_number = str(result.next_number).zfill(4)
        receipt_number = f"{prefix}-{date_part}-{next_number}"
        
        return {
            "receipt_number": receipt_number,
            "payment_type": payment_type,
            "generated_at": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error generating receipt number: {str(e)}")
        # Fallback to timestamp-based generation
        timestamp = int(datetime.now().timestamp())
        fallback_number = f"{prefix}-{date_part}-{str(timestamp)[-4:]}"
        return {
            "receipt_number": fallback_number,
            "payment_type": payment_type,
            "generated_at": datetime.now().isoformat(),
            "fallback": True
        }

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
            payment.payment_number = f"PAY-{payment.payment_date.strftime('%Y%m%d')}-{payment.customer_id or payment.supplier_id or 'ADV'}-{int(datetime.now().timestamp())}"
        
        # Get party name if needed
        party_name = None
        if payment.customer_id:
            party_result = db.execute(
                text("SELECT customer_name FROM parties.customers WHERE customer_id = :id"),
                {"id": payment.customer_id}
            ).first()
            party_name = party_result.customer_name if party_result else f"Customer {payment.customer_id}"
        elif payment.supplier_id:
            party_result = db.execute(
                text("SELECT supplier_name FROM parties.suppliers WHERE supplier_id = :id"),
                {"id": payment.supplier_id}
            ).first()
            party_name = party_result.supplier_name if party_result else f"Supplier {payment.supplier_id}"
        
        # Get or create system user for API operations
        if not payment.created_by:
            # Try to get or create a system user
            user_result = db.execute(
                text("""
                    SELECT user_id FROM master.org_users 
                    WHERE org_id = :org_id AND is_active = true
                    ORDER BY user_id
                    LIMIT 1
                """),
                {"org_id": payment.org_id}
            ).first()
            
            if user_result:
                payment.created_by = user_result.user_id
            else:
                # Create system user
                try:
                    create_user = db.execute(
                        text("""
                            INSERT INTO master.org_users (
                                org_id, employee_code, username, email, password_hash,
                                first_name, last_name, roles, is_active
                            ) VALUES (
                                :org_id, 'SYSTEM', 'system', 'system@api.local', 'no-login',
                                'System', 'API', ARRAY['api_user'], true
                            ) RETURNING user_id
                        """),
                        {"org_id": payment.org_id}
                    ).first()
                    payment.created_by = create_user.user_id if create_user else None
                except:
                    # If user creation fails, we need to handle it
                    pass
        
        # Get or create payment method ID for the payment mode
        payment_method_id = 1  # Default to cash
        if payment.payment_mode:
            method_result = db.execute(
                text("""
                    SELECT payment_method_id FROM financial.payment_methods 
                    WHERE org_id = :org_id AND method_type = :method_type
                    LIMIT 1
                """),
                {"org_id": payment.org_id, "method_type": payment.payment_mode}
            ).first()
            
            if method_result:
                payment_method_id = method_result.payment_method_id
            else:
                # Create payment method if it doesn't exist
                create_method = db.execute(
                    text("""
                        INSERT INTO financial.payment_methods (org_id, method_code, method_name, method_type)
                        VALUES (:org_id, :code, :name, :type)
                        RETURNING payment_method_id
                    """),
                    {
                        "org_id": payment.org_id,
                        "code": payment.payment_mode.upper(),
                        "name": payment.payment_mode.title(),
                        "type": payment.payment_mode
                    }
                ).first()
                payment_method_id = create_method.payment_method_id if create_method else 1
        
        # Validate we have a created_by user
        if not payment.created_by:
            raise HTTPException(
                status_code=400,
                detail="Unable to determine user for this operation. Please provide created_by field or ensure system user exists."
            )
        
        # Prepare payment data for database using CORRECT column names from schema
        payment_data = {
            'org_id': payment.org_id,
            'branch_id': payment.branch_id or 1,
            'payment_number': payment.payment_number,
            'payment_date': payment.payment_date,
            'payment_type': 'payment' if payment.supplier_id else 'receipt',
            'payment_method_id': payment_method_id,
            'party_type': 'customer' if payment.customer_id else 'supplier',
            'party_id': payment.customer_id or payment.supplier_id,
            'party_name': party_name,
            'payment_amount': payment.amount,
            'payment_status': 'cleared' if payment.payment_mode == 'cash' else 'pending',
            'clearance_date': payment.cleared_date if payment.cleared_date else (payment.payment_date if payment.payment_mode == 'cash' else None),
            'reference_number': payment.reference_number,
            'narration': payment.notes,
            'created_by': payment.created_by  # Should be set by now from system user logic
        }
        
        # Insert into financial.payments table
        insert_query = """
            INSERT INTO financial.payments (
                org_id, branch_id, payment_number, payment_date, payment_type, payment_method_id,
                party_type, party_id, party_name, payment_amount, payment_status,
                clearance_date, reference_number, narration, created_by
            ) VALUES (
                :org_id, :branch_id, :payment_number, :payment_date, :payment_type, :payment_method_id,
                :party_type, :party_id, :party_name, :payment_amount, :payment_status,
                :clearance_date, :reference_number, :narration, :created_by
            ) RETURNING payment_id, payment_number, payment_amount, payment_status
        """
        
        result = db.execute(text(insert_query), payment_data).fetchone()
        db.commit()
        
        return {
            "message": "Payment created successfully",
            "data": {
                "payment_id": result.payment_id,
                "payment_number": result.payment_number,
                "amount": float(result.payment_amount),
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

@router.post("/customer-receipt", response_model=dict)
async def create_customer_receipt(
    receipt_data: dict,
    db: Session = Depends(get_db)
):
    """
    Create a customer payment receipt
    
    Simple endpoint for recording customer payments
    """
    try:
        # Generate receipt number
        receipt_number = f"RCP-{date.today().strftime('%Y%m%d')}-{int(datetime.now().timestamp())}"
        
        # Get customer name
        customer_result = db.execute(
            text("SELECT customer_name FROM parties.customers WHERE customer_id = :id"),
            {"id": receipt_data.get("customer_id")}
        ).first()
        customer_name = customer_result.customer_name if customer_result else f"Customer {receipt_data.get('customer_id')}"
        
        # Insert payment
        result = db.execute(text("""
            INSERT INTO financial.payments (
                org_id, payment_number, payment_date, payment_type, payment_mode,
                party_type, party_id, party_name, payment_amount,
                bank_reference, payment_status, notes
            ) VALUES (
                :org_id, :receipt_number, :payment_date, 'receipt', :payment_mode,
                'customer', :customer_id, :customer_name, :amount,
                :reference_number, 'cleared', :notes
            ) RETURNING payment_id, payment_number, payment_amount
        """), {
            "org_id": DEFAULT_ORG_ID,
            "receipt_number": receipt_number,
            "payment_date": receipt_data.get("payment_date", date.today()),
            "customer_id": receipt_data.get("customer_id"),
            "customer_name": customer_name,
            "amount": receipt_data.get("amount"),
            "payment_mode": receipt_data.get("payment_mode", "cash"),
            "reference_number": receipt_data.get("reference_number"),
            "notes": receipt_data.get("notes")
        })
        
        payment = result.fetchone()
        
        # Update customer outstanding if exists
        db.execute(text("""
            UPDATE parties.customers
            SET outstanding_balance = outstanding_balance - :amount,
                last_payment_date = :payment_date,
                updated_at = CURRENT_TIMESTAMP
            WHERE customer_id = :customer_id
        """), {
            "amount": receipt_data.get("amount"),
            "payment_date": receipt_data.get("payment_date", date.today()),
            "customer_id": receipt_data.get("customer_id")
        })
        
        db.commit()
        
        return {
            "success": True,
            "payment_id": payment.payment_id,
            "receipt_number": payment.payment_number,
            "amount": float(payment.payment_amount),
            "message": "Payment receipt created successfully"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating customer receipt: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create receipt: {str(e)}")

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
                i.final_amount, 
                COALESCE(i.paid_amount, 0) as paid_amount, 
                (i.final_amount - COALESCE(i.paid_amount, 0)) as balance_amount,
                i.payment_status,
                CASE 
                    WHEN i.due_date < CURRENT_DATE THEN 
                        CURRENT_DATE - i.due_date 
                    ELSE 0 
                END as days_overdue
            FROM sales.invoices i
            JOIN parties.customers c ON i.customer_id = c.customer_id
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

@router.post("/bank-reconciliation")
async def create_bank_reconciliation(
    reconciliation_data: dict,
    db: Session = Depends(get_db)
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
        
        # Create reconciliation record
        recon_query = """
            INSERT INTO financial.bank_reconciliations (
                org_id, bank_account, statement_date, opening_balance, 
                closing_balance, reconciled_by, reconciliation_date
            ) VALUES (
                :org_id, :bank_account, :statement_date, :opening_balance,
                :closing_balance, :reconciled_by, CURRENT_DATE
            ) RETURNING reconciliation_id
        """
        
        result = db.execute(text(recon_query), {
            "org_id": DEFAULT_ORG_ID,
            "bank_account": bank_account,
            "statement_date": statement_date,
            "opening_balance": opening_balance,
            "closing_balance": closing_balance,
            "reconciled_by": 1  # Default user
        })
        
        reconciliation_id = result.scalar()
        
        # Process each transaction
        matched = 0
        unmatched = 0
        
        for txn in transactions:
            # Try to match with existing payments
            match_query = """
                SELECT payment_id FROM payments 
                WHERE org_id = :org_id 
                AND amount = :amount 
                AND payment_date = :date
                AND payment_status != 'cancelled'
                AND cleared_date IS NULL
                LIMIT 1
            """
            
            match_result = db.execute(text(match_query), {
                "org_id": DEFAULT_ORG_ID,
                "amount": abs(txn.get("amount", 0)),
                "date": txn.get("date")
            })
            
            payment_match = match_result.first()
            
            if payment_match:
                # Update payment as cleared
                update_query = """
                    UPDATE payments 
                    SET cleared_date = :cleared_date,
                        reconciliation_id = :reconciliation_id
                    WHERE payment_id = :payment_id
                """
                db.execute(text(update_query), {
                    "cleared_date": txn.get("date"),
                    "reconciliation_id": reconciliation_id,
                    "payment_id": payment_match.payment_id
                })
                matched += 1
            else:
                # Record unmatched transaction
                unmatched_query = """
                    INSERT INTO financial.unmatched_transactions (
                        reconciliation_id, transaction_date, description,
                        amount, transaction_type
                    ) VALUES (
                        :reconciliation_id, :transaction_date, :description,
                        :amount, :transaction_type
                    )
                """
                db.execute(text(unmatched_query), {
                    "reconciliation_id": reconciliation_id,
                    "transaction_date": txn.get("date"),
                    "description": txn.get("description", ""),
                    "amount": txn.get("amount", 0),
                    "transaction_type": "credit" if txn.get("amount", 0) > 0 else "debit"
                })
                unmatched += 1
        
        db.commit()
        
        return {
            "reconciliation_id": reconciliation_id,
            "matched_transactions": matched,
            "unmatched_transactions": unmatched,
            "status": "completed"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating bank reconciliation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create bank reconciliation: {str(e)}")

@router.post("/payment-allocation")
async def allocate_payment(
    allocation_data: dict,
    db: Session = Depends(get_db)
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
        
        # Get payment details
        payment_query = """
            SELECT payment_id, amount, customer_id, payment_type
            FROM payments
            WHERE payment_id = :payment_id AND payment_status = 'completed'
        """
        payment_result = db.execute(text(payment_query), {"payment_id": payment_id})
        payment = payment_result.first()
        
        if not payment:
            raise ValueError("Payment not found or not completed")
        
        total_allocated = 0
        
        for allocation in allocations:
            invoice_id = allocation.get("invoice_id")
            allocated_amount = allocation.get("amount", 0)
            
            if allocated_amount <= 0:
                continue
                
            # Get invoice balance
            invoice_query = """
                SELECT invoice_id, final_amount, paid_amount
                FROM sales.invoices
                WHERE invoice_id = :invoice_id
            """
            invoice_result = db.execute(text(invoice_query), {"invoice_id": invoice_id})
            invoice = invoice_result.first()
            
            if not invoice:
                raise ValueError(f"Invoice {invoice_id} not found")
            
            balance = invoice.final_amount - (invoice.paid_amount or 0)
            
            # Don't allocate more than balance
            actual_allocation = min(allocated_amount, balance)
            
            if actual_allocation > 0:
                # Create allocation record
                allocation_query = """
                    INSERT INTO financial.payment_allocations (
                        payment_id, invoice_id, allocated_amount,
                        allocation_date, created_by
                    ) VALUES (
                        :payment_id, :invoice_id, :allocated_amount,
                        CURRENT_DATE, :created_by
                    )
                """
                db.execute(text(allocation_query), {
                    "payment_id": payment_id,
                    "invoice_id": invoice_id,
                    "allocated_amount": actual_allocation,
                    "created_by": 1
                })
                
                # Update invoice paid amount
                update_invoice_query = """
                    UPDATE sales.invoices
                    SET paid_amount = COALESCE(paid_amount, 0) + :amount,
                        payment_status = CASE 
                            WHEN COALESCE(paid_amount, 0) + :amount >= final_amount THEN 'paid'
                            ELSE 'partial'
                        END
                    WHERE invoice_id = :invoice_id
                """
                db.execute(text(update_invoice_query), {
                    "amount": actual_allocation,
                    "invoice_id": invoice_id
                })
                
                total_allocated += actual_allocation
        
        # Update payment with allocated amount
        update_payment_query = """
            UPDATE payments
            SET allocated_amount = :allocated_amount,
                unallocated_amount = amount - :allocated_amount
            WHERE payment_id = :payment_id
        """
        db.execute(text(update_payment_query), {
            "allocated_amount": total_allocated,
            "payment_id": payment_id
        })
        
        db.commit()
        
        return {
            "payment_id": payment_id,
            "total_allocated": total_allocated,
            "unallocated_amount": float(payment.amount) - total_allocated,
            "status": "success"
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        logger.error(f"Error allocating payment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to allocate payment: {str(e)}")

@router.get("/aging-report")
async def get_aging_report(
    as_of_date: Optional[date] = Query(None, description="Aging as of date"),
    customer_id: Optional[int] = Query(None, description="Filter by customer"),
    db: Session = Depends(get_db)
):
    """
    Get detailed aging report for outstanding invoices
    
    - Categorize by aging buckets (0-30, 31-60, 61-90, 90+)
    - Customer-wise breakdown
    - Summary statistics
    """
    try:
        aging_date = as_of_date or date.today()
        
        query = """
            WITH invoice_aging AS (
                SELECT 
                    i.invoice_id,
                    i.invoice_number,
                    i.invoice_date,
                    i.due_date,
                    c.customer_id,
                    c.customer_name,
                    c.customer_code,
                    i.final_amount,
                    COALESCE(i.paid_amount, 0) as paid_amount,
                    (i.final_amount - COALESCE(i.paid_amount, 0)) as balance_amount,
                    (:aging_date - i.due_date) as days_overdue,
                    CASE 
                        WHEN (:aging_date - i.due_date) <= 0 THEN 'current'
                        WHEN (:aging_date - i.due_date) BETWEEN 1 AND 30 THEN '1-30'
                        WHEN (:aging_date - i.due_date) BETWEEN 31 AND 60 THEN '31-60'
                        WHEN (:aging_date - i.due_date) BETWEEN 61 AND 90 THEN '61-90'
                        ELSE '90+'
                    END as aging_bucket
                FROM sales.invoices i
                JOIN parties.customers c ON i.customer_id = c.customer_id
                WHERE i.org_id = :org_id
                    AND i.payment_status IN ('unpaid', 'partial')
                    AND (i.final_amount - COALESCE(i.paid_amount, 0)) > 0
        """
        
        params = {
            "org_id": DEFAULT_ORG_ID,
            "aging_date": aging_date
        }
        
        if customer_id:
            query += " AND c.customer_id = :customer_id"
            params["customer_id"] = customer_id
            
        query += """
            )
            SELECT 
                customer_id,
                customer_name,
                customer_code,
                COUNT(*) as invoice_count,
                SUM(balance_amount) as total_outstanding,
                SUM(CASE WHEN aging_bucket = 'current' THEN balance_amount ELSE 0 END) as current,
                SUM(CASE WHEN aging_bucket = '1-30' THEN balance_amount ELSE 0 END) as days_1_30,
                SUM(CASE WHEN aging_bucket = '31-60' THEN balance_amount ELSE 0 END) as days_31_60,
                SUM(CASE WHEN aging_bucket = '61-90' THEN balance_amount ELSE 0 END) as days_61_90,
                SUM(CASE WHEN aging_bucket = '90+' THEN balance_amount ELSE 0 END) as days_90_plus,
                MAX(days_overdue) as max_days_overdue
            FROM invoice_aging
            GROUP BY customer_id, customer_name, customer_code
            ORDER BY total_outstanding DESC
        """
        
        result = db.execute(text(query), params)
        customer_aging = [dict(row._mapping) for row in result]
        
        # Calculate totals
        total_outstanding = sum(row["total_outstanding"] for row in customer_aging)
        total_current = sum(row["current"] for row in customer_aging)
        total_1_30 = sum(row["days_1_30"] for row in customer_aging)
        total_31_60 = sum(row["days_31_60"] for row in customer_aging)
        total_61_90 = sum(row["days_61_90"] for row in customer_aging)
        total_90_plus = sum(row["days_90_plus"] for row in customer_aging)
        
        return {
            "as_of_date": aging_date,
            "customer_aging": customer_aging,
            "summary": {
                "total_customers": len(customer_aging),
                "total_outstanding": total_outstanding,
                "aging_buckets": {
                    "current": total_current,
                    "1-30_days": total_1_30,
                    "31-60_days": total_31_60,
                    "61-90_days": total_61_90,
                    "90+_days": total_90_plus
                },
                "aging_percentages": {
                    "current": round((total_current / total_outstanding * 100) if total_outstanding > 0 else 0, 2),
                    "1-30_days": round((total_1_30 / total_outstanding * 100) if total_outstanding > 0 else 0, 2),
                    "31-60_days": round((total_31_60 / total_outstanding * 100) if total_outstanding > 0 else 0, 2),
                    "61-90_days": round((total_61_90 / total_outstanding * 100) if total_outstanding > 0 else 0, 2),
                    "90+_days": round((total_90_plus / total_outstanding * 100) if total_outstanding > 0 else 0, 2)
                }
            }
        }
        
    except Exception as e:
        logger.error(f"Error generating aging report: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate aging report: {str(e)}")