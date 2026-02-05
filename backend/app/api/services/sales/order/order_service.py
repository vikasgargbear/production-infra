"""
Order Service - Orchestrates order operations
Delegates to repository, validator, and calculator
"""
from sqlalchemy.orm import Session
from typing import Dict, Any, List
from datetime import date
import logging

from .order_repository import OrderRepository
from .order_validator import OrderValidator
from ..invoice.invoice_service import InvoiceService as InvoiceCalc
from ...document_number_service import DocumentNumberService

logger = logging.getLogger(__name__)


class OrderService:
    """
    High-level order operations
    Orchestrates repository, validator, and calculator
    """
    
    @staticmethod
    def create_order_with_items(
        db: Session,
        org_id: str,
        user_id: int,
        branch_id: int,
        order_data: Any
    ) -> Dict[str, Any]:
        """
        Create order with full validation.
        Orchestrates: validate → get context → calculate → create
        
        Args:
            db: Database session
            org_id: Organization ID
            user_id: User ID from JWT
            branch_id: Branch ID from JWT
            order_data: Pydantic OrderCreateRequest
            
        Returns:
            Dict with order_id, order_number, final_amount
        """
        try:
            # 1. Validate input
            OrderValidator.validate_order_data(order_data)
            
            # 2. Get context (customer, org data)
            context = OrderRepository.get_order_context(
                db, org_id, order_data.customer_id
            )
            
            # Use JWT values, fallback to context
            actual_branch_id = branch_id or context["branch_id"]
            actual_user_id = user_id or context["user_id"]
            
            # 3. Calculate totals
            items = [item.model_dump() if hasattr(item, 'model_dump') else item 
                    for item in order_data.items]
            
            totals = InvoiceCalc.calculate_invoice_totals(
                items=items,
                gst_type=getattr(order_data, 'gst_type', 'CGST/SGST'),
                freight_charges=float(getattr(order_data, 'freight_charges', 0) or 0),
                insurance_charges=float(getattr(order_data, 'insurance_charges', 0) or 0),
                other_charges=float(getattr(order_data, 'other_charges', 0) or 0),
                discount_type=getattr(order_data, 'discount_type', 'percentage'),
                discount_percent=float(getattr(order_data, 'discount_percent', 0) or 0),
                discount_amount=float(getattr(order_data, 'discount_amount', 0) or 0)
            )
            
            # 4. Generate order number
            order_number = DocumentNumberService.generate_number(db, "sales_order", org_id)
            
            # 5. Create order
            order_id = OrderRepository.create_order(
                db=db,
                org_id=org_id,
                branch_id=actual_branch_id,
                order_number=order_number,
                order_date=order_data.order_date,
                customer_id=order_data.customer_id,
                totals=totals,
                created_by=actual_user_id
            )
            
            # 6. Prepare order items data
            order_items_data = OrderService._prepare_order_items(
                db, org_id, order_id, items, totals
            )
            
            # 7. Create order items
            OrderRepository.create_order_items_bulk(db, order_items_data)
            
            # 8. Commit transaction
            db.commit()
            
            logger.info(f"✅ Order {order_number} created successfully (ID: {order_id})")
            
            return {
                "order_id": order_id,
                "order_number": order_number,
                "final_amount": totals["final_amount"],
                "items_created": len(order_items_data)
            }
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error creating order: {e}")
            raise
    
    @staticmethod
    def _prepare_order_items(
        db: Session,
        org_id: str,
        order_id: int,
        items: List[Dict],
        totals: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Prepare order items data with product/batch lookups.
        Returns list of dicts ready for bulk insert.
        """
        # Extract product and batch IDs
        product_ids = [int(item.get("product_id")) for item in items]
        batch_ids = [
            int(item.get("batch_id")) 
            for item in items 
            if item.get("batch_id") and str(item.get("batch_id")).isdigit()
        ]
        
        # Batch fetch products and batches
        products_lookup, batches_lookup, fifo_batches = OrderRepository.get_products_and_batches(
            db, org_id, product_ids, batch_ids
        )
        
        # Get line calculations from totals
        line_calculations = totals.get("line_calculations", [])
        
        # Prepare items data
        order_items_data = []
        
        for i, item in enumerate(items):
            product_id = int(item.get("product_id"))
            batch_id = item.get("batch_id")
            
            # Get product info
            product_info = products_lookup.get(product_id, {})
            product_name = item.get("product_name") or product_info.get("product_name", f"Product {product_id}")
            hsn_code = item.get("hsn_code") or product_info.get("hsn_code")
            
            # Get batch info
            batch_number = None
            mrp = item.get("mrp", 0)
            
            if batch_id and str(batch_id).isdigit():
                batch_info = batches_lookup.get(int(batch_id))
                if batch_info:
                    batch_number = batch_info.get("batch_number")
                    mrp = batch_info.get("mrp", mrp)
            elif not batch_id:
                # Use FIFO batch
                fifo = fifo_batches.get(product_id)
                if fifo:
                    batch_id = fifo.get("batch_id")
                    batch_number = fifo.get("batch_number")
                    mrp = fifo.get("mrp", mrp)
            
            # Get calculated values
            calc = line_calculations[i] if i < len(line_calculations) else {}
            
            # Calculate total_tax_amount and line_total
            total_tax_amount = calc.get("total_tax_amount", 0)
            if not total_tax_amount:
                total_tax_amount = (
                    calc.get("cgst_amount", 0) + 
                    calc.get("sgst_amount", 0) + 
                    calc.get("igst_amount", 0)
                )
            
            line_total = calc.get("line_total", 0)
            if not line_total:
                line_total = calc.get("taxable_amount", 0) + total_tax_amount
            
            order_items_data.append({
                "org_id": org_id,
                "order_id": order_id,
                "product_id": product_id,
                "product_name": product_name,
                "hsn_code": hsn_code,
                "batch_number": batch_number or item.get("batch_number"),
                "quantity": float(item.get("quantity", 0)) + float(item.get("free_quantity", 0)),
                "uom": item.get("uom", "PCS"),
                "pack_type": item.get("pack_type", "UNIT"),
                "pack_size": int(item.get("pack_size", 1)),
                "base_quantity": float(item.get("quantity", 0)),
                "mrp": float(mrp),
                "unit_price": float(item.get("unit_price", 0)),
                "discount_percent": float(item.get("discount_percent", 0)),
                "discount_amount": calc.get("discount_amount", 0),
                "taxable_amount": calc.get("taxable_amount", 0),
                "igst_rate": calc.get("igst_percent", 0),
                "igst_amount": calc.get("igst_amount", 0),
                "cgst_rate": calc.get("cgst_percent", 0),
                "cgst_amount": calc.get("cgst_amount", 0),
                "sgst_rate": calc.get("sgst_percent", 0),
                "sgst_amount": calc.get("sgst_amount", 0),
                "total_tax_amount": total_tax_amount,
                "line_total": line_total,
                "free_quantity": float(item.get("free_quantity", 0))
            })
        
        return order_items_data
    
    @staticmethod
    def get_customer_details(db: Session, customer_id: int, org_id: str) -> Dict[str, Any]:
        """
        Get customer details for order creation.
        Delegates to repository.
        """
        return OrderRepository.get_customer_context(db, org_id, customer_id)
    
    @staticmethod
    def get_order_for_edit(db: Session, order_id: int, org_id: str, order_type: str = "sales") -> Dict[str, Any]:
        """
        Get order status and basic info for update validation.
        Returns dict with order_status, customer_id, or None if not found.
        """
        from sqlalchemy import text
        result = db.execute(text("""
            SELECT order_status, customer_id FROM sales.orders 
            WHERE order_id = :order_id AND org_id = :org_id AND order_type = :order_type
        """), {"order_id": order_id, "org_id": org_id, "order_type": order_type}).fetchone()
        return dict(result._mapping) if result else None
    
    @staticmethod
    def get_order_items_raw(db: Session, order_id: int) -> List[Dict[str, Any]]:
        """
        Get order items for inventory validation.
        Returns list of dicts with product_id, batch_id, quantity, unit_price.
        """
        from sqlalchemy import text
        items = db.execute(text("""
            SELECT product_id, batch_id, quantity, unit_price
            FROM sales.order_items 
            WHERE order_id = :order_id
        """), {"order_id": order_id}).fetchall()
        return [dict(item._mapping) for item in items]
    
    @staticmethod
    def get_order_final_amount(db: Session, order_id: int) -> float:
        """
        Get order final amount for credit validation.
        """
        from sqlalchemy import text
        return db.execute(text("""
            SELECT final_amount FROM sales.orders WHERE order_id = :order_id
        """), {"order_id": order_id}).scalar() or 0.0
    
    @staticmethod
    def approve_order(db: Session, order_id: int, org_id: str) -> None:
        """
        Update order status to approved.
        """
        from sqlalchemy import text
        db.execute(text("""
            UPDATE sales.orders
            SET order_status = 'approved',
                confirmed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE order_id = :order_id AND org_id = :org_id
        """), {"order_id": order_id, "org_id": org_id})
    
    @staticmethod
    def update_order_status(db: Session, order_id: int, new_status: str) -> None:
        """
        Update order status to any valid status.
        Used for invoiced, shipped, cancelled, etc.
        """
        from sqlalchemy import text
        db.execute(text("""
            UPDATE sales.orders
            SET order_status = :new_status,
                updated_at = CURRENT_TIMESTAMP
            WHERE order_id = :order_id
        """), {"order_id": order_id, "new_status": new_status})
    
    @staticmethod
    def update_order_dynamic(
        db: Session,
        order_id: int,
        org_id: str,
        update_data: Dict[str, Any]
    ) -> bool:
        """
        Update order with validated dynamic fields.
        Uses allowlist to prevent SQL injection.
        Returns True if update was applied.
        """
        from sqlalchemy import text

        # SECURITY: Allowlist of updatable fields to prevent SQL injection
        ALLOWED_FIELDS = {
            'customer_id', 'customer_name', 'order_date', 'delivery_date',
            'billing_address', 'shipping_address', 'notes', 'discount_amount',
            'discount_percent', 'order_status', 'payment_status', 'priority',
            'sales_person_id', 'total_amount', 'final_amount'
        }

        update_fields = []
        params = {"order_id": order_id, "org_id": org_id}

        for field, value in update_data.items():
            if value is not None and field in ALLOWED_FIELDS:
                update_fields.append(f"{field} = :{field}")
                params[field] = value

        if not update_fields:
            return False

        # Add updated timestamp
        update_fields.append("updated_at = CURRENT_TIMESTAMP")

        # Execute update
        update_query = f"""
            UPDATE sales.orders
            SET {', '.join(update_fields)}
            WHERE order_id = :order_id AND org_id = :org_id
        """

        db.execute(text(update_query), params)
        return True

    @staticmethod
    def list_orders(
        db: Session,
        org_id: str,
        skip: int = 0,
        limit: int = 100,
        customer_id: int = None,
        status: str = None,
        from_date: date = None,
        to_date: date = None,
        order_type: str = "regular"
    ) -> Dict[str, Any]:
        """
        List sales orders with filters and pagination.
        Returns dict with orders list and total count.
        """
        from sqlalchemy import text

        # Build WHERE clause
        where_clauses = ["o.org_id = :org_id"]
        params = {"org_id": org_id, "limit": limit, "skip": skip}

        if customer_id:
            where_clauses.append("o.customer_id = :customer_id")
            params["customer_id"] = customer_id

        if status:
            where_clauses.append("o.order_status = :status")
            params["status"] = status

        if from_date:
            where_clauses.append("o.order_date >= :from_date")
            params["from_date"] = from_date

        if to_date:
            where_clauses.append("o.order_date <= :to_date")
            params["to_date"] = to_date

        where_sql = " AND ".join(where_clauses)

        # Count total
        count_result = db.execute(text(f"""
            SELECT COUNT(*) FROM sales.orders o WHERE {where_sql}
        """), params)
        total = count_result.scalar() or 0

        # Fetch orders with customer info
        # Using actual columns from sales.orders table
        orders_result = db.execute(text(f"""
            SELECT
                o.order_id, o.org_id, o.order_number, o.order_date, o.order_status,
                o.customer_id, c.customer_name, c.customer_code, c.primary_phone as customer_phone,
                o.subtotal_amount, o.tax_amount, o.final_amount as total_amount,
                COALESCE(o.paid_amount, 0) as paid_amount,
                COALESCE(o.balance_amount, 0) as balance_amount,
                o.delivery_date, o.notes, o.order_type, o.payment_terms,
                o.discount_amount, o.items_count,
                o.created_at, o.updated_at, o.confirmed_at, o.delivered_at, o.created_by
            FROM sales.orders o
            LEFT JOIN parties.customers c ON o.customer_id = c.customer_id
            WHERE {where_sql}
            ORDER BY o.order_date DESC, o.order_id DESC
            LIMIT :limit OFFSET :skip
        """), params)

        orders = []
        for row in orders_result:
            order_dict = dict(row._mapping)
            # Get items for this order
            items_result = db.execute(text("""
                SELECT
                    oi.order_item_id, oi.order_id, oi.product_id, oi.product_name,
                    oi.hsn_code, oi.batch_number, oi.quantity, oi.free_quantity,
                    oi.unit_price, oi.mrp, oi.discount_percent, oi.discount_amount,
                    oi.tax_percent, oi.tax_amount,
                    oi.uom, oi.pack_type, oi.line_total
                FROM sales.order_items oi
                WHERE oi.order_id = :order_id
            """), {"order_id": order_dict["order_id"]})

            order_dict["items"] = [dict(item._mapping) for item in items_result]
            orders.append(order_dict)

        return {
            "orders": orders,
            "total": total
        }

    @staticmethod
    def get_order_with_items(
        db: Session,
        org_id: str,
        order_id: int,
        order_type: str = "sales"
    ) -> Dict[str, Any]:
        """
        Get single order with all items.
        Returns order dict or None if not found.
        """
        from sqlalchemy import text

        # Fetch order with customer info
        # Using actual columns from sales.orders table
        order_result = db.execute(text("""
            SELECT
                o.order_id, o.org_id, o.order_number, o.order_date, o.order_status,
                o.customer_id, c.customer_name, c.customer_code, c.primary_phone as customer_phone,
                o.subtotal_amount, o.tax_amount, o.final_amount as total_amount,
                COALESCE(o.paid_amount, 0) as paid_amount,
                COALESCE(o.balance_amount, 0) as balance_amount,
                o.delivery_date, o.notes, o.order_type, o.payment_terms,
                o.discount_amount, o.items_count,
                o.created_at, o.updated_at, o.confirmed_at, o.delivered_at, o.created_by
            FROM sales.orders o
            LEFT JOIN parties.customers c ON o.customer_id = c.customer_id
            WHERE o.order_id = :order_id AND o.org_id = :org_id
        """), {"order_id": order_id, "org_id": org_id})

        row = order_result.fetchone()
        if not row:
            return None

        order_dict = dict(row._mapping)

        # Get items using actual columns from sales.order_items table
        items_result = db.execute(text("""
            SELECT
                oi.order_item_id, oi.order_id, oi.product_id, oi.product_name,
                oi.hsn_code, oi.batch_number, oi.quantity, oi.free_quantity,
                oi.unit_price, oi.mrp, oi.discount_percent, oi.discount_amount,
                oi.tax_percent, oi.tax_amount,
                oi.uom, oi.pack_type, oi.line_total
            FROM sales.order_items oi
            WHERE oi.order_id = :order_id
        """), {"order_id": order_id})

        order_dict["items"] = [dict(item._mapping) for item in items_result]

        return order_dict

    @staticmethod
    def get_employees(db: Session, org_id: str) -> List[Dict[str, Any]]:
        """Get list of employees for Created By dropdown."""
        from sqlalchemy import text

        result = db.execute(text("""
            SELECT user_id, full_name, email, role
            FROM auth.users
            WHERE org_id = :org_id AND is_active = true
            ORDER BY full_name
            LIMIT 50
        """), {"org_id": org_id})

        return [dict(row._mapping) for row in result]
