"""
Enterprise Calculation API
Single source of truth for ALL business calculations
Replaces all frontend calculation logic with secure backend calculations
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any
import logging
import time

from ...core.database import get_db
from ...core.secure_auth import get_org_id_string  # SECURE: JWT-based auth

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/calculations", tags=["Enterprise Calculations"])

# ========================================
# PURCHASE CALCULATIONS
# ========================================

@router.post("/purchase")
async def calculate_purchase_totals(
    purchase_data: Dict[str, Any],
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
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
            gst_percent = float(item.get("gst_percent", 12))
            
            # Line calculations
            subtotal = quantity * purchase_price
            discount_amount = (subtotal * discount_percent) / 100
            taxable_amount = subtotal - discount_amount
            gst_amount = (taxable_amount * gst_percent) / 100
            line_total = taxable_amount + gst_amount
            
            # GST breakdown
            cgst = gst_amount / 2 if gst_type != "IGST" else 0
            sgst = gst_amount / 2 if gst_type != "IGST" else 0
            igst = gst_amount if gst_type == "IGST" else 0
            
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
                "cgst_amount": round(cgst, 2),
                "sgst_amount": round(sgst, 2),
                "igst_amount": round(igst, 2),
                "total_tax": round(gst_amount, 2),
                "line_total": round(line_total, 2)
            }
            
            line_items.append(line_item)
            
            # Accumulate totals
            purchase_totals["gross_amount"] += subtotal
            purchase_totals["total_discount"] += discount_amount
            purchase_totals["taxable_amount"] += taxable_amount
            purchase_totals["cgst_amount"] += cgst
            purchase_totals["sgst_amount"] += sgst
            purchase_totals["igst_amount"] += igst
            purchase_totals["total_tax"] += gst_amount
        
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
async def calculate_sales_order_totals(
    order_data: Dict[str, Any],
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
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
            gst_percent = float(item.get("gst_percent", 12))
            
            # Line calculations
            subtotal = quantity * unit_price
            discount_amount = (subtotal * discount_percent) / 100
            taxable_amount = subtotal - discount_amount
            gst_amount = (taxable_amount * gst_percent) / 100
            line_total = taxable_amount + gst_amount
            
            # GST breakdown
            cgst = gst_amount / 2 if gst_type != "IGST" else 0
            sgst = gst_amount / 2 if gst_type != "IGST" else 0
            igst = gst_amount if gst_type == "IGST" else 0
            
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
                "cgst_amount": round(cgst, 2),
                "sgst_amount": round(sgst, 2),
                "igst_amount": round(igst, 2),
                "total_tax": round(gst_amount, 2),
                "line_total": round(line_total, 2)
            }
            
            line_items.append(line_item)
            
            # Accumulate totals
            order_totals["gross_amount"] += subtotal
            order_totals["total_discount"] += discount_amount
            order_totals["taxable_amount"] += taxable_amount
            order_totals["cgst_amount"] += cgst
            order_totals["sgst_amount"] += sgst
            order_totals["igst_amount"] += igst
            order_totals["total_tax"] += gst_amount
        
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
async def calculate_sales_return_totals(
    return_data: Dict[str, Any],
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
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
            gst_percent = float(item.get("gst_percent", 12))
            
            # Line calculations
            subtotal = return_quantity * unit_price
            discount_amount = (subtotal * discount_percent) / 100
            taxable_amount = subtotal - discount_amount
            gst_amount = (taxable_amount * gst_percent) / 100
            line_total = taxable_amount + gst_amount
            
            # GST breakdown
            cgst = gst_amount / 2 if gst_type != "IGST" else 0
            sgst = gst_amount / 2 if gst_type != "IGST" else 0
            igst = gst_amount if gst_type == "IGST" else 0
            
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
                "cgst_amount": round(cgst, 2),
                "sgst_amount": round(sgst, 2),
                "igst_amount": round(igst, 2),
                "total_tax": round(gst_amount, 2),
                "line_total": round(line_total, 2)
            }
            
            line_items.append(line_item)
            
            # Accumulate totals
            return_totals["gross_amount"] += subtotal
            return_totals["total_discount"] += discount_amount
            return_totals["taxable_amount"] += taxable_amount
            return_totals["cgst_amount"] += cgst
            return_totals["sgst_amount"] += sgst
            return_totals["igst_amount"] += igst
            return_totals["total_tax"] += gst_amount
        
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
async def calculate_purchase_return_totals(
    return_data: Dict[str, Any],
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
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
            gst_percent = float(item.get("gst_percent", 12))
            
            # Line calculations
            subtotal = return_quantity * purchase_price
            discount_amount = (subtotal * discount_percent) / 100
            taxable_amount = subtotal - discount_amount
            gst_amount = (taxable_amount * gst_percent) / 100
            line_total = taxable_amount + gst_amount
            
            # GST breakdown
            cgst = gst_amount / 2 if gst_type != "IGST" else 0
            sgst = gst_amount / 2 if gst_type != "IGST" else 0
            igst = gst_amount if gst_type == "IGST" else 0
            
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
                "cgst_amount": round(cgst, 2),
                "sgst_amount": round(sgst, 2),
                "igst_amount": round(igst, 2),
                "total_tax": round(gst_amount, 2),
                "line_total": round(line_total, 2)
            }
            
            line_items.append(line_item)
            
            # Accumulate totals
            return_totals["gross_amount"] += subtotal
            return_totals["total_discount"] += discount_amount
            return_totals["taxable_amount"] += taxable_amount
            return_totals["cgst_amount"] += cgst
            return_totals["sgst_amount"] += sgst
            return_totals["igst_amount"] += igst
            return_totals["total_tax"] += gst_amount
        
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
async def calculate_challan_totals(
    challan_data: Dict[str, Any],
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
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