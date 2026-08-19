"""
Tax Entries API Router
REFACTORED: Uses TaxService for database operations
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
import logging
from datetime import date, datetime, timedelta
from decimal import Decimal

from .....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from .....core.auth.org_context import get_org_context, OrgContext
from .....core.security.permissions import PermissionChecker
from .....core.money import money_json
from ....services.compliance.gst_service import GSTService
from ....services.finance.tax.service import TaxService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["tax-entries"])

@router.get("/")
@with_tenant_context
async def get_tax_entries(
    skip: int = 0, limit: int = 100,
    entry_type: Optional[str] = Query(None, description="Filter by type: sales, purchase"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    _: dict = Depends(PermissionChecker("finance", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get tax entries from sales invoices"""
    try:
        if entry_type and entry_type == 'purchase':
            return []
        entries = TaxService.list_sales_tax_entries(db, str(context.org_id), entry_type, start_date, end_date, limit, skip)
        return entries
    except Exception as e:
        logger.error(f"Error fetching tax entries: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get tax entries: {str(e)}")

@router.get("/{entry_id}")
@with_tenant_context
async def get_tax_entry(
    entry_id: int,
    _: dict = Depends(PermissionChecker("finance", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get a single tax entry by invoice ID"""
    try:
        entry = TaxService.get_tax_entry(db, str(context.org_id), entry_id)
        if not entry:
            raise HTTPException(status_code=404, detail="Tax entry not found")
        return entry
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching tax entry {entry_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get tax entry: {str(e)}")

@router.post("/calculate")
@with_tenant_context
async def calculate_tax(
    calculation_data: dict,
    _: dict = Depends(PermissionChecker("finance", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Calculate tax for given parameters"""
    try:
        taxable_amount = Decimal(str(calculation_data.get("taxable_amount", 0)))
        gst_rate = Decimal(str(calculation_data.get("gst_rate", 0)))
        is_interstate = calculation_data.get("is_interstate", False)
        
        gst_type = "IGST" if is_interstate else "CGST/SGST"
        gst = GSTService.calculate_gst_components(taxable_amount, gst_rate, gst_type)
        total_amount = taxable_amount + gst["total_tax_amount"]
        
        return {
            "taxable_amount": money_json(taxable_amount), "cgst_rate": float(gst["cgst_percent"]),
            "cgst_amount": money_json(gst["cgst_amount"]), "sgst_rate": float(gst["sgst_percent"]),
            "sgst_amount": money_json(gst["sgst_amount"]), "igst_rate": float(gst["igst_percent"]),
            "igst_amount": money_json(gst["igst_amount"]), "total_tax": money_json(gst["total_tax_amount"]),
            "total_amount": money_json(total_amount)
        }
    except Exception as e:
        logger.error(f"Error calculating tax: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to calculate tax: {str(e)}")

@router.get("/gstr1/summary")
@with_tenant_context
async def get_gstr1_summary(
    month: int = Query(..., description="Month (1-12)"),
    year: int = Query(..., description="Year"),
    _: dict = Depends(PermissionChecker("finance", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get GSTR-1 summary for the specified month"""
    try:
        org_id = str(context.org_id)
        start_date = date(year, month, 1)
        end_date = date(year + 1, 1, 1) - timedelta(days=1) if month == 12 else date(year, month + 1, 1) - timedelta(days=1)
        
        b2b_supplies = TaxService.get_b2b_supplies(db, org_id, start_date, end_date)
        b2c_summary = TaxService.get_b2c_summary(db, org_id, start_date, end_date)
        hsn_summary = TaxService.get_hsn_summary(db, org_id, start_date, end_date)
        
        return {"month": month, "year": year, "b2b_supplies": b2b_supplies,
                "b2c_summary": b2c_summary, "hsn_summary": hsn_summary, "generated_on": datetime.utcnow()}
    except Exception as e:
        logger.error(f"Error generating GSTR-1 summary: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate GSTR-1 summary: {str(e)}")

@router.get("/analytics/summary")
@with_tenant_context
async def get_tax_analytics(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    _: dict = Depends(PermissionChecker("finance", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get tax analytics and summary"""
    try:
        analytics = TaxService.get_tax_analytics(db, str(context.org_id), start_date, end_date)
        analytics["net_tax_liability"] = money_json(
            (analytics.get("total_output_tax") or 0)
            - (analytics.get("total_input_tax") or 0)
        )
        return analytics
    except Exception as e:
        logger.error(f"Error fetching tax analytics: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get tax analytics: {str(e)}")

@router.get("/overview")
@with_tenant_context
async def tax_overview():
    """Get tax service overview"""
    return {"status": "Tax service available", "features": ["Tax calculation", "GSTR-1 summary generation", "Tax analytics", "Sales tax reporting"],
            "note": "Simplified version using sales invoice data"}
