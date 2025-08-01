"""
Invoice endpoints for detailed invoice data retrieval
Optimized for frontend PDF generation
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from decimal import Decimal
from datetime import date
import logging

from ...database import get_db
from ...services.invoice_service import InvoiceService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/invoices", tags=["invoices"])

@router.get("/")
async def get_invoices(
    customer_id: Optional[int] = None,
    invoice_status: Optional[str] = None,
    payment_status: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    Get invoices with optional filters
    """
    try:
        query = """
            SELECT 
                i.invoice_id,
                i.invoice_number,
                i.invoice_date,
                i.customer_id,
                i.customer_name,
                i.total_amount,
                i.payment_status,
                i.invoice_status,
                o.order_id,
                o.order_number
            FROM invoices i
            LEFT JOIN orders o ON i.order_id = o.order_id
            WHERE i.org_id = :org_id
        """
        
        params = {"org_id": DEFAULT_ORG_ID, "limit": limit, "offset": offset}
        
        if customer_id:
            query += " AND i.customer_id = :customer_id"
            params["customer_id"] = customer_id
            
        if invoice_status:
            query += " AND i.invoice_status = :invoice_status"
            params["invoice_status"] = invoice_status
            
        if payment_status:
            query += " AND i.payment_status = :payment_status"
            params["payment_status"] = payment_status
            
        if date_from:
            query += " AND i.invoice_date >= :date_from"
            params["date_from"] = date_from
            
        if date_to:
            query += " AND i.invoice_date <= :date_to"
            params["date_to"] = date_to
            
        query += " ORDER BY i.invoice_date DESC, i.created_at DESC LIMIT :limit OFFSET :offset"
        
        result = db.execute(text(query), params)
        invoices = []
        
        for row in result:
            invoice_dict = dict(row._mapping)
            
            # Get invoice items
            items_query = """
                SELECT 
                    ii.item_id,
                    ii.product_id,
                    ii.product_name,
                    ii.hsn_code,
                    ii.batch_id,
                    ii.quantity,
                    ii.unit_price as rate,
                    ii.mrp,
                    ii.gst_percent as tax_percent,
                    ii.discount_percent,
                    ii.discount_amount,
                    ii.taxable_amount,
                    ii.total_amount as line_total,
                    b.batch_number,
                    b.expiry_date
                FROM invoice_items ii
                LEFT JOIN batches b ON ii.batch_id = b.batch_id
                WHERE ii.invoice_id = :invoice_id
            """
            
            items_result = db.execute(text(items_query), {"invoice_id": invoice_dict["invoice_id"]})
            invoice_dict["items"] = [dict(item._mapping) for item in items_result]
            
            invoices.append(invoice_dict)
            
        # Get total count
        count_query = """
            SELECT COUNT(*) FROM invoices i
            WHERE i.org_id = :org_id
        """
        
        if customer_id:
            count_query += " AND i.customer_id = :customer_id"
        if invoice_status:
            count_query += " AND i.invoice_status = :invoice_status"
        if payment_status:
            count_query += " AND i.payment_status = :payment_status"
        if date_from:
            count_query += " AND i.invoice_date >= :date_from"
        if date_to:
            count_query += " AND i.invoice_date <= :date_to"
            
        total = db.execute(text(count_query), params).scalar()
        
        return {
            "invoices": invoices,
            "total": total,
            "limit": limit,
            "offset": offset
        }
        
    except Exception as e:
        logger.error(f"Error fetching invoices: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch invoices: {str(e)}")

# Default organization ID (should come from auth in production)
DEFAULT_ORG_ID = "12de5e22-eee7-4d25-b3a7-d16d01c6170f"


class InvoiceDetailResponse(BaseModel):
    """Comprehensive invoice details for PDF generation"""
    # Invoice details
    invoice_id: int
    invoice_number: str
    invoice_date: date
    due_date: Optional[date]
    
    # Order details
    order_id: int
    order_number: str
    order_date: date
    
    # Organization details
    org_name: str = "AASO Pharma"
    org_address: str = "123 Business Park, Mumbai, Maharashtra - 400001"
    org_gstin: str = "27AABCU9603R1ZM"
    org_phone: str = "+91 98765 43210"
    org_email: str = "info@aasopharma.com"
    
    # Customer details
    customer_id: int
    customer_name: str
    customer_code: str
    customer_gstin: Optional[str]
    billing_address: str
    shipping_address: Optional[str]
    customer_phone: Optional[str]
    customer_email: Optional[str]
    
    # Financial details
    subtotal_amount: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    total_tax_amount: Decimal
    round_off_amount: Decimal
    total_amount: Decimal
    
    # Payment details
    payment_status: str
    paid_amount: Decimal
    balance_amount: Decimal
    
    # Items
    items: list
    
    # Additional info
    notes: Optional[str]
    terms_and_conditions: str = "1. Goods once sold will not be taken back\n2. Interest @ 18% p.a. will be charged on overdue payments\n3. Subject to Mumbai Jurisdiction"
    
    # Bank details for payment
    bank_details: dict = {
        "bank_name": "HDFC Bank",
        "account_name": "AASO Pharma Pvt Ltd",
        "account_number": "50200012345678",
        "ifsc_code": "HDFC0001234",
        "branch": "Andheri West, Mumbai"
    }


@router.get("/{invoice_id}/details", response_model=InvoiceDetailResponse)
async def get_invoice_details(
    invoice_id: int,
    db: Session = Depends(get_db)
):
    """
    Get comprehensive invoice details for PDF generation
    
    Returns all data needed by frontend to generate invoice PDF including:
    - Complete invoice information
    - Customer details with formatted addresses
    - Itemized list with HSN codes
    - Tax breakup (CGST/SGST/IGST)
    - Payment status and history
    - Organization details
    """
    try:
        # Check if area column exists
        area_exists = db.execute(text("""
            SELECT EXISTS (
                SELECT 1 
                FROM information_schema.columns 
                WHERE table_name = 'customers' 
                AND column_name = 'area'
            )
        """)).scalar()
        
        # Get invoice with all related data
        if area_exists:
            invoice_query = text("""
                SELECT 
                    i.*,
                    o.order_number, o.order_date, o.org_id,
                    c.customer_code, c.phone as customer_phone, c.email as customer_email,
                    c.address_line1, c.address_line2, c.area, c.city, c.state, c.pincode
                FROM invoices i
                JOIN orders o ON i.order_id = o.order_id
                JOIN customers c ON i.customer_id = c.customer_id
                WHERE i.invoice_id = :invoice_id
            """)
        else:
            invoice_query = text("""
                SELECT 
                    i.*,
                    o.order_number, o.order_date, o.org_id,
                    c.customer_code, c.phone as customer_phone, c.email as customer_email,
                    c.address_line1, c.address_line2, NULL as area, c.city, c.state, c.pincode
                FROM invoices i
                JOIN orders o ON i.order_id = o.order_id
                JOIN customers c ON i.customer_id = c.customer_id
                WHERE i.invoice_id = :invoice_id
            """)
        
        invoice = db.execute(invoice_query, {"invoice_id": invoice_id}).fetchone()
        
        if not invoice:
            raise HTTPException(status_code=404, detail=f"Invoice {invoice_id} not found")
        
        # Get invoice items with product details
        items_query = text("""
            SELECT 
                ii.*,
                p.product_name, p.product_code, p.hsn_code,
                p.manufacturer, p.composition,
                b.batch_number, b.expiry_date
            FROM invoice_items ii
            JOIN products p ON ii.product_id = p.product_id
            LEFT JOIN order_items oi ON oi.product_id = ii.product_id 
                AND oi.order_id = :order_id
            LEFT JOIN batches b ON oi.batch_id = b.batch_id
            WHERE ii.invoice_id = :invoice_id
            ORDER BY ii.invoice_item_id
        """)
        
        items = db.execute(items_query, {
            "invoice_id": invoice_id,
            "order_id": invoice.order_id
        }).fetchall()
        
        # Format items for response
        formatted_items = []
        for idx, item in enumerate(items, 1):
            formatted_items.append({
                "sr_no": idx,
                "product_name": item.product_name,
                "product_code": item.product_code,
                "hsn_code": item.hsn_code or "3004",  # Default pharma HSN
                "batch_number": item.batch_number,
                "expiry_date": item.expiry_date,
                "quantity": item.quantity,
                "unit_price": float(item.unit_price),
                "discount_percent": float(item.discount_percent or 0),
                "discount_amount": float(item.discount_amount or 0),
                "tax_percent": float(item.tax_percent or 0),
                "cgst_percent": float(item.tax_percent or 0) / 2 if invoice.cgst_amount > 0 else 0,
                "sgst_percent": float(item.tax_percent or 0) / 2 if invoice.sgst_amount > 0 else 0,
                "igst_percent": float(item.tax_percent or 0) if invoice.igst_amount > 0 else 0,
                "cgst_amount": float(item.cgst_amount or 0),
                "sgst_amount": float(item.sgst_amount or 0),
                "igst_amount": float(item.igst_amount or 0),
                "line_total": float(item.line_total),
                "manufacturer": item.manufacturer,
                "composition": item.composition
            })
        
        # Calculate balance
        balance_amount = invoice.total_amount - invoice.paid_amount
        
        # Format addresses
        billing_address = InvoiceService.format_address(invoice)
        shipping_address = invoice.shipping_address or billing_address
        
        # Prepare response
        response_data = {
            # Invoice details
            "invoice_id": invoice.invoice_id,
            "invoice_number": invoice.invoice_number,
            "invoice_date": invoice.invoice_date,
            "due_date": invoice.due_date,
            
            # Order details
            "order_id": invoice.order_id,
            "order_number": invoice.order_number,
            "order_date": invoice.order_date,
            
            # Customer details
            "customer_id": invoice.customer_id,
            "customer_name": invoice.customer_name,
            "customer_code": invoice.customer_code,
            "customer_gstin": invoice.customer_gstin,
            "billing_address": billing_address,
            "shipping_address": shipping_address,
            "customer_phone": invoice.customer_phone,
            "customer_email": invoice.customer_email,
            
            # Financial details
            "subtotal_amount": invoice.subtotal_amount,
            "discount_amount": invoice.discount_amount,
            "taxable_amount": invoice.taxable_amount,
            "cgst_amount": invoice.cgst_amount,
            "sgst_amount": invoice.sgst_amount,
            "igst_amount": invoice.igst_amount,
            "total_tax_amount": invoice.total_tax_amount,
            "round_off_amount": invoice.round_off_amount,
            "total_amount": invoice.total_amount,
            
            # Payment details
            "payment_status": invoice.payment_status,
            "paid_amount": invoice.paid_amount,
            "balance_amount": balance_amount,
            
            # Items
            "items": formatted_items,
            
            # Additional info
            "notes": invoice.notes
        }
        
        return InvoiceDetailResponse(**response_data)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting invoice details: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get invoice details: {str(e)}")


@router.get("/list")
async def list_invoices(
    customer_id: Optional[int] = None,
    payment_status: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    List invoices with filters
    
    - Filter by customer, payment status, date range
    - Includes customer name and order details
    - Pagination support
    """
    try:
        # Build query
        query = """
            SELECT 
                i.invoice_id, i.invoice_number, i.invoice_date, i.due_date,
                i.total_amount, i.paid_amount, i.payment_status,
                c.customer_id, c.customer_name, c.customer_code,
                o.order_number, o.order_date,
                (i.total_amount - i.paid_amount) as balance_amount
            FROM invoices i
            JOIN orders o ON i.order_id = o.order_id
            JOIN customers c ON i.customer_id = c.customer_id
            WHERE o.org_id = :org_id
        """
        
        params = {"org_id": DEFAULT_ORG_ID}
        
        # Add filters
        if customer_id:
            query += " AND i.customer_id = :customer_id"
            params["customer_id"] = customer_id
        
        if payment_status:
            query += " AND i.payment_status = :payment_status"
            params["payment_status"] = payment_status
        
        if from_date:
            query += " AND i.invoice_date >= :from_date"
            params["from_date"] = from_date
        
        if to_date:
            query += " AND i.invoice_date <= :to_date"
            params["to_date"] = to_date
        
        # Count total
        count_query = f"SELECT COUNT(*) FROM ({query}) as cnt"
        total = db.execute(text(count_query), params).scalar()
        
        # Add ordering and pagination
        query += " ORDER BY i.invoice_date DESC, i.invoice_id DESC"
        query += " LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        # Execute query
        result = db.execute(text(query), params)
        invoices = [dict(row._mapping) for row in result]
        
        return {
            "total": total,
            "page": skip // limit + 1,
            "per_page": limit,
            "invoices": invoices
        }
        
    except Exception as e:
        logger.error(f"Error listing invoices: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to list invoices")


@router.put("/{invoice_id}/update-pdf")
async def update_invoice_pdf_status(
    invoice_id: int,
    pdf_url: str,
    db: Session = Depends(get_db)
):
    """
    Update invoice with PDF URL after frontend generates it
    
    Call this after successfully generating PDF in frontend
    """
    try:
        db.execute(text("""
            UPDATE invoices
            SET pdf_url = :pdf_url,
                pdf_generated_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE invoice_id = :invoice_id
        """), {"invoice_id": invoice_id, "pdf_url": pdf_url})
        
        db.commit()
        
        return {"message": "PDF URL updated successfully", "invoice_id": invoice_id}
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating PDF URL: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update PDF URL")


class InvoiceCalculateRequest(BaseModel):
    """Request for calculating invoice totals"""
    customer_id: int
    items: list
    delivery_type: Optional[str] = "PICKUP"
    payment_mode: Optional[str] = "cash"
    invoice_date: Optional[date] = None
    discount_amount: Optional[Decimal] = 0
    delivery_charges: Optional[Decimal] = 0


class InvoiceCalculateResponse(BaseModel):
    """Response with calculated totals"""
    subtotal_amount: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    total_tax_amount: Decimal
    delivery_charges: Decimal
    net_amount: Decimal
    round_off: Decimal
    final_amount: Decimal


@router.post("/calculate-live", response_model=InvoiceCalculateResponse)
async def calculate_invoice_totals(
    request: InvoiceCalculateRequest,
    db: Session = Depends(get_db)
):
    """
    Calculate invoice totals server-side for security and consistency
    """
    try:
        # Get customer details for GST calculations
        customer = db.execute(text("""
            SELECT state, state_code FROM customers
            WHERE customer_id = :customer_id
        """), {"customer_id": request.customer_id}).first()
        
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        # Get company/seller state from organization settings
        org_state_result = db.execute(text("""
            SELECT business_settings->>'state' as state,
                   business_settings->>'state_code' as state_code
            FROM organizations
            WHERE org_id = '12de5e22-eee7-4d25-b3a7-d16d01c6170f'
        """)).first()
        
        # Get seller's state - if not set, treat as intrastate
        company_state = org_state_result.state if org_state_result and org_state_result.state else None
        company_state_code = org_state_result.state_code if org_state_result and org_state_result.state_code else None
        
        # Determine if interstate
        if company_state and customer.state:
            is_interstate = customer.state.lower() != company_state.lower()
        else:
            # If either state is missing, default to intrastate (CGST/SGST)
            is_interstate = False
        
        subtotal = Decimal("0")
        total_cgst = Decimal("0")
        total_sgst = Decimal("0")
        total_igst = Decimal("0")
        
        # Calculate totals for each item
        for item in request.items:
            # Get product details if rate not provided
            product_id = item.get("product_id")
            rate = Decimal(str(item.get("rate", 0) or item.get("sale_price", 0) or item.get("unit_price", 0)))
            
            if rate == 0 and product_id:
                # Fetch product price from database
                product = db.execute(text("""
                    SELECT sale_price, mrp, gst_percent 
                    FROM products 
                    WHERE product_id = :product_id
                """), {"product_id": product_id}).first()
                
                if product:
                    rate = Decimal(str(product.sale_price or product.mrp or 0))
                    gst_percent = Decimal(str(product.gst_percent or 12))
                else:
                    gst_percent = Decimal("12")
            else:
                gst_percent = Decimal(str(item.get("gst_percent", 12) or item.get("tax_rate", 12) or 12))
            
            quantity = Decimal(str(item.get("quantity", 0)))
            discount_percent = Decimal(str(item.get("discount_percent", 0) or item.get("discount", 0)))
            
            line_total = quantity * rate
            discount_amount = line_total * discount_percent / 100
            taxable_amount = line_total - discount_amount
            
            if is_interstate:
                igst = taxable_amount * gst_percent / 100
                total_igst += igst
            else:
                cgst = taxable_amount * gst_percent / 200  # Half of GST
                sgst = taxable_amount * gst_percent / 200  # Half of GST
                total_cgst += cgst
                total_sgst += sgst
            
            subtotal += line_total
        
        # Apply invoice-level discount
        invoice_discount = request.discount_amount or Decimal("0")
        taxable_amount = subtotal - invoice_discount
        
        # Add delivery charges (not taxable)
        delivery_charges = request.delivery_charges or Decimal("0")
        
        # Calculate final totals
        total_tax = total_cgst + total_sgst + total_igst
        net_amount = taxable_amount + total_tax + delivery_charges
        
        # Round off
        final_amount = round(net_amount, 0)
        round_off = final_amount - net_amount
        
        return InvoiceCalculateResponse(
            subtotal_amount=subtotal,
            discount_amount=invoice_discount,
            taxable_amount=taxable_amount,
            cgst_amount=total_cgst,
            sgst_amount=total_sgst,
            igst_amount=total_igst,
            total_tax_amount=total_tax,
            delivery_charges=delivery_charges,
            net_amount=net_amount,
            round_off=round_off,
            final_amount=final_amount
        )
        
    except Exception as e:
        logger.error(f"Error calculating invoice: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to calculate invoice: {str(e)}")


@router.post("/{invoice_id}/record-payment")
async def record_payment(
    invoice_id: int,
    payment_data: dict,
    db: Session = Depends(get_db),
    org_id: str = DEFAULT_ORG_ID
):
    """Record payment for an invoice"""
    try:
        # Verify invoice exists and get current payment status
        invoice = db.execute(
            text("""
                SELECT invoice_id, total_amount, payment_status, 
                       COALESCE(paid_amount, 0) as amount_paid
                FROM invoices
                WHERE invoice_id = :invoice_id AND org_id = :org_id
            """),
            {"invoice_id": invoice_id, "org_id": org_id}
        ).fetchone()
        
        if not invoice:
            raise HTTPException(404, "Invoice not found")
        
        # Validate payment amount
        remaining = float(invoice.total_amount) - float(invoice.amount_paid)
        if payment_data['amount'] > remaining:
            raise HTTPException(400, f"Payment amount exceeds remaining balance of {remaining}")
        
        # Record payment
        result = db.execute(
            text("""
                INSERT INTO invoice_payments (
                    invoice_id, payment_date, payment_mode, amount,
                    transaction_id, bank_name, cheque_number, notes,
                    created_at, created_by
                ) VALUES (
                    :invoice_id, :payment_date, :payment_mode, :amount,
                    :transaction_id, :bank_name, :cheque_number, :notes,
                    CURRENT_TIMESTAMP, :created_by
                ) RETURNING payment_id
            """),
            {
                "invoice_id": invoice_id,
                "payment_date": payment_data.get('payment_date', date.today()),
                "payment_mode": payment_data['payment_mode'],
                "amount": payment_data['amount'],
                "transaction_id": payment_data.get('transaction_id'),
                "bank_name": payment_data.get('bank_name'),
                "cheque_number": payment_data.get('cheque_number'),
                "notes": payment_data.get('notes'),
                "created_by": payment_data.get('created_by', 1)
            }
        )
        
        payment_id = result.scalar()
        
        # Update invoice payment status
        new_amount_paid = float(invoice.amount_paid) + payment_data['amount']
        if new_amount_paid >= float(invoice.total_amount):
            payment_status = 'paid'
        else:
            payment_status = 'partial'
        
        db.execute(
            text("""
                UPDATE invoices
                SET paid_amount = :amount_paid,
                    payment_status = :payment_status,
                    updated_at = CURRENT_TIMESTAMP
                WHERE invoice_id = :invoice_id
            """),
            {
                "amount_paid": new_amount_paid,
                "payment_status": payment_status,
                "invoice_id": invoice_id
            }
        )
        
        db.commit()
        
        return {
            "payment_id": payment_id,
            "invoice_id": invoice_id,
            "amount_paid": new_amount_paid,
            "payment_status": payment_status,
            "message": "Payment recorded successfully"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error recording payment: {str(e)}")
        raise HTTPException(500, f"Failed to record payment: {str(e)}")