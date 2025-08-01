"""
Quick Sale API - The simplest way to create a sale
One endpoint, no complexity, just works
"""

from typing import List, Optional
from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel, Field
import uuid

from ...database import get_db
from ...core.auth import get_current_org

router = APIRouter(
    prefix="/api/v1/quick-sale",
    tags=["quick-sale"]
)

class QuickSaleItem(BaseModel):
    """Minimal item info for quick sale"""
    product_id: int
    quantity: int = Field(gt=0)
    # Optional - will use product's MRP if not provided
    unit_price: Optional[Decimal] = None
    discount_percent: Optional[Decimal] = 0

class QuickSaleRequest(BaseModel):
    """Minimal info needed for a complete sale"""
    customer_id: int
    items: List[QuickSaleItem]
    # Optional fields with smart defaults
    payment_mode: Optional[str] = "Cash"
    payment_amount: Optional[Decimal] = None  # If None, assumes full payment
    discount_amount: Optional[Decimal] = 0
    notes: Optional[str] = None

class QuickSaleResponse(BaseModel):
    """Everything you need after a sale"""
    success: bool
    invoice_number: str
    total_amount: Decimal
    # IDs are included but frontend doesn't need to use them
    order_id: int
    invoice_id: int
    # Ready-to-print invoice URL (if implemented)
    invoice_url: Optional[str] = None
    message: str

@router.post("/", response_model=QuickSaleResponse)
async def create_quick_sale(
    sale: QuickSaleRequest,
    db: Session = Depends(get_db),
    current_org = Depends(get_current_org)
):
    """
    The simplest way to create a sale - just send customer and items!
    
    This endpoint:
    1. Creates order (automatically)
    2. Validates inventory
    3. Calculates prices and taxes
    4. Creates invoice
    5. Records payment
    6. Updates inventory
    
    All in one atomic transaction!
    """
    org_id = current_org["org_id"]
    
    try:
        # Start transaction
        print(f"🚀 Quick sale for customer {sale.customer_id}")
        
        # Step 1: Validate customer
        customer = db.execute(text("""
            SELECT customer_id, customer_name, 
                   COALESCE(gstin, gst_number) as gstin, state, 
                   state_code, credit_period_days as credit_days, 
                   address, city, pincode
            FROM customers
            WHERE customer_id = :customer_id AND org_id = :org_id
        """), {
            "customer_id": sale.customer_id,
            "org_id": org_id
        }).first()
        
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        # Step 2: Create order (behind the scenes)
        # Generate unique order number using timestamp + random component
        import random
        timestamp = datetime.now()
        
        # Try to get max order number for today
        today_prefix = f"ORD{timestamp.strftime('%Y%m%d')}"
        max_order = db.execute(text("""
            SELECT MAX(order_number) 
            FROM orders 
            WHERE org_id = :org_id 
            AND order_number LIKE :prefix
        """), {
            "org_id": org_id,
            "prefix": f"{today_prefix}%"
        }).scalar()
        
        if max_order:
            # Extract the sequence number and increment
            try:
                last_seq = int(max_order[-6:])
                seq_num = last_seq + 1
            except:
                seq_num = 1
        else:
            # Start from 1 for the day
            seq_num = 1
            
        # Add random component to ensure uniqueness even in concurrent requests
        order_number = f"{today_prefix}{seq_num:06d}"
        
        # Double-check uniqueness
        exists = db.execute(text("""
            SELECT 1 FROM orders 
            WHERE order_number = :order_number 
            AND org_id = :org_id
        """), {
            "order_number": order_number,
            "org_id": org_id
        }).scalar()
        
        if exists:
            # If still exists, add random suffix
            order_number = f"{today_prefix}{seq_num:04d}{random.randint(10, 99)}"
        
        order_result = db.execute(text("""
            INSERT INTO orders (
                org_id, customer_id, customer_name, customer_phone, order_number, order_type, order_status,
                order_date, delivery_date,
                subtotal_amount, discount_amount, tax_amount, final_amount,
                paid_amount, payment_mode, payment_status,
                notes, created_at, updated_at
            ) VALUES (
                :org_id, :customer_id, :customer_name, :customer_phone, :order_number, 'sales', 'confirmed',
                CURRENT_DATE, CURRENT_DATE,
                0, :discount_amount, 0, 0,
                0, :payment_mode, 'pending',
                :notes, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING order_id
        """), {
            "org_id": org_id,
            "customer_id": sale.customer_id,
            "customer_name": customer.customer_name,
            "customer_phone": getattr(customer, 'phone', None),
            "order_number": order_number,
            "discount_amount": float(sale.discount_amount or 0),
            "payment_mode": sale.payment_mode.lower(),
            "notes": sale.notes or ""
        })
        
        order_id = order_result.scalar()
        print(f"✅ Created order {order_id}")
        
        # Step 3: Process items and calculate totals
        subtotal = Decimal("0")
        total_tax = Decimal("0")
        
        for item in sale.items:
            # Get product details
            product = db.execute(text("""
                SELECT product_id, product_name, mrp, sale_price, 
                       gst_percent, hsn_code
                FROM products
                WHERE product_id = :product_id
            """), {"product_id": item.product_id}).first()
            
            if not product:
                raise HTTPException(
                    status_code=404, 
                    detail=f"Product {item.product_id} not found"
                )
            
            # Use provided price or product's price
            unit_price = item.unit_price or product.sale_price or product.mrp
            
            # Check inventory
            available_stock = db.execute(text("""
                SELECT COALESCE(SUM(quantity_available), 0) as stock
                FROM batches
                WHERE product_id = :product_id 
                    AND org_id = :org_id
                    AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
            """), {
                "product_id": item.product_id,
                "org_id": org_id
            }).scalar() or 0
            
            if available_stock < item.quantity:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for {product.product_name}. Available: {available_stock}"
                )
            
            # Calculate item totals
            line_total = item.quantity * unit_price
            discount_amount = line_total * (item.discount_percent or 0) / 100
            taxable_amount = line_total - discount_amount
            gst_percent = product.gst_percent or Decimal("12")
            tax_amount = taxable_amount * gst_percent / 100
            item_total = taxable_amount + tax_amount
            
            subtotal += line_total
            total_tax += tax_amount
            
            # Insert order item
            db.execute(text("""
                INSERT INTO order_items (
                    order_id, product_id, quantity, selling_price,
                    discount_percent, discount_amount,
                    tax_percent, tax_amount,
                    total_price
                ) VALUES (
                    :order_id, :product_id, :quantity, :selling_price,
                    :discount_percent, :discount_amount,
                    :tax_percent, :tax_amount,
                    :total_price
                )
            """), {
                "order_id": order_id,
                "product_id": item.product_id,
                "quantity": item.quantity,
                "selling_price": float(unit_price),
                "discount_percent": float(item.discount_percent or 0),
                "discount_amount": float(discount_amount),
                "tax_percent": float(gst_percent),
                "tax_amount": float(tax_amount),
                "total_price": float(item_total)
            })
            
            # Update inventory (FIFO)
            remaining_qty = item.quantity
            batches = db.execute(text("""
                SELECT batch_id, quantity_available
                FROM batches
                WHERE product_id = :product_id 
                    AND org_id = :org_id
                    AND quantity_available > 0
                    AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
                ORDER BY expiry_date ASC, batch_id ASC
                FOR UPDATE
            """), {
                "product_id": item.product_id,
                "org_id": org_id
            }).fetchall()
            
            for batch in batches:
                if remaining_qty <= 0:
                    break
                    
                qty_from_batch = min(remaining_qty, batch.quantity_available)
                
                db.execute(text("""
                    UPDATE batches
                    SET quantity_available = quantity_available - :qty,
                        quantity_sold = quantity_sold + :qty,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE batch_id = :batch_id
                """), {
                    "qty": qty_from_batch,
                    "batch_id": batch.batch_id
                })
                
                remaining_qty -= qty_from_batch
        
        # Step 4: Update order totals
        final_amount = subtotal - (sale.discount_amount or 0)
        
        db.execute(text("""
            UPDATE orders 
            SET subtotal_amount = :subtotal,
                final_amount = :final_amount,
                tax_amount = :tax_amount
            WHERE order_id = :order_id
        """), {
            "subtotal": float(subtotal),
            "final_amount": float(final_amount),
            "tax_amount": float(total_tax),
            "order_id": order_id
        })
        
        # Step 5: Generate invoice
        invoice_number = f"INV{datetime.now().strftime('%Y%m%d')}{order_id:04d}"
        
        # Calculate GST split (assuming intra-state for simplicity)
        cgst_amount = total_tax / 2
        sgst_amount = total_tax / 2
        igst_amount = Decimal("0")
        
        invoice_result = db.execute(text("""
            INSERT INTO invoices (
                org_id, invoice_number, order_id, customer_id,
                customer_name, customer_gstin,
                billing_name, billing_address, billing_city, billing_state, billing_pincode,
                invoice_date, due_date,
                gst_type, place_of_supply,
                subtotal_amount, discount_amount, taxable_amount,
                cgst_amount, sgst_amount, igst_amount, total_tax_amount,
                total_amount, invoice_status,
                created_at, updated_at
            ) VALUES (
                :org_id, :invoice_number, :order_id, :customer_id,
                :customer_name, :customer_gstin,
                :billing_name, :billing_address, :billing_city, :billing_state, :billing_pincode,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
                :gst_type, :place_of_supply,
                :subtotal_amount, :discount_amount, :taxable_amount,
                :cgst_amount, :sgst_amount, :igst_amount, :total_tax_amount,
                :total_amount, :invoice_status,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING invoice_id
        """), {
            "org_id": org_id,
            "invoice_number": invoice_number,
            "order_id": order_id,
            "customer_id": sale.customer_id,
            "customer_name": customer.customer_name,
            "customer_gstin": customer.gstin or "",
            "billing_name": customer.customer_name,
            "billing_address": getattr(customer, 'address', None) or "N/A",
            "billing_city": getattr(customer, 'city', None) or "N/A",
            "billing_state": customer.state or "Karnataka",
            "billing_pincode": getattr(customer, 'pincode', None) or "000000",
            "gst_type": "cgst_sgst",  # Assuming intra-state
            "place_of_supply": customer.state_code or "29",
            "subtotal_amount": float(subtotal),
            "discount_amount": float(sale.discount_amount or 0),
            "taxable_amount": float(subtotal - (sale.discount_amount or 0)),
            "cgst_amount": float(cgst_amount),
            "sgst_amount": float(sgst_amount),
            "igst_amount": float(igst_amount),
            "total_tax_amount": float(total_tax),
            "total_amount": float(final_amount),
            "invoice_status": "paid" if sale.payment_mode.lower() == "cash" else "generated"
        })
        
        invoice_id = invoice_result.scalar()
        print(f"✅ Created invoice {invoice_number}")
        
        # Step 6: Record payment if provided
        payment_amount = sale.payment_amount or final_amount
        
        if payment_amount > 0:
            db.execute(text("""
                INSERT INTO invoice_payments (
                    payment_reference, invoice_id,
                    payment_date, payment_mode, amount, payment_amount,
                    notes
                ) VALUES (
                    :payment_reference, :invoice_id,
                    CURRENT_DATE, :payment_mode, :amount, :payment_amount,
                    'Quick sale payment'
                )
            """), {
                "payment_reference": f"PAY-{invoice_number}",
                "invoice_id": invoice_id,
                "payment_mode": sale.payment_mode.lower(),
                "amount": float(payment_amount),
                "payment_amount": float(payment_amount)
            })
            
            # Update order paid amount
            db.execute(text("""
                UPDATE orders 
                SET paid_amount = :amount
                WHERE order_id = :order_id
            """), {
                "amount": float(payment_amount),
                "order_id": order_id
            })
            
            # Update invoice payment status
            if payment_amount >= final_amount:
                db.execute(text("""
                    UPDATE invoices 
                    SET invoice_status = 'paid',
                        paid_amount = :amount
                    WHERE invoice_id = :invoice_id
                """), {
                    "amount": float(payment_amount),
                    "invoice_id": invoice_id
                })
        
        # Commit everything
        db.commit()
        print(f"✅ Quick sale completed successfully!")
        
        return QuickSaleResponse(
            success=True,
            invoice_number=invoice_number,
            total_amount=final_amount,
            order_id=order_id,
            invoice_id=invoice_id,
            invoice_url=f"/api/v1/invoices/{invoice_id}/print",  # If implemented
            message=f"Sale completed! Invoice {invoice_number} generated."
        )
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        print(f"❌ Quick sale failed: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Sale failed: {str(e)}"
        )