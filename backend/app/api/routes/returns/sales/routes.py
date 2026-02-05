"""
Sale Return API Router
Handles returns of sold items with inventory and ledger adjustments

MODERNIZED: Uses TenantAwareSession + centralized schemas from schemas/returns.py
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from datetime import datetime
from decimal import Decimal
import uuid

from .....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from .....core.auth.org_context import get_org_context, OrgContext
from .....core.security.permissions import PermissionChecker  # RBAC
from .....core.utils.constants import ReturnStatus, StockMovementType
from ....services.document_number_service import DocumentNumberService
from ....services.compliance.gst_service import GSTService
from ....services.inventory.inventory_service import InventoryService
from ....services.returns.return_service import ReturnService
from ....schemas.inventory.inventory import StockMovementCreate
from ....schemas.sales.returns import SalesReturnItem as ReturnItem, SalesReturnCreate as SaleReturnCreate
from .....core.utils.branch_utils import get_default_branch_id
from datetime import date

# Note: Schema classes moved to schemas/returns.py
# - ReturnItem (now SalesReturnItem)
# - SaleReturnCreate (now SalesReturnCreate)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["sale-returns"])

@router.get("/generate-number")
@with_tenant_context
async def generate_sales_return_number(
    _: dict = Depends(PermissionChecker("sales_returns", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Generate next sales return number using unified service"""
    try:
        org_id = str(context.org_id)
        # Use unified document number service
        new_number = DocumentNumberService.generate_number(db, "sales_return", org_id)
        return {"return_number": new_number}
    except Exception as e:
        logger.error(f"Failed to generate sales return number: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate return number: {str(e)}")

@router.get("/")
@with_tenant_context
async def get_sale_returns(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    party_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    _: dict = Depends(PermissionChecker("sales_returns", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    org_id = str(context.org_id)
    """
    Get list of sale returns with optional filters
    """
    try:
        # Use service method for list returns with filters
        return ReturnService.list_sales_returns(
            db=db,
            skip=skip,
            limit=limit,
            party_id=party_id,
            from_date=from_date,
            to_date=to_date
        )
        
    except Exception as e:
        logger.error(f"Error fetching sale returns: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/returnable-invoices")
@with_tenant_context
async def get_returnable_invoices(
    party_id: Optional[str] = None,
    invoice_number: Optional[str] = None,
    _: dict = Depends(PermissionChecker("sales_returns", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    org_id = str(context.org_id)
    """
    Get sales invoices that can be returned
    """
    try:
        # Use service method for returnable invoices
        return ReturnService.get_returnable_invoices(
            db=db,
            party_id=party_id,
            invoice_number=invoice_number
        )
        
    except Exception as e:
        logger.error(f"Error fetching returnable invoices: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/invoice/{invoice_id}/returns")
@with_tenant_context
async def get_returns_for_invoice(
    invoice_id: int,
    _: dict = Depends(PermissionChecker("sales_returns", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    org_id = str(context.org_id)
    """
    Get all returns for a specific invoice
    """
    try:
        # Use service method for invoice returns
        return ReturnService.get_returns_for_invoice(db=db, invoice_id=invoice_id)
        
    except Exception as e:
        logger.error(f"Error fetching returns for invoice: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/invoice/{invoice_id}/returnable-items")
@with_tenant_context
async def get_returnable_items(
    invoice_id: int,
    _: dict = Depends(PermissionChecker("sales_returns", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    org_id = str(context.org_id)
    """
    Get invoice items with accurate returnable quantities
    """
    try:
        # Use service method for returnable items
        return ReturnService.get_returnable_items(db=db, invoice_id=invoice_id)
        
    except Exception as e:
        logger.error(f"Error fetching returnable items: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/invoice/{invoice_id}/items")
@with_tenant_context
async def get_invoice_items_for_return(
    invoice_id: str,
    _: dict = Depends(PermissionChecker("sales_returns", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    org_id = str(context.org_id)
    """
    Get items from a specific invoice for return
    """
    try:
        # Use service method for invoice items with return info
        result = ReturnService.get_invoice_for_return(db=db, invoice_id=int(invoice_id))
        
        if not result:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching invoice items: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/")
@with_tenant_context
async def create_sale_return(
    return_data: SaleReturnCreate,
    _: dict = Depends(PermissionChecker("sales_returns", "create")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    org_id = str(context.org_id)
    """
    Create a new sale return and generate credit note if customer has GST
    """
    try:
        # Convert Pydantic model to dict for easier manipulation
        return_dict = return_data.dict()
        
        if not return_dict["items"]:
            raise HTTPException(
                status_code=400,
                detail="At least one item must be returned"
            )
            
        # Generate return number using unified service
        invoice_id = return_dict.get("invoice_id", "")
        return_number = DocumentNumberService.generate_number(db, "sales_return", org_id)
        
        # Get customer details to check for GST using service method
        customer = ReturnService.get_customer_for_return(db, return_dict["customer_id"])
        
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
            
        # Generate credit note number if customer has GST
        credit_note_no = None
        if customer.get("gst_number"):
            credit_note_no = f"CN-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        
        # Calculate totals using ReturnService (DRY)
        # Determine GST type automatically based on org state vs customer state
        gst_type = GSTService.determine_gst_type(
            db=db,
            org_id=context.org_id,
            customer_id=return_dict["customer_id"]
        )
        totals = ReturnService.calculate_return_totals(return_dict["items"], gst_type)
        
        subtotal = totals["subtotal"]
        tax_amount = totals["tax_amount"]
        cgst_amount = totals["cgst_amount"]
        sgst_amount = totals["sgst_amount"]
        igst_amount = totals["igst_amount"]
        total_amount = totals["total_amount"]
            
        # SECURITY FIX: Get branch_id and created_by from authenticated context
        # Previously: Random first user/branch from DB - now uses JWT-verified values
        branch_id = context.primary_branch_id  # User's assigned branch from JWT
        created_by = context.user_id  # Authenticated user from JWT
        
        # Fallback to org's default location if user has no branch assigned
        if not branch_id:
            try:
                branch_id = get_default_branch_id(db, org_id)
            except ValueError as e:
                logger.error(f"No default branch for org {org_id}: {e}")
                raise HTTPException(status_code=400, detail="No active branch found for organization")
        
        # Create return record using service method
        return_id = ReturnService.insert_sales_return(
            db=db,
            org_id=org_id,
            branch_id=branch_id,
            return_number=return_number,
            return_data=return_dict,
            totals=totals,
            credit_note_no=credit_note_no,
            created_by=created_by
        )
        
        # Create return items and update inventory
        for item in return_dict["items"]:
            # Get invoice_item_id if returning from invoice
            invoice_item_id = None
            if return_dict.get("invoice_id") and item.get("invoice_item_id"):
                invoice_item_id = item["invoice_item_id"]
            
            # Calculate item values
            return_qty = Decimal(str(item.get("return_quantity", item.get("quantity", 0))))
            free_qty = Decimal(str(item.get("free_quantity", 0)))
            unit_price = Decimal(str(item.get("rate", 0)))
            discount_percent = Decimal(str(item.get("discount_percent", 0)))
            
            # Calculate creditable quantity (only paid items get credit, not free items)
            creditable_qty = max(Decimal("0"), return_qty - free_qty)
            
            # Check if tax_percent was explicitly provided by frontend
            # Frontend can explicitly set tax_percent=0 to indicate "no GST return"
            tax_percent_provided = "tax_percent" in item and item["tax_percent"] is not None
            tax_percent = Decimal(str(item.get("tax_percent", 0)))
            
            # If this is from invoice and tax/discount NOT explicitly provided, fetch from original invoice item
            # This respects frontend's choice while providing fallback for missing values
            should_fetch_from_invoice = invoice_item_id and (
                (not tax_percent_provided) or 
                (discount_percent == 0 and "discount_percent" not in item)
            )
            
            if should_fetch_from_invoice:
                # Use service method for invoice item details
                invoice_item_details = ReturnService.get_invoice_item_details(db, invoice_item_id)
                
                if invoice_item_details:
                    # Only auto-fill if NOT explicitly provided by frontend
                    if not tax_percent_provided and invoice_item_details.get("gst_percent"):
                        tax_percent = Decimal(str(invoice_item_details["gst_percent"]))
                        logger.info(f"Fetched tax_percent {tax_percent}% from invoice item {invoice_item_id}")
                    if "discount_percent" not in item and invoice_item_details.get("discount_percent"):
                        discount_percent = Decimal(str(invoice_item_details["discount_percent"]))
                        logger.info(f"Fetched discount_percent {discount_percent}% from invoice item {invoice_item_id}")
            
            # Validate return quantity doesn't exceed invoice quantity using service
            if invoice_item_id:
                max_returnable, already_returned_qty = ReturnService.validate_return_quantity(
                    db, invoice_item_id, float(return_qty)
                )
                
                if return_qty > Decimal(str(max_returnable)):
                    product_name = item.get("product_name", "Product")
                    raise HTTPException(
                        status_code=400,
                        detail=f"Cannot return {return_qty} units of {product_name}. Maximum returnable: {max_returnable}"
                    )
            
            # Calculate return value - check for manual override first
            if "return_value" in item and item["return_value"] is not None:
                # Manual override - use frontend-provided value
                return_value = Decimal(str(item["return_value"]))
                logger.info(f"Using manual return_value override: {return_value}")
            else:
                # Auto-calculate using creditable_qty (excludes free items)
                return_calc = ReturnService.calculate_return_value(
                    creditable_qty, unit_price, discount_percent, tax_percent
                )
                return_value = return_calc["return_value"]
                logger.info(f"Calculated return_value: {return_value} (creditable_qty={creditable_qty}, free_qty={free_qty})")
            
            # Calculate tax using GSTService for consistency
            gst = GSTService.calculate_gst_components(return_value, tax_percent, "CGST/SGST")
            item_tax_amount = gst["total_tax_amount"]
            
            # Resolve batch using ReturnService (eliminates ~30 lines of inline code)
            batch_id, batch_number = ReturnService.resolve_batch(
                db,
                product_id=item["product_id"],
                batch_number=item.get("batch_number"),
                batch_id=item.get("batch_id"),
                source_item_id=invoice_item_id,
                source_type="sales_invoice"
            )
            
            # Determine disposition using ReturnService (eliminates ~20 lines of inline code)
            item_return_reason = item.get("reason") or item.get("return_reason") or return_dict.get("return_reason", "Quality Issue")
            should_restock = item.get("restock", None)
            
            disposition, is_damaged = ReturnService.determine_disposition(
                item_return_reason, explicit_restock=should_restock
            )
            
            # Set quantities based on disposition
            if is_damaged or should_restock is False:
                damaged_qty = float(return_qty)
                saleable_qty = 0
            else:
                damaged_qty = 0
                saleable_qty = float(return_qty)
            
            # Insert return item using service method
            ReturnService.insert_return_item(db, return_id, {
                "invoice_item_id": invoice_item_id,
                "product_id": item["product_id"],
                "batch_id": batch_id,
                "batch_number": batch_number,
                "return_quantity": float(return_qty),
                "uom": item.get("unit", item.get("uom", "PCS")),
                "damaged_quantity": damaged_qty,
                "saleable_quantity": saleable_qty,
                "unit_price": float(unit_price),
                "return_value": float(return_value),
                "tax_amount": float(item_tax_amount),
                "item_return_reason": item_return_reason,
                "disposition": disposition
            })
            
            # Update batch stock using service method
            ReturnService.update_batch_for_return(
                db=db,
                batch_id=batch_id,
                product_id=item["product_id"],
                saleable_qty=saleable_qty,
                total_qty=float(return_qty)
            )
            
            # Track inventory movement for return using InventoryService
            if batch_id or item["product_id"]:
                movement_quantity = float(return_qty)
                movement_type = 'RETURN' if saleable_qty > 0 else 'RETURN_DAMAGED'
                
                # Create movement note based on whether we have invoice
                movement_note = f"Return #{return_number}"
                if invoice_id:
                    movement_note = f"Return #{return_number} from Invoice ID: {invoice_id}"
                
                # Use InventoryService for stock movement
                movement_data = StockMovementCreate(
                    org_id=uuid.UUID(org_id) if isinstance(org_id, str) else org_id,
                    product_id=item["product_id"],
                    batch_id=batch_id,
                    movement_type=movement_type,
                    movement_direction="in",
                    movement_date=date.today(),
                    quantity=int(movement_quantity),
                    base_quantity=int(movement_quantity),
                    location_id=branch_id,
                    reference_type="SALES_RETURN",
                    reference_id=return_id,
                    reference_number=return_number,
                    reason=item_return_reason,
                    notes=movement_note,
                    created_by=created_by
                )
                
                InventoryService.record_stock_movement(db, movement_data)
                
        # Update customer ledger based on return_method
        return_method = return_dict.get("return_method") or return_dict.get("return_type") or "credit_note"
        ledger_result = ReturnService.update_customer_credit_balance(
            db=db,
            customer_id=return_dict["customer_id"],
            amount=float(total_amount),
            return_method=return_method,
            return_number=return_number
        )
            
        db.commit()
        
        return {
            "status": "success",
            "return_id": return_id,
            "return_number": return_number,
            "return_method": return_method,
            "credit_note_no": credit_note_no,
            "total_amount": float(total_amount),
            "has_gst": bool(customer.get("gst_number")),
            "ledger_action": ledger_result.get("action"),
            "customer_outstanding": ledger_result.get("current_outstanding"),
            "message": f"Sale return {return_number} created successfully" + (f" with credit note {credit_note_no}" if credit_note_no else "")
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating sale return: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{return_id}")
@with_tenant_context
async def get_sale_return_detail(
    return_id: str,
    _: dict = Depends(PermissionChecker("sales_returns", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    org_id = str(context.org_id)
    """
    Get detailed information about a specific sale return
    """
    try:
        # Use service method for return detail
        result = ReturnService.get_return_detail(db=db, return_id=return_id)
        
        if not result:
            raise HTTPException(status_code=404, detail="Sale return not found")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching sale return detail: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{return_id}")
@with_tenant_context
async def cancel_sale_return(
    return_id: str,
    _: dict = Depends(PermissionChecker("sales_returns", "delete")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    org_id = str(context.org_id)
    """
    Cancel a sale return (if allowed by business rules)
    """
    try:
        # Check if return exists using service method
        sale_return = ReturnService.get_return_status(db, int(return_id))
        
        if not sale_return:
            raise HTTPException(status_code=404, detail="Sale return not found")
            
        if sale_return.get("return_status") == ReturnStatus.CANCELLED.value:
            raise HTTPException(status_code=400, detail="Return already cancelled")
        
        # Use service method to cancel and reverse inventory
        ReturnService.cancel_sales_return(
            db=db,
            return_id=return_id,
            return_number=sale_return.get("return_number")
        )
        
        db.commit()
        
        return {
            "status": "success",
            "message": f"Sale return {sale_return.get('return_number')} cancelled successfully"
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error cancelling sale return: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== TEST ENDPOINTS ====================

@router.get("/test/verify-return/{return_id}")
@with_tenant_context
async def verify_return_flow(
    return_id: int,
    _: dict = Depends(PermissionChecker("sales_returns", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Test endpoint to verify return was processed correctly.
    Returns all related data for verification:
    - Return record with return_method
    - Return items
    - Customer credit balance
    - Inventory movements
    """
    try:
        result = ReturnService.get_return_with_ledger_info(db, return_id)
        
        if not result:
            raise HTTPException(status_code=404, detail="Return not found")
        
        return {
            "status": "success",
            "verification": result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying return: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/test/return-methods")
async def get_return_methods():
    """
    Get all supported return methods with descriptions.
    For testing and documentation purposes.
    """
    return {
        "return_methods": [
            {
                "value": "credit_note",
                "label": "Credit Note",
                "description": "Add amount to customer's credit balance for future purchases",
                "financial_action": "Increases customer credit_balance",
                "approval_required": False
            },
            {
                "value": "replacement",
                "label": "Replacement",
                "description": "Issue replacement goods (no financial transaction)",
                "financial_action": "None - goods exchange only",
                "approval_required": False
            },
            {
                "value": "refund",
                "label": "Cash/Bank Refund",
                "description": "Issue cash or bank transfer refund",
                "financial_action": "Creates pending payment voucher",
                "approval_required": True
            },
            {
                "value": "no_adjustment",
                "label": "No Adjustment",
                "description": "Return for inventory purposes only (no financial impact)",
                "financial_action": "None",
                "approval_required": False
            }
        ]
    }