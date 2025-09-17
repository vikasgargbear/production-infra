"""
Customer Outstanding with Net Position
Shows true outstanding considering advance payments
"""
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

from ...core.database import get_db
from ...core.auth_utils import get_org_id_from_header

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/customer-outstanding", tags=["customer-outstanding"])

@router.get("/net-position")
async def get_customer_net_position(
    customer_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get customer net position including advances
    Returns both outstanding invoices and advance payments
    """
    try:
        if customer_id:
            # Single customer net position
            result = db.execute(
                text("""
                    WITH invoice_summary AS (
                        SELECT
                            customer_id,
                            COUNT(*) as invoice_count,
                            SUM(final_amount) as total_invoiced,
                            SUM(COALESCE(paid_amount, 0)) as total_paid,
                            SUM(final_amount - COALESCE(paid_amount, 0)) as outstanding_amount,
                            COUNT(*) FILTER (WHERE payment_status != 'paid') as unpaid_count
                        FROM sales.invoices
                        WHERE customer_id = :customer_id
                        AND org_id = :org_id
                        AND invoice_status != 'cancelled'
                        GROUP BY customer_id
                    ),
                    payment_summary AS (
                        SELECT
                            party_id as customer_id,
                            COUNT(*) as payment_count,
                            SUM(payment_amount) as total_payments,
                            SUM(COALESCE(allocated_amount, 0)) as total_allocated,
                            SUM(COALESCE(unallocated_amount, 0)) as advance_amount
                        FROM financial.payments
                        WHERE party_id = :customer_id
                        AND party_type = 'customer'
                        AND org_id = :org_id
                        AND payment_status != 'cancelled'
                        GROUP BY party_id
                    )
                    SELECT
                        c.customer_id,
                        c.customer_name,
                        c.primary_phone,
                        COALESCE(i.invoice_count, 0) as invoice_count,
                        COALESCE(i.total_invoiced, 0) as total_invoiced,
                        COALESCE(i.total_paid, 0) as total_paid,
                        COALESCE(i.outstanding_amount, 0) as outstanding_amount,
                        COALESCE(i.unpaid_count, 0) as unpaid_invoice_count,
                        COALESCE(p.payment_count, 0) as payment_count,
                        COALESCE(p.total_payments, 0) as total_payments,
                        COALESCE(p.advance_amount, 0) as advance_amount,
                        (COALESCE(p.advance_amount, 0) - COALESCE(i.outstanding_amount, 0)) as net_balance
                    FROM parties.customers c
                    LEFT JOIN invoice_summary i ON c.customer_id = i.customer_id
                    LEFT JOIN payment_summary p ON c.customer_id = p.customer_id
                    WHERE c.customer_id = :customer_id
                    AND c.org_id = :org_id
                """),
                {"customer_id": customer_id, "org_id": org_id}
            ).fetchone()

            if result:
                return {
                    "customer_id": result.customer_id,
                    "customer_name": result.customer_name,
                    "phone": result.primary_phone,
                    "invoices": {
                        "count": result.invoice_count,
                        "total": float(result.total_invoiced),
                        "paid": float(result.total_paid),
                        "outstanding": float(result.outstanding_amount),
                        "unpaid_count": result.unpaid_invoice_count
                    },
                    "payments": {
                        "count": result.payment_count,
                        "total": float(result.total_payments),
                        "advance": float(result.advance_amount)
                    },
                    "net_position": {
                        "amount": float(result.net_balance),
                        "type": "credit" if result.net_balance >= 0 else "debit",
                        "display": f"₹{abs(float(result.net_balance)):,.2f} {'Advance' if result.net_balance >= 0 else 'Outstanding'}"
                    }
                }

        else:
            # All customers net position
            results = db.execute(
                text("""
                    WITH invoice_summary AS (
                        SELECT
                            customer_id,
                            SUM(final_amount - COALESCE(paid_amount, 0)) as outstanding_amount,
                            COUNT(*) FILTER (WHERE payment_status != 'paid') as unpaid_count
                        FROM sales.invoices
                        WHERE org_id = :org_id
                        AND invoice_status != 'cancelled'
                        GROUP BY customer_id
                    ),
                    payment_summary AS (
                        SELECT
                            party_id as customer_id,
                            SUM(COALESCE(unallocated_amount, 0)) as advance_amount
                        FROM financial.payments
                        WHERE party_type = 'customer'
                        AND org_id = :org_id
                        AND payment_status != 'cancelled'
                        GROUP BY party_id
                    )
                    SELECT
                        c.customer_id,
                        c.customer_name,
                        c.primary_phone,
                        COALESCE(i.outstanding_amount, 0) as outstanding,
                        COALESCE(i.unpaid_count, 0) as unpaid_invoices,
                        COALESCE(p.advance_amount, 0) as advance,
                        (COALESCE(p.advance_amount, 0) - COALESCE(i.outstanding_amount, 0)) as net_balance
                    FROM parties.customers c
                    LEFT JOIN invoice_summary i ON c.customer_id = i.customer_id
                    LEFT JOIN payment_summary p ON c.customer_id = p.customer_id
                    WHERE c.org_id = :org_id
                    AND c.status = 'active'
                    AND (i.outstanding_amount > 0 OR p.advance_amount > 0)
                    ORDER BY ABS(COALESCE(p.advance_amount, 0) - COALESCE(i.outstanding_amount, 0)) DESC
                """),
                {"org_id": org_id}
            ).fetchall()

            customers = []
            for row in results:
                net = float(row.net_balance)
                customers.append({
                    "customer_id": row.customer_id,
                    "customer_name": row.customer_name,
                    "phone": row.primary_phone,
                    "outstanding": float(row.outstanding),
                    "advance": float(row.advance),
                    "net_balance": net,
                    "net_type": "credit" if net >= 0 else "debit",
                    "unpaid_invoices": row.unpaid_invoices
                })

            # Calculate totals
            total_outstanding = sum(c["outstanding"] for c in customers)
            total_advance = sum(c["advance"] for c in customers)
            net_total = total_advance - total_outstanding

            return {
                "customers": customers,
                "summary": {
                    "customer_count": len(customers),
                    "total_outstanding": total_outstanding,
                    "total_advance": total_advance,
                    "net_position": net_total,
                    "net_type": "credit" if net_total >= 0 else "debit"
                }
            }

    except Exception as e:
        logger.error(f"Error getting net position: {e}")
        return {
            "error": str(e),
            "customers": [],
            "summary": {}
        }