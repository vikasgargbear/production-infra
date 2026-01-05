"""
Purchase Shared Repository - Common data access utilities
Follows same pattern as sales/shared/sales_shared_repository.py
"""
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)


class PurchaseSharedRepository:
    """Shared data access methods for purchase operations"""
    
    @staticmethod
    def get_supplier_context(
        db: Session,
        org_id: str,
        supplier_id: int
    ) -> Dict[str, Any]:
        """
        Get supplier context data needed for purchase operations.
        
        Returns:
            Dict with supplier_name, address info, etc.
        """
        result = db.execute(text("""
            SELECT 
                s.supplier_id,
                s.supplier_name,
                s.supplier_code,
                s.gstin,
                s.primary_phone,
                s.primary_email,
                s.credit_limit,
                s.payment_terms
            FROM parties.suppliers s
            WHERE s.supplier_id = :supplier_id AND s.org_id = :org_id
        """), {"supplier_id": supplier_id, "org_id": org_id}).first()
        
        if not result:
            raise ValueError(f"Supplier {supplier_id} not found")
        
        return dict(result._mapping)
    
    @staticmethod
    def get_products_and_batches(
        db: Session,
        org_id: str,
        product_ids: List[int],
        batch_ids: List[int] = None
    ) -> tuple[Dict[int, Dict], Dict[int, Dict]]:
        """
        Batch fetch products and batches for purchase items.
        
        Returns:
            (products_lookup, batches_lookup)
        """
        products_lookup = {}
        batches_lookup = {}
        
        if product_ids:
            products_result = db.execute(text("""
                SELECT product_id, product_name, hsn_code, product_code
                FROM inventory.products
                WHERE product_id = ANY(:product_ids) AND org_id = :org_id
            """), {"product_ids": product_ids, "org_id": org_id})
            
            for row in products_result:
                products_lookup[row.product_id] = {
                    "product_name": row.product_name,
                    "hsn_code": row.hsn_code,
                    "product_code": row.product_code
                }
        
        if batch_ids:
            batches_result = db.execute(text("""
                SELECT 
                    batch_id, product_id, batch_number,
                    manufacturing_date, expiry_date,
                    mrp_per_unit, cost_per_unit, quantity_available
                FROM inventory.batches
                WHERE batch_id = ANY(:batch_ids) AND org_id = :org_id
            """), {"batch_ids": batch_ids, "org_id": org_id})
            
            for row in batches_result:
                batches_lookup[row.batch_id] = {
                    "batch_number": row.batch_number,
                    "mrp": row.mrp_per_unit,
                    "cost_per_unit": row.cost_per_unit,
                    "quantity_available": row.quantity_available,
                    "mfg_date": row.manufacturing_date,
                    "exp_date": row.expiry_date
                }
        
        return products_lookup, batches_lookup
    
    @staticmethod
    def get_purchase_order_context(
        db: Session,
        org_id: str,
        po_id: int
    ) -> Optional[Dict[str, Any]]:
        """Get purchase order context for invoice/GRN creation."""
        result = db.execute(text("""
            SELECT 
                po.purchase_order_id, po.po_number, po.po_date,
                po.supplier_id, po.supplier_name,
                po.subtotal_amount, po.tax_amount, po.total_amount,
                po.po_status, po.receipt_status
            FROM procurement.purchase_orders po
            WHERE po.purchase_order_id = :po_id AND po.org_id = :org_id
        """), {"po_id": po_id, "org_id": org_id}).first()
        
        if not result:
            return None
        
        return dict(result._mapping)
    
    @staticmethod
    def get_org_context(db: Session, org_id: str) -> Dict[str, Any]:
        """Get organization context data."""
        result = db.execute(text("""
            SELECT 
                org_id, org_name, gstin, 
                address_line1, city, state, pincode
            FROM master.organizations
            WHERE org_id = :org_id
        """), {"org_id": org_id}).first()
        
        if not result:
            raise ValueError(f"Organization {org_id} not found")
        
        return dict(result._mapping)
