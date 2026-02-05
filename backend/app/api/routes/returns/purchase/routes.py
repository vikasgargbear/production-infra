"""
Enhanced Purchase Return API Router
REFACTORED: Uses PurchaseReturnService for database operations
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
import logging
from datetime import date
from decimal import Decimal
import uuid

from .....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from .....core.auth.org_context import get_org_context, OrgContext
from .....core.security.permissions import PermissionChecker
from ....services.document_number_service import DocumentNumberService
from ....services.compliance.gst_service import GSTService
from ....services.inventory.inventory_service import InventoryService
from ....services.returns.return_service import ReturnService
from ....services.returns.purchase_return.service import PurchaseReturnService
from ....schemas.inventory.inventory import StockMovementCreate
from .....core.utils.branch_utils import get_default_branch_id

logger = logging.getLogger(__name__)

router = APIRouter(tags=["purchase-returns"])

class PurchaseReturnCreate(BaseModel):
    supplier_invoice_id: Optional[int] = None
    grn_id: Optional[int] = None
    supplier_id: int
    return_date: str
    return_reason: str
    return_category: Optional[str] = "QUALITY"
    items: List[Dict[str, Any]]
    transport_details: Optional[Dict[str, Any]] = {}
    notes: Optional[str] = ""


@router.get("/")
@with_tenant_context
async def list_purchase_returns(
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    supplier_id: Optional[int] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    _: dict = Depends(PermissionChecker("purchase_returns", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """List purchase returns with pagination and filters"""
    try:
        result = PurchaseReturnService.list_purchase_returns(
            db=db,
            skip=skip,
            limit=limit,
            supplier_id=supplier_id,
            from_date=from_date,
            to_date=to_date
        )
        return result
    except Exception as e:
        logger.error(f"Error listing purchase returns: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{return_id}")
@with_tenant_context
async def get_purchase_return_detail(
    return_id: int,
    _: dict = Depends(PermissionChecker("purchase_returns", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get purchase return details by ID"""
    try:
        result = PurchaseReturnService.get_purchase_return_detail(db, return_id)
        if not result:
            raise HTTPException(status_code=404, detail="Purchase return not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching purchase return detail: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/supplier-invoice/{invoice_id}/returnable-items")
@with_tenant_context
async def get_returnable_items(
    invoice_id: int,
    _: dict = Depends(PermissionChecker("purchase_returns", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get supplier invoice items with accurate returnable quantities"""
    try:
        items = PurchaseReturnService.get_returnable_items_from_invoice(db, invoice_id)
        if not items:
            items = PurchaseReturnService.get_returnable_items_from_grn(db, invoice_id)
        
        result = []
        for item in items:
            result.append({
                "invoice_item_id": item["invoice_item_id"], "product_id": item["product_id"],
                "product_name": item["product_name"], "batch_id": item.get("batch_id"),
                "batch_number": item.get("batch_number"), "invoice_quantity": float(item["invoice_quantity"]),
                "already_returned": float(item["already_returned"]), "returnable_quantity": float(item["returnable_quantity"]),
                "max_returnable_qty": float(item["returnable_quantity"]),
                "unit_price": float(item["unit_price"]) if item.get("unit_price") else 0,
                "discount_percent": float(item["discount_percent"]) if item.get("discount_percent") else 0,
                "tax_percent": float(item["tax_percent"]) if item.get("tax_percent") else 0,
                "hsn_code": item.get("hsn_code"), "unit": item.get("unit"),
                "expiry_date": str(item["expiry_date"]) if item.get("expiry_date") else None,
                "manufacturing_date": str(item["manufacturing_date"]) if item.get("manufacturing_date") else None,
                "can_return": float(item["returnable_quantity"]) > 0
            })
        return {"items": result}
    except Exception as e:
        logger.error(f"Error fetching returnable items: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/")
@with_tenant_context
async def create_purchase_return(
    return_data: PurchaseReturnCreate,
    _: dict = Depends(PermissionChecker("purchase_returns", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Create a new purchase return with validation, batch tracking, and inventory movements"""
    org_id = str(context.org_id)
    user_id = context.user_id
    branch_id = context.primary_branch_id
    
    try:
        return_dict = return_data.dict()
        if not return_dict["items"]:
            raise HTTPException(status_code=400, detail="At least one item must be returned")
        
        return_number = DocumentNumberService.generate_number(db, "purchase_return", org_id)
        
        if not branch_id:
            try:
                branch_id = get_default_branch_id(db, org_id)
            except ValueError as e:
                raise HTTPException(status_code=400, detail="No active branch found for organization")
        
        supplier = PurchaseReturnService.get_supplier(db, return_dict["supplier_id"])
        debit_note_no = None
        if supplier and supplier.get("gst_number"):
            debit_note_no = DocumentNumberService.generate_number(db, "debit_note", org_id)
        
        subtotal, tax_amount, cgst_amount, sgst_amount, igst_amount, total_amount = (Decimal("0"),)*6
        
        for item in return_dict["items"]:
            if not item.get("selected") or not item.get("return_quantity", 0):
                continue
            qty = Decimal(str(item.get("return_quantity", 0)))
            rate = Decimal(str(item.get("unit_price", 0)))
            discount_percent = Decimal(str(item.get("discount_percent", 0)))
            base_value = qty * rate
            discount_amount_item = base_value * discount_percent / 100
            taxable_value = base_value - discount_amount_item
            tax_percent = Decimal(str(item.get("tax_percent", 0)))
            gst = GSTService.calculate_gst_components(taxable_value, tax_percent, "CGST/SGST")
            item_tax = gst["total_tax_amount"]
            subtotal += taxable_value
            tax_amount += item_tax
            cgst_amount += gst["cgst_amount"]
            sgst_amount += gst["sgst_amount"]
            total_amount += taxable_value + item_tax
        
        return_id = PurchaseReturnService.create_purchase_return(db, {
            "org_id": org_id, "branch_id": branch_id, "return_number": return_number,
            "return_date": return_dict["return_date"], "supplier_invoice_id": return_dict.get("supplier_invoice_id"),
            "grn_id": return_dict.get("grn_id"), "supplier_id": return_dict["supplier_id"],
            "return_reason": return_dict.get("return_reason"), "detailed_reason": return_dict.get("notes"),
            "return_amount": float(subtotal), "tax_amount": float(tax_amount), "total_amount": float(total_amount),
            "cgst_amount": float(cgst_amount), "sgst_amount": float(sgst_amount), "igst_amount": float(igst_amount),
            "debit_note_number": debit_note_no, "debit_note_status": "issued" if debit_note_no else "pending",
            "notes": return_dict.get("notes"), "created_by": user_id
        })
        
        supplier_invoice_id = return_dict.get("supplier_invoice_id")
        
        for item in return_dict["items"]:
            if not item.get("selected") or not item.get("return_quantity", 0):
                continue
            
            invoice_item_id = item.get("invoice_item_id")
            grn_item_id = item.get("grn_item_id")
            return_qty = Decimal(str(item.get("return_quantity", 0)))
            unit_price = Decimal(str(item.get("unit_price", 0)))
            
            if invoice_item_id:
                already_returned = PurchaseReturnService.get_invoice_item_returnable(db, invoice_item_id)
                if not already_returned and grn_item_id:
                    already_returned = PurchaseReturnService.get_grn_item_returnable(db, grn_item_id)
                if already_returned:
                    max_returnable = Decimal(str(already_returned["invoice_qty"])) - Decimal(str(already_returned["already_returned"]))
                    if return_qty > max_returnable:
                        product_name = item.get("product_name", "Product")
                        raise HTTPException(status_code=400, detail=f"Cannot return {return_qty} units of {product_name}. Max: {max_returnable}")
            
            base_value = return_qty * unit_price
            discount_percent = Decimal(str(item.get("discount_percent", 0)))
            tax_percent_provided = "tax_percent" in item and item["tax_percent"] is not None
            tax_percent = Decimal(str(item.get("tax_percent", 0)))
            
            if not tax_percent_provided:
                tax_percent = ReturnService.resolve_tax_from_supplier_invoice(db, invoice_item_id, grn_item_id, tax_percent_explicitly_provided=tax_percent_provided)
            
            return_calc = ReturnService.calculate_return_value(return_qty, unit_price, discount_percent, tax_percent)
            return_value = return_calc["return_value"]
            gst = GSTService.calculate_gst_components(return_value, tax_percent, "CGST/SGST")
            item_tax_amount = gst["total_tax_amount"]
            
            batch_id, batch_number = ReturnService.resolve_batch(db, product_id=item["product_id"],
                                                                  batch_number=item.get("batch_number"),
                                                                  batch_id=item.get("batch_id"),
                                                                  source_item_id=grn_item_id, source_type="grn")
            
            item_return_reason = item.get("return_reason") or return_dict.get("return_reason", "Quality Issue")
            disposition, is_damaged = ReturnService.determine_disposition(item_return_reason)
            if not is_damaged:
                disposition = "RETURN_TO_SUPPLIER"
            damaged_qty = float(return_qty) if is_damaged else 0
            saleable_qty = 0 if is_damaged else float(return_qty)
            
            PurchaseReturnService.insert_return_item(db, {
                "return_id": return_id, "grn_item_id": grn_item_id, "product_id": item["product_id"],
                "batch_id": batch_id, "batch_number": batch_number, "return_quantity": float(return_qty),
                "uom": item.get("unit", "PCS"), "damaged_quantity": damaged_qty, "saleable_quantity": saleable_qty,
                "unit_price": float(unit_price), "return_value": float(return_value),
                "tax_amount": float(item_tax_amount), "item_return_reason": item_return_reason, "disposition": disposition
            })
            
            if batch_id and disposition == "RETURN_TO_SUPPLIER":
                PurchaseReturnService.update_batch_stock_for_return(db, batch_id, float(return_qty))
            
            if batch_id or item["product_id"]:
                movement_data = StockMovementCreate(
                    org_id=uuid.UUID(org_id), product_id=item["product_id"], batch_id=batch_id,
                    movement_type='PURCHASE_RETURN', movement_direction="out", movement_date=date.today(),
                    quantity=int(float(return_qty)), base_quantity=int(float(return_qty)), location_id=branch_id,
                    reference_type="PURCHASE_RETURN", reference_id=return_id, reference_number=return_number,
                    reason=item_return_reason, notes=f"Purchase Return #{return_number} to {supplier['supplier_name']}",
                    created_by=user_id
                )
                InventoryService.record_stock_movement(db, movement_data)
        
        db.commit()
        return {"success": True, "return_id": return_id, "return_number": return_number,
                "debit_note_number": debit_note_no, "message": f"Purchase return {return_number} created successfully"}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating purchase return: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/test/validate/{return_id}")
@with_tenant_context
async def validate_purchase_return_data(
    return_id: int,
    _: dict = Depends(PermissionChecker("purchase_returns", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Validate that all fields in a purchase return are correctly populated.
    Returns detailed validation report with pass/fail status for each field.
    """
    try:
        # Fetch the return header
        header_query = text("""
            SELECT 
                return_id, return_number, return_date,
                supplier_invoice_id, grn_id, supplier_id,
                return_reason, detailed_reason,
                return_amount, tax_amount, total_amount,
                cgst_amount, sgst_amount, igst_amount,
                debit_note_number, debit_note_status,
                notes, created_by,
                created_at, updated_at
            FROM procurement.purchase_returns
            WHERE return_id = :return_id
        """)
        result = db.execute(header_query, {"return_id": return_id}).mappings().first()
        
        if not result:
            raise HTTPException(status_code=404, detail=f"Return {return_id} not found")
        
        header = dict(result)
        
        # Fetch return items
        items_query = text("""
            SELECT 
                return_item_id, return_id, grn_item_id,
                product_id, batch_id, batch_number,
                return_quantity, damaged_quantity, saleable_quantity,
                unit_price, return_value, tax_amount,
                item_return_reason, disposition,
                created_at
            FROM procurement.purchase_return_items
            WHERE return_id = :return_id
        """)
        items_result = db.execute(items_query, {"return_id": return_id}).mappings().all()
        items = [dict(item) for item in items_result]
        
        # Validation checks
        validations = {
            "header": {},
            "items": [],
            "summary": {"passed": 0, "failed": 0, "warnings": 0}
        }
        
        # Header validations
        header_checks = {
            "return_number": (header.get("return_number") is not None, "Return number assigned"),
            "return_date": (header.get("return_date") is not None, "Return date set"),
            "supplier_id": (header.get("supplier_id") is not None, "Supplier linked"),
            "return_reason": (header.get("return_reason") is not None, "Return reason specified"),
            "return_amount": (header.get("return_amount") and float(header.get("return_amount", 0)) > 0, "Return amount (subtotal) > 0"),
            "tax_amount": (header.get("tax_amount") is not None, "Tax amount calculated"),
            "total_amount": (header.get("total_amount") and float(header.get("total_amount", 0)) > 0, "Total amount > 0"),
            "cgst_or_igst": (
                (header.get("cgst_amount") and float(header.get("cgst_amount", 0)) > 0) or 
                (header.get("igst_amount") and float(header.get("igst_amount", 0)) > 0) or
                float(header.get("tax_amount", 0)) == 0,
                "Tax breakdown (CGST/SGST or IGST) populated"
            ),
            "debit_note_number": (header.get("debit_note_number") is not None, "Debit note number generated"),
            "amounts_match": (
                abs(float(header.get("return_amount", 0)) + float(header.get("tax_amount", 0)) - float(header.get("total_amount", 0))) < 0.01,
                "return_amount + tax_amount = total_amount"
            )
        }
        
        for field, (passed, description) in header_checks.items():
            validations["header"][field] = {
                "passed": passed,
                "description": description,
                "value": str(header.get(field.split("_")[0] if "_or_" not in field else field, "N/A"))
            }
            if passed:
                validations["summary"]["passed"] += 1
            else:
                validations["summary"]["failed"] += 1
        
        # Items validations
        for idx, item in enumerate(items):
            item_checks = {
                "product_id": (item.get("product_id") is not None, "Product linked"),
                "return_quantity": (item.get("return_quantity") and float(item.get("return_quantity", 0)) > 0, "Return qty > 0"),
                "unit_price": (item.get("unit_price") and float(item.get("unit_price", 0)) > 0, "Unit price > 0"),
                "return_value": (item.get("return_value") and float(item.get("return_value", 0)) > 0, "Return value calculated"),
                "tax_amount": (item.get("tax_amount") is not None, "Tax amount calculated"),
                "disposition": (item.get("disposition") in ["RESTOCK", "DESTROY", "QUARANTINE", "RETURN_TO_SUPPLIER"], "Valid disposition"),
                "qty_match": (
                    abs(float(item.get("damaged_quantity", 0)) + float(item.get("saleable_quantity", 0)) - float(item.get("return_quantity", 0))) < 0.01,
                    "damaged_qty + saleable_qty = return_qty"
                ),
                "value_calc": (
                    abs(float(item.get("return_quantity", 0)) * float(item.get("unit_price", 0)) - float(item.get("return_value", 0))) < 0.01,
                    "return_value = qty × unit_price"
                )
            }
            
            item_validation = {"item_id": item.get("return_item_id"), "checks": {}}
            for field, (passed, description) in item_checks.items():
                item_validation["checks"][field] = {
                    "passed": passed,
                    "description": description,
                    "value": str(item.get(field.split("_")[0] if field not in ["return_quantity", "unit_price", "return_value", "tax_amount", "qty_match", "value_calc"] else field, "N/A"))
                }
                if passed:
                    validations["summary"]["passed"] += 1
                else:
                    validations["summary"]["failed"] += 1
            
            validations["items"].append(item_validation)
        
        # Overall status
        validations["overall_status"] = "PASS" if validations["summary"]["failed"] == 0 else "FAIL"
        
        return {
            "return_id": return_id,
            "return_number": header.get("return_number"),
            "header_data": header,
            "items_data": items,
            "validations": validations
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating purchase return {return_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/test/return-methods")
async def get_purchase_return_methods():
    """
    Get all supported purchase return methods with descriptions.
    For testing and documentation purposes.
    """
    return {
        "return_methods": [
            {
                "value": "debit_note",
                "label": "Debit Note",
                "description": "Create debit note against supplier for future purchases",
                "financial_action": "Increases supplier debit balance",
                "approval_required": False
            },
            {
                "value": "replacement",
                "label": "Replacement",
                "description": "Request replacement goods from supplier (no financial transaction)",
                "financial_action": "None - goods exchange only",
                "approval_required": False
            },
            {
                "value": "refund",
                "label": "Refund",
                "description": "Request cash or bank refund from supplier",
                "financial_action": "Creates pending receivable",
                "approval_required": True
            }
        ]
    }