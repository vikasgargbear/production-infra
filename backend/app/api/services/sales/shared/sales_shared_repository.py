"""
Shared Sales Repository - Common Data Access Patterns
Reusable queries across invoice, order, and challan modules
"""
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import Dict, Any, List, Tuple
import logging

logger = logging.getLogger(__name__)


class SalesSharedRepository:
    """Common data access patterns for all sales documents"""
    
    @staticmethod
    def get_customer_context(
        db: Session,
        org_id: str,
        customer_id: int
    ) -> Dict[str, Any]:
        """
        Get customer details with addresses in one query.
        Used by: Invoice, Order, Challan
        
        Returns:
            Dict with customer_name, billing_address_id, shipping_address_id
        """
        result = db.execute(text("""
            WITH customer_data AS (
                SELECT 
                    customer_id,
                    customer_name,
                    gst_number
                FROM parties.customers
                WHERE customer_id = :customer_id AND org_id = :org_id
            ),
            address_data AS (
                SELECT 
                    MAX(CASE WHEN address_type = 'billing' AND is_default = true 
                        THEN address_id END) as billing_address_id,
                    MAX(CASE WHEN address_type = 'shipping' AND is_default = true 
                        THEN address_id END) as shipping_address_id
                FROM master.addresses
                WHERE entity_type = 'customer' 
                    AND entity_id = :customer_id 
                    AND org_id = :org_id
            )
            SELECT 
                c.customer_name,
                c.gst_number,
                a.billing_address_id,
                COALESCE(a.shipping_address_id, a.billing_address_id) as shipping_address_id
            FROM customer_data c
            CROSS JOIN address_data a
        """), {"customer_id": customer_id, "org_id": org_id})
        
        row = result.fetchone()
        if not row:
            raise ValueError(f"Customer {customer_id} not found")
        
        return {
            "customer_name": row[0],
            "gst_number": row[1],
            "billing_address_id": row[2],
            "shipping_address_id": row[3]
        }
    
    @staticmethod
    def get_org_context(
        db: Session,
        org_id: str
    ) -> Dict[str, Any]:
        """
        Get organization context (branch, default user).
        Used by: Invoice, Order, Challan
        
        Returns:
            Dict with branch_id, user_id
        """
        result = db.execute(text("""
            WITH branch_data AS (
                SELECT branch_id
                FROM master.org_branches
                WHERE org_id = :org_id AND is_active = true
                LIMIT 1
            ),
            user_data AS (
                SELECT user_id
                FROM master.org_users
                WHERE org_id = :org_id AND is_active = true
                LIMIT 1
            )
            SELECT b.branch_id, u.user_id
            FROM branch_data b
            CROSS JOIN user_data u
        """), {"org_id": org_id})
        
        row = result.fetchone()
        if not row:
            raise ValueError(f"No active branch or user found for org {org_id}")
        
        return {
            "branch_id": row[0],
            "user_id": row[1]
        }
    
    @staticmethod
    def get_products_and_batches(
        db: Session,
        org_id: str,
        product_ids: List[int],
        batch_ids: List[int]
    ) -> Tuple[Dict[int, str], Dict[int, Dict[str, Any]], Dict[int, Dict[str, Any]]]:
        """
        Batch fetch products, batches, and FIFO batches.
        Used by: Invoice, Order, Challan
        Eliminates N+1 query problem.
        
        Returns:
            Tuple of (products_lookup, batches_lookup, fifo_batches)
        """
        # Fetch product names
        products_lookup = {}
        if product_ids:
            prod_result = db.execute(text("""
                SELECT product_id, product_name, hsn_code
                FROM inventory.products
                WHERE product_id = ANY(:product_ids) AND org_id = :org_id
            """), {"product_ids": product_ids, "org_id": org_id})
            products_lookup = {
                row[0]: {
                    "product_name": row[1],
                    "hsn_code": row[2]
                }
                for row in prod_result.fetchall()
            }
        
        # Fetch batch details
        batches_lookup = {}
        if batch_ids:
            batch_result = db.execute(text("""
                SELECT batch_id, product_id, batch_number, mrp_per_unit, 
                       manufacturing_date, expiry_date, cost_per_unit
                FROM inventory.batches
                WHERE batch_id = ANY(:batch_ids) AND org_id = :org_id
            """), {"batch_ids": batch_ids, "org_id": org_id})
            batches_lookup = {
                row[0]: {
                    "product_id": row[1],
                    "batch_number": row[2],
                    "mrp": row[3],
                    "mfg_date": row[4],
                    "exp_date": row[5],
                    "cost_per_unit": row[6]
                }
                for row in batch_result.fetchall()
            }
        
        # Fetch FIFO batches for products without batch_id
        products_needing_batches = [
            pid for pid in product_ids 
            if not any(b.get("product_id") == pid for b in batches_lookup.values())
        ]
        
        fifo_batches = {}
        if products_needing_batches:
            fifo_result = db.execute(text("""
                SELECT DISTINCT ON (product_id) 
                    product_id, batch_id, batch_number, mrp_per_unit, 
                    manufacturing_date, expiry_date, cost_per_unit
                FROM inventory.batches
                WHERE product_id = ANY(:product_ids) 
                    AND org_id = :org_id 
                    AND quantity_available > 0
                ORDER BY product_id, expiry_date NULLS LAST, batch_id
            """), {"product_ids": products_needing_batches, "org_id": org_id})
            fifo_batches = {
                row[0]: {
                    "batch_id": row[1],
                    "batch_number": row[2],
                    "mrp": row[3],
                    "mfg_date": row[4],
                    "exp_date": row[5],
                    "cost_per_unit": row[6]
                }
                for row in fifo_result.fetchall()
            }
        
        return products_lookup, batches_lookup, fifo_batches
    
    @staticmethod
    def validate_stock_availability(
        db: Session,
        org_id: str,
        batch_deductions: List[Dict[str, Any]]
    ) -> None:
        """
        Validate that all batches have sufficient stock.
        Used by: Invoice, Challan
        Raises HTTPException if insufficient stock.
        """
        from fastapi import HTTPException
        
        if not batch_deductions:
            return
        
        batch_ids = [bd["batch_id"] for bd in batch_deductions]
        
        # Fetch current stock levels
        stock_result = db.execute(text("""
            SELECT batch_id, product_id, quantity_available
            FROM inventory.batches
            WHERE batch_id = ANY(:batch_ids) AND org_id = :org_id
        """), {"batch_ids": batch_ids, "org_id": org_id})
        
        current_stock_map = {
            row[0]: {"product_id": row[1], "available": row[2]}
            for row in stock_result.fetchall()
        }
        
        # Validate each deduction
        for deduction in batch_deductions:
            batch_id = deduction["batch_id"]
            required_quantity = deduction["quantity"]
            product_id = deduction["product_id"]
            
            stock_info = current_stock_map.get(batch_id)
            
            if not stock_info:
                raise HTTPException(
                    status_code=404,
                    detail={
                        "error": "BATCH_NOT_FOUND",
                        "message": f"Batch {batch_id} not found for product {product_id}",
                        "product_id": product_id,
                        "batch_id": batch_id
                    }
                )
            
            available_quantity = stock_info["available"]
            
            if available_quantity < required_quantity:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "error": "INSUFFICIENT_STOCK",
                        "message": f"Insufficient stock for product {product_id}",
                        "product_id": product_id,
                        "batch_id": batch_id,
                        "required_quantity": required_quantity,
                        "available_quantity": available_quantity
                    }
                )
        
        logger.info(f"✅ Stock validation passed for {len(batch_deductions)} items")
    
    @staticmethod
    def update_customer_outstanding(
        db: Session,
        customer_id: int,
        amount: float,
        operation: str = "add"
    ) -> None:
        """
        Update customer's outstanding balance.
        Used by: Invoice, Credit Note
        
        Args:
            operation: "add" or "subtract"
        """
        if operation == "add":
            db.execute(text("""
                UPDATE parties.customers 
                SET current_outstanding = COALESCE(current_outstanding, 0) + :amount,
                    updated_at = CURRENT_TIMESTAMP
                WHERE customer_id = :customer_id
            """), {"customer_id": customer_id, "amount": amount})
        elif operation == "subtract":
            db.execute(text("""
                UPDATE parties.customers 
                SET current_outstanding = COALESCE(current_outstanding, 0) - :amount,
                    updated_at = CURRENT_TIMESTAMP
                WHERE customer_id = :customer_id
            """), {"customer_id": customer_id, "amount": amount})
        else:
            raise ValueError(f"Invalid operation: {operation}")
        
        logger.info(f"✅ Updated customer {customer_id} outstanding: {operation} ₹{amount}")
