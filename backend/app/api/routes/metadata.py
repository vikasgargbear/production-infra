"""
Metadata API endpoints for fetching various options and configurations
Provides dropdown data, categories, and other metadata for frontend
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any
import logging

from ...core.database import get_db
from ...core.auth_utils import get_org_id_from_header

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/pack-types")
async def get_pack_types(db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)):
    """Get all available pack types for products"""
    return {
        "pack_types": [
            {"value": "STRIP", "label": "Strip", "description": "Strip packaging"},
            {"value": "BOX", "label": "Box", "description": "Box packaging"},
            {"value": "BOTTLE", "label": "Bottle", "description": "Bottle packaging"},
            {"value": "VIAL", "label": "Vial", "description": "Vial packaging"},
            {"value": "TUBE", "label": "Tube", "description": "Tube packaging"},
            {"value": "PACKET", "label": "Packet", "description": "Packet packaging"},
            {"value": "SACHET", "label": "Sachet", "description": "Sachet packaging"},
            {"value": "AMPOULE", "label": "Ampoule", "description": "Ampoule packaging"},
            {"value": "BLISTER", "label": "Blister", "description": "Blister pack"},
            {"value": "JAR", "label": "Jar", "description": "Jar packaging"},
            {"value": "POUCH", "label": "Pouch", "description": "Pouch packaging"},
            {"value": "CARTON", "label": "Carton", "description": "Carton packaging"},
            {"value": "PIECE", "label": "Piece", "description": "Individual piece"},
            {"value": "SET", "label": "Set", "description": "Set of items"},
            {"value": "UNIT", "label": "Unit", "description": "Single unit"}
        ]
    }

@router.get("/payment-terms")
async def get_payment_terms(db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)):
    """Get all available payment terms"""
    return {
        "payment_terms": [
            {"value": "CASH", "label": "Cash", "days": 0},
            {"value": "IMMEDIATE", "label": "Immediate", "days": 0},
            {"value": "7_DAYS", "label": "Net 7 Days", "days": 7},
            {"value": "10_DAYS", "label": "Net 10 Days", "days": 10},
            {"value": "15_DAYS", "label": "Net 15 Days", "days": 15},
            {"value": "21_DAYS", "label": "Net 21 Days", "days": 21},
            {"value": "30_DAYS", "label": "Net 30 Days", "days": 30},
            {"value": "45_DAYS", "label": "Net 45 Days", "days": 45},
            {"value": "60_DAYS", "label": "Net 60 Days", "days": 60},
            {"value": "90_DAYS", "label": "Net 90 Days", "days": 90},
            {"value": "120_DAYS", "label": "Net 120 Days", "days": 120},
            {"value": "ADVANCE", "label": "Advance Payment", "days": -1},
            {"value": "COD", "label": "Cash on Delivery", "days": 0},
            {"value": "2_10_NET_30", "label": "2/10 Net 30", "days": 30},
            {"value": "EOM", "label": "End of Month", "days": 30},
            {"value": "CUSTOM", "label": "Custom Terms", "days": null}
        ]
    }

@router.get("/payment-modes")
async def get_payment_modes(db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)):
    """Get all available payment modes"""
    return {
        "payment_modes": [
            {"value": "CASH", "label": "Cash", "requires_reference": False},
            {"value": "BANK_TRANSFER", "label": "Bank Transfer", "requires_reference": True},
            {"value": "CHEQUE", "label": "Cheque", "requires_reference": True},
            {"value": "CREDIT_CARD", "label": "Credit Card", "requires_reference": True},
            {"value": "DEBIT_CARD", "label": "Debit Card", "requires_reference": True},
            {"value": "UPI", "label": "UPI", "requires_reference": True},
            {"value": "NEFT", "label": "NEFT", "requires_reference": True},
            {"value": "RTGS", "label": "RTGS", "requires_reference": True},
            {"value": "IMPS", "label": "IMPS", "requires_reference": True},
            {"value": "WALLET", "label": "Digital Wallet", "requires_reference": True},
            {"value": "CREDIT", "label": "Credit", "requires_reference": False}
        ]
    }

@router.get("/document-statuses")
async def get_document_statuses(db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)):
    """Get all document status options"""
    return {
        "invoice_statuses": ["draft", "pending", "paid", "partial", "overdue", "cancelled"],
        "order_statuses": ["draft", "confirmed", "processing", "shipped", "delivered", "cancelled"],
        "payment_statuses": ["pending", "completed", "failed", "cancelled", "refunded"],
        "delivery_statuses": ["pending", "in_transit", "delivered", "returned", "failed"],
        "grn_statuses": ["draft", "partial", "completed", "cancelled"],
        "return_statuses": ["initiated", "approved", "rejected", "completed", "cancelled"]
    }

@router.get("/units-of-measure")
async def get_units_of_measure(db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)):
    """Get all units of measure"""
    return {
        "units": [
            {"value": "NOS", "label": "Numbers", "category": "quantity"},
            {"value": "PCS", "label": "Pieces", "category": "quantity"},
            {"value": "STRIPS", "label": "Strips", "category": "pharma"},
            {"value": "TABLETS", "label": "Tablets", "category": "pharma"},
            {"value": "CAPSULES", "label": "Capsules", "category": "pharma"},
            {"value": "ML", "label": "Milliliters", "category": "volume"},
            {"value": "L", "label": "Liters", "category": "volume"},
            {"value": "MG", "label": "Milligrams", "category": "weight"},
            {"value": "G", "label": "Grams", "category": "weight"},
            {"value": "KG", "label": "Kilograms", "category": "weight"},
            {"value": "BOX", "label": "Box", "category": "container"},
            {"value": "BOTTLE", "label": "Bottle", "category": "container"},
            {"value": "VIAL", "label": "Vial", "category": "container"},
            {"value": "PACKET", "label": "Packet", "category": "container"},
            {"value": "CARTON", "label": "Carton", "category": "container"}
        ]
    }

@router.get("/return-reasons")
async def get_return_reasons(db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)):
    """Get all return reason options"""
    return {
        "sales_return_reasons": [
            {"value": "EXPIRED", "label": "Expired Product"},
            {"value": "DAMAGED", "label": "Damaged Product"},
            {"value": "WRONG_PRODUCT", "label": "Wrong Product Delivered"},
            {"value": "QUALITY_ISSUE", "label": "Quality Issue"},
            {"value": "NOT_REQUIRED", "label": "Not Required"},
            {"value": "DUPLICATE_ORDER", "label": "Duplicate Order"},
            {"value": "PRICE_ISSUE", "label": "Price Issue"},
            {"value": "OTHER", "label": "Other Reason"}
        ],
        "purchase_return_reasons": [
            {"value": "EXPIRED", "label": "Expired Product"},
            {"value": "DAMAGED", "label": "Damaged/Defective Product"},
            {"value": "WRONG_PRODUCT", "label": "Wrong Product Received"},
            {"value": "QUALITY_ISSUE", "label": "Quality Issue"},
            {"value": "EXCESS_QUANTITY", "label": "Excess Quantity"},
            {"value": "SHORT_EXPIRY", "label": "Short Expiry"},
            {"value": "NOT_ORDERED", "label": "Product Not Ordered"},
            {"value": "PRICE_MISMATCH", "label": "Price Mismatch"},
            {"value": "OTHER", "label": "Other Reason"}
        ]
    }

@router.get("/tax-types")
async def get_tax_types(db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)):
    """Get all tax type options"""
    return {
        "tax_types": [
            {"value": "GST_5", "label": "GST 5%", "rate": 5.0, "cgst": 2.5, "sgst": 2.5},
            {"value": "GST_12", "label": "GST 12%", "rate": 12.0, "cgst": 6.0, "sgst": 6.0},
            {"value": "GST_18", "label": "GST 18%", "rate": 18.0, "cgst": 9.0, "sgst": 9.0},
            {"value": "GST_28", "label": "GST 28%", "rate": 28.0, "cgst": 14.0, "sgst": 14.0},
            {"value": "IGST_5", "label": "IGST 5%", "rate": 5.0, "igst": 5.0},
            {"value": "IGST_12", "label": "IGST 12%", "rate": 12.0, "igst": 12.0},
            {"value": "IGST_18", "label": "IGST 18%", "rate": 18.0, "igst": 18.0},
            {"value": "IGST_28", "label": "IGST 28%", "rate": 28.0, "igst": 28.0},
            {"value": "EXEMPT", "label": "Tax Exempt", "rate": 0.0}
        ]
    }

@router.get("/transport-modes")
async def get_transport_modes(db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)):
    """Get all transport mode options"""
    return {
        "transport_modes": [
            {"value": "ROAD", "label": "By Road"},
            {"value": "RAIL", "label": "By Rail"},
            {"value": "AIR", "label": "By Air"},
            {"value": "SHIP", "label": "By Ship/Sea"},
            {"value": "COURIER", "label": "Courier Service"},
            {"value": "HAND_DELIVERY", "label": "Hand Delivery"},
            {"value": "SELF_PICKUP", "label": "Self Pickup"}
        ]
    }

@router.get("/all")
async def get_all_metadata(db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)):
    """Get all metadata in one call for caching"""
    try:
        return {
            "pack_types": (await get_pack_types(db))["pack_types"],
            "payment_terms": (await get_payment_terms(db))["payment_terms"],
            "payment_modes": (await get_payment_modes(db))["payment_modes"],
            "document_statuses": await get_document_statuses(db),
            "units_of_measure": (await get_units_of_measure(db))["units"],
            "return_reasons": await get_return_reasons(db),
            "tax_types": (await get_tax_types(db))["tax_types"],
            "transport_modes": (await get_transport_modes(db))["transport_modes"]
        }
    except Exception as e:
        logger.error(f"Error fetching metadata: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch metadata: {str(e)}")