"""
Tax Entries API Router
Manages GST entries, tax calculations, and compliance reporting
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from datetime import date, datetime
from decimal import Decimal

from ...database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/tax-entries", tags=["tax-entries"])

@router.get("/")
def get_tax_entries(
    skip: int = 0,
    limit: int = 100,
    entry_type: Optional[str] = Query(None, description="Filter by type: sales, purchase, return"),
    tax_type: Optional[str] = Query(None, description="Filter by tax: cgst, sgst, igst"),
    start_date: Optional[date] = Query(None, description="Filter from date"),
    end_date: Optional[date] = Query(None, description="Filter to date"),
    db: Session = Depends(get_db)
):
    """Get tax entries with optional filtering"""
    try:
        query = """
            SELECT 
                te.*,
                CASE 
                    WHEN te.entry_type = 'sales' THEN c.customer_name
                    WHEN te.entry_type = 'purchase' THEN s.supplier_name
                END as party_name,
                CASE 
                    WHEN te.entry_type = 'sales' THEN c.gstin
                    WHEN te.entry_type = 'purchase' THEN s.gstin
                END as party_gstin
            FROM tax_entries te
            LEFT JOIN customers c ON te.party_id = c.customer_id AND te.entry_type = 'sales'
            LEFT JOIN suppliers s ON te.party_id = s.supplier_id AND te.entry_type = 'purchase'
            WHERE 1=1
        """
        params = {}
        
        if entry_type:
            query += " AND te.entry_type = :entry_type"
            params["entry_type"] = entry_type
            
        if tax_type:
            query += " AND te.tax_type = :tax_type"
            params["tax_type"] = tax_type
            
        if start_date:
            query += " AND te.entry_date >= :start_date"
            params["start_date"] = start_date
            
        if end_date:
            query += " AND te.entry_date <= :end_date"
            params["end_date"] = end_date
            
        query += " ORDER BY te.entry_date DESC LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        entries = [dict(row._mapping) for row in result]
        
        return entries
        
    except Exception as e:
        logger.error(f"Error fetching tax entries: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get tax entries: {str(e)}")

@router.get("/{entry_id}")
def get_tax_entry(entry_id: int, db: Session = Depends(get_db)):
    """Get a single tax entry by ID"""
    try:
        result = db.execute(
            text("""
                SELECT 
                    te.*,
                    CASE 
                        WHEN te.entry_type = 'sales' THEN c.customer_name
                        WHEN te.entry_type = 'purchase' THEN s.supplier_name
                    END as party_name,
                    CASE 
                        WHEN te.entry_type = 'sales' THEN c.gstin
                        WHEN te.entry_type = 'purchase' THEN s.gstin
                    END as party_gstin,
                    CASE 
                        WHEN te.entry_type = 'sales' THEN c.state_code
                        WHEN te.entry_type = 'purchase' THEN s.state_code
                    END as party_state_code
                FROM tax_entries te
                LEFT JOIN customers c ON te.party_id = c.customer_id AND te.entry_type = 'sales'
                LEFT JOIN suppliers s ON te.party_id = s.supplier_id AND te.entry_type = 'purchase'
                WHERE te.entry_id = :entry_id
            """),
            {"entry_id": entry_id}
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

@router.post("/")
def create_tax_entry(tax_data: dict, db: Session = Depends(get_db)):
    """
    Create a new tax entry
    Usually created automatically when invoices are generated
    """
    try:
        # Validate HSN code if provided
        if tax_data.get("hsn_code"):
            hsn_check = db.execute(
                text("SELECT COUNT(*) FROM products WHERE hsn_code = :hsn_code"),
                {"hsn_code": tax_data.get("hsn_code")}
            ).scalar()
            
            if hsn_check == 0:
                logger.warning(f"HSN code {tax_data.get('hsn_code')} not found in products")
        
        # Calculate tax components
        taxable_amount = Decimal(str(tax_data.get("taxable_amount", 0)))
        gst_rate = Decimal(str(tax_data.get("gst_rate", 0)))
        
        cgst_amount = taxable_amount * (gst_rate / 2) / 100
        sgst_amount = taxable_amount * (gst_rate / 2) / 100
        igst_amount = Decimal(0)
        
        # Check if interstate transaction
        if tax_data.get("is_interstate"):
            igst_amount = taxable_amount * gst_rate / 100
            cgst_amount = Decimal(0)
            sgst_amount = Decimal(0)
        
        total_tax_amount = cgst_amount + sgst_amount + igst_amount
        
        # Create tax entry
        entry_id = db.execute(
            text("""
                INSERT INTO tax_entries (
                    entry_type, reference_type, reference_id,
                    party_id, party_type, entry_date,
                    hsn_code, product_description,
                    taxable_amount, cgst_rate, cgst_amount,
                    sgst_rate, sgst_amount, igst_rate, igst_amount,
                    total_tax_amount, invoice_number, invoice_date,
                    is_interstate, reverse_charge, notes
                ) VALUES (
                    :entry_type, :reference_type, :reference_id,
                    :party_id, :party_type, :entry_date,
                    :hsn_code, :product_description,
                    :taxable_amount, :cgst_rate, :cgst_amount,
                    :sgst_rate, :sgst_amount, :igst_rate, :igst_amount,
                    :total_tax_amount, :invoice_number, :invoice_date,
                    :is_interstate, :reverse_charge, :notes
                ) RETURNING entry_id
            """),
            {
                "entry_type": tax_data.get("entry_type"),
                "reference_type": tax_data.get("reference_type"),
                "reference_id": tax_data.get("reference_id"),
                "party_id": tax_data.get("party_id"),
                "party_type": tax_data.get("party_type"),
                "entry_date": tax_data.get("entry_date", datetime.utcnow()),
                "hsn_code": tax_data.get("hsn_code"),
                "product_description": tax_data.get("product_description"),
                "taxable_amount": taxable_amount,
                "cgst_rate": gst_rate / 2 if not tax_data.get("is_interstate") else 0,
                "cgst_amount": cgst_amount,
                "sgst_rate": gst_rate / 2 if not tax_data.get("is_interstate") else 0,
                "sgst_amount": sgst_amount,
                "igst_rate": gst_rate if tax_data.get("is_interstate") else 0,
                "igst_amount": igst_amount,
                "total_tax_amount": total_tax_amount,
                "invoice_number": tax_data.get("invoice_number"),
                "invoice_date": tax_data.get("invoice_date"),
                "is_interstate": tax_data.get("is_interstate", False),
                "reverse_charge": tax_data.get("reverse_charge", False),
                "notes": tax_data.get("notes")
            }
        ).scalar()
        
        db.commit()
        
        return {
            "entry_id": entry_id,
            "message": "Tax entry created successfully",
            "tax_breakdown": {
                "taxable_amount": float(taxable_amount),
                "cgst_amount": float(cgst_amount),
                "sgst_amount": float(sgst_amount),
                "igst_amount": float(igst_amount),
                "total_tax": float(total_tax_amount)
            }
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating tax entry: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create tax entry: {str(e)}")

@router.post("/calculate")
def calculate_tax(calculation_data: dict, db: Session = Depends(get_db)):
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
    db: Session = Depends(get_db)
):
    """Get GSTR-1 summary for the specified month"""
    try:
        start_date = date(year, month, 1)
        if month == 12:
            end_date = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = date(year, month + 1, 1) - timedelta(days=1)
        
        # B2B Supplies
        b2b_query = """
            SELECT 
                c.gstin as customer_gstin,
                c.customer_name,
                COUNT(DISTINCT te.invoice_number) as invoice_count,
                SUM(te.taxable_amount) as taxable_value,
                SUM(te.cgst_amount) as cgst,
                SUM(te.sgst_amount) as sgst,
                SUM(te.igst_amount) as igst,
                SUM(te.total_tax_amount) as total_tax
            FROM tax_entries te
            JOIN customers c ON te.party_id = c.customer_id
            WHERE te.entry_type = 'sales'
            AND te.entry_date >= :start_date
            AND te.entry_date <= :end_date
            AND c.gstin IS NOT NULL
            GROUP BY c.gstin, c.customer_name
            ORDER BY taxable_value DESC
        """
        
        b2b_result = db.execute(text(b2b_query), {"start_date": start_date, "end_date": end_date})
        b2b_supplies = [dict(row._mapping) for row in b2b_result]
        
        # B2C Supplies
        b2c_query = """
            SELECT 
                COUNT(DISTINCT te.invoice_number) as invoice_count,
                SUM(te.taxable_amount) as taxable_value,
                SUM(te.cgst_amount) as cgst,
                SUM(te.sgst_amount) as sgst,
                SUM(te.igst_amount) as igst,
                SUM(te.total_tax_amount) as total_tax
            FROM tax_entries te
            LEFT JOIN customers c ON te.party_id = c.customer_id
            WHERE te.entry_type = 'sales'
            AND te.entry_date >= :start_date
            AND te.entry_date <= :end_date
            AND (c.gstin IS NULL OR c.gstin = '')
        """
        
        b2c_result = db.execute(text(b2c_query), {"start_date": start_date, "end_date": end_date})
        b2c_summary = dict(b2c_result.first()._mapping)
        
        # HSN Summary
        hsn_query = """
            SELECT 
                te.hsn_code,
                te.product_description,
                COUNT(*) as transaction_count,
                SUM(te.taxable_amount) as taxable_value,
                AVG(te.cgst_rate + te.sgst_rate + te.igst_rate) as avg_tax_rate,
                SUM(te.total_tax_amount) as total_tax
            FROM tax_entries te
            WHERE te.entry_type = 'sales'
            AND te.entry_date >= :start_date
            AND te.entry_date <= :end_date
            GROUP BY te.hsn_code, te.product_description
            ORDER BY taxable_value DESC
        """
        
        hsn_result = db.execute(text(hsn_query), {"start_date": start_date, "end_date": end_date})
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

@router.get("/gstr2/summary")
def get_gstr2_summary(
    month: int = Query(..., description="Month (1-12)"),
    year: int = Query(..., description="Year"),
    db: Session = Depends(get_db)
):
    """Get GSTR-2 (Purchase) summary for the specified month"""
    try:
        from datetime import timedelta
        start_date = date(year, month, 1)
        if month == 12:
            end_date = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = date(year, month + 1, 1) - timedelta(days=1)
        
        # Purchase Summary
        purchase_query = """
            SELECT 
                s.gstin as supplier_gstin,
                s.supplier_name,
                COUNT(DISTINCT te.invoice_number) as invoice_count,
                SUM(te.taxable_amount) as taxable_value,
                SUM(te.cgst_amount) as cgst,
                SUM(te.sgst_amount) as sgst,
                SUM(te.igst_amount) as igst,
                SUM(te.total_tax_amount) as total_tax
            FROM tax_entries te
            JOIN suppliers s ON te.party_id = s.supplier_id
            WHERE te.entry_type = 'purchase'
            AND te.entry_date >= :start_date
            AND te.entry_date <= :end_date
            GROUP BY s.gstin, s.supplier_name
            ORDER BY taxable_value DESC
        """
        
        purchase_result = db.execute(text(purchase_query), {"start_date": start_date, "end_date": end_date})
        purchases = [dict(row._mapping) for row in purchase_result]
        
        return {
            "month": month,
            "year": year,
            "purchases": purchases,
            "generated_on": datetime.utcnow()
        }
        
    except Exception as e:
        logger.error(f"Error generating GSTR-2 summary: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate GSTR-2 summary: {str(e)}")

@router.get("/analytics/summary")
def get_tax_analytics(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db)
):
    """Get tax analytics and summary"""
    try:
        query = """
            SELECT 
                COUNT(*) as total_entries,
                COUNT(CASE WHEN entry_type = 'sales' THEN 1 END) as sales_entries,
                COUNT(CASE WHEN entry_type = 'purchase' THEN 1 END) as purchase_entries,
                SUM(CASE WHEN entry_type = 'sales' THEN taxable_amount ELSE 0 END) as total_sales_value,
                SUM(CASE WHEN entry_type = 'purchase' THEN taxable_amount ELSE 0 END) as total_purchase_value,
                SUM(CASE WHEN entry_type = 'sales' THEN total_tax_amount ELSE 0 END) as total_output_tax,
                SUM(CASE WHEN entry_type = 'purchase' THEN total_tax_amount ELSE 0 END) as total_input_tax,
                SUM(CASE WHEN entry_type = 'sales' THEN cgst_amount ELSE 0 END) as total_output_cgst,
                SUM(CASE WHEN entry_type = 'sales' THEN sgst_amount ELSE 0 END) as total_output_sgst,
                SUM(CASE WHEN entry_type = 'sales' THEN igst_amount ELSE 0 END) as total_output_igst
            FROM tax_entries
            WHERE 1=1
        """
        params = {}
        
        if start_date:
            query += " AND entry_date >= :start_date"
            params["start_date"] = start_date
            
        if end_date:
            query += " AND entry_date <= :end_date"
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