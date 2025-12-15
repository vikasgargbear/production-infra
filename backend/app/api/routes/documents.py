from fastapi import APIRouter, Depends, HTTPException, Query
from ....core.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from ....core.org_context import get_org_context, OrgContext
from ....core.permissions import PermissionChecker
from ...services.document_number_service import DocumentNumberService
import logging

router = APIRouter(prefix="/documents", tags=["Documents"])
logger = logging.getLogger(__name__)

DOC_TYPE_MAPPING = {
    "INV": "invoice",
    "PO": "purchase_order",
    "DC": "delivery_challan",
    "PR": "purchase_return",
    "SR": "sales_return",
    "PAY": "payment",
    "RCP": "receipt",
    "QT": "quotation",
    "PI": "proforma"
}

@router.get("/generate-number")
@with_tenant_context
async def generate_document_number(
    type: str = Query(..., description="Document type code (INV, PO, etc.)"),
    _: dict = Depends(PermissionChecker("common", "view")), # Basic permission
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Generate next document number for any document type.
    """
    try:
        org_id = str(context.org_id)
        
        # Map frontend code to backend type
        system_type = DOC_TYPE_MAPPING.get(type, type.lower())
        
        # Determine internal type
        if type not in DOC_TYPE_MAPPING and type not in DOC_TYPE_MAPPING.values():
             # Fallback: treat as-is but lowercase
             system_type = type.lower()

        new_number = DocumentNumberService.generate_number(db.session, system_type, org_id)
        return {"number": new_number, "type": type}
        
    except Exception as e:
        logger.error(f"Failed to generate number for {type}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
