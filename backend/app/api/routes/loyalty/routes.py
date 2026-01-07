"""
Loyalty Points Management API
REFACTORED: Uses LoyaltyService for database operations
"""
from typing import Optional
from datetime import date, datetime, timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
import logging

from ....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from ....core.auth.org_context import get_org_context, OrgContext
from ....core.security.permissions import PermissionChecker
from ...services.loyalty.service import LoyaltyService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/loyalty", tags=["loyalty-points"])

class LoyaltyProgramCreate(BaseModel):
    program_name: str
    description: Optional[str] = None
    points_per_rupee: float = Field(default=1.0)
    redemption_ratio: float = Field(default=0.25)
    min_purchase_amount: Optional[Decimal] = None
    min_redemption_points: int = Field(default=100)
    max_redemption_percentage: float = Field(default=50)
    points_validity_days: Optional[int] = None
    tier_based: bool = Field(default=False)
    is_active: bool = True

class CustomerTier(BaseModel):
    tier_name: str
    min_points_required: int
    points_multiplier: float = Field(default=1.0)
    additional_benefits: Optional[dict] = None

class PointsTransaction(BaseModel):
    customer_id: int
    transaction_type: str = Field(..., pattern="^(earned|redeemed|expired|adjusted|bonus)$")
    points: int
    reference_type: Optional[str] = Field(None, pattern="^(invoice|order|manual|campaign)$")
    reference_id: Optional[int] = None
    remarks: Optional[str] = None

class PointsRedemption(BaseModel):
    customer_id: int
    invoice_id: int
    points_to_redeem: int

@router.post("/programs", response_model=dict)
@with_tenant_context
async def create_loyalty_program(
    program: LoyaltyProgramCreate,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Create a new loyalty program"""
    try:
        program_id = LoyaltyService.insert_loyalty_program(db, str(context.org_id), {
            "program_name": program.program_name, "description": program.description,
            "points_per_rupee": program.points_per_rupee, "redemption_ratio": program.redemption_ratio,
            "min_purchase_amount": program.min_purchase_amount, "min_redemption_points": program.min_redemption_points,
            "max_redemption_percentage": program.max_redemption_percentage,
            "points_validity_days": program.points_validity_days, "tier_based": program.tier_based,
            "is_active": program.is_active, "created_by": 1
        })
        return {"program_id": program_id, "message": "Loyalty program created successfully"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating loyalty program: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create loyalty program: {str(e)}")

@router.get("/programs/active")
@with_tenant_context
async def get_active_program(
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get the active loyalty program"""
    try:
        program = LoyaltyService.get_active_program(db, str(context.org_id))
        if not program:
            return {"message": "No active loyalty program found"}
        if program.get("tier_based"):
            program["tiers"] = LoyaltyService.get_program_tiers(db, program["program_id"])
        return program
    except Exception as e:
        logger.error(f"Error fetching active program: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch active program")

@router.post("/programs/{program_id}/tiers")
@with_tenant_context
async def add_program_tier(
    program_id: int, tier: CustomerTier,
    _: dict = Depends(PermissionChecker("sales", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Add a tier to a loyalty program"""
    try:
        tier_based = LoyaltyService.get_program_tier_status(db, program_id)
        if tier_based is None:
            raise HTTPException(status_code=404, detail="Program not found")
        if not tier_based:
            raise HTTPException(status_code=400, detail="Program is not tier-based")
        
        tier_id = LoyaltyService.insert_tier(db, {
            "program_id": program_id, "tier_name": tier.tier_name,
            "min_points_required": tier.min_points_required, "points_multiplier": tier.points_multiplier,
            "additional_benefits": str(tier.additional_benefits) if tier.additional_benefits else None
        })
        return {"tier_id": tier_id, "message": "Tier added successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error adding tier: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to add tier: {str(e)}")

@router.get("/customers/{customer_id}/points")
@with_tenant_context
async def get_customer_points(
    customer_id: int,
    _: dict = Depends(PermissionChecker("sales", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get customer's loyalty points summary"""
    try:
        balance_data = LoyaltyService.get_customer_points_balance(db, customer_id)
        expiry_data = LoyaltyService.get_expiring_points(db, customer_id)
        tier = LoyaltyService.get_customer_tier(db, int(balance_data["total_earned"]))
        transactions = LoyaltyService.get_recent_transactions(db, customer_id, 10)
        
        return {
            "customer_id": customer_id,
            "current_balance": int(balance_data["current_balance"]),
            "total_earned": int(balance_data["total_earned"]),
            "total_redeemed": int(balance_data["total_redeemed"]),
            "expiring_soon": {"points": int(expiry_data["expiring_points"] or 0), "expiry_date": expiry_data["next_expiry_date"]},
            "current_tier": tier,
            "recent_transactions": transactions
        }
    except Exception as e:
        logger.error(f"Error fetching customer points: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch customer points")

@router.post("/earn")
@with_tenant_context
async def earn_points(
    transaction: PointsTransaction,
    _: dict = Depends(PermissionChecker("sales", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Record points earned by customer"""
    try:
        program = LoyaltyService.get_active_program_simple(db)
        if not program:
            raise HTTPException(status_code=400, detail="No active loyalty program")
        
        expiry_date = None
        if program["points_validity_days"]:
            expiry_date = date.today() + timedelta(days=program["points_validity_days"])
        
        transaction_id = LoyaltyService.insert_transaction(db, {
            "program_id": program["program_id"], "customer_id": transaction.customer_id,
            "transaction_type": transaction.transaction_type, "points": transaction.points,
            "reference_type": transaction.reference_type, "reference_id": transaction.reference_id,
            "remarks": transaction.remarks, "expiry_date": expiry_date, "created_by": 1
        })
        
        new_balance = LoyaltyService.get_balance_after_transaction(db, transaction.customer_id)
        return {"transaction_id": transaction_id, "points_earned": transaction.points, "new_balance": int(new_balance), "expiry_date": expiry_date}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error earning points: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to record points: {str(e)}")

@router.post("/redeem")
@with_tenant_context
async def redeem_points(
    redemption: PointsRedemption,
    _: dict = Depends(PermissionChecker("sales", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Redeem loyalty points for invoice discount"""
    try:
        program = LoyaltyService.get_active_program_for_redemption(db)
        if not program:
            raise HTTPException(status_code=400, detail="No active loyalty program")
        
        if redemption.points_to_redeem < program["min_redemption_points"]:
            raise HTTPException(status_code=400, detail=f"Minimum {program['min_redemption_points']} points required")
        
        balance_data = LoyaltyService.get_customer_points_balance(db, redemption.customer_id)
        current_balance = balance_data["current_balance"]
        if current_balance < redemption.points_to_redeem:
            raise HTTPException(status_code=400, detail="Insufficient points balance")
        
        invoice = LoyaltyService.get_invoice_for_redemption(db, redemption.invoice_id)
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        if invoice.get("loyalty_points_used"):
            raise HTTPException(status_code=400, detail="Points already redeemed for this invoice")
        
        redemption_value = redemption.points_to_redeem * program["redemption_ratio"]
        max_allowed = float(invoice["final_amount"]) * (program["max_redemption_percentage"] / 100)
        if redemption_value > max_allowed:
            redemption_value = max_allowed
            actual_points_used = int(redemption_value / program["redemption_ratio"])
        else:
            actual_points_used = redemption.points_to_redeem
        
        transaction_id = LoyaltyService.insert_redemption_transaction(db, {
            "program_id": program["program_id"], "customer_id": redemption.customer_id,
            "points": actual_points_used, "invoice_id": redemption.invoice_id,
            "remarks": f"Redeemed for invoice discount - Rs. {redemption_value}", "created_by": 1
        })
        
        LoyaltyService.update_invoice_loyalty_discount(db, redemption.invoice_id, actual_points_used, redemption_value)
        new_balance = current_balance - actual_points_used
        
        return {"transaction_id": transaction_id, "points_redeemed": actual_points_used, "discount_amount": redemption_value, "new_balance": int(new_balance)}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error redeeming points: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to redeem points: {str(e)}")

@router.post("/points/expire")
@with_tenant_context
async def expire_points(
    _: dict = Depends(PermissionChecker("sales", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Process expired points"""
    try:
        expired_records = LoyaltyService.get_expired_points_to_process(db)
        total_expired = 0
        
        for record in expired_records:
            LoyaltyService.insert_expiry_transaction(
                db, record["customer_id"], record["expired_amount"],
                f"Points expired - {len(record['transaction_ids'])} transactions"
            )
            total_expired += record["expired_amount"]
        
        return {"customers_affected": len(expired_records), "total_points_expired": total_expired, "process_date": date.today()}
    except Exception as e:
        db.rollback()
        logger.error(f"Error expiring points: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to expire points: {str(e)}")

@router.get("/analytics/summary")
@with_tenant_context
async def get_loyalty_analytics(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get loyalty program analytics"""
    try:
        stats = LoyaltyService.get_loyalty_analytics(db, from_date, to_date)
        top_customers = LoyaltyService.get_top_customers_by_points(db, 10)
        
        date_filter = ""
        params = {}
        if from_date:
            date_filter += " AND lt.created_at >= :from_date"
            params["from_date"] = from_date
        if to_date:
            date_filter += " AND lt.created_at <= :to_date"
            params["to_date"] = to_date
        
        redemption_patterns = LoyaltyService.get_redemption_trends(db, params, date_filter)
        
        return {
            "summary": stats, "top_customers": top_customers,
            "redemption_trends": redemption_patterns,
            "report_period": {"from_date": from_date, "to_date": to_date}
        }
    except Exception as e:
        logger.error(f"Error fetching loyalty analytics: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch analytics")

@router.post("/campaigns/bonus")
@with_tenant_context
async def run_bonus_campaign(
    campaign_data: dict,
    _: dict = Depends(PermissionChecker("sales", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Run a bonus points campaign"""
    try:
        campaign_type = campaign_data.get("campaign_type")
        bonus_points = campaign_data.get("bonus_points", 0)
        criteria = campaign_data.get("criteria", {})
        
        program = LoyaltyService.get_active_program_simple(db)
        if not program:
            raise HTTPException(status_code=400, detail="No active loyalty program")
        
        params = {}
        if campaign_type == "tier":
            params = {"program_id": program["program_id"], "tier_name": criteria.get("tier_name")}
        elif campaign_type == "purchase_based":
            params = {"min_purchase": criteria.get("min_purchase_amount", 0), "days_back": criteria.get("days_back", 30)}
        elif campaign_type != "all":
            raise HTTPException(status_code=400, detail="Invalid campaign type")
        
        eligible_customers = LoyaltyService.get_customers_for_campaign(db, campaign_type, params)
        
        expiry_date = None
        if program["points_validity_days"]:
            expiry_date = date.today() + timedelta(days=program["points_validity_days"])
        
        for customer_id in eligible_customers:
            LoyaltyService.insert_bonus_points(db, {
                "program_id": program["program_id"], "customer_id": customer_id,
                "points": bonus_points, "remarks": campaign_data.get("campaign_name", "Bonus points campaign"),
                "expiry_date": expiry_date
            })
        
        return {
            "campaign_name": campaign_data.get("campaign_name"), "customers_awarded": len(eligible_customers),
            "points_per_customer": bonus_points, "total_points_awarded": len(eligible_customers) * bonus_points,
            "expiry_date": expiry_date
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error running bonus campaign: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to run campaign: {str(e)}")