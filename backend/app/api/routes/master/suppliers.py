"""
Suppliers API Router
Manages pharmaceutical suppliers and vendors

PRODUCTION-READY: Uses TenantAwareSession for AI-agent safety
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
import logging
import json

# Core utilities - shared across all APIs
from ....core.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from ....core.org_context import get_org_context, OrgContext
from ....core.state_utils import get_state_name_and_code
from ....core.api_utils import handle_error
from ....core.permissions import PermissionChecker  # RBAC

# Supplier-specific imports
from ...schemas.supplier import SupplierCreate, SupplierUpdate, SupplierResponse, SupplierListResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["suppliers"])


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/search")
@with_tenant_context
async def search_suppliers(
    search_term: Optional[str] = Query(None, description="Search name, code, GST, phone"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _: dict = Depends(PermissionChecker("master", "view")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Search suppliers by name, code, GSTIN, phone, or email
    Returns database field names directly (no aliases)
    """
    try:
        # TenantAwareSession auto-injects org_id filter
        query = """
            SELECT s.supplier_id, s.supplier_name, s.supplier_code, s.gst_number,
                   s.primary_phone, s.primary_email, s.supplier_type, s.is_active,
                   a.city, a.state_name, a.address_line1, a.pincode
            FROM parties.suppliers s
            LEFT JOIN master.addresses a ON (
                a.entity_type = 'supplier'
                AND a.entity_id = s.supplier_id
                AND a.org_id = s.org_id
                AND a.is_default = true
            )
            WHERE s.is_active = true
        """
        params = {}
        
        if search_term:
            clean_term = search_term.strip()
            query += """ 
                AND (
                    LOWER(s.supplier_name) LIKE LOWER(:search) OR
                    LOWER(s.supplier_code) LIKE LOWER(:search) OR
                    LOWER(s.gst_number) LIKE LOWER(:exact) OR
                    s.primary_phone LIKE :phone OR
                    LOWER(s.primary_email) LIKE LOWER(:search)
                )
            """
            params["search"] = f"%{clean_term}%"
            params["exact"] = clean_term
            params["phone"] = f"%{clean_term.replace(' ', '').replace('-', '')}%"
        
        query += " ORDER BY s.supplier_name LIMIT :limit OFFSET :offset"
        params["limit"] = limit
        params["offset"] = offset
        
        result = db.execute(text(query), params)
        
        # Return database field names directly - NO ALIASES
        suppliers = [dict(row._mapping) for row in result]
        return suppliers
        
    except Exception as e:
        raise handle_error(e, "search suppliers")

@router.get("/")
@with_tenant_context
async def get_suppliers(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = Query(None, description="Search by supplier name"),
    _: dict = Depends(PermissionChecker("master", "view")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get suppliers with optional search. Returns database field names directly."""
    try:
        # TenantAwareSession auto-injects org_id filter
        query = """
            SELECT s.*,
                   a.city as default_city,
                   a.state_name as default_state,
                   a.address_line1 as default_address,
                   a.pincode as default_pincode
            FROM parties.suppliers s
            LEFT JOIN master.addresses a ON (
                a.entity_type = 'supplier' 
                AND a.entity_id = s.supplier_id 
                AND a.org_id = s.org_id 
                AND a.is_default = true
            )
            WHERE 1=1
        """
        params = {}
        
        if search:
            query += " AND LOWER(s.supplier_name) LIKE LOWER(:search)"
            params["search"] = f"%{search}%"
            
        query += " ORDER BY s.supplier_name LIMIT :limit OFFSET :skip"
        params.update({"limit": limit, "skip": skip})
        
        result = db.execute(text(query), params)
        
        # Return database field names directly - NO ALIASES
        suppliers = [dict(row._mapping) for row in result]
        return suppliers
        
    except Exception as e:
        raise handle_error(e, "list suppliers")

@router.get("/{supplier_id}")
@with_tenant_context
async def get_supplier(
    supplier_id: int,
    _: dict = Depends(PermissionChecker("master", "view")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get supplier by ID with addresses. Returns database field names directly."""
    try:
        # TenantAwareSession auto-injects org_id filter
        result = db.execute(text("""
            SELECT s.*,
                   COALESCE(
                       json_agg(
                           json_build_object(
                               'address_id', a.address_id,
                               'address_type', a.address_type,
                               'address_line1', a.address_line1,
                               'address_line2', a.address_line2,
                               'city', a.city,
                               'state_code', a.state_code,
                               'state_name', a.state_name,
                               'pincode', a.pincode,
                               'is_default', a.is_default
                           ) ORDER BY a.is_default DESC
                       ) FILTER (WHERE a.address_id IS NOT NULL),
                       '[]'::json
                   ) as addresses
            FROM parties.suppliers s
            LEFT JOIN master.addresses a ON (
                a.entity_type = 'supplier' 
                AND a.entity_id = s.supplier_id 
                AND a.org_id = s.org_id
                AND a.is_active = true
            )
            WHERE s.supplier_id = :supplier_id
            GROUP BY s.supplier_id
        """), {"supplier_id": supplier_id})
        
        supplier = result.fetchone()
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")
        
        # Build response with database field names - NO ALIASES
        supplier_dict = dict(supplier._mapping)
        
        # Parse addresses JSON (json imported at top of file)
        addresses = supplier_dict.get("addresses", "[]")
        if isinstance(addresses, str):
            supplier_dict["addresses"] = json.loads(addresses)
        elif addresses is None:
            supplier_dict["addresses"] = []
        
        return supplier_dict
        
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "get supplier", supplier_id)

@router.post("/")
@with_tenant_context
async def create_supplier(
    supplier_data: SupplierCreate,
    _: dict = Depends(PermissionChecker("master", "create")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Create a new supplier.
    Uses database field names: supplier_name, supplier_code, primary_phone, etc.
    """
    try:
        org_id = str(context.org_id)
        
        # Generate supplier_code if not provided
        supplier_code = supplier_data.supplier_code
        if not supplier_code:
            count_result = db.execute(text("""
                SELECT COUNT(*) FROM parties.suppliers WHERE org_id = :org_id
            """), {"org_id": org_id}).scalar()
            supplier_code = f"SUP-{count_result + 1:04d}"
        
        # Insert supplier - using exact database field names
        result = db.execute(text("""
            INSERT INTO parties.suppliers (
                org_id, supplier_code, supplier_name, supplier_type,
                gst_number, pan_number, drug_license_number, drug_license_validity,
                primary_phone, secondary_phone, primary_email, 
                contact_person_name, contact_person_phone,
                bank_name, account_number, ifsc_code, account_holder_name,
                payment_days, quality_rating, delivery_rating, compliance_rating,
                internal_notes, is_active, created_at, updated_at
            ) VALUES (
                :org_id, :supplier_code, :supplier_name, :supplier_type,
                :gst_number, :pan_number, :drug_license_number, :drug_license_validity,
                :primary_phone, :secondary_phone, :primary_email,
                :contact_person_name, :contact_person_phone,
                :bank_name, :account_number, :ifsc_code, :account_holder_name,
                :payment_days, :quality_rating, :delivery_rating, :compliance_rating,
                :internal_notes, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING supplier_id, supplier_code, supplier_name, created_at
        """), {
            "org_id": org_id,
            "supplier_code": supplier_code,
            "supplier_name": supplier_data.supplier_name,
            "supplier_type": supplier_data.supplier_type,
            "gst_number": supplier_data.gst_number,
            "pan_number": supplier_data.pan_number,
            "drug_license_number": supplier_data.drug_license_number,
            "drug_license_validity": supplier_data.drug_license_validity,
            "primary_phone": supplier_data.primary_phone,
            "secondary_phone": supplier_data.secondary_phone,
            "primary_email": supplier_data.primary_email,
            "contact_person_name": supplier_data.contact_person_name,
            "contact_person_phone": supplier_data.contact_person_phone,
            "bank_name": supplier_data.bank_name,
            "account_number": supplier_data.account_number,
            "ifsc_code": supplier_data.ifsc_code,
            "account_holder_name": supplier_data.account_holder_name,
            "payment_days": supplier_data.payment_days,
            "quality_rating": supplier_data.quality_rating,
            "delivery_rating": supplier_data.delivery_rating,
            "compliance_rating": supplier_data.compliance_rating,
            "internal_notes": supplier_data.internal_notes
        })
        
        row = result.fetchone()
        supplier_id = row.supplier_id
        
        # Create address if provided
        if supplier_data.city and supplier_data.state_name:
            state_name, state_code = get_state_name_and_code(supplier_data.state_name)
            
            db.execute(text("""
                INSERT INTO master.addresses (
                    org_id, entity_type, entity_id, address_type,
                    address_line1, address_line2, city, state_code, state_name, pincode,
                    country, is_default, is_active, created_at
                ) VALUES (
                    :org_id, 'supplier', :entity_id, 'registered',
                    :address_line1, :address_line2, :city, :state_code, :state_name, :pincode,
                    'India', true, true, CURRENT_TIMESTAMP
                )
            """), {
                "org_id": org_id,
                "entity_id": supplier_id,
                "address_line1": supplier_data.address_line1 or "",
                "address_line2": supplier_data.address_line2,
                "city": supplier_data.city,
                "state_code": state_code,
                "state_name": state_name,
                "pincode": supplier_data.pincode or ""
            })
        
        db.commit()
        
        # Return database field names - NO ALIASES
        return {
            "supplier_id": supplier_id,
            "supplier_code": row.supplier_code,
            "supplier_name": row.supplier_name,
            "gst_number": supplier_data.gst_number,
            "primary_phone": supplier_data.primary_phone,
            "primary_email": supplier_data.primary_email,
            "created_at": row.created_at,
            "message": "Supplier created successfully"
        }
        
    except Exception as e:
        db.rollback()
        raise handle_error(e, "create supplier")

@router.put("/{supplier_id}")
@with_tenant_context
async def update_supplier(
    supplier_id: int,
    supplier_data: SupplierUpdate,
    _: dict = Depends(PermissionChecker("master", "edit")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Update a supplier. Uses TenantAwareSession for auto org_id filtering."""
    try:
        # Check if supplier exists (org_id auto-filtered)
        exists = db.execute(text("""
            SELECT 1 FROM parties.suppliers WHERE supplier_id = :supplier_id
        """), {"supplier_id": supplier_id}).scalar()
        
        if not exists:
            raise HTTPException(status_code=404, detail="Supplier not found")
        
        # Build update from provided fields - use database field names directly
        update_fields = []
        params = {"supplier_id": supplier_id}
        
        for field, value in supplier_data.dict(exclude_unset=True).items():
            if value is not None:
                update_fields.append(f"{field} = :{field}")
                params[field] = value
        
        if update_fields:
            update_fields.append("updated_at = CURRENT_TIMESTAMP")
            query = f"""
                UPDATE parties.suppliers
                SET {', '.join(update_fields)}
                WHERE supplier_id = :supplier_id
            """
            db.execute(text(query), params)
            db.commit()
        
        # Return updated supplier
        return await get_supplier(supplier_id, context, db)
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise handle_error(e, "update supplier", supplier_id)

@router.delete("/{supplier_id}")
@with_tenant_context
async def delete_supplier(
    supplier_id: int,
    _: dict = Depends(PermissionChecker("master", "delete")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Soft delete a supplier (marks as inactive)"""
    try:
        # Check if supplier exists (TenantAwareSession auto-filters by org_id)
        exists = db.execute(text("""
            SELECT 1 FROM parties.suppliers WHERE supplier_id = :supplier_id
        """), {"supplier_id": supplier_id}).scalar()

        if not exists:
            raise HTTPException(status_code=404, detail="Supplier not found")

        # Soft delete - mark as inactive
        db.execute(text("""
            UPDATE parties.suppliers
            SET is_active = false, updated_at = CURRENT_TIMESTAMP
            WHERE supplier_id = :supplier_id
        """), {"supplier_id": supplier_id})
        
        db.commit()
        return {"message": "Supplier deactivated successfully", "supplier_id": supplier_id}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise handle_error(e, "delete supplier", supplier_id)

@router.get("/{supplier_id}/products")
@with_tenant_context
async def get_supplier_products(
    supplier_id: int,
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get products from a specific supplier"""
    try:
        result = db.execute(text("""
            SELECT p.* FROM inventory.products p
            JOIN purchases pur ON p.product_id = pur.product_id AND p.org_id = pur.org_id
            WHERE pur.supplier_id = :supplier_id
            GROUP BY p.product_id
            ORDER BY p.product_name
        """), {"supplier_id": supplier_id})
        
        return [dict(row._mapping) for row in result]
        
    except Exception as e:
        raise handle_error(e, "get supplier products", supplier_id)

@router.get("/{supplier_id}/purchases")
@with_tenant_context
async def get_supplier_purchases(
    supplier_id: int,
    skip: int = 0,
    limit: int = 100,
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get purchase history for a supplier"""
    try:
        result = db.execute(text("""
            SELECT * FROM purchases
            WHERE supplier_id = :supplier_id
            ORDER BY purchase_date DESC
            LIMIT :limit OFFSET :skip
        """), {"supplier_id": supplier_id, "limit": limit, "skip": skip})
        
        return [dict(row._mapping) for row in result]
        
    except Exception as e:
        raise handle_error(e, "get supplier purchases", supplier_id)