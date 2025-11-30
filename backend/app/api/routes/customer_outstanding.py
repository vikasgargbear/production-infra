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
from ...core.secure_auth import get_org_id_string  # SECURE: JWT-based auth

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/customer-outstanding", tags=["customer-outstanding"])

@router.get("/net-position")
async def get_customer_net_position(
    customer_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
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


@router.get("/collection-metrics")
async def get_collection_metrics(
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
):
    """
    Get real-time collection metrics for dashboard
    Includes daily revenue, pipeline value, risk exposure, and DSO metrics
    """
    try:
        from datetime import datetime, date, timedelta
        import uuid

        today = date.today()
        month_start = date(today.year, today.month, 1)
        thirty_days_ago = today - timedelta(days=30)
        ninety_days_ago = today - timedelta(days=90)

        # Handle org_id format - convert to UUID if needed
        if org_id and not isinstance(org_id, uuid.UUID):
            try:
                # Try to convert to UUID
                org_id_uuid = uuid.UUID(org_id)
                org_id = str(org_id_uuid)
            except (ValueError, TypeError):
                # If it's not a valid UUID, use a default org_id
                # This is for testing/development - in production you'd want proper org handling
                logger.warning(f"Invalid org_id format: {org_id}, using default")
                # Use a query to get the first org_id from master schema
                org_result = db.execute(text("SELECT org_id FROM master.organizations LIMIT 1")).fetchone()
                if org_result:
                    org_id = str(org_result.org_id)
                else:
                    # If no orgs exist, return empty metrics
                    return {
                        "success": True,
                        "metrics": {
                            "daily_revenue": 0,
                            "mtd_collections": 0,
                            "pipeline_value": 0,
                            "promised_customers": 0,
                            "high_risk_accounts": 0,
                            "risk_amount": 0,
                            "dso_days": 0,
                            "collection_efficiency": 0,
                            "collection_change": 0,
                            "total_outstanding": 0,
                            "total_overdue": 0,
                            "customers_with_outstanding": 0,
                            "customers_with_overdue": 0
                        }
                    }

        # 1. Calculate Daily Revenue (actual payments received today)
        daily_revenue_result = db.execute(
            text("""
                SELECT COALESCE(SUM(payment_amount), 0) as daily_revenue
                FROM financial.payments
                WHERE org_id = :org_id
                AND payment_date::date = :today
                AND payment_status = 'completed'
                AND party_type = 'customer'
            """),
            {"org_id": org_id, "today": today}
        ).fetchone()

        # 2. Calculate MTD (Month-to-Date) Collections
        mtd_collections_result = db.execute(
            text("""
                SELECT COALESCE(SUM(payment_amount), 0) as mtd_collections
                FROM financial.payments
                WHERE org_id = :org_id
                AND payment_date::date >= :month_start
                AND payment_date::date <= :today
                AND payment_status = 'completed'
                AND party_type = 'customer'
            """),
            {"org_id": org_id, "month_start": month_start, "today": today}
        ).fetchone()

        # 3. Calculate Pipeline Value (promised/scheduled payments)
        # Try payment_promises table first, but it might not exist
        try:
            pipeline_result = db.execute(
                text("""
                    SELECT
                        COALESCE(SUM(promise_amount), 0) as pipeline_value,
                        COUNT(DISTINCT customer_id) as promised_customers
                    FROM sales.payment_promises
                    WHERE org_id = :org_id
                    AND promise_date >= :today
                    AND promise_status IN ('pending', 'confirmed')
                """),
                {"org_id": org_id, "today": today}
            ).fetchone()
        except Exception as e:
            logger.debug(f"payment_promises table might not exist: {e}")
            pipeline_result = None

        # If payment_promises table doesn't exist or no data, use outstanding with follow-up dates
        if pipeline_result is None or (pipeline_result and pipeline_result.pipeline_value == 0):
            pipeline_result = db.execute(
                text("""
                    SELECT
                        COALESCE(SUM(i.credit_amount), 0) * 0.4 as pipeline_value,
                        COUNT(DISTINCT i.customer_id) as promised_customers
                    FROM sales.invoices i
                    WHERE i.org_id = :org_id
                    AND i.payment_status IN ('pending', 'partial')
                    AND i.due_date BETWEEN :today AND :future_date
                """),
                {"org_id": org_id, "today": today, "future_date": today + timedelta(days=7)}
            ).fetchone()

        # 4. Calculate Risk Exposure (high-risk accounts)
        risk_exposure_result = db.execute(
            text("""
                WITH overdue_accounts AS (
                    SELECT
                        customer_id,
                        SUM(credit_amount) as outstanding_amount,
                        MIN(invoice_date) as oldest_invoice,
                        MAX(CURRENT_DATE - due_date) as max_overdue_days
                    FROM sales.invoices
                    WHERE org_id = :org_id
                    AND payment_status IN ('pending', 'partial')
                    AND due_date < CURRENT_DATE
                    GROUP BY customer_id
                )
                SELECT
                    COUNT(DISTINCT customer_id) as high_risk_accounts,
                    COALESCE(SUM(outstanding_amount), 0) as risk_amount
                FROM overdue_accounts
                WHERE max_overdue_days > 90
                OR outstanding_amount > 100000
            """),
            {"org_id": org_id}
        ).fetchone()

        # 5. Calculate DSO (Days Sales Outstanding) and Collection Efficiency
        dso_result = db.execute(
            text("""
                WITH sales_data AS (
                    SELECT
                        AVG(final_amount) as avg_daily_sales,
                        SUM(credit_amount) as total_receivables
                    FROM sales.invoices
                    WHERE org_id = :org_id
                    AND invoice_date >= :thirty_days_ago
                    AND payment_status IN ('pending', 'partial', 'paid')
                ),
                collection_data AS (
                    SELECT
                        SUM(payment_amount) as collected_amount
                    FROM financial.payments
                    WHERE org_id = :org_id
                    AND payment_date >= :thirty_days_ago
                    AND party_type = 'customer'
                    AND payment_status = 'completed'
                )
                SELECT
                    CASE
                        WHEN sd.avg_daily_sales > 0
                        THEN ROUND((sd.total_receivables / (sd.avg_daily_sales * 30))::numeric, 0)
                        ELSE 0
                    END as dso_days,
                    CASE
                        WHEN sd.total_receivables > 0
                        THEN ROUND((cd.collected_amount / sd.total_receivables * 100)::numeric, 1)
                        ELSE 0
                    END as collection_efficiency
                FROM sales_data sd, collection_data cd
            """),
            {"org_id": org_id, "thirty_days_ago": thirty_days_ago}
        ).fetchone()

        # 6. Calculate collection trend (compare with previous period)
        previous_period_result = db.execute(
            text("""
                SELECT COALESCE(SUM(payment_amount), 0) as previous_collections
                FROM financial.payments
                WHERE org_id = :org_id
                AND payment_date::date >= :prev_start
                AND payment_date::date < :prev_end
                AND payment_status = 'completed'
                AND party_type = 'customer'
            """),
            {
                "org_id": org_id,
                "prev_start": thirty_days_ago - timedelta(days=30),
                "prev_end": thirty_days_ago
            }
        ).fetchone()

        current_collections = float(mtd_collections_result.mtd_collections if mtd_collections_result else 0)
        previous_collections = float(previous_period_result.previous_collections if previous_period_result else 1)

        collection_change = 0
        if previous_collections > 0:
            collection_change = round(((current_collections - previous_collections) / previous_collections) * 100, 1)

        # 7. Get total outstanding and overdue amounts
        outstanding_result = db.execute(
            text("""
                SELECT
                    COALESCE(SUM(credit_amount), 0) as total_outstanding,
                    COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN credit_amount ELSE 0 END), 0) as total_overdue,
                    COUNT(DISTINCT customer_id) as customers_with_outstanding,
                    COUNT(DISTINCT CASE WHEN due_date < CURRENT_DATE THEN customer_id END) as customers_with_overdue
                FROM sales.invoices
                WHERE org_id = :org_id
                AND payment_status IN ('pending', 'partial')
            """),
            {"org_id": org_id}
        ).fetchone()

        return {
            "success": True,
            "metrics": {
                "daily_revenue": float(daily_revenue_result.daily_revenue if daily_revenue_result else 0),
                "mtd_collections": float(mtd_collections_result.mtd_collections if mtd_collections_result else 0),
                "pipeline_value": float(pipeline_result.pipeline_value if pipeline_result else 0),
                "promised_customers": int(pipeline_result.promised_customers if pipeline_result else 0),
                "high_risk_accounts": int(risk_exposure_result.high_risk_accounts if risk_exposure_result else 0),
                "risk_amount": float(risk_exposure_result.risk_amount if risk_exposure_result else 0),
                "dso_days": int(dso_result.dso_days if dso_result else 0),
                "collection_efficiency": float(dso_result.collection_efficiency if dso_result else 0),
                "collection_change": collection_change,
                "total_outstanding": float(outstanding_result.total_outstanding if outstanding_result else 0),
                "total_overdue": float(outstanding_result.total_overdue if outstanding_result else 0),
                "customers_with_outstanding": int(outstanding_result.customers_with_outstanding if outstanding_result else 0),
                "customers_with_overdue": int(outstanding_result.customers_with_overdue if outstanding_result else 0)
            }
        }

    except Exception as e:
        logger.error(f"Error calculating collection metrics: {e}")
        # Return mock data as fallback
        return {
            "success": False,
            "error": str(e),
            "metrics": {
                "daily_revenue": 0,
                "mtd_collections": 0,
                "pipeline_value": 0,
                "promised_customers": 0,
                "high_risk_accounts": 0,
                "risk_amount": 0,
                "dso_days": 0,
                "collection_efficiency": 0,
                "collection_change": 0,
                "total_outstanding": 0,
                "total_overdue": 0,
                "customers_with_outstanding": 0,
                "customers_with_overdue": 0
            }
        }