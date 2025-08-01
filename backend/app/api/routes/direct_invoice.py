"""
Direct Invoice Creation API
Create invoices without requiring orders - for direct sales
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

router = APIRouter(
    prefix="/api/v1/invoices",
    tags=["invoices"]
)

class InvoiceItemCreate(BaseModel):
    """Invoice item for direct creation"""
    product_id: int
    batch_id: Optional[int] = None
    quantity: int = Field(gt=0)
    unit_price: Decimal
    discount_percent: Optional[Decimal] = Decimal("0")
    gst_percent: Optional[Decimal] = None  # Will use product GST if not provided

class DirectInvoiceCreate(BaseModel):
    """Direct invoice creation request"""
    customer_id: int
    invoice_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    items: List[InvoiceItemCreate]
    discount_amount: Optional[Decimal] = Decimal("0")
    other_charges: Optional[Decimal] = Decimal("0")
    payment_mode: str = "Credit"
    payment_amount: Optional[Decimal] = Decimal("0")
    notes: Optional[str] = None

class InvoiceResponse(BaseModel):
    """Response after creating invoice"""
    invoice_id: int
    invoice_number: str
    customer_name: str
    invoice_date: datetime
    due_date: datetime
    subtotal: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    total_amount: Decimal
    payment_status: str
    created_at: datetime

@router.post("/direct", response_model=InvoiceResponse)
async def create_direct_invoice(
    invoice_data: DirectInvoiceCreate,
    db: Session = Depends(get_db),
    current_org = Depends(get_current_org)
):
    """
    Create an invoice directly without requiring an order
    Perfect for cash sales and direct billing
    """
    org_id = current_org["org_id"]
    
    try:
        # Get customer details
        customer = db.execute(text("""
            SELECT customer_id, customer_name, gst_number as gstin, state, state_code, credit_period_days as credit_days
            FROM customers
            WHERE customer_id = :customer_id AND org_id = :org_id
        """), {
            "customer_id": invoice_data.customer_id,
            "org_id": org_id
        }).first()
        
        if not customer:
            raise HTTPException(
                status_code=404,
                detail=f"Customer {invoice_data.customer_id} not found"
            )
        
        # Set dates
        invoice_date = invoice_data.invoice_date or datetime.utcnow()
        due_date = invoice_data.due_date or (invoice_date + timedelta(days=customer.credit_days or 0))
        
        # Generate invoice number
        result = db.execute(text("""
            SELECT COALESCE(MAX(CAST(
                SUBSTRING(invoice_number FROM 4) AS INTEGER
            )), 0) + 1 as next_num
            FROM invoices
            WHERE invoice_number LIKE 'INV%'
        """)).scalar()
        
        invoice_number = f"INV{result:06d}"
        
        # Calculate totals
        subtotal = Decimal("0")
        total_cgst = Decimal("0")
        total_sgst = Decimal("0")
        total_igst = Decimal("0")
        
        # Process items
        invoice_items = []
        for item in invoice_data.items:
            # Get product details
            product = db.execute(text("""
                SELECT product_name, gst_percent, hsn_code
                FROM products
                WHERE product_id = :product_id
            """), {"product_id": item.product_id}).first()
            
            if not product:
                raise HTTPException(
                    status_code=404,
                    detail=f"Product {item.product_id} not found"
                )
            
            # Calculate item totals
            gst_percent = item.gst_percent or product.gst_percent or Decimal("12")
            line_total = item.quantity * item.unit_price
            discount_amount = line_total * item.discount_percent / 100
            taxable_amount = line_total - discount_amount
            
            # Calculate GST (assuming intra-state for now)
            cgst_amount = taxable_amount * gst_percent / 200
            sgst_amount = taxable_amount * gst_percent / 200
            igst_amount = Decimal("0")
            
            subtotal += line_total
            total_cgst += cgst_amount
            total_sgst += sgst_amount
            
            invoice_items.append({
                "product_id": item.product_id,
                "product_name": product.product_name,
                "batch_id": item.batch_id,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "discount_percent": item.discount_percent,
                "discount_amount": discount_amount,
                "taxable_amount": taxable_amount,
                "gst_percent": gst_percent,
                "cgst_amount": cgst_amount,
                "sgst_amount": sgst_amount,
                "igst_amount": igst_amount,
                "total_amount": taxable_amount + cgst_amount + sgst_amount
            })
        
        # Calculate final totals
        taxable_amount = subtotal - invoice_data.discount_amount
        total_tax = total_cgst + total_sgst + total_igst
        total_amount = taxable_amount + total_tax + invoice_data.other_charges
        
        # Determine payment status
        if invoice_data.payment_mode == "Cash" or invoice_data.payment_amount >= total_amount:
            payment_status = "paid"
        elif invoice_data.payment_amount > 0:
            payment_status = "partial"
        else:
            payment_status = "pending"
        
        # Create invoice
        result = db.execute(text("""
            INSERT INTO invoices (
                org_id, invoice_number, order_id, customer_id,
                invoice_date, due_date,
                subtotal, discount_amount, taxable_amount,
                cgst_amount, sgst_amount, igst_amount,
                other_charges, total_amount,
                payment_status, payment_mode, paid_amount,
                notes, created_at, updated_at
            ) VALUES (
                :org_id, :invoice_number, NULL, :customer_id,
                :invoice_date, :due_date,
                :subtotal, :discount_amount, :taxable_amount,
                :cgst_amount, :sgst_amount, :igst_amount,
                :other_charges, :total_amount,
                :payment_status, :payment_mode, :paid_amount,
                :notes, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING invoice_id
        """), {
            "org_id": org_id,
            "invoice_number": invoice_number,
            "customer_id": invoice_data.customer_id,
            "invoice_date": invoice_date,
            "due_date": due_date,
            "subtotal": subtotal,
            "discount_amount": invoice_data.discount_amount,
            "taxable_amount": taxable_amount,
            "cgst_amount": total_cgst,
            "sgst_amount": total_sgst,
            "igst_amount": total_igst,
            "other_charges": invoice_data.other_charges,
            "total_amount": total_amount,
            "payment_status": payment_status,
            "payment_mode": invoice_data.payment_mode,
            "paid_amount": invoice_data.payment_amount,
            "notes": invoice_data.notes
        })
        
        invoice_id = result.scalar()
        
        # Insert invoice items
        for item_data in invoice_items:
            db.execute(text("""
                INSERT INTO invoice_items (
                    invoice_id, product_id, batch_id,
                    quantity, unit_price,
                    discount_percent, discount_amount, taxable_amount,
                    gst_percent, cgst_amount, sgst_amount, igst_amount,
                    total_amount
                ) VALUES (
                    :invoice_id, :product_id, :batch_id,
                    :quantity, :unit_price,
                    :discount_percent, :discount_amount, :taxable_amount,
                    :gst_percent, :cgst_amount, :sgst_amount, :igst_amount,
                    :total_amount
                )
            """), {
                "invoice_id": invoice_id,
                **item_data
            })
        
        # Update inventory if needed
        for item in invoice_data.items:
            if item.batch_id:
                db.execute(text("""
                    UPDATE batches
                    SET quantity_available = quantity_available - :quantity,
                        quantity_sold = quantity_sold + :quantity,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE batch_id = :batch_id
                """), {
                    "quantity": item.quantity,
                    "batch_id": item.batch_id
                })
        
        db.commit()
        
        return InvoiceResponse(
            invoice_id=invoice_id,
            invoice_number=invoice_number,
            customer_name=customer.customer_name,
            invoice_date=invoice_date,
            due_date=due_date,
            subtotal=subtotal,
            discount_amount=invoice_data.discount_amount,
            taxable_amount=taxable_amount,
            cgst_amount=total_cgst,
            sgst_amount=total_sgst,
            igst_amount=total_igst,
            total_amount=total_amount,
            payment_status=payment_status,
            created_at=datetime.utcnow()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create invoice: {str(e)}"
        )