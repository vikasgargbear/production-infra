"""
Billing service layer for invoice generation and GST calculations
Handles invoice creation, payment recording, and GST reports
"""
from typing import Dict
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy.orm import Session
from sqlalchemy import text
from uuid import UUID
import logging

from ..schemas_v2.billing import (
    InvoiceCreate, InvoiceResponse, InvoiceItemBase,
    PaymentCreate, PaymentResponse,
    GSTType, InvoiceStatus, GSTR1Summary,
    InvoiceSummary
)

logger = logging.getLogger(__name__)


class BillingService:
    """Service class for billing and GST operations"""
    
    @staticmethod
    def generate_invoice_number(db: Session, org_id: UUID) -> str:
        """Generate unique invoice number"""
        # Get current financial year
        today = date.today()
        if today.month >= 4:
            fy_start = today.year
            fy_end = today.year + 1
        else:
            fy_start = today.year - 1
            fy_end = today.year
        
        fy_code = f"{fy_start % 100}{fy_end % 100}"  # e.g., "2425" for 2024-25
        
        # Get next sequence
        result = db.execute(text("""
            SELECT COUNT(*) + 1 as next_num
            FROM invoices
            WHERE org_id = :org_id
                AND invoice_number LIKE :prefix || '%'
        """), {
            "org_id": org_id,
            "prefix": f"INV{fy_code}"
        })
        
        next_num = result.scalar() or 1
        return f"INV{fy_code}{next_num:05d}"
    
    @staticmethod
    def calculate_gst_amounts(
        taxable_amount: Decimal, 
        gst_percent: Decimal,
        gst_type: GSTType
    ) -> Dict[str, Decimal]:
        """Calculate GST amounts based on type"""
        total_gst = (taxable_amount * gst_percent / 100).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        
        if gst_type == GSTType.CGST_SGST:
            # Within state - split equally
            cgst = (total_gst / 2).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            sgst = total_gst - cgst  # Ensure total matches
            return {
                "cgst_amount": cgst,
                "sgst_amount": sgst,
                "igst_amount": Decimal("0")
            }
        else:
            # Inter-state - full IGST
            return {
                "cgst_amount": Decimal("0"),
                "sgst_amount": Decimal("0"),
                "igst_amount": total_gst
            }
    
    @staticmethod
    def create_invoice_from_order(
        db: Session, 
        invoice_data: InvoiceCreate,
        org_id: UUID
    ) -> InvoiceResponse:
        """Create invoice from an order"""
        try:
            # Get order details
            order = db.execute(text("""
                SELECT o.*, c.customer_name, c.gstin, c.address_line1,
                       c.city, c.state, c.pincode, c.phone,
                       c.credit_days
                FROM orders o
                JOIN customers c ON o.customer_id = c.customer_id
                WHERE o.order_id = :order_id
                    AND o.org_id = :org_id
                    AND o.order_status IN ('confirmed', 'delivered')
            """), {
                "order_id": invoice_data.order_id,
                "org_id": org_id
            }).fetchone()
            
            if not order:
                raise ValueError("Order not found or not eligible for invoicing")
            
            # Check if invoice already exists
            existing = db.execute(text("""
                SELECT invoice_id FROM invoices 
                WHERE order_id = :order_id
            """), {"order_id": invoice_data.order_id}).scalar()
            
            if existing:
                raise ValueError(f"Invoice already exists for this order (ID: {existing})")
            
            # Generate invoice number
            invoice_number = BillingService.generate_invoice_number(db, org_id)
            
            # Calculate due date
            invoice_date = invoice_data.invoice_date or date.today()
            payment_terms_days = invoice_data.payment_terms_days or order.credit_days or 0
            due_date = invoice_date + timedelta(days=payment_terms_days)
            
            # Get order items
            items = db.execute(text("""
                SELECT oi.*, p.product_name, p.hsn_code, p.gst_rate,
                       b.batch_number
                FROM order_items oi
                JOIN products p ON oi.product_id = p.product_id
                LEFT JOIN batches b ON oi.batch_id = b.batch_id
                WHERE oi.order_id = :order_id
            """), {"order_id": invoice_data.order_id}).fetchall()
            
            # Determine GST type based on state
            org_state = db.execute(text("""
                SELECT state FROM organizations
                WHERE org_id = :org_id
            """), {"org_id": org_id}).scalar()
            
            gst_type = GSTType.CGST_SGST if org_state == order.state else GSTType.IGST
            
            # Create invoice
            result = db.execute(text("""
                INSERT INTO invoices (
                    org_id, invoice_number, order_id, invoice_date, due_date,
                    customer_id, customer_name, customer_gstin,
                    billing_name, billing_address, billing_city, 
                    billing_state, billing_pincode, billing_phone,
                    shipping_name, shipping_address, shipping_city,
                    shipping_state, shipping_pincode,
                    gst_type, place_of_supply, is_reverse_charge,
                    subtotal_amount, discount_amount, taxable_amount,
                    cgst_amount, sgst_amount, igst_amount, total_tax_amount,
                    round_off_amount, total_amount,
                    invoice_status, payment_terms, notes,
                    created_at, updated_at
                ) VALUES (
                    :org_id, :invoice_number, :order_id, :invoice_date, :due_date,
                    :customer_id, :customer_name, :customer_gstin,
                    :billing_name, :billing_address, :billing_city,
                    :billing_state, :billing_pincode, :billing_phone,
                    :shipping_name, :shipping_address, :shipping_city,
                    :shipping_state, :shipping_pincode,
                    :gst_type, :place_of_supply, :is_reverse_charge,
                    :subtotal_amount, :discount_amount, :taxable_amount,
                    :cgst_amount, :sgst_amount, :igst_amount, :total_tax_amount,
                    :round_off_amount, :total_amount,
                    :invoice_status, :payment_terms, :notes,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                ) RETURNING invoice_id
            """), {
                "org_id": org_id,
                "invoice_number": invoice_number,
                "order_id": invoice_data.order_id,
                "invoice_date": invoice_date,
                "due_date": due_date,
                "customer_id": order.customer_id,
                "customer_name": order.customer_name,
                "customer_gstin": order.gstin,
                "billing_name": order.billing_name or order.customer_name,
                "billing_address": order.billing_address or order.address_line1,
                "billing_city": order.city,
                "billing_state": order.state,
                "billing_pincode": order.pincode,
                "billing_phone": order.phone,
                "shipping_name": order.shipping_name,
                "shipping_address": order.shipping_address,
                "shipping_city": order.city,
                "shipping_state": order.state,
                "shipping_pincode": order.pincode,
                "gst_type": gst_type.value,
                "place_of_supply": order.state[:2],  # First 2 chars of state
                "is_reverse_charge": False,
                "subtotal_amount": order.subtotal_amount,
                "discount_amount": order.discount_amount,
                "taxable_amount": order.subtotal_amount - order.discount_amount,
                "cgst_amount": order.tax_amount / 2 if gst_type == GSTType.CGST_SGST else 0,
                "sgst_amount": order.tax_amount / 2 if gst_type == GSTType.CGST_SGST else 0,
                "igst_amount": order.tax_amount if gst_type == GSTType.IGST else 0,
                "total_tax_amount": order.tax_amount,
                "round_off_amount": order.round_off_amount,
                "total_amount": order.final_amount,
                "invoice_status": InvoiceStatus.GENERATED.value,
                "payment_terms": f"Net {payment_terms_days} days",
                "notes": invoice_data.notes
            })
            
            invoice_id = result.scalar()
            
            # Insert invoice items
            for item in items:
                taxable = Decimal(str(item.quantity * item.unit_price - item.discount_amount))
                gst_amounts = BillingService.calculate_gst_amounts(
                    taxable, 
                    Decimal(str(item.gst_rate or 0)),
                    gst_type
                )
                
                db.execute(text("""
                    INSERT INTO invoice_items (
                        invoice_id, product_id, product_name, hsn_code,
                        batch_id, batch_number, quantity, unit_price, mrp,
                        discount_percent, discount_amount,
                        gst_percent, cgst_amount, sgst_amount, igst_amount,
                        taxable_amount, total_amount
                    ) VALUES (
                        :invoice_id, :product_id, :product_name, :hsn_code,
                        :batch_id, :batch_number, :quantity, :unit_price, :mrp,
                        :discount_percent, :discount_amount,
                        :gst_percent, :cgst_amount, :sgst_amount, :igst_amount,
                        :taxable_amount, :total_amount
                    )
                """), {
                    "invoice_id": invoice_id,
                    "product_id": item.product_id,
                    "product_name": item.product_name,
                    "hsn_code": item.hsn_code,
                    "batch_id": item.batch_id,
                    "batch_number": item.batch_number,
                    "quantity": item.quantity,
                    "unit_price": item.unit_price,
                    "mrp": item.mrp,
                    "discount_percent": item.discount_percent,
                    "discount_amount": item.discount_amount,
                    "gst_percent": item.gst_rate or 0,
                    "cgst_amount": gst_amounts["cgst_amount"],
                    "sgst_amount": gst_amounts["sgst_amount"],
                    "igst_amount": gst_amounts["igst_amount"],
                    "taxable_amount": taxable,
                    "total_amount": taxable + sum(gst_amounts.values())
                })
            
            db.commit()
            
            # Return complete invoice
            return BillingService.get_invoice(db, invoice_id)
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error creating invoice: {str(e)}")
            raise
    
    @staticmethod
    def get_invoice(db: Session, invoice_id: int) -> InvoiceResponse:
        """Get invoice with all details"""
        # Get invoice
        invoice = db.execute(text("""
            SELECT i.*, 
                   i.total_amount - COALESCE(i.paid_amount, 0) as balance_amount
            FROM invoices i
            WHERE i.invoice_id = :invoice_id
        """), {"invoice_id": invoice_id}).fetchone()
        
        if not invoice:
            raise ValueError(f"Invoice {invoice_id} not found")
        
        # Get invoice items
        items = db.execute(text("""
            SELECT * FROM invoice_items
            WHERE invoice_id = :invoice_id
            ORDER BY product_name
        """), {"invoice_id": invoice_id}).fetchall()
        
        invoice_dict = dict(invoice._mapping)
        invoice_dict["items"] = [
            InvoiceItemBase(**dict(item._mapping)) for item in items
        ]
        
        return InvoiceResponse(**invoice_dict)
    
    @staticmethod
    def record_payment(
        db: Session,
        payment_data: PaymentCreate
    ) -> PaymentResponse:
        """Record payment against invoice"""
        try:
            # Get invoice details
            invoice = db.execute(text("""
                SELECT i.*, c.customer_name,
                       i.total_amount - COALESCE(i.paid_amount, 0) as balance_amount
                FROM invoices i
                JOIN customers c ON i.customer_id = c.customer_id
                WHERE i.invoice_id = :invoice_id
            """), {"invoice_id": payment_data.invoice_id}).fetchone()
            
            if not invoice:
                raise ValueError("Invoice not found")
            
            if invoice.balance_amount <= 0:
                raise ValueError("Invoice is already fully paid")
            
            if payment_data.amount > invoice.balance_amount:
                raise ValueError(f"Payment amount exceeds balance ({invoice.balance_amount})")
            
            # Insert payment
            result = db.execute(text("""
                INSERT INTO invoice_payments (
                    invoice_id, payment_date, amount, payment_mode,
                    transaction_reference, bank_name, 
                    cheque_number, cheque_date,
                    notes, created_at
                ) VALUES (
                    :invoice_id, :payment_date, :amount, :payment_mode,
                    :transaction_reference, :bank_name,
                    :cheque_number, :cheque_date,
                    :notes, CURRENT_TIMESTAMP
                ) RETURNING payment_id
            """), payment_data.dict())
            
            payment_id = result.scalar()
            
            # Update invoice paid amount and status
            new_paid_amount = invoice.paid_amount + payment_data.amount
            new_status = (
                InvoiceStatus.PAID if new_paid_amount >= invoice.total_amount
                else InvoiceStatus.PARTIALLY_PAID
            )
            
            db.execute(text("""
                UPDATE invoices
                SET paid_amount = :paid_amount,
                    invoice_status = :status,
                    updated_at = CURRENT_TIMESTAMP
                WHERE invoice_id = :invoice_id
            """), {
                "invoice_id": payment_data.invoice_id,
                "paid_amount": new_paid_amount,
                "status": new_status.value
            })
            
            # Update order paid amount
            db.execute(text("""
                UPDATE orders
                SET paid_amount = :paid_amount,
                    updated_at = CURRENT_TIMESTAMP
                WHERE order_id = (
                    SELECT order_id FROM invoices 
                    WHERE invoice_id = :invoice_id
                )
            """), {
                "invoice_id": payment_data.invoice_id,
                "paid_amount": new_paid_amount
            })
            
            db.commit()
            
            # Return payment details
            payment = db.execute(text("""
                SELECT p.*, i.invoice_number, c.customer_name
                FROM invoice_payments p
                JOIN invoices i ON p.invoice_id = i.invoice_id
                JOIN customers c ON i.customer_id = c.customer_id
                WHERE p.payment_id = :payment_id
            """), {"payment_id": payment_id}).fetchone()
            
            return PaymentResponse(**dict(payment._mapping))
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error recording payment: {str(e)}")
            raise
    
    @staticmethod
    def get_gstr1_summary(
        db: Session,
        org_id: UUID,
        from_date: date,
        to_date: date
    ) -> GSTR1Summary:
        """Generate GSTR-1 summary for outward supplies"""
        # B2B supplies (with GSTIN)
        b2b = db.execute(text("""
            SELECT 
                COUNT(*) as invoice_count,
                COALESCE(SUM(taxable_amount), 0) as taxable_value,
                COALESCE(SUM(cgst_amount), 0) as cgst,
                COALESCE(SUM(sgst_amount), 0) as sgst,
                COALESCE(SUM(igst_amount), 0) as igst
            FROM invoices
            WHERE org_id = :org_id
                AND invoice_date BETWEEN :from_date AND :to_date
                AND invoice_status NOT IN ('draft', 'cancelled')
                AND customer_gstin IS NOT NULL
        """), {
            "org_id": org_id,
            "from_date": from_date,
            "to_date": to_date
        }).fetchone()
        
        # B2C supplies (without GSTIN)
        b2c = db.execute(text("""
            SELECT 
                COUNT(*) as invoice_count,
                COALESCE(SUM(taxable_amount), 0) as taxable_value,
                COALESCE(SUM(cgst_amount), 0) as cgst,
                COALESCE(SUM(sgst_amount), 0) as sgst,
                COALESCE(SUM(igst_amount), 0) as igst
            FROM invoices
            WHERE org_id = :org_id
                AND invoice_date BETWEEN :from_date AND :to_date
                AND invoice_status NOT IN ('draft', 'cancelled')
                AND customer_gstin IS NULL
        """), {
            "org_id": org_id,
            "from_date": from_date,
            "to_date": to_date
        }).fetchone()
        
        period = from_date.strftime("%m-%Y")
        
        return GSTR1Summary(
            period=period,
            b2b_invoices=b2b.invoice_count,
            b2b_taxable_value=b2b.taxable_value,
            b2b_cgst=b2b.cgst,
            b2b_sgst=b2b.sgst,
            b2b_igst=b2b.igst,
            b2c_invoices=b2c.invoice_count,
            b2c_taxable_value=b2c.taxable_value,
            b2c_cgst=b2c.cgst,
            b2c_sgst=b2c.sgst,
            b2c_igst=b2c.igst,
            nil_rated_supplies=Decimal("0"),
            exempted_supplies=Decimal("0"),
            total_invoices=b2b.invoice_count + b2c.invoice_count,
            total_taxable_value=b2b.taxable_value + b2c.taxable_value,
            total_tax=b2b.cgst + b2b.sgst + b2b.igst + b2c.cgst + b2c.sgst + b2c.igst
        )
    
    @staticmethod
    def get_invoice_summary(db: Session, org_id: UUID) -> InvoiceSummary:
        """Get invoice summary for dashboard"""
        # Overall summary
        overall = db.execute(text("""
            SELECT 
                COUNT(*) as total_invoices,
                COALESCE(SUM(total_amount), 0) as total_amount,
                COALESCE(SUM(paid_amount), 0) as paid_amount,
                COALESCE(SUM(total_amount - paid_amount), 0) as outstanding_amount,
                COALESCE(SUM(
                    CASE 
                        WHEN due_date < CURRENT_DATE AND paid_amount < total_amount 
                        THEN total_amount - paid_amount 
                        ELSE 0 
                    END
                ), 0) as overdue_amount
            FROM invoices
            WHERE org_id = :org_id
        """), {"org_id": org_id}).fetchone()
        
        # By status
        status_counts = db.execute(text("""
            SELECT 
                invoice_status,
                COUNT(*) as count
            FROM invoices
            WHERE org_id = :org_id
            GROUP BY invoice_status
        """), {"org_id": org_id}).fetchall()
        
        status_dict = {row.invoice_status: row.count for row in status_counts}
        
        # Current month
        current_month = db.execute(text("""
            SELECT 
                COUNT(*) as invoice_count,
                COALESCE(SUM(total_amount), 0) as total_amount,
                COALESCE(SUM(paid_amount), 0) as collected_amount
            FROM invoices
            WHERE org_id = :org_id
                AND EXTRACT(YEAR FROM invoice_date) = EXTRACT(YEAR FROM CURRENT_DATE)
                AND EXTRACT(MONTH FROM invoice_date) = EXTRACT(MONTH FROM CURRENT_DATE)
        """), {"org_id": org_id}).fetchone()
        
        return InvoiceSummary(
            total_invoices=overall.total_invoices,
            total_amount=overall.total_amount,
            paid_amount=overall.paid_amount,
            outstanding_amount=overall.outstanding_amount,
            overdue_amount=overall.overdue_amount,
            draft_count=status_dict.get(InvoiceStatus.DRAFT.value, 0),
            generated_count=status_dict.get(InvoiceStatus.GENERATED.value, 0),
            paid_count=status_dict.get(InvoiceStatus.PAID.value, 0),
            partially_paid_count=status_dict.get(InvoiceStatus.PARTIALLY_PAID.value, 0),
            cancelled_count=status_dict.get(InvoiceStatus.CANCELLED.value, 0),
            current_month_invoices=current_month.invoice_count,
            current_month_amount=current_month.total_amount,
            current_month_collected=current_month.collected_amount
        )