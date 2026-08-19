"""
Suppliers API Router
Manages pharmaceutical suppliers and vendors

PRODUCTION-READY: Uses TenantAwareSession for AI-agent safety
REFACTORED: All SQL moved to SupplierService
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
import logging
import json

# Core utilities - shared across all APIs
from .....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from .....core.auth.org_context import get_org_context, OrgContext
from .....core.utils.state_utils import get_state_name_and_code
from .....core.utils.api_utils import handle_error
from .....core.security.permissions import PermissionChecker  # RBAC

# Service layer
from ....services.master.supplier.service import SupplierService
from ....services.document_number_service import DocumentNumberService

# Supplier-specific imports
from ....schemas.master.supplier import SupplierCreate, SupplierUpdate, SupplierResponse, SupplierListResponse

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
    """Search suppliers by name, code, GSTIN, phone, or email"""
    try:
        return SupplierService.search_suppliers(
            db, str(context.org_id), search_term, limit, offset
        )
    except HTTPException:
        raise
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
        return SupplierService.list_suppliers(
            db, str(context.org_id), search, skip, limit
        )
    except HTTPException:
        raise
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
        supplier_dict = SupplierService.get_supplier_with_addresses(
            db, str(context.org_id), supplier_id
        )
        
        if not supplier_dict:
            raise HTTPException(status_code=404, detail="Supplier not found")
        
        # Parse addresses JSON
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
    """Create a new supplier."""
    try:
        org_id = str(context.org_id)
        
        # Generate supplier_code if not provided
        supplier_code = supplier_data.supplier_code
        if not supplier_code:
            supplier_code = DocumentNumberService.generate_number(db, "supplier", org_id)
        
        # Build supplier data dict (map schema fields to DB column names)
        data = {
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
            "contact_person_name": supplier_data.contact_person,
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
        }
        
        # Insert supplier
        result = SupplierService.insert_supplier(db, org_id, data)
        supplier_id = result.get("supplier_id")
        
        # Create address if provided (schema field is 'state', not 'state_name')
        if supplier_data.city and supplier_data.state:
            state_name, state_code = get_state_name_and_code(supplier_data.state)
            
            address_data = {
                "address_line1": supplier_data.address_line1 or "",
                "address_line2": supplier_data.address_line2,
                "city": supplier_data.city,
                "state_code": state_code,
                "state_name": state_name,
                "pincode": supplier_data.pincode or ""
            }
            SupplierService.insert_address(db, org_id, "supplier", supplier_id, address_data)
        
        db.commit()
        
        return {
            "supplier_id": supplier_id,
            "supplier_code": result.get("supplier_code"),
            "supplier_name": result.get("supplier_name"),
            "gst_number": supplier_data.gst_number,
            "primary_phone": supplier_data.primary_phone,
            "primary_email": supplier_data.primary_email,
            "created_at": result.get("created_at"),
            "message": "Supplier created successfully"
        }
        
    except HTTPException:
        db.rollback()
        raise
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
    """Update a supplier."""
    try:
        org_id = str(context.org_id)
        
        # Check if supplier exists
        if not SupplierService.supplier_exists(db, org_id, supplier_id):
            raise HTTPException(status_code=404, detail="Supplier not found")
        
        # Build update from provided fields
        update_fields = []
        params = {}
        
        for field, value in supplier_data.dict(exclude_unset=True).items():
            if value is not None:
                update_fields.append(f"{field} = :{field}")
                params[field] = value
        
        if update_fields:
            SupplierService.update_supplier_dynamic(db, supplier_id, org_id, update_fields, params)
            db.commit()
        
        # Return updated supplier
        return await get_supplier(supplier_id, _, context, db)
        
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
        org_id = str(context.org_id)
        
        if not SupplierService.supplier_exists(db, org_id, supplier_id):
            raise HTTPException(status_code=404, detail="Supplier not found")

        SupplierService.soft_delete_supplier(db, supplier_id, org_id)
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
        return SupplierService.get_supplier_products(db, str(context.org_id), supplier_id)
    except HTTPException:
        raise
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
        return SupplierService.get_supplier_purchases(
            db, str(context.org_id), supplier_id, skip, limit
        )
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "get supplier purchases", supplier_id)
