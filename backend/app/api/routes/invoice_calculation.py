"""
Enterprise Invoice Calculation API
Single source of truth for all invoice calculations
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any
import logging

from ...core.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/invoices", tags=["Invoice Calculations"])

@router.post("/calculate")
async def calculate_invoice_totals(
    invoice_data: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """
    Enterprise-grade invoice calculation endpoint
    Single source of truth - frontend never calculates
    
    Returns all totals, taxes, and line-item details
    """
    try:
        items = invoice_data.get("items", [])
        gst_type = invoice_data.get("gst_type", "CGST/SGST")
        delivery_charges = float(invoice_data.get("delivery_charges", 0))
        invoice_discount = float(invoice_data.get("discount_amount", 0))
        
        # Enterprise calculation: Process all items in single pass
        line_items = []
        invoice_totals = {
            "gross_amount": 0,
            "total_discount": 0, 
            "taxable_amount": 0,
            "cgst_amount": 0,
            "sgst_amount": 0,
            "igst_amount": 0,
            "total_tax": 0,
            "delivery_charges": delivery_charges,
            "invoice_discount": invoice_discount,
            "net_amount": 0,
            "round_off": 0,
            "final_amount": 0
        }
        
        # Process each line item
        for idx, item in enumerate(items):
            quantity = float(item.get("quantity", 0))
            base_quantity = float(item.get("base_quantity", quantity - float(item.get("free_quantity", 0))))
            unit_price = float(item.get("unit_price", 0))
            discount_percent = float(item.get("discount_percent", 0))
            gst_percent = float(item.get("gst_percent", 12))
            
            # Line calculations
            subtotal = base_quantity * unit_price
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
                "base_quantity": base_quantity,
                "free_quantity": item.get("free_quantity", 0),
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
            
            # Accumulate invoice totals
            invoice_totals["gross_amount"] += subtotal
            invoice_totals["total_discount"] += discount_amount
            invoice_totals["taxable_amount"] += taxable_amount
            invoice_totals["cgst_amount"] += cgst
            invoice_totals["sgst_amount"] += sgst
            invoice_totals["igst_amount"] += igst
            invoice_totals["total_tax"] += gst_amount
        
        # Final invoice calculations
        pre_total = invoice_totals["taxable_amount"] + invoice_totals["total_tax"] + delivery_charges - invoice_discount
        invoice_totals["net_amount"] = pre_total
        invoice_totals["round_off"] = round(pre_total) - pre_total
        invoice_totals["final_amount"] = round(pre_total)
        
        # Round all totals
        for key in invoice_totals:
            if key != "final_amount":  # Keep final_amount as integer
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
        raise HTTPException(status_code=500, detail=f"Calculation failed: {str(e)}")

@router.post("/calculate/batch")
async def calculate_batch_invoices(
    batch_data: Dict[str, List[Dict[str, Any]]],
    db: Session = Depends(get_db)
):
    """
    Batch calculation for multiple invoices
    Enterprise feature for bulk processing
    """
    try:
        invoices = batch_data.get("invoices", [])
        results = []
        
        for invoice_data in invoices:
            # Reuse single calculation logic
            calc_result = await calculate_invoice_totals(invoice_data, db)
            results.append(calc_result)
        
        return {
            "success": True,
            "results": results,
            "batch_size": len(results),
            "timestamp": int(time.time() * 1000)
        }
        
    except Exception as e:
        logger.error(f"Batch calculation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Batch calculation failed: {str(e)}")

import time