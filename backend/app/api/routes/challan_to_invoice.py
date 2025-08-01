"""
Challan to Invoice Converter API
Enables creating invoices from delivered challans
"""
from typing import Optional, Dict, Any, List
from datetime import date, datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel, Field
import logging

from ...database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/challan-to-invoice", tags=["challan-to-invoice"])

# =============================================
# PYDANTIC MODELS
# =============================================

class ChallanToInvoiceRequest(BaseModel):
    challan_ids: List[int] = Field(..., description="List of challan IDs to convert")
    invoice_date: Optional[date] = Field(default=None, description="Invoice date (defaults to today)")
    payment_mode: Optional[str] = Field(default="credit", description="Payment mode")
    payment_amount: Optional[Decimal] = Field(default=0, ge=0)
    discount_amount: Optional[Decimal] = Field(default=0, ge=0)
    notes: Optional[str] = None

class ChallanToInvoiceResponse(BaseModel):
    invoice_id: int
    invoice_number: str
    order_ids: List[int]
    total_amount: Decimal
    message: str

# =============================================
# SERVICE CLASS
# =============================================

class ChallanToInvoiceService:
    def __init__(self, db: Session, org_id: str):
        self.db = db
        self.org_id = org_id
    
    def get_delivered_challans(self, challan_ids: List[int]) -> List[Dict[str, Any]]:
        """Get delivered challans with their details"""
        result = self.db.execute(
            text("""
                SELECT 
                    c.challan_id,
                    c.challan_number,
                    c.order_id,
                    c.customer_id,
                    c.status,
                    o.order_number,
                    o.customer_name,
                    o.customer_phone,
                    o.billing_address,
                    o.billing_gstin,
                    cust.gstin,
                    cust.state,
                    cust.state_code
                FROM challans c
                JOIN orders o ON c.order_id = o.order_id
                JOIN customers cust ON c.customer_id = cust.customer_id
                WHERE c.challan_id = ANY(:challan_ids)
                AND c.org_id = :org_id
                AND c.status = 'delivered'
            """),
            {
                "challan_ids": challan_ids,
                "org_id": self.org_id
            }
        )
        
        challans = [dict(row._mapping) for row in result]
        if not challans:
            raise HTTPException(
                status_code=404, 
                detail="No delivered challans found with the provided IDs"
            )
        
        # Verify all challans belong to same customer
        customer_ids = set(c['customer_id'] for c in challans)
        if len(customer_ids) > 1:
            raise HTTPException(
                status_code=400,
                detail="All challans must belong to the same customer"
            )
        
        return challans
    
    def get_challan_items(self, challan_ids: List[int]) -> List[Dict[str, Any]]:
        """Get items from delivered challans"""
        result = self.db.execute(
            text("""
                SELECT 
                    ci.challan_id,
                    ci.order_item_id,
                    ci.product_id,
                    ci.product_name,
                    ci.batch_id,
                    ci.batch_number,
                    ci.dispatched_quantity as quantity,
                    ci.unit_price,
                    p.hsn_code,
                    p.gst_percent,
                    p.mrp,
                    oi.discount_percent,
                    oi.discount_amount
                FROM challan_items ci
                JOIN products p ON ci.product_id = p.product_id
                LEFT JOIN order_items oi ON ci.order_item_id = oi.order_item_id
                WHERE ci.challan_id = ANY(:challan_ids)
            """),
            {"challan_ids": challan_ids}
        )
        
        return [dict(row._mapping) for row in result]
    
    def _generate_invoice_number(self) -> str:
        """Generate unique invoice number"""
        today = datetime.now()
        date_part = today.strftime("%Y%m%d")
        
        result = self.db.execute(
            text("""
                SELECT COUNT(*) + 1 as next_seq
                FROM invoices
                WHERE org_id = :org_id
                AND invoice_number LIKE :pattern
            """),
            {
                "org_id": self.org_id,
                "pattern": f"INV{date_part}%"
            }
        )
        next_seq = result.scalar() or 1
        
        return f"INV{date_part}{next_seq:04d}"
    
    def create_invoice_from_challans(self, request: ChallanToInvoiceRequest) -> ChallanToInvoiceResponse:
        """Create invoice from delivered challans"""
        try:
            # Get challan details
            challans = self.get_delivered_challans(request.challan_ids)
            challan_items = self.get_challan_items(request.challan_ids)
            
            if not challan_items:
                raise HTTPException(status_code=400, detail="No items found in the selected challans")
            
            # Use first challan for customer details
            first_challan = challans[0]
            customer_id = first_challan['customer_id']
            customer_state = first_challan['state']
            
            # Get organization state for GST calculation
            org_result = self.db.execute(
                text("""
                    SELECT business_settings->>'state' as state
                    FROM organizations
                    WHERE org_id = :org_id
                """),
                {"org_id": self.org_id}
            )
            org_state = org_result.scalar()
            
            # Calculate totals
            subtotal = Decimal('0')
            total_tax = Decimal('0')
            cgst_total = Decimal('0')
            sgst_total = Decimal('0')
            igst_total = Decimal('0')
            
            is_interstate = org_state != customer_state if org_state and customer_state else False
            
            # Calculate item-wise totals
            invoice_items_data = []
            for item in challan_items:
                quantity = item['quantity']
                unit_price = Decimal(str(item['unit_price']))
                discount_percent = Decimal(str(item.get('discount_percent', 0)))
                gst_percent = Decimal(str(item.get('gst_percent', 0)))
                
                # Calculate amounts
                line_total = quantity * unit_price
                discount_amount = line_total * discount_percent / 100
                taxable_amount = line_total - discount_amount
                
                # Calculate GST
                if is_interstate:
                    igst_amount = taxable_amount * gst_percent / 100
                    cgst_amount = sgst_amount = Decimal('0')
                else:
                    cgst_amount = sgst_amount = taxable_amount * gst_percent / 200
                    igst_amount = Decimal('0')
                
                total_amount = taxable_amount + cgst_amount + sgst_amount + igst_amount
                
                subtotal += line_total
                cgst_total += cgst_amount
                sgst_total += sgst_amount
                igst_total += igst_amount
                total_tax += (cgst_amount + sgst_amount + igst_amount)
                
                invoice_items_data.append({
                    'product_id': item['product_id'],
                    'product_name': item['product_name'],
                    'hsn_code': item.get('hsn_code'),
                    'batch_id': item.get('batch_id'),
                    'batch_number': item.get('batch_number'),
                    'quantity': quantity,
                    'unit_price': unit_price,
                    'mrp': item.get('mrp'),
                    'discount_percent': discount_percent,
                    'discount_amount': discount_amount,
                    'gst_percent': gst_percent,
                    'cgst_amount': cgst_amount,
                    'sgst_amount': sgst_amount,
                    'igst_amount': igst_amount,
                    'taxable_amount': taxable_amount,
                    'total_amount': total_amount
                })
            
            # Apply invoice-level discount
            taxable_amount = subtotal - request.discount_amount
            final_amount = taxable_amount + total_tax
            
            # Generate invoice number
            invoice_number = self._generate_invoice_number()
            
            # Create invoice
            invoice_result = self.db.execute(
                text("""
                    INSERT INTO invoices (
                        org_id, invoice_number, invoice_date, 
                        customer_id, customer_name, customer_gstin,
                        billing_address, billing_name, billing_city,
                        billing_state, billing_pincode,
                        subtotal_amount, discount_amount, taxable_amount,
                        cgst_amount, sgst_amount, igst_amount,
                        total_tax_amount, total_amount,
                        payment_status, invoice_status,
                        gst_type, place_of_supply, notes,
                        order_id
                    ) VALUES (
                        :org_id, :invoice_number, :invoice_date,
                        :customer_id, :customer_name, :customer_gstin,
                        :billing_address, :billing_name, :billing_city,
                        :billing_state, :billing_pincode,
                        :subtotal_amount, :discount_amount, :taxable_amount,
                        :cgst_amount, :sgst_amount, :igst_amount,
                        :total_tax_amount, :total_amount,
                        :payment_status, :invoice_status,
                        :gst_type, :place_of_supply, :notes,
                        :order_id
                    )
                    RETURNING invoice_id
                """),
                {
                    "org_id": self.org_id,
                    "invoice_number": invoice_number,
                    "invoice_date": request.invoice_date or date.today(),
                    "customer_id": customer_id,
                    "customer_name": first_challan['customer_name'],
                    "customer_gstin": first_challan.get('gstin'),
                    "billing_address": first_challan.get('billing_address', ''),
                    "billing_name": first_challan['customer_name'],
                    "billing_city": '',  # Would need to parse from address
                    "billing_state": customer_state or '',
                    "billing_pincode": '',  # Would need to parse from address
                    "subtotal_amount": subtotal,
                    "discount_amount": request.discount_amount,
                    "taxable_amount": taxable_amount,
                    "cgst_amount": cgst_total,
                    "sgst_amount": sgst_total,
                    "igst_amount": igst_total,
                    "total_tax_amount": total_tax,
                    "total_amount": final_amount,
                    "payment_status": "paid" if request.payment_amount >= final_amount else "unpaid",
                    "invoice_status": "generated",
                    "gst_type": "igst" if is_interstate else "cgst_sgst",
                    "place_of_supply": first_challan.get('state_code', '09'),
                    "notes": request.notes,
                    "order_id": first_challan['order_id']  # Link to first order
                }
            )
            invoice_id = invoice_result.scalar()
            
            # Create invoice items
            for item_data in invoice_items_data:
                self.db.execute(
                    text("""
                        INSERT INTO invoice_items (
                            invoice_id, product_id, product_name,
                            hsn_code, batch_id, batch_number,
                            quantity, unit_price, mrp,
                            discount_percent, discount_amount,
                            gst_percent, cgst_amount, sgst_amount,
                            igst_amount, taxable_amount, total_amount
                        ) VALUES (
                            :invoice_id, :product_id, :product_name,
                            :hsn_code, :batch_id, :batch_number,
                            :quantity, :unit_price, :mrp,
                            :discount_percent, :discount_amount,
                            :gst_percent, :cgst_amount, :sgst_amount,
                            :igst_amount, :taxable_amount, :total_amount
                        )
                    """),
                    {"invoice_id": invoice_id, **item_data}
                )
            
            # Process payment if provided
            if request.payment_amount > 0:
                self.db.execute(
                    text("""
                        INSERT INTO invoice_payments (
                            invoice_id, payment_date, amount,
                            payment_amount, payment_mode,
                            payment_reference, status
                        ) VALUES (
                            :invoice_id, :payment_date, :amount,
                            :payment_amount, :payment_mode,
                            :payment_reference, :status
                        )
                    """),
                    {
                        "invoice_id": invoice_id,
                        "payment_date": date.today(),
                        "amount": request.payment_amount,
                        "payment_amount": request.payment_amount,
                        "payment_mode": request.payment_mode,
                        "payment_reference": f"CHALLAN-{invoice_number}",
                        "status": "completed"
                    }
                )
                
                # Update invoice paid amount
                self.db.execute(
                    text("""
                        UPDATE invoices
                        SET paid_amount = :paid_amount,
                            payment_status = CASE 
                                WHEN :paid_amount >= total_amount THEN 'paid'
                                ELSE 'partial'
                            END
                        WHERE invoice_id = :invoice_id
                    """),
                    {
                        "invoice_id": invoice_id,
                        "paid_amount": request.payment_amount
                    }
                )
            
            # Update challans to mark them as invoiced
            self.db.execute(
                text("""
                    UPDATE challans
                    SET invoice_id = :invoice_id,
                        invoiced_at = :invoiced_at
                    WHERE challan_id = ANY(:challan_ids)
                """),
                {
                    "invoice_id": invoice_id,
                    "invoiced_at": datetime.now(),
                    "challan_ids": request.challan_ids
                }
            )
            
            self.db.commit()
            
            return ChallanToInvoiceResponse(
                invoice_id=invoice_id,
                invoice_number=invoice_number,
                order_ids=[c['order_id'] for c in challans],
                total_amount=final_amount,
                message=f"Invoice {invoice_number} created successfully from {len(challans)} challan(s)"
            )
            
        except HTTPException:
            self.db.rollback()
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error creating invoice from challans: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))

# =============================================
# API ENDPOINTS
# =============================================

@router.post("/", response_model=ChallanToInvoiceResponse)
async def create_invoice_from_challans(
    request: ChallanToInvoiceRequest,
    db: Session = Depends(get_db),
    org_id: str = "12de5e22-eee7-4d25-b3a7-d16d01c6170f"  # TODO: Get from session
):
    """Create invoice from one or more delivered challans"""
    service = ChallanToInvoiceService(db, org_id)
    return service.create_invoice_from_challans(request)

@router.get("/eligible-challans")
async def get_eligible_challans(
    customer_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    org_id: str = "12de5e22-eee7-4d25-b3a7-d16d01c6170f"
):
    """Get list of delivered challans that haven't been invoiced yet"""
    try:
        query = """
            SELECT 
                c.challan_id,
                c.challan_number,
                c.challan_date,
                c.order_id,
                c.customer_id,
                cust.customer_name,
                c.delivery_time,
                c.total_packages,
                o.order_number,
                o.total_amount,
                COUNT(ci.challan_item_id) as item_count
            FROM challans c
            JOIN customers cust ON c.customer_id = cust.customer_id
            JOIN orders o ON c.order_id = o.order_id
            LEFT JOIN challan_items ci ON c.challan_id = ci.challan_id
            WHERE c.org_id = :org_id
            AND c.status = 'delivered'
            AND c.invoice_id IS NULL
        """
        params = {"org_id": org_id}
        
        if customer_id:
            query += " AND c.customer_id = :customer_id"
            params["customer_id"] = customer_id
            
        if start_date:
            query += " AND c.challan_date >= :start_date"
            params["start_date"] = start_date
            
        if end_date:
            query += " AND c.challan_date <= :end_date"
            params["end_date"] = end_date
            
        query += """
            GROUP BY c.challan_id, c.challan_number, c.challan_date,
                     c.order_id, c.customer_id, cust.customer_name,
                     c.delivery_time, c.total_packages, o.order_number,
                     o.total_amount
            ORDER BY c.challan_date DESC, c.challan_id DESC
        """
        
        result = db.execute(text(query), params)
        challans = [dict(row._mapping) for row in result]
        
        return {
            "eligible_challans": challans,
            "total_count": len(challans)
        }
        
    except Exception as e:
        logger.error(f"Error fetching eligible challans: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/preview")
async def preview_invoice_from_challans(
    challan_ids: str,  # Comma-separated list
    db: Session = Depends(get_db),
    org_id: str = "12de5e22-eee7-4d25-b3a7-d16d01c6170f"
):
    """Preview invoice that would be created from selected challans"""
    try:
        # Parse challan IDs
        challan_id_list = [int(id.strip()) for id in challan_ids.split(',')]
        
        service = ChallanToInvoiceService(db, org_id)
        
        # Get challan details
        challans = service.get_delivered_challans(challan_id_list)
        items = service.get_challan_items(challan_id_list)
        
        # Calculate totals (similar to create method but without inserting)
        subtotal = sum(
            item['quantity'] * Decimal(str(item['unit_price']))
            for item in items
        )
        
        # Simple tax calculation for preview
        tax_rate = Decimal('18')  # Default GST
        tax_amount = subtotal * tax_rate / 100
        total_amount = subtotal + tax_amount
        
        return {
            "preview": {
                "challan_count": len(challans),
                "item_count": len(items),
                "customer_name": challans[0]['customer_name'] if challans else "",
                "subtotal": float(subtotal),
                "tax_amount": float(tax_amount),
                "total_amount": float(total_amount),
                "challan_numbers": [c['challan_number'] for c in challans],
                "order_numbers": list(set(c['order_number'] for c in challans))
            }
        }
        
    except Exception as e:
        logger.error(f"Error previewing invoice: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))