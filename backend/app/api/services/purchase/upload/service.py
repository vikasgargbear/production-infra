"""
Purchase Upload Service
Handles database operations for purchase upload/parsing
"""
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import text
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)


class UploadService:
    """Service class for Purchase Upload operations"""
    
    @staticmethod
    def get_supplier_by_gstin(db: Session, gstin: str) -> Optional[Dict[str, Any]]:
        """Get supplier by GST number."""
        result = db.execute(text(
            "SELECT * FROM parties.suppliers WHERE gst_number = :gstin"
        ), {"gstin": gstin})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_supplier_by_name(db: Session, name: str) -> Optional[Dict[str, Any]]:
        """Get supplier by name (partial match)."""
        result = db.execute(text(
            "SELECT * FROM parties.suppliers WHERE LOWER(supplier_name) LIKE LOWER(:name)"
        ), {"name": f"%{name}%"})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_supplier_by_name_fuzzy(db: Session, name: str) -> Optional[Dict[str, Any]]:
        """Get supplier by name with fuzzy matching."""
        result = db.execute(text("""
            SELECT * FROM parties.suppliers 
            WHERE LOWER(supplier_name) LIKE LOWER(:name)
            OR LOWER(supplier_name) LIKE LOWER(:partial_name)
        """), {"name": name, "partial_name": f"%{name}%"})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def create_supplier(db: Session, data: Dict[str, Any]) -> int:
        """Create new supplier."""
        result = db.execute(text("""
            INSERT INTO parties.suppliers (
                org_id, supplier_code, supplier_name, gst_number, address,
                primary_phone, primary_email, drug_license_number
            ) VALUES (
                :org_id, :code, :name, :gstin, :address, :phone, :email, :drug_license
            ) RETURNING supplier_id
        """), data)
        return result.scalar()
    
    @staticmethod
    def create_purchase_order(db: Session, data: Dict[str, Any]) -> int:
        """Create purchase order."""
        result = db.execute(text("""
            INSERT INTO procurement.purchase_orders (
                org_id, branch_id, po_number, po_date, supplier_id, supplier_reference,
                subtotal_amount, discount_amount, tax_amount, other_charges, total_amount, po_status
            ) VALUES (
                :org_id, :branch_id, :purchase_number, :purchase_date, :supplier_id, :invoice_number,
                :subtotal, :discount, :tax, :other_charges, :total, 'draft'
            ) RETURNING purchase_order_id
        """), data)
        return result.scalar()
    
    @staticmethod
    def create_purchase_order_item(db: Session, data: Dict[str, Any]) -> None:
        """Create purchase order item."""
        db.execute(text("""
            INSERT INTO procurement.purchase_order_items (
                purchase_order_id, product_id, product_name, ordered_quantity, unit_price, mrp,
                discount_percent, discount_amount, tax_percent, tax_amount, line_total,
                batch_number, expiry_date, uom, pack_type, item_status
            ) VALUES (
                :purchase_order_id, :product_id, :product_name, :quantity, :unit_price, :mrp,
                :discount_percent, :discount_amount, :tax_percent, :tax_amount, :line_total,
                :batch_number, :expiry_date, :uom, :pack_type, 'pending'
            )
        """), data)
    
    @staticmethod
    def get_product_by_name(db: Session, name: str) -> Optional[Dict[str, Any]]:
        """Get product by exact name match."""
        result = db.execute(text("""
            SELECT product_id, product_name, hsn_code 
            FROM inventory.products WHERE LOWER(product_name) = LOWER(:name) LIMIT 1
        """), {"name": name})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_product_by_hsn(db: Session, hsn: str) -> Optional[Dict[str, Any]]:
        """Get product by HSN code."""
        result = db.execute(text("""
            SELECT product_id, product_name, hsn_code 
            FROM inventory.products WHERE hsn_code = :hsn LIMIT 1
        """), {"hsn": hsn})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def check_duplicate_invoice(db: Session, invoice_num: str, supplier_id: int) -> Optional[Dict[str, Any]]:
        """Check for duplicate invoice."""
        result = db.execute(text("""
            SELECT supplier_invoice_id, supplier_invoice_number 
            FROM procurement.supplier_invoices 
            WHERE supplier_invoice_number = :invoice_num AND supplier_id = :supplier_id
        """), {"invoice_num": invoice_num, "supplier_id": supplier_id})
        row = result.first()
        return dict(row._mapping) if row else None
