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

logger = logging.getLogger(__name__)


class InvoiceService:
    """Service class for invoice-related operations"""
    
    @staticmethod
    def generate_invoice_for_order(db: Session, order_id: int, invoice_date: date, org_id: UUID) -> Dict[str, Any]:
        """Generate a comprehensive invoice for an order"""
        
        # Check if area column exists
        area_exists = db.execute(text("""
            SELECT EXISTS (
                SELECT 1 
                FROM information_schema.columns 
                WHERE table_name = 'customers' 
                AND column_name = 'area'
            )
        """)).scalar()
        
        # Get order details with customer info
        if area_exists:
            order = db.execute(text("""
                SELECT 
                    o.*,
                    c.customer_name, c.customer_code,
                    c.gstin, c.pan_number,
                    c.address_line1, c.address_line2, c.area, c.city, c.state, c.pincode,
                    c.phone, c.email,
                    c.credit_days
                FROM orders o
                JOIN customers c ON o.customer_id = c.customer_id
                WHERE o.order_id = :order_id AND o.org_id = :org_id
            """), {"order_id": order_id, "org_id": org_id}).fetchone()
        else:
            order = db.execute(text("""
                SELECT 
                    o.*,
                    c.customer_name, c.customer_code,
                    c.gstin, c.pan_number,
                    c.address_line1, c.address_line2, NULL as area, c.city, c.state, c.pincode,
                    c.phone, c.email,
                    c.credit_days
                FROM orders o
                JOIN customers c ON o.customer_id = c.customer_id
                WHERE o.order_id = :order_id AND o.org_id = :org_id
            """), {"order_id": order_id, "org_id": org_id}).fetchone()
        
        if not order:
            raise ValueError(f"Order {order_id} not found")
        
        # Generate invoice number
        invoice_number = InvoiceService.generate_invoice_number(db)
        
        # Prepare customer addresses
        billing_address = InvoiceService.format_address(order)
        shipping_address = billing_address  # Same as billing unless specified
        
        # Calculate due date based on credit days
        due_date = invoice_date + timedelta(days=order.credit_days or 0)
        
        # Calculate GST amounts
        gst_details = InvoiceService.calculate_gst_breakup(
            order.subtotal_amount, 
            order.discount_amount, 
            order.tax_amount,
            order.state == "Maharashtra"  # Same state for CGST/SGST
        )
        
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
            "payment_status": "unpaid",
            "paid_amount": Decimal("0"),
            "invoice_type": "tax_invoice",
            "notes": f"Thank you for your business!",
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        }
        
        # Insert invoice
        result = db.execute(text("""
            INSERT INTO invoices (
                order_id, invoice_number, invoice_date, due_date,
                customer_id, customer_name, customer_gstin,
                billing_address, shipping_address,
                subtotal_amount, discount_amount, taxable_amount,
                cgst_amount, sgst_amount, igst_amount, total_tax_amount,
                round_off_amount, total_amount,
                payment_status, paid_amount, invoice_type, notes,
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
        InvoiceService.copy_order_items_to_invoice(db, order_id, invoice_id)
        
        # Update order status and invoice details
        db.execute(text("""
            UPDATE orders
            SET order_status = 'invoiced',
                invoice_number = :invoice_number,
                invoice_date = :invoice_date,
                updated_at = CURRENT_TIMESTAMP
            WHERE order_id = :order_id
        """), {
            "order_id": order_id,
            "invoice_number": invoice_number,
            "invoice_date": invoice_date
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
    
    @staticmethod
    def generate_invoice_number(db: Session) -> str:
        """Generate unique invoice number"""
        # Format: INV-YYYY-MM-XXXXX
        today = date.today()
        prefix = f"INV-{today.strftime('%Y-%m')}"
        
        # Get the next sequence number for this month
        result = db.execute(text("""
            SELECT COUNT(*) + 1 as next_num
            FROM invoices
            WHERE invoice_number LIKE :prefix || '%'
        """), {"prefix": prefix})
        
        next_num = result.scalar() or 1
        return f"{prefix}-{next_num:05d}"
    
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
    
    @staticmethod
    def calculate_gst_breakup(subtotal: Decimal, discount: Decimal, 
                            total_tax: Decimal, is_same_state: bool) -> Dict[str, Decimal]:
        """Calculate CGST/SGST or IGST based on location"""
        taxable_amount = subtotal - discount
        
        if is_same_state:
            # Split into CGST and SGST
            cgst_amount = total_tax / 2
            sgst_amount = total_tax / 2
            igst_amount = Decimal("0")
        else:
            # All tax as IGST
            cgst_amount = Decimal("0")
            sgst_amount = Decimal("0")
            igst_amount = total_tax
        
        return {
            "taxable_amount": taxable_amount,
            "cgst_amount": cgst_amount,
            "sgst_amount": sgst_amount,
            "igst_amount": igst_amount
        }
    
    @staticmethod
    def copy_order_items_to_invoice(db: Session, order_id: int, invoice_id: int):
        """Copy order items to invoice items table"""
        db.execute(text("""
            INSERT INTO invoice_items (
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
            FROM order_items oi
            JOIN products p ON oi.product_id = p.product_id
            LEFT JOIN batches b ON oi.batch_id = b.batch_id
            WHERE oi.order_id = :order_id
        """), {
            "invoice_id": invoice_id,
            "order_id": order_id,
            "is_same_state": True  # Simplified for now
        })
    
    @staticmethod
    def get_invoice_details(db: Session, invoice_id: int) -> Dict[str, Any]:
        """Get comprehensive invoice details"""
        # Get invoice with order details
        invoice = db.execute(text("""
            SELECT 
                i.*,
                o.order_number, o.order_date,
                c.phone, c.email, c.credit_days
            FROM invoices i
            JOIN orders o ON i.order_id = o.order_id
            JOIN customers c ON i.customer_id = c.customer_id
            WHERE i.invoice_id = :invoice_id
        """), {"invoice_id": invoice_id}).fetchone()
        
        if not invoice:
            return None
        
        # Get invoice items
        items = db.execute(text("""
            SELECT * FROM invoice_items
            WHERE invoice_id = :invoice_id
            ORDER BY invoice_item_id
        """), {"invoice_id": invoice_id}).fetchall()
        
        invoice_dict = dict(invoice._mapping)
        invoice_dict["items"] = [dict(item._mapping) for item in items]
        
        return invoice_dict