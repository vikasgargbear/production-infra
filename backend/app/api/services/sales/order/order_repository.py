"""
Order Repository - Data Access Layer
All SQL queries for order operations
"""
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import Dict, Any, List
from decimal import Decimal
import logging

from ..shared import SalesSharedRepository

logger = logging.getLogger(__name__)


class OrderRepository:
    """Pure data access layer for orders - no business logic"""
    
    # Reuse shared methods
    get_customer_context = SalesSharedRepository.get_customer_context
    get_org_context = SalesSharedRepository.get_org_context
    get_products_and_batches = SalesSharedRepository.get_products_and_batches
    
    @staticmethod
    def get_order_context(
        db: Session,
        org_id: str,
        customer_id: int
    ) -> Dict[str, Any]:
        """
        Get all context data needed for order creation.
        Combines customer and org context.
        """
        customer_ctx = SalesSharedRepository.get_customer_context(db, org_id, customer_id)
        org_ctx = SalesSharedRepository.get_org_context(db, org_id)
        
        return {**customer_ctx, **org_ctx}
    
    @staticmethod
    def create_order(
        db: Session,
        org_id: str,
        branch_id: int,
        order_number: str,
        order_date: Any,
        customer_id: int,
        totals: Dict[str, Any],
        created_by: int,
        gst_type: str = "CGST/SGST"
    ) -> int:
        """
        Create sales order record.
        Returns order_id.
        """
        result = db.execute(text("""
            INSERT INTO sales.orders (
                org_id, branch_id, order_number, order_date, order_type,
                customer_id, subtotal_amount, discount_amount, taxable_amount,
                cgst_amount, sgst_amount, igst_amount, tax_amount, final_amount,
                gst_type,
                created_by, created_at
            ) VALUES (
                :org_id, :branch_id, :order_number, :order_date, 'sales',
                :customer_id, :subtotal, :discount, :taxable,
                :cgst, :sgst, :igst, :tax, :final,
                :gst_type,
                :created_by, CURRENT_TIMESTAMP
            ) RETURNING order_id
        """), {
            "org_id": org_id,
            "branch_id": branch_id,
            "order_number": order_number,
            "order_date": order_date,
            "customer_id": customer_id,
            "subtotal": totals.get("subtotal_amount", 0),
            "discount": totals.get("discount_amount", 0),
            "taxable": totals.get("taxable_amount", 0),
            "cgst": totals.get("cgst_amount", 0),
            "sgst": totals.get("sgst_amount", 0),
            "igst": totals.get("igst_amount", 0),
            "tax": totals.get("total_tax_amount", 0),
            "final": totals.get("final_amount", 0),
            "gst_type": gst_type,
            "created_by": created_by
        })
        
        order_id = result.scalar()
        logger.info(f"✅ Created order {order_number} (ID: {order_id})")
        return order_id
    
    @staticmethod
    def create_order_items_bulk(
        db: Session,
        order_items_data: List[Dict[str, Any]]
    ) -> None:
        """
        Bulk insert order items (single query).
        """
        if not order_items_data:
            return
        
        values_list = []
        params = {}
        
        for i, item_data in enumerate(order_items_data):
            values_list.append(f"""(
                :org_id_{i}, :order_id_{i}, :product_id_{i}, :product_name_{i}, :hsn_code_{i},
                :batch_number_{i}, :quantity_{i}, :uom_{i}, :pack_type_{i}, :pack_size_{i},
                :base_quantity_{i}, :mrp_{i}, :unit_price_{i}, :discount_percent_{i},
                :discount_amount_{i}, :taxable_amount_{i}, :igst_rate_{i}, :igst_amount_{i},
                :cgst_rate_{i}, :cgst_amount_{i}, :sgst_rate_{i}, :sgst_amount_{i},
                :total_tax_amount_{i}, :line_total_{i}, :free_quantity_{i}
            )""")
            
            for key, value in item_data.items():
                params[f"{key}_{i}"] = value
        
        bulk_insert_sql = f"""
            INSERT INTO sales.order_items (
                org_id, order_id, product_id, product_name, hsn_code,
                batch_number, quantity, uom, pack_type, pack_size,
                base_quantity, mrp, unit_price, discount_percent,
                discount_amount, taxable_amount, igst_rate, igst_amount,
                cgst_rate, cgst_amount, sgst_rate, sgst_amount,
                total_tax_amount, line_total, free_quantity
            ) VALUES {", ".join(values_list)}
        """
        
        db.execute(text(bulk_insert_sql), params)
        logger.info(f"✅ Bulk inserted {len(order_items_data)} order items")
