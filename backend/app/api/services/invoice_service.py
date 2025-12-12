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

from .document_number_service import DocumentNumberService
from .gst_service import GSTService
from ...core.constants import (
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