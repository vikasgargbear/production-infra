"""
Purchase Order Repository - Data Access Layer
All SQL queries for purchase order operations
"""
from typing import Optional, Dict, Any, List
from datetime import date
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)


class PurchaseOrderRepository:
    """Pure data access layer for purchase orders - no business logic"""
    
    @staticmethod
    def create_order_header(
        db: Session,
        org_id: str,
        branch_id: int,
        order_data: Dict[str, Any],
        totals: Dict[str, Any],
        user_id: int
    ) -> int:
        """
        Create purchase order header record.
        
        Returns:
            purchase_order_id
        """
        result = db.execute(text("""
            INSERT INTO procurement.purchase_orders (
                org_id, branch_id, po_number, po_date, po_type,
                supplier_id, supplier_name,
                subtotal_amount, discount_amount, taxable_amount,
                tax_amount, total_amount,
                expected_delivery_date, delivery_address,
                payment_terms, po_status, receipt_status,
                notes, created_by, created_at, updated_at
            ) VALUES (
                :org_id, :branch_id, :po_number, :po_date, :po_type,
                :supplier_id, :supplier_name,
                :subtotal_amount, :discount_amount, :taxable_amount,
                :tax_amount, :total_amount,
                :expected_delivery_date, :delivery_address,
                :payment_terms, :po_status, :receipt_status,
                :notes, :created_by, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING purchase_order_id
        """), {
            "org_id": org_id,
            "branch_id": branch_id,
            "po_number": order_data.get("po_number"),
            "po_date": order_data.get("po_date", date.today()),
            "po_type": order_data.get("po_type", "regular"),
            "supplier_id": order_data.get("supplier_id"),
            "supplier_name": order_data.get("supplier_name", ""),
            "subtotal_amount": Decimal(str(totals.get('subtotal_amount', 0))),
            "discount_amount": Decimal(str(totals.get('discount_amount', 0))),
            "taxable_amount": Decimal(str(totals.get('taxable_amount', 0))),
            "tax_amount": Decimal(str(totals.get('tax_amount', 0))),
            "total_amount": Decimal(str(totals.get('total_amount', 0))),
            "expected_delivery_date": order_data.get("expected_delivery_date"),
            "delivery_address": order_data.get("delivery_address"),
            "payment_terms": order_data.get("payment_terms", "immediate"),
            "po_status": order_data.get("po_status", "draft"),
            "receipt_status": order_data.get("receipt_status", "pending"),
            "notes": order_data.get("notes"),
            "created_by": user_id
        })
        
        return result.scalar()
    
    @staticmethod
    def create_order_item(
        db: Session,
        order_id: int,
        item: Dict[str, Any],
        display_order: int
    ) -> int:
        """Create a purchase order item. Returns po_item_id."""
        result = db.execute(text("""
            INSERT INTO procurement.purchase_order_items (
                purchase_order_id, product_id, product_name, hsn_code,
                quantity, uom, pack_type, pack_size,
                unit_price, mrp, discount_percent, discount_amount,
                taxable_amount, tax_percent, tax_amount, line_total,
                free_quantity, display_order, created_at
            ) VALUES (
                :purchase_order_id, :product_id, :product_name, :hsn_code,
                :quantity, :uom, :pack_type, :pack_size,
                :unit_price, :mrp, :discount_percent, :discount_amount,
                :taxable_amount, :tax_percent, :tax_amount, :line_total,
                :free_quantity, :display_order, CURRENT_TIMESTAMP
            ) RETURNING po_item_id
        """), {
            "purchase_order_id": order_id,
            "product_id": item.get("product_id"),
            "product_name": item.get("product_name", ""),
            "hsn_code": item.get("hsn_code"),
            "quantity": Decimal(str(item.get("quantity", 0))),
            "uom": item.get("uom", "NOS"),
            "pack_type": item.get("pack_type", "PACK"),
            "pack_size": item.get("pack_size", 1),
            "unit_price": Decimal(str(item.get("unit_price", 0))),
            "mrp": Decimal(str(item.get("mrp", 0))),
            "discount_percent": Decimal(str(item.get("discount_percent", 0))),
            "discount_amount": Decimal(str(item.get("discount_amount", 0))),
            "taxable_amount": Decimal(str(item.get("taxable_amount", 0))),
            "tax_percent": Decimal(str(item.get("tax_percent", 0))),
            "tax_amount": Decimal(str(item.get("tax_amount", 0))),
            "line_total": Decimal(str(item.get("line_total", 0))),
            "free_quantity": Decimal(str(item.get("free_quantity", 0))),
            "display_order": display_order
        })
        
        return result.scalar()
    
    @staticmethod
    def get_order_by_id(db: Session, order_id: int, org_id: str) -> Optional[Dict[str, Any]]:
        """Get purchase order by ID."""
        result = db.execute(text("""
            SELECT po.*, s.supplier_name as supplier_display_name
            FROM procurement.purchase_orders po
            LEFT JOIN parties.suppliers s ON po.supplier_id = s.supplier_id
            WHERE po.purchase_order_id = :order_id AND po.org_id = :org_id
        """), {"order_id": order_id, "org_id": org_id}).first()
        
        if not result:
            return None
        
        return dict(result._mapping)
    
    @staticmethod
    def get_order_items(db: Session, order_id: int) -> List[Dict[str, Any]]:
        """Get all items for a purchase order."""
        result = db.execute(text("""
            SELECT poi.*, p.product_name as product_display_name, p.hsn_code as product_hsn
            FROM procurement.purchase_order_items poi
            LEFT JOIN inventory.products p ON poi.product_id = p.product_id
            WHERE poi.purchase_order_id = :order_id
            ORDER BY poi.display_order, poi.po_item_id
        """), {"order_id": order_id})
        
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def update_order_status(
        db: Session,
        order_id: int,
        po_status: Optional[str] = None,
        receipt_status: Optional[str] = None
    ) -> None:
        """Update purchase order status."""
        updates = []
        params = {"order_id": order_id}
        
        if po_status:
            updates.append("po_status = :po_status")
            params["po_status"] = po_status
        if receipt_status:
            updates.append("receipt_status = :receipt_status")
            params["receipt_status"] = receipt_status
        
        if updates:
            updates.append("updated_at = CURRENT_TIMESTAMP")
            db.execute(text(f"""
                UPDATE procurement.purchase_orders
                SET {", ".join(updates)}
                WHERE purchase_order_id = :order_id
            """), params)
