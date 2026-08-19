from fastapi import APIRouter, Depends, HTTPException, Query
from ...core.auth.tenant_service import (
    get_tenant_aware_db,
    with_tenant_context,
    TenantAwareSession,
)
from ...core.auth.org_context import get_org_context, OrgContext
from ...core.security.permissions import PermissionChecker, check_permission
import logging

from ..services.document_number_service import (
    DocumentNumberService,
    document_number_reservation_openapi,
)

router = APIRouter(prefix="/documents", tags=["Documents"])
logger = logging.getLogger(__name__)

# Map frontend prefix codes to backend document_type keys
DOC_TYPE_MAPPING = {
    "INV": "invoice",
    "PO": "purchase_order",
    "DC": "delivery_challan",
    "PAY": "payment",
    "RCT": "receipt",
    "SO": "sales_order",
    "GRN": "grn",
    "PINV": "supplier_invoice",
    "SRN": "sales_return",
    "PRN": "purchase_return",
    "CN": "credit_note",
    "DN": "debit_note",
    "ADJ": "adjustment",
    "ST": "stock_transfer",
}

DOCUMENT_TYPE_PERMISSIONS = {
    "INV": "sales",
    "PO": "purchase",
    "DC": "sales",
    "PAY": "finance",
    "RCT": "finance",
    "SO": "sales",
    "GRN": "inventory",
    "PINV": "purchase",
    "SRN": "sales_returns",
    "PRN": "purchase_returns",
    "CN": "finance",
    "DN": "finance",
    "ADJ": "inventory",
    "ST": "inventory",
}

@router.post(
    "/generate-number",
    operation_id="documents_reserve_number_v1",
    summary="Reserve a document number",
    openapi_extra=document_number_reservation_openapi("dynamic.create"),
)
@with_tenant_context
async def generate_document_number(
    type: str = Query(..., description="Document type code (INV, PO, etc.)"),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    current_user: dict = Depends(PermissionChecker()),
    context: OrgContext = Depends(get_org_context),
):
    """
    Reserve the next number for a supported document type.

    This consumes and commits the organization-scoped sequence. Document create
    operations generate their final identifier inside the create transaction.
    """
    try:
        document_code = type.upper()
        system_type = DOC_TYPE_MAPPING.get(document_code)
        permission_module = DOCUMENT_TYPE_PERMISSIONS.get(document_code)
        if not system_type or not permission_module:
            raise HTTPException(status_code=400, detail="Unsupported document type")
        if not check_permission(current_user, permission_module, "create"):
            raise HTTPException(
                status_code=403,
                detail=f"Permission denied: create on {permission_module}",
            )

        org_id = str(context.org_id)
        new_number = DocumentNumberService.reserve_number(db, system_type, org_id)

        logger.info(
            "Reserved %s number %s for org %s and user %s",
            document_code,
            new_number,
            org_id,
            context.user_id,
        )
        return {"number": new_number, "type": document_code, "reserved": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate number for {type}: {e}")
        raise HTTPException(status_code=500, detail="Failed to reserve document number")
