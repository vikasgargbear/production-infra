"""
Invoice Creation with Automatic Order Generation
Maintains proper order history for customer tracking
"""

from typing import List, Optional
from datetime import datetime, timedelta
from decimal import Decimal
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel, Field

from ...database import get_db
from ...dependencies import get_current_org
from ...services.order_service import OrderService

router = APIRouter(
    prefix="/api/v1/invoices",
    tags=["invoices"]
)

class InvoiceItemCreate(BaseModel):
    """Invoice item for creation"""
    product_id: int
    batch_id: Optional[int] = None
    quantity: int = Field(gt=0)
    unit_price: Decimal
    discount_percent: Optional[Decimal] = Decimal("0")
    gst_percent: Optional[Decimal] = None

class InvoiceWithOrderCreate(BaseModel):
    """Create invoice with automatic order generation"""
    customer_id: int
    items: List[InvoiceItemCreate]
    discount_amount: Optional[Decimal] = Decimal("0")
    other_charges: Optional[Decimal] = Decimal("0")
    payment_mode: str = "Credit"
    payment_amount: Optional[Decimal] = Decimal("0")
    delivery_date: Optional[datetime] = None
    notes: Optional[str] = None

class InvoiceWithOrderResponse(BaseModel):
    """Response after creating invoice with order"""
    order_id: int
    order_number: str
    invoice_id: int
    invoice_number: str
    customer_name: str
    total_amount: Decimal
    payment_status: str
    message: str

@router.post("/create-with-order", response_model=InvoiceWithOrderResponse)
async def create_invoice_with_order(
    invoice_data: InvoiceWithOrderCreate,
    db: Session = Depends(get_db),
    current_org = Depends(get_current_org)
):
    """
    Create an invoice with automatic order generation
    This maintains proper order history for customer tracking
    """
    org_id = current_org["org_id"]
    
    try:
        # Step 1: Create Order First
        print(f"Creating order for customer {invoice_data.customer_id}")
        
        # Prepare order items
        order_items = []
        for item in invoice_data.items:
            order_items.append({
                "product_id": item.product_id,
                "quantity": item.quantity,
                "unit_price": float(item.unit_price),
                "discount_percent": float(item.discount_percent or 0),
                "batch_id": item.batch_id
            })
        
        # Create order data
        order_data = {
            "customer_id": invoice_data.customer_id,
            "order_type": "sales_order",
            "delivery_date": invoice_data.delivery_date or datetime.utcnow(),
            "items": order_items,
            "discount_amount": float(invoice_data.discount_amount or 0),
            "other_charges": float(invoice_data.other_charges or 0),
            "notes": invoice_data.notes
        }
        
        # Create the order
        result = db.execute(text("""
            INSERT INTO orders (
                org_id, customer_id, order_type, order_status,
                order_date, delivery_date,
                subtotal, discount_amount, other_charges,
                final_amount, paid_amount,
                notes, created_at, updated_at
            ) VALUES (
                :org_id, :customer_id, :order_type, 'confirmed',
                CURRENT_TIMESTAMP, :delivery_date,
                0, :discount_amount, :other_charges,
                0, 0,
                :notes, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING order_id
        """), {
            "org_id": org_id,
            "customer_id": order_data["customer_id"],
            "order_type": order_data["order_type"],
            "delivery_date": order_data["delivery_date"],
            "discount_amount": order_data["discount_amount"],
            "other_charges": order_data["other_charges"],
            "notes": order_data["notes"]
        })
        
        order_id = result.scalar()
        order_number = f"ORD{order_id:06d}"
        
        # Update order with order number
        db.execute(text("""
            UPDATE orders 
            SET order_number = :order_number 
            WHERE order_id = :order_id
        """), {
            "order_number": order_number,
            "order_id": order_id
        })
        
        print(f"Created order {order_id} with number {order_number}")
        
        # Step 2: Add order items and calculate totals
        subtotal = Decimal("0")
        
        for item in order_items:
            # Get product details
            product = db.execute(text("""
                SELECT product_name, gst_percent
                FROM products
                WHERE product_id = :product_id
            """), {"product_id": item["product_id"]}).first()
            
            if not product:
                raise HTTPException(
                    status_code=404,
                    detail=f"Product {item['product_id']} not found"
                )
            
            # Calculate item totals
            line_total = Decimal(str(item["quantity"])) * Decimal(str(item["unit_price"]))
            discount_amount = line_total * Decimal(str(item["discount_percent"])) / 100
            taxable_amount = line_total - discount_amount
            gst_percent = product.gst_percent or Decimal("12")
            tax_amount = taxable_amount * gst_percent / 100
            total_amount = taxable_amount + tax_amount
            
            subtotal += line_total
            
            # Insert order item
            db.execute(text("""
                INSERT INTO order_items (
                    order_id, product_id, quantity, unit_price,
                    discount_percent, discount_amount,
                    taxable_amount, tax_percent, tax_amount,
                    total_amount, batch_id
                ) VALUES (
                    :order_id, :product_id, :quantity, :unit_price,
                    :discount_percent, :discount_amount,
                    :taxable_amount, :tax_percent, :tax_amount,
                    :total_amount, :batch_id
                )
            """), {
                "order_id": order_id,
                "product_id": item["product_id"],
                "quantity": item["quantity"],
                "unit_price": item["unit_price"],
                "discount_percent": item["discount_percent"],
                "discount_amount": discount_amount,
                "taxable_amount": taxable_amount,
                "tax_percent": gst_percent,
                "tax_amount": tax_amount,
                "total_amount": total_amount,
                "batch_id": item.get("batch_id")
            })
        
        # Update order totals
        final_amount = subtotal - Decimal(str(order_data["discount_amount"])) + Decimal(str(order_data["other_charges"]))
        
        db.execute(text("""
            UPDATE orders 
            SET subtotal = :subtotal,
                final_amount = :final_amount
            WHERE order_id = :order_id
        """), {
            "subtotal": subtotal,
            "final_amount": final_amount,
            "order_id": order_id
        })
        
        # Step 3: Generate invoice from the order
        print(f"Generating invoice for order {order_id}")
        
        # Get customer details
        customer = db.execute(text("""
            SELECT customer_name, gst_number as gstin, state, state_code
            FROM customers
            WHERE customer_id = :customer_id
        """), {"customer_id": invoice_data.customer_id}).first()
        
        # Generate invoice using the service
        from ...services.invoice_service import InvoiceService
        
        invoice_result = InvoiceService.generate_invoice_for_order(
            db=db,
            order_id=order_id,
            org_id=org_id,
            invoice_date=datetime.utcnow()
        )
        
        invoice_id = invoice_result["invoice_id"]
        invoice_number = invoice_result["invoice_number"]
        
        # Step 4: Record payment if provided
        if invoice_data.payment_amount and invoice_data.payment_amount > 0:
            db.execute(text("""
                INSERT INTO billing_payments (
                    org_id, order_id, invoice_id, customer_id,
                    payment_date, payment_mode, amount,
                    reference_number, notes,
                    created_at
                ) VALUES (
                    :org_id, :order_id, :invoice_id, :customer_id,
                    CURRENT_TIMESTAMP, :payment_mode, :amount,
                    :reference_number, 'Payment recorded with invoice',
                    CURRENT_TIMESTAMP
                )
            """), {
                "org_id": org_id,
                "order_id": order_id,
                "invoice_id": invoice_id,
                "customer_id": invoice_data.customer_id,
                "payment_mode": invoice_data.payment_mode,
                "amount": invoice_data.payment_amount,
                "reference_number": f"PAY-{invoice_number}"
            })
            
            # Update order paid amount
            db.execute(text("""
                UPDATE orders 
                SET paid_amount = paid_amount + :amount
                WHERE order_id = :order_id
            """), {
                "amount": invoice_data.payment_amount,
                "order_id": order_id
            })
            
            # Update invoice payment status
            payment_status = "paid" if invoice_data.payment_amount >= final_amount else "partial"
            db.execute(text("""
                UPDATE invoices 
                SET payment_status = :status,
                    paid_amount = :amount
                WHERE invoice_id = :invoice_id
            """), {
                "status": payment_status,
                "amount": invoice_data.payment_amount,
                "invoice_id": invoice_id
            })
        
        db.commit()
        
        return InvoiceWithOrderResponse(
            order_id=order_id,
            order_number=order_number,
            invoice_id=invoice_id,
            invoice_number=invoice_number,
            customer_name=customer.customer_name,
            total_amount=final_amount,
            payment_status=payment_status if invoice_data.payment_amount else "pending",
            message=f"Successfully created order {order_number} and invoice {invoice_number}"
        )
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        print(f"Error creating invoice with order: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create invoice: {str(e)}"
        )