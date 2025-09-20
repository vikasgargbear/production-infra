"""
GST API Routes
Comprehensive GST management and compliance API for Indian tax system
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text, and_, extract, func
from typing import Dict, List, Optional, Any
from datetime import datetime, date
import calendar
from decimal import Decimal

from ...core.database import get_db
from ...utils.branch_utils import get_default_branch_id
from ...utils.org_utils import get_org_id_from_header
from ...api.services.gst_service import GSTService, GSTType
from ...models import Invoice, InvoiceItem, Customer, Company

router = APIRouter(prefix="/api/v1/gst", tags=["GST"])

def get_current_period():
    """Get current GST period (month/year)"""
    now = datetime.now()
    return {
        "month": now.month,
        "year": now.year,
        "period_name": f"{calendar.month_name[now.month]} {now.year}"
    }

def get_organization_gstin(db: Session, org_id: str) -> Optional[str]:
    """Get organization GSTIN from company settings"""
    try:
        company = db.query(Company).filter(Company.org_id == org_id).first()
        return company.gstin if company else None
    except:
        return None

@router.get("/dashboard")
async def get_gst_dashboard(
    period: str = Query("current", description="Period: current, previous, or YYYY-MM"),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get GST dashboard summary with real data from invoices
    """
    try:
        branch_id = get_default_branch_id(db, org_id)
        org_gstin = get_organization_gstin(db, org_id)

        # Parse period
        if period == "current":
            target_date = datetime.now()
        elif period == "previous":
            now = datetime.now()
            if now.month == 1:
                target_date = datetime(now.year - 1, 12, 1)
            else:
                target_date = datetime(now.year, now.month - 1, 1)
        else:
            # Parse YYYY-MM format
            try:
                year, month = map(int, period.split('-'))
                target_date = datetime(year, month, 1)
            except:
                target_date = datetime.now()

        # Get invoices for the period
        invoices_query = db.query(Invoice).filter(
            and_(
                Invoice.org_id == org_id,
                Invoice.branch_id == branch_id,
                extract('year', Invoice.invoice_date) == target_date.year,
                extract('month', Invoice.invoice_date) == target_date.month,
                Invoice.is_deleted == False
            )
        )

        invoices = invoices_query.all()

        # Calculate GST totals
        total_taxable = Decimal('0')
        total_cgst = Decimal('0')
        total_sgst = Decimal('0')
        total_igst = Decimal('0')
        total_output_tax = Decimal('0')

        b2b_count = 0
        b2c_count = 0
        export_count = 0

        for invoice in invoices:
            # Get customer GSTIN
            customer_gstin = None
            if invoice.customer_id:
                customer = db.query(Customer).filter(Customer.customer_id == invoice.customer_id).first()
                customer_gstin = customer.gstin if customer else None

            # Determine GST type
            gst_type = GSTService.determine_gst_type(
                seller_gstin=org_gstin,
                buyer_gstin=customer_gstin,
                is_export=invoice.is_export or False
            )

            # Add to totals
            taxable_amount = Decimal(str(invoice.subtotal or 0)) - Decimal(str(invoice.discount_amount or 0))
            total_taxable += taxable_amount

            cgst_amount = Decimal(str(invoice.cgst_amount or 0))
            sgst_amount = Decimal(str(invoice.sgst_amount or 0))
            igst_amount = Decimal(str(invoice.igst_amount or 0))

            total_cgst += cgst_amount
            total_sgst += sgst_amount
            total_igst += igst_amount
            total_output_tax += cgst_amount + sgst_amount + igst_amount

            # Count transaction types
            if invoice.is_export:
                export_count += 1
            elif customer_gstin:
                b2b_count += 1
            else:
                b2c_count += 1

        # Input tax credit (from purchases) - simplified for now
        input_credit = Decimal('0')  # TODO: Add purchase invoices calculation

        # Net tax payable
        net_payable = total_output_tax - input_credit

        # Compliance score based on filing status
        compliance_score = 85  # TODO: Calculate based on actual filing status

        return {
            "taxPayable": float(total_output_tax),
            "outputTax": float(total_output_tax),
            "inputCredit": float(input_credit),
            "inputTax": float(input_credit),
            "netPayable": float(net_payable),
            "complianceScore": compliance_score,
            "period": get_current_period(),
            "summary": {
                "total_invoices": len(invoices),
                "total_taxable": float(total_taxable),
                "b2b_transactions": b2b_count,
                "b2c_transactions": b2c_count,
                "export_transactions": export_count,
                "cgst_amount": float(total_cgst),
                "sgst_amount": float(total_sgst),
                "igst_amount": float(total_igst)
            }
        }

    except Exception as e:
        # Return default structure with zeros on error
        return {
            "taxPayable": 0,
            "outputTax": 0,
            "inputCredit": 0,
            "inputTax": 0,
            "netPayable": 0,
            "complianceScore": 0,
            "period": get_current_period(),
            "error": str(e)
        }

@router.get("/returns/status")
async def get_returns_status(
    period: str = Query("current"),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get GST returns filing status
    """
    try:
        # For now, return calculated status based on data
        # In production, this would check actual GST portal filing status

        dashboard_data = await get_gst_dashboard(period, db, org_id)

        # Generate due dates (Indian GST due dates)
        current_date = datetime.now()

        # GSTR-1 due date: 11th of next month
        if current_date.month == 12:
            gstr1_due = datetime(current_date.year + 1, 1, 11)
        else:
            gstr1_due = datetime(current_date.year, current_date.month + 1, 11)

        # GSTR-3B due date: 20th of next month
        if current_date.month == 12:
            gstr3b_due = datetime(current_date.year + 1, 1, 20)
        else:
            gstr3b_due = datetime(current_date.year, current_date.month + 1, 20)

        return {
            "gstr1": {
                "status": "pending",
                "amount": dashboard_data["taxPayable"],
                "dueDate": gstr1_due.strftime("%d %b %Y"),
                "filedDate": None
            },
            "gstr3b": {
                "status": "pending",
                "amount": dashboard_data["netPayable"],
                "dueDate": gstr3b_due.strftime("%d %b %Y"),
                "filedDate": None
            },
            "gstr2a": {
                "status": "available",
                "amount": dashboard_data["inputCredit"],
                "lastUpdated": current_date.strftime("%d %b %Y")
            }
        }

    except Exception as e:
        return {
            "gstr1": {"status": "pending", "amount": 0, "dueDate": None, "filedDate": None},
            "gstr3b": {"status": "pending", "amount": 0, "dueDate": None, "filedDate": None},
            "gstr2a": {"status": "available", "amount": 0, "lastUpdated": None},
            "error": str(e)
        }

@router.post("/returns/{return_type}")
async def file_gst_return(
    return_type: str,
    data: Dict[str, Any],
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    File GST return (simulation)
    """
    try:
        # In production, this would integrate with GST portal API
        # For now, simulate successful filing

        filed_date = datetime.now()
        reference_number = f"GST{filed_date.strftime('%Y%m%d%H%M%S')}"

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
async def calculate_gst(
    amount: float,
    hsn_code: Optional[str] = None,
    seller_gstin: Optional[str] = None,
    buyer_gstin: Optional[str] = None,
    is_interstate: bool = False,
    gst_rate: float = 18.0,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Calculate GST amounts for given parameters
    """
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

@router.get("/compliance/status")
async def get_compliance_status(
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get GST compliance status
    """
    try:
        # Check basic compliance requirements
        org_gstin = get_organization_gstin(db, org_id)

        issues = []
        score = 100

        if not org_gstin:
            issues.append("GSTIN not configured")
            score -= 30
        elif not GSTService.validate_gstin(org_gstin):
            issues.append("Invalid GSTIN format")
            score -= 20

        # Check recent invoices for GST compliance
        recent_invoices = db.query(Invoice).filter(
            and_(
                Invoice.org_id == org_id,
                Invoice.invoice_date >= datetime.now().replace(day=1),
                Invoice.is_deleted == False
            )
        ).limit(100).all()

        if len(recent_invoices) == 0:
            issues.append("No recent invoices found")
            score -= 10

        # Check for missing customer GSTIN in B2B transactions
        b2b_without_gstin = 0
        for invoice in recent_invoices:
            if invoice.final_amount and float(invoice.final_amount) > 50000:  # B2B threshold
                if invoice.customer_id:
                    customer = db.query(Customer).filter(Customer.customer_id == invoice.customer_id).first()
                    if not customer or not customer.gstin:
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
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/settings")
async def get_gst_settings(
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get GST configuration settings
    """
    try:
        org_gstin = get_organization_gstin(db, org_id)
        state_code = GSTService.extract_state_code(org_gstin) if org_gstin else None
        state_name = GSTService.get_state_name(state_code) if state_code else None

        return {
            "gstin": org_gstin or "",
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
        raise HTTPException(status_code=500, detail=str(e))

# Additional routes for comprehensive GST functionality
@router.get("/metrics")
async def get_gst_metrics(
    period: str = Query("current"),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """Get detailed GST metrics"""
    dashboard_data = await get_gst_dashboard(period, db, org_id)

    return {
        "currentMonth": {
            "sales": dashboard_data["summary"]["total_taxable"],
            "purchases": 0,  # TODO: Add purchase data
            "outputTax": dashboard_data["outputTax"],
            "inputTax": dashboard_data["inputTax"],
            "netTax": dashboard_data["netPayable"]
        },
        "previousMonth": {
            "sales": 0,  # TODO: Calculate previous month
            "purchases": 0,
            "outputTax": 0,
            "inputTax": 0,
            "netTax": 0
        }
    }

# Export router
__all__ = ["router"]