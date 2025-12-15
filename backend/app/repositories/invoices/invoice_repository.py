"""
Optimized Invoice Repository
Database operations with optimized queries (no N+1 problems)
"""
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, Dict, Any, List, Tuple
from datetime import date, datetime, timedelta
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)


class InvoiceRepository:
    """
    Data access layer for invoices
    All queries optimized for performance
    """
    
    @staticmethod
    def get_invoice_context_data(
        db: Session,
        org_id: str,
        customer_id: int
    ) -> Optional[Dict[str, Any]]:
        """
        Get ALL context data needed for invoice creation in ONE QUERY
        Fixes N+1 query problem (was 6+ queries, now 1!)
        
        Returns:
            Dict with branch_id, user_id, next_order_num, customer data, addresses
        """
        try:
            result = db.execute(text("""
                WITH org_data AS (
                    -- Get organization metadata
                    SELECT 
                        b.branch_id,
                        u.user_id,
                        COALESCE(
                            MAX(CAST(SUBSTRING(o.order_number FROM '[0-9]+') AS BIGINT)), 
                            0
                        ) + 1 as next_order_num
                    FROM master.org_branches b
                    CROSS JOIN master.org_users u
                    LEFT JOIN sales.orders o ON o.org_id = :org_id
                    WHERE b.org_id = :org_id 
                      AND u.org_id = :org_id
                      AND b.is_active = true
                      AND u.is_active = true
                    GROUP BY b.branch_id, u.user_id
                    LIMIT 1
                ),
                customer_data AS (
                    -- Get customer with addresses in one query
                    SELECT 
                        c.customer_id,
                        c.customer_name,
                        c.gstin,
                        c.phone,
                        c.email,
                        ba.address_id as billing_address_id,
                        sa.address_id as shipping_address_id
                    FROM parties.customers c
                    LEFT JOIN master.addresses ba ON 
                        ba.entity_type = 'customer' 
                        AND ba.entity_id = c.customer_id 
                        AND ba.org_id = c.org_id
                        AND ba.address_type = 'billing' 
                        AND ba.is_active = true
                        AND ba.is_default = true
                    LEFT JOIN master.addresses sa ON 
                        sa.entity_type = 'customer' 
                        AND sa.entity_id = c.customer_id 
                        AND sa.org_id = c.org_id
                        AND sa.address_type = 'shipping' 
                        AND sa.is_active = true
                        AND sa.is_default = true
                    WHERE c.customer_id = :customer_id 
                      AND c.org_id = :org_id
                    LIMIT 1
                )
                SELECT 
                    od.branch_id,
                    od.user_id,
                    od.next_order_num,
                    cd.customer_id,
                    cd.customer_name,
                    cd.gstin,
                    cd.phone,
                    cd.email,
                    cd.billing_address_id,
                    cd.shipping_address_id
                FROM org_data od, customer_data cd
            """), {
                "org_id": org_id,
                "customer_id": customer_id
            })
            
            row = result.fetchone()
            if not row:
                return None
            
            return dict(row._mapping)
            
        except Exception as e:
            logger.error(f"Error fetching invoice context: {e}")
            raise
    
    @staticmethod
    def create_order(
        db: Session,
        org_id: str,
        branch_id: Optional[int],
        order_number: str,
        order_date: date,
        customer_id: int,
        totals: Dict[str, Decimal],
        created_by: Optional[int]
    ) -> int:
        """
        Create sales order
        
        Returns:
            order_id
        """
        try:
            result = db.execute(text("""
                INSERT INTO sales.orders (
                    org_id, branch_id, order_number, order_date, order_type,
                    customer_id, subtotal_amount, discount_amount, taxable_amount,
                    cgst_amount, sgst_amount, tax_amount, final_amount,
                    created_by, created_at
                ) VALUES (
                    :org_id, :branch_id, :order_number, :order_date, 'sales',
                    :customer_id, :subtotal, :discount, :taxable,
                    :cgst, :sgst, :tax, :final,
                    :created_by, CURRENT_TIMESTAMP
                ) RETURNING order_id
            """), {
                "org_id": org_id,
                "branch_id": branch_id,
                "order_number": order_number,
                "order_date": order_date,
                "customer_id": customer_id,
                "subtotal": totals['subtotal'],
                "discount": totals['discount_amount'],
                "taxable": totals['taxable_amount'],
                "cgst": totals['cgst_amount'],
                "sgst": totals['sgst_amount'],
                "tax": totals['total_tax'],
                "final": totals['final_amount'],
                "created_by": created_by
            })
            
            return result.scalar()
            
        except Exception as e:
            logger.error(f"Error creating order: {e}")
            raise
    
    @staticmethod
    def create_order_items_batch(
        db: Session,
        order_id: int,
        items: List[Dict[str, Any]]
    ) -> None:
        """
        Create order items in BATCH (single query)
        Much faster than individual INSERTs
        
        Args:
            order_id: Order ID
            items: List of item dictionaries with calculated values
        """
        if not items:
            return
        
        try:
            # Build VALUES clause for batch insert
            values_list = []
            params = {"order_id": order_id}
            
            for idx, item in enumerate(items):
                values_list.append(f"""(
                    :order_id,
                    :product_id_{idx},
                    :quantity_{idx},
                    :unit_price_{idx},
                    :discount_percent_{idx},
                    :discount_amount_{idx},
                    :taxable_amount_{idx},
                    :gst_percent_{idx},
                    :cgst_amount_{idx},
                    :sgst_amount_{idx},
                    :igst_amount_{idx},
                    :line_total_{idx}
                )""")
                
                params.update({
                    f"product_id_{idx}": item['product_id'],
                    f"quantity_{idx}": item['quantity'],
                    f"unit_price_{idx}": item['unit_price'],
                    f"discount_percent_{idx}": item['discount_percent'],
                    f"discount_amount_{idx}": item['discount_amount'],
                    f"taxable_amount_{idx}": item['taxable_amount'],
                    f"gst_percent_{idx}": item['gst_percent'],
                    f"cgst_amount_{idx}": item['cgst_amount'],
                    f"sgst_amount_{idx}": item['sgst_amount'],
                    f"igst_amount_{idx}": item.get('igst_amount', Decimal('0')),
                    f"line_total_{idx}": item['line_total']
                })
            
            # Single batch insert
            db.execute(text(f"""
                INSERT INTO sales.order_items (
                    order_id, product_id, quantity, unit_price,
                    discount_percent, discount_amount, taxable_amount,
                    gst_percent, cgst_amount, sgst_amount, igst_amount,
                    line_total
                ) VALUES {', '.join(values_list)}
            """), params)
            
        except Exception as e:
            logger.error(f"Error creating order items: {e}")
            raise
    
    @staticmethod
    def create_invoice(
        db: Session,
        org_id: str,
        branch_id: Optional[int],
        invoice_number: str,
        invoice_date: date,
        order_id: int,
        customer_data: Dict[str, Any],
        totals: Dict[str, Decimal],
        payment_terms: str,
        due_date: date,
        created_by: Optional[int],
        **kwargs
    ) -> int:
        """
        Create invoice record
        
        Returns:
            invoice_id
        """
        try:
            result = db.execute(text("""
                INSERT INTO sales.invoices (
                    org_id, branch_id, invoice_number, invoice_date, invoice_type,
                    order_id, customer_id, customer_name,
                    billing_address_id, shipping_address_id,
                    subtotal_amount, discount_amount, taxable_amount,
                    igst_amount, cgst_amount, sgst_amount, total_tax_amount,
                    freight_charges, other_charges, round_off_amount, final_amount,
                    payment_terms, due_date, notes,
                    invoice_status, payment_status,
                    created_by, created_at
                ) VALUES (
                    :org_id, :branch_id, :invoice_number, :invoice_date, 'sales',
                    :order_id, :customer_id, :customer_name,
                    :billing_address_id, :shipping_address_id,
                    :subtotal, :discount, :taxable,
                    :igst, :cgst, :sgst, :tax,
                    :freight, :other_charges, :round_off, :final,
                    :payment_terms, :due_date, :notes,
                    'pending', 'pending',
                    :created_by, CURRENT_TIMESTAMP
                ) RETURNING invoice_id
            """), {
                "org_id": org_id,
                "branch_id": branch_id,
                "invoice_number": invoice_number,
                "invoice_date": invoice_date,
                "order_id": order_id,
                "customer_id": customer_data['customer_id'],
                "customer_name": customer_data['customer_name'],
                "billing_address_id": customer_data.get('billing_address_id') or kwargs.get('billing_address_id'),
                "shipping_address_id": customer_data.get('shipping_address_id') or kwargs.get('shipping_address_id'),
                "subtotal": totals['subtotal'],
                "discount": totals['discount_amount'],
                "taxable": totals['taxable_amount'],
                "igst": totals['igst_amount'],
                "cgst": totals['cgst_amount'],
                "sgst": totals['sgst_amount'],
                "tax": totals['total_tax'],
                "freight": totals['freight_charges'],
                "other_charges": totals['other_charges'],
                "round_off": totals['round_off'],
                "final": totals['final_amount'],
                "payment_terms": payment_terms,
                "due_date": due_date,
                "notes": kwargs.get('notes'),
                "created_by": created_by
            })
            
            return result.scalar()
            
        except Exception as e:
            logger.error(f"Error creating invoice: {e}")
            raise
    
    @staticmethod
    def get_invoice_by_id(
        db: Session,
        invoice_id: int,
        org_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get invoice with all details (optimized single query)
        """
        try:
            result = db.execute(text("""
                SELECT 
                    i.*,
                    c.customer_name,
                    c.gstin as customer_gstin,
                    c.phone as customer_phone,
                    c.email as customer_email
                FROM sales.invoices i
                JOIN parties.customers c ON c.customer_id = i.customer_id
                WHERE i.invoice_id = :invoice_id 
                  AND i.org_id = :org_id
            """), {
                "invoice_id": invoice_id,
                "org_id": org_id
            })
            
            row = result.fetchone()
            return dict(row._mapping) if row else None
            
        except Exception as e:
            logger.error(f"Error fetching invoice: {e}")
            raise
    
    @staticmethod
    def list_invoices(
        db: Session,
        org_id: str,
        limit: int = 20,
        offset: int = 0,
        filters: Optional[Dict[str, Any]] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        List invoices with pagination and filters
        
        Returns:
            Tuple of (invoices, total_count)
        """
        filters = filters or {}
        
        try:
            # Build WHERE clause
            where_clauses = ["i.org_id = :org_id"]
            params = {"org_id": org_id, "limit": limit, "offset": offset}
            
            if filters.get('customer_id'):
                where_clauses.append("i.customer_id = :customer_id")
                params['customer_id'] = filters['customer_id']
            
            if filters.get('status'):
                where_clauses.append("i.invoice_status = :status")
                params['status'] = filters['status']
            
            if filters.get('payment_status'):
                where_clauses.append("i.payment_status = :payment_status")
                params['payment_status'] = filters['payment_status']
            
            if filters.get('from_date'):
                where_clauses.append("i.invoice_date >= :from_date")
                params['from_date'] = filters['from_date']
            
            if filters.get('to_date'):
                where_clauses.append("i.invoice_date <= :to_date")
                params['to_date'] = filters['to_date']
            
            where_clause = " AND ".join(where_clauses)
            
            # Get invoices
            result = db.execute(text(f"""
                SELECT 
                    i.invoice_id,
                    i.invoice_number,
                    i.invoice_date,
                    i.customer_id,
                    c.customer_name,
                    i.final_amount,
                    i.payment_status,
                    i.invoice_status,
                    i.created_at
                FROM sales.invoices i
                JOIN parties.customers c ON c.customer_id = i.customer_id
                WHERE {where_clause}
                ORDER BY i.invoice_date DESC, i.created_at DESC
                LIMIT :limit OFFSET :offset
            """), params)
            
            invoices = [dict(row._mapping) for row in result]
            
            # Get total count
            count_result = db.execute(text(f"""
                SELECT COUNT(*) as total
                FROM sales.invoices i
                WHERE {where_clause}
            """), params)
            
            total = count_result.scalar()
            
            return invoices, total
            
        except Exception as e:
            logger.error(f"Error listing invoices: {e}")
            raise
