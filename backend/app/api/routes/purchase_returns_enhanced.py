"""
Enhanced Purchase Return API Router
Mirrors sales return functionality with batch tracking, inventory movements, and validation
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from datetime import datetime
from decimal import Decimal
import uuid

from ...core.database import get_db
from ...core.auth_utils import get_org_id_from_header
from ..services.document_number_service import DocumentNumberService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["purchase-returns"])

class PurchaseReturnCreate(BaseModel):
    """Purchase return request model"""
    supplier_invoice_id: Optional[int] = None
    grn_id: Optional[int] = None  # Optional, for backward compatibility
    supplier_id: int
    return_date: str
    return_reason: str
    return_category: Optional[str] = "QUALITY"
    items: List[Dict[str, Any]]
    transport_details: Optional[Dict[str, Any]] = {}
    notes: Optional[str] = ""

@router.get("/supplier-invoice/{invoice_id}/returnable-items")
async def get_returnable_items(
    invoice_id: int,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Get supplier invoice items with accurate returnable quantities
    Works with both direct invoices and GRN-based invoices
    """
    try:
        # First try supplier_invoice_items table
        items = db.execute(
            text("""
                SELECT 
                    sii.invoice_item_id,
                    sii.product_id,
                    p.product_name,
                    sii.batch_id,
                    sii.batch_number,
                    sii.quantity as invoice_quantity,
                    COALESCE(sii.quantity_returned, 0) as already_returned,
                    sii.quantity - COALESCE(sii.quantity_returned, 0) as returnable_quantity,
                    sii.unit_price,
                    sii.discount_percent,
                    COALESCE(sii.cgst_percent, 0) + COALESCE(sii.sgst_percent, 0) + COALESCE(sii.igst_percent, 0) as tax_percent,
                    sii.total_amount,
                    p.hsn_code,
                    sii.unit,
                    b.expiry_date,
                    b.manufacturing_date
                FROM procurement.supplier_invoice_items sii
                JOIN inventory.products p ON sii.product_id = p.product_id
                LEFT JOIN inventory.batches b ON sii.batch_id = b.batch_id
                WHERE sii.supplier_invoice_id = :invoice_id
                AND sii.quantity - COALESCE(sii.quantity_returned, 0) > 0
                ORDER BY sii.invoice_item_id
            """),
            {"invoice_id": invoice_id}
        ).fetchall()
        
        # If no items in supplier_invoice_items, check if invoice has GRN
        if not items:
            # Get GRN items linked to this supplier invoice
            items = db.execute(
                text("""
                    SELECT 
                        gi.grn_item_id as invoice_item_id,
                        gi.product_id,
                        p.product_name,
                        gi.batch_id,
                        gi.batch_number,
                        gi.received_quantity as invoice_quantity,
                        COALESCE(gi.quantity_returned, 0) as already_returned,
                        gi.received_quantity - COALESCE(gi.quantity_returned, 0) as returnable_quantity,
                        gi.unit_price,
                        gi.discount_percent,
                        gi.tax_percent,
                        gi.total_amount,
                        p.hsn_code,
                        gi.uom as unit,
                        b.expiry_date,
                        b.manufacturing_date
                    FROM procurement.supplier_invoices si
                    JOIN procurement.goods_receipt_notes grn ON si.grn_ids @> ARRAY[grn.grn_id]
                    JOIN procurement.grn_items gi ON grn.grn_id = gi.grn_id
                    JOIN inventory.products p ON gi.product_id = p.product_id
                    LEFT JOIN inventory.batches b ON gi.batch_id = b.batch_id
                    WHERE si.supplier_invoice_id = :invoice_id
                    AND gi.received_quantity - COALESCE(gi.quantity_returned, 0) > 0
                    ORDER BY gi.grn_item_id
                """),
                {"invoice_id": invoice_id}
            ).fetchall()
        
        result = []
        for item in items:
            result.append({
                "invoice_item_id": item.invoice_item_id,
                "product_id": item.product_id,
                "product_name": item.product_name,
                "batch_id": item.batch_id,
                "batch_number": item.batch_number,
                "invoice_quantity": float(item.invoice_quantity),
                "already_returned": float(item.already_returned),
                "returnable_quantity": float(item.returnable_quantity),
                "max_returnable_qty": float(item.returnable_quantity),
                "unit_price": float(item.unit_price) if item.unit_price else 0,
                "discount_percent": float(item.discount_percent) if item.discount_percent else 0,
                "tax_percent": float(item.tax_percent) if item.tax_percent else 0,
                "hsn_code": item.hsn_code,
                "unit": item.unit,
                "expiry_date": str(item.expiry_date) if item.expiry_date else None,
                "manufacturing_date": str(item.manufacturing_date) if item.manufacturing_date else None,
                "can_return": float(item.returnable_quantity) > 0
            })
        
        return {"items": result}
        
    except Exception as e:
        logger.error(f"Error fetching returnable items: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/")
async def create_purchase_return(
    return_data: PurchaseReturnCreate,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header),
    user_id: int = 1  # Should come from auth
):
    """
    Create a new purchase return with validation, batch tracking, and inventory movements
    """
    try:
        return_dict = return_data.dict()
        
        if not return_dict["items"]:
            raise HTTPException(status_code=400, detail="At least one item must be returned")
            
        # Generate return number
        return_number = DocumentNumberService.generate_number(db, "purchase_return", org_id)
        
        # Get branch_id (default to 1 for now)
        branch_id = 1
        
        # Generate debit note number if supplier has GST
        debit_note_no = None
        supplier = db.execute(
            text("""
                SELECT supplier_id, supplier_name, gst_number
                FROM parties.suppliers
                WHERE supplier_id = :supplier_id
            """),
            {"supplier_id": return_dict["supplier_id"]}
        ).fetchone()
        
        if supplier and supplier.gst_number:
            debit_note_no = f"DN-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        
        # Calculate totals
        subtotal = Decimal("0")
        tax_amount = Decimal("0")
        cgst_amount = Decimal("0")
        sgst_amount = Decimal("0")
        igst_amount = Decimal("0")
        total_amount = Decimal("0")
        
        for item in return_dict["items"]:
            if not item.get("selected") or not item.get("return_quantity", 0):
                continue
                
            qty = Decimal(str(item.get("return_quantity", 0)))
            rate = Decimal(str(item.get("unit_price", 0)))
            discount_percent = Decimal(str(item.get("discount_percent", 0)))
            
            # Calculate item values
            base_value = qty * rate
            discount_amount = base_value * discount_percent / 100
            taxable_value = base_value - discount_amount
            
            tax_percent = Decimal(str(item.get("tax_percent", 0)))
            item_tax = taxable_value * tax_percent / 100
            
            subtotal += taxable_value
            tax_amount += item_tax
            
            # Assume CGST/SGST split
            cgst_amount += item_tax / 2
            sgst_amount += item_tax / 2
            
            item_total = taxable_value + item_tax
            total_amount += item_total
        
        # Create purchase return
        return_result = db.execute(
            text("""
                INSERT INTO procurement.purchase_returns (
                    org_id, branch_id, return_number, return_date, return_type,
                    supplier_invoice_id, grn_id, supplier_id, return_reason, detailed_reason,
                    return_amount, tax_amount, total_amount,
                    cgst_amount, sgst_amount, igst_amount,
                    debit_note_number, debit_note_date, debit_note_status,
                    notes, created_by
                ) VALUES (
                    :org_id, :branch_id, :return_number, :return_date, 'PURCHASE',
                    :supplier_invoice_id, :grn_id, :supplier_id, :return_reason, :detailed_reason,
                    :return_amount, :tax_amount, :total_amount,
                    :cgst_amount, :sgst_amount, :igst_amount,
                    :debit_note_number, CURRENT_DATE, :debit_note_status,
                    :notes, :created_by
                ) RETURNING return_id
            """),
            {
                "org_id": org_id,
                "branch_id": branch_id,
                "return_number": return_number,
                "return_date": return_dict["return_date"],
                "supplier_invoice_id": return_dict.get("supplier_invoice_id"),
                "grn_id": return_dict.get("grn_id"),
                "supplier_id": return_dict["supplier_id"],
                "return_reason": return_dict.get("return_reason"),
                "detailed_reason": return_dict.get("notes"),
                "return_amount": float(subtotal),
                "tax_amount": float(tax_amount),
                "total_amount": float(total_amount),
                "cgst_amount": float(cgst_amount),
                "sgst_amount": float(sgst_amount),
                "igst_amount": float(igst_amount),
                "debit_note_number": debit_note_no,
                "debit_note_status": "issued" if debit_note_no else "pending",
                "notes": return_dict.get("notes"),
                "created_by": user_id
            }
        ).fetchone()
        
        return_id = return_result[0]
        supplier_invoice_id = return_dict.get("supplier_invoice_id")
        
        # Process return items
        for item in return_dict["items"]:
            if not item.get("selected") or not item.get("return_quantity", 0):
                continue
                
            invoice_item_id = item.get("invoice_item_id")
            grn_item_id = item.get("grn_item_id")  # For backward compatibility
            return_qty = Decimal(str(item.get("return_quantity", 0)))
            unit_price = Decimal(str(item.get("unit_price", 0)))
            
            # Validate return quantity doesn't exceed invoice quantity
            if invoice_item_id:
                # Check supplier_invoice_items first
                already_returned = db.execute(
                    text("""
                        SELECT 
                            sii.quantity as invoice_qty,
                            COALESCE(sii.quantity_returned, 0) as already_returned
                        FROM procurement.supplier_invoice_items sii
                        WHERE sii.invoice_item_id = :invoice_item_id
                    """),
                    {"invoice_item_id": invoice_item_id}
                ).fetchone()
                
                if not already_returned and grn_item_id:
                    # Fallback to GRN items
                    already_returned = db.execute(
                        text("""
                            SELECT 
                                gi.received_quantity as invoice_qty,
                                COALESCE(gi.quantity_returned, 0) as already_returned
                            FROM procurement.grn_items gi
                            WHERE gi.grn_item_id = :grn_item_id
                        """),
                        {"grn_item_id": grn_item_id}
                    ).fetchone()
                
                if already_returned:
                    max_returnable = Decimal(str(already_returned.invoice_qty)) - Decimal(str(already_returned.already_returned))
                    if return_qty > max_returnable:
                        product_name = item.get("product_name", "Product")
                        raise HTTPException(
                            status_code=400,
                            detail=f"Cannot return {return_qty} units of {product_name}. Maximum returnable: {max_returnable}"
                        )
            
            # Calculate values
            base_value = return_qty * unit_price
            discount_percent = Decimal(str(item.get("discount_percent", 0)))
            discount_amount = base_value * discount_percent / 100
            return_value = base_value - discount_amount
            
            tax_percent = Decimal(str(item.get("tax_percent", 0)))
            item_tax_amount = return_value * tax_percent / 100
            
            # Get batch information
            batch_id = item.get("batch_id")
            batch_number = item.get("batch_number")
            
            # If GRN item, get batch info from there
            if grn_item_id and not batch_number:
                grn_batch = db.execute(
                    text("""
                        SELECT batch_number, batch_id
                        FROM procurement.grn_items
                        WHERE grn_item_id = :grn_item_id
                    """),
                    {"grn_item_id": grn_item_id}
                ).fetchone()
                
                if grn_batch:
                    batch_number = grn_batch.batch_number
                    batch_id = grn_batch.batch_id
            
            # If we have batch_number but no batch_id, look it up
            if batch_number and not batch_id:
                batch_result = db.execute(
                    text("""
                        SELECT batch_id 
                        FROM inventory.batches 
                        WHERE batch_number = :batch_number 
                        AND product_id = :product_id
                        LIMIT 1
                    """),
                    {
                        "batch_number": batch_number,
                        "product_id": item["product_id"]
                    }
                ).fetchone()
                
                if batch_result:
                    batch_id = batch_result.batch_id
            
            # Determine disposition
            item_return_reason = item.get("return_reason") or return_dict.get("return_reason", "Quality Issue")
            damaged_reasons = ["damaged", "broken", "expired", "expiry", "quality issue", "defective"]
            is_damaged = any(reason in item_return_reason.lower() for reason in damaged_reasons)
            
            if is_damaged:
                damaged_qty = float(return_qty)
                saleable_qty = 0
                disposition = "DESTROY"
            else:
                damaged_qty = 0
                saleable_qty = float(return_qty)
                disposition = "RETURN_TO_SUPPLIER"
            
            # Insert return item
            db.execute(
                text("""
                    INSERT INTO procurement.purchase_return_items (
                        return_id, grn_item_id, product_id,
                        batch_id, batch_number,
                        return_quantity, uom,
                        damaged_quantity, saleable_quantity,
                        unit_price, return_value, tax_amount,
                        item_return_reason, disposition
                    ) VALUES (
                        :return_id, :grn_item_id, :product_id,
                        :batch_id, :batch_number,
                        :return_quantity, :uom,
                        :damaged_quantity, :saleable_quantity,
                        :unit_price, :return_value, :tax_amount,
                        :item_return_reason, :disposition
                    )
                """),
                {
                    "return_id": return_id,
                    "grn_item_id": grn_item_id,
                    "product_id": item["product_id"],
                    "batch_id": batch_id,
                    "batch_number": batch_number,
                    "return_quantity": float(return_qty),
                    "uom": item.get("unit", "PCS"),
                    "damaged_quantity": damaged_qty,
                    "saleable_quantity": saleable_qty,
                    "unit_price": float(unit_price),
                    "return_value": float(return_value),
                    "tax_amount": float(item_tax_amount),
                    "item_return_reason": item_return_reason,
                    "disposition": disposition
                }
            )
            
            # Update batch stock (decrease for returns to supplier)
            if batch_id and disposition == "RETURN_TO_SUPPLIER":
                db.execute(
                    text("""
                        UPDATE inventory.batches 
                        SET quantity_available = quantity_available - :return_qty,
                            quantity_returned = COALESCE(quantity_returned, 0) + :return_qty
                        WHERE batch_id = :batch_id
                        AND quantity_available >= :return_qty
                    """),
                    {
                        "return_qty": float(return_qty),
                        "batch_id": batch_id
                    }
                )
            
            # Track inventory movement
            if batch_id or item["product_id"]:
                movement_type = 'PURCHASE_RETURN'
                movement_note = f"Purchase Return #{return_number} to {supplier.supplier_name}"
                
                db.execute(
                    text("""
                        INSERT INTO inventory.inventory_movements (
                            org_id, movement_type, movement_date, movement_direction,
                            product_id, batch_id, quantity, base_quantity,
                            location_id, reference_type, reference_id, reference_number,
                            reason, notes, created_by
                        ) VALUES (
                            :org_id, :movement_type, CURRENT_TIMESTAMP, 'OUT',
                            :product_id, :batch_id, :quantity, :quantity,
                            1, 'PURCHASE_RETURN', :return_id, :return_number,
                            :reason, :notes, :created_by
                        )
                    """),
                    {
                        "org_id": org_id,
                        "movement_type": movement_type,
                        "product_id": item["product_id"],
                        "batch_id": batch_id,
                        "quantity": float(return_qty),
                        "return_id": return_id,
                        "return_number": return_number,
                        "reason": item_return_reason,
                        "notes": movement_note,
                        "created_by": user_id
                    }
                )
        
        db.commit()
        
        return {
            "success": True,
            "return_id": return_id,
            "return_number": return_number,
            "debit_note_number": debit_note_no,
            "message": f"Purchase return {return_number} created successfully"
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating purchase return: {e}")
        raise HTTPException(status_code=500, detail=str(e))