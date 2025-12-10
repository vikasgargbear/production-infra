"""
Purchase Helper Functions
Shared utilities for purchase operations to eliminate code duplication
"""
from typing import Tuple, Optional
from sqlalchemy import text
from decimal import Decimal
from datetime import datetime
import logging

from ...core.tenant_service import TenantAwareSession
from ...core.org_context import OrgContext

logger = logging.getLogger(__name__)


def resolve_user_and_branch(
    context: OrgContext,
    db: TenantAwareSession,
    override_user_id: Optional[int] = None,
    override_branch_id: Optional[int] = None
) -> Tuple[int, int]:
    """
    Resolve user_id and branch_id with proper fallbacks.
    
    Returns:
        Tuple of (user_id, branch_id)
    """
    # Resolve user_id
    user_id = override_user_id or context.user_id
    if not user_id:
        # Try to get any active user from the org
        if context.org_id:
            user_result = db.execute(text("""
                SELECT user_id FROM master.org_users 
                WHERE org_id = :org_id AND is_active = true
                ORDER BY user_id LIMIT 1
            """), {"org_id": context.org_id}).fetchone()
            user_id = user_result.user_id if user_result else 1
        else:
            user_id = 1  # Ultimate fallback
    
    # Resolve branch_id
    branch_id = override_branch_id or context.branch_id
    if branch_id is None:
        # Try to get default branch for the org
        result = db.execute(text("""
            SELECT branch_id FROM master.org_branches 
            WHERE org_id = :org_id AND is_active = true
            ORDER BY branch_id LIMIT 1
        """), {"org_id": context.org_id}).fetchone()
        branch_id = result.branch_id if result else 1
    
    logger.info(f"Resolved user_id={user_id}, branch_id={branch_id} for org={context.org_id}")
    return user_id, branch_id


def get_or_create_product(
    product_name: str,
    hsn_code: Optional[str],
    context: OrgContext,
    db: TenantAwareSession
) -> int:
    """
    Look up existing product by exact name match or create a new one.
    
    For pharma products: We DON'T do partial matching.
    PARACETAMOL 500MG and PARACETAMOL 650MG are different products.
    Only exact name matches are acceptable.
    
    Returns:
        product_id
    """
    # Try to find existing product (exact name match only)
    existing_product = db.execute(text("""
        SELECT product_id FROM inventory.products
        WHERE LOWER(TRIM(product_name)) = LOWER(TRIM(:product_name))
        AND org_id = :org_id
        LIMIT 1
    """), {"product_name": product_name, "org_id": context.org_id}).fetchone()
    
    if existing_product:
        logger.info(f"Found existing product: {product_name} (ID: {existing_product.product_id})")
        return existing_product.product_id
    
    # Product doesn't exist - create it
    logger.info(f"Creating new product: {product_name}")
    
    # Get or create a default category
    category_result = db.execute(text("""
        SELECT category_id FROM inventory.product_categories 
        WHERE org_id = :org_id
        ORDER BY category_id
        LIMIT 1
    """), {"org_id": context.org_id}).fetchone()
    
    if category_result:
        category_id = category_result.category_id
    else:
        # Create a default "General" category
        new_category = db.execute(text("""
            INSERT INTO inventory.product_categories (
                org_id, category_name, category_code, is_active
            ) VALUES (
                :org_id, 'General', 'GEN', true
            ) RETURNING category_id
        """), {"org_id": context.org_id}).fetchone()
        category_id = new_category.category_id if new_category else None
    
    # Generate product code
    product_code = f"PROD-{product_name[:10].upper().replace(' ', '')}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    
    # Use provided HSN or default pharma HSN
    hsn = hsn_code or "30049099"
    
    # Create the product
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
        "hsn_code": hsn
    }).fetchone()
    
    product_id = new_product.product_id
    logger.info(f"Created product {product_name} with ID {product_id}")
    return product_id


def create_inventory_batch(
    product_id: int,
    batch_number: str,
    batch_data: dict,
    context: OrgContext,
    db: TenantAwareSession
) -> int:
    """
    Create an inventory batch with proper validation.
    
    Args:
        product_id: ID of the product
        batch_number: Batch number for the batch
        batch_data: Dictionary containing batch details (expiry_date, manufacturing_date, 
                    quantity, cost_per_unit, mrp_per_unit, etc.)
        context: Org context
        db: Database session
    
    Returns:
        batch_id
    """
    batch_id = db.execute(text("""
        INSERT INTO inventory.batches (
            org_id, product_id, batch_number,
            expiry_date, manufacturing_date,
            initial_quantity, quantity_available,
            cost_per_unit, mrp_per_unit,
            source_type, batch_status,
            created_at
        ) VALUES (
            :org_id, :product_id, :batch_number,
            :expiry_date, :manufacturing_date,
            :quantity, :quantity,
            :cost_per_unit, :mrp_per_unit,
            'purchase', 'active',
            CURRENT_TIMESTAMP
        ) RETURNING batch_id
    """), {
        "org_id": context.org_id,
        "product_id": product_id,
        "batch_number": batch_number,
        "expiry_date": batch_data.get("expiry_date"),
        "manufacturing_date": batch_data.get("manufacturing_date"),
        "quantity": batch_data.get("quantity", 0),
        "cost_per_unit": batch_data.get("cost_per_unit", 0),
        "mrp_per_unit": batch_data.get("mrp_per_unit", 0)
    }).scalar()
    
    logger.info(f"Created batch {batch_number} with ID {batch_id} for product {product_id}")
    return batch_id


def validate_supplier(
    supplier_id: int,
    context: OrgContext,
    db: TenantAwareSession
) -> Optional[dict]:
    """
    Validate that supplier exists and belongs to the organization.
    
    Returns:
        Dictionary with supplier details (supplier_id, supplier_name) or None if not found
    """
    supplier_result = db.execute(text("""
        SELECT supplier_id, supplier_name 
        FROM parties.suppliers 
        WHERE supplier_id = :supplier_id AND org_id = :org_id
    """), {"supplier_id": supplier_id, "org_id": context.org_id}).first()
    
    if supplier_result:
        return {
            "supplier_id": supplier_result.supplier_id,
            "supplier_name": supplier_result.supplier_name
        }
    return None
