"""
Invoice service for comprehensive invoice generation and management
"""
from typing import Dict, Any, Optional
from datetime import date, datetime, timedelta
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from uuid import UUID

from ..document_number_service import DocumentNumberService
from ..gst_service import GSTService
from ....core.constants import (
    InvoiceType, InvoiceStatus, InvoicePaymentStatus, OrderStatus
)

logger = logging.getLogger(__name__)


class InvoiceService:
    """Service class for invoice-related operations"""
    
    @staticmethod
    def generate_invoice_for_order(db: Session, order_id: int, invoice_date: date, org_id: UUID) -> Dict[str, Any]:
        """Generate a comprehensive invoice for an order"""
        
        # Get order with customer and address info (use addresses table)
        order = db.execute(text("""
            SELECT 
                o.*,
                c.customer_name, c.customer_code,
                c.gst_number, c.pan_number,
                c.primary_phone, c.primary_email,
                c.credit_days,
                a.address_line1, a.address_line2, a.city, a.state_name as state, a.pincode
            FROM sales.orders o
            JOIN parties.customers c ON o.customer_id = c.customer_id
            LEFT JOIN master.addresses a ON a.entity_type = 'customer' 
                AND a.entity_id = c.customer_id 
                AND a.is_default = true
            WHERE o.order_id = :order_id AND o.org_id = :org_id
        """), {"order_id": order_id, "org_id": str(org_id)}).fetchone()
        
        if not order:
            raise ValueError(f"Order {order_id} not found")
        
        # Generate invoice number using DocumentNumberService
        invoice_number = DocumentNumberService.generate_number(db, "invoice", str(org_id))
        
        # Prepare customer addresses
        billing_address = InvoiceService.format_address(order)
        shipping_address = billing_address  # Same as billing unless specified
        
        # Calculate due date based on credit days
        due_date = invoice_date + timedelta(days=order.credit_days or 0)
        
        # Get org state for intra-state check
        org_state = db.execute(text("""
            SELECT state_code FROM master.branches 
            WHERE org_id = :org_id AND is_primary = true
            LIMIT 1
        """), {"org_id": str(org_id)}).scalar()
        
        # Determine if same state for CGST/SGST vs IGST
        customer_state = GSTService.extract_state_code(order.gst_number) if order.gst_number else None
        is_same_state = org_state == customer_state if org_state and customer_state else True
        
        # Calculate GST amounts using GSTService pattern
        taxable_amount = (order.subtotal_amount or Decimal("0")) - (order.discount_amount or Decimal("0"))
        gst_details = {
            "taxable_amount": taxable_amount,
            "cgst_amount": order.tax_amount / 2 if is_same_state else Decimal("0"),
            "sgst_amount": order.tax_amount / 2 if is_same_state else Decimal("0"),
            "igst_amount": order.tax_amount if not is_same_state else Decimal("0")
        }
        
        # Create invoice record
        invoice_data = {
            "order_id": order_id,
            "invoice_number": invoice_number,
            "invoice_date": invoice_date,
            "due_date": due_date,
            "customer_id": order.customer_id,
            "customer_name": order.customer_name,
            "customer_gstin": order.gstin,
            "billing_address": billing_address,
            "shipping_address": shipping_address,
            "subtotal_amount": order.subtotal_amount,
            "discount_amount": order.discount_amount,
            "taxable_amount": gst_details["taxable_amount"],
            "cgst_amount": gst_details["cgst_amount"],
            "sgst_amount": gst_details["sgst_amount"],
            "igst_amount": gst_details["igst_amount"],
            "total_tax_amount": order.tax_amount,
            "round_off_amount": order.round_off_amount or Decimal("0"),
            "total_amount": order.final_amount,
            "payment_status": InvoicePaymentStatus.UNPAID.value,
            "paid_amount": Decimal("0"),
            "invoice_type": InvoiceType.TAX_INVOICE.value,
            "notes": f"Thank you for your business!",
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        }
        
        # Insert invoice
        result = db.execute(text("""
            INSERT INTO sales.invoices (
                order_id, invoice_number, invoice_date, due_date,
                customer_id, customer_name, customer_gstin,
                billing_address, shipping_address,
                subtotal_amount, discount_amount, taxable_amount,
                cgst_amount, sgst_amount, igst_amount, total_tax_amount,
                round_off_amount, total_amount,
                payment_status, 0 as paid_amount, invoice_type, notes,
                created_at, updated_at
            ) VALUES (
                :order_id, :invoice_number, :invoice_date, :due_date,
                :customer_id, :customer_name, :customer_gstin,
                :billing_address, :shipping_address,
                :subtotal_amount, :discount_amount, :taxable_amount,
                :cgst_amount, :sgst_amount, :igst_amount, :total_tax_amount,
                :round_off_amount, :total_amount,
                :payment_status, :paid_amount, :invoice_type, :notes,
                :created_at, :updated_at
            ) RETURNING invoice_id
        """), invoice_data)
        
        invoice_id = result.scalar()
        
        # Copy order items to invoice items
        InvoiceService.copy_order_items_to_invoice(db, order_id, invoice_id, is_same_state)
        
        # Update order status and invoice details
        db.execute(text("""
            UPDATE sales.orders
            SET order_status = :order_status,
                invoice_number = :invoice_number,
                invoice_date = :invoice_date,
                updated_at = CURRENT_TIMESTAMP
            WHERE order_id = :order_id
        """), {
            "order_id": order_id,
            "invoice_number": invoice_number,
            "invoice_date": invoice_date,
            "order_status": OrderStatus.INVOICED.value
        })
        
        return {
            "invoice_id": invoice_id,
            "invoice_number": invoice_number,
            "invoice_date": invoice_date,
            "order_id": order_id,
            "order_number": order.order_number,
            "subtotal_amount": order.subtotal_amount,
            "tax_amount": order.tax_amount,
            "total_amount": order.final_amount,
            "pdf_url": None  # Will be generated separately
        }
    
    # generate_invoice_number removed - use DocumentNumberService.generate_number(db, "invoice", org_id)
    
    @staticmethod
    def format_address(customer_row) -> str:
        """Format customer address for invoice"""
        address_parts = []
        
        if customer_row.address_line1:
            address_parts.append(customer_row.address_line1)
        if customer_row.address_line2:
            address_parts.append(customer_row.address_line2)
        if hasattr(customer_row, 'area') and customer_row.area:
            address_parts.append(customer_row.area)
        if customer_row.city:
            address_parts.append(customer_row.city)
        if customer_row.state and customer_row.pincode:
            address_parts.append(f"{customer_row.state} - {customer_row.pincode}")
        
        return ", ".join(address_parts)
    
    # calculate_gst_breakup removed - logic is inlined in generate_invoice_for_order
    
    @staticmethod
    def copy_order_items_to_invoice(db: Session, order_id: int, invoice_id: int, is_same_state: bool = True):
        """Copy order items to invoice items table"""
        db.execute(text("""
            INSERT INTO sales.invoice_items (
                invoice_id, product_id, product_name, product_code,
                batch_number, quantity, unit_price, 
                discount_percent, discount_amount,
                tax_percent, cgst_amount, sgst_amount, igst_amount,
                line_total, hsn_code
            )
            SELECT 
                :invoice_id, oi.product_id, p.product_name, p.product_code,
                b.batch_number, oi.quantity, oi.unit_price,
                oi.discount_percent, oi.discount_amount,
                oi.tax_percent, 
                CASE WHEN :is_same_state THEN oi.tax_amount / 2 ELSE 0 END,
                CASE WHEN :is_same_state THEN oi.tax_amount / 2 ELSE 0 END,
                CASE WHEN NOT :is_same_state THEN oi.tax_amount ELSE 0 END,
                oi.line_total, p.hsn_code
            FROM sales.order_items oi
            JOIN inventory.products p ON oi.product_id = p.product_id
            LEFT JOIN inventory.batches b ON oi.batch_id = b.batch_id
            WHERE oi.order_id = :order_id
        """), {
            "invoice_id": invoice_id,
            "order_id": order_id,
            "is_same_state": is_same_state
        })
    
    @staticmethod
    def get_invoice_details(db: Session, invoice_id: int) -> Dict[str, Any]:
        """Get comprehensive invoice details"""
        # Get invoice with order details
        invoice = db.execute(text("""
            SELECT 
                i.*,
                o.order_number, o.order_date,
                c.primary_phone, c.primary_email, c.credit_days
            FROM sales.invoices i
            JOIN sales.orders o ON i.order_id = o.order_id
            JOIN parties.customers c ON i.customer_id = c.customer_id
            WHERE i.invoice_id = :invoice_id
        """), {"invoice_id": invoice_id}).fetchone()
        
        if not invoice:
            return None
        
        # Get invoice items
        items = db.execute(text("""
            SELECT * FROM sales.invoice_items
            WHERE invoice_id = :invoice_id
            ORDER BY invoice_item_id
        """), {"invoice_id": invoice_id}).fetchall()
        
        invoice_dict = dict(invoice._mapping)
        invoice_dict["items"] = [dict(item._mapping) for item in items]
        
        return invoice_dict

    # =========================================================================
    # NEW METHODS - Extracted from invoices.py create_invoice route
    # =========================================================================

    @staticmethod
    def calculate_invoice_totals(
        items: list, 
        gst_type: str = "CGST/SGST",
        freight_charges: float = 0,
        insurance_charges: float = 0,
        other_charges: float = 0,
        # NEW: Accept discount parameters instead of pre-calculated value
        discount_type: str = "percentage",
        discount_percent: float = 0,
        discount_amount: float = 0
    ) -> Dict[str, Any]:
        """
        Calculate all invoice totals from item list.
        
        Args:
            items: List of item dicts with quantity, unit_price, discount_percent, gst_percent
            gst_type: CGST/SGST for intra-state, IGST for inter-state
            freight_charges: Additional freight charges
            insurance_charges: Additional insurance charges
            other_charges: Other additional charges
            discount_type: "percentage" or "fixed"
            discount_percent: Invoice-level discount percentage (if type is percentage)
            discount_amount: Invoice-level discount amount (if type is fixed)
            
        Returns:
            Dict with all calculated totals
        """
        from ...shared.calculations import calculate_line_item
        
        subtotal = 0
        total_item_discount = 0
        total_cgst = 0
        total_sgst = 0
        total_igst = 0
        total_tax = 0
        
        calculated_lines = []
        
        for item in items:
            quantity = float(item.get("quantity", 1))
            unit_price = float(item.get("unit_price", 0))
            item_discount_percent = float(item.get("discount_percent", 0))
            gst_percent = float(item.get("gst_percent", 0))
            
            # Use base_quantity for billing (free items not billed)
            base_quantity = float(item.get("base_quantity", quantity))
            
            # Use shared helper for consistent calculations
            calc = calculate_line_item(base_quantity, unit_price, item_discount_percent, gst_percent, gst_type)
            
            calculated_lines.append(calc)
            
            subtotal += calc["subtotal"]
            total_item_discount += calc["discount_amount"]
            total_cgst += calc["cgst_amount"]
            total_sgst += calc["sgst_amount"]
            total_igst += calc["igst_amount"]
            total_tax += calc["total_tax"]
        
        # Calculate taxable amount after item-level discounts
        taxable_after_items = subtotal - total_item_discount
        
        # Calculate invoice-level discount (scheme discount)
        if discount_type == "percentage" and discount_percent > 0:
            invoice_discount = taxable_after_items * discount_percent / 100
        else:
            invoice_discount = discount_amount
        
        # CRITICAL: Apply scheme discount BEFORE GST calculation
        # Per Indian GST: All discounts must reduce the taxable base before tax
        taxable_after_all_discounts = taxable_after_items - invoice_discount
        
        # Recalculate GST on the fully discounted amount
        # (proportionally reduce based on effective GST rate)
        effective_gst_rate = total_tax / taxable_after_items if taxable_after_items > 0 else 0
        adjusted_total_tax = taxable_after_all_discounts * effective_gst_rate
        adjusted_cgst = adjusted_total_tax / 2 if total_cgst > 0 else 0
        adjusted_sgst = adjusted_total_tax / 2 if total_sgst > 0 else 0
        adjusted_igst = adjusted_total_tax if total_igst > 0 else 0
        
        # Final amount calculation - ONLY final_amount is rounded
        amount_before_round = (
            taxable_after_all_discounts + adjusted_total_tax + 
            freight_charges + insurance_charges + other_charges
        )
        final_amount = round(amount_before_round)
        round_off_amount = final_amount - amount_before_round
        
        return {
            # Canonical field names (matching database schema: sales.invoices)
            # NOTE: No rounding on intermediate values - only final_amount is rounded
            "subtotal_amount": subtotal,                    # DB: subtotal_amount
            "discount_amount": total_item_discount,         # DB: discount_amount (item-level)
            "scheme_discount": invoice_discount,            # DB: scheme_discount (invoice-level)
            "taxable_amount": taxable_after_all_discounts,  # DB: taxable_amount (AFTER all discounts)
            "total_tax_amount": adjusted_total_tax,         # DB: total_tax_amount (recalculated)
            "cgst_amount": adjusted_cgst,                   # DB: cgst_amount
            "sgst_amount": adjusted_sgst,                   # DB: sgst_amount
            "igst_amount": adjusted_igst,                   # DB: igst_amount
            "freight_charges": freight_charges,             # DB: freight_charges
            "insurance_charges": insurance_charges,         # DB: insurance_charges
            "other_charges": other_charges,                 # DB: other_charges
            "round_off_amount": round_off_amount,           # DB: round_off_amount
            "final_amount": final_amount,                   # DB: final_amount (ONLY this is rounded)
            "line_calculations": calculated_lines
        }

    @staticmethod
    def get_customer_details(
        db: Session, 
        customer_id: int, 
        org_id: str
    ) -> Dict[str, Any]:
        """
        Get customer name and address IDs for invoice creation.
        
        Returns:
            Dict with customer_name, billing_address_id, shipping_address_id
        """
        # Get customer name
        cust_result = db.execute(text("""
            SELECT customer_name FROM parties.customers
            WHERE customer_id = :customer_id AND org_id = :org_id
        """), {"customer_id": customer_id, "org_id": str(org_id)})
        cust = cust_result.fetchone()
        customer_name = cust[0] if cust else f"Customer {customer_id}"
        
        # Get billing address ID
        billing_addr_result = db.execute(text("""
            SELECT address_id
            FROM master.addresses
            WHERE entity_type = 'customer'
            AND entity_id = :customer_id
            AND org_id = :org_id
            AND address_type = 'billing'
            AND is_active = true
            ORDER BY is_default DESC, created_at DESC
            LIMIT 1
        """), {"customer_id": customer_id, "org_id": str(org_id)})
        billing_addr = billing_addr_result.fetchone()
        billing_address_id = billing_addr[0] if billing_addr else None
        
        # Get shipping address ID
        shipping_addr_result = db.execute(text("""
            SELECT address_id
            FROM master.addresses
            WHERE entity_type = 'customer'
            AND entity_id = :customer_id
            AND org_id = :org_id
            AND address_type = 'shipping'
            AND is_active = true
            ORDER BY is_default DESC, created_at DESC
            LIMIT 1
        """), {"customer_id": customer_id, "org_id": str(org_id)})
        shipping_addr = shipping_addr_result.fetchone()
        shipping_address_id = shipping_addr[0] if shipping_addr else None
        
        return {
            "customer_name": customer_name,
            "billing_address_id": billing_address_id,
            "shipping_address_id": shipping_address_id
        }

    @staticmethod
    def create_outstanding_record(
        db: Session,
        invoice_id: int,
        invoice_number: str,
        customer_id: int,
        invoice_date: date,
        org_id: str
    ) -> bool:
        """
        Create customer_outstanding record for receivables tracking.
        
        Returns:
            True if record created/updated, False on error
        """
        try:
            # Get the latest invoice data including payment status
            invoice_data_result = db.execute(text("""
                SELECT
                    final_amount,
                    paid_amount,
                    credit_amount,
                    payment_status,
                    due_date
                FROM sales.invoices
                WHERE invoice_id = :invoice_id AND org_id = :org_id
            """), {"invoice_id": invoice_id, "org_id": str(org_id)})
            inv_data = invoice_data_result.fetchone()
            
            if not inv_data or inv_data[3] == 'paid':
                return True  # No outstanding needed for fully paid
            
            final_amt = float(inv_data[0])
            paid_amt = float(inv_data[1]) if inv_data[1] else 0
            credit_amt = float(inv_data[2]) if inv_data[2] else final_amt - paid_amt
            payment_stat = inv_data[3]
            due_dt = inv_data[4] or (invoice_date + timedelta(days=7))
            
            # Check if outstanding record already exists
            existing_check = db.execute(text("""
                SELECT outstanding_id FROM financial.customer_outstanding
                WHERE org_id = :org_id 
                AND document_type = 'INVOICE' 
                AND document_id = :document_id
            """), {"org_id": org_id, "document_id": invoice_id})
            
            if not existing_check.fetchone():
                # Create new outstanding record
                db.execute(text("""
                    INSERT INTO financial.customer_outstanding (
                        org_id, customer_id, 
                        document_type, document_id, document_number,
                        document_date, original_amount, outstanding_amount,
                        paid_amount, due_date, status, 
                        days_overdue, aging_bucket
                    ) VALUES (
                        :org_id, :customer_id,
                        'INVOICE', :invoice_id, :invoice_number,
                        :invoice_date, :original_amount, :outstanding_amount,
                        :paid_amount, :due_date, :status,
                        GREATEST(0, CURRENT_DATE - :due_date::date),
                        CASE 
                            WHEN CURRENT_DATE <= :due_date::date THEN 'current'
                            WHEN CURRENT_DATE - :due_date::date BETWEEN 1 AND 30 THEN '0-30'
                            WHEN CURRENT_DATE - :due_date::date BETWEEN 31 AND 60 THEN '31-60'
                            WHEN CURRENT_DATE - :due_date::date BETWEEN 61 AND 90 THEN '61-90'
                            ELSE '90+'
                        END
                    )
                """), {
                    "org_id": org_id,
                    "customer_id": customer_id,
                    "invoice_id": invoice_id,
                    "invoice_number": invoice_number,
                    "invoice_date": invoice_date,
                    "original_amount": final_amt,
                    "outstanding_amount": credit_amt,
                    "paid_amount": paid_amt,
                    "due_date": due_dt,
                    "status": 'partial' if payment_stat == 'partial' else 'open'
                })
            else:
                # Update existing record
                db.execute(text("""
                    UPDATE financial.customer_outstanding
                    SET outstanding_amount = :outstanding_amount,
                        paid_amount = :paid_amount,
                        status = :status,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE org_id = :org_id 
                    AND document_type = 'INVOICE' 
                    AND document_id = :document_id
                """), {
                    "org_id": org_id,
                    "document_id": invoice_id,
                    "outstanding_amount": credit_amt,
                    "paid_amount": paid_amt,
                    "status": 'partial' if payment_stat == 'partial' else 'open'
                })
            
            db.commit()
            logger.info(f"✅ Customer outstanding record created/updated for invoice {invoice_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to create customer outstanding: {e}")
            db.rollback()
            return False