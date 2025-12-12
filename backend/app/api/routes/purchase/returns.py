"""
Enhanced Purchase Return API Router
Mirrors sales return functionality with batch tracking, inventory movements, and validation

PRODUCTION-READY: Uses TenantAwareSession for AI-agent safety
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

from ....core.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from ....core.org_context import get_org_context, OrgContext
from ....core.permissions import PermissionChecker  # RBAC
from ...services.document_number_service import DocumentNumberService
from ...services.gst_service import GSTService
from ...services.inventory_service import InventoryService
from ...services.return_service import ReturnService
from ...schemas.inventory import StockMovementCreate
from ....utils.branch_utils import get_default_branch_id
from datetime import date

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
@with_tenant_context
async def get_returnable_items(
    invoice_id: int,
    _: dict = Depends(PermissionChecker("purchase_returns", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get supplier invoice items with accurate returnable quantities
    Works with both direct invoices and GRN-based invoices
    """
    org_id = str(context.org_id)
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
@with_tenant_context
async def create_purchase_return(
    return_data: PurchaseReturnCreate,
    _: dict = Depends(PermissionChecker("purchase_returns", "create")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Create a new purchase return with validation, batch tracking, and inventory movements
    """
    org_id = str(context.org_id)
    # SECURITY FIX: Get user_id and branch_id from authenticated context
    user_id = context.user_id
    branch_id = context.primary_branch_id
    
    try:
        return_dict = return_data.dict()
        
        if not return_dict["items"]:
            raise HTTPException(status_code=400, detail="At least one item must be returned")
            
        # Generate return number
        return_number = DocumentNumberService.generate_number(db, "purchase_return", org_id)
        
        # Fallback to org's default location if user has no branch assigned
        if not branch_id:
            try:
                branch_id = get_default_branch_id(db, org_id)
            except ValueError as e:
                logger.error(f"No default branch for org {org_id}: {e}")
                raise HTTPException(status_code=400, detail="No active branch found for organization")
        
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
            debit_note_no = DocumentNumberService.generate_number(db, "debit_note", org_id)
        
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
            
            # Use GSTService for consistent tax calculations
            gst = GSTService.calculate_gst_components(taxable_value, tax_percent, "CGST/SGST")
            item_tax = gst["total_tax_amount"]
            
            subtotal += taxable_value
            tax_amount += item_tax
            cgst_amount += gst["cgst_amount"]
            sgst_amount += gst["sgst_amount"]
            
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
            
            # Calculate base value
            base_value = return_qty * unit_price
            discount_percent = Decimal(str(item.get("discount_percent", 0)))
            
            # Check if tax_percent was explicitly provided by frontend
            tax_percent_provided = "tax_percent" in item and item["tax_percent"] is not None
            tax_percent = Decimal(str(item.get("tax_percent", 0)))
            
            # If tax_percent NOT explicitly provided, use ReturnService to fetch from source
            if not tax_percent_provided:
                tax_percent = ReturnService.resolve_tax_from_supplier_invoice(
                    db, invoice_item_id, grn_item_id, tax_percent_explicitly_provided=tax_percent_provided
                )
            
            # Calculate return value using ReturnService
            return_calc = ReturnService.calculate_return_value(
                return_qty, unit_price, discount_percent, tax_percent
            )
            return_value = return_calc["return_value"]
            
            # Use GSTService for consistent tax calculations
            gst = GSTService.calculate_gst_components(return_value, tax_percent, "CGST/SGST")
            item_tax_amount = gst["total_tax_amount"]
            
            # Resolve batch using ReturnService
            batch_id, batch_number = ReturnService.resolve_batch(
                db,
                product_id=item["product_id"],
                batch_number=item.get("batch_number"),
                batch_id=item.get("batch_id"),
                source_item_id=grn_item_id,
                source_type="grn"
            )
            
            # Determine disposition using ReturnService
            item_return_reason = item.get("return_reason") or return_dict.get("return_reason", "Quality Issue")
            disposition, is_damaged = ReturnService.determine_disposition(item_return_reason)
            
            # For purchase returns, override disposition to RETURN_TO_SUPPLIER if not damaged
            if not is_damaged:
                disposition = "RETURN_TO_SUPPLIER"
            
            if is_damaged:
                damaged_qty = float(return_qty)
                saleable_qty = 0
            else:
                damaged_qty = 0
                saleable_qty = float(return_qty)
            
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
            
            # Track inventory movement using InventoryService
            if batch_id or item["product_id"]:
                movement_type = 'PURCHASE_RETURN'
                movement_note = f"Purchase Return #{return_number} to {supplier.supplier_name}"
                
                # Use InventoryService for stock movement
                movement_data = StockMovementCreate(
                    org_id=uuid.UUID(org_id) if isinstance(org_id, str) else org_id,
                    product_id=item["product_id"],
                    batch_id=batch_id,
                    movement_type=movement_type,
                    movement_direction="out",
                    movement_date=date.today(),
                    quantity=int(float(return_qty)),
                    base_quantity=int(float(return_qty)),
                    location_id=branch_id,
                    reference_type="PURCHASE_RETURN",
                    reference_id=return_id,
                    reference_number=return_number,
                    reason=item_return_reason,
                    notes=movement_note,
                    created_by=user_id
                )
                
                InventoryService.record_stock_movement(db, movement_data)
        
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