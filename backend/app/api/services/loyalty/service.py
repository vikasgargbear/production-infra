"""
Loyalty Points Service
Handles all database operations for loyalty programs, points, and transactions
"""
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date, timedelta
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)


class LoyaltyService:
    """Service class for Loyalty Points operations"""
    
    @staticmethod
    def insert_loyalty_program(db: Session, org_id: str, data: Dict[str, Any]) -> int:
        """Insert new loyalty program. Returns program_id."""
        result = db.execute(text("""
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
        """), {"org_id": org_id, **data})
        return result.scalar()
    
    @staticmethod
    def get_active_program(db: Session, org_id: str) -> Optional[Dict[str, Any]]:
        """Get active loyalty program."""
        result = db.execute(text("""
            SELECT * FROM sales.loyalty_programs
            WHERE org_id = :org_id AND is_active = true
            ORDER BY created_at DESC LIMIT 1
        """), {"org_id": org_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_program_tiers(db: Session, program_id: int) -> List[Dict[str, Any]]:
        """Get tiers for a program."""
        result = db.execute(text("""
            SELECT * FROM sales.loyalty_tiers
            WHERE program_id = :program_id ORDER BY min_points_required
        """), {"program_id": program_id})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_program_tier_status(db: Session, program_id: int) -> Optional[bool]:
        """Check if program is tier-based."""
        result = db.execute(text(
            "SELECT tier_based FROM sales.loyalty_programs WHERE program_id = :program_id"
        ), {"program_id": program_id})
        row = result.first()
        return row.tier_based if row else None
    
    @staticmethod
    def insert_tier(db: Session, data: Dict[str, Any]) -> int:
        """Insert new tier. Returns tier_id."""
        result = db.execute(text("""
            INSERT INTO sales.loyalty_tiers (
                program_id, tier_name, min_points_required,
                points_multiplier, additional_benefits
            ) VALUES (
                :program_id, :tier_name, :min_points_required,
                :points_multiplier, :additional_benefits
            ) RETURNING tier_id
        """), data)
        return result.scalar()
    
    @staticmethod
    def get_customer_points_balance(db: Session, customer_id: int) -> Dict[str, Any]:
        """Get customer's points balance."""
        result = db.execute(text("""
            SELECT 
                COALESCE(SUM(CASE 
                    WHEN transaction_type IN ('earned', 'bonus', 'adjusted') 
                        AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
                    THEN points 
                    WHEN transaction_type IN ('redeemed', 'expired') THEN -points 
                    ELSE 0 
                END), 0) as current_balance,
                COALESCE(SUM(CASE WHEN transaction_type IN ('earned', 'bonus') THEN points ELSE 0 END), 0) as total_earned,
                COALESCE(SUM(CASE WHEN transaction_type = 'redeemed' THEN points ELSE 0 END), 0) as total_redeemed
            FROM sales.loyalty_transactions WHERE customer_id = :customer_id
        """), {"customer_id": customer_id})
        return dict(result.first()._mapping)
    
    @staticmethod
    def get_expiring_points(db: Session, customer_id: int) -> Dict[str, Any]:
        """Get expiring points for customer."""
        result = db.execute(text("""
            SELECT SUM(points) as expiring_points, MIN(expiry_date) as next_expiry_date
            FROM sales.loyalty_transactions
            WHERE customer_id = :customer_id
                AND transaction_type IN ('earned', 'bonus')
                AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        """), {"customer_id": customer_id})
        return dict(result.first()._mapping)
    
    @staticmethod
    def get_customer_tier(db: Session, total_earned: int) -> Optional[Dict[str, Any]]:
        """Get customer's current tier based on points earned."""
        result = db.execute(text("""
            SELECT lt.tier_name, lt.min_points_required, lt.points_multiplier, lt.additional_benefits
            FROM sales.loyalty_tiers lt
            JOIN sales.loyalty_programs lp ON lt.program_id = lp.program_id
            WHERE lp.is_active = true AND lt.min_points_required <= :total_earned
            ORDER BY lt.min_points_required DESC LIMIT 1
        """), {"total_earned": total_earned})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_recent_transactions(db: Session, customer_id: int, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent transactions for customer."""
        result = db.execute(text("""
            SELECT transaction_id, transaction_type, points, reference_type,
                   reference_id, remarks, created_at, expiry_date
            FROM sales.loyalty_transactions
            WHERE customer_id = :customer_id ORDER BY created_at DESC LIMIT :limit
        """), {"customer_id": customer_id, "limit": limit})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_active_program_simple(db: Session) -> Optional[Dict[str, Any]]:
        """Get active program with validity days."""
        result = db.execute(text("""
            SELECT program_id, points_validity_days FROM sales.loyalty_programs
            WHERE is_active = true LIMIT 1
        """))
        row = result.first()
        return {"program_id": row.program_id, "points_validity_days": row.points_validity_days} if row else None
    
    @staticmethod
    def insert_transaction(db: Session, data: Dict[str, Any]) -> int:
        """Insert loyalty transaction. Returns transaction_id."""
        result = db.execute(text("""
            INSERT INTO sales.loyalty_transactions (
                program_id, customer_id, transaction_type, points,
                reference_type, reference_id, remarks, expiry_date, created_by
            ) VALUES (
                :program_id, :customer_id, :transaction_type, :points,
                :reference_type, :reference_id, :remarks, :expiry_date, :created_by
            ) RETURNING transaction_id
        """), data)
        return result.scalar()
    
    @staticmethod
    def get_balance_after_transaction(db: Session, customer_id: int) -> int:
        """Get balance after transaction."""
        result = db.execute(text("""
            SELECT SUM(CASE 
                WHEN transaction_type IN ('earned', 'bonus', 'adjusted') THEN points 
                WHEN transaction_type IN ('redeemed', 'expired') THEN -points 
                ELSE 0 
            END) as balance FROM sales.loyalty_transactions WHERE customer_id = :customer_id
        """), {"customer_id": customer_id})
        return result.scalar() or 0
    
    @staticmethod
    def get_active_program_for_redemption(db: Session) -> Optional[Dict[str, Any]]:
        """Get active program with redemption rules."""
        result = db.execute(text("""
            SELECT program_id, redemption_ratio, min_redemption_points, max_redemption_percentage
            FROM sales.loyalty_programs WHERE is_active = true LIMIT 1
        """))
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def get_invoice_for_redemption(db: Session, invoice_id: int) -> Optional[Dict[str, Any]]:
        """Get invoice for redemption validation."""
        result = db.execute(text("""
            SELECT final_amount, loyalty_points_used FROM sales.invoices WHERE invoice_id = :invoice_id
        """), {"invoice_id": invoice_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def insert_redemption_transaction(db: Session, data: Dict[str, Any]) -> int:
        """Insert redemption transaction. Returns transaction_id."""
        result = db.execute(text("""
            INSERT INTO sales.loyalty_transactions (
                program_id, customer_id, transaction_type, points,
                reference_type, reference_id, remarks, created_by
            ) VALUES (
                :program_id, :customer_id, 'redeemed', :points,
                'invoice', :invoice_id, :remarks, :created_by
            ) RETURNING transaction_id
        """), data)
        return result.scalar()
    
    @staticmethod
    def update_invoice_loyalty_discount(db: Session, invoice_id: int, points: int, discount: float) -> None:
        """Update invoice with loyalty discount."""
        db.execute(text("""
            UPDATE sales.invoices
            SET loyalty_points_used = :points, loyalty_discount = :discount,
                final_amount = final_amount - :discount
            WHERE invoice_id = :invoice_id
        """), {"points": points, "discount": discount, "invoice_id": invoice_id})
    
    @staticmethod
    def get_expired_points_to_process(db: Session) -> List[Dict[str, Any]]:
        """Get expired points that need processing."""
        result = db.execute(text("""
            WITH expired_points AS (
                SELECT customer_id, SUM(points) as expired_amount, array_agg(transaction_id) as transaction_ids
                FROM sales.loyalty_transactions
                WHERE transaction_type IN ('earned', 'bonus') AND expiry_date <= CURRENT_DATE
                    AND NOT EXISTS (
                        SELECT 1 FROM sales.loyalty_transactions lt2
                        WHERE lt2.reference_type = 'expired'
                        AND lt2.reference_id = sales.loyalty_transactions.transaction_id
                    )
                GROUP BY customer_id
            ) SELECT * FROM expired_points
        """))
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def insert_expiry_transaction(db: Session, customer_id: int, points: int, remarks: str) -> None:
        """Insert expiry transaction."""
        db.execute(text("""
            INSERT INTO sales.loyalty_transactions (
                program_id, customer_id, transaction_type, points,
                reference_type, remarks, created_by
            ) SELECT program_id, :customer_id, 'expired', :points,
                'expired', :remarks, 1
            FROM sales.loyalty_programs WHERE is_active = true LIMIT 1
        """), {"customer_id": customer_id, "points": points, "remarks": remarks})
    
    @staticmethod
    def get_loyalty_analytics(db: Session, from_date: date = None, to_date: date = None) -> Dict[str, Any]:
        """Get loyalty program analytics."""
        params = {}
        date_filter = ""
        if from_date:
            date_filter += " AND lt.created_at >= :from_date"
            params["from_date"] = from_date
        if to_date:
            date_filter += " AND lt.created_at <= :to_date"
            params["to_date"] = to_date
        
        result = db.execute(text(f"""
            SELECT 
                COUNT(DISTINCT customer_id) as total_members,
                SUM(CASE WHEN transaction_type IN ('earned', 'bonus') THEN points ELSE 0 END) as total_earned,
                SUM(CASE WHEN transaction_type = 'redeemed' THEN points ELSE 0 END) as total_redeemed,
                SUM(CASE WHEN transaction_type = 'expired' THEN points ELSE 0 END) as total_expired,
                COUNT(CASE WHEN transaction_type = 'redeemed' THEN 1 END) as redemption_count,
                AVG(CASE WHEN transaction_type = 'redeemed' THEN points END) as avg_redemption_size
            FROM sales.loyalty_transactions lt WHERE 1=1 {date_filter}
        """), params)
        return dict(result.first()._mapping)
    
    @staticmethod
    def get_top_customers_by_points(db: Session, limit: int = 10) -> List[Dict[str, Any]]:
        """Get top customers by lifetime points."""
        result = db.execute(text("""
            SELECT c.customer_id, c.customer_name, c.customer_code,
                SUM(CASE WHEN lt.transaction_type IN ('earned', 'bonus', 'adjusted') THEN lt.points 
                    WHEN lt.transaction_type IN ('redeemed', 'expired') THEN -lt.points ELSE 0 END) as current_balance,
                SUM(CASE WHEN lt.transaction_type IN ('earned', 'bonus') THEN lt.points ELSE 0 END) as lifetime_earned
            FROM sales.loyalty_transactions lt
            JOIN parties.customers c ON lt.customer_id = c.customer_id
            GROUP BY c.customer_id, c.customer_name, c.customer_code
            ORDER BY lifetime_earned DESC LIMIT :limit
        """), {"limit": limit})
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_redemption_trends(db: Session, params: Dict[str, Any], date_filter: str) -> List[Dict[str, Any]]:
        """Get redemption trends by month."""
        result = db.execute(text(f"""
            SELECT DATE_TRUNC('month', created_at) as month, COUNT(*) as redemption_count,
                SUM(points) as points_redeemed, AVG(points) as avg_points_per_redemption
            FROM sales.loyalty_transactions
            WHERE transaction_type = 'redeemed' {date_filter}
            GROUP BY month ORDER BY month DESC LIMIT 12
        """), params)
        return [dict(row._mapping) for row in result]
    
    @staticmethod
    def get_customers_for_campaign(db: Session, campaign_type: str, params: Dict[str, Any]) -> List[int]:
        """Get eligible customers for bonus campaign."""
        if campaign_type == "all":
            result = db.execute(text("SELECT customer_id FROM parties.customers WHERE is_active = true"))
        elif campaign_type == "tier":
            result = db.execute(text("""
                SELECT DISTINCT lt.customer_id FROM sales.loyalty_transactions lt
                JOIN sales.loyalty_tiers tier ON tier.program_id = :program_id
                WHERE tier.tier_name = :tier_name GROUP BY lt.customer_id
                HAVING SUM(CASE WHEN lt.transaction_type IN ('earned', 'bonus') THEN lt.points ELSE 0 END) >= tier.min_points_required
            """), params)
        elif campaign_type == "purchase_based":
            result = db.execute(text("""
                SELECT DISTINCT customer_id FROM sales.invoices
                WHERE final_amount >= :min_purchase
                    AND invoice_date >= CURRENT_DATE - make_interval(days => :days_back)
            """), params)
        else:
            return []
        return [row.customer_id for row in result]
    
    @staticmethod
    def insert_bonus_points(db: Session, data: Dict[str, Any]) -> None:
        """Insert bonus points for campaign."""
        db.execute(text("""
            INSERT INTO sales.loyalty_transactions (
                program_id, customer_id, transaction_type, points,
                reference_type, remarks, expiry_date, created_by
            ) VALUES (
                :program_id, :customer_id, 'bonus', :points,
                'campaign', :remarks, :expiry_date, 1
            )
        """), data)
