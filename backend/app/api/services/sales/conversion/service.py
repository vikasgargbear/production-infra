"""
Document Conversion Service
Handles all database operations for document conversions
"""
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date
from decimal import Decimal
import logging
from .....core.utils.constants import ProductDefaults

logger = logging.getLogger(__name__)


class ConversionService:
    """Service class for document conversion operations"""
    
    @staticmethod
    def get_order_for_conversion(db: Session, org_id: str, order_id: int) -> Optional[Dict[str, Any]]:
        """Get order with customer details for conversion."""
        result = db.execute(text("""
            SELECT o.order_id, o.order_number, o.order_status, o.customer_id,
                   o.subtotal_amount, o.discount_amount, o.tax_amount, o.final_amount,
                   c.customer_name, c.primary_phone, c.primary_email, c.gst_number
            FROM sales.orders o
            JOIN parties.customers c ON o.customer_id = c.customer_id
            WHERE o.order_id = :order_id AND o.org_id = :org_id
        """), {"order_id": order_id, "org_id": org_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def check_order_invoiced(db: Session, org_id: str, order_id: int) -> Optional[int]:
        """Check if order already has invoice."""
        result = db.execute(text("""
            SELECT invoice_id FROM sales.invoices WHERE order_id = :order_id AND org_id = :org_id
        """), {"order_id": order_id, "org_id": org_id})
        row = result.first()
        return row.invoice_id if row else None
    
    @staticmethod
    def get_org_state(db: Session, org_id: str) -> Optional[str]:
        """Get organization state for GST type."""
        return db.execute(text("""
            SELECT business_settings->>'state' as state FROM master.organizations WHERE org_id = :org_id
        """), {"org_id": org_id}).scalar()
    
    @staticmethod
    def create_invoice(db: Session, data: Dict[str, Any]) -> int:
        """Create invoice and return invoice_id."""
        result = db.execute(text("""
            INSERT INTO sales.invoices (
                org_id, invoice_number, invoice_date, due_date, customer_id, customer_name,
                customer_phone, customer_email, customer_gstin, order_id, subtotal_amount,
                discount_amount, taxable_amount, tax_amount, final_amount, paid_amount,
                payment_status, invoice_status, gst_type, created_by, notes
            ) VALUES (
                :org_id, :invoice_number, :invoice_date, :due_date, :customer_id, :customer_name,
                :customer_phone, :customer_email, :customer_gstin, :order_id, :subtotal_amount,
                :discount_amount, :taxable_amount, :tax_amount, :final_amount, 0,
                'unpaid', 'generated', :gst_type, :created_by, :notes
            ) RETURNING invoice_id
        """), data)
        return result.scalar()
    
    @staticmethod
    def copy_order_items_to_invoice(
        db: Session, invoice_id: int, order_id: int, is_interstate: bool
    ) -> None:
        """Copy order items to invoice items."""
        db.execute(text("""
            INSERT INTO sales.invoice_items (
                invoice_id, product_id, product_name, hsn_code, batch_id, batch_number,
                quantity, unit_price, mrp, discount_percent, discount_amount, gst_percent,
                cgst_amount, sgst_amount, igst_amount, taxable_amount, total_amount
            )
            SELECT :invoice_id, oi.product_id, oi.product_name, p.hsn_code, oi.batch_id,
                   oi.batch_number, oi.quantity, oi.unit_price, oi.mrp, oi.discount_percent,
                   oi.discount_amount, COALESCE(p.gst_percent, 0),
                   CASE WHEN :is_interstate THEN 0 ELSE oi.tax_amount / 2 END,
                   CASE WHEN :is_interstate THEN 0 ELSE oi.tax_amount / 2 END,
                   CASE WHEN :is_interstate THEN oi.tax_amount ELSE 0 END,
                   oi.taxable_amount, oi.line_total as total_amount
            FROM sales.order_items oi LEFT JOIN inventory.products p ON oi.product_id = p.product_id
            WHERE oi.order_id = :order_id
        """), {"invoice_id": invoice_id, "order_id": order_id, "is_interstate": is_interstate})
    
    @staticmethod
    def update_order_status(db: Session, order_id: int, status: str) -> None:
        """Update order status."""
        db.execute(text("""
            UPDATE sales.orders SET order_status = :status, updated_at = CURRENT_TIMESTAMP
            WHERE order_id = :order_id
        """), {"order_id": order_id, "status": status})
    
    @staticmethod
    def create_challan(db: Session, data: Dict[str, Any]) -> int:
        """Create challan and return challan_id."""
        result = db.execute(text("""
            INSERT INTO challans (
                org_id, challan_number, challan_date, order_id, customer_id,
                delivery_address, status, total_amount, created_by, branch_id, notes
            ) VALUES (
                :org_id, :challan_number, :challan_date, :order_id, :customer_id,
                :delivery_address, 'pending', :total_amount, :created_by, :branch_id, :notes
            ) RETURNING challan_id
        """), data)
        return result.scalar()
    
    @staticmethod
    def copy_order_items_to_challan(db: Session, challan_id: int, order_id: int) -> None:
        """Copy order items to challan items."""
        db.execute(text("""
            INSERT INTO challan_items (
                challan_id, order_item_id, product_id, product_name, batch_id, batch_number,
                dispatched_quantity, unit_price
            )
            SELECT :challan_id, oi.order_item_id, oi.product_id, oi.product_name,
                   oi.batch_id, oi.batch_number, oi.quantity, oi.unit_price
            FROM sales.order_items oi WHERE oi.order_id = :order_id
        """), {"challan_id": challan_id, "order_id": order_id})
    
    @staticmethod
    def get_challans_for_conversion(
        db: Session, org_id: str, challan_ids: List[int]
    ) -> List[Dict[str, Any]]:
        """Get challans for invoice conversion."""
        result = db.execute(text("""
            SELECT c.challan_id, c.challan_number, c.customer_id, c.status, c.invoice_id
            FROM challans c WHERE c.challan_id = ANY(:ids) AND c.org_id = :org_id
        """), {"ids": challan_ids, "org_id": org_id})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_customer_details(db: Session, org_id: str, customer_id: int) -> Optional[Dict[str, Any]]:
        """Get customer details for invoice."""
        result = db.execute(text("""
            SELECT customer_name, gst_number, primary_phone
            FROM parties.customers WHERE customer_id = :id AND org_id = :org_id
        """), {"id": customer_id, "org_id": org_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_challan_items(db: Session, challan_ids: List[int]) -> List[Dict[str, Any]]:
        """Get all items from challans."""
        result = db.execute(text("""
            SELECT ci.product_id, ci.product_name, ci.batch_id, ci.batch_number,
                   ci.dispatched_quantity as quantity, ci.unit_price,
                   COALESCE(p.hsn_code, '') as hsn_code,
                   COALESCE(p.gst_percent, :default_gst) as gst_percent,
                   COALESCE(b.mrp_per_unit, 0) as mrp
            FROM challan_items ci
            LEFT JOIN inventory.products p ON ci.product_id = p.product_id
            LEFT JOIN inventory.batches b ON ci.batch_id = b.batch_id
            WHERE ci.challan_id = ANY(:ids)
        """), {"ids": challan_ids, "default_gst": ProductDefaults.DEFAULT_GST_PERCENT})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def create_invoice_simple(db: Session, data: Dict[str, Any]) -> int:
        """Create invoice (simplified version for challan conversion)."""
        result = db.execute(text("""
            INSERT INTO sales.invoices (
                org_id, invoice_number, invoice_date, due_date, customer_id, customer_name,
                customer_phone, customer_gstin, subtotal_amount, discount_amount, tax_amount,
                final_amount, payment_status, invoice_status, created_by, notes
            ) VALUES (
                :org_id, :invoice_number, :invoice_date, :due_date, :customer_id, :customer_name,
                :customer_phone, :customer_gstin, :subtotal, :discount, :tax, :final,
                'unpaid', 'generated', :user_id, :notes
            ) RETURNING invoice_id
        """), data)
        return result.scalar()
    
    @staticmethod
    def insert_invoice_item(db: Session, data: Dict[str, Any]) -> None:
        """Insert single invoice item."""
        db.execute(text("""
            INSERT INTO sales.invoice_items (
                invoice_id, product_id, product_name, hsn_code, batch_id, batch_number,
                quantity, unit_price, mrp, gst_percent, taxable_amount, tax_amount, total_amount
            ) VALUES (
                :inv_id, :product_id, :product_name, :hsn, :batch_id, :batch_number,
                :qty, :price, :mrp, :gst, :taxable, :tax, :total
            )
        """), data)
    
    @staticmethod
    def mark_challans_invoiced(db: Session, invoice_id: int, challan_ids: List[int]) -> None:
        """Mark challans as invoiced."""
        db.execute(text("""
            UPDATE challans SET invoice_id = :inv_id, invoiced_at = CURRENT_TIMESTAMP
            WHERE challan_id = ANY(:ids)
        """), {"inv_id": invoice_id, "ids": challan_ids})
    
    @staticmethod
    def get_eligible_challans(
        db: Session, org_id: str, customer_id: int = None,
        from_date: date = None, to_date: date = None
    ) -> List[Dict[str, Any]]:
        """Get delivered challans that haven't been invoiced."""
        query = """
            SELECT c.challan_id, c.challan_number, c.challan_date, c.order_id,
                   c.customer_id, cust.customer_name, c.total_amount,
                   COUNT(ci.challan_item_id) as item_count
            FROM challans c
            JOIN parties.customers cust ON c.customer_id = cust.customer_id
            LEFT JOIN challan_items ci ON c.challan_id = ci.challan_id
            WHERE c.org_id = :org_id AND c.status = 'delivered' AND c.invoice_id IS NULL
        """
        params = {"org_id": org_id}
        if customer_id:
            query += " AND c.customer_id = :customer_id"
            params["customer_id"] = customer_id
        if from_date:
            query += " AND c.challan_date >= :from_date"
            params["from_date"] = from_date
        if to_date:
            query += " AND c.challan_date <= :to_date"
            params["to_date"] = to_date
        query += """ GROUP BY c.challan_id, c.challan_number, c.challan_date, c.order_id,
                     c.customer_id, cust.customer_name, c.total_amount ORDER BY c.challan_date DESC"""
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result]
