"""
Loyalty Points Management API
Manages customer loyalty programs, points earning and redemption
"""
from typing import Optional
from datetime import date, datetime, timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from pydantic import BaseModel, Field
import logging

from ...core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from ...core.auth.org_context import get_org_context, OrgContext
from ...core.security.permissions import PermissionChecker
from ...core.auth.jwt_auth import get_org_id_string

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/loyalty", tags=["loyalty-points"])

class LoyaltyProgramCreate(BaseModel):
    """Schema for creating a loyalty program"""
    program_name: str
    description: Optional[str] = None
    points_per_rupee: float = Field(default=1.0, description="Points earned per rupee spent")
    redemption_ratio: float = Field(default=0.25, description="Rupee value per point when redeeming")
    min_purchase_amount: Optional[Decimal] = Field(None, description="Minimum purchase to earn points")
    min_redemption_points: int = Field(default=100, description="Minimum points required for redemption")
    max_redemption_percentage: float = Field(default=50, description="Max % of bill that can be paid with points")
    points_validity_days: Optional[int] = Field(None, description="Days before points expire")
    tier_based: bool = Field(default=False, description="Enable tier-based benefits")
    is_active: bool = True

class CustomerTier(BaseModel):
    """Schema for customer tier configuration"""
    tier_name: str
    min_points_required: int
    points_multiplier: float = Field(default=1.0, description="Multiply earned points by this factor")
    additional_benefits: Optional[dict] = None

class PointsTransaction(BaseModel):
    """Schema for points transaction"""
    customer_id: int
    transaction_type: str = Field(..., pattern="^(earned|redeemed|expired|adjusted|bonus)$")
    points: int
    reference_type: Optional[str] = Field(None, pattern="^(invoice|order|manual|campaign)$")
    reference_id: Optional[int] = None
    remarks: Optional[str] = None

class PointsRedemption(BaseModel):
    """Schema for points redemption request"""
    customer_id: int
    invoice_id: int
    points_to_redeem: int

@router.post("/programs", response_model=dict)
@with_tenant_context
async def create_loyalty_program(
    program: LoyaltyProgramCreate,
    org_id: str = Depends(get_org_id_string),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """
    Create a new loyalty program
    
    - Configure earning and redemption rules
    - Set validity and restrictions
    - Enable tier-based benefits
    """
    try:
        insert_query = """
            INSERT INTO sales.loyalty_programs (
                org_id, program_name, description, points_per_rupee,
                redemption_ratio, min_purchase_amount, min_redemption_points,
                max_redemption_percentage, points_validity_days, tier_based,
                is_active, created_by
            ) VALUES (
                :org_id, :program_name, :description, :points_per_rupee,
                :redemption_ratio, :min_purchase_amount, :min_redemption_points,
                :max_redemption_percentage, :points_validity_days, :tier_based,
                :is_active, :created_by
            ) RETURNING program_id
        """
        
        result = db.execute(text(insert_query), {
            "org_id": str(context.org_id),
            "program_name": program.program_name,
            "description": program.description,
            "points_per_rupee": program.points_per_rupee,
            "redemption_ratio": program.redemption_ratio,
            "min_purchase_amount": program.min_purchase_amount,
            "min_redemption_points": program.min_redemption_points,
            "max_redemption_percentage": program.max_redemption_percentage,
            "points_validity_days": program.points_validity_days,
            "tier_based": program.tier_based,
            "is_active": program.is_active,
            "created_by": 1
        })
        
        program_id = result.scalar()
        # TenantAwareSession auto-commits
        
        return {
            "program_id": program_id,
            "message": "Loyalty program created successfully"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating loyalty program: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create loyalty program: {str(e)}")

@router.get("/programs/active")
@with_tenant_context
async def get_active_program(
    org_id: str = Depends(get_org_id_string),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """Get the active loyalty program for the organization"""
    try:
        query = """
            SELECT * FROM sales.loyalty_programs
            WHERE org_id = :org_id AND is_active = true
            ORDER BY created_at DESC
            LIMIT 1
        """
        
        result = db.execute(text(query), {"org_id": str(context.org_id)})
        program = result.first()
        
        if not program:
            return {"message": "No active loyalty program found"}
        
        program_data = dict(program._mapping)
        
        # Get tiers if tier-based
        if program_data["tier_based"]:
            tiers_query = """
                SELECT * FROM sales.loyalty_tiers
                WHERE program_id = :program_id
                ORDER BY min_points_required
            """
            tiers_result = db.execute(text(tiers_query), {"program_id": program_data["program_id"]})
            program_data["tiers"] = [dict(row._mapping) for row in tiers_result]
        
        return program_data
        
    except Exception as e:
        logger.error(f"Error fetching active program: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch active program")

@router.post("/programs/{program_id}/tiers")
@with_tenant_context
async def add_program_tier(
    program_id: int,
    tier: CustomerTier,
    _: dict = Depends(PermissionChecker("sales", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Add a tier to a loyalty program"""
    try:
        # Verify program exists and is tier-based
        check_query = """
            SELECT tier_based FROM sales.loyalty_programs
            WHERE program_id = :program_id
        """
        result = db.execute(text(check_query), {"program_id": program_id})
        program = result.first()
        
        if not program:
            raise HTTPException(status_code=404, detail="Program not found")
        
        if not program.tier_based:
            raise HTTPException(status_code=400, detail="Program is not tier-based")
        
        # Insert tier
        insert_query = """
            INSERT INTO sales.loyalty_tiers (
                program_id, tier_name, min_points_required,
                points_multiplier, additional_benefits
            ) VALUES (
                :program_id, :tier_name, :min_points_required,
                :points_multiplier, :additional_benefits
            ) RETURNING tier_id
        """
        
        result = db.execute(text(insert_query), {
            "program_id": program_id,
            "tier_name": tier.tier_name,
            "min_points_required": tier.min_points_required,
            "points_multiplier": tier.points_multiplier,
            "additional_benefits": str(tier.additional_benefits) if tier.additional_benefits else None
        })
        
        tier_id = result.scalar()
        # TenantAwareSession auto-commits
        
        return {
            "tier_id": tier_id,
            "message": "Tier added successfully"
        }
        
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
    """
    Get customer's loyalty points summary
    
    - Current balance
    - Points history
    - Tier status
    - Expiring points
    """
    try:
        # Get current points balance
        balance_query = """
            SELECT 
                COALESCE(SUM(CASE 
                    WHEN transaction_type IN ('earned', 'bonus', 'adjusted') 
                        AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
                    THEN points 
                    WHEN transaction_type IN ('redeemed', 'expired') 
                    THEN -points 
                    ELSE 0 
                END), 0) as current_balance,
                COALESCE(SUM(CASE 
                    WHEN transaction_type IN ('earned', 'bonus') 
                    THEN points 
                    ELSE 0 
                END), 0) as total_earned,
                COALESCE(SUM(CASE 
                    WHEN transaction_type = 'redeemed' 
                    THEN points 
                    ELSE 0 
                END), 0) as total_redeemed
            FROM sales.loyalty_transactions
            WHERE customer_id = :customer_id
        """
        
        result = db.execute(text(balance_query), {"customer_id": customer_id})
        balance_data = dict(result.first()._mapping)
        
        # Get points expiring soon (next 30 days)
        expiry_query = """
            SELECT 
                SUM(points) as expiring_points,
                MIN(expiry_date) as next_expiry_date
            FROM sales.loyalty_transactions
            WHERE customer_id = :customer_id
                AND transaction_type IN ('earned', 'bonus')
                AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
                AND points > (
                    SELECT COALESCE(SUM(points), 0)
                    FROM sales.loyalty_transactions lt2
                    WHERE lt2.customer_id = :customer_id
                        AND lt2.transaction_type = 'redeemed'
                        AND lt2.created_at > sales.loyalty_transactions.created_at
                )
        """
        
        expiry_result = db.execute(text(expiry_query), {"customer_id": customer_id})
        expiry_data = dict(expiry_result.first()._mapping)
        
        # Get customer tier if applicable
        tier_query = """
            SELECT 
                lt.tier_name,
                lt.min_points_required,
                lt.points_multiplier,
                lt.additional_benefits
            FROM sales.loyalty_tiers lt
            JOIN sales.loyalty_programs lp ON lt.program_id = lp.program_id
            WHERE lp.is_active = true
                AND lt.min_points_required <= :total_earned
            ORDER BY lt.min_points_required DESC
            LIMIT 1
        """
        
        tier_result = db.execute(text(tier_query), {"total_earned": balance_data["total_earned"]})
        tier = tier_result.first()
        
        # Get recent transactions
        transactions_query = """
            SELECT 
                transaction_id,
                transaction_type,
                points,
                reference_type,
                reference_id,
                remarks,
                created_at,
                expiry_date
            FROM sales.loyalty_transactions
            WHERE customer_id = :customer_id
            ORDER BY created_at DESC
            LIMIT 10
        """
        
        transactions_result = db.execute(text(transactions_query), {"customer_id": customer_id})
        recent_transactions = [dict(row._mapping) for row in transactions_result]
        
        return {
            "customer_id": customer_id,
            "current_balance": int(balance_data["current_balance"]),
            "total_earned": int(balance_data["total_earned"]),
            "total_redeemed": int(balance_data["total_redeemed"]),
            "expiring_soon": {
                "points": int(expiry_data["expiring_points"] or 0),
                "expiry_date": expiry_data["next_expiry_date"]
            },
            "current_tier": dict(tier._mapping) if tier else None,
            "recent_transactions": recent_transactions
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
    """
    Record points earned by customer
    
    - From purchases
    - Bonus points
    - Manual adjustments
    """
    try:
        # Get active program
        program_query = """
            SELECT program_id, points_validity_days
            FROM sales.loyalty_programs
            WHERE is_active = true
            LIMIT 1
        """
        program_result = db.execute(text(program_query))
        program = program_result.first()
        
        if not program:
            raise HTTPException(status_code=400, detail="No active loyalty program")
        
        # Calculate expiry date if applicable
        expiry_date = None
        if program.points_validity_days:
            expiry_date = date.today() + timedelta(days=program.points_validity_days)
        
        # Insert transaction
        insert_query = """
            INSERT INTO sales.loyalty_transactions (
                program_id, customer_id, transaction_type, points,
                reference_type, reference_id, remarks, expiry_date,
                created_by
            ) VALUES (
                :program_id, :customer_id, :transaction_type, :points,
                :reference_type, :reference_id, :remarks, :expiry_date,
                :created_by
            ) RETURNING transaction_id
        """
        
        result = db.execute(text(insert_query), {
            "program_id": program.program_id,
            "customer_id": transaction.customer_id,
            "transaction_type": transaction.transaction_type,
            "points": transaction.points,
            "reference_type": transaction.reference_type,
            "reference_id": transaction.reference_id,
            "remarks": transaction.remarks,
            "expiry_date": expiry_date,
            "created_by": 1
        })
        
        transaction_id = result.scalar()
        # TenantAwareSession auto-commits
        
        # Get updated balance
        balance_query = """
            SELECT SUM(CASE 
                WHEN transaction_type IN ('earned', 'bonus', 'adjusted') THEN points 
                WHEN transaction_type IN ('redeemed', 'expired') THEN -points 
                ELSE 0 
            END) as balance
            FROM sales.loyalty_transactions
            WHERE customer_id = :customer_id
        """
        
        balance_result = db.execute(text(balance_query), {"customer_id": transaction.customer_id})
        new_balance = balance_result.scalar() or 0
        
        return {
            "transaction_id": transaction_id,
            "points_earned": transaction.points,
            "new_balance": int(new_balance),
            "expiry_date": expiry_date
        }
        
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
    """
    Redeem loyalty points for invoice discount
    
    - Validate points balance
    - Apply redemption rules
    - Update invoice with discount
    """
    try:
        # Get active program
        program_query = """
            SELECT 
                program_id, 
                redemption_ratio,
                min_redemption_points,
                max_redemption_percentage
            FROM sales.loyalty_programs
            WHERE is_active = true
            LIMIT 1
        """
        program_result = db.execute(text(program_query))
        program = program_result.first()
        
        if not program:
            raise HTTPException(status_code=400, detail="No active loyalty program")
        
        # Check minimum redemption
        if redemption.points_to_redeem < program.min_redemption_points:
            raise HTTPException(
                status_code=400, 
                detail=f"Minimum {program.min_redemption_points} points required for redemption"
            )
        
        # Get customer's current balance
        balance_query = """
            SELECT SUM(CASE 
                WHEN transaction_type IN ('earned', 'bonus', 'adjusted') 
                    AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
                THEN points 
                WHEN transaction_type IN ('redeemed', 'expired') 
                THEN -points 
                ELSE 0 
            END) as balance
            FROM sales.loyalty_transactions
            WHERE customer_id = :customer_id
        """
        
        balance_result = db.execute(text(balance_query), {"customer_id": redemption.customer_id})
        current_balance = balance_result.scalar() or 0
        
        if current_balance < redemption.points_to_redeem:
            raise HTTPException(status_code=400, detail="Insufficient points balance")
        
        # Get invoice details
        invoice_query = """
            SELECT final_amount, loyalty_points_used
            FROM sales.invoices
            WHERE invoice_id = :invoice_id
        """
        invoice_result = db.execute(text(invoice_query), {"invoice_id": redemption.invoice_id})
        invoice = invoice_result.first()
        
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        if invoice.loyalty_points_used:
            raise HTTPException(status_code=400, detail="Points already redeemed for this invoice")
        
        # Calculate redemption value
        redemption_value = redemption.points_to_redeem * program.redemption_ratio
        
        # Check max redemption percentage
        max_allowed = float(invoice.final_amount) * (program.max_redemption_percentage / 100)
        if redemption_value > max_allowed:
            redemption_value = max_allowed
            actual_points_used = int(redemption_value / program.redemption_ratio)
        else:
            actual_points_used = redemption.points_to_redeem
        
        # Record redemption transaction
        redemption_query = """
            INSERT INTO sales.loyalty_transactions (
                program_id, customer_id, transaction_type, points,
                reference_type, reference_id, remarks, created_by
            ) VALUES (
                :program_id, :customer_id, 'redeemed', :points,
                'invoice', :invoice_id, :remarks, :created_by
            ) RETURNING transaction_id
        """
        
        result = db.execute(text(redemption_query), {
            "program_id": program.program_id,
            "customer_id": redemption.customer_id,
            "points": actual_points_used,
            "invoice_id": redemption.invoice_id,
            "remarks": f"Redeemed for invoice discount - Rs. {redemption_value}",
            "created_by": 1
        })
        
        transaction_id = result.scalar()
        
        # Update invoice with loyalty discount
        update_invoice = """
            UPDATE sales.invoices
            SET loyalty_points_used = :points,
                loyalty_discount = :discount,
                final_amount = final_amount - :discount
            WHERE invoice_id = :invoice_id
        """
        
        db.execute(text(update_invoice), {
            "points": actual_points_used,
            "discount": redemption_value,
            "invoice_id": redemption.invoice_id
        })
        
        # TenantAwareSession auto-commits
        
        # Get new balance
        new_balance = current_balance - actual_points_used
        
        return {
            "transaction_id": transaction_id,
            "points_redeemed": actual_points_used,
            "discount_amount": redemption_value,
            "new_balance": int(new_balance)
        }
        
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
    """
    Process expired points
    
    Run this periodically to expire old points
    """
    try:
        # Find all expired points that haven't been marked
        expired_query = """
            WITH expired_points AS (
                SELECT 
                    customer_id,
                    SUM(points) as expired_amount,
                    array_agg(transaction_id) as transaction_ids
                FROM sales.loyalty_transactions
                WHERE transaction_type IN ('earned', 'bonus')
                    AND expiry_date <= CURRENT_DATE
                    AND NOT EXISTS (
                        SELECT 1 FROM sales.loyalty_transactions lt2
                        WHERE lt2.reference_type = 'expired'
                        AND lt2.reference_id = sales.loyalty_transactions.transaction_id
                    )
                GROUP BY customer_id
            )
            SELECT * FROM expired_points
        """
        
        result = db.execute(text(expired_query))
        expired_records = result.fetchall()
        
        total_expired = 0
        
        for record in expired_records:
            # Create expiry transaction
            expiry_insert = """
                INSERT INTO sales.loyalty_transactions (
                    program_id, customer_id, transaction_type, points,
                    reference_type, remarks, created_by
                ) SELECT 
                    program_id, :customer_id, 'expired', :points,
                    'expired', :remarks, 1
                FROM sales.loyalty_programs
                WHERE is_active = true
                LIMIT 1
            """
            
            db.execute(text(expiry_insert), {
                "customer_id": record.customer_id,
                "points": record.expired_amount,
                "remarks": f"Points expired - {len(record.transaction_ids)} transactions"
            })
            
            total_expired += record.expired_amount
        
        # TenantAwareSession auto-commits
        
        return {
            "customers_affected": len(expired_records),
            "total_points_expired": total_expired,
            "process_date": date.today()
        }
        
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
    """
    Get loyalty program analytics
    
    - Total members
    - Points statistics
    - Redemption patterns
    """
    try:
        params = {}
        date_filter = ""
        
        if from_date:
            date_filter += " AND lt.created_at >= :from_date"
            params["from_date"] = from_date
            
        if to_date:
            date_filter += " AND lt.created_at <= :to_date"
            params["to_date"] = to_date
        
        # Overall statistics
        stats_query = f"""
            SELECT 
                COUNT(DISTINCT customer_id) as total_members,
                SUM(CASE WHEN transaction_type IN ('earned', 'bonus') THEN points ELSE 0 END) as total_earned,
                SUM(CASE WHEN transaction_type = 'redeemed' THEN points ELSE 0 END) as total_redeemed,
                SUM(CASE WHEN transaction_type = 'expired' THEN points ELSE 0 END) as total_expired,
                COUNT(CASE WHEN transaction_type = 'redeemed' THEN 1 END) as redemption_count,
                AVG(CASE WHEN transaction_type = 'redeemed' THEN points END) as avg_redemption_size
            FROM sales.loyalty_transactions lt
            WHERE 1=1 {date_filter}
        """
        
        stats_result = db.execute(text(stats_query), params)
        stats = dict(stats_result.first()._mapping)
        
        # Top customers by points
        top_customers_query = """
            SELECT 
                c.customer_id,
                c.customer_name,
                c.customer_code,
                SUM(CASE 
                    WHEN lt.transaction_type IN ('earned', 'bonus', 'adjusted') THEN lt.points 
                    WHEN lt.transaction_type IN ('redeemed', 'expired') THEN -lt.points 
                    ELSE 0 
                END) as current_balance,
                SUM(CASE WHEN lt.transaction_type IN ('earned', 'bonus') THEN lt.points ELSE 0 END) as lifetime_earned
            FROM sales.loyalty_transactions lt
            JOIN parties.customers c ON lt.customer_id = c.customer_id
            GROUP BY c.customer_id, c.customer_name, c.customer_code
            ORDER BY lifetime_earned DESC
            LIMIT 10
        """
        
        top_result = db.execute(text(top_customers_query))
        top_customers = [dict(row._mapping) for row in top_result]
        
        # Redemption patterns
        redemption_query = f"""
            SELECT 
                DATE_TRUNC('month', created_at) as month,
                COUNT(*) as redemption_count,
                SUM(points) as points_redeemed,
                AVG(points) as avg_points_per_redemption
            FROM sales.loyalty_transactions
            WHERE transaction_type = 'redeemed' {date_filter}
            GROUP BY month
            ORDER BY month DESC
            LIMIT 12
        """
        
        redemption_result = db.execute(text(redemption_query), params)
        redemption_patterns = [dict(row._mapping) for row in redemption_result]
        
        return {
            "summary": stats,
            "top_customers": top_customers,
            "redemption_trends": redemption_patterns,
            "report_period": {
                "from_date": from_date,
                "to_date": to_date
            }
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
    """
    Run a bonus points campaign
    
    - Award bonus points to eligible customers
    - Based on criteria like purchase history
    """
    try:
        campaign_type = campaign_data.get("campaign_type")  # "all", "tier", "purchase_based"
        bonus_points = campaign_data.get("bonus_points", 0)
        criteria = campaign_data.get("criteria", {})
        
        # Get active program
        program_query = """
            SELECT program_id, points_validity_days
            FROM sales.loyalty_programs
            WHERE is_active = true
            LIMIT 1
        """
        program_result = db.execute(text(program_query))
        program = program_result.first()
        
        if not program:
            raise HTTPException(status_code=400, detail="No active loyalty program")
        
        # Build customer selection query based on campaign type
        if campaign_type == "all":
            customer_query = "SELECT customer_id FROM parties.customers WHERE is_active = true"
            params = {}
            
        elif campaign_type == "tier":
            tier_name = criteria.get("tier_name")
            customer_query = """
                SELECT DISTINCT lt.customer_id
                FROM sales.loyalty_transactions lt
                JOIN sales.loyalty_tiers tier ON tier.program_id = :program_id
                WHERE tier.tier_name = :tier_name
                GROUP BY lt.customer_id
                HAVING SUM(CASE 
                    WHEN lt.transaction_type IN ('earned', 'bonus') THEN lt.points 
                    ELSE 0 
                END) >= tier.min_points_required
            """
            params = {"program_id": program.program_id, "tier_name": tier_name}
            
        elif campaign_type == "purchase_based":
            min_purchase = criteria.get("min_purchase_amount", 0)
            days_back = criteria.get("days_back", 30)
            customer_query = """
                SELECT DISTINCT customer_id
                FROM sales.invoices
                WHERE final_amount >= :min_purchase
                    AND invoice_date >= CURRENT_DATE - INTERVAL ':days_back days'
            """
            params = {"min_purchase": min_purchase, "days_back": days_back}
            
        else:
            raise HTTPException(status_code=400, detail="Invalid campaign type")
        
        # Get eligible customers
        customers_result = db.execute(text(customer_query), params)
        eligible_customers = [row.customer_id for row in customers_result]
        
        # Calculate expiry date
        expiry_date = None
        if program.points_validity_days:
            expiry_date = date.today() + timedelta(days=program.points_validity_days)
        
        # Award bonus points
        awarded_count = 0
        for customer_id in eligible_customers:
            insert_query = """
                INSERT INTO sales.loyalty_transactions (
                    program_id, customer_id, transaction_type, points,
                    reference_type, remarks, expiry_date, created_by
                ) VALUES (
                    :program_id, :customer_id, 'bonus', :points,
                    'campaign', :remarks, :expiry_date, 1
                )
            """
            
            db.execute(text(insert_query), {
                "program_id": program.program_id,
                "customer_id": customer_id,
                "points": bonus_points,
                "remarks": campaign_data.get("campaign_name", "Bonus points campaign"),
                "expiry_date": expiry_date
            })
            
            awarded_count += 1
        
        # TenantAwareSession auto-commits
        
        return {
            "campaign_name": campaign_data.get("campaign_name"),
            "customers_awarded": awarded_count,
            "points_per_customer": bonus_points,
            "total_points_awarded": awarded_count * bonus_points,
            "expiry_date": expiry_date
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error running bonus campaign: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to run campaign: {str(e)}")