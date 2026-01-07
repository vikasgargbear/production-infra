"""
Tax Service
Handles all database operations for tax entries and reports
"""
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date
import logging

logger = logging.getLogger(__name__)


class TaxService:
    """Service class for Tax operations"""
    
    @staticmethod
    def list_sales_tax_entries(
        db: Session, org_id: str, entry_type: str = None,
        start_date: date = None, end_date: date = None,
        limit: int = 100, skip: int = 0
    ) -> List[Dict[str, Any]]:
        """Get tax entries from sales invoices."""
        query = """
            SELECT i.invoice_id as entry_id, 'sales' as entry_type, i.invoice_date as entry_date,
                   i.customer_id as party_id, c.customer_name as party_name, c.gst_number as party_gstin,
                   i.invoice_number, i.subtotal_amount as taxable_amount, i.cgst_amount, i.sgst_amount,
                   i.igst_amount, i.total_tax_amount, i.final_amount as total_amount,
                   'Customer' as party_type, i.created_at
            FROM sales.invoices i LEFT JOIN parties.customers c ON i.customer_id = c.customer_id
            WHERE i.org_id = :org_id
        """
        params = {"org_id": org_id, "limit": limit, "skip": skip}
        if start_date:
            query += " AND i.invoice_date >= :start_date"
            params["start_date"] = start_date
        if end_date:
            query += " AND i.invoice_date <= :end_date"
            params["end_date"] = end_date
        query += " ORDER BY i.invoice_date DESC LIMIT :limit OFFSET :skip"
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_tax_entry(db: Session, org_id: str, entry_id: int) -> Optional[Dict[str, Any]]:
        """Get single tax entry by invoice ID."""
        result = db.execute(text("""
            SELECT i.invoice_id as entry_id, 'sales' as entry_type, i.invoice_date as entry_date,
                   i.customer_id as party_id, c.customer_name as party_name, c.gst_number as party_gstin,
                   i.invoice_number, i.subtotal_amount as taxable_amount, i.cgst_amount, i.sgst_amount,
                   i.igst_amount, i.total_tax_amount, i.final_amount as total_amount,
                   'Customer' as party_type, i.created_at
            FROM sales.invoices i LEFT JOIN parties.customers c ON i.customer_id = c.customer_id
            WHERE i.invoice_id = :entry_id AND i.org_id = :org_id
        """), {"entry_id": entry_id, "org_id": org_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_b2b_supplies(db: Session, org_id: str, start_date: date, end_date: date) -> List[Dict[str, Any]]:
        """Get B2B supplies for GSTR-1."""
        result = db.execute(text("""
            SELECT c.gst_number as customer_gstin, c.customer_name,
                   COUNT(DISTINCT i.invoice_number) as invoice_count, SUM(i.subtotal_amount) as taxable_value,
                   SUM(i.cgst_amount) as cgst, SUM(i.sgst_amount) as sgst, SUM(i.igst_amount) as igst,
                   SUM(i.total_tax_amount) as total_tax
            FROM sales.invoices i JOIN parties.customers c ON i.customer_id = c.customer_id
            WHERE i.invoice_date >= :start_date AND i.invoice_date <= :end_date
            AND i.org_id = :org_id AND c.gst_number IS NOT NULL
            GROUP BY c.gst_number, c.customer_name ORDER BY taxable_value DESC
        """), {"start_date": start_date, "end_date": end_date, "org_id": org_id})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_b2c_summary(db: Session, org_id: str, start_date: date, end_date: date) -> Dict[str, Any]:
        """Get B2C summary for GSTR-1."""
        result = db.execute(text("""
            SELECT COUNT(DISTINCT i.invoice_number) as invoice_count, SUM(i.subtotal_amount) as taxable_value,
                   SUM(i.cgst_amount) as cgst, SUM(i.sgst_amount) as sgst, SUM(i.igst_amount) as igst,
                   SUM(i.total_tax_amount) as total_tax
            FROM sales.invoices i LEFT JOIN parties.customers c ON i.customer_id = c.customer_id
            WHERE i.invoice_date >= :start_date AND i.invoice_date <= :end_date
            AND i.org_id = :org_id AND (c.gst_number IS NULL OR c.gst_number = '')
        """), {"start_date": start_date, "end_date": end_date, "org_id": org_id})
        row = result.first()
        return dict(row._mapping) if row else {}
    
    @staticmethod
    def get_hsn_summary(db: Session, org_id: str, start_date: date, end_date: date) -> List[Dict[str, Any]]:
        """Get HSN summary for GSTR-1."""
        result = db.execute(text("""
            SELECT p.hsn_code, p.product_name as product_description, COUNT(*) as transaction_count,
                   SUM(ii.total_amount) as taxable_value, 18.0 as avg_tax_rate,
                   SUM(ii.total_amount * 0.18) as total_tax
            FROM sales.invoice_items ii JOIN sales.invoices i ON ii.invoice_id = i.invoice_id
            JOIN inventory.products p ON ii.product_id = p.product_id
            WHERE i.invoice_date >= :start_date AND i.invoice_date <= :end_date AND i.org_id = :org_id
            GROUP BY p.hsn_code, p.product_name ORDER BY taxable_value DESC
        """), {"start_date": start_date, "end_date": end_date, "org_id": org_id})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_tax_analytics(
        db: Session, org_id: str, start_date: date = None, end_date: date = None
    ) -> Dict[str, Any]:
        """Get tax analytics summary."""
        query = """
            SELECT COUNT(*) as total_entries, COUNT(*) as sales_entries, 0 as purchase_entries,
                   SUM(i.subtotal_amount) as total_sales_value, 0 as total_purchase_value,
                   SUM(i.total_tax_amount) as total_output_tax, 0 as total_input_tax,
                   SUM(i.cgst_amount) as total_output_cgst, SUM(i.sgst_amount) as total_output_sgst,
                   SUM(i.igst_amount) as total_output_igst
            FROM sales.invoices i WHERE i.org_id = :org_id
        """
        params = {"org_id": org_id}
        if start_date:
            query += " AND i.invoice_date >= :start_date"
            params["start_date"] = start_date
        if end_date:
            query += " AND i.invoice_date <= :end_date"
            params["end_date"] = end_date
        result = db.execute(text(query), params)
        row = result.first()
        return dict(row._mapping) if row else {}
