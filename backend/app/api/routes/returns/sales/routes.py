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
from ....services.finance.credit_note.service import CreditNoteService  # Finance integration
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
            to_date=to_date,
            org_id=org_id
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
            invoice_number=invoice_number,
            org_id=org_id
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
            credit_note_no = DocumentNumberService.generate_number(db, "credit_note", org_id)
        
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
        
        # ====================================================================
        # BULK PROCESSING - Prepare all items in memory, then execute bulk DB ops
        # This replaces the per-item loop for ~10x performance improvement
        # ====================================================================
        
        # Step 0: Validate return quantities against invoice (prevent over-returns)
        if return_dict.get("invoice_id"):
            for item in return_dict["items"]:
                invoice_item_id = item.get("invoice_item_id")
                if invoice_item_id:
                    return_qty = float(item.get("return_quantity", item.get("quantity", 0)))
                    max_returnable, already_returned = ReturnService.validate_return_quantity(
                        db, invoice_item_id, return_qty
                    )
                    if return_qty > max_returnable:
                        product_name = item.get("product_name", f"product {item.get('product_id')}")
                        raise HTTPException(
                            status_code=400,
                            detail=f"Return quantity ({return_qty}) exceeds returnable quantity ({max_returnable}) "
                                   f"for {product_name}. Already returned: {already_returned}."
                        )

        # Step 1: Prepare all items for bulk operations
        prepared_items = []
        for item in return_dict["items"]:
            # Get invoice_item_id if returning from invoice
            invoice_item_id = item.get("invoice_item_id") if return_dict.get("invoice_id") else None

            # Resolve batch_id from invoice item if frontend didn't send it
            item_batch_id = item.get("batch_id")
            item_batch_number = item.get("batch_number")
            if not item_batch_id and invoice_item_id:
                item_batch_id, item_batch_number = ReturnService.resolve_batch(
                    db, item["product_id"],
                    batch_number=item_batch_number,
                    batch_id=item_batch_id,
                    source_item_id=invoice_item_id,
                    source_type="sales_invoice"
                )

            # Calculate item values
            return_qty = Decimal(str(item.get("return_quantity", item.get("quantity", 0))))
            free_qty = Decimal(str(item.get("free_quantity", 0)))
            unit_price = Decimal(str(item.get("unit_price", item.get("rate", 0))))
            discount_percent = Decimal(str(item.get("discount_percent", 0)))
            tax_percent = Decimal(str(item.get("tax_percent", 0)))

            # Calculate creditable quantity (only paid items get credit, not free items)
            creditable_qty = max(Decimal("0"), return_qty - free_qty)

            # Calculate return value - check for manual override first
            if "return_value" in item and item["return_value"] is not None:
                return_value = Decimal(str(item["return_value"]))
            else:
                return_calc = ReturnService.calculate_return_value(
                    creditable_qty, unit_price, discount_percent, tax_percent
                )
                return_value = return_calc["return_value"]

            # Calculate tax using GSTService for consistency
            gst = GSTService.calculate_gst_components(return_value, tax_percent, gst_type)
            item_tax_amount = gst["total_tax_amount"]
            item_cgst = float(gst["cgst_amount"])
            item_sgst = float(gst["sgst_amount"])
            item_igst = float(gst["igst_amount"])

            # Determine disposition
            item_return_reason = item.get("reason") or item.get("return_reason") or return_dict.get("return_reason", "Quality Issue")
            should_restock = item.get("restock", None)
            disposition, is_damaged = ReturnService.determine_disposition(
                item_return_reason, explicit_restock=should_restock
            )

            # Set quantities based on disposition
            if is_damaged or should_restock is False:
                damaged_qty = round(float(return_qty), 2)
                saleable_qty = 0
            else:
                damaged_qty = 0
                saleable_qty = round(float(return_qty), 2)

            # Prepare item for bulk insert — all monetary values rounded to 2 decimals
            prepared_items.append({
                "invoice_item_id": invoice_item_id,
                "product_id": item["product_id"],
                "batch_id": int(item_batch_id) if item_batch_id and str(item_batch_id).isdigit() else None,
                "batch_number": item_batch_number,
                "return_quantity": round(float(return_qty), 2),
                "uom": item.get("unit", item.get("uom", "PCS")),
                "damaged_quantity": damaged_qty,
                "saleable_quantity": saleable_qty,
                "unit_price": round(float(unit_price), 2),
                "return_value": round(float(return_value), 2),
                "tax_amount": round(float(item_tax_amount), 2),
                "cgst_amount": round(item_cgst, 2),
                "sgst_amount": round(item_sgst, 2),
                "igst_amount": round(item_igst, 2),
                "item_return_reason": item_return_reason,
                "disposition": disposition
            })
        
        # Recompute header totals from prepared items (RET-11)
        # calculate_return_totals uses full return_quantity, but per-item values use
        # creditable_qty (excluding free items). Header must match sum of items.
        subtotal = round(sum(item["return_value"] for item in prepared_items), 2)
        tax_amount = round(sum(item["tax_amount"] for item in prepared_items), 2)
        total_amount = round(subtotal + tax_amount, 2)
        cgst_amount = round(sum(item["cgst_amount"] for item in prepared_items), 2)
        sgst_amount = round(sum(item["sgst_amount"] for item in prepared_items), 2)
        igst_amount = round(sum(item["igst_amount"] for item in prepared_items), 2)
        total_return_quantity = round(sum(item["return_quantity"] for item in prepared_items), 2)

        totals = {
            "subtotal": subtotal,
            "tax_amount": tax_amount,
            "total_amount": total_amount,
            "cgst_amount": cgst_amount,
            "sgst_amount": sgst_amount,
            "igst_amount": igst_amount,
            "total_return_quantity": total_return_quantity
        }

        # Update header record with corrected totals (header was inserted before item prep)
        db.execute(text("""
            UPDATE sales.sales_returns
            SET return_amount = :subtotal, tax_amount = :tax_amount,
                total_amount = :total_amount, pending_amount = :total_amount,
                cgst_amount = :cgst_amount, sgst_amount = :sgst_amount,
                igst_amount = :igst_amount, return_quantity = :return_quantity
            WHERE return_id = :return_id
        """), {
            "subtotal": subtotal, "tax_amount": tax_amount,
            "total_amount": total_amount, "cgst_amount": cgst_amount,
            "sgst_amount": sgst_amount, "igst_amount": igst_amount,
            "return_quantity": total_return_quantity, "return_id": return_id
        })

        # Step 2: Execute bulk operations (3 DB queries instead of ~48)
        ReturnService.bulk_insert_return_items(db, return_id, prepared_items)
        ReturnService.bulk_update_batch_stock(db, prepared_items)
        ReturnService.bulk_record_stock_movements(
            db, org_id, return_id, return_number, prepared_items, branch_id, created_by
        )
                
        # Update customer ledger based on return_method
        return_method = return_dict.get("return_method") or return_dict.get("return_type") or "credit_note"
        
        # Use Finance module for credit note creation + outstanding update
        # This ensures proper audit trail in financial.credit_notes
        if return_method == "credit_note":
            ledger_result = CreditNoteService.create_credit_note_for_return(
                db=db,
                org_id=org_id,
                branch_id=branch_id,
                customer_id=return_dict["customer_id"],
                return_id=return_id,
                return_number=return_number,
                credit_amount=float(subtotal),
                tax_amount=float(tax_amount),
                cgst_amount=float(cgst_amount),
                sgst_amount=float(sgst_amount),
                igst_amount=float(igst_amount),
                reason_code=return_dict.get("return_reason", "NOT_REQUIRED"),
                reason=return_dict.get("notes", ""),
                invoice_id=return_dict.get("invoice_id"),
                invoice_number=return_dict.get("invoice_number"),
                return_date=return_dict.get("return_date", str(date.today())),
                is_gst_applicable=bool(customer.get("gst_number")),
                created_by=created_by
            )
            # Use the credit note number from Finance service
            credit_note_no = ledger_result.get("credit_note_number", credit_note_no)
            
            # Sync credit note number back to sales_returns table
            db.execute(text("""
                UPDATE sales.sales_returns 
                SET credit_note_number = :credit_note_no
                WHERE return_id = :return_id
            """), {"credit_note_no": credit_note_no, "return_id": return_id})
        else:
            # For replacement/refund methods, use legacy approach (no credit note)
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
            "credit_note_id": ledger_result.get("credit_note_id"),
            "total_amount": float(total_amount),
            "has_gst": bool(customer.get("gst_number")),
            "ledger_action": ledger_result.get("action"),
            "previous_outstanding": ledger_result.get("previous_outstanding"),
            "customer_outstanding": ledger_result.get("new_outstanding") or ledger_result.get("current_outstanding"),
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
        result = ReturnService.get_return_detail(db=db, return_id=return_id, org_id=org_id)
        
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
            
        if sale_return.get("approval_status") == "cancelled":
            raise HTTPException(status_code=400, detail="Return already cancelled")
        
        # Use service method to cancel and reverse all side effects
        ReturnService.cancel_sales_return(
            db=db,
            return_id=return_id,
            return_number=sale_return.get("return_number"),
            org_id=org_id
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

@router.get("/test/validate/{return_id}")
@with_tenant_context
async def validate_sales_return_data(
    return_id: int,
    _: dict = Depends(PermissionChecker("sales_returns", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Validate that all fields in a sales return are correctly populated.
    Returns detailed validation report with pass/fail status for each field.
    """
    try:
        # Fetch the return header
        header_query = text("""
            SELECT 
                return_id, return_number, return_date,
                invoice_id, customer_id,
                return_reason, return_category, return_quantity,
                return_amount, tax_amount, total_amount,
                cgst_amount, sgst_amount, igst_amount,
                credit_note_number, credit_note_status,
                adjusted_amount, pending_amount,
                approval_status, notes, created_by,
                created_at, updated_at
            FROM sales.sales_returns
            WHERE return_id = :return_id
        """)
        result = db.execute(header_query, {"return_id": return_id}).mappings().first()
        
        if not result:
            raise HTTPException(status_code=404, detail=f"Return {return_id} not found")
        
        header = dict(result)
        
        # Fetch return items
        items_query = text("""
            SELECT 
                return_item_id, return_id, invoice_item_id,
                product_id, batch_id, batch_number,
                return_quantity, unit_price, return_value,
                tax_percent, tax_amount, total_amount,
                disposition, is_damaged, return_reason,
                created_at
            FROM sales.sales_return_items
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
            "customer_id": (header.get("customer_id") is not None, "Customer linked"),
            "return_reason": (header.get("return_reason") is not None, "Return reason specified"),
            "return_quantity": (header.get("return_quantity") and float(header.get("return_quantity", 0)) > 0, "Return quantity > 0"),
            "return_amount": (header.get("return_amount") and float(header.get("return_amount", 0)) > 0, "Return amount (subtotal) > 0"),
            "tax_amount": (header.get("tax_amount") is not None, "Tax amount calculated"),
            "total_amount": (header.get("total_amount") and float(header.get("total_amount", 0)) > 0, "Total amount > 0"),
            "cgst_or_igst": (
                (header.get("cgst_amount") and float(header.get("cgst_amount", 0)) > 0) or 
                (header.get("igst_amount") and float(header.get("igst_amount", 0)) > 0) or
                float(header.get("tax_amount", 0)) == 0,
                "Tax breakdown (CGST/SGST or IGST) populated"
            ),
            "credit_note_number": (header.get("credit_note_number") is not None, "Credit note number generated"),
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
                "total_amount": (item.get("total_amount") and float(item.get("total_amount", 0)) > 0, "Total amount > 0"),
                "disposition": (item.get("disposition") in ["RESTOCK", "DESTROY", "QUARANTINE"], "Valid disposition"),
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
                    "value": str(item.get(field.split("_")[0] if field not in ["return_quantity", "unit_price", "return_value", "tax_amount", "total_amount", "value_calc"] else field, "N/A"))
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
        logger.error(f"Error validating return {return_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))