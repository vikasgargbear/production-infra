"""
Enterprise Calculation API
Single source of truth for ALL business calculations
Replaces all frontend calculation logic with secure backend calculations
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from typing import List, Dict, Any, Tuple
from decimal import Decimal
import logging
import time

from ...core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from ...core.auth.org_context import get_org_context, OrgContext
from ...core.security.permissions import PermissionChecker
from ..services.compliance.gst_service import GSTService, calculate_gst_breakdown
from ...core.utils.constants import ProductDefaults

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/calculations", tags=["Enterprise Calculations"])


# ========================================
# SHARED HELPER FUNCTIONS (DRY)
# ========================================

def calculate_line_item(
    quantity: float,
    unit_price: float,
    discount_percent: float,
    gst_percent: float,
    gst_type: str = "CGST/SGST"
) -> Dict[str, float]:
    """
    Single source of truth for line-item calculations.
    Uses GSTService internally for consistency.
    
    Args:
        quantity: billable quantity (base_quantity for invoices)
        unit_price: price per unit
        discount_percent: line-level discount %
        gst_percent: GST rate (e.g., 5, 12, 18, 28)
        gst_type: "CGST/SGST" for intra-state, "IGST" for inter-state
    
    Returns:
        Dict with subtotal, discount, taxable, cgst, sgst, igst, tax, line_total
    """
    subtotal = quantity * unit_price
    discount_amount = (subtotal * discount_percent) / 100
    taxable_amount = subtotal - discount_amount
    
    # Use GSTService for GST breakdown (ensures consistency)
    gst_components = GSTService.calculate_gst_components(
        Decimal(str(taxable_amount)),
        Decimal(str(gst_percent)),
        gst_type
    )
    
    line_total = taxable_amount + float(gst_components["total_tax_amount"])
    
    return {
        "subtotal": round(subtotal, 2),
        "discount_amount": round(discount_amount, 2),
        "taxable_amount": round(taxable_amount, 2),
        "cgst_amount": float(gst_components["cgst_amount"]),
        "sgst_amount": float(gst_components["sgst_amount"]),
        "igst_amount": float(gst_components["igst_amount"]),
        "total_tax": float(gst_components["total_tax_amount"]),
        "line_total": round(line_total, 2)
    }


def finalize_totals(
    totals: Dict[str, float],
    freight: float = 0,
    insurance: float = 0,
    other_charges: float = 0,
    discount: float = 0,
    auto_round_off: bool = True,  # NEW: From settings
    round_off_limit: float = 0.50  # NEW: Max round off amount
) -> Dict[str, float]:
    """
    Single source of truth for final amount calculations.
    
    Args:
        totals: Dict with taxable_amount, total_tax accumulated
        freight, insurance, other_charges: additional charges
        discount: invoice-level discount
        auto_round_off: Whether to apply rounding (from settings)
        round_off_limit: Maximum round off amount (from settings)
    
    Returns:
        Updated totals with net_amount, round_off, final_amount
    """
    pre_total = (
        totals["taxable_amount"] + 
        totals["total_tax"] + 
        freight + insurance + other_charges - discount
    )
    
    totals["freight_charges"] = freight
    totals["insurance_charges"] = insurance
    totals["other_charges"] = other_charges
    totals["invoice_discount"] = discount
    totals["net_amount"] = round(pre_total, 2)
    
    # SETTINGS-BASED ROUND OFF
    if auto_round_off:
        calculated_round_off = round(pre_total) - pre_total
        # Apply limit - don't round off more than allowed
        if abs(calculated_round_off) <= round_off_limit:
            totals["round_off"] = round(calculated_round_off, 2)
            totals["final_amount"] = round(pre_total)
        else:
            # Round off exceeds limit - don't round
            totals["round_off"] = 0
            totals["final_amount"] = round(pre_total, 2)
    else:
        # No rounding
        totals["round_off"] = 0
        totals["final_amount"] = round(pre_total, 2)
    
    # Round all accumulator fields
    for key in ["gross_amount", "total_discount", "taxable_amount", 
                "cgst_amount", "sgst_amount", "igst_amount", "total_tax"]:
        if key in totals:
            totals[key] = round(totals[key], 2)
    
    return totals
# ========================================
# PURCHASE CALCULATIONS
# ========================================

@router.post("/purchase")
@with_tenant_context
async def calculate_purchase_totals(
    purchase_data: Dict[str, Any],
    _: dict = Depends(PermissionChecker("purchase", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Enterprise purchase calculation endpoint
    Handles purchase orders, GRN, and purchase invoices
    """
    try:
        items = purchase_data.get("items", [])
        gst_type = purchase_data.get("gst_type", "CGST/SGST")
        freight_charges = float(purchase_data.get("freight_charges", 0))
        insurance_charges = float(purchase_data.get("insurance_charges", 0))
        other_charges = float(purchase_data.get("other_charges", 0))
        invoice_discount = float(purchase_data.get("discount_amount", 0))
        
        line_items = []
        purchase_totals = {
            "gross_amount": 0,
            "total_discount": 0,
            "taxable_amount": 0,
            "cgst_amount": 0,
            "sgst_amount": 0,
            "igst_amount": 0,
            "total_tax": 0,
            "freight_charges": freight_charges,
            "insurance_charges": insurance_charges,
            "other_charges": other_charges,
            "invoice_discount": invoice_discount,
            "net_amount": 0,
            "round_off": 0,
            "final_amount": 0
        }
        
        # Process each line item
        for idx, item in enumerate(items):
            quantity = float(item.get("quantity", 0))
            purchase_price = float(item.get("purchase_price", 0))
            discount_percent = float(item.get("discount_percent", 0))
            gst_percent = float(item.get("gst_percent", ProductDefaults.DEFAULT_GST_PERCENT))
            
            # Line calculations
            subtotal = quantity * purchase_price
            discount_amount = (subtotal * discount_percent) / 100
            taxable_amount = subtotal - discount_amount
            
            # Use GSTService for consistent GST breakdown
            gst = calculate_gst_breakdown(taxable_amount, gst_percent, gst_type)
            line_total = taxable_amount + gst["total_tax"]
            
            line_item = {
                "line_number": idx + 1,
                "product_id": item.get("product_id"),
                "quantity": quantity,
                "purchase_price": purchase_price,
                "subtotal": round(subtotal, 2),
                "discount_percent": discount_percent,
                "discount_amount": round(discount_amount, 2),
                "taxable_amount": round(taxable_amount, 2),
                "gst_percent": gst_percent,
                "cgst_amount": gst["cgst_amount"],
                "sgst_amount": gst["sgst_amount"],
                "igst_amount": gst["igst_amount"],
                "total_tax": gst["total_tax"],
                "line_total": round(line_total, 2)
            }
            
            line_items.append(line_item)
            
            # Accumulate totals
            purchase_totals["gross_amount"] += subtotal
            purchase_totals["total_discount"] += discount_amount
            purchase_totals["taxable_amount"] += taxable_amount
            purchase_totals["cgst_amount"] += gst["cgst_amount"]
            purchase_totals["sgst_amount"] += gst["sgst_amount"]
            purchase_totals["igst_amount"] += gst["igst_amount"]
            purchase_totals["total_tax"] += gst["total_tax"]
        
        # Final calculations
        pre_total = (purchase_totals["taxable_amount"] + purchase_totals["total_tax"] + 
                    freight_charges + insurance_charges + other_charges - invoice_discount)
        purchase_totals["net_amount"] = pre_total
        purchase_totals["round_off"] = round(pre_total) - pre_total
        purchase_totals["final_amount"] = round(pre_total)
        
        # Round all totals
        for key in purchase_totals:
            if key != "final_amount":
                purchase_totals[key] = round(purchase_totals[key], 2)
        
        return {
            "success": True,
            "line_items": line_items,
            "totals": purchase_totals,
            "calculation_timestamp": int(time.time() * 1000),
            "gst_type": gst_type
        }
        
    except Exception as e:
        logger.error(f"Purchase calculation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Purchase calculation failed: {str(e)}")

# ========================================
# SALES ORDER CALCULATIONS  
# ========================================

@router.post("/sales-order")
@with_tenant_context
async def calculate_sales_order_totals(
    order_data: Dict[str, Any],
    _: dict = Depends(PermissionChecker("sales", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Enterprise sales order calculation endpoint
    """
    try:
        items = order_data.get("items", [])
        gst_type = order_data.get("gst_type", "CGST/SGST")
        delivery_charges = float(order_data.get("delivery_charges", 0))
        order_discount = float(order_data.get("discount_amount", 0))
        
        line_items = []
        order_totals = {
            "gross_amount": 0,
            "total_discount": 0,
            "taxable_amount": 0,
            "cgst_amount": 0,
            "sgst_amount": 0,
            "igst_amount": 0,
            "total_tax": 0,
            "delivery_charges": delivery_charges,
            "order_discount": order_discount,
            "net_amount": 0,
            "round_off": 0,
            "final_amount": 0
        }
        
        # Process each line item  
        for idx, item in enumerate(items):
            quantity = float(item.get("quantity", 0))
            unit_price = float(item.get("unit_price", 0))
            discount_percent = float(item.get("discount_percent", 0))
            gst_percent = float(item.get("gst_percent", ProductDefaults.DEFAULT_GST_PERCENT))
            
            # Line calculations
            subtotal = quantity * unit_price
            discount_amount = (subtotal * discount_percent) / 100
            taxable_amount = subtotal - discount_amount
            
            # Use GSTService for consistent GST breakdown
            gst = calculate_gst_breakdown(taxable_amount, gst_percent, gst_type)
            line_total = taxable_amount + gst["total_tax"]
            
            line_item = {
                "line_number": idx + 1,
                "product_id": item.get("product_id"),
                "quantity": quantity,
                "unit_price": unit_price,
                "subtotal": round(subtotal, 2),
                "discount_percent": discount_percent,
                "discount_amount": round(discount_amount, 2),
                "taxable_amount": round(taxable_amount, 2),
                "gst_percent": gst_percent,
                "cgst_amount": gst["cgst_amount"],
                "sgst_amount": gst["sgst_amount"],
                "igst_amount": gst["igst_amount"],
                "total_tax": gst["total_tax"],
                "line_total": round(line_total, 2)
            }
            
            line_items.append(line_item)
            
            # Accumulate totals
            order_totals["gross_amount"] += subtotal
            order_totals["total_discount"] += discount_amount
            order_totals["taxable_amount"] += taxable_amount
            order_totals["cgst_amount"] += gst["cgst_amount"]
            order_totals["sgst_amount"] += gst["sgst_amount"]
            order_totals["igst_amount"] += gst["igst_amount"]
            order_totals["total_tax"] += gst["total_tax"]
        
        # Final calculations
        pre_total = order_totals["taxable_amount"] + order_totals["total_tax"] + delivery_charges - order_discount
        order_totals["net_amount"] = pre_total
        order_totals["round_off"] = round(pre_total) - pre_total
        order_totals["final_amount"] = round(pre_total)
        
        # Round all totals
        for key in order_totals:
            if key != "final_amount":
                order_totals[key] = round(order_totals[key], 2)
        
        return {
            "success": True,
            "line_items": line_items,
            "totals": order_totals,
            "calculation_timestamp": int(time.time() * 1000),
            "gst_type": gst_type
        }
        
    except Exception as e:
        logger.error(f"Sales order calculation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Sales order calculation failed: {str(e)}")

# ========================================
# RETURN CALCULATIONS
# ========================================

@router.post("/sales-return")
@with_tenant_context
async def calculate_sales_return_totals(
    return_data: Dict[str, Any],
    _: dict = Depends(PermissionChecker("sales", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Enterprise sales return calculation endpoint
    """
    try:
        items = return_data.get("items", [])
        gst_type = return_data.get("gst_type", "CGST/SGST")
        adjustment_amount = float(return_data.get("adjustment_amount", 0))
        
        line_items = []
        return_totals = {
            "gross_amount": 0,
            "total_discount": 0,
            "taxable_amount": 0,
            "cgst_amount": 0,
            "sgst_amount": 0,
            "igst_amount": 0,
            "total_tax": 0,
            "adjustment_amount": adjustment_amount,
            "net_amount": 0,
            "round_off": 0,
            "final_amount": 0
        }
        
        # Process each line item
        for idx, item in enumerate(items):
            return_quantity = float(item.get("return_quantity", 0))
            unit_price = float(item.get("unit_price", 0))
            discount_percent = float(item.get("discount_percent", 0))
            gst_percent = float(item.get("gst_percent", ProductDefaults.DEFAULT_GST_PERCENT))
            
            # Line calculations
            subtotal = return_quantity * unit_price
            discount_amount = (subtotal * discount_percent) / 100
            taxable_amount = subtotal - discount_amount
            
            # Use GSTService for consistent GST breakdown
            gst = calculate_gst_breakdown(taxable_amount, gst_percent, gst_type)
            line_total = taxable_amount + gst["total_tax"]
            
            line_item = {
                "line_number": idx + 1,
                "product_id": item.get("product_id"),
                "return_quantity": return_quantity,
                "unit_price": unit_price,
                "subtotal": round(subtotal, 2),
                "discount_percent": discount_percent,
                "discount_amount": round(discount_amount, 2),
                "taxable_amount": round(taxable_amount, 2),
                "gst_percent": gst_percent,
                "cgst_amount": gst["cgst_amount"],
                "sgst_amount": gst["sgst_amount"],
                "igst_amount": gst["igst_amount"],
                "total_tax": gst["total_tax"],
                "line_total": round(line_total, 2)
            }
            
            line_items.append(line_item)
            
            # Accumulate totals
            return_totals["gross_amount"] += subtotal
            return_totals["total_discount"] += discount_amount
            return_totals["taxable_amount"] += taxable_amount
            return_totals["cgst_amount"] += gst["cgst_amount"]
            return_totals["sgst_amount"] += gst["sgst_amount"]
            return_totals["igst_amount"] += gst["igst_amount"]
            return_totals["total_tax"] += gst["total_tax"]
        
        # Final calculations
        pre_total = return_totals["taxable_amount"] + return_totals["total_tax"] - adjustment_amount
        return_totals["net_amount"] = pre_total
        return_totals["round_off"] = round(pre_total) - pre_total
        return_totals["final_amount"] = round(pre_total)
        
        # Round all totals
        for key in return_totals:
            if key != "final_amount":
                return_totals[key] = round(return_totals[key], 2)
        
        return {
            "success": True,
            "line_items": line_items,
            "totals": return_totals,
            "calculation_timestamp": int(time.time() * 1000),
            "gst_type": gst_type
        }
        
    except Exception as e:
        logger.error(f"Sales return calculation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Sales return calculation failed: {str(e)}")

# ========================================
# PURCHASE RETURN CALCULATIONS
# ========================================

@router.post("/purchase-return")
@with_tenant_context
async def calculate_purchase_return_totals(
    return_data: Dict[str, Any],
    _: dict = Depends(PermissionChecker("purchase", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Enterprise purchase return calculation endpoint
    """
    try:
        items = return_data.get("items", [])
        gst_type = return_data.get("gst_type", "CGST/SGST")
        adjustment_amount = float(return_data.get("adjustment_amount", 0))
        
        line_items = []
        return_totals = {
            "gross_amount": 0,
            "total_discount": 0,
            "taxable_amount": 0,
            "cgst_amount": 0,
            "sgst_amount": 0,
            "igst_amount": 0,
            "total_tax": 0,
            "adjustment_amount": adjustment_amount,
            "net_amount": 0,
            "round_off": 0,
            "final_amount": 0
        }
        
        # Process each line item
        for idx, item in enumerate(items):
            return_quantity = float(item.get("return_quantity", 0))
            purchase_price = float(item.get("purchase_price", 0))
            discount_percent = float(item.get("discount_percent", 0))
            gst_percent = float(item.get("gst_percent", ProductDefaults.DEFAULT_GST_PERCENT))
            
            # Line calculations
            subtotal = return_quantity * purchase_price
            discount_amount = (subtotal * discount_percent) / 100
            taxable_amount = subtotal - discount_amount
            
            # Use GSTService for consistent GST breakdown
            gst = calculate_gst_breakdown(taxable_amount, gst_percent, gst_type)
            line_total = taxable_amount + gst["total_tax"]
            
            line_item = {
                "line_number": idx + 1,
                "product_id": item.get("product_id"),
                "return_quantity": return_quantity,
                "purchase_price": purchase_price,
                "subtotal": round(subtotal, 2),
                "discount_percent": discount_percent,
                "discount_amount": round(discount_amount, 2),
                "taxable_amount": round(taxable_amount, 2),
                "gst_percent": gst_percent,
                "cgst_amount": gst["cgst_amount"],
                "sgst_amount": gst["sgst_amount"],
                "igst_amount": gst["igst_amount"],
                "total_tax": gst["total_tax"],
                "line_total": round(line_total, 2)
            }
            
            line_items.append(line_item)
            
            # Accumulate totals
            return_totals["gross_amount"] += subtotal
            return_totals["total_discount"] += discount_amount
            return_totals["taxable_amount"] += taxable_amount
            return_totals["cgst_amount"] += gst["cgst_amount"]
            return_totals["sgst_amount"] += gst["sgst_amount"]
            return_totals["igst_amount"] += gst["igst_amount"]
            return_totals["total_tax"] += gst["total_tax"]
        
        # Final calculations
        pre_total = return_totals["taxable_amount"] + return_totals["total_tax"] - adjustment_amount
        return_totals["net_amount"] = pre_total
        return_totals["round_off"] = round(pre_total) - pre_total
        return_totals["final_amount"] = round(pre_total)
        
        # Round all totals
        for key in return_totals:
            if key != "final_amount":
                return_totals[key] = round(return_totals[key], 2)
        
        return {
            "success": True,
            "line_items": line_items,
            "totals": return_totals,
            "calculation_timestamp": int(time.time() * 1000),
            "gst_type": gst_type
        }
        
    except Exception as e:
        logger.error(f"Purchase return calculation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Purchase return calculation failed: {str(e)}")

# ========================================
# CHALLAN CALCULATIONS (Simplified - No Tax)
# ========================================

@router.post("/challan")
@with_tenant_context
async def calculate_challan_totals(
    challan_data: Dict[str, Any],
    _: dict = Depends(PermissionChecker("inventory", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Enterprise challan calculation endpoint
    Challans typically don't have tax calculations, just quantity and value totals
    """
    try:
        items = challan_data.get("items", [])
        freight_charges = float(challan_data.get("freight_charges", 0))
        
        line_items = []
        challan_totals = {
            "total_quantity": 0,
            "total_value": 0,
            "freight_charges": freight_charges,
            "final_amount": 0
        }
        
        # Process each line item
        for idx, item in enumerate(items):
            quantity = float(item.get("quantity", 0))
            unit_price = float(item.get("unit_price", 0))
            line_value = quantity * unit_price
            
            line_item = {
                "line_number": idx + 1,
                "product_id": item.get("product_id"),
                "quantity": quantity,
                "unit_price": unit_price,
                "line_value": round(line_value, 2)
            }
            
            line_items.append(line_item)
            
            # Accumulate totals
            challan_totals["total_quantity"] += quantity
            challan_totals["total_value"] += line_value
        
        # Final calculations
        challan_totals["final_amount"] = challan_totals["total_value"] + freight_charges
        
        # Round totals
        challan_totals["total_value"] = round(challan_totals["total_value"], 2)
        challan_totals["final_amount"] = round(challan_totals["final_amount"], 2)
        
        return {
            "success": True,
            "line_items": line_items,
            "totals": challan_totals,
            "calculation_timestamp": int(time.time() * 1000)
        }
        
    except Exception as e:
        logger.error(f"Challan calculation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Challan calculation failed: {str(e)}")

# ========================================
# INVOICE CALCULATIONS (Consolidated from invoice_calculation.py)
# ========================================

@router.post("/invoice")
@with_tenant_context
async def calculate_invoice_totals(
    invoice_data: Dict[str, Any],
    _: dict = Depends(PermissionChecker("sales", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Enterprise invoice calculation endpoint
    Single source of truth - frontend never calculates
    
    Handles:
    - base_quantity (what customer pays for)
    - free_quantity (bonus items, not billed)
    - GST breakdown (CGST/SGST or IGST)
    """
    try:
        items = invoice_data.get("items", [])
        gst_type = invoice_data.get("gst_type", "CGST/SGST")
        freight_charges = float(invoice_data.get("freight_charges", 0))
        insurance_charges = float(invoice_data.get("insurance_charges", 0))
        other_charges = float(invoice_data.get("other_charges", 0))
        invoice_discount = float(invoice_data.get("discount_amount", 0))
        
        line_items = []
        invoice_totals = {
            "gross_amount": 0,
            "total_discount": 0,
            "taxable_amount": 0,
            "cgst_amount": 0,
            "sgst_amount": 0,
            "igst_amount": 0,
            "total_tax": 0,
            "freight_charges": freight_charges,
            "insurance_charges": insurance_charges,
            "other_charges": other_charges,
            "invoice_discount": invoice_discount,
            "net_amount": 0,
            "round_off": 0,
            "final_amount": 0
        }
        
        # Process each line item
        for idx, item in enumerate(items):
            # CRITICAL: base_quantity is what customer PAYS for
            # free_quantity is ADDITIONAL items that don't affect price
            base_quantity = float(item.get("base_quantity", item.get("quantity", 0)))
            free_quantity = float(item.get("free_quantity", 0))
            total_quantity = base_quantity + free_quantity  # Total delivered
            
            unit_price = float(item.get("unit_price", 0))
            discount_percent = float(item.get("discount_percent", 0))
            gst_percent = float(item.get("gst_percent", ProductDefaults.DEFAULT_GST_PERCENT))
            
            # Line calculations - use base_quantity (what customer pays for)
            subtotal = base_quantity * unit_price
            discount_amount = (subtotal * discount_percent) / 100
            taxable_amount = subtotal - discount_amount
            
            # Use GSTService for consistent GST breakdown
            gst = calculate_gst_breakdown(taxable_amount, gst_percent, gst_type)
            line_total = taxable_amount + gst["total_tax"]
            
            line_item = {
                "line_number": idx + 1,
                "product_id": item.get("product_id"),
                "base_quantity": base_quantity,
                "free_quantity": free_quantity,
                "total_quantity": total_quantity,
                "unit_price": unit_price,
                "subtotal": round(subtotal, 2),
                "discount_percent": discount_percent,
                "discount_amount": round(discount_amount, 2),
                "taxable_amount": round(taxable_amount, 2),
                "gst_percent": gst_percent,
                "cgst_amount": gst["cgst_amount"],
                "sgst_amount": gst["sgst_amount"],
                "igst_amount": gst["igst_amount"],
                "total_tax": gst["total_tax"],
                "line_total": round(line_total, 2)
            }
            
            line_items.append(line_item)
            
            # Accumulate totals
            invoice_totals["gross_amount"] += subtotal
            invoice_totals["total_discount"] += discount_amount
            invoice_totals["taxable_amount"] += taxable_amount
            invoice_totals["cgst_amount"] += gst["cgst_amount"]
            invoice_totals["sgst_amount"] += gst["sgst_amount"]
            invoice_totals["igst_amount"] += gst["igst_amount"]
            invoice_totals["total_tax"] += gst["total_tax"]
        
        # Final calculations
        pre_total = (invoice_totals["taxable_amount"] + invoice_totals["total_tax"] + 
                    freight_charges + insurance_charges + other_charges - invoice_discount)
        invoice_totals["net_amount"] = pre_total
        invoice_totals["round_off"] = round(pre_total) - pre_total
        invoice_totals["final_amount"] = round(pre_total)
        
        # Round all totals
        for key in invoice_totals:
            if key != "final_amount":
                invoice_totals[key] = round(invoice_totals[key], 2)
        
        return {
            "success": True,
            "line_items": line_items,
            "totals": invoice_totals,
            "calculation_timestamp": int(time.time() * 1000),
            "gst_type": gst_type
        }
        
    except Exception as e:
        logger.error(f"Invoice calculation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Invoice calculation failed: {str(e)}")