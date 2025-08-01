"""
Sales API Router
Handles direct sales/cash sales and invoice generation
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from datetime import datetime, date, timedelta
from decimal import Decimal
import uuid
from pydantic import BaseModel, Field

from ...database import get_db
from ...services.gst_service import GSTService, GSTType

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/sales", tags=["sales"])

# Pydantic models for request/response
class SaleItemCreate(BaseModel):
    """Sale item for direct invoice creation"""
    product_id: int
    product_name: str
    hsn_code: Optional[str] = None
    batch_id: Optional[int] = None
    batch_number: Optional[str] = None
    expiry_date: Optional[str] = None
    quantity: int = Field(..., gt=0)
    unit: str = "strip"
    unit_price: Decimal = Field(..., ge=0)  # This is what frontend is missing
    mrp: Decimal = Field(..., ge=0)
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    tax_percent: Decimal = Field(..., ge=0, le=28)  # This is what frontend is missing
    

class SaleCreate(BaseModel):
    """Create a direct sale/invoice"""
    sale_date: Optional[date] = None
    party_id: int
    party_name: str
    party_gst: Optional[str] = None
    party_address: Optional[str] = None
    party_phone: Optional[str] = None
    party_state_code: Optional[str] = None  # For parties without GSTIN
    payment_method: str = "cash"  # cash, credit, card, upi
    items: List[SaleItemCreate]
    discount_amount: Optional[Decimal] = Decimal("0")
    other_charges: Optional[Decimal] = Decimal("0")
    notes: Optional[str] = None
    seller_gstin: Optional[str] = None  # Organization GSTIN
    

class SaleResponse(BaseModel):
    """Sale response with all details"""
    sale_id: str
    invoice_number: str
    sale_date: date
    party_id: int
    party_name: str
    subtotal_amount: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    total_amount: Decimal
    gst_type: str
    payment_method: str
    sale_status: str
    created_at: datetime


@router.post("/", response_model=SaleResponse)
async def create_direct_sale(
    sale_data: SaleCreate,
    db: Session = Depends(get_db)
):
    """
    Create a direct sale/cash sale with invoice
    """
    try:
        # Generate invoice number
        invoice_number = f"INV-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        
        # Use provided date or current date
        sale_date = sale_data.sale_date or date.today()
        
        # Get seller GSTIN (from request or organization default)
        if not sale_data.seller_gstin:
            org = db.execute(
                text("SELECT gst_number FROM organizations WHERE org_id = :org_id"),
                {"org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f"}
            ).first()
            seller_gstin = org.gst_number if org else "27AABCU9603R1ZM"  # Default Maharashtra GSTIN
        else:
            seller_gstin = sale_data.seller_gstin
            
        # Determine GST type based on seller and buyer location
        gst_type = GSTService.determine_gst_type(
            seller_gstin=seller_gstin,
            buyer_gstin=sale_data.party_gst,
            buyer_state_code=sale_data.party_state_code  # For unregistered buyers
        )
        
        # Calculate invoice with proper GST
        invoice_calc = GSTService.calculate_invoice_gst(
            invoice_data={
                "items": [item.dict() for item in sale_data.items],
                "discount_amount": sale_data.discount_amount,
                "other_charges": sale_data.other_charges
            },
            seller_gstin=seller_gstin,
            buyer_gstin=sale_data.party_gst
        )
        
        # Extract calculated values
        subtotal = invoice_calc["subtotal"]
        total_discount = invoice_calc["total_discount"]
        total_cgst = invoice_calc["cgst_amount"]
        total_sgst = invoice_calc["sgst_amount"]
        total_igst = invoice_calc["igst_amount"]
        tax_amount = invoice_calc["total_tax"]
        final_total = invoice_calc["grand_total"]
        
        # Create invoice record using existing invoices table
        invoice_id = db.execute(
            text("""
                INSERT INTO invoices (
                    invoice_number, invoice_date, due_date,
                    order_id, customer_id, customer_name, customer_gstin,
                    billing_address, shipping_address,
                    subtotal_amount, discount_amount, taxable_amount,
                    cgst_amount, sgst_amount, igst_amount,
                    total_tax_amount, round_off_amount, total_amount,
                    payment_status, payment_method, notes,
                    gst_type, place_of_supply
                ) VALUES (
                    :invoice_number, :invoice_date, :due_date,
                    NULL, :customer_id, :customer_name, :customer_gstin,
                    :billing_address, :shipping_address,
                    :subtotal, :discount, :taxable,
                    :cgst, :sgst, :igst,
                    :tax_amount, :round_off, :total_amount,
                    :payment_status, :payment_method, :notes,
                    :gst_type, :place_of_supply
                )
                RETURNING invoice_id
            """),
            {
                "invoice_number": invoice_number,
                "invoice_date": sale_date,
                "due_date": sale_date + timedelta(days=30),  # 30 day payment terms
                "customer_id": sale_data.party_id,
                "customer_name": sale_data.party_name,
                "customer_gstin": sale_data.party_gst,
                "billing_address": sale_data.party_address,
                "shipping_address": sale_data.party_address,
                "subtotal": subtotal,
                "discount": total_discount,
                "taxable": subtotal - total_discount,
                "cgst": total_cgst,
                "sgst": total_sgst,
                "igst": total_igst,
                "tax_amount": tax_amount,
                "round_off": round(final_total) - final_total,
                "total_amount": final_total,
                "payment_status": "paid" if sale_data.payment_method == "cash" else "pending",
                "payment_method": sale_data.payment_method,
                "notes": sale_data.notes,
                "gst_type": gst_type.value,
                "place_of_supply": GSTService.get_state_name(GSTService.extract_state_code(sale_data.party_gst)) if sale_data.party_gst else None
            }
        ).scalar()
        
        # Create invoice items using calculated GST values
        for idx, (item, calc_item) in enumerate(zip(sale_data.items, invoice_calc["items"])):
            db.execute(
                text("""
                    INSERT INTO invoice_items (
                        invoice_id, product_id, product_name,
                        quantity, unit_price, 
                        discount_percent, discount_amount,
                        tax_percent, cgst_amount, sgst_amount, igst_amount,
                        line_total
                    ) VALUES (
                        :invoice_id, :product_id, :product_name,
                        :quantity, :unit_price,
                        :disc_percent, :disc_amount,
                        :tax_percent, :cgst_amt, :sgst_amt, :igst_amt,
                        :total
                    )
                """),
                {
                    "invoice_id": invoice_id,
                    "product_id": item.product_id,
                    "product_name": item.product_name,
                    "quantity": calc_item["quantity"],
                    "unit_price": calc_item["unit_price"],
                    "disc_percent": calc_item["discount_percent"],
                    "disc_amount": calc_item["discount_amount"],
                    "tax_percent": calc_item["gst_rate"],
                    "cgst_amt": calc_item["cgst_amount"],
                    "sgst_amt": calc_item["sgst_amount"],
                    "igst_amt": calc_item["igst_amount"],
                    "total": calc_item["total_amount"]
                }
            )
            
            # Update inventory
            if item.batch_id:
                db.execute(
                    text("""
                        UPDATE inventory 
                        SET current_stock = current_stock - :quantity
                        WHERE batch_id = :batch_id
                    """),
                    {"quantity": item.quantity, "batch_id": item.batch_id}
                )
            else:
                # Deduct from any available batch
                db.execute(
                    text("""
                        UPDATE inventory 
                        SET current_stock = current_stock - :quantity
                        WHERE product_id = :product_id 
                        AND current_stock >= :quantity
                        AND org_id = :org_id
                        ORDER BY expiry_date ASC
                        LIMIT 1
                    """),
                    {
                        "quantity": item.quantity,
                        "product_id": item.product_id,
                        "org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f"
                    }
                )
                
        # Create ledger entry if credit sale
        if sale_data.payment_method == "credit":
            db.execute(
                text("""
                    INSERT INTO party_ledger (
                        ledger_id, org_id, party_id, transaction_date,
                        transaction_type, reference_type, reference_id,
                        debit_amount, credit_amount, description
                    ) VALUES (
                        :ledger_id, :org_id, :party_id, :date,
                        'debit', 'invoice', :invoice_id,
                        :amount, 0, :description
                    )
                """),
                {
                    "ledger_id": str(uuid.uuid4()),
                    "org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f",
                    "party_id": sale_data.party_id,
                    "date": sale_date,
                    "invoice_id": str(invoice_id),
                    "amount": final_total,
                    "description": f"Sale Invoice - {invoice_number}"
                }
            )
            
        db.commit()
        
        return SaleResponse(
            sale_id=str(invoice_id),  # Using invoice_id as sale_id
            invoice_number=invoice_number,
            sale_date=sale_date,
            party_id=sale_data.party_id,
            party_name=sale_data.party_name,
            subtotal_amount=subtotal,
            discount_amount=total_discount,
            tax_amount=tax_amount,
            cgst_amount=total_cgst,
            sgst_amount=total_sgst,
            igst_amount=total_igst,
            total_amount=final_total,
            gst_type=gst_type.value,
            payment_method=sale_data.payment_method,
            sale_status="completed",
            created_at=datetime.now()
        )
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating sale: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/")
async def get_sales(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    party_id: Optional[int] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    payment_method: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get list of direct sales/invoices (without orders)
    """
    try:
        query = """
            SELECT i.invoice_id as sale_id, i.invoice_number, i.invoice_date as sale_date,
                   i.customer_id as party_id, i.customer_name as party_name, 
                   i.customer_gstin as party_gst, i.total_amount, i.payment_status,
                   i.payment_method, i.cgst_amount, i.sgst_amount, i.igst_amount,
                   i.gst_type, i.created_at
            FROM invoices i
            WHERE i.order_id IS NULL  -- Direct sales without orders
        """
        params = {
            "skip": skip,
            "limit": limit
        }
        
        if party_id:
            query += " AND i.customer_id = :party_id"
            params["party_id"] = party_id
            
        if from_date:
            query += " AND i.invoice_date >= :from_date"
            params["from_date"] = from_date
            
        if to_date:
            query += " AND i.invoice_date <= :to_date"
            params["to_date"] = to_date
            
        if payment_method:
            query += " AND i.payment_method = :payment_method"
            params["payment_method"] = payment_method
            
        query += " ORDER BY i.invoice_date DESC, i.created_at DESC LIMIT :limit OFFSET :skip"
        
        sales = db.execute(text(query), params).fetchall()
        
        # Get count
        count_query = query.replace("SELECT i.invoice_id as sale_id, i.invoice_number", "SELECT COUNT(*)")
        count_query = count_query.split("ORDER BY")[0]
        total = db.execute(text(count_query), params).scalar()
        
        return {
            "total": total,
            "sales": [dict(sale._mapping) for sale in sales]
        }
        
    except Exception as e:
        logger.error(f"Error fetching sales: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/outstanding")
async def get_outstanding_sales(
    customer_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Get outstanding sales/invoices for payments
    
    - Returns unpaid and partially paid invoices
    - Used by payment module to show outstanding amounts
    """
    try:
        query = """
            SELECT 
                i.invoice_id, 
                i.invoice_number,
                i.invoice_date,
                i.due_date,
                i.total_amount,
                COALESCE(i.paid_amount, 0) as paid_amount,
                (i.total_amount - COALESCE(i.paid_amount, 0)) as pending_amount,
                i.payment_status,
                c.customer_id,
                c.customer_name,
                CASE 
                    WHEN i.due_date < CURRENT_DATE THEN 
                        CURRENT_DATE - i.due_date 
                    ELSE 0 
                END as days_overdue
            FROM invoices i
            JOIN customers c ON i.customer_id = c.customer_id
            WHERE i.org_id = :org_id
                AND i.payment_status IN ('unpaid', 'partial')
        """
        
        params = {"org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f"}
        
        if customer_id:
            query += " AND c.customer_id = :customer_id"
            params["customer_id"] = customer_id
            
        query += " ORDER BY i.due_date, i.invoice_date"
        
        result = db.execute(text(query), params)
        invoices = [dict(row._mapping) for row in result]
        
        return {
            "invoices": invoices,
            "total_outstanding": sum(inv["pending_amount"] for inv in invoices),
            "count": len(invoices)
        }
        
    except Exception as e:
        logger.error(f"Error getting outstanding invoices: {str(e)}")
        # Return empty result instead of error to allow payment flow to continue
        return {
            "invoices": [],
            "total_outstanding": 0,
            "count": 0
        }


@router.get("/{sale_id}")
async def get_sale_detail(
    sale_id: str,
    db: Session = Depends(get_db)
):
    """
    Get detailed sale information including items
    """
    try:
        # Get invoice (treating invoice_id as sale_id for direct sales)
        sale = db.execute(
            text("""
                SELECT i.invoice_id as sale_id, i.invoice_number, i.invoice_date as sale_date,
                       i.customer_id as party_id, i.customer_name as party_name,
                       i.customer_gstin as party_gst, i.billing_address as party_address,
                       i.total_amount, i.subtotal_amount, i.discount_amount,
                       i.cgst_amount, i.sgst_amount, i.igst_amount,
                       i.gst_type, i.payment_method, i.payment_status as sale_status,
                       i.notes, i.created_at
                FROM invoices i
                WHERE i.invoice_id = :sale_id
            """),
            {"sale_id": sale_id}
        ).first()
        
        if not sale:
            raise HTTPException(status_code=404, detail="Sale not found")
            
        # Get items
        items = db.execute(
            text("""
                SELECT ii.*, p.product_name, p.hsn_code
                FROM invoice_items ii
                LEFT JOIN products p ON ii.product_id = p.product_id
                WHERE ii.invoice_id = :sale_id
            """),
            {"sale_id": sale_id}
        ).fetchall()
        
        result = dict(sale._mapping)
        result["items"] = [dict(item._mapping) for item in items]
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching sale detail: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calculate")
async def calculate_sale_totals(
    sale_data: SaleCreate,
    db: Session = Depends(get_db)
):
    """
    Calculate sale totals without creating the sale
    Used for preview and validation
    """
    try:
        # Get seller GSTIN
        if not sale_data.seller_gstin:
            org = db.execute(
                text("SELECT gst_number FROM organizations WHERE org_id = :org_id"),
                {"org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f"}
            ).first()
            seller_gstin = org.gst_number if org else "27AABCU9603R1ZM"
        else:
            seller_gstin = sale_data.seller_gstin
            
        # Determine GST type
        gst_type = GSTService.determine_gst_type(
            seller_gstin=seller_gstin,
            buyer_gstin=sale_data.party_gst,
            buyer_state_code=sale_data.party_state_code
        )
        
        # Calculate invoice with GST
        invoice_calc = GSTService.calculate_invoice_gst(
            invoice_data={
                "items": [item.dict() for item in sale_data.items],
                "discount_amount": sale_data.discount_amount,
                "other_charges": sale_data.other_charges
            },
            seller_gstin=seller_gstin,
            buyer_gstin=sale_data.party_gst
        )
        
        return {
            "subtotal": invoice_calc["subtotal"],
            "total_discount": invoice_calc["total_discount"],
            "taxable_amount": invoice_calc["subtotal"] - invoice_calc["total_discount"],
            "cgst_amount": invoice_calc["cgst_amount"],
            "sgst_amount": invoice_calc["sgst_amount"],
            "igst_amount": invoice_calc["igst_amount"],
            "total_tax": invoice_calc["total_tax"],
            "grand_total": invoice_calc["grand_total"],
            "gst_type": gst_type.value,
            "items": invoice_calc["items"]
        }
        
    except Exception as e:
        logger.error(f"Error calculating sale: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/invoice/{invoice_number}")
async def get_sale_by_invoice(
    invoice_number: str,
    db: Session = Depends(get_db)
):
    """
    Get sale by invoice number
    """
    try:
        sale = db.execute(
            text("""
                SELECT s.*, p.party_name, p.gst_number as party_gst
                FROM sales s
                LEFT JOIN parties p ON s.party_id = p.party_id
                WHERE s.invoice_number = :invoice_number
            """),
            {"invoice_number": invoice_number}
        ).first()
        
        if not sale:
            raise HTTPException(status_code=404, detail="Invoice not found")
            
        return dict(sale._mapping)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching invoice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{sale_id}/print")
async def get_sale_print_data(
    sale_id: str,
    db: Session = Depends(get_db)
):
    """
    Get sale data formatted for printing
    """
    try:
        # Get organization details
        org = db.execute(
            text("SELECT * FROM organizations WHERE org_id = :org_id"),
            {"org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f"}
        ).first()
        
        # Get sale with all details
        sale_data = await get_sale_detail(sale_id, db)
        
        # Format for printing
        print_data = {
            "organization": dict(org._mapping) if org else {
                "organization_name": "AASO Pharma",
                "address": "123 Business Park",
                "city": "Mumbai",
                "state": "Maharashtra",
                "pincode": "400001",
                "gst_number": "27AABCU9603R1ZM",
                "drug_license": "MH-123456",
                "phone": "9876543210",
                "email": "info@aasopharma.com"
            },
            "invoice": sale_data,
            "print_date": datetime.now().isoformat()
        }
        
        return print_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting print data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


