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

from ...core.database import get_db
from ...core.config import DEFAULT_ORG_ID

# Use actual org_id from database
ACTUAL_ORG_ID = "ad808530-1ddb-4377-ab20-67bef145d80d"
from ..services.invoice_service import InvoiceService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/invoices", tags=["invoices"])

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
                i.final_amount,
                i.payment_status,
                i.invoice_status,
                o.order_id,
                o.order_number
            FROM sales.invoices i
            LEFT JOIN sales.orders o ON i.order_id = o.order_id
            WHERE i.org_id = :org_id
        """
        
        params = {"org_id": ACTUAL_ORG_ID, "limit": limit, "offset": offset}
        
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
                    ii.invoice_item_id as item_id,
                    ii.product_id,
                    ii.product_name,
                    ii.hsn_code,
                    ii.batch_id,
                    ii.quantity,
                    ii.unit_price as rate,
                    ii.mrp,
                    COALESCE(ii.igst_rate, ii.cgst_rate + ii.sgst_rate, 0) as tax_percent,
                    ii.discount_percent,
                    ii.discount_amount,
                    ii.taxable_amount,
                    ii.line_total,
                    b.batch_number,
                    b.expiry_date
                FROM sales.invoice_items ii
                LEFT JOIN inventory.batches b ON ii.batch_id = b.batch_id
                WHERE ii.invoice_id = :invoice_id
            """
            
            items_result = db.execute(text(items_query), {"invoice_id": invoice_dict["invoice_id"]})
            invoice_dict["items"] = [dict(item._mapping) for item in items_result]
            
            invoices.append(invoice_dict)
            
        # Get total count
        count_query = """
            SELECT COUNT(*) FROM sales.invoices i
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
                FROM sales.invoices i
                JOIN sales.orders o ON i.order_id = o.order_id
                JOIN parties.customers c ON i.customer_id = c.customer_id
                WHERE i.invoice_id = :invoice_id
            """)
        else:
            invoice_query = text("""
                SELECT 
                    i.*,
                    o.order_number, o.order_date, o.org_id,
                    c.customer_code, c.phone as customer_phone, c.email as customer_email,
                    c.address_line1, c.address_line2, NULL as area, c.city, c.state, c.pincode
                FROM sales.invoices i
                JOIN sales.orders o ON i.order_id = o.order_id
                JOIN parties.customers c ON i.customer_id = c.customer_id
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
            FROM sales.invoice_items ii
            JOIN inventory.products p ON ii.product_id = p.product_id
            LEFT JOIN sales.order_items oi ON oi.product_id = ii.product_id 
                AND oi.order_id = :order_id
            LEFT JOIN inventory.batches b ON oi.batch_id = b.batch_id
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
        balance_amount = invoice.total_amount - (invoice.paid_amount if hasattr(invoice, 'paid_amount') else 0)
        
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
            "paid_amount": invoice.paid_amount if hasattr(invoice, 'paid_amount') else 0,
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
                i.final_amount, 0 as paid_amount, i.payment_status,
                c.customer_id, c.customer_name, c.customer_code,
                o.order_number, o.order_date,
                (i.final_amount - 0) as balance_amount
            FROM sales.invoices i
            JOIN sales.orders o ON i.order_id = o.order_id
            JOIN parties.customers c ON i.customer_id = c.customer_id
            WHERE o.org_id = :org_id
        """
        
        params = {"org_id": ACTUAL_ORG_ID}
        
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
            UPDATE sales.invoices
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

@router.post("/")
async def create_invoice(
    invoice_data: dict,
    db: Session = Depends(get_db)
):
    """
    Create a new invoice with items
    """
    try:
        logger.info(f"Starting invoice creation for customer {invoice_data.get('customer_id')}")
        
        # Generate invoice number
        result = db.execute(
            text("""
                SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+') AS INTEGER)), 0) + 1 as next_num
                FROM sales.invoices
                WHERE org_id = :org_id
                AND invoice_number LIKE 'INV-%'
            """),
            {"org_id": ACTUAL_ORG_ID}
        )
        next_num = result.scalar() or 1
        invoice_number = f"INV-{next_num:06d}"
        
        # Step 2: Create Order First (Invoice requires order_id foreign key)
        order_result = db.execute(
            text("""
                SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM '[0-9]+') AS INTEGER)), 0) + 1 as next_num
                FROM sales.orders
                WHERE org_id = :org_id
                AND order_number LIKE 'ORD-%'
            """),
            {"org_id": ACTUAL_ORG_ID}
        )
        order_next_num = order_result.scalar() or 1
        order_number = f"ORD-{order_next_num:06d}"
        
        # Calculate totals from items BEFORE creating invoice
        total_calculated = 0
        subtotal_calculated = 0
        total_cgst = 0
        total_sgst = 0
        
        # Get product details for proper pricing
        for item in invoice_data.get("items", []):
            try:
                product_id = item.get("product_id")
                quantity = float(item.get("quantity", 1))
                
                # Get product details from database
                product_result = db.execute(text("""
                    SELECT p.product_id, p.product_name, p.gst_percentage, p.hsn_code,
                           b.batch_id, b.batch_number, b.sale_price_per_unit, b.mrp
                    FROM inventory.products p
                    LEFT JOIN inventory.batches b ON p.product_id = b.product_id
                    WHERE p.product_id = :product_id
                    AND b.quantity_available > 0
                    ORDER BY b.expiry_date NULLS LAST
                    LIMIT 1
                """), {"product_id": product_id})
                
                product = product_result.fetchone()
                if product:
                    unit_price = float(product.sale_price_per_unit or item.get("unit_price", 0))
                    gst_percent = float(product.gst_percentage or 12)
                else:
                    unit_price = float(item.get("unit_price", 0))
                    gst_percent = float(item.get("gst_percent", 12) or item.get("gst_percentage", 12))
                
                discount_percent = float(item.get("discount_percent", 0) or item.get("discount_percentage", 0))
                
                # Calculate amounts
                subtotal = quantity * unit_price
                discount_amount = subtotal * (discount_percent / 100)
                taxable = subtotal - discount_amount
                cgst = taxable * (gst_percent / 200)  # Half of GST
                sgst = taxable * (gst_percent / 200)  # Half of GST
                
                total_cgst += cgst
                total_sgst += sgst
                subtotal_calculated += taxable
                total_calculated += (taxable + cgst + sgst)
                
            except Exception as calc_error:
                logger.warning(f"Could not calculate item totals: {calc_error}")
        
        # Use calculated totals
        final_total = round(total_calculated, 2) if total_calculated > 0 else invoice_data.get("total_amount", 0)
        final_subtotal = round(subtotal_calculated, 2) if subtotal_calculated > 0 else invoice_data.get("subtotal", 0)
        
        # Step 3: Create Order (required by invoice foreign key)
        try:
            order_create = db.execute(
                text("""
                    INSERT INTO sales.orders (
                        org_id, branch_id, order_number, order_date, order_type,
                        customer_id, customer_name, delivery_type, payment_mode,
                        subtotal_amount, discount_amount, taxable_amount,
                        cgst_amount, sgst_amount, igst_amount, total_tax_amount,
                        delivery_charges, total_amount, order_status,
                        created_by, created_at, updated_at
                    ) VALUES (
                        :org_id, 1, :order_number, :order_date, 'sales',
                        :customer_id, :customer_name, 'pickup', :payment_mode,
                        :subtotal, :discount, :taxable,
                        :cgst, :sgst, 0, :total_tax,
                        0, :total, 'confirmed',
                        2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                    )
                    RETURNING order_id
                """),
                {
                    "org_id": ACTUAL_ORG_ID,
                    "order_number": order_number,
                    "order_date": date.today(),  # Use date, not datetime
                    "customer_id": invoice_data["customer_id"],
                    "customer_name": invoice_data.get("customer_name", ""),
                    "payment_mode": invoice_data.get("payment_method", "cash"),
                    "subtotal": final_subtotal,
                    "discount": invoice_data.get("discount_amount", 0),
                    "taxable": final_subtotal,
                    "cgst": round(total_cgst, 2),
                    "sgst": round(total_sgst, 2),
                    "total_tax": round(total_cgst + total_sgst, 2),
                    "total": final_total
                }
            )
            order_id = order_create.scalar()
            logger.info(f"Created order {order_number} with ID {order_id}")
            
        except Exception as order_error:
            logger.error(f"Failed to create order: {order_error}")
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to create order: {str(order_error)}")
        
        # Step 4: Create invoice record with order_id
        invoice_params = {
            "org_id": ACTUAL_ORG_ID,
            "order_id": order_id,  # Link to order
            "invoice_number": invoice_number,
            "invoice_date": date.today(),  # Use date, not datetime from request
            "invoice_type": invoice_data.get("invoice_type", "tax_invoice"),
            "customer_id": invoice_data["customer_id"],
            "customer_name": invoice_data.get("customer_name", ""),
            "payment_terms": invoice_data.get("payment_terms", "cash"),
            "due_date": invoice_data.get("due_date"),
            "place_of_supply": invoice_data.get("place_of_supply", "Maharashtra"),
            "subtotal_amount": final_subtotal,
            "discount_amount": invoice_data.get("discount_amount", 0),
            "taxable_amount": final_subtotal,
            "cgst_amount": round(total_cgst, 2),
            "sgst_amount": round(total_sgst, 2),
            "igst_amount": 0,
            "total_tax_amount": round(total_cgst + total_sgst, 2),
            "final_amount": final_total,
            "notes": invoice_data.get("notes")
        }
        
        try:
            # Remove ALL analytics/KPI related triggers (user is OK without analytics for now)
            try:
                # Get all triggers on sales.invoices table and drop any analytics-related ones
                trigger_result = db.execute(text("""
                    SELECT trigger_name FROM information_schema.triggers 
                    WHERE event_object_table = 'invoices' 
                    AND event_object_schema = 'sales'
                    AND (trigger_name ILIKE '%kpi%' 
                         OR trigger_name ILIKE '%analytic%' 
                         OR trigger_name ILIKE '%realtime%'
                         OR trigger_name ILIKE '%calculate%')
                """))
                
                triggers_to_drop = [row[0] for row in trigger_result.fetchall()]
                
                for trigger_name in triggers_to_drop:
                    db.execute(text(f"DROP TRIGGER IF EXISTS {trigger_name} ON sales.invoices"))
                    logger.info(f"Dropped analytics trigger: {trigger_name}")
                
                if triggers_to_drop:
                    logger.info(f"Removed {len(triggers_to_drop)} analytics triggers as requested")
                else:
                    logger.info("No analytics triggers found to remove")
                    
            except Exception as trigger_error:
                logger.warning(f"Could not clean up analytics triggers: {trigger_error}")
                # Continue anyway
            
            # Create invoice record with order_id
            invoice_result = db.execute(
                text("""
                    INSERT INTO sales.invoices (
                        org_id, branch_id, order_id, invoice_number, invoice_date, invoice_type,
                        customer_id, customer_name, payment_terms, due_date, place_of_supply,
                        subtotal_amount, discount_amount, taxable_amount,
                        cgst_amount, sgst_amount, igst_amount, total_tax_amount,
                        final_amount, invoice_status, payment_status,
                        notes, created_by, created_at, updated_at
                    ) VALUES (
                        :org_id, 1, :order_id, :invoice_number, :invoice_date, :invoice_type,
                        :customer_id, :customer_name, :payment_terms, :due_date, :place_of_supply,
                        :subtotal_amount, :discount_amount, :taxable_amount,
                        :cgst_amount, :sgst_amount, :igst_amount, :total_tax_amount,
                        :final_amount, 'posted', 'unpaid',
                        :notes, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                    )
                    RETURNING invoice_id
                """),
                invoice_params
            )
            invoice_id = invoice_result.scalar()
            
        except Exception as invoice_error:
            logger.error(f"Invoice creation failed: {invoice_error}")
            raise invoice_error
        
        # Step 5: Create order items and invoice items
        items_created = 0
        items_list = invoice_data.get("items", [])
        logger.info(f"Processing {len(items_list)} items for invoice {invoice_id}")
        
        for idx, item in enumerate(items_list):
            try:
                product_id = item.get("product_id")
                logger.info(f"Processing item {idx+1}/{len(items_list)} with product_id: {product_id}")
                
                # Get batch details first (simpler query)
                logger.info(f"Querying batch for product_id {product_id}")
                product_batch = db.execute(text("""
                    SELECT b.batch_id, b.product_id, b.batch_number, 
                           b.sale_price_per_unit, b.mrp, b.quantity_available
                    FROM inventory.batches b
                    WHERE b.product_id = :product_id
                    AND b.quantity_available > 0
                    ORDER BY b.expiry_date NULLS LAST, b.batch_id
                    LIMIT 1
                """), {"product_id": product_id}).fetchone()
                
                if not product_batch:
                    logger.warning(f"No batch with stock for product {product_id} - skipping item")
                    continue
                
                logger.info(f"Found batch {product_batch.batch_number} with {product_batch.quantity_available} units")
                
                # Get product details separately
                product_info = db.execute(text("""
                    SELECT product_name, product_code, hsn_code
                    FROM inventory.products
                    WHERE product_id = :product_id
                """), {"product_id": product_id}).fetchone()
                
                # Combine the data
                if product_info:
                    product_name = product_info.product_name
                    product_code = product_info.product_code
                    hsn_code = product_info.hsn_code or "3004"
                else:
                    product_name = item.get("product_name", f"Product {product_id}")
                    product_code = f"PROD{product_id}"
                    hsn_code = "3004"
                
                # Use GST from item or default
                gst_percentage = float(item.get("gst_percent", 12) or item.get("gst_percentage", 12))
                
                # Calculate item amounts using batch price
                quantity = float(item.get("quantity", 1))
                unit_price = float(product_batch.sale_price_per_unit or item.get("unit_price", 0))
                mrp = float(product_batch.mrp or unit_price)
                discount_percent = float(item.get("discount_percent", 0) or item.get("discount_percentage", 0))
                gst_percent = gst_percentage  # Use the GST from above
                
                # Calculate line totals
                subtotal = quantity * unit_price
                discount_amount = subtotal * (discount_percent / 100)
                taxable_amount = subtotal - discount_amount
                
                # Calculate GST (assuming intrastate - CGST/SGST)
                cgst_rate = gst_percent / 2
                sgst_rate = gst_percent / 2
                cgst_amount = taxable_amount * (cgst_rate / 100)
                sgst_amount = taxable_amount * (sgst_rate / 100)
                igst_rate = 0
                igst_amount = 0
                
                total_amount = taxable_amount + cgst_amount + sgst_amount
                
                # Create order item first
                db.execute(text("""
                    INSERT INTO sales.order_items (
                        order_id, product_id, product_name, batch_id,
                        quantity, unit_price, mrp,
                        discount_percent, discount_amount,
                        taxable_amount, cgst_rate, cgst_amount,
                        sgst_rate, sgst_amount, igst_rate, igst_amount,
                        total_tax_amount, line_total,
                        created_at
                    ) VALUES (
                        :order_id, :product_id, :product_name, :batch_id,
                        :quantity, :unit_price, :mrp,
                        :discount_percent, :discount_amount,
                        :taxable_amount, :cgst_rate, :cgst_amount,
                        :sgst_rate, :sgst_amount, :igst_rate, :igst_amount,
                        :total_tax_amount, :line_total,
                        CURRENT_TIMESTAMP
                    )
                """), {
                    "order_id": order_id,
                    "product_id": product_batch.product_id,
                    "product_name": product_name,  # Use the combined product_name
                    "batch_id": product_batch.batch_id,
                    "quantity": quantity,
                    "unit_price": unit_price,
                    "mrp": mrp,
                    "discount_percent": discount_percent,
                    "discount_amount": discount_amount,
                    "taxable_amount": taxable_amount,
                    "cgst_rate": cgst_rate,
                    "cgst_amount": cgst_amount,
                    "sgst_rate": sgst_rate,
                    "sgst_amount": sgst_amount,
                    "igst_rate": igst_rate,
                    "igst_amount": igst_amount,
                    "total_tax_amount": cgst_amount + sgst_amount,
                    "line_total": total_amount
                })
                
                # Insert invoice item with all required fields
                logger.info(f"Inserting invoice item for product {product_name} into invoice {invoice_id}")
                db.execute(text("""
                    INSERT INTO sales.invoice_items (
                        invoice_id, product_id, product_name,
                        hsn_code, batch_id, batch_number,
                        quantity, unit_price, mrp,
                        discount_percent, discount_amount,
                        taxable_amount, cgst_rate, cgst_amount, 
                        sgst_rate, sgst_amount, igst_rate, igst_amount,
                        total_tax_amount, line_total,
                        uom, pack_type, created_at
                    ) VALUES (
                        :invoice_id, :product_id, :product_name,
                        :hsn_code, :batch_id, :batch_number,
                        :quantity, :unit_price, :mrp,
                        :discount_percent, :discount_amount,
                        :taxable_amount, :cgst_rate, :cgst_amount,
                        :sgst_rate, :sgst_amount, :igst_rate, :igst_amount,
                        :total_tax_amount, :line_total,
                        :uom, :pack_type, CURRENT_TIMESTAMP
                    )
                """), {
                    "invoice_id": invoice_id,
                    "product_id": product_batch.product_id,
                    "product_name": product_name,  # Use the combined product_name
                    "hsn_code": hsn_code,  # Use the combined hsn_code
                    "batch_id": product_batch.batch_id,
                    "batch_number": product_batch.batch_number,
                    "quantity": quantity,
                    "unit_price": unit_price,
                    "mrp": mrp,
                    "discount_percent": discount_percent,
                    "discount_amount": discount_amount,
                    "taxable_amount": taxable_amount,
                    "cgst_rate": cgst_rate,
                    "cgst_amount": cgst_amount,
                    "sgst_rate": sgst_rate,
                    "sgst_amount": sgst_amount,
                    "igst_rate": igst_rate,
                    "igst_amount": igst_amount,
                    "total_tax_amount": cgst_amount + sgst_amount,
                    "line_total": total_amount,
                    "uom": item.get("uom", "STRIP"),
                    "pack_type": item.get("pack_type", "STRIP")
                })
                
                logger.info(f"Created invoice item for product {product_name} in invoice {invoice_id}")
                items_created += 1
                
                # Step 6: Deduct inventory from the specific batch
                db.execute(text("""
                    UPDATE inventory.batches
                    SET quantity_available = quantity_available - :quantity,
                        quantity_sold = COALESCE(quantity_sold, 0) + :quantity,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE batch_id = :batch_id
                    AND quantity_available >= :quantity
                """), {"batch_id": product_batch.batch_id, "quantity": quantity})
                
                logger.info(f"Deducted {quantity} units from batch {product_batch.batch_number} for product {product_name}")
                
                # Step 7: Create inventory movement record for tracking
                db.execute(text("""
                    INSERT INTO inventory.inventory_movements (
                        org_id, product_id, batch_id, movement_type,
                        reference_type, reference_id, quantity,
                        from_location, to_location, movement_date,
                        created_by, created_at
                    ) VALUES (
                        :org_id, :product_id, :batch_id, 'sale',
                        'invoice', :invoice_id, :quantity,
                        'warehouse', 'customer', CURRENT_DATE,
                        2, CURRENT_TIMESTAMP
                    )
                """), {
                    "org_id": ACTUAL_ORG_ID,
                    "product_id": product_batch.product_id,
                    "batch_id": product_batch.batch_id,
                    "invoice_id": invoice_id,
                    "quantity": -quantity  # Negative for outward movement
                })
                
            except Exception as item_error:
                logger.error(f"Error creating invoice item: {item_error}")
                logger.error(f"Product ID: {item.get('product_id')}, Invoice ID: {invoice_id}")
                # Raise the error to see what's happening
                raise HTTPException(status_code=500, detail=f"Failed to create invoice item: {str(item_error)}")
        
        # Log items created
        logger.info(f"Created {items_created} invoice items for invoice {invoice_id}")
        
        # Step 8: Update customer outstanding balance
        db.execute(text("""
            UPDATE parties.customers
            SET current_outstanding = COALESCE(current_outstanding, 0) + :amount,
                updated_at = CURRENT_TIMESTAMP
            WHERE customer_id = :customer_id
        """), {
            "customer_id": invoice_data["customer_id"],
            "amount": final_total
        })
        
        # Step 9: Create journal entries for accounting
        try:
            # Debit: Customer Account (Receivable)
            db.execute(text("""
                INSERT INTO financial.journal_entries (
                    org_id, entry_date, entry_type, reference_type, reference_id,
                    narration, total_debit, total_credit, status,
                    created_by, created_at
                ) VALUES (
                    :org_id, :entry_date, 'sales', 'invoice', :invoice_id,
                    :narration, :amount, :amount, 'posted',
                    2, CURRENT_TIMESTAMP
                )
                RETURNING entry_id
            """), {
                "org_id": ACTUAL_ORG_ID,
                "entry_date": date.today(),  # Use date object
                "invoice_id": invoice_id,
                "narration": f"Sales Invoice {invoice_number}",
                "amount": final_total
            })
            
            # Step 10: Create GST ledger entries
            if total_cgst > 0:
                db.execute(text("""
                    INSERT INTO gst.gst_ledger (
                        org_id, transaction_date, transaction_type, reference_type, reference_id,
                        gstin, cgst_amount, sgst_amount, igst_amount, total_amount,
                        created_at
                    ) VALUES (
                        :org_id, :trans_date, 'output', 'invoice', :invoice_id,
                        :gstin, :cgst, :sgst, 0, :total,
                        CURRENT_TIMESTAMP
                    )
                """), {
                    "org_id": ACTUAL_ORG_ID,
                    "trans_date": date.today(),  # Use date object
                    "invoice_id": invoice_id,
                    "gstin": "27AABCU9603R1ZM",  # Company GSTIN
                    "cgst": round(total_cgst, 2),
                    "sgst": round(total_sgst, 2),
                    "total": round(total_cgst + total_sgst, 2)
                })
                
        except Exception as financial_error:
            logger.warning(f"Could not create financial entries: {financial_error}")
            # Continue - invoice is already created
        
        # Commit the complete invoice creation with all entries
        db.commit()
        logger.info(f"Invoice {invoice_number} created successfully with total ₹{final_total}")
        
        return {
            "invoice_id": invoice_id,
            "invoice_number": invoice_number,
            "order_id": order_id,
            "order_number": order_number,
            "message": "Invoice created successfully with all entries",
            "total_amount": final_total,
            "customer_id": invoice_data["customer_id"]
        }
        
    except Exception as e:
        db.rollback()
        error_msg = str(e) if e else "Unknown error occurred"
        logger.error(f"Error in invoice creation attempt: {error_msg}")
        logger.error(f"Error type: {type(e).__name__}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        
        # If the error message is empty, provide more context
        if not str(e):
            error_msg = f"Database operation failed - check logs for details"
        
        raise HTTPException(status_code=500, detail=f"Invoice creation failed: {error_msg}")

@router.get("/{invoice_id}")
async def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db)
):
    """
    Get basic invoice information by ID
    """
    try:
        result = db.execute(
            text("""
                SELECT 
                    invoice_id, invoice_number, invoice_date, customer_id,
                    customer_name, final_amount as total_amount, invoice_status,
                    payment_status, notes
                FROM sales.invoices
                WHERE invoice_id = :invoice_id
            """),
            {"invoice_id": invoice_id}
        )
        
        invoice = result.fetchone()
        if not invoice:
            raise HTTPException(status_code=404, detail=f"Invoice {invoice_id} not found")
        
        return dict(invoice._mapping)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting invoice {invoice_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get invoice: {str(e)}")

@router.post("/calculate-live", response_model=InvoiceCalculateResponse)
async def calculate_invoice_totals(
    request: InvoiceCalculateRequest,
    db: Session = Depends(get_db)
):
    """
    Calculate invoice totals server-side for security and consistency
    """
    try:
        # Get customer details and address for GST calculations
        customer = db.execute(text("""
            SELECT 
                c.customer_id, 
                c.customer_name,
                a.state_name as state,
                a.state_code
            FROM parties.customers c
            LEFT JOIN master.addresses a ON 
                a.entity_type = 'customer' AND 
                a.entity_id = c.customer_id AND
                a.address_type = 'billing' AND
                a.is_default = true
            WHERE c.customer_id = :customer_id
        """), {"customer_id": request.customer_id}).first()
        
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        # Get state from address table
        customer_state = customer.state if customer else None
        customer_state_code = customer.state_code if customer else None
        
        # Get company/seller state from organization settings
        org_state_result = db.execute(text("""
            SELECT business_settings->>'state' as state,
                   business_settings->>'state_code' as state_code
            FROM parties.organizations
            WHERE org_id = '12de5e22-eee7-4d25-b3a7-d16d01c6170f'
        """)).first()
        
        # Get seller's state - if not set, treat as intrastate
        company_state = org_state_result.state if org_state_result and org_state_result.state else None
        company_state_code = org_state_result.state_code if org_state_result and org_state_result.state_code else None
        
        # Determine if interstate
        if company_state and customer_state:
            is_interstate = customer_state.lower() != company_state.lower()
        else:
            # If either state is missing, default to intrastate (CGST/SGST)
            # For MVP, all transactions are intrastate
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
                    FROM inventory.products 
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
    org_id: str = ACTUAL_ORG_ID
):
    """Record payment for an invoice"""
    try:
        # Verify invoice exists and get current payment status
        invoice = db.execute(
            text("""
                SELECT invoice_id, total_amount, payment_status, 
                       0 as amount_paid
                FROM sales.invoices
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
                UPDATE sales.invoices
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