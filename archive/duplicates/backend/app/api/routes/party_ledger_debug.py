"""
Party Ledger Debug API - Diagnostic endpoint to check data
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

from ...core.database import get_db
from ...core.auth_utils import get_org_id_from_header

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/party-ledger-debug", tags=["party-ledger-debug"])

@router.get("/check-customer/{customer_id}")
async def check_customer_data(
    customer_id: int,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Debug endpoint to check what data exists for a customer
    """
    results = {}
    
    try:
        # 1. Check if customer exists
        customer_query = """
            SELECT customer_id, customer_name, phone_primary, gst_number
            FROM parties.customers 
            WHERE customer_id = :customer_id
        """
        customer = db.execute(text(customer_query), {"customer_id": customer_id}).fetchone()
        
        if customer:
            results["customer"] = {
                "found": True,
                "id": customer.customer_id,
                "name": customer.customer_name,
                "phone": customer.phone_primary,
                "gst": customer.gst_number
            }
        else:
            results["customer"] = {"found": False, "message": f"No customer found with ID {customer_id}"}
        
        # 2. Check invoices
        invoice_query = """
            SELECT COUNT(*) as count, 
                   MIN(invoice_date) as first_date,
                   MAX(invoice_date) as last_date,
                   SUM(final_amount) as total_amount,
                   STRING_AGG(invoice_number::text, ', ' ORDER BY invoice_date DESC LIMIT 5) as sample_numbers
            FROM sales.invoices 
            WHERE customer_id = :customer_id
        """
        invoices = db.execute(text(invoice_query), {"customer_id": customer_id}).fetchone()
        
        results["invoices"] = {
            "count": invoices.count if invoices else 0,
            "first_date": str(invoices.first_date) if invoices and invoices.first_date else None,
            "last_date": str(invoices.last_date) if invoices and invoices.last_date else None,
            "total_amount": float(invoices.total_amount) if invoices and invoices.total_amount else 0,
            "sample_numbers": invoices.sample_numbers if invoices else None
        }
        
        # 3. Get detailed invoice list
        invoice_details_query = """
            SELECT invoice_id, invoice_number, invoice_date, final_amount, payment_status, invoice_status
            FROM sales.invoices
            WHERE customer_id = :customer_id
            ORDER BY invoice_date DESC
            LIMIT 10
        """
        invoice_details = db.execute(text(invoice_details_query), {"customer_id": customer_id}).fetchall()
        
        results["invoice_details"] = [
            {
                "invoice_id": inv.invoice_id,
                "invoice_number": inv.invoice_number,
                "invoice_date": str(inv.invoice_date),
                "final_amount": float(inv.final_amount),
                "payment_status": inv.payment_status,
                "invoice_status": inv.invoice_status
            }
            for inv in invoice_details
        ]
        
        # 4. Check payments
        try:
            payment_query = """
                SELECT COUNT(*) as count,
                       SUM(amount) as total_amount
                FROM financial.payments
                WHERE party_id = :customer_id AND party_type = 'customer'
            """
            payments = db.execute(text(payment_query), {"customer_id": customer_id}).fetchone()
            
            results["payments"] = {
                "count": payments.count if payments else 0,
                "total_amount": float(payments.total_amount) if payments and payments.total_amount else 0
            }
        except Exception as e:
            results["payments"] = {"error": str(e)}
        
        # 5. Check returns
        try:
            returns_query = """
                SELECT COUNT(*) as count,
                       SUM(total_refund_amount) as total_amount
                FROM sales.sales_returns
                WHERE customer_id = :customer_id
            """
            returns = db.execute(text(returns_query), {"customer_id": customer_id}).fetchone()
            
            results["returns"] = {
                "count": returns.count if returns else 0,
                "total_amount": float(returns.total_amount) if returns and returns.total_amount else 0
            }
        except Exception as e:
            results["returns"] = {"error": str(e)}
        
        # 6. Test the actual ledger query
        try:
            ledger_query = """
                WITH ledger_entries AS (
                    SELECT 
                        invoice_id as ledger_id,
                        invoice_date as date,
                        'Invoice' as transaction_type,
                        invoice_number as reference,
                        final_amount as debit,
                        0 as credit
                    FROM sales.invoices
                    WHERE customer_id = :customer_id
                    AND invoice_status != 'cancelled'
                )
                SELECT COUNT(*) as entry_count FROM ledger_entries
            """
            ledger_test = db.execute(text(ledger_query), {"customer_id": customer_id}).fetchone()
            
            results["ledger_query_test"] = {
                "success": True,
                "entry_count": ledger_test.entry_count if ledger_test else 0
            }
        except Exception as e:
            results["ledger_query_test"] = {
                "success": False,
                "error": str(e)
            }
        
        return results
        
    except Exception as e:
        logger.error(f"Debug check error: {e}")
        return {
            "error": str(e),
            "customer_id": customer_id
        }

@router.get("/find-customer-by-name")
async def find_customer_by_name(
    name: str = Query(..., description="Customer name to search"),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Find customer ID by name
    """
    try:
        query = """
            SELECT customer_id, customer_name, phone_primary, gst_number
            FROM parties.customers
            WHERE LOWER(customer_name) LIKE LOWER(:name)
            LIMIT 10
        """
        
        customers = db.execute(text(query), {"name": f"%{name}%"}).fetchall()
        
        return {
            "search_term": name,
            "found": len(customers),
            "customers": [
                {
                    "customer_id": c.customer_id,
                    "customer_name": c.customer_name,
                    "phone": c.phone_primary,
                    "gst": c.gst_number
                }
                for c in customers
            ]
        }
        
    except Exception as e:
        return {"error": str(e), "search_term": name}