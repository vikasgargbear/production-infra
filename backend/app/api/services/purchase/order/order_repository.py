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

from .....core.utils.constants import ProductDefaults, PackDefaults, SourceType

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
            "uom": item.get("uom", ProductDefaults.DEFAULT_BASE_UOM),
            "pack_type": item.get("pack_type", PackDefaults.PACK_TYPE),
            "pack_size": item.get("pack_size", PackDefaults.PACK_SIZE),
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
    
    @staticmethod
    def list_orders(
        db: Session,
        org_id: str,
        skip: int = 0,
        limit: int = 25,
        search: Optional[str] = None,
        status: Optional[str] = None,
        supplier_id: Optional[int] = None,
        date_filter: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        List purchase orders with filters and pagination.
        
        Args:
            db: Database session
            org_id: Organization ID
            skip: Offset for pagination
            limit: Number of records to return
            search: Search term for PO number or supplier name
            status: Filter by PO status
            supplier_id: Filter by supplier
            date_filter: Filter by date (today, week, month)
            
        Returns:
            Dict with purchases list and pagination info
        """
        from datetime import datetime, timedelta
        
        # Build WHERE clauses
        where_clauses = ["p.org_id = :org_id"]
        params = {"org_id": org_id, "limit": limit, "skip": skip}
        
        if search:
            where_clauses.append("(p.po_number ILIKE :search OR p.supplier_name ILIKE :search)")
            params["search"] = f"%{search}%"
        
        if status:
            where_clauses.append("p.po_status = :po_status")
            params["po_status"] = status
        
        if supplier_id:
            where_clauses.append("p.supplier_id = :supplier_id")
            params["supplier_id"] = supplier_id
        
        if date_filter:
            today = datetime.now().date()
            if date_filter == "today":
                where_clauses.append("DATE(p.po_date) = :filter_date")
                params["filter_date"] = today
            elif date_filter == "week":
                where_clauses.append("DATE(p.po_date) >= :filter_date")
                params["filter_date"] = today - timedelta(days=7)
            elif date_filter == "month":
                where_clauses.append("DATE(p.po_date) >= :filter_date")
                params["filter_date"] = today - timedelta(days=30)
        
        where_sql = " AND ".join(where_clauses)
        
        # Count query
        count_result = db.execute(text(f"""
            SELECT COUNT(DISTINCT p.purchase_order_id) as total
            FROM procurement.purchase_orders p
            WHERE {where_sql}
        """), params)
        total_count = count_result.scalar() or 0
        
        # Main query with pagination
        result = db.execute(text(f"""
            SELECT 
                p.purchase_order_id,
                p.po_number,
                p.po_date,
                p.po_type,
                p.supplier_id,
                p.supplier_name,
                p.subtotal_amount,
                p.tax_amount,
                p.total_amount,
                p.po_status,
                p.receipt_status,
                p.expected_delivery_date,
                p.created_at,
                COUNT(poi.po_item_id) as items_count
            FROM procurement.purchase_orders p
            LEFT JOIN procurement.purchase_order_items poi 
                ON p.purchase_order_id = poi.purchase_order_id
            WHERE {where_sql}
            GROUP BY p.purchase_order_id, p.po_number, p.po_date, p.po_type,
                     p.supplier_id, p.supplier_name, p.subtotal_amount,
                     p.tax_amount, p.total_amount, p.po_status, p.receipt_status,
                     p.expected_delivery_date, p.created_at
            ORDER BY p.po_date DESC, p.created_at DESC
            LIMIT :limit OFFSET :skip
        """), params)
        
        purchases = []
        for row in result:
            purchase = dict(row._mapping)
            # Add default payment_status if not in DB
            purchase['payment_status'] = 'pending'
            purchases.append(purchase)
        
        # Calculate pagination
        total_pages = (total_count + limit - 1) // limit if limit > 0 else 1
        current_page = (skip // limit) + 1 if limit > 0 else 1
        
        return {
            "purchases": purchases,
            "pagination": {
                "total": total_count,
                "page": current_page,
                "per_page": limit,
                "total_pages": total_pages
            }
        }
    
    @staticmethod
    def get_pending_receipt_orders(
        db: Session,
        org_id: str,
        supplier_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Get purchase orders pending receipt."""
        query = """
            SELECT 
                p.purchase_order_id,
                p.po_number,
                p.po_date,
                p.supplier_id,
                p.supplier_name,
                p.total_amount,
                p.po_status,
                p.receipt_status
            FROM procurement.purchase_orders p
            WHERE p.org_id = :org_id
              AND p.receipt_status IN ('pending', 'partial')
              AND p.po_status IN ('approved', 'confirmed')
        """
        params = {"org_id": org_id}
        
        if supplier_id:
            query += " AND p.supplier_id = :supplier_id"
            params["supplier_id"] = supplier_id
        
        query += " ORDER BY p.po_date DESC"
        
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result]
    
    # ==================== PRODUCT/BATCH HELPERS ====================
    
    @staticmethod
    def lookup_products_by_name(db: Session, org_id: str, product_names: List[str]) -> Dict[str, int]:
        """Batch lookup products by name. Returns dict of name_key -> product_id."""
        if not product_names:
            return {}
        result = db.execute(text("""
            SELECT product_id, LOWER(TRIM(product_name)) as name_key
            FROM inventory.products 
            WHERE LOWER(TRIM(product_name)) = ANY(:names)
            AND org_id = :org_id
        """), {"names": [n.lower().strip() for n in product_names], "org_id": org_id})
        return {row.name_key: row.product_id for row in result}
    
    @staticmethod
    def get_default_category(db: Session, org_id: str) -> Optional[int]:
        """Get default product category for org."""
        result = db.execute(text("""
            SELECT category_id FROM inventory.product_categories 
            WHERE org_id = :org_id
            ORDER BY category_id LIMIT 1
        """), {"org_id": org_id}).fetchone()
        return result.category_id if result else None
    
    @staticmethod
    def create_category(db: Session, org_id: str, category_name: str) -> int:
        """Create a new product category. Returns category_id."""
        result = db.execute(text("""
            INSERT INTO inventory.product_categories (org_id, category_name, is_active)
            VALUES (:org_id, :name, true) RETURNING category_id
        """), {"org_id": org_id, "name": category_name})
        return result.scalar()
    
    @staticmethod
    def create_batch(
        db: Session, org_id: str, batch_data: Dict[str, Any]
    ) -> int:
        """Create a new inventory batch. Returns batch_id."""
        result = db.execute(text("""
            INSERT INTO inventory.batches (
                org_id, product_id, batch_number, manufacturing_date, expiry_date,
                quantity_purchased, quantity_available,
                purchase_price, mrp_per_unit, sale_price_per_unit,
                created_at
            ) VALUES (
                :org_id, :product_id, :batch_number, :mfg_date, :exp_date,
                :qty, :qty,
                :purchase_price, :mrp, :sale_price,
                CURRENT_TIMESTAMP
            ) RETURNING batch_id
        """), {
            "org_id": org_id,
            "product_id": batch_data.get("product_id"),
            "batch_number": batch_data.get("batch_number", ""),
            "mfg_date": batch_data.get("manufacturing_date"),
            "exp_date": batch_data.get("expiry_date"),
            "qty": batch_data.get("quantity", 0),
            "purchase_price": batch_data.get("purchase_price", 0),
            "mrp": batch_data.get("mrp", 0),
            "sale_price": batch_data.get("sale_price", 0)
        })
        return result.scalar()
    
    @staticmethod
    def update_batch_quantity(db: Session, batch_id: int, qty_to_add: int) -> None:
        """Add quantity to existing batch."""
        db.execute(text("""
            UPDATE inventory.batches 
            SET quantity_available = quantity_available + :qty,
                quantity_purchased = quantity_purchased + :qty
            WHERE batch_id = :batch_id
        """), {"qty": qty_to_add, "batch_id": batch_id})
    
    @staticmethod
    def find_existing_batch(
        db: Session, product_id: int, batch_number: str
    ) -> Optional[int]:
        """Find existing batch by product and batch number. Returns batch_id or None."""
        result = db.execute(text("""
            SELECT batch_id FROM inventory.batches 
            WHERE product_id = :product_id AND batch_number = :batch_number
            LIMIT 1
        """), {"product_id": product_id, "batch_number": batch_number}).fetchone()
        return result.batch_id if result else None
    
    @staticmethod
    def create_direct_order_header(
        db: Session, org_id: str, branch_id: int, order_data: Dict[str, Any]
    ) -> int:
        """Create a completed PO for direct purchase entry. Returns purchase_order_id."""
        result = db.execute(text("""
            INSERT INTO procurement.purchase_orders (
                org_id, branch_id, po_number, po_date, po_type,
                supplier_id, supplier_name,
                subtotal_amount, tax_amount, total_amount,
                po_status, receipt_status, created_at
            ) VALUES (
                :org_id, :branch_id, :po_number, :po_date, 'regular',
                :supplier_id, :supplier_name,
                :subtotal, :tax, :total,
                'completed', 'received', CURRENT_TIMESTAMP
            ) RETURNING purchase_order_id
        """), {
            "org_id": org_id,
            "branch_id": branch_id,
            "po_number": order_data.get("po_number"),
            "po_date": order_data.get("po_date", date.today()),
            "supplier_id": order_data.get("supplier_id"),
            "supplier_name": order_data.get("supplier_name", "Direct Purchase"),
            "subtotal": order_data.get("subtotal_amount", 0),
            "tax": order_data.get("tax_amount", 0),
            "total": order_data.get("total_amount", 0)
        })
        return result.scalar()
    
    @staticmethod
    def create_direct_order_item(
        db: Session, order_id: int, item: Dict[str, Any]
    ) -> int:
        """Create item for direct purchase. Returns po_item_id."""
        result = db.execute(text("""
            INSERT INTO procurement.purchase_order_items (
                purchase_order_id, product_id, product_name, hsn_code,
                quantity, uom, unit_price, mrp,
                taxable_amount, tax_percent, tax_amount, line_total,
                quantity_received, created_at
            ) VALUES (
                :order_id, :product_id, :product_name, :hsn_code,
                :qty, :uom, :unit_price, :mrp,
                :taxable, :tax_percent, :tax_amount, :line_total,
                :qty, CURRENT_TIMESTAMP
            ) RETURNING po_item_id
        """), {
            "order_id": order_id,
            "product_id": item.get("product_id"),
            "product_name": item.get("product_name", ""),
            "hsn_code": item.get("hsn_code", ""),
            "qty": item.get("quantity", 0),
            "uom": item.get("uom", "PCS"),
            "unit_price": item.get("unit_price", 0),
            "mrp": item.get("mrp", 0),
            "taxable": item.get("taxable_amount", 0),
            "tax_percent": item.get("tax_percent", 0),
            "tax_amount": item.get("tax_amount", 0),
            "line_total": item.get("line_total", 0)
        })
        return result.scalar()
    
    @staticmethod
    def create_purchase_batch(
        db: Session, org_id: str, batch_data: Dict[str, Any]
    ) -> int:
        """Create a batch for purchase with all fields. Returns batch_id."""
        result = db.execute(text("""
            INSERT INTO inventory.batches (
                org_id, product_id,
                batch_number, expiry_date,
                initial_quantity, quantity_available,
                cost_per_unit, mrp_per_unit, sale_price_per_unit,
                source_type, 
                pack_type, pack_size, pack_uom, base_uom, units_per_pack,
                batch_status, expiry_status,
                created_at
            ) VALUES (
                :org_id, :product_id,
                :batch_number, :expiry_date,
                :quantity, :quantity,
                :cost_price, :mrp, :selling_price,
                :source_type,
                :pack_type, :pack_size, :pack_uom, :base_uom, :units_per_pack,
                'active', 'normal',
                CURRENT_TIMESTAMP
            ) RETURNING batch_id
        """), {
            "org_id": org_id,
            "product_id": batch_data.get("product_id"),
            "batch_number": batch_data.get("batch_number", ""),
            "expiry_date": batch_data.get("expiry_date"),
            "quantity": batch_data.get("quantity", 0),
            "cost_price": batch_data.get("cost_price", 0),
            "mrp": batch_data.get("mrp", 0),
            "selling_price": batch_data.get("selling_price", 0),
            "source_type": SourceType.PURCHASE.value,
            "pack_type": batch_data.get("pack_type", PackDefaults.PACK_TYPE),
            "pack_size": batch_data.get("pack_size", PackDefaults.PACK_SIZE),
            "pack_uom": batch_data.get("pack_uom", PackDefaults.PACK_UOM),
            "base_uom": batch_data.get("base_uom", ProductDefaults.DEFAULT_BASE_UOM),
            "units_per_pack": batch_data.get("units_per_pack", PackDefaults.PACK_SIZE)
        })
        return result.scalar()
    
    @staticmethod
    def create_supplier_invoice_item(
        db: Session, invoice_id: int, item: Dict[str, Any]
    ) -> None:
        """Create a supplier invoice item record."""
        db.execute(text("""
            INSERT INTO procurement.supplier_invoice_items (
                supplier_invoice_id, product_id, batch_id,
                batch_number, quantity, free_quantity,
                unit_price, discount_percent, discount_amount,
                taxable_amount, cgst_percent, sgst_percent, igst_percent,
                cgst_amount, sgst_amount, igst_amount, total_amount,
                hsn_code, unit, pack_type, pack_size
            ) VALUES (
                :invoice_id, :product_id, :batch_id,
                :batch_number, :quantity, :free_quantity,
                :unit_price, :disc_percent, :disc_amount,
                :taxable_amount, :cgst_percent, :sgst_percent, :igst_percent,
                :cgst_amount, :sgst_amount, :igst_amount, :total_amount,
                :hsn_code, :unit, :pack_type, :pack_size
            )
        """), {
            "invoice_id": invoice_id,
            "product_id": item.get("product_id"),
            "batch_id": item.get("batch_id"),
            "batch_number": item.get("batch_number"),
            "quantity": item.get("quantity", 0),
            "free_quantity": item.get("free_quantity", 0),
            "unit_price": item.get("unit_price", 0),
            "disc_percent": item.get("discount_percent", 0),
            "disc_amount": item.get("discount_amount", 0),
            "taxable_amount": item.get("taxable_amount", 0),
            "cgst_percent": item.get("cgst_percent", 0),
            "sgst_percent": item.get("sgst_percent", 0),
            "igst_percent": item.get("igst_percent", 0),
            "cgst_amount": item.get("cgst_amount", 0),
            "sgst_amount": item.get("sgst_amount", 0),
            "igst_amount": item.get("igst_amount", 0),
            "total_amount": item.get("total_amount", 0),
            "hsn_code": item.get("hsn_code"),
            "unit": item.get("unit", ProductDefaults.DEFAULT_BASE_UOM),
            "pack_type": item.get("pack_type", PackDefaults.PACK_TYPE),
            "pack_size": item.get("pack_size", PackDefaults.PACK_SIZE)
        })
    
    @staticmethod
    def create_po_header_simple(
        db: Session, org_id: str, branch_id: int, order_data: Dict[str, Any], created_by: int
    ) -> int:
        """Create a simplified PO header. Returns purchase_order_id."""
        result = db.execute(text("""
            INSERT INTO procurement.purchase_orders (
                org_id, po_number, po_date,
                supplier_id, supplier_name,
                subtotal_amount, discount_amount, tax_amount, 
                other_charges, total_amount, po_status,
                payment_terms, notes, created_by, branch_id
            ) VALUES (
                :org_id, :purchase_number, :po_date,
                :supplier_id, :supplier_name,
                :subtotal, :discount, :tax, :other_charges, :total,
                :status, :payment_mode, :notes, :created_by, :branch_id
            ) RETURNING purchase_order_id
        """), {
            "org_id": org_id,
            "purchase_number": order_data.get("purchase_number"),
            "po_date": order_data.get("po_date"),
            "supplier_id": order_data.get("supplier_id"),
            "supplier_name": order_data.get("supplier_name"),
            "subtotal": order_data.get("subtotal", 0),
            "discount": order_data.get("discount", 0),
            "tax": order_data.get("tax", 0),
            "other_charges": order_data.get("other_charges", 0),
            "total": order_data.get("total", 0),
            "status": order_data.get("status", "draft"),
            "payment_mode": order_data.get("payment_mode", "cash"),
            "notes": order_data.get("notes"),
            "created_by": created_by,
            "branch_id": branch_id
        })
        return result.scalar()
    
    @staticmethod
    def create_supplier_invoice_with_po(
        db: Session, org_id: str, branch_id: int, 
        invoice_data: Dict[str, Any], purchase_id: int, created_by: int
    ) -> int:
        """Create supplier invoice linked to a PO. Returns supplier_invoice_id."""
        result = db.execute(text("""
            INSERT INTO procurement.supplier_invoices (
                org_id, branch_id, supplier_invoice_number, invoice_date,
                supplier_id, purchase_order_ids,
                subtotal_amount, discount_amount, taxable_amount,
                cgst_amount, sgst_amount, igst_amount, tax_amount,
                freight_charges, insurance_charges, other_charges,
                round_off_amount, invoice_total,
                payment_terms, due_date, payment_status,
                invoice_status, created_by
            ) VALUES (
                :org_id, :branch_id, :invoice_number, :invoice_date,
                :supplier_id, ARRAY[:purchase_id]::integer[],
                :subtotal, :discount, :taxable,
                :cgst, :sgst, :igst, :tax,
                :freight, :insurance, :other,
                :round_off, :total,
                :payment_terms, :due_date, :payment_status,
                :invoice_status, :created_by
            ) RETURNING supplier_invoice_id
        """), {
            "org_id": org_id,
            "branch_id": branch_id,
            "invoice_number": invoice_data.get("invoice_number"),
            "invoice_date": invoice_data.get("invoice_date"),
            "supplier_id": invoice_data.get("supplier_id"),
            "purchase_id": purchase_id,
            "subtotal": invoice_data.get("subtotal", 0),
            "discount": invoice_data.get("discount", 0),
            "taxable": invoice_data.get("taxable", 0),
            "cgst": invoice_data.get("cgst", 0),
            "sgst": invoice_data.get("sgst", 0),
            "igst": invoice_data.get("igst", 0),
            "tax": invoice_data.get("tax", 0),
            "freight": invoice_data.get("freight", 0),
            "insurance": invoice_data.get("insurance", 0),
            "other": invoice_data.get("other", 0),
            "round_off": invoice_data.get("round_off", 0),
            "total": invoice_data.get("total", 0),
            "payment_terms": invoice_data.get("payment_terms", "immediate"),
            "due_date": invoice_data.get("due_date"),
            "payment_status": invoice_data.get("payment_status", "pending"),
            "invoice_status": invoice_data.get("invoice_status", "draft"),
            "created_by": created_by
        })
        return result.scalar()
    
    @staticmethod
    def create_po_item(
        db: Session, item_data: Dict[str, Any]
    ) -> int:
        """Create a PO item record. Returns po_item_id."""
        result = db.execute(text("""
            INSERT INTO procurement.purchase_order_items (
                purchase_order_id, product_id, product_name,
                ordered_quantity, unit_price, free_quantity,
                uom, pack_type,
                discount_percent, discount_amount,
                taxable_amount, tax_percent, tax_amount, line_total,
                batch_number, expiry_date, hsn_code
            ) VALUES (
                :purchase_order_id, :product_id, :product_name,
                :ordered_quantity, :unit_price, :free_quantity,
                :uom, :pack_type,
                :discount_percent, :discount_amount,
                :taxable_amount, :tax_percent, :tax_amount, :line_total,
                :batch_number, :expiry_date, :hsn_code
            ) RETURNING po_item_id
        """), item_data)
        return result.scalar()
    
    @staticmethod
    def generate_batch_number(db: Session) -> str:
        """Generate a random batch number."""
        from datetime import datetime
        random_part = db.execute(text("SELECT floor(random() * 10000)::int")).scalar()
        return f"BATCH{datetime.now().strftime('%y%m')}{str(random_part).zfill(4)}"
    
    @staticmethod
    def check_po_item_exists(
        db: Session, item_id: int, purchase_id: int
    ) -> bool:
        """Check if PO item exists for a purchase order."""
        result = db.execute(text("""
            SELECT po_item_id FROM procurement.purchase_order_items
            WHERE po_item_id = :item_id AND purchase_order_id = :purchase_id
        """), {"item_id": item_id, "purchase_id": purchase_id}).first()
        return result is not None
    
    @staticmethod
    def update_po_item_dynamic(
        db: Session, item_id: int, org_id: str, updates: List[str], params: Dict[str, Any]
    ) -> None:
        """Update PO item with dynamic fields."""
        if not updates:
            return
        query = f"""
            UPDATE procurement.purchase_order_items
            SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP
            WHERE po_item_id = :item_id
            AND purchase_order_id IN (
                SELECT purchase_order_id FROM procurement.purchase_orders WHERE org_id = :org_id
            )
        """
        db.execute(text(query), {**params, "item_id": item_id, "org_id": org_id})
    
    @staticmethod
    def get_purchase_for_receive(db: Session, purchase_id: int, org_id: str) -> Optional[Dict[str, Any]]:
        """Get purchase order for receiving."""
        result = db.execute(text("""
            SELECT * FROM procurement.purchase_orders 
            WHERE purchase_order_id = :id AND org_id = :org_id
        """), {"id": purchase_id, "org_id": org_id}).first()
        return dict(result._mapping) if result else None
    
    @staticmethod
    def update_receive_item(
        db: Session, item_id: int, purchase_id: int, params: Dict[str, Any], extra_fields: List[str]
    ) -> None:
        """Update PO item for receiving."""
        update_fields = ["received_quantity = :received_quantity"] + extra_fields
        query = f"""
            UPDATE procurement.purchase_order_items 
            SET {', '.join(update_fields)}, item_status = 'received'
            WHERE po_item_id = :item_id AND po_id = :purchase_id
        """
        db.execute(text(query), {**params, "item_id": item_id, "purchase_id": purchase_id})
    
    @staticmethod
    def mark_po_received(db: Session, purchase_id: int, grn_number: str) -> None:
        """Mark purchase order as received with GRN."""
        db.execute(text("""
            UPDATE procurement.purchase_orders 
            SET po_status = 'received', grn_number = :grn_number, grn_date = CURRENT_DATE
            WHERE purchase_order_id = :purchase_id
        """), {"grn_number": grn_number, "purchase_id": purchase_id})
    
    @staticmethod
    def count_purchase_batches(db: Session, purchase_id: int, org_id: str) -> int:
        """Count batches created for a purchase."""
        result = db.execute(text("""
            SELECT COUNT(*) FROM inventory.batches
            WHERE purchase_id = :id AND org_id = :org_id
        """), {"id": purchase_id, "org_id": org_id})
        return result.scalar() or 0

    # ==================== PO → PURCHASE ENTRY HELPERS ====================

    @staticmethod
    def get_po_with_remaining_items(db: Session, po_id: int, org_id: str) -> Optional[Dict[str, Any]]:
        """
        Get PO header + items with remaining quantities for Purchase Entry pre-fill.
        Only returns items where remaining_qty > 0.
        """
        # Get PO header with supplier info
        po = db.execute(text("""
            SELECT po.purchase_order_id, po.po_number, po.po_date, po.po_status,
                   po.supplier_id, po.supplier_name, po.payment_terms, po.notes,
                   po.subtotal_amount, po.discount_amount, po.tax_amount, po.total_amount,
                   s.gst_number as supplier_gst_number, s.address as supplier_address,
                   s.phone as supplier_phone
            FROM procurement.purchase_orders po
            LEFT JOIN parties.suppliers s ON po.supplier_id = s.supplier_id
            WHERE po.purchase_order_id = :po_id AND po.org_id = :org_id
              AND po.po_status NOT IN ('completed', 'cancelled')
        """), {"po_id": po_id, "org_id": org_id}).first()

        if not po:
            return None

        # Get items with remaining quantities
        items = db.execute(text("""
            SELECT poi.po_item_id, poi.product_id, poi.product_name, poi.hsn_code,
                   poi.ordered_quantity, COALESCE(poi.received_quantity, 0) as received_quantity,
                   (poi.ordered_quantity - COALESCE(poi.received_quantity, 0)) as remaining_quantity,
                   poi.unit_price, poi.mrp, poi.discount_percent, poi.tax_percent,
                   poi.uom, poi.pack_type, poi.pack_size, poi.free_quantity,
                   poi.batch_number, poi.expiry_date, poi.manufacturing_date
            FROM procurement.purchase_order_items poi
            WHERE poi.purchase_order_id = :po_id
              AND (poi.ordered_quantity - COALESCE(poi.received_quantity, 0)) > 0
              AND COALESCE(poi.item_status, 'pending') != 'cancelled'
            ORDER BY poi.po_item_id
        """), {"po_id": po_id})

        return {
            **dict(po._mapping),
            "items": [dict(row._mapping) for row in items]
        }

    @staticmethod
    def increment_received_quantity(db: Session, po_item_id: int, qty: Decimal) -> None:
        """Atomically increment received_quantity on a PO item."""
        db.execute(text("""
            UPDATE procurement.purchase_order_items
            SET received_quantity = COALESCE(received_quantity, 0) + :qty
            WHERE po_item_id = :po_item_id
        """), {"qty": qty, "po_item_id": po_item_id})

    @staticmethod
    def compute_and_update_po_status(db: Session, po_id: int) -> str:
        """
        Compute PO status based on all items' received vs ordered quantities.
        Returns the new status: 'partial' or 'completed'.
        """
        result = db.execute(text("""
            SELECT
                SUM(ordered_quantity) as total_ordered,
                SUM(COALESCE(received_quantity, 0)) as total_received
            FROM procurement.purchase_order_items
            WHERE purchase_order_id = :po_id
              AND COALESCE(item_status, 'pending') != 'cancelled'
        """), {"po_id": po_id}).first()

        total_ordered = result.total_ordered or 0
        total_received = result.total_received or 0

        if total_received >= total_ordered:
            new_status = "completed"
            receipt_status = "received"
        elif total_received > 0:
            new_status = "partial"
            receipt_status = "partial"
        else:
            new_status = "draft"
            receipt_status = "pending"

        db.execute(text("""
            UPDATE procurement.purchase_orders
            SET po_status = :status, receipt_status = :receipt_status, updated_at = CURRENT_TIMESTAMP
            WHERE purchase_order_id = :po_id
        """), {"status": new_status, "receipt_status": receipt_status, "po_id": po_id})

        return new_status

    @staticmethod
    def create_auto_grn(
        db: Session, org_id: str, branch_id: int,
        grn_number: str, supplier_id: int, supplier_invoice_id: int,
        supplier_invoice_number: str, items: List[Dict[str, Any]],
        created_by: int, purchase_order_id: Optional[int] = None,
        source: str = 'DIRECT'
    ) -> int:
        """
        Create a GRN as an audit log record (no inventory movement).
        Sets stock_updated=True to prevent double-counting.
        Returns grn_id.
        """
        grn_result = db.execute(text("""
            INSERT INTO procurement.goods_receipt_notes (
                org_id, branch_id, grn_number, grn_date, grn_type,
                purchase_order_id, supplier_id,
                supplier_invoice_number, supplier_invoice_date,
                received_by, qc_required, qc_status,
                grn_status, approval_status,
                stock_updated, stock_updated_at,
                source, supplier_invoice_id,
                created_at, updated_at
            ) VALUES (
                :org_id, :branch_id, :grn_number, CURRENT_DATE, 'purchase',
                :purchase_order_id, :supplier_id,
                :supplier_invoice_number, CURRENT_DATE,
                :received_by, false, 'not_required',
                'completed', 'approved',
                true, CURRENT_TIMESTAMP,
                :source, :supplier_invoice_id,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING grn_id
        """), {
            "org_id": org_id,
            "branch_id": branch_id,
            "grn_number": grn_number,
            "purchase_order_id": purchase_order_id,
            "supplier_id": supplier_id,
            "supplier_invoice_number": supplier_invoice_number,
            "received_by": created_by,
            "source": source,
            "supplier_invoice_id": supplier_invoice_id
        })
        grn_id = grn_result.scalar()

        # Create GRN items
        for item in items:
            db.execute(text("""
                INSERT INTO procurement.grn_items (
                    grn_id, po_item_id, product_id,
                    batch_number, expiry_date, manufacturing_date,
                    ordered_quantity, received_quantity, accepted_quantity,
                    free_quantity, uom, pack_type, pack_size,
                    unit_price, mrp,
                    qc_status, item_status
                ) VALUES (
                    :grn_id, :po_item_id, :product_id,
                    :batch_number, :expiry_date, :manufacturing_date,
                    :ordered_quantity, :received_quantity, :received_quantity,
                    :free_quantity, :uom, :pack_type, :pack_size,
                    :unit_price, :mrp,
                    'approved', 'accepted'
                )
            """), {
                "grn_id": grn_id,
                "po_item_id": item.get("po_item_id"),
                "product_id": item.get("product_id"),
                "batch_number": item.get("batch_number", ""),
                "expiry_date": item.get("expiry_date"),
                "manufacturing_date": item.get("manufacturing_date"),
                "ordered_quantity": item.get("ordered_quantity", item.get("quantity", 0)),
                "received_quantity": item.get("quantity", 0),
                "free_quantity": item.get("free_quantity", 0),
                "uom": item.get("uom", ProductDefaults.DEFAULT_BASE_UOM),
                "pack_type": item.get("pack_type", PackDefaults.PACK_TYPE),
                "pack_size": item.get("pack_size", PackDefaults.PACK_SIZE),
                "unit_price": item.get("cost_price", item.get("unit_price", 0)),
                "mrp": item.get("mrp", 0)
            })

        return grn_id
