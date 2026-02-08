"""
Purchase Order Management
Handles purchase orders, supplier invoices, and goods receipt

MODERNIZED: Uses TenantAwareSession + PermissionChecker
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from ....services.document_number_service import DocumentNumberService
from ....services.compliance.gst_service import GSTService
from ....services.purchase.order.order_service import PurchaseOrderService
from ....services.purchase.order.order_repository import PurchaseOrderRepository
from ....services.master.product.service import ProductService
from datetime import datetime
from decimal import Decimal

# Modern imports - fully modernized
from .....core.auth.tenant_service import TenantAwareSession, get_tenant_aware_db, with_tenant_context
from .....core.auth.org_context import OrgContext, get_org_context
from .....core.security.permissions import PermissionChecker
from .....core.utils.constants import (
    ProductDefaults, PackDefaults, PricingDefaults, DateDefaults,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Purchases"])

@router.post("/search-products")
@with_tenant_context
async def search_products_for_purchase(
    search_data: dict,
    _: dict = Depends(PermissionChecker("procurement", "view")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Search for existing products before creating purchase entry
    Returns matching products with their latest batch info
    """
    try:
        product_name = search_data.get("product_name", "").strip()
        # Use ProductService for centralized product search logic
        return ProductService.search_for_purchase(db, str(context.org_id), product_name)
        
    except Exception as e:
        logger.error(f"Error searching products: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/validate-items")
@with_tenant_context
async def validate_purchase_items(
    items_data: dict,
    _: dict = Depends(PermissionChecker("procurement", "view")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Validate purchase items before creating entry
    Check for existing products and suggest matches
    """
    try:
        items = items_data.get("items", [])
        # Use ProductService for batch validation (N+1 → 1 query)
        return ProductService.validate_purchase_items(db, str(context.org_id), items)
        
    except Exception as e:
        logger.error(f"Error validating purchase items: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/")
@with_tenant_context
async def get_purchases(
    skip: int = Query(0, description="Skip records"),
    limit: int = Query(25, description="Limit records"),
    offset: int = Query(0, description="Offset records"),
    search: Optional[str] = Query(None, description="Search term"),
    status: Optional[str] = Query(None, description="Filter by PO status"),
    supplier_id: Optional[int] = Query(None, description="Filter by supplier"),
    dateFilter: Optional[str] = Query(None, description="Date filter"),
    _: dict = Depends(PermissionChecker("procurement", "view")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get list of purchase orders with pagination and filtering"""
    try:
        # Use service layer instead of inline SQL
        return PurchaseOrderService.list_orders(
            db=db,
            org_id=str(context.org_id),
            skip=offset if offset else skip,
            limit=limit,
            search=search,
            status=status,
            supplier_id=supplier_id,
            date_filter=dateFilter
        )
        
    except Exception as e:
        logger.error(f"Error fetching purchases: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch purchases: {str(e)}")

@router.post("/direct-entry")
@with_tenant_context
async def create_direct_purchase_entry(
    purchase_data: dict,
    _: dict = Depends(PermissionChecker("procurement", "create")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Direct Purchase Entry (Bill Entry) - When goods are received with supplier invoice
    This creates supplier invoice and adds stock to inventory via batches
    For users who don't need separate PO workflow
    """
    try:
        # Use service layer for all database operations
        result = PurchaseOrderService.create_direct_entry(
            db=db,
            org_id=str(context.org_id),
            branch_id=context.branch_id,
            purchase_data=purchase_data
        )
        
        db.commit()
        
        return {
            "success": True,
            "po_id": result["purchase_order_id"],
            "po_number": result["po_number"],
            "message": f"Purchase {result['po_number']} created with {result['items_created']} items and {result['batches_created']} batches"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error in direct purchase entry: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/purchase-entry")
@with_tenant_context
async def create_purchase_entry(
    purchase_data: dict,
    _: dict = Depends(PermissionChecker("procurement", "create")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Create a purchase entry (supplier invoice) with line items
    This is for recording completed purchases/bills from suppliers
    Enhanced to handle all required fields including selling prices
    """
    # Ensure clean transaction state
    try:
        db.rollback()  # Clear any aborted transaction
    except:
        pass
    
    try:
        # Generate invoice number if not provided
        invoice_number = purchase_data.get("invoice_number")
        if not invoice_number:
            invoice_number = DocumentNumberService.generate_number(db, "supplier_invoice", str(context.org_id))
        
        invoice_date = purchase_data.get("invoice_date", purchase_data.get("purchase_date", datetime.now().date()))
        
        # Get supplier name - use PurchaseOrderService for centralized lookup
        supplier_name = None
        if purchase_data.get("supplier_id"):
            supplier_name = PurchaseOrderService.get_supplier_name(db, purchase_data.get("supplier_id"), str(context.org_id))
        
        # Get created_by from JWT token user_id or use default via service
        created_by = purchase_data.get("created_by") or context.user_id
        if not created_by:
            created_by = PurchaseOrderService.get_default_user(db, str(context.org_id))
        if not created_by:
            raise HTTPException(status_code=400, detail="User context required for purchase entry")
        
        # Get branch_id from JWT token or use default via service
        branch_id = context.branch_id
        if branch_id is None:
            branch_id = PurchaseOrderService.get_default_branch(db, str(context.org_id))
            if not branch_id:
                raise HTTPException(status_code=400, detail="No active branch found for organization")
        logger.info(f"Using branch_id {branch_id} for user {context.user_id}")
        
        # Create supplier invoice using service
        invoice_data = {
            "invoice_number": invoice_number,
            "invoice_date": invoice_date,
            "supplier_id": purchase_data.get("supplier_id"),
            "subtotal": Decimal(str(purchase_data.get("subtotal_amount", 0))),
            "discount": Decimal(str(purchase_data.get("discount_amount", 0))),
            "taxable": Decimal(str(purchase_data.get("taxable_amount", purchase_data.get("subtotal_amount", 0) - purchase_data.get("discount_amount", 0)))),
            "cgst": Decimal(str(purchase_data.get("cgst_amount", purchase_data.get("tax_amount", 0) / 2))),
            "sgst": Decimal(str(purchase_data.get("sgst_amount", purchase_data.get("tax_amount", 0) / 2))),
            "igst": Decimal(str(purchase_data.get("igst_amount", 0))),
            "tax": Decimal(str(purchase_data.get("tax_amount", 0))),
            "freight": Decimal(str(purchase_data.get("freight_charges", 0))),
            "insurance": Decimal(str(purchase_data.get("insurance_charges", 0))),
            "other": Decimal(str(purchase_data.get("other_charges", 0))),
            "round_off": Decimal(str(purchase_data.get("round_off_amount", 0))),
            "total": Decimal(str(purchase_data.get("final_amount", 0))),
            "payment_terms": purchase_data.get("payment_terms", "immediate"),
            "due_date": purchase_data.get("due_date", invoice_date),
            "payment_status": purchase_data.get("payment_status", "pending"),
            "invoice_status": "posted"
        }
        
        supplier_invoice_id = PurchaseOrderService.create_supplier_invoice(
            db=db,
            org_id=str(context.org_id),
            branch_id=branch_id,
            invoice_data=invoice_data,
            created_by=created_by
        )
        
        # Create supplier invoice items
        items = purchase_data.get("items", [])
        items_created = 0
        grn_items = []  # Collect items for auto-GRN creation
        
        # Log the received data for debugging
        logger.info(f"Processing {len(items)} items for purchase entry")
        
        # OPTIMIZATION: Batch fetch all existing products BEFORE the loop using repository
        product_names = [item.get("product_name") for item in items if item.get("product_name") and not item.get("product_id")]
        product_lookup = {}
        if product_names:
            product_lookup = PurchaseOrderRepository.lookup_products_by_name(
                db, str(context.org_id), product_names
            )
        
        # OPTIMIZATION: Get default category ONCE before loop using repository
        default_category_id = PurchaseOrderRepository.get_default_category(db, str(context.org_id))
        
        for idx, item in enumerate(items):
            logger.info(f"Item {idx + 1}: {item}")
            # Get or create product_id if not provided
            product_id = item.get("product_id")
            product_name = item.get("product_name")
            
            if not product_id and product_name:
                # OPTIMIZED: Use pre-fetched lookup instead of per-item query
                name_key = product_name.lower().strip()
                if name_key in product_lookup:
                    product_id = product_lookup[name_key]
                    logger.info(f"Found existing product: {product_name} (ID: {product_id})")
                else:
                    # Use centralized ProductService for consistent product creation
                    product_id = ProductService.get_or_create_product(
                        db=db,
                        org_id=str(context.org_id),
                        product_name=product_name,
                        hsn_code=item.get("hsn_code"),
                        user_id=getattr(context, 'user_id', None)
                    )
                    product_lookup[name_key] = product_id
                    logger.info(f"Created/found product: {product_name} (ID: {product_id})")
            
            # Resolve HSN from product record if not provided by frontend
            item_hsn = item.get("hsn_code")
            if not item_hsn and product_id:
                prod_row = db.execute(text(
                    "SELECT hsn_code FROM inventory.products WHERE product_id = :pid"
                ), {"pid": product_id}).fetchone()
                item_hsn = prod_row.hsn_code if prod_row and prod_row.hsn_code else None

            # Calculate item totals
            quantity = Decimal(str(item.get("ordered_quantity", item.get("quantity", 0))))
            cost_price = Decimal(str(item.get("cost_price", item.get("unit_price", 0))))
            discount_percent = Decimal(str(item.get("discount_percent", 0)))
            tax_percent = Decimal(str(item.get("tax_percent", 0)))

            # Calculate amounts
            subtotal = quantity * cost_price
            discount_amount = subtotal * discount_percent / 100
            taxable_amount = subtotal - discount_amount
            tax_amount = taxable_amount * tax_percent / 100
            total_price = taxable_amount + tax_amount

            # Use GSTService for consistent GST split
            gst = GSTService.calculate_gst_components(taxable_amount, tax_percent, "CGST/SGST")
            cgst_percent = gst["cgst_percent"]
            sgst_percent = gst["sgst_percent"]
            igst_percent = gst["igst_percent"]
            cgst_amount = gst["cgst_amount"]
            sgst_amount = gst["sgst_amount"]
            igst_amount = gst["igst_amount"]

            # Generate batch number if not provided
            batch_number = item.get("batch_number")
            if not batch_number or batch_number.strip() == "":
                import uuid
                batch_number = f"BATCH{datetime.now().strftime('%y%m')}{str(uuid.uuid4().int % 10000).zfill(4)}"

            # Calculate pricing values
            mrp_value = Decimal(str(item.get("mrp", 0)))
            if mrp_value == 0:
                mrp_value = cost_price * Decimal(str(PricingDefaults.MRP_FROM_COST))  # Default MRP markup

            # Selling price (PTR/PTS in pharma)
            selling_price = Decimal(str(item.get("selling_price", 0)))
            if selling_price == 0:
                # Default selling price is 90% of MRP
                selling_price = mrp_value * Decimal(str(PricingDefaults.SELLING_FROM_MRP))

            # Always create batch for inventory tracking
            batch_id = None
            # Use expiry_date if provided, otherwise set to 2 years from now (default for pharma)
            expiry_date = item.get("expiry_date")
            if not expiry_date:
                from datetime import timedelta
                expiry_date = (datetime.now() + timedelta(days=DateDefaults.EXPIRY_DAYS_LONG)).date()

            # Create batch using repository
            batch_data = {
                "product_id": product_id,
                "batch_number": batch_number,
                "expiry_date": expiry_date,
                "quantity": quantity,
                "cost_price": cost_price,
                "mrp": mrp_value,
                "selling_price": selling_price,
                "pack_type": item.get("pack_type", PackDefaults.PACK_TYPE),
                "pack_size": item.get("pack_size", PackDefaults.PACK_SIZE),
                "pack_uom": item.get("pack_type", PackDefaults.PACK_TYPE),
                "base_uom": item.get("uom", ProductDefaults.DEFAULT_BASE_UOM),
                "units_per_pack": item.get("pack_size", PackDefaults.PACK_SIZE)
            }
            batch_id = PurchaseOrderRepository.create_purchase_batch(
                db, str(context.org_id), batch_data
            )
            logger.info(f"Batch {batch_id} created for product {product_id}")

            # Note: Pricing is stored at batch level, not product level
            # Each batch can have different MRP and cost prices

            # Create supplier invoice item using repository
            invoice_item = {
                "product_id": product_id,
                "batch_id": batch_id,
                "batch_number": batch_number,
                "quantity": quantity,
                "free_quantity": item.get("free_quantity", 0),
                "unit_price": cost_price,
                "discount_percent": discount_percent,
                "discount_amount": discount_amount,
                "taxable_amount": taxable_amount,
                "cgst_percent": cgst_percent,
                "sgst_percent": sgst_percent,
                "igst_percent": igst_percent,
                "cgst_amount": cgst_amount,
                "sgst_amount": sgst_amount,
                "igst_amount": igst_amount,
                "total_amount": total_price,
                "hsn_code": item_hsn,
                "unit": item.get("uom", ProductDefaults.DEFAULT_BASE_UOM),
                "pack_type": item.get("pack_type", PackDefaults.PACK_TYPE),
                "pack_size": item.get("pack_size", PackDefaults.PACK_SIZE)
            }
            PurchaseOrderRepository.create_supplier_invoice_item(
                db, supplier_invoice_id, invoice_item
            )
            
            items_created += 1
            # Collect item data for GRN
            grn_items.append({
                "po_item_id": item.get("po_item_id"),
                "product_id": product_id,
                "batch_number": batch_number,
                "expiry_date": expiry_date,
                "manufacturing_date": item.get("manufacturing_date"),
                "quantity": quantity,
                "ordered_quantity": item.get("ordered_quantity", quantity),
                "free_quantity": item.get("free_quantity", 0),
                "uom": item.get("uom", ProductDefaults.DEFAULT_BASE_UOM),
                "pack_type": item.get("pack_type", PackDefaults.PACK_TYPE),
                "pack_size": item.get("pack_size", PackDefaults.PACK_SIZE),
                "cost_price": cost_price,
                "mrp": mrp_value
            })

        # --- Auto-create GRN as audit log ---
        purchase_order_id = purchase_data.get("purchase_order_id")
        grn_number = DocumentNumberService.generate_number(db, "grn", str(context.org_id))
        source = 'PO' if purchase_order_id else 'DIRECT'

        grn_id = PurchaseOrderRepository.create_auto_grn(
            db=db,
            org_id=str(context.org_id),
            branch_id=branch_id,
            grn_number=grn_number,
            supplier_id=purchase_data.get("supplier_id"),
            supplier_invoice_id=supplier_invoice_id,
            supplier_invoice_number=invoice_number,
            items=grn_items,
            created_by=created_by,
            purchase_order_id=purchase_order_id,
            source=source
        )

        # --- If linked to a PO, update received quantities and PO status ---
        po_status = None
        if purchase_order_id:
            # Link PO to supplier invoice
            db.execute(text("""
                UPDATE procurement.supplier_invoices
                SET purchase_order_ids = array_append(COALESCE(purchase_order_ids, ARRAY[]::integer[]), :po_id)
                WHERE supplier_invoice_id = :inv_id
            """), {"po_id": purchase_order_id, "inv_id": supplier_invoice_id})

            # Update received quantities on PO items
            for grn_item in grn_items:
                if grn_item.get("po_item_id"):
                    PurchaseOrderRepository.increment_received_quantity(
                        db, grn_item["po_item_id"], Decimal(str(grn_item["quantity"]))
                    )

            # Compute and update PO status
            po_status = PurchaseOrderRepository.compute_and_update_po_status(db, purchase_order_id)

        db.commit()

        result = {
            "invoice_id": supplier_invoice_id,
            "invoice_number": invoice_number,
            "grn_id": grn_id,
            "grn_number": grn_number,
            "items_created": items_created,
            "message": "Purchase entry created successfully"
        }
        if purchase_order_id:
            result["purchase_order_id"] = purchase_order_id
            result["po_status"] = po_status
        return result

    except Exception as e:
        db.rollback()
        logger.error(f"Error creating purchase entry: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create purchase entry: {str(e)}")

@router.post("/with-items")
@with_tenant_context
async def create_purchase_with_items(
    purchase_data: dict,
    _: dict = Depends(PermissionChecker("procurement", "create")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Create a purchase order with line items
    Supports both manual entry and parsed invoice data
    """
    # Ensure clean transaction state
    try:
        db.rollback()  # Clear any aborted transaction
    except:
        pass
    
    try:
        # Generate purchase number
        purchase_number = DocumentNumberService.generate_number(db, "purchase_order", str(context.org_id))
        
        # Get supplier name - use PurchaseOrderService for centralized lookup
        supplier_name = None
        if purchase_data.get("supplier_id"):
            supplier_name = PurchaseOrderService.get_supplier_name(db, purchase_data.get("supplier_id"), str(context.org_id))
        
        # Get created_by from JWT token user_id or use default via service
        created_by = purchase_data.get("created_by") or context.user_id
        if not created_by:
            created_by = PurchaseOrderService.get_default_user(db, str(context.org_id))
        if not created_by:
            raise HTTPException(status_code=400, detail="User context required for purchase order")
        
        # Get branch_id from JWT token or use default via service
        branch_id = context.branch_id
        if branch_id is None:
            branch_id = PurchaseOrderService.get_default_branch(db, str(context.org_id))
            if not branch_id:
                raise HTTPException(status_code=400, detail="No active branch found for organization")
        logger.info(f"Using branch_id {branch_id} for user {context.user_id}")
        
        # Create purchase header using repository
        order_data = {
            "purchase_number": purchase_number,
            "po_date": purchase_data.get("purchase_date", datetime.now().date()),
            "supplier_id": purchase_data.get("supplier_id"),
            "supplier_name": supplier_name,
            "subtotal": Decimal(str(purchase_data.get("subtotal_amount", 0))),
            "discount": Decimal(str(purchase_data.get("discount_amount", 0))),
            "tax": Decimal(str(purchase_data.get("tax_amount", 0))),
            "other_charges": Decimal(str(purchase_data.get("other_charges", 0))),
            "total": Decimal(str(purchase_data.get("final_amount", 0))),
            "status": purchase_data.get("purchase_status", "draft"),
            "payment_mode": purchase_data.get("payment_mode", "cash"),
            "notes": purchase_data.get("notes")
        }
        purchase_id = PurchaseOrderRepository.create_po_header_simple(
            db, str(context.org_id), branch_id, order_data, created_by
        )

        # Create purchase items if provided
        items = purchase_data.get("items", [])
        items_created = 0
        
        for item in items:
            # Get or create product_id if not provided
            product_id = item.get("product_id")
            product_name = item.get("product_name")
            
            if not product_id and product_name:
                # Use repository for product lookup by name
                product_lookup = PurchaseOrderRepository.lookup_products_by_name(
                    db, str(context.org_id), [product_name]
                )
                name_key = product_name.lower().strip()
                
                if name_key in product_lookup:
                    product_id = product_lookup[name_key]
                    logger.info(f"Found existing product: {product_name} (ID: {product_id})")
                else:
                    # Use centralized ProductService for consistent product creation
                    product_id = ProductService.get_or_create_product(
                        db=db,
                        org_id=str(context.org_id),
                        product_name=product_name,
                        hsn_code=item.get("hsn_code"),
                        user_id=getattr(context, 'user_id', None)
                    )
                    logger.info(f"Created/found product: {product_name} (ID: {product_id})")
            
            # Resolve HSN from product record if not provided by frontend
            item_hsn = item.get("hsn_code")
            if not item_hsn and product_id:
                prod_row = db.execute(text(
                    "SELECT hsn_code FROM inventory.products WHERE product_id = :pid"
                ), {"pid": product_id}).fetchone()
                item_hsn = prod_row.hsn_code if prod_row and prod_row.hsn_code else None

            # Calculate item totals if not provided
            quantity = Decimal(str(item.get("ordered_quantity", 0)))
            cost_price = Decimal(str(item.get("cost_price", 0)))
            discount_percent = Decimal(str(item.get("discount_percent", 0)))
            tax_percent = Decimal(str(item.get("tax_percent", 0)))

            # Calculate amounts
            subtotal = quantity * cost_price
            discount_amount = subtotal * discount_percent / 100
            taxable_amount = subtotal - discount_amount
            tax_amount = taxable_amount * tax_percent / 100
            total_price = taxable_amount + tax_amount

            # Generate batch number if not provided using repository
            batch_number = item.get("batch_number")
            if not batch_number or batch_number.strip() == "":
                batch_number = PurchaseOrderRepository.generate_batch_number(db)

            # Create PO item using repository
            po_item_data = {
                "purchase_order_id": purchase_id,
                "product_id": product_id,
                "product_name": product_name,
                "ordered_quantity": quantity,
                "unit_price": cost_price,
                "free_quantity": item.get("free_quantity", 0),
                "uom": item.get("uom", ProductDefaults.DEFAULT_BASE_UOM),
                "pack_type": item.get("pack_type", PackDefaults.PACK_TYPE),
                "discount_percent": discount_percent,
                "discount_amount": discount_amount,
                "cgst_percent": 0,
                "sgst_percent": 0,
                "igst_percent": 0,
                "cgst_amount": 0,
                "sgst_amount": 0,
                "igst_amount": 0,
                "taxable_amount": taxable_amount,
                "tax_amount": tax_amount,
                "line_total": total_price,
                "batch_number": batch_number,
                "expiry_date": item.get("expiry_date"),
                "manufacturing_date": item.get("manufacturing_date"),
                "hsn_code": item_hsn
            }
            PurchaseOrderRepository.create_po_item(db, po_item_data)

            items_created += 1
        
        db.commit()
        
        return {
            "purchase_id": purchase_id,
            "purchase_number": purchase_number,
            "items_created": items_created,
            "message": "Purchase order created successfully"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating purchase with items: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create purchase: {str(e)}")

@router.get("/{purchase_id}/for-entry")
@with_tenant_context
async def get_po_for_entry(
    purchase_id: int,
    _: dict = Depends(PermissionChecker("procurement", "view")),
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Get PO data formatted for Purchase Entry pre-fill.
    Returns supplier info and items with remaining quantities (ordered - received).
    Only works on POs with status not 'completed' or 'cancelled'.
    """
    try:
        data = PurchaseOrderRepository.get_po_with_remaining_items(
            db, purchase_id, str(context.org_id)
        )
        if not data:
            raise HTTPException(
                status_code=404,
                detail="Purchase order not found or already fully received"
            )
        if not data.get("items"):
            raise HTTPException(
                status_code=400,
                detail="All items on this PO have already been received"
            )
        return data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching PO for entry: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{purchase_id}/items")
@with_tenant_context
async def get_purchase_items(
    purchase_id: int,
    _: dict = Depends(PermissionChecker("procurement", "view")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get all items for a purchase order"""
    try:
        # Use PurchaseOrderService instead of inline SQL
        return PurchaseOrderService.get_items_for_order(db, purchase_id)
        
    except Exception as e:
        logger.error(f"Error fetching purchase items: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get purchase items: {str(e)}")

@router.put("/{purchase_id}/items/{item_id}")
@with_tenant_context
def update_purchase_item(
    purchase_id: int,
    item_id: int,
    item_data: dict,
    _: dict = Depends(PermissionChecker("procurement", "edit")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Update a purchase item"""
    try:
        org_id = context.org_id
        # Verify item belongs to purchase using repository
        if not PurchaseOrderRepository.check_po_item_exists(db, item_id, purchase_id):
            raise HTTPException(status_code=404, detail="Purchase item not found")
        
        # Update item
        updates = []
        params = {"item_id": item_id}
        
        allowed_fields = [
            "received_quantity", "free_quantity", "damaged_quantity",
            "batch_number", "manufacturing_date", "expiry_date",
            "item_status", "notes"
        ]
        
        for field in allowed_fields:
            if field in item_data:
                updates.append(f"{field} = :{field}")
                params[field] = item_data[field]
        
        if updates:
            PurchaseOrderRepository.update_po_item_dynamic(
                db, item_id, str(org_id), updates, params
            )
            db.commit()
        
        return {"message": "Purchase item updated successfully"}
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating purchase item: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update purchase item: {str(e)}")



@router.post("/{purchase_id}/receive")
@with_tenant_context
async def receive_purchase_items(
    purchase_id: int,
    receive_data: dict,
    _: dict = Depends(PermissionChecker("procurement", "receive")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Receive items - Fixed version that works with auto batch trigger
    Only updates purchase items and status, lets trigger create batches
    """
    try:
        # Get purchase using repository
        purchase = PurchaseOrderRepository.get_purchase_for_receive(
            db, purchase_id, str(context.org_id)
        )
        
        if not purchase:
            raise HTTPException(status_code=404, detail="Purchase not found")
        
        if purchase["po_status"] == "received":
            raise HTTPException(status_code=400, detail="Purchase already received")
        
        # Update purchase items
        for item in receive_data.get("items", []):
            item_id = item.get("po_item_id")
            received_qty = item.get("received_quantity", 0)
            
            if received_qty <= 0:
                continue
            
            # Build extra fields for receive update
            extra_fields = []
            params = {"received_quantity": received_qty}
            
            if item.get("batch_number"):
                extra_fields.append("batch_number = :batch_number")
                params["batch_number"] = item["batch_number"]
            
            if item.get("expiry_date"):
                extra_fields.append("expiry_date = :expiry_date")
                params["expiry_date"] = item["expiry_date"]
            
            # Update item using repository
            PurchaseOrderRepository.update_receive_item(
                db, item_id, purchase_id, params, extra_fields
            )
        
        # Update purchase status using repository
        grn_number = f"GRN-{purchase['po_number']}"
        PurchaseOrderRepository.mark_po_received(db, purchase_id, grn_number)
        
        db.commit()
        
        # Count created batches using repository
        batch_count = PurchaseOrderRepository.count_purchase_batches(
            db, purchase_id, str(context.org_id)
        )
        
        return {
            "message": "Purchase received successfully",
            "purchase_id": purchase_id,
            "grn_number": grn_number,
            "batches_created": batch_count,
            "note": "Batches auto-created with generated numbers if needed"
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/pending-receipts")
@with_tenant_context
async def get_pending_receipts(
    supplier_id: Optional[int] = Query(None),
    _: dict = Depends(PermissionChecker("procurement", "view")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get purchases pending receipt"""
    try:
        # Use PurchaseOrderService instead of inline SQL
        return PurchaseOrderService.get_pending_receipts(db, str(context.org_id), supplier_id)
        
    except Exception as e:
        logger.error(f"Error fetching pending receipts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get pending receipts: {str(e)}")