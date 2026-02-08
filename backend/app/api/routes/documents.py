from fastapi import APIRouter, Depends, HTTPException, Query
from ...core.auth.tenant_service import get_tenant_aware_db, TenantAwareSession
from ...core.auth.jwt_auth import get_user_context_secure
import logging

from ..services.document_number_service import DocumentNumberService

router = APIRouter(prefix="/documents", tags=["Documents"])
logger = logging.getLogger(__name__)

# Map frontend prefix codes to backend document_type keys
DOC_TYPE_MAPPING = {
    "INV": "invoice",
    "PO": "purchase_order",
    "DC": "delivery_challan",
    "PR": "purchase_return",
    "SR": "sales_return",
    "PAY": "payment",
    "RCP": "receipt",
    "QT": "quotation",
    "SO": "sales_order",
    "GRN": "grn",
    "PUR": "supplier_invoice",
    "SRN": "sales_return",
    "PRN": "purchase_return",
    "CN": "credit_note",
    "DN": "debit_note",
    "ADJ": "adjustment",
    "TRF": "stock_receipt",
}

@router.get("/generate-number")
async def generate_document_number(
    type: str = Query(..., description="Document type code (INV, PO, etc.)"),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    current_user: dict = Depends(get_user_context_secure)
):
    """
    Generate next document number for any document type.
    Uses centralized DocumentNumberService for consistent FORMAT PREFIX-YYYYMMDDNNNN.
    """
    try:
        org_id = current_user.get("org_id")
        if not org_id:
            raise HTTPException(status_code=400, detail="No organization ID found")

        # Map frontend code to backend document type
        system_type = DOC_TYPE_MAPPING.get(type.upper(), type.lower())

        new_number = DocumentNumberService.generate_number(db, system_type, str(org_id))

        logger.info(f"Generated {type} number: {new_number} for org {org_id}")
        return {"number": new_number, "type": type}

    except ValueError as e:
        logger.error(f"Invalid document type {type}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to generate number for {type}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
