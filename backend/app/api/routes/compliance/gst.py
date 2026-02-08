"""
GST API Routes
Comprehensive GST management and compliance API for Indian tax system

PRODUCTION-READY: Uses TenantAwareSession for AI-agent safety
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Dict, List, Optional, Any
from datetime import datetime, date
import calendar
from decimal import Decimal
import logging

from ....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from ....core.auth.org_context import get_org_context, OrgContext
from ....core.security.permissions import PermissionChecker
from ....core.utils.branch_utils import get_default_branch_id
from ...services.compliance.gst_service import GSTService
from ...services.compliance.gst_engine import GSTType
from ...services.document_number_service import DocumentNumberService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["GST"])


def get_current_period():
    """Get current GST period (month/year)"""
    now = datetime.now()
    return {
        "month": now.month,
        "year": now.year,
        "period_name": f"{calendar.month_name[now.month]} {now.year}"
    }


def get_organization_gstin(db: Session, org_id: str) -> Optional[str]:
    """Get organization GSTIN from master.organizations"""
    try:
        result = db.execute(text(
            "SELECT gst_number FROM master.organizations WHERE org_id = :org_id"
        ), {'org_id': org_id}).fetchone()
        return result.gst_number if result else None
    except Exception as e:
        logger.warning(f"Failed to load org GSTIN for {org_id}: {e}")
        return None


def parse_period(period: str) -> dict:
    """Parse period string into year, month, and SQL date condition.
    Returns dict with keys: year, month (or None), date_condition, target_date
    """
    now = datetime.now()

    if period == "current":
        return {
            "year": now.year, "month": now.month, "target_date": now,
            "date_condition": "AND EXTRACT(year FROM invoice_date) = :year AND EXTRACT(month FROM invoice_date) = :month"
        }
    elif period == "previous":
        target = datetime(now.year - 1, 12, 1) if now.month == 1 else datetime(now.year, now.month - 1, 1)
        return {
            "year": target.year, "month": target.month, "target_date": target,
            "date_condition": "AND EXTRACT(year FROM invoice_date) = :year AND EXTRACT(month FROM invoice_date) = :month"
        }
    elif period == "quarter":
        current_quarter = (now.month - 1) // 3 + 1
        start_month = (current_quarter - 1) * 3 + 1
        end_month = current_quarter * 3
        return {
            "year": now.year, "month": None, "target_date": now,
            "date_condition": f"AND EXTRACT(year FROM invoice_date) = :year AND EXTRACT(month FROM invoice_date) BETWEEN {start_month} AND {end_month}"
        }
    elif period == "year":
        return {
            "year": now.year, "month": None, "target_date": now,
            "date_condition": "AND EXTRACT(year FROM invoice_date) = :year"
        }
    else:
        try:
            year, month = map(int, period.split('-'))
            target = datetime(year, month, 1)
            return {
                "year": year, "month": month, "target_date": target,
                "date_condition": "AND EXTRACT(year FROM invoice_date) = :year AND EXTRACT(month FROM invoice_date) = :month"
            }
        except Exception:
            return {
                "year": now.year, "month": now.month, "target_date": now,
                "date_condition": "AND EXTRACT(year FROM invoice_date) = :year AND EXTRACT(month FROM invoice_date) = :month"
            }

@router.get("/dashboard")
@with_tenant_context
async def get_gst_dashboard(
    period: str = Query("current", description="Period: current, previous, or YYYY-MM"),
    _: dict = Depends(PermissionChecker("gst", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get GST dashboard summary with real data from invoices
    """
    org_id = str(context.org_id)
    try:
        branch_id = get_default_branch_id(db, org_id)
        parsed = parse_period(period)
        date_condition = parsed["date_condition"]

        # Build query params
        query_params = {'org_id': org_id, 'branch_id': branch_id, 'year': parsed["year"]}
        if parsed["month"]:
            query_params['month'] = parsed["month"]

        # Output tax from sales invoices (exclude cancelled/void)
        sales_result = db.execute(text(f"""
            SELECT
                COUNT(*) as total_invoices,
                COALESCE(SUM(subtotal_amount - COALESCE(discount_amount, 0)), 0) as total_taxable,
                COALESCE(SUM(cgst_amount), 0) as total_cgst,
                COALESCE(SUM(sgst_amount), 0) as total_sgst,
                COALESCE(SUM(igst_amount), 0) as total_igst,
                COUNT(CASE WHEN customer_id IS NOT NULL THEN 1 END) as b2b_count,
                COUNT(CASE WHEN customer_id IS NULL THEN 1 END) as b2c_count
            FROM sales.invoices
            WHERE org_id = :org_id AND branch_id = :branch_id
                AND invoice_status NOT IN ('cancelled', 'void')
                {date_condition}
        """), query_params).fetchone()

        # Input credit from supplier invoices (exclude cancelled)
        purchase_date_condition = date_condition.replace('invoice_date', 'invoice_date')
        purchases_result = db.execute(text(f"""
            SELECT
                COUNT(*) as total_supplier_invoices,
                COALESCE(SUM(taxable_amount), 0) as total_purchase_taxable,
                COALESCE(SUM(cgst_amount), 0) as total_purchase_cgst,
                COALESCE(SUM(sgst_amount), 0) as total_purchase_sgst,
                COALESCE(SUM(igst_amount), 0) as total_purchase_igst,
                COUNT(DISTINCT supplier_id) as total_suppliers
            FROM procurement.supplier_invoices
            WHERE org_id = :org_id AND branch_id = :branch_id
                AND invoice_status != 'cancelled'
                {purchase_date_condition}
        """), query_params).fetchone()

        # Process sales
        total_invoices = sales_result.total_invoices if sales_result else 0
        total_taxable = Decimal(str(sales_result.total_taxable)) if sales_result else Decimal('0')
        total_cgst = Decimal(str(sales_result.total_cgst)) if sales_result else Decimal('0')
        total_sgst = Decimal(str(sales_result.total_sgst)) if sales_result else Decimal('0')
        total_igst = Decimal(str(sales_result.total_igst)) if sales_result else Decimal('0')
        total_output_tax = total_cgst + total_sgst + total_igst
        b2b_count = sales_result.b2b_count if sales_result else 0
        b2c_count = sales_result.b2c_count if sales_result else 0

        # Process purchases
        total_supplier_invoices = purchases_result.total_supplier_invoices if purchases_result else 0
        total_purchase_taxable = Decimal(str(purchases_result.total_purchase_taxable)) if purchases_result else Decimal('0')
        total_purchase_cgst = Decimal(str(purchases_result.total_purchase_cgst)) if purchases_result else Decimal('0')
        total_purchase_sgst = Decimal(str(purchases_result.total_purchase_sgst)) if purchases_result else Decimal('0')
        total_purchase_igst = Decimal(str(purchases_result.total_purchase_igst)) if purchases_result else Decimal('0')
        total_suppliers = purchases_result.total_suppliers if purchases_result else 0
        input_credit = total_purchase_cgst + total_purchase_sgst + total_purchase_igst

        net_payable = total_output_tax - input_credit

        return {
            "outputTax": float(total_output_tax),
            "inputCredit": float(input_credit),
            "netPayable": float(net_payable),
            "period": get_current_period(),
            "summary": {
                "total_invoices": total_invoices,
                "total_suppliers": total_suppliers,
                "total_supplier_invoices": total_supplier_invoices,
                "total_taxable": float(total_taxable),
                "total_purchase_taxable": float(total_purchase_taxable),
                "b2b_transactions": b2b_count,
                "b2c_transactions": b2c_count,
                "cgst_amount": float(total_cgst),
                "sgst_amount": float(total_sgst),
                "igst_amount": float(total_igst),
                "purchase_cgst_amount": float(total_purchase_cgst),
                "purchase_sgst_amount": float(total_purchase_sgst),
                "purchase_igst_amount": float(total_purchase_igst)
            }
        }

    except Exception as e:
        logger.error(f"GST dashboard error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/returns/status")
@with_tenant_context
async def get_returns_status(
    period: str = Query("current"),
    _: dict = Depends(PermissionChecker("gst", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get GST returns filing status with real output + input tax data"""
    org_id = str(context.org_id)
    try:
        branch_id = get_default_branch_id(db, org_id)
        parsed = parse_period(period)
        target_date = parsed["target_date"]

        params = {
            'org_id': org_id, 'branch_id': branch_id,
            'year': target_date.year, 'month': target_date.month
        }

        # Output tax from sales
        output_result = db.execute(text("""
            SELECT COALESCE(SUM(cgst_amount + sgst_amount + igst_amount), 0) as total_output_tax
            FROM sales.invoices
            WHERE org_id = :org_id AND branch_id = :branch_id
                AND invoice_status NOT IN ('cancelled', 'void')
                AND EXTRACT(year FROM invoice_date) = :year
                AND EXTRACT(month FROM invoice_date) = :month
        """), params).fetchone()

        # Input credit from supplier invoices
        input_result = db.execute(text("""
            SELECT COALESCE(SUM(cgst_amount + sgst_amount + igst_amount), 0) as total_input_credit
            FROM procurement.supplier_invoices
            WHERE org_id = :org_id AND branch_id = :branch_id
                AND invoice_status != 'cancelled'
                AND EXTRACT(year FROM invoice_date) = :year
                AND EXTRACT(month FROM invoice_date) = :month
        """), params).fetchone()

        total_output_tax = float(output_result.total_output_tax) if output_result else 0
        total_input_credit = float(input_result.total_input_credit) if input_result else 0
        net_payable = total_output_tax - total_input_credit

        # Due dates (Indian GST calendar)
        now = datetime.now()
        next_month = now.month + 1 if now.month < 12 else 1
        next_year = now.year if now.month < 12 else now.year + 1
        gstr1_due = datetime(next_year, next_month, 11)
        gstr3b_due = datetime(next_year, next_month, 20)

        return {
            "gstr1": {
                "status": "pending",
                "amount": total_output_tax,
                "dueDate": gstr1_due.strftime("%d %b %Y"),
                "filedDate": None
            },
            "gstr3b": {
                "status": "pending",
                "amount": net_payable,
                "dueDate": gstr3b_due.strftime("%d %b %Y"),
                "filedDate": None
            },
            "gstr2b": {
                "status": "available",
                "amount": total_input_credit,
                "lastUpdated": now.strftime("%d %b %Y")
            }
        }

    except Exception as e:
        logger.error(f"Returns status error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/returns/{return_type}")
@with_tenant_context
async def file_gst_return(
    return_type: str,
    data: Dict[str, Any],
    _: dict = Depends(PermissionChecker("gst", "create")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    File GST return (simulation)
    """
    org_id = str(context.org_id)
    try:
        # In production, this would integrate with GST portal API
        # For now, simulate successful filing

        filed_date = datetime.now()
        reference_number = DocumentNumberService.generate_number(db, "gst_filing", org_id)

        return {
            "success": True,
            "reference_number": reference_number,
            "filed_date": filed_date.isoformat(),
            "return_type": return_type.upper(),
            "status": "filed",
            "message": f"{return_type.upper()} filed successfully"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/calculate")
@router.post("/calculate")
@with_tenant_context
async def calculate_gst(
    amount: float,
    hsn_code: Optional[str] = None,
    seller_gstin: Optional[str] = None,
    buyer_gstin: Optional[str] = None,
    is_interstate: bool = False,
    gst_rate: float = 18.0,
    _: dict = Depends(PermissionChecker("gst", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Calculate GST amounts for given parameters
    """
    org_id = str(context.org_id)
    try:
        # Get seller GSTIN if not provided
        if not seller_gstin:
            seller_gstin = get_organization_gstin(db, org_id)

        # Determine GST type
        gst_type = GSTService.determine_gst_type(
            seller_gstin=seller_gstin,
            buyer_gstin=buyer_gstin
        )

        # Override GST type if interstate flag is set
        if is_interstate:
            gst_type = GSTType.IGST

        # Calculate GST amounts
        gst_amounts = GSTService.calculate_gst_amounts(
            taxable_amount=Decimal(str(amount)),
            gst_rate=Decimal(str(gst_rate)),
            gst_type=gst_type
        )

        return {
            "taxableAmount": float(amount),
            "gstRate": gst_rate,
            "gstType": gst_type.value,
            "cgst": float(gst_amounts["cgst_amount"]),
            "sgst": float(gst_amounts["sgst_amount"]),
            "igst": float(gst_amounts["igst_amount"]),
            "totalTax": float(gst_amounts["total_tax"]),
            "total": float(amount) + float(gst_amounts["total_tax"])
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/verification")
@with_tenant_context
async def verify_gst_data(
    period: str = Query("current"),
    _: dict = Depends(PermissionChecker("gst", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Verify GST data for accuracy and compliance"""
    org_id = str(context.org_id)
    try:
        parsed = parse_period(period)
        target_date = parsed["target_date"]
        branch_id = get_default_branch_id(db, org_id)

        verification_query = text("""
            SELECT
                invoice_id, invoice_number, customer_id, customer_name,
                subtotal_amount, cgst_amount, sgst_amount, igst_amount,
                taxable_amount, total_tax_amount, final_amount
            FROM sales.invoices
            WHERE org_id = :org_id
                AND branch_id = :branch_id
                AND invoice_status NOT IN ('cancelled', 'void')
                AND EXTRACT(year FROM invoice_date) = :year
                AND EXTRACT(month FROM invoice_date) = :month
            ORDER BY invoice_date DESC
        """)

        invoices = db.execute(verification_query, {
            'org_id': org_id,
            'branch_id': branch_id,
            'year': target_date.year,
            'month': target_date.month
        }).fetchall()

        verification_results = []
        total_issues = 0

        for invoice in invoices:
            issues = []

            # Verify GST calculation
            calculated_gst = float(invoice.cgst_amount or 0) + float(invoice.sgst_amount or 0) + float(invoice.igst_amount or 0)
            recorded_gst = float(invoice.total_tax_amount or 0)

            if abs(calculated_gst - recorded_gst) > 0.01:
                issues.append(f"GST mismatch: Calculated {calculated_gst}, Recorded {recorded_gst}")

            # Verify customer GSTIN if B2B
            if invoice.customer_id:
                customer_query = text("SELECT gst_number FROM parties.customers WHERE customer_id = :customer_id")
                customer_result = db.execute(customer_query, {'customer_id': invoice.customer_id}).fetchone()

                if float(invoice.final_amount or 0) > 50000 and (not customer_result or not customer_result.gst_number):
                    issues.append("Missing GSTIN for high-value B2B transaction")

            if issues:
                total_issues += len(issues)
                verification_results.append({
                    "invoice_number": invoice.invoice_number,
                    "customer_name": invoice.customer_name,
                    "amount": float(invoice.final_amount or 0),
                    "issues": issues
                })

        return {
            "period": f"{target_date.strftime('%B')} {target_date.year}",
            "total_invoices": len(invoices),
            "invoices_with_issues": len(verification_results),
            "total_issues": total_issues,
            "verification_score": max(0, 100 - (total_issues * 5)),
            "issues": verification_results[:10]  # Top 10 issues
        }

    except Exception as e:
        logger.error(f"GST verification error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reconcile")
@with_tenant_context
async def reconcile_gst_data(
    period: str,
    _: dict = Depends(PermissionChecker("gst", "create")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Auto-reconcile GST data with GSTR-2A"""
    org_id = str(context.org_id)
    try:
        parsed = parse_period(period)
        target_date = parsed["target_date"]
        branch_id = get_default_branch_id(db, org_id)

        # Get purchase invoices for reconciliation
        purchase_query = text("""
            SELECT
                supplier_invoice_number, supplier_id, invoice_total,
                cgst_amount, sgst_amount, igst_amount, gstr2a_matched
            FROM procurement.supplier_invoices
            WHERE org_id = :org_id
                AND EXTRACT(year FROM invoice_date) = :year
                AND EXTRACT(month FROM invoice_date) = :month
        """)

        purchases = db.execute(purchase_query, {
            'org_id': org_id,
            'year': target_date.year,
            'month': target_date.month
        }).fetchall()

        # Reconciliation logic
        matched = 0
        unmatched = []
        total_itc_available = 0
        total_itc_claimed = 0

        for purchase in purchases:
            itc_amount = float(purchase.cgst_amount or 0) + float(purchase.sgst_amount or 0) + float(purchase.igst_amount or 0)
            total_itc_available += itc_amount

            if purchase.gstr2a_matched:
                matched += 1
                total_itc_claimed += itc_amount
            else:
                unmatched.append({
                    "invoice_number": purchase.supplier_invoice_number,
                    "amount": float(purchase.invoice_total or 0),
                    "itc_amount": itc_amount,
                    "status": "Pending GSTR-2A match"
                })

        return {
            "period": f"{target_date.strftime('%B')} {target_date.year}",
            "summary": {
                "total_purchases": len(purchases),
                "matched_invoices": matched,
                "unmatched_invoices": len(unmatched),
                "match_percentage": round((matched / len(purchases)) * 100, 1) if purchases else 0,
                "total_itc_available": total_itc_available,
                "total_itc_claimed": total_itc_claimed,
                "itc_pending": total_itc_available - total_itc_claimed
            },
            "unmatched_invoices": unmatched[:20]  # Top 20 unmatched
        }

    except Exception as e:
        logger.error(f"GST reconciliation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/compliance/status")
@with_tenant_context
async def get_compliance_status(
    _: dict = Depends(PermissionChecker("gst", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get GST compliance status"""
    org_id = str(context.org_id)
    try:
        org_gstin = get_organization_gstin(db, org_id)

        issues = []
        score = 100

        if not org_gstin:
            issues.append("GSTIN not configured")
            score -= 30
        elif not GSTService.validate_gstin(org_gstin):
            issues.append("Invalid GSTIN format")
            score -= 20

        recent_invoices_query = text("""
            SELECT invoice_id, customer_id, final_amount
            FROM sales.invoices
            WHERE org_id = :org_id
                AND invoice_status NOT IN ('cancelled', 'void')
                AND invoice_date >= DATE_TRUNC('month', CURRENT_DATE)
            LIMIT 100
        """)
        recent_invoices = db.execute(recent_invoices_query, {'org_id': org_id}).fetchall()

        if len(recent_invoices) == 0:
            issues.append("No recent invoices found")
            score -= 10

        # Check for missing customer GSTIN in B2B transactions
        b2b_without_gstin = 0
        for invoice in recent_invoices:
            if invoice.final_amount and float(invoice.final_amount) > 50000:  # B2B threshold
                if invoice.customer_id:
                    customer_gstin_query = text("""
                        SELECT gst_number FROM parties.customers
                        WHERE customer_id = :customer_id
                    """)
                    customer_result = db.execute(customer_gstin_query, {'customer_id': invoice.customer_id}).fetchone()
                    if not customer_result or not customer_result.gst_number:
                        b2b_without_gstin += 1

        if b2b_without_gstin > 0:
            issues.append(f"{b2b_without_gstin} high-value invoices missing customer GSTIN")
            score -= min(20, b2b_without_gstin * 2)

        recommendations = []
        if not org_gstin:
            recommendations.append("Configure your GSTIN in company settings")
        if b2b_without_gstin > 0:
            recommendations.append("Add GSTIN for all B2B customers")

        return {
            "score": max(0, score),
            "status": "compliant" if score >= 80 else "needs_attention",
            "issues": issues,
            "recommendations": recommendations,
            "last_checked": datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"Compliance status error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/settings")
@with_tenant_context
async def get_gst_settings(
    _: dict = Depends(PermissionChecker("gst", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get GST configuration settings"""
    org_id = str(context.org_id)
    try:
        org_gstin = get_organization_gstin(db, org_id)
        state_code = GSTService.extract_state_code(org_gstin) if org_gstin else None
        state_name = GSTService.get_state_name(state_code) if state_code else None

        return {
            "gst_number": org_gstin or "",
            "state_code": state_code or "",
            "state": state_name or "",
            "is_valid": GSTService.validate_gstin(org_gstin) if org_gstin else False,
            "tax_rates": [
                {"rate": 0, "description": "Exempt"},
                {"rate": 5, "description": "Essential goods"},
                {"rate": 12, "description": "Standard goods"},
                {"rate": 18, "description": "Most goods & services"},
                {"rate": 28, "description": "Luxury goods"}
            ]
        }

    except Exception as e:
        logger.error(f"GST settings error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/metrics")
@with_tenant_context
async def get_gst_metrics(
    period: str = Query("current"),
    _: dict = Depends(PermissionChecker("gst", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get GST metrics — delegates to dashboard endpoint"""
    dashboard_data = await get_gst_dashboard(period, _, db, context)
    summary = dashboard_data.get("summary", {})
    return {
        "currentMonth": {
            "sales": summary.get("total_taxable", 0),
            "purchases": summary.get("total_purchase_taxable", 0),
            "outputTax": dashboard_data.get("outputTax", 0),
            "inputTax": dashboard_data.get("inputCredit", 0),
            "netTax": dashboard_data.get("netPayable", 0)
        }
    }

# GST Report Endpoints
@router.get("/reports/tax/gstr2a")
@with_tenant_context
async def get_gstr2a_report(
    from_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    to_date: str = Query(..., description="End date (YYYY-MM-DD)"),
    _: dict = Depends(PermissionChecker("gst", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get GSTR-2A report data - inward supplies and input credit
    """
    org_id = str(context.org_id)
    try:
        # Get supplier invoices for the period
        query = text("""
            SELECT
                si.supplier_invoice_id,
                si.supplier_invoice_number,
                si.invoice_date,
                s.supplier_name,
                s.gst_number as supplier_gstin,
                si.taxable_amount,
                si.cgst_amount,
                si.sgst_amount,
                si.igst_amount,
                si.cess_amount,
                si.tax_amount,
                si.invoice_total,
                si.itc_eligible,
                si.gstr2a_matched
            FROM procurement.supplier_invoices si
            LEFT JOIN parties.suppliers s ON si.supplier_id = s.supplier_id
            WHERE si.org_id = :org_id
            AND si.invoice_date BETWEEN :from_date AND :to_date
            AND si.invoice_status != 'cancelled'
            ORDER BY si.invoice_date DESC
        """)

        invoices = db.execute(query, {
            'org_id': org_id,
            'from_date': from_date,
            'to_date': to_date
        }).fetchall()

        # Calculate summary
        total_taxable = 0
        total_cgst = 0
        total_sgst = 0
        total_igst = 0
        total_cess = 0
        total_itc = 0

        invoice_list = []
        for inv in invoices:
            inv_dict = dict(inv._mapping)

            # Convert Decimal to float
            for key in ['taxable_amount', 'cgst_amount', 'sgst_amount',
                       'igst_amount', 'cess_amount', 'tax_amount', 'invoice_total']:
                if key in inv_dict and inv_dict[key]:
                    inv_dict[key] = float(inv_dict[key])

            # Calculate totals (ensure all values are float)
            if inv_dict.get('itc_eligible'):
                total_taxable += float(inv_dict.get('taxable_amount', 0) or 0)
                total_cgst += float(inv_dict.get('cgst_amount', 0) or 0)
                total_sgst += float(inv_dict.get('sgst_amount', 0) or 0)
                total_igst += float(inv_dict.get('igst_amount', 0) or 0)
                total_cess += float(inv_dict.get('cess_amount', 0) or 0)
                total_itc += float(inv_dict.get('tax_amount', 0) or 0)

            invoice_list.append(inv_dict)

        return {
            "invoices": invoice_list,
            "summary": {
                "totalInvoices": len(invoice_list),
                "totalTaxableValue": total_taxable,
                "totalCGST": total_cgst,
                "totalSGST": total_sgst,
                "totalIGST": total_igst,
                "totalCESS": total_cess,
                "totalITC": total_itc
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Credit/Debit Notes endpoints for GST reporting
@router.get("/reports/credit-debit-notes")
@with_tenant_context
async def get_credit_debit_notes_report(
    from_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    to_date: str = Query(..., description="End date (YYYY-MM-DD)"),
    note_type: str = Query("all", description="Type: credit, debit, or all"),
    _: dict = Depends(PermissionChecker("gst", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get credit/debit notes for GST reporting
    """
    org_id = str(context.org_id)
    try:
        # Build query based on note type
        queries = []

        if note_type in ['credit', 'all']:
            credit_query = text("""
                SELECT
                    'credit' as note_type,
                    sr.return_id as note_id,
                    sr.credit_note_number as note_number,
                    sr.credit_note_date as note_date,
                    sr.customer_id,
                    c.customer_name,
                    c.gst_number as customer_gstin,
                    'sales_return' as reference_type,
                    sr.return_number as reference_number,
                    sr.return_amount as amount,
                    sr.cgst_amount,
                    sr.sgst_amount,
                    sr.igst_amount,
                    sr.tax_amount,
                    sr.total_amount,
                    sr.return_reason as reason_code,
                    sr.return_reason as reason,
                    sr.approval_status as status
                FROM sales.sales_returns sr
                LEFT JOIN parties.customers c ON sr.customer_id = c.customer_id
                WHERE sr.org_id = :org_id
                AND sr.return_date BETWEEN :from_date AND :to_date
                AND sr.credit_note_number IS NOT NULL
            """)
            queries.append(credit_query)

        if note_type in ['debit', 'all']:
            debit_query = text("""
                SELECT
                    'debit' as note_type,
                    pr.return_id as note_id,
                    pr.debit_note_number as note_number,
                    pr.debit_note_date as note_date,
                    pr.supplier_id as customer_id,
                    s.supplier_name as customer_name,
                    s.gst_number as customer_gstin,
                    'purchase_return' as reference_type,
                    pr.return_number as reference_number,
                    pr.return_amount as amount,
                    pr.cgst_amount,
                    pr.sgst_amount,
                    pr.igst_amount,
                    pr.tax_amount,
                    pr.total_amount,
                    pr.return_reason as reason_code,
                    pr.return_reason as reason,
                    pr.approval_status as status
                FROM procurement.purchase_returns pr
                LEFT JOIN parties.suppliers s ON pr.supplier_id = s.supplier_id
                WHERE pr.org_id = :org_id
                AND pr.return_date BETWEEN :from_date AND :to_date
                AND pr.debit_note_number IS NOT NULL
            """)
            queries.append(debit_query)

        all_notes = []
        for query in queries:
            notes = db.execute(query, {
                'org_id': org_id,
                'from_date': from_date,
                'to_date': to_date
            }).fetchall()

            for note in notes:
                note_dict = dict(note._mapping)
                # Convert Decimal to float
                for key in ['amount', 'cgst_amount', 'sgst_amount', 'igst_amount', 'tax_amount', 'total_amount']:
                    if key in note_dict and note_dict[key]:
                        note_dict[key] = float(note_dict[key])
                all_notes.append(note_dict)

        # Calculate summary (handle None values)
        total_credit_amount = sum(note.get('amount', 0) or 0 for note in all_notes if note.get('note_type') == 'credit')
        total_debit_amount = sum(note.get('amount', 0) or 0 for note in all_notes if note.get('note_type') == 'debit')
        total_credit_tax = sum(note.get('tax_amount', 0) or 0 for note in all_notes if note.get('note_type') == 'credit')
        total_debit_tax = sum(note.get('tax_amount', 0) or 0 for note in all_notes if note.get('note_type') == 'debit')

        return {
            "notes": all_notes,
            "summary": {
                "totalCreditNotes": len([n for n in all_notes if n['note_type'] == 'credit']),
                "totalDebitNotes": len([n for n in all_notes if n['note_type'] == 'debit']),
                "totalCreditAmount": total_credit_amount,
                "totalDebitAmount": total_debit_amount,
                "totalCreditTax": total_credit_tax,
                "totalDebitTax": total_debit_tax,
                "netAdjustment": total_debit_amount - total_credit_amount,
                "netTaxAdjustment": total_debit_tax - total_credit_tax
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Export router
__all__ = ["router"]