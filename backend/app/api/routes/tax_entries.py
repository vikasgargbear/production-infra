"""
Tax Entries API Router (Simplified)
Uses existing sales and GST data for tax calculations and reporting
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from datetime import date, datetime
from decimal import Decimal

from ...core.database import get_db
from ...core.secure_auth import get_org_id_string  # SECURE: JWT-based auth

logger = logging.getLogger(__name__)

router = APIRouter(tags=["tax-entries"])

@router.get("/")
def get_tax_entries(
    skip: int = 0,
    limit: int = 100,
    entry_type: Optional[str] = Query(None, description="Filter by type: sales, purchase"),
    start_date: Optional[date] = Query(None, description="Filter from date"),
    end_date: Optional[date] = Query(None, description="Filter to date"),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
):
    """Get tax entries from sales invoices and purchase records"""
    try:
        # Simplified query using actual database schema - sales invoices
        query = """
            SELECT 
                i.invoice_id as entry_id,
                'sales' as entry_type,
                i.invoice_date as entry_date,
                i.customer_id as party_id,
                c.customer_name as party_name,
                c.gst_number as party_gstin,
                i.invoice_number,
                i.subtotal as taxable_amount,
                i.cgst_amount,
                i.sgst_amount,
                i.igst_amount,
                i.total_tax_amount,
                i.final_amount as total_amount,
                'Customer' as party_type,
                i.created_at
            FROM sales.invoices i
            LEFT JOIN parties.customers c ON i.customer_id = c.customer_id
            WHERE i.org_id = :org_id
        """
        params = {"org_id": org_id}
        
        if entry_type and entry_type == 'sales':
            # Already filtered to sales above
            pass
        elif entry_type and entry_type == 'purchase':
            # Return empty for purchases since we don't have purchase invoices in this simplified version
            return []
            
        if start_date:
            query += " AND i.invoice_date >= :start_date"
            params["start_date"] = start_date
            
        if end_date:
            query += " AND i.invoice_date <= :end_date"
            params["end_date"] = end_date
            
        query += " ORDER BY i.invoice_date DESC LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        entries = [dict(row._mapping) for row in result]
        
        return entries
        
    except Exception as e:
        logger.error(f"Error fetching tax entries: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get tax entries: {str(e)}")

@router.get("/{entry_id}")
def get_tax_entry(entry_id: int, db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)):
    """Get a single tax entry by invoice ID"""
    try:
        result = db.execute(
            text("""
                SELECT 
                    i.invoice_id as entry_id,
                    'sales' as entry_type,
                    i.invoice_date as entry_date,
                    i.customer_id as party_id,
                    c.customer_name as party_name,
                    c.gst_number as party_gstin,
                    c.state as party_state,
                    i.invoice_number,
                    i.subtotal as taxable_amount,
                    i.cgst_amount,
                    i.sgst_amount,
                    i.igst_amount,
                    i.total_tax_amount,
                    i.final_amount as total_amount,
                    'Customer' as party_type,
                    i.created_at
                FROM sales.invoices i
                LEFT JOIN parties.customers c ON i.customer_id = c.customer_id
                WHERE i.invoice_id = :entry_id AND i.org_id = :org_id
            """),
            {"entry_id": entry_id, "org_id": org_id}
        )
        entry = result.first()
        if not entry:
            raise HTTPException(status_code=404, detail="Tax entry not found")
        return dict(entry._mapping)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching tax entry {entry_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get tax entry: {str(e)}")

@router.post("/calculate")
def calculate_tax(calculation_data: dict, db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)):
    """Calculate tax for given parameters"""
    try:
        taxable_amount = Decimal(str(calculation_data.get("taxable_amount", 0)))
        gst_rate = Decimal(str(calculation_data.get("gst_rate", 0)))
        is_interstate = calculation_data.get("is_interstate", False)
        
        cgst_rate = gst_rate / 2 if not is_interstate else 0
        sgst_rate = gst_rate / 2 if not is_interstate else 0
        igst_rate = gst_rate if is_interstate else 0
        
        cgst_amount = taxable_amount * cgst_rate / 100
        sgst_amount = taxable_amount * sgst_rate / 100
        igst_amount = taxable_amount * igst_rate / 100
        
        total_tax = cgst_amount + sgst_amount + igst_amount
        total_amount = taxable_amount + total_tax
        
        return {
            "taxable_amount": float(taxable_amount),
            "cgst_rate": float(cgst_rate),
            "cgst_amount": float(cgst_amount),
            "sgst_rate": float(sgst_rate),
            "sgst_amount": float(sgst_amount),
            "igst_rate": float(igst_rate),
            "igst_amount": float(igst_amount),
            "total_tax": float(total_tax),
            "total_amount": float(total_amount)
        }
        
    except Exception as e:
        logger.error(f"Error calculating tax: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to calculate tax: {str(e)}")

@router.get("/gstr1/summary")
def get_gstr1_summary(
    month: int = Query(..., description="Month (1-12)"),
    year: int = Query(..., description="Year"),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
):
    """Get GSTR-1 summary for the specified month using sales data"""
    try:
        from datetime import timedelta
        start_date = date(year, month, 1)
        if month == 12:
            end_date = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = date(year, month + 1, 1) - timedelta(days=1)
        
        # B2B Supplies
        b2b_query = """
            SELECT 
                c.gst_number as customer_gstin,
                c.customer_name,
                COUNT(DISTINCT i.invoice_number) as invoice_count,
                SUM(i.subtotal) as taxable_value,
                SUM(i.cgst_amount) as cgst,
                SUM(i.sgst_amount) as sgst,
                SUM(i.igst_amount) as igst,
                SUM(i.total_tax_amount) as total_tax
            FROM sales.invoices i
            JOIN parties.customers c ON i.customer_id = c.customer_id
            WHERE i.invoice_date >= :start_date
            AND i.invoice_date <= :end_date
            AND i.org_id = :org_id
            AND c.gst_number IS NOT NULL
            GROUP BY c.gst_number, c.customer_name
            ORDER BY taxable_value DESC
        """
        
        b2b_result = db.execute(text(b2b_query), {
            "start_date": start_date, 
            "end_date": end_date,
            "org_id": org_id
        })
        b2b_supplies = [dict(row._mapping) for row in b2b_result]
        
        # B2C Supplies
        b2c_query = """
            SELECT 
                COUNT(DISTINCT i.invoice_number) as invoice_count,
                SUM(i.subtotal) as taxable_value,
                SUM(i.cgst_amount) as cgst,
                SUM(i.sgst_amount) as sgst,
                SUM(i.igst_amount) as igst,
                SUM(i.total_tax_amount) as total_tax
            FROM sales.invoices i
            LEFT JOIN parties.customers c ON i.customer_id = c.customer_id
            WHERE i.invoice_date >= :start_date
            AND i.invoice_date <= :end_date
            AND i.org_id = :org_id
            AND (c.gst_number IS NULL OR c.gst_number = '')
        """
        
        b2c_result = db.execute(text(b2c_query), {
            "start_date": start_date, 
            "end_date": end_date,
            "org_id": org_id
        })
        b2c_summary = dict(b2c_result.first()._mapping)
        
        # HSN Summary (simplified - would need product HSN data)
        hsn_query = """
            SELECT 
                p.hsn_code,
                p.product_name as product_description,
                COUNT(*) as transaction_count,
                SUM(ii.total_amount) as taxable_value,
                18.0 as avg_tax_rate,  -- Simplified average
                SUM(ii.total_amount * 0.18) as total_tax  -- Simplified calculation
            FROM sales.invoice_items ii
            JOIN sales.invoices i ON ii.invoice_id = i.invoice_id
            JOIN inventory.products p ON ii.product_id = p.product_id
            WHERE i.invoice_date >= :start_date
            AND i.invoice_date <= :end_date
            AND i.org_id = :org_id
            GROUP BY p.hsn_code, p.product_name
            ORDER BY taxable_value DESC
        """
        
        hsn_result = db.execute(text(hsn_query), {
            "start_date": start_date, 
            "end_date": end_date,
            "org_id": org_id
        })
        hsn_summary = [dict(row._mapping) for row in hsn_result]
        
        return {
            "month": month,
            "year": year,
            "b2b_supplies": b2b_supplies,
            "b2c_summary": b2c_summary,
            "hsn_summary": hsn_summary,
            "generated_on": datetime.utcnow()
        }
        
    except Exception as e:
        logger.error(f"Error generating GSTR-1 summary: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate GSTR-1 summary: {str(e)}")

@router.get("/analytics/summary")
def get_tax_analytics(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
):
    """Get tax analytics and summary from sales data"""
    try:
        query = """
            SELECT 
                COUNT(*) as total_entries,
                COUNT(*) as sales_entries,
                0 as purchase_entries,
                SUM(i.subtotal) as total_sales_value,
                0 as total_purchase_value,
                SUM(i.total_tax_amount) as total_output_tax,
                0 as total_input_tax,
                SUM(i.cgst_amount) as total_output_cgst,
                SUM(i.sgst_amount) as total_output_sgst,
                SUM(i.igst_amount) as total_output_igst
            FROM sales.invoices i
            WHERE i.org_id = :org_id
        """
        params = {"org_id": org_id}
        
        if start_date:
            query += " AND i.invoice_date >= :start_date"
            params["start_date"] = start_date
            
        if end_date:
            query += " AND i.invoice_date <= :end_date"
            params["end_date"] = end_date
        
        result = db.execute(text(query), params)
        analytics = dict(result.first()._mapping)
        
        # Calculate tax liability
        analytics["net_tax_liability"] = float(
            analytics["total_output_tax"] - analytics["total_input_tax"]
        )
        
        return analytics
        
    except Exception as e:
        logger.error(f"Error fetching tax analytics: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get tax analytics: {str(e)}")

@router.get("/overview")
async def tax_overview():
    """Get tax service overview"""
    return {
        "status": "Tax service available",
        "features": [
            "Tax calculation",
            "GSTR-1 summary generation", 
            "Tax analytics",
            "Sales tax reporting"
        ],
        "note": "Simplified version using sales invoice data"
    }