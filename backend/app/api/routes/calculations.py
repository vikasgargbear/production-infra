"""
Unified calculation endpoints for all transaction types
Provides consistent calculation logic across invoices, challans, and sales orders
"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from decimal import Decimal
from uuid import UUID
import logging

from ..services.gst_service import GSTService, GSTType
from ..services.order_service import OrderService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["calculations"])


class CalculationItem(BaseModel):
    """Item for calculation"""
    product_id: int
    quantity: Decimal = Field(..., gt=0)
    unit_price: Decimal = Field(..., ge=0)
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    tax_percent: Decimal = Field(default=Decimal("12"), ge=0, le=100)
    

class CalculationRequest(BaseModel):
    """Request for calculation"""
    org_id: UUID
    customer_id: Optional[int] = None
    items: List[CalculationItem]
    customer_discount: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    delivery_charges: Decimal = Field(default=Decimal("0"), ge=0)
    other_charges: Decimal = Field(default=Decimal("0"))
    gst_type: Optional[str] = "CGST/SGST"  # CGST/SGST or IGST


class CalculationLineItem(BaseModel):
    """Calculated line item"""
    product_id: int
    quantity: Decimal
    unit_price: Decimal
    line_subtotal: Decimal
    discount_percent: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    tax_percent: Decimal
    tax_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    line_total: Decimal


class CalculationTotals(BaseModel):
    """Calculation totals"""
    gross_amount: Decimal
    total_discount: Decimal
    taxable_amount: Decimal
    total_tax: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    delivery_charges: Decimal
    other_charges: Decimal
    round_off: Decimal
    final_amount: Decimal


class CalculationResponse(BaseModel):
    """Calculation response"""
    success: bool
    line_items: List[CalculationLineItem]
    totals: CalculationTotals
    calculation_timestamp: str


@router.post("/sales-order", response_model=CalculationResponse)
async def calculate_sales_order(request: CalculationRequest):
    """
    Calculate sales order totals with GST
    Uses the same logic as OrderService.calculate_order_totals
    """
    try:
        # Convert request items to the format expected by OrderService
        order_items = []
        for item in request.items:
            order_items.append({
                'product_id': item.product_id,
                'quantity': float(item.quantity),
                'unit_price': float(item.unit_price),
                'discount_percent': float(item.discount_percent),
                'tax_percent': float(item.tax_percent)
            })
        
        # Use OrderService calculation logic (which is now corrected)
        from ...core.database import SessionLocal
        db = SessionLocal()
        try:
            totals = OrderService.calculate_order_totals(
                db=db,
                items=order_items,
                customer_discount=request.customer_discount,
                org_id=request.org_id
            )
        finally:
            db.close()
        
        # Calculate line items with detailed breakdown
        line_items = []
        for item in request.items:
            quantity = item.quantity
            unit_price = item.unit_price
            discount_percent = item.discount_percent
            tax_percent = item.tax_percent
            
            # Calculate amounts using same logic as backend
            line_subtotal = quantity * unit_price
            discount_amount = (line_subtotal * discount_percent) / 100
            taxable_amount = line_subtotal - discount_amount
            tax_amount = (taxable_amount * tax_percent) / 100
            
            # Split tax for CGST/SGST or use IGST
            if request.gst_type == "IGST":
                cgst_amount = Decimal("0")
                sgst_amount = Decimal("0")
                igst_amount = tax_amount
            else:
                cgst_amount = tax_amount / 2
                sgst_amount = tax_amount / 2
                igst_amount = Decimal("0")
            
            line_total = taxable_amount + tax_amount
            
            line_items.append(CalculationLineItem(
                product_id=item.product_id,
                quantity=quantity,
                unit_price=unit_price,
                line_subtotal=line_subtotal,
                discount_percent=discount_percent,
                discount_amount=discount_amount,
                taxable_amount=taxable_amount,
                tax_percent=tax_percent,
                tax_amount=tax_amount,
                cgst_amount=cgst_amount,
                sgst_amount=sgst_amount,
                igst_amount=igst_amount,
                line_total=line_total
            ))
        
        # Calculate final totals
        gross_amount = sum(item.line_subtotal for item in line_items)
        total_discount = sum(item.discount_amount for item in line_items)
        taxable_amount = gross_amount - total_discount
        total_tax = sum(item.tax_amount for item in line_items)
        
        # Split total tax for display
        if request.gst_type == "IGST":
            total_cgst = Decimal("0")
            total_sgst = Decimal("0")
            total_igst = total_tax
        else:
            total_cgst = total_tax / 2
            total_sgst = total_tax / 2
            total_igst = Decimal("0")
        
        # Add charges
        delivery_charges = request.delivery_charges
        other_charges = request.other_charges
        
        # Calculate final amount
        final_amount = taxable_amount + total_tax + delivery_charges + other_charges
        
        # Round off (optional)
        round_off = Decimal("0")  # Can be implemented later
        
        calculation_totals = CalculationTotals(
            gross_amount=gross_amount,
            total_discount=total_discount,
            taxable_amount=taxable_amount,
            total_tax=total_tax,
            cgst_amount=total_cgst,
            sgst_amount=total_sgst,
            igst_amount=total_igst,
            delivery_charges=delivery_charges,
            other_charges=other_charges,
            round_off=round_off,
            final_amount=final_amount
        )
        
        from datetime import datetime
        return CalculationResponse(
            success=True,
            line_items=line_items,
            totals=calculation_totals,
            calculation_timestamp=datetime.now().isoformat()
        )
        
    except Exception as e:
        logger.error(f"Calculation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Calculation failed: {str(e)}")


@router.post("/invoice", response_model=CalculationResponse)
async def calculate_invoice(request: CalculationRequest):
    """
    Calculate invoice totals with GST
    Uses GST service for comprehensive tax calculations
    """
    try:
        # Use GSTService for invoice calculations
        invoice_data = {
            "items": [
                {
                    "quantity": float(item.quantity),
                    "unit_price": float(item.unit_price),
                    "discount_percent": float(item.discount_percent),
                    "tax_percent": float(item.tax_percent)
                }
                for item in request.items
            ],
            "discount_amount": float(request.customer_discount),
            "other_charges": float(request.other_charges)
        }
        
        # Determine GST type (this would normally come from customer/org GSTIN comparison)
        gst_type = GSTType.CGST_SGST if request.gst_type != "IGST" else GSTType.IGST
        
        # Calculate using GST service
        result = GSTService.calculate_invoice_gst(
            invoice_data=invoice_data,
            seller_gstin="dummy_seller_gstin",  # Would come from org data
            buyer_gstin="dummy_buyer_gstin" if request.customer_id else None
        )
        
        # Convert to our response format
        line_items = []
        for i, item in enumerate(request.items):
            calc_item = result["items"][i]
            line_items.append(CalculationLineItem(
                product_id=item.product_id,
                quantity=calc_item["quantity"],
                unit_price=calc_item["unit_price"],
                line_subtotal=calc_item["base_amount"],
                discount_percent=calc_item["discount_percent"],
                discount_amount=calc_item["discount_amount"],
                taxable_amount=calc_item["taxable_amount"],
                tax_percent=calc_item["gst_rate"],
                tax_amount=calc_item["tax_amount"],
                cgst_amount=calc_item["cgst_amount"],
                sgst_amount=calc_item["sgst_amount"],
                igst_amount=calc_item["igst_amount"],
                line_total=calc_item["total_amount"]
            ))
        
        calculation_totals = CalculationTotals(
            gross_amount=result["subtotal"],
            total_discount=result["total_discount"],
            taxable_amount=result["total_taxable"],
            total_tax=result["total_tax"],
            cgst_amount=result["cgst_amount"],
            sgst_amount=result["sgst_amount"],
            igst_amount=result["igst_amount"],
            delivery_charges=request.delivery_charges,
            other_charges=result["other_charges"],
            round_off=Decimal("0"),
            final_amount=result["grand_total"]
        )
        
        from datetime import datetime
        return CalculationResponse(
            success=True,
            line_items=line_items,
            totals=calculation_totals,
            calculation_timestamp=datetime.now().isoformat()
        )
        
    except Exception as e:
        logger.error(f"Invoice calculation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Invoice calculation failed: {str(e)}")


@router.post("/challan", response_model=CalculationResponse) 
async def calculate_challan(request: CalculationRequest):
    """
    Calculate delivery challan totals
    Similar to sales order but may have different business rules
    """
    # For now, use the same logic as sales order
    return await calculate_sales_order(request)


@router.get("/health")
async def health_check():
    """Health check for calculation service"""
    return {"status": "healthy", "service": "calculations"}