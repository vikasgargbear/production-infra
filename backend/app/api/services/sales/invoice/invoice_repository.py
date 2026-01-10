"""
Invoice Repository - Data Access Layer
All SQL queries for invoice operations
"""
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import Dict, Any, List, Optional
from decimal import Decimal
import logging

from ..shared import SalesSharedRepository

logger = logging.getLogger(__name__)


def number_to_indian_words(num: float) -> str:
    """
    Convert number to Indian currency words format.
    E.g., 12345.67 -> "Twelve Thousand Three Hundred Forty Five Rupees and Sixty Seven Paise Only"
    """
    if num == 0:
        return "Zero Rupees Only"
    
    ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
            "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
            "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
    
    def two_digit(n: int) -> str:
        if n < 20:
            return ones[n]
        return tens[n // 10] + (" " + ones[n % 10] if n % 10 else "")
    
    def three_digit(n: int) -> str:
        if n < 100:
            return two_digit(n)
        return ones[n // 100] + " Hundred" + (" " + two_digit(n % 100) if n % 100 else "")
    
    # Split into rupees and paise
    rupees = int(num)
    paise = round((num - rupees) * 100)
    
    if rupees == 0:
        return f"{two_digit(paise)} Paise Only" if paise else "Zero Rupees Only"
    
    # Indian numbering: Crore, Lakh, Thousand, Hundred
    parts = []
    if rupees >= 10000000:  # Crore
        parts.append(two_digit(rupees // 10000000) + " Crore")
        rupees %= 10000000
    if rupees >= 100000:  # Lakh
        parts.append(two_digit(rupees // 100000) + " Lakh")
        rupees %= 100000
    if rupees >= 1000:  # Thousand
        parts.append(two_digit(rupees // 1000) + " Thousand")
        rupees %= 1000
    if rupees > 0:
        parts.append(three_digit(rupees))
    
    rupee_words = " ".join(parts) + " Rupees"
    
    if paise:
        return f"{rupee_words} and {two_digit(paise)} Paise Only"
    return f"{rupee_words} Only"



class InvoiceRepository:
    """Pure data access layer for invoices - no business logic"""
    
    # Reuse shared methods
    get_customer_context = SalesSharedRepository.get_customer_context
    get_org_context = SalesSharedRepository.get_org_context
    get_products_and_batches = SalesSharedRepository.get_products_and_batches
    validate_stock_availability = SalesSharedRepository.validate_stock_availability
    update_customer_outstanding = SalesSharedRepository.update_customer_outstanding
    
    @staticmethod
    def get_invoice_context(
        db: Session,
        org_id: str,
        customer_id: int
    ) -> Dict[str, Any]:
        """
        Get all context data needed for invoice creation.
        Combines customer and org context.
        
        Returns:
            Dict with customer_name, billing_address_id, shipping_address_id,
            branch_id, user_id, gstin
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
        order_date: str,
        customer_id: int,
        totals: Dict[str, Any],
        created_by: int
    ) -> int:
        """
        Create sales order record.
        
        Returns:
            order_id
        """
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
            "subtotal": totals["subtotal_amount"],
            "discount": totals["discount_amount"],
            "taxable": totals["taxable_amount"],
            "cgst": totals["cgst_amount"],
            "sgst": totals["sgst_amount"],
            "tax": totals["total_tax_amount"],
            "final": totals["final_amount"],
            "created_by": created_by
        })
        
        return result.scalar()
    
    @staticmethod
    def create_invoice(
        db: Session,
        org_id: str,
        branch_id: int,
        invoice_number: str,
        invoice_date: str,
        order_id: int,
        customer_id: int,
        customer_name: str,
        billing_address_id: Optional[int],
        shipping_address_id: Optional[int],
        totals: Dict[str, Any],
        payment_terms: str,
        due_date: str,
        notes: Optional[str],
        created_by: int,
        paid_amount: Decimal = Decimal("0"),
        payment_status: str = "pending",
        credit_amount: Optional[Decimal] = None,
        salesperson_id: Optional[int] = None
    ) -> int:
        """
        Create invoice record.
        
        Args:
            paid_amount: Amount already paid (from split payments)
            payment_status: 'pending', 'partial', or 'paid'
            credit_amount: Amount on credit (unpaid balance)
            salesperson_id: M.R. / salesperson ID
        
        Returns:
            invoice_id
        """
        final_amount = totals["final_amount"]
        amount_words = number_to_indian_words(float(final_amount))
        
        # Calculate credit_amount if not provided
        if credit_amount is None:
            credit_amount = Decimal(str(final_amount)) - paid_amount
        
        logger.info(f"📝 Creating invoice: paid_amount={paid_amount}, payment_status={payment_status}, salesperson_id={salesperson_id}")
        
        result = db.execute(text("""
            INSERT INTO sales.invoices (
                org_id, branch_id, invoice_number, invoice_date, invoice_type,
                order_id, customer_id, customer_name,
                billing_address_id, shipping_address_id,
                subtotal_amount, discount_amount, scheme_discount, taxable_amount,
                igst_amount, cgst_amount, sgst_amount, total_tax_amount,
                freight_charges, insurance_charges, other_charges,
                round_off_amount, final_amount, amount_in_words,
                payment_terms, due_date, notes,
                invoice_status, payment_status, paid_amount,
                credit_amount,
                salesperson_id,
                created_by, created_at, updated_at
            ) VALUES (
                :org_id, :branch_id, :invoice_number, :invoice_date, 'tax_invoice',
                :order_id, :customer_id, :customer_name,
                :billing_address_id, :shipping_address_id,
                :subtotal, :item_discount, :scheme_discount, :taxable,
                :igst, :cgst, :sgst, :tax,
                :freight, :insurance, :other,
                :round_off, :final, :amount_in_words,
                :payment_terms, :due_date, :notes,
                'posted', :payment_status, :paid_amount,
                :credit_amount,
                :salesperson_id,
                :created_by, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING invoice_id
        """), {
            "org_id": org_id,
            "branch_id": branch_id,
            "invoice_number": invoice_number,
            "invoice_date": invoice_date,
            "order_id": order_id,
            "customer_id": customer_id,
            "customer_name": customer_name,
            "billing_address_id": billing_address_id,
            "shipping_address_id": shipping_address_id,
            "subtotal": totals["subtotal_amount"],
            "item_discount": totals["discount_amount"],
            "scheme_discount": totals.get("scheme_discount", 0),
            "taxable": totals["taxable_amount"],
            "igst": totals.get("igst_amount", 0),
            "cgst": totals["cgst_amount"],
            "sgst": totals["sgst_amount"],
            "tax": totals["total_tax_amount"],
            "freight": totals.get("freight_charges", 0),
            "insurance": totals.get("insurance_charges", 0),
            "other": totals.get("other_charges", 0),
            "round_off": totals.get("round_off_amount", 0),
            "final": final_amount,
            "amount_in_words": amount_words,
            "payment_terms": payment_terms,
            "due_date": due_date,
            "notes": notes,
            "payment_status": payment_status,
            "paid_amount": paid_amount,
            "credit_amount": credit_amount,
            "salesperson_id": salesperson_id,
            "created_by": created_by
        })
        
        return result.scalar()
    
    @staticmethod
    def get_products_and_batches(
        db: Session,
        org_id: str,
        product_ids: List[int],
        batch_ids: List[int]
    ) -> tuple[Dict[int, str], Dict[int, Dict[str, Any]], Dict[int, Dict[str, Any]]]:
        """
        Batch fetch products, batches, and FIFO batches.
        Eliminates N+1 query problem.
        
        Returns:
            Tuple of (products_lookup, batches_lookup, fifo_batches)
        """
        # Fetch product names and HSN codes
        products_lookup = {}
        if product_ids:
            prod_result = db.execute(text("""
                SELECT product_id, product_name, hsn_code
                FROM inventory.products
                WHERE product_id = ANY(:product_ids) AND org_id = :org_id
            """), {"product_ids": product_ids, "org_id": org_id})
            products_lookup = {
                row[0]: {"product_name": row[1], "hsn_code": row[2]} 
                for row in prod_result.fetchall()
            }
        
        # Fetch batch details
        batches_lookup = {}
        if batch_ids:
            batch_result = db.execute(text("""
                SELECT batch_id, batch_number, mrp_per_unit, manufacturing_date, 
                       expiry_date, cost_per_unit
                FROM inventory.batches
                WHERE batch_id = ANY(:batch_ids) AND org_id = :org_id
            """), {"batch_ids": batch_ids, "org_id": org_id})
            batches_lookup = {
                row[0]: {
                    "batch_number": row[1],
                    "mrp": row[2],
                    "mfg_date": row[3],
                    "exp_date": row[4],
                    "cost_per_unit": row[5]
                }
                for row in batch_result.fetchall()
            }
        
        # Fetch FIFO batches for products without batch_id
        products_needing_batches = [pid for pid in product_ids if pid not in [b.get("product_id") for b in batches_lookup.values()]]
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
    def create_invoice_items_bulk(
        db: Session,
        invoice_items_data: List[Dict[str, Any]]
    ) -> None:
        """
        Bulk insert invoice items in a single query.
        Much faster than individual inserts.
        """
        if not invoice_items_data:
            return
        
        values_list = []
        params = {}
        
        for i, item_data in enumerate(invoice_items_data):
            # Schema columns: invoice_id, product_id, product_name, hsn_code,
            # batch_id, batch_number, manufacturing_date, expiry_date,
            # quantity, uom, pack_type, pack_size, base_quantity,
            # mrp, unit_price, discount_percent, discount_amount, taxable_amount,
            # igst_rate, igst_amount, cgst_rate, cgst_amount,
            # sgst_rate, sgst_amount, total_tax_amount, line_total, free_quantity,
            # display_order, is_free_item
            # NOTE: org_id does NOT exist in sales.invoice_items!
            values_list.append(f"""(
                :invoice_id_{i}, :product_id_{i}, :product_name_{i}, :hsn_code_{i},
                :batch_id_{i}, :batch_number_{i}, :manufacturing_date_{i}, :expiry_date_{i},
                :quantity_{i}, :uom_{i}, :pack_type_{i}, :pack_size_{i}, :base_quantity_{i},
                :mrp_{i}, :unit_price_{i}, :discount_percent_{i}, :discount_amount_{i}, :taxable_amount_{i},
                :igst_rate_{i}, :igst_amount_{i}, :cgst_rate_{i}, :cgst_amount_{i},
                :sgst_rate_{i}, :sgst_amount_{i}, :total_tax_amount_{i}, :line_total_{i},
                :free_quantity_{i}, :display_order_{i}, :is_free_item_{i}
            )""")
            
            # Ensure batch_id is in params (even if None)
            if 'batch_id' not in item_data:
                item_data['batch_id'] = None
            
            # Add display_order and is_free_item
            # is_free_item is true ONLY if base quantity is 0 but free_quantity > 0
            item_data['display_order'] = i + 1
            base_qty = float(item_data.get('base_quantity', 0) or item_data.get('quantity', 0))
            free_qty = float(item_data.get('free_quantity', 0) or 0)
            item_data['is_free_item'] = base_qty == 0 and free_qty > 0
            
            for key, value in item_data.items():
                # Skip org_id - it doesn't exist in invoice_items table
                if key == 'org_id':
                    continue
                params[f"{key}_{i}"] = value
        
        bulk_insert_sql = f"""
            INSERT INTO sales.invoice_items (
                invoice_id, product_id, product_name, hsn_code,
                batch_id, batch_number, manufacturing_date, expiry_date,
                quantity, uom, pack_type, pack_size, base_quantity,
                mrp, unit_price, discount_percent, discount_amount, taxable_amount,
                igst_rate, igst_amount, cgst_rate, cgst_amount,
                sgst_rate, sgst_amount, total_tax_amount, line_total,
                free_quantity, display_order, is_free_item
            ) VALUES {", ".join(values_list)}
        """
        
        db.execute(text(bulk_insert_sql), params)
        logger.info(f"✅ Bulk inserted {len(invoice_items_data)} invoice items")
        
        # Update items_count and total_quantity on the invoice
        if invoice_items_data:
            invoice_id = invoice_items_data[0].get("invoice_id")
            if invoice_id:
                db.execute(text("""
                    UPDATE sales.invoices
                    SET items_count = :items_count,
                        total_quantity = :total_quantity
                    WHERE invoice_id = :invoice_id
                """), {
                    "invoice_id": invoice_id,
                    "items_count": len(invoice_items_data),
                    "total_quantity": sum(item.get("quantity", 0) for item in invoice_items_data)
                })
                logger.info(f"✅ Updated invoice {invoice_id} with items_count={len(invoice_items_data)}")
