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
from ....services.gst_service import GSTService
from ....services.purchase.order.order_service import PurchaseOrderService
from datetime import datetime
from decimal import Decimal

# Modern imports - fully modernized
from .....core.auth.tenant_service import TenantAwareSession, get_tenant_aware_db, with_tenant_context
from .....core.auth.org_context import OrgContext, get_org_context
from .....core.security.permissions import PermissionChecker

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
        if not product_name:
            return {"products": []}
        
        # Search for exact and similar products
        result = db.execute(text("""
            SELECT DISTINCT
                p.product_id,
                p.product_name,
                p.product_code,
                p.hsn_code,
                p.manufacturer,
                b.batch_number as last_batch,
                b.mrp_per_unit as last_mrp,
                b.cost_per_unit as last_cost,
                b.expiry_date as last_expiry,
                CASE 
                    WHEN LOWER(TRIM(p.product_name)) = LOWER(TRIM(:exact_name)) THEN 100
                    WHEN LOWER(p.product_name) LIKE LOWER(:pattern) THEN 80
                    ELSE 60
                END as match_score
            FROM inventory.products p
            LEFT JOIN inventory.batches b ON b.product_id = p.product_id
                AND b.org_id = p.org_id
                AND b.batch_id = (
                    SELECT batch_id FROM inventory.batches
                    WHERE product_id = p.product_id
                    AND org_id = p.org_id
                    ORDER BY created_at DESC LIMIT 1
                )
            WHERE p.org_id = :org_id
                AND (
                    LOWER(TRIM(p.product_name)) = LOWER(TRIM(:exact_name))
                    OR LOWER(p.product_name) LIKE LOWER(:pattern)
                )
            ORDER BY match_score DESC, p.product_name
            LIMIT 10
        """), {
            "org_id": context.org_id,
            "exact_name": product_name,
            "pattern": f"%{product_name}%"
        })
        
        products = []
        for row in result:
            products.append({
                "product_id": row.product_id,
                "product_name": row.product_name,
                "product_code": row.product_code,
                "hsn_code": row.hsn_code,
                "manufacturer": row.manufacturer,
                "last_batch": row.last_batch,
                "last_mrp": float(row.last_mrp) if row.last_mrp else None,
                "last_cost": float(row.last_cost) if row.last_cost else None,
                "last_expiry": str(row.last_expiry) if row.last_expiry else None,
                "match_score": row.match_score,
                "is_exact_match": row.match_score == 100
            })
        
        return {
            "search_term": product_name,
            "products": products,
            "exact_match_found": any(p["is_exact_match"] for p in products)
        }
        
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
        validated_items = []
        
        for item in items:
            product_name = item.get("product_name", "").strip()
            
            # Check for exact match
            existing = db.execute(text("""
                SELECT product_id, product_name, hsn_code
                FROM inventory.products
                WHERE LOWER(TRIM(product_name)) = LOWER(TRIM(:name))
                AND org_id = :org_id
                LIMIT 1
            """), {
                "name": product_name,
                "org_id": context.org_id
            }).fetchone()
            
            validated_item = {
                "product_name": product_name,
                "quantity": item.get("quantity"),
                "cost_price": item.get("cost_price"),
                "mrp": item.get("mrp"),
                "selling_price": item.get("selling_price"),
                "batch_number": item.get("batch_number"),
                "expiry_date": item.get("expiry_date"),
                "hsn_code": item.get("hsn_code"),
                "tax_percent": item.get("tax_percent", 0)  # Don't hardcode tax - let it be specified
            }
            
            if existing:
                validated_item["product_exists"] = True
                validated_item["product_id"] = existing.product_id
                validated_item["existing_product_name"] = existing.product_name
                validated_item["existing_hsn_code"] = existing.hsn_code
            else:
                validated_item["product_exists"] = False
                validated_item["product_id"] = None
                validated_item["will_create_new"] = True
            
            # Validate required fields
            errors = []
            if not validated_item["quantity"] or validated_item["quantity"] <= 0:
                errors.append("Quantity is required and must be > 0")
            if not validated_item["cost_price"] or validated_item["cost_price"] <= 0:
                errors.append("Cost price is required and must be > 0")
            if not validated_item["batch_number"]:
                errors.append("Batch number is required")
            if not validated_item["expiry_date"]:
                errors.append("Expiry date is required for pharma products")
            
            # Validate pricing logic
            if validated_item.get("mrp") and validated_item.get("cost_price"):
                if validated_item["mrp"] < validated_item["cost_price"]:
                    errors.append("MRP cannot be less than cost price")
            
            if validated_item.get("selling_price") and validated_item.get("mrp"):
                if validated_item["selling_price"] > validated_item["mrp"]:
                    errors.append("Selling price cannot be greater than MRP")
            
            validated_item["validation_errors"] = errors
            validated_item["is_valid"] = len(errors) == 0
            
            validated_items.append(validated_item)
        
        return {
            "items": validated_items,
            "all_valid": all(item["is_valid"] for item in validated_items),
            "new_products_count": sum(1 for item in validated_items if not item.get("product_exists")),
            "existing_products_count": sum(1 for item in validated_items if item.get("product_exists"))
        }
        
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
    import random
    
    try:
        # For Purchase Entry, we create a completed PO (since there's no separate supplier_invoice table)
        # This represents goods already received with bill
        po_number = DocumentNumberService.generate_number(db, "supplier_invoice", str(context.org_id))
        
        # Create purchase order marked as completed (represents bill entry)
        po_result = db.execute(text("""
            INSERT INTO procurement.purchase_orders (
                org_id, branch_id, po_number, po_date, po_type,
                supplier_id, supplier_name,
                subtotal_amount, tax_amount, total_amount,
                po_status, receipt_status,
                created_at
            ) VALUES (
                :org_id, :branch_id, :po_number, :po_date, 'regular',
                :supplier_id, :supplier_name,
                :subtotal, :tax, :total,
                'completed', 'received',
                CURRENT_TIMESTAMP
            ) RETURNING purchase_order_id
        """), {
            "org_id": context.org_id,
            "branch_id": context.branch_id,  # SECURITY: No fallback - branch must be set
            "po_number": po_number,
            "po_date": purchase_data.get("purchase_date", datetime.now().date()),
            "supplier_id": purchase_data.get("supplier_id"),
            "supplier_name": purchase_data.get("supplier_name", "Direct Purchase"),
            "subtotal": purchase_data.get("subtotal_amount", 0),
            "tax": purchase_data.get("tax_amount", 0),
            "total": purchase_data.get("total_amount", 0)
        })
        
        po_row = po_result.fetchone()
        po_id = po_row.purchase_order_id
        
        # Process items and create batches
        items = purchase_data.get("items", [])
        for item in items:
            # Get or create product_id if not provided
            product_id = item.get("product_id")
            product_name = item.get("product_name")
            
            if not product_id and product_name:
                # In pharma, products must match very closely (95%+)
                # Different dosages/strengths are different products
                # First try exact match (case-insensitive, trimmed)
                existing_product = db.execute(text("""
                    SELECT product_id FROM inventory.products 
                    WHERE LOWER(TRIM(product_name)) = LOWER(TRIM(:product_name))
                    AND org_id = :org_id
                    LIMIT 1
                """), {"product_name": product_name, "org_id": context.org_id}).fetchone()
                
                # For pharma, we DON'T do partial matching
                # PARACETAMOL 500MG and PARACETAMOL 650MG are different products
                # Only exact name matches are acceptable
                
                if existing_product:
                    product_id = existing_product.product_id
                    logger.info(f"Found existing product: {product_name} (ID: {product_id})")
                else:
                    # Get or create a default category first
                    category_result = db.execute(text("""
                        SELECT category_id FROM inventory.product_categories 
                        WHERE org_id = :org_id
                        ORDER BY category_id
                        LIMIT 1
                    """), {"org_id": context.org_id}).fetchone()
                    
                    if category_result:
                        category_id = category_result.category_id
                    else:
                        # Create a default category
                        new_category = db.execute(text("""
                            INSERT INTO inventory.product_categories (
                                org_id, category_name, category_code, is_active
                            ) VALUES (
                                :org_id, 'General', 'GEN', true
                            ) RETURNING category_id
                        """), {"org_id": context.org_id}).fetchone()
                        category_id = new_category.category_id if new_category else None
                    
                    # Create new product with minimal required fields
                    # Generate a meaningful product code
                    product_code = f"PROD-{product_name[:10].upper().replace(' ', '')}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
                    
                    # Extract HSN from item data or use default
                    hsn_code = item.get("hsn_code", "30049099")  # Default pharma HSN
                    
                    new_product = db.execute(text("""
                        INSERT INTO inventory.products (
                            org_id, product_name, product_code,
                            category_id, hsn_code, is_active, created_at
                        ) VALUES (
                            :org_id, :product_name, :product_code,
                            :category_id, :hsn_code, true, CURRENT_TIMESTAMP
                        ) RETURNING product_id
                    """), {
                        "org_id": context.org_id,
                        "product_name": product_name,
                        "product_code": product_code,
                        "category_id": category_id,
                        "hsn_code": hsn_code
                    }).fetchone()
                    product_id = new_product.product_id if new_product else None
                    logger.info(f"Created new product: {product_name} (ID: {product_id}, Code: {product_code})")
            
            # Create PO item (with required UOM and pack_type fields)
            item_result = db.execute(text("""
                INSERT INTO procurement.purchase_order_items (
                    purchase_order_id, product_id, product_name,
                    ordered_quantity, unit_price, 
                    uom, pack_type,
                    discount_percent, discount_amount,
                    tax_percent, tax_amount, line_total
                ) VALUES (
                    :purchase_order_id, :product_id, :product_name,
                    :quantity, :unit_price,
                    :uom, :pack_type,
                    :disc_percent, :disc_amount,
                    :tax_percent, :tax_amount, :line_total
                ) RETURNING po_item_id
            """), {
                "purchase_order_id": po_id,
                "product_id": product_id,  # Use the resolved product_id
                "product_name": product_name,
                "quantity": item.get("quantity", 0),
                "unit_price": item.get("unit_price", 0),
                "uom": item.get("uom", "NOS"),  # Default to NOS (numbers/pieces)
                "pack_type": item.get("pack_type", "STRIP"),  # Default to STRIP for pharma
                "disc_percent": item.get("discount_percent", 0),
                "disc_amount": item.get("discount_amount", 0),
                "tax_percent": item.get("tax_percent", 0),  # Don't hardcode tax - let it be specified
                "tax_amount": item.get("tax_amount", 0),
                "line_total": item.get("total_amount", 0)  # This is the final total with tax
            })
            
            # Create batch automatically
            if item.get("batch_number") and item.get("expiry_date"):
                batch_result = db.execute(text("""
                    INSERT INTO inventory.batches (
                        org_id, product_id,
                        batch_number, expiry_date,
                        initial_quantity, quantity_available,
                        cost_per_unit, mrp_per_unit,
                        source_type,
                        pack_type, pack_size, pack_uom, base_uom, units_per_pack,
                        batch_status, expiry_status,
                        created_at
                    ) VALUES (
                        :org_id, :product_id,
                        :batch_number, :expiry_date,
                        :quantity, :quantity,
                        :cost_price, :mrp,
                        'purchase',
                        :pack_type, :pack_size, :pack_uom, :base_uom, :units_per_pack,
                        'active', 'normal',
                        CURRENT_TIMESTAMP
                    ) RETURNING batch_id
                """), {
                    "org_id": context.org_id,
                    "product_id": item.get("product_id"),
                    "batch_number": item.get("batch_number"),
                    "expiry_date": item.get("expiry_date"),
                    "quantity": item.get("quantity", 0),
                    "cost_price": item.get("unit_price", 0),
                    "mrp": item.get("mrp", 0),
                    "pack_type": item.get("pack_type", "STRIP"),
                    "pack_size": item.get("pack_size", 1),
                    "pack_uom": item.get("pack_type", "STRIP"),
                    "base_uom": item.get("uom", "NOS"),
                    "units_per_pack": item.get("pack_size", 1)
                })
                
                batch = batch_result.fetchone()
                logger.info(f"Batch {batch.batch_id} created for product {item.get('product_id')}")
        
        db.commit()
        
        return {
            "success": True,
            "po_id": po_id,
            "po_number": po_number,
            "message": f"Purchase {po_number} created with {len(items)} items and batches"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error in simple purchase: {str(e)}")
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
        
        # Get supplier name first
        supplier_name = None
        if purchase_data.get("supplier_id"):
            supplier_result = db.execute(
                text("SELECT supplier_name FROM parties.suppliers WHERE supplier_id = :id AND org_id = :org_id"),
                {"id": purchase_data.get("supplier_id"), "org_id": context.org_id}
            ).first()
            if supplier_result:
                supplier_name = supplier_result.supplier_name
        
        # Get created_by from JWT token user_id or use default
        created_by = purchase_data.get("created_by") or context.user_id
        if not created_by:
            # For header-based auth, use a default user ID or get from org
            if context.org_id:
                # Try to get any user from this org
                user_result = db.execute(text("""
                    SELECT user_id FROM master.org_users 
                    WHERE org_id = :org_id AND is_active = true
                    ORDER BY user_id LIMIT 1
                """), {"org_id": context.org_id}).fetchone()
                created_by = user_result.user_id if user_result else 1
        if not created_by:
            raise HTTPException(status_code=400, detail="User context required for purchase entry")
        
        # Get branch_id from JWT token (authentication context)
        branch_id = context.branch_id
        if branch_id is None:
            # Try to get default branch for org
            result = db.execute(text("""
                SELECT branch_id FROM master.org_branches 
                WHERE org_id = :org_id AND is_active = true
                ORDER BY branch_id LIMIT 1
            """), {"org_id": context.org_id}).fetchone()
            if result:
                branch_id = result.branch_id
            else:
                raise HTTPException(status_code=400, detail="No active branch found for organization")
        logger.info(f"Using branch_id {branch_id} for user {context.user_id}")
        
        # Create supplier invoice directly (not purchase order)
        invoice_result = db.execute(
            text("""
                INSERT INTO procurement.supplier_invoices (
                    org_id, branch_id, supplier_invoice_number, invoice_date,
                    supplier_id, 
                    subtotal_amount, discount_amount, taxable_amount,
                    cgst_amount, sgst_amount, igst_amount, tax_amount,
                    freight_charges, insurance_charges, other_charges,
                    round_off_amount, invoice_total,
                    payment_terms, due_date, payment_status,
                    invoice_status, created_by
                ) VALUES (
                    :org_id, :branch_id, :invoice_number, :invoice_date,
                    :supplier_id,
                    :subtotal, :discount, :taxable,
                    :cgst, :sgst, :igst, :tax,
                    :freight, :insurance, :other,
                    :round_off, :total,
                    :payment_terms, :due_date, :payment_status,
                    :invoice_status, :created_by
                ) RETURNING supplier_invoice_id
            """),
            {
                "org_id": context.org_id,
                "branch_id": branch_id,
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
                "invoice_status": "posted",  # Purchase entry is already posted
                "created_by": created_by
            }
        )
        
        supplier_invoice_id = invoice_result.scalar()
        
        # Create supplier invoice items
        items = purchase_data.get("items", [])
        items_created = 0
        
        # Log the received data for debugging
        logger.info(f"Processing {len(items)} items for purchase entry")
        
        for idx, item in enumerate(items):
            logger.info(f"Item {idx + 1}: {item}")
            # Get or create product_id if not provided
            product_id = item.get("product_id")
            product_name = item.get("product_name")
            
            if not product_id and product_name:
                # First try exact match (case-insensitive, trimmed)
                existing_product = db.execute(text("""
                    SELECT product_id FROM inventory.products 
                    WHERE LOWER(TRIM(product_name)) = LOWER(TRIM(:product_name))
                    AND org_id = :org_id
                    LIMIT 1
                """), {"product_name": product_name, "org_id": context.org_id}).fetchone()
                
                if existing_product:
                    product_id = existing_product.product_id
                    logger.info(f"Found existing product: {product_name} (ID: {product_id})")
                else:
                    # Get or create a default category first
                    category_result = db.execute(text("""
                        SELECT category_id FROM inventory.product_categories 
                        WHERE org_id = :org_id
                        ORDER BY category_id
                        LIMIT 1
                    """), {"org_id": context.org_id}).fetchone()
                    
                    if category_result:
                        category_id = category_result.category_id
                    else:
                        # Create a default category
                        new_category = db.execute(text("""
                            INSERT INTO inventory.product_categories (
                                org_id, category_name, category_code, is_active
                            ) VALUES (
                                :org_id, 'General', 'GEN', true
                            ) RETURNING category_id
                        """), {"org_id": context.org_id}).fetchone()
                        category_id = new_category.category_id if new_category else None
                    
                    # Create new product with minimal required fields
                    product_code = f"PROD-{product_name[:10].upper().replace(' ', '')}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
                    hsn_code = item.get("hsn_code", "30049099")  # Default pharma HSN
                    
                    new_product = db.execute(text("""
                        INSERT INTO inventory.products (
                            org_id, product_name, product_code,
                            category_id, hsn_code, is_active, created_at
                        ) VALUES (
                            :org_id, :product_name, :product_code,
                            :category_id, :hsn_code, true, CURRENT_TIMESTAMP
                        ) RETURNING product_id
                    """), {
                        "org_id": context.org_id,
                        "product_name": product_name,
                        "product_code": product_code,
                        "category_id": category_id,
                        "hsn_code": hsn_code
                    }).fetchone()
                    product_id = new_product.product_id if new_product else None
                    logger.info(f"Created new product: {product_name} (ID: {product_id}, Code: {product_code})")
            
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
                batch_number = f"BATCH{datetime.now().strftime('%y%m')}{str(db.execute(text('SELECT floor(random() * 10000)::int')).scalar()).zfill(4)}"
            
            # Calculate pricing values
            mrp_value = Decimal(str(item.get("mrp", 0)))
            if mrp_value == 0:
                mrp_value = cost_price * Decimal('1.5')  # Default MRP is 1.5x cost
            
            # Selling price (PTR/PTS in pharma)
            selling_price = Decimal(str(item.get("selling_price", 0)))
            if selling_price == 0:
                # Default selling price is 90% of MRP
                selling_price = mrp_value * Decimal('0.9')
            
            # Always create batch for inventory tracking
            batch_id = None
            # Use expiry_date if provided, otherwise set to 2 years from now (default for pharma)
            expiry_date = item.get("expiry_date")
            if not expiry_date:
                from datetime import timedelta
                expiry_date = (datetime.now() + timedelta(days=730)).date()  # 2 years default
            
            # Always create batch for proper inventory tracking
            batch_result = db.execute(text("""
                INSERT INTO inventory.batches (
                    org_id, product_id,
                    batch_number, expiry_date,
                    initial_quantity, quantity_available,
                    cost_per_unit, mrp_per_unit, sale_price_per_unit,
                    source_type, 
                    pack_type, pack_size, pack_uom, base_uom, units_per_pack,
                    batch_status, expiry_status,
                    created_at
                ) VALUES (
                    :org_id, :product_id,
                    :batch_number, :expiry_date,
                    :quantity, :quantity,
                    :cost_price, :mrp, :selling_price,
                    'purchase',
                    :pack_type, :pack_size, :pack_uom, :base_uom, :units_per_pack,
                    'active', 'normal',
                    CURRENT_TIMESTAMP
                ) RETURNING batch_id
            """), {
                "org_id": context.org_id,
                "product_id": product_id,
                "batch_number": batch_number,
                "expiry_date": expiry_date,
                "quantity": quantity,
                "cost_price": cost_price,
                "mrp": mrp_value,
                "selling_price": selling_price,
                "pack_type": item.get("pack_type", "STRIP"),
                "pack_size": item.get("pack_size", 1),
                "pack_uom": item.get("pack_type", "STRIP"),
                "base_uom": item.get("uom", "NOS"),
                "units_per_pack": item.get("pack_size", 1)
            })
            
            batch = batch_result.fetchone()
            batch_id = batch.batch_id if batch else None
            logger.info(f"Batch {batch_id} created for product {product_id}")
            
            # Note: Pricing is stored at batch level, not product level
            # Each batch can have different MRP and cost prices
            
            # Create supplier invoice item with batch reference
            db.execute(
                text("""
                    INSERT INTO procurement.supplier_invoice_items (
                        supplier_invoice_id, product_id, batch_id,
                        batch_number, quantity, free_quantity,
                        unit_price, discount_percent, discount_amount,
                        taxable_amount, cgst_percent, sgst_percent, igst_percent,
                        cgst_amount, sgst_amount, igst_amount, total_amount,
                        hsn_code, unit, pack_type, pack_size
                    ) VALUES (
                        :invoice_id, :product_id, :batch_id,
                        :batch_number, :quantity, :free_quantity,
                        :unit_price, :disc_percent, :disc_amount,
                        :taxable_amount, :cgst_percent, :sgst_percent, :igst_percent,
                        :cgst_amount, :sgst_amount, :igst_amount, :total_amount,
                        :hsn_code, :unit, :pack_type, :pack_size
                    )
                """),
                {
                    "invoice_id": supplier_invoice_id,
                    "product_id": product_id,
                    "batch_id": batch_id,
                    "batch_number": batch_number,
                    "quantity": quantity,
                    "free_quantity": item.get("free_quantity", 0),
                    "unit_price": cost_price,
                    "disc_percent": discount_percent,
                    "disc_amount": discount_amount,
                    "taxable_amount": taxable_amount,
                    "cgst_percent": cgst_percent,
                    "sgst_percent": sgst_percent,
                    "igst_percent": igst_percent,
                    "cgst_amount": cgst_amount,
                    "sgst_amount": sgst_amount,
                    "igst_amount": igst_amount,
                    "total_amount": total_price,
                    "hsn_code": item.get("hsn_code", "30049099"),
                    "unit": item.get("uom", "NOS"),
                    "pack_type": item.get("pack_type", "STRIP"),
                    "pack_size": item.get("pack_size", 1)
                }
            )
            
            items_created += 1
        
        db.commit()
        
        return {
            "invoice_id": supplier_invoice_id,
            "invoice_number": invoice_number,
            "items_created": items_created,
            "message": "Purchase entry (supplier invoice) created successfully"
        }
        
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
        
        # Get supplier name first
        supplier_name = None
        if purchase_data.get("supplier_id"):
            supplier_result = db.execute(
                text("SELECT supplier_name FROM parties.suppliers WHERE supplier_id = :id AND org_id = :org_id"),
                {"id": purchase_data.get("supplier_id"), "org_id": context.org_id}
            ).first()
            if supplier_result:
                supplier_name = supplier_result.supplier_name
        
        # Get created_by from JWT token user_id or use default
        created_by = purchase_data.get("created_by") or context.user_id
        if not created_by:
            # For header-based auth, use a default user ID or get from org
            if context.org_id:
                # Try to get any user from this org
                user_result = db.execute(text("""
                    SELECT user_id FROM master.org_users 
                    WHERE org_id = :org_id AND is_active = true
                    ORDER BY user_id LIMIT 1
                """), {"org_id": context.org_id}).fetchone()
                created_by = user_result.user_id if user_result else 1
        if not created_by:
            raise HTTPException(status_code=400, detail="User context required for purchase order")
        
        # Get branch_id from JWT token (authentication context)
        branch_id = context.branch_id
        if branch_id is None:
            # Try to get default branch for org
            result = db.execute(text("""
                SELECT branch_id FROM master.org_branches 
                WHERE org_id = :org_id AND is_active = true
                ORDER BY branch_id LIMIT 1
            """), {"org_id": context.org_id}).fetchone()
            if result:
                branch_id = result.branch_id
            else:
                raise HTTPException(status_code=400, detail="No active branch found for organization")
        logger.info(f"Using branch_id {branch_id} for user {context.user_id}")
        
        # Create purchase header
        result = db.execute(
            text("""
                INSERT INTO procurement.purchase_orders (
                    org_id, po_number, po_date,
                    supplier_id, supplier_name,
                    subtotal_amount, discount_amount, tax_amount, 
                    other_charges, total_amount, po_status,
                    payment_terms, notes, created_by, branch_id
                ) VALUES (
                    :org_id, -- Default org
                    :purchase_number, :po_date,
                    :supplier_id, :supplier_name,
                    :subtotal, :discount, :tax, :other_charges, :total,
                    :status, :payment_mode, :notes, :created_by, :branch_id
                ) RETURNING purchase_order_id
            """),
            {
                "org_id": context.org_id,
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
                "notes": purchase_data.get("notes"),
                "created_by": created_by,
                "branch_id": branch_id  # Use the dynamically fetched branch_id
            }
        )
        
        purchase_id = result.scalar()
        
        # Create supplier invoice
        invoice_number = purchase_data.get("invoice_number", purchase_number)
        invoice_date = purchase_data.get("invoice_date", purchase_data.get("purchase_date", datetime.now().date()))
        
        # Create supplier invoice
        invoice_result = db.execute(
            text("""
                INSERT INTO procurement.supplier_invoices (
                    org_id, branch_id, supplier_invoice_number, invoice_date,
                    supplier_id, purchase_order_ids,
                    subtotal_amount, discount_amount, taxable_amount,
                    cgst_amount, sgst_amount, igst_amount, tax_amount,
                    freight_charges, insurance_charges, other_charges,
                    round_off_amount, invoice_total,
                    payment_terms, due_date, payment_status,
                    invoice_status, created_by
                ) VALUES (
                    :org_id, :branch_id, :invoice_number, :invoice_date,
                    :supplier_id, ARRAY[:purchase_id]::integer[],
                    :subtotal, :discount, :taxable,
                    :cgst, :sgst, :igst, :tax,
                    :freight, :insurance, :other,
                    :round_off, :total,
                    :payment_terms, :due_date, :payment_status,
                    :invoice_status, :created_by
                ) RETURNING supplier_invoice_id
            """),
            {
                "org_id": context.org_id,
                "branch_id": branch_id,
                "invoice_number": invoice_number,
                "invoice_date": invoice_date,
                "supplier_id": purchase_data.get("supplier_id"),
                "purchase_id": purchase_id,
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
                "invoice_status": purchase_data.get("invoice_status", "draft"),
                "created_by": created_by
            }
        )
        
        supplier_invoice_id = invoice_result.scalar()
        
        # Create purchase items if provided
        items = purchase_data.get("items", [])
        items_created = 0
        
        for item in items:
            # Get or create product_id if not provided
            product_id = item.get("product_id")
            product_name = item.get("product_name")
            
            if not product_id and product_name:
                # In pharma, products must match very closely (95%+)
                # Different dosages/strengths are different products
                # First try exact match (case-insensitive, trimmed)
                existing_product = db.execute(text("""
                    SELECT product_id FROM inventory.products 
                    WHERE LOWER(TRIM(product_name)) = LOWER(TRIM(:product_name))
                    AND org_id = :org_id
                    LIMIT 1
                """), {"product_name": product_name, "org_id": context.org_id}).fetchone()
                
                # For pharma, we DON'T do partial matching
                # PARACETAMOL 500MG and PARACETAMOL 650MG are different products
                # Only exact name matches are acceptable
                
                if existing_product:
                    product_id = existing_product.product_id
                    logger.info(f"Found existing product: {product_name} (ID: {product_id})")
                else:
                    # Get or create a default category first
                    category_result = db.execute(text("""
                        SELECT category_id FROM inventory.product_categories 
                        WHERE org_id = :org_id
                        ORDER BY category_id
                        LIMIT 1
                    """), {"org_id": context.org_id}).fetchone()
                    
                    if category_result:
                        category_id = category_result.category_id
                    else:
                        # Create a default category
                        new_category = db.execute(text("""
                            INSERT INTO inventory.product_categories (
                                org_id, category_name, category_code, is_active
                            ) VALUES (
                                :org_id, 'General', 'GEN', true
                            ) RETURNING category_id
                        """), {"org_id": context.org_id}).fetchone()
                        category_id = new_category.category_id if new_category else None
                    
                    # Create new product with minimal required fields
                    # Generate a meaningful product code
                    product_code = f"PROD-{product_name[:10].upper().replace(' ', '')}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
                    
                    # Extract HSN from item data or use default
                    hsn_code = item.get("hsn_code", "30049099")  # Default pharma HSN
                    
                    new_product = db.execute(text("""
                        INSERT INTO inventory.products (
                            org_id, product_name, product_code,
                            category_id, hsn_code, is_active, created_at
                        ) VALUES (
                            :org_id, :product_name, :product_code,
                            :category_id, :hsn_code, true, CURRENT_TIMESTAMP
                        ) RETURNING product_id
                    """), {
                        "org_id": context.org_id,
                        "product_name": product_name,
                        "product_code": product_code,
                        "category_id": category_id,
                        "hsn_code": hsn_code
                    }).fetchone()
                    product_id = new_product.product_id if new_product else None
                    logger.info(f"Created new product: {product_name} (ID: {product_id}, Code: {product_code})")
            
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
            
            # Generate batch number if not provided
            batch_number = item.get("batch_number")
            if not batch_number or batch_number.strip() == "":
                # Generate batch number: BATCH + YYMM + Random 4 digits
                batch_number = f"BATCH{datetime.now().strftime('%y%m')}{str(db.execute(text('SELECT floor(random() * 10000)::int')).scalar()).zfill(4)}"
            
            db.execute(
                text("""
                    INSERT INTO procurement.purchase_order_items (
                        purchase_order_id, product_id, product_name,
                        ordered_quantity, unit_price, free_quantity,
                        uom, pack_type,
                        discount_percent, discount_amount,
                        tax_percent, tax_amount, line_total
                    ) VALUES (
                        :purchase_order_id, :product_id, :product_name,
                        :ordered_qty, :unit_price, :free_qty,
                        :uom, :pack_type,
                        :disc_percent, :disc_amount,
                        :tax_percent, :tax_amount, :line_total
                    )
                """),
                {
                    "purchase_order_id": purchase_id,
                    "product_id": product_id,  # Use the resolved product_id
                    "product_name": product_name,
                    "ordered_qty": quantity,
                    "unit_price": cost_price,
                    "free_qty": item.get("free_quantity", 0),
                    "uom": item.get("uom", "NOS"),  # Default to NOS
                    "pack_type": item.get("pack_type", "STRIP"),  # Default to STRIP
                    "disc_percent": discount_percent,
                    "disc_amount": discount_amount,
                    "tax_percent": tax_percent,
                    "tax_amount": tax_amount,
                    "line_total": total_price  # This is the final amount with tax
                }
            )
            
            # Also create supplier invoice item
            # Use GSTService for consistent GST split
            gst = GSTService.calculate_gst_components(taxable_amount, tax_percent, "CGST/SGST")
            cgst_percent = gst["cgst_percent"]
            sgst_percent = gst["sgst_percent"]
            igst_percent = gst["igst_percent"]
            cgst_amount = gst["cgst_amount"]
            sgst_amount = gst["sgst_amount"]
            igst_amount = gst["igst_amount"]
            
            db.execute(
                text("""
                    INSERT INTO procurement.supplier_invoice_items (
                        supplier_invoice_id, product_id, 
                        batch_number, quantity, free_quantity,
                        unit_price, discount_percent, discount_amount,
                        taxable_amount, cgst_percent, sgst_percent, igst_percent,
                        cgst_amount, sgst_amount, igst_amount, total_amount,
                        hsn_code, unit, pack_type, pack_size
                    ) VALUES (
                        :invoice_id, :product_id,
                        :batch_number, :quantity, :free_quantity,
                        :unit_price, :disc_percent, :disc_amount,
                        :taxable_amount, :cgst_percent, :sgst_percent, :igst_percent,
                        :cgst_amount, :sgst_amount, :igst_amount, :total_amount,
                        :hsn_code, :unit, :pack_type, :pack_size
                    )
                """),
                {
                    "invoice_id": supplier_invoice_id,
                    "product_id": product_id,
                    "batch_number": batch_number,
                    "quantity": quantity,
                    "free_quantity": item.get("free_quantity", 0),
                    "unit_price": cost_price,
                    "disc_percent": discount_percent,
                    "disc_amount": discount_amount,
                    "taxable_amount": taxable_amount,
                    "cgst_percent": cgst_percent,
                    "sgst_percent": sgst_percent,
                    "igst_percent": igst_percent,
                    "cgst_amount": cgst_amount,
                    "sgst_amount": sgst_amount,
                    "igst_amount": igst_amount,
                    "total_amount": total_price,
                    "hsn_code": item.get("hsn_code", "30049099"),
                    "unit": item.get("uom", "NOS"),
                    "pack_type": item.get("pack_type", "STRIP"),
                    "pack_size": item.get("pack_size", 1)
                }
            )
            
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
        items = db.execute(
            text("""
                SELECT 
                    pi.*,
                    p.product_name as product_full_name,
                    p.hsn_code,
                    p.category_id,
                    p.brand
                FROM procurement.purchase_order_items pi
                LEFT JOIN inventory.products p ON pi.product_id = p.product_id
                WHERE pi.purchase_order_id = :purchase_id
                ORDER BY pi.po_item_id
            """),
            {"purchase_id": purchase_id, "org_id": context.org_id}
        ).fetchall()
        
        return [dict(item._mapping) for item in items]
        
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
        # Verify item belongs to purchase
        check = db.execute(
            text("""
                SELECT po_item_id
                FROM procurement.purchase_order_items
                WHERE po_item_id = :item_id
                AND purchase_order_id = :purchase_id
            """),
            {"item_id": item_id, "purchase_id": purchase_id, "org_id": org_id}
        ).first()
        
        if not check:
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
            db.execute(
                text(f"""
                    UPDATE procurement.purchase_order_items
                    SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP
                    WHERE po_item_id = :item_id AND org_id = :org_id
                """),
                {**params, "org_id": org_id}
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
        # Get purchase
        purchase = db.execute(
            text("SELECT * FROM procurement.purchase_orders WHERE purchase_order_id = :id AND org_id = :org_id"),
            {"id": purchase_id, "org_id": context.org_id}
        ).first()
        
        if not purchase:
            raise HTTPException(status_code=404, detail="Purchase not found")
        
        if purchase.po_status == "received":
            raise HTTPException(status_code=400, detail="Purchase already received")
        
        # Update purchase items
        for item in receive_data.get("items", []):
            item_id = item.get("po_item_id")
            received_qty = item.get("received_quantity", 0)
            
            if received_qty <= 0:
                continue
            
            # Update item
            update_fields = ["received_quantity = :received_quantity"]
            params = {
                "item_id": item_id,
                "purchase_id": purchase_id,
                "received_quantity": received_qty
            }
            
            if item.get("batch_number"):
                update_fields.append("batch_number = :batch_number")
                params["batch_number"] = item["batch_number"]
            
            if item.get("expiry_date"):
                update_fields.append("expiry_date = :expiry_date")
                params["expiry_date"] = item["expiry_date"]
            
            db.execute(
                text(f"""
                    UPDATE procurement.purchase_order_items 
                    SET {', '.join(update_fields)},
                        item_status = 'received'
                    WHERE po_item_id = :item_id 
                    AND po_id = :purchase_id
                """),
                params
            )
        
        # Update purchase status - trigger will create batches
        grn_number = f"GRN-{purchase.po_number}"
        
        db.execute(
            text("""
                UPDATE procurement.purchase_orders 
                SET po_status = 'received',
                    grn_number = :grn_number,
                    grn_date = CURRENT_DATE
                WHERE purchase_order_id = :purchase_id
            """),
            {"grn_number": grn_number, "purchase_id": purchase_id}
        )
        
        db.commit()
        
        # Count created batches
        batch_count = db.execute(
            text("SELECT COUNT(*) FROM inventory.batches WHERE purchase_id = :id AND org_id = :org_id"),
            {"id": purchase_id, "org_id": context.org_id}
        ).scalar()
        
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
        query = """
            SELECT 
                p.*,
                s.supplier_name,
                COUNT(pi.po_item_id) as total_items,
                COUNT(CASE WHEN pi.received_quantity > 0 THEN 1 END) as received_items
            FROM procurement.purchase_orders p
            JOIN parties.suppliers s ON p.supplier_id = s.supplier_id AND p.org_id = s.org_id
            LEFT JOIN procurement.purchase_order_items pi ON p.purchase_order_id = pi.purchase_order_id
            WHERE p.org_id = :org_id
            AND p.po_status IN ('draft', 'approved', 'partial')
        """
        params = {}
        
        if supplier_id:
            query += " AND p.supplier_id = :supplier_id"
            params["supplier_id"] = supplier_id
        
        query += " GROUP BY p.po_id, s.supplier_name ORDER BY p.po_date DESC"
        
        result = db.execute(text(query), params)
        return [dict(row._mapping) for row in result]
        
    except Exception as e:
        logger.error(f"Error fetching pending receipts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get pending receipts: {str(e)}")