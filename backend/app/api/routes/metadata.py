"""
Metadata API endpoints for fetching various options and configurations
Provides dropdown data, categories, and other metadata for frontend
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from typing import List, Dict, Any
import logging

from ...core.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from ...core.org_context import get_org_context, OrgContext
from ...core.permissions import PermissionChecker
# get_org_id_string replaced with OrgContext

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/categories")
@with_tenant_context
async def get_product_categories(
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get all product categories from database"""
    try:
        query = """
            SELECT category_id, category_name, category_description
            FROM inventory.product_categories
            ORDER BY category_name
        """
        result = db.execute(text(query))
        categories = [
            {
                "category_id": row.category_id,
                "category_name": row.category_name,
                "category_description": row.category_description
            }
            for row in result
        ]
        return categories
    except Exception as e:
        logger.error(f"Error fetching categories: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch categories")

@router.get("/pack-types")
@with_tenant_context
async def get_pack_types(db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)):
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
@with_tenant_context
async def get_payment_terms(db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)):
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
            {"value": "CUSTOM", "label": "Custom Terms", "days": None}
        ]
    }

@router.get("/payment-modes")
@with_tenant_context
async def get_payment_modes(db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)):
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
@with_tenant_context
async def get_document_statuses(db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)):
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
@with_tenant_context
async def get_units_of_measure(db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)):
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
@with_tenant_context
async def get_return_reasons(db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)):
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
@with_tenant_context
async def get_tax_types(db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)):
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
@with_tenant_context
async def get_transport_modes(db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)):
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

@router.get("/credit-plans")
@with_tenant_context
async def get_credit_plans(db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)):
    """Get available credit plans from customer groups"""
    try:
        # Fetch from customer_groups table filtered by group_type
        result = db.execute(
            text("""
                SELECT 
                    group_code as value,
                    group_name as label,
                    credit_limit_multiplier,
                    payment_terms_days,
                    discount_percentage
                FROM parties.customer_groups
                WHERE (org_id = :org_id OR org_id = '00000000-0000-0000-0000-000000000000')
                    AND group_type = 'CREDIT_PLAN'
                    AND is_active = true
                ORDER BY credit_limit_multiplier
            """),
            {"org_id": str(context.org_id)}
        )
        
        plans = []
        for row in result:
            plans.append({
                "value": row.value,
                "label": row.label,
                "credit_limit_multiplier": float(row.credit_limit_multiplier) if row.credit_limit_multiplier else 1.0,
                "payment_terms_days": row.payment_terms_days or 30,
                "discount_percentage": float(row.discount_percentage) if row.discount_percentage else 0
            })
        
        # Add default if no plans exist
        if not plans:
            plans = [
                {"value": "STANDARD", "label": "Standard Plan", "credit_limit_multiplier": 1.0, "payment_terms_days": 30, "discount_percentage": 0},
                {"value": "PREMIUM", "label": "Premium Plan", "credit_limit_multiplier": 2.0, "payment_terms_days": 45, "discount_percentage": 5},
                {"value": "VIP", "label": "VIP Plan", "credit_limit_multiplier": 5.0, "payment_terms_days": 60, "discount_percentage": 10}
            ]
        
        return {"credit_plans": plans}
    except Exception as e:
        logger.error(f"Error fetching credit plans: {str(e)}")
        # Return hardcoded fallback
        return {
            "credit_plans": [
                {"value": "STANDARD", "label": "Standard Plan"},
                {"value": "PREMIUM", "label": "Premium Plan"},
                {"value": "VIP", "label": "VIP Plan"}
            ]
        }

@router.get("/credit-days")
@with_tenant_context
async def get_credit_days_options(db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)):
    """Get standard credit days options"""
    return {
        "credit_days": [
            {"value": 0, "label": "0 Days (Cash Only)"},
            {"value": 7, "label": "7 Days"},
            {"value": 10, "label": "10 Days"},
            {"value": 15, "label": "15 Days"},
            {"value": 21, "label": "21 Days"},
            {"value": 30, "label": "30 Days"},
            {"value": 45, "label": "45 Days"},
            {"value": 60, "label": "60 Days"},
            {"value": 90, "label": "90 Days"},
            {"value": 120, "label": "120 Days"},
            {"value": 180, "label": "180 Days"},
            {"value": 365, "label": "365 Days"}
        ]
    }

@router.get("/credit-ratings")
@with_tenant_context
async def get_credit_ratings(db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)):
    """Get credit rating options from customer_groups table"""
    try:
        # Fetch from customer_groups table with group_type = 'CREDIT_RATING'
        result = db.execute(
            text("""
                SELECT 
                    CASE 
                        WHEN group_code LIKE 'RATING_%' THEN SUBSTRING(group_code FROM 8)
                        ELSE group_code
                    END as value,
                    group_name as label,
                    eligibility_criteria->>'description' as description,
                    (eligibility_criteria->>'score')::numeric as score
                FROM parties.customer_groups
                WHERE (org_id = :org_id OR org_id = '00000000-0000-0000-0000-000000000000')
                    AND group_type = 'CREDIT_RATING' 
                    AND is_active = true
                ORDER BY group_code
            """),
            {"org_id": str(context.org_id)}
        )
        
        ratings = []
        for row in result:
            ratings.append({
                "value": row.value,
                "label": row.label,
                "description": row.description,
                "score": float(row.score) if row.score else 0
            })
        
        if ratings:
            return {"credit_ratings": ratings}
    except Exception as e:
        logger.debug(f"Database fetch failed: {str(e)}")
    
    # Return hardcoded values as fallback
    return {
        "credit_ratings": [
            {"value": "A", "label": "A - Excellent", "description": "Excellent payment history, high creditworthiness", "score": 5},
            {"value": "B", "label": "B - Good", "description": "Good payment history, reliable customer", "score": 4},
            {"value": "C", "label": "C - Average", "description": "Average payment history, standard terms", "score": 3},
            {"value": "D", "label": "D - Poor", "description": "Poor payment history, restricted credit", "score": 2},
            {"value": "NEW", "label": "New Customer", "description": "No credit history available", "score": 1},
            {"value": "BLOCKED", "label": "Blocked", "description": "Credit blocked due to payment issues", "score": 0}
        ]
    }

@router.get("/all")
@with_tenant_context
async def get_all_metadata(db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)):
    """Get all metadata in one call for caching - Enterprise approach"""
    try:
        # Fetch all metadata in one go for better performance
        metadata = {
            "pack_types": (await get_pack_types(db, org_id))["pack_types"],
            "payment_terms": (await get_payment_terms(db, org_id))["payment_terms"],
            "payment_modes": (await get_payment_modes(db, org_id))["payment_modes"],
            "credit_plans": (await get_credit_plans(db, org_id))["credit_plans"],
            "credit_days": (await get_credit_days_options(db, org_id))["credit_days"],
            "credit_ratings": (await get_credit_ratings(db, org_id))["credit_ratings"],
            "document_statuses": await get_document_statuses(db, org_id),
            "units_of_measure": (await get_units_of_measure(db, org_id))["units"],
            "return_reasons": await get_return_reasons(db, org_id),
            "tax_types": (await get_tax_types(db, org_id))["tax_types"],
            "transport_modes": (await get_transport_modes(db, org_id))["transport_modes"],
            
            # Combined credit configuration for easy frontend consumption
            "credit_configuration": {
                "plans": (await get_credit_plans(db, org_id))["credit_plans"],
                "ratings": (await get_credit_ratings(db, org_id))["credit_ratings"],
                "days_options": (await get_credit_days_options(db, org_id))["credit_days"],
                "payment_terms": (await get_payment_terms(db, org_id))["payment_terms"]
            }
        }
        
        return metadata
    except Exception as e:
        logger.error(f"Error fetching metadata: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch metadata: {str(e)}")