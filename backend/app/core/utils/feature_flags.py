"""
Feature flags utility for checking system settings
"""
from sqlalchemy import text
from sqlalchemy.orm import Session
import logging

logger = logging.getLogger(__name__)

def is_feature_enabled(db: Session, feature_key: str, org_id: str = None) -> bool:
    """
    Check if a feature is enabled in the database

    Args:
        db: Database session
        feature_key: The feature flag key to check
        org_id: Optional organization ID for org-specific flags

    Returns:
        Boolean indicating if feature is enabled
    """
    try:
        # First check org-specific flag if org_id provided
        if org_id:
            result = db.execute(
                text("""
                    SELECT is_active FROM system_config.feature_flags
                    WHERE flag_key = :key AND org_id = :org_id
                """),
                {"key": feature_key, "org_id": org_id}
            ).first()

            if result:
                return result.is_active

        # Check global flag
        result = db.execute(
            text("""
                SELECT is_active FROM system_config.feature_flags
                WHERE flag_key = :key AND org_id IS NULL
            """),
            {"key": feature_key}
        ).first()

        if result:
            return result.is_active

        # Default behaviors if flag doesn't exist
        defaults = {
            'system_notifications': False,
            'allow_negative_stock': False,
            'batch_wise_tracking': True,
            'expiry_date_mandatory': True,
            'auto_fifo_allocation': True,
            'credit_limit_enforcement': False,
            'partial_payments': True,
            'stock_adjustment_approval': False,
            'sales_approval_required': False,
            'discount_limit_check': True,
            'minimum_margin_check': True,
            'gst_round_off': True,
            'eway_bill_enabled': False,
            'tcs_applicable': False,
            'low_stock_alerts': True,
            'expiry_alerts': True,
            'overdue_invoice_alerts': True
        }

        return defaults.get(feature_key, False)

    except Exception as e:
        logger.error(f"Error checking feature flag {feature_key}: {str(e)}")
        return False

def get_all_features(db: Session, org_id: str = None) -> dict:
    """
    Get all feature flags and their states

    Args:
        db: Database session
        org_id: Optional organization ID

    Returns:
        Dictionary of feature flags and their states
    """
    try:
        # Get all flags (org-specific and global)
        query = """
            SELECT flag_key, is_active, flag_name, description
            FROM system_config.feature_flags
            WHERE org_id IS NULL OR org_id = :org_id
            ORDER BY flag_key
        """

        params = {"org_id": org_id} if org_id else {}

        result = db.execute(text(query), params).fetchall()

        features = {}
        for row in result:
            features[row.flag_key] = {
                'enabled': row.is_active,
                'name': row.flag_name,
                'description': row.description
            }

        return features

    except Exception as e:
        logger.error(f"Error fetching all feature flags: {str(e)}")
        return {}

def check_negative_stock_allowed(db: Session, org_id: str = None) -> bool:
    """Check if negative stock is allowed"""
    return is_feature_enabled(db, 'allow_negative_stock', org_id)

def check_batch_tracking_enabled(db: Session, org_id: str = None) -> bool:
    """Check if batch-wise tracking is enabled"""
    return is_feature_enabled(db, 'batch_wise_tracking', org_id)

def check_expiry_mandatory(db: Session, org_id: str = None) -> bool:
    """Check if expiry date is mandatory"""
    return is_feature_enabled(db, 'expiry_date_mandatory', org_id)

def check_fifo_enabled(db: Session, org_id: str = None) -> bool:
    """Check if auto FIFO allocation is enabled"""
    return is_feature_enabled(db, 'auto_fifo_allocation', org_id)

def check_credit_limit_enforcement(db: Session, org_id: str = None) -> bool:
    """Check if credit limit enforcement is enabled"""
    return is_feature_enabled(db, 'credit_limit_enforcement', org_id)

def check_notifications_enabled(db: Session, org_id: str = None) -> bool:
    """Check if system notifications are enabled"""
    return is_feature_enabled(db, 'system_notifications', org_id)

def get_customer_mode(db: Session, org_id: str = None) -> str:
    """
    Get customer mode setting for the organization.
    
    Returns:
        'b2b': Only business customers (pharmacies, hospitals, etc.)
        'b2c': Only individual/retail customers
        'hybrid': Both B2B and B2C customers allowed
    """
    try:
        if org_id:
            result = db.execute(
                text("""
                    SELECT setting_value FROM master.system_settings
                    WHERE setting_key = 'customer_mode' 
                    AND setting_category = 'features'
                    AND org_id = :org_id
                """),
                {"org_id": org_id}
            ).first()
            
            if result:
                return result.setting_value
        
        # Default to B2B for pharma distributors
        return 'b2b'
        
    except Exception as e:
        logger.error(f"Error getting customer mode: {str(e)}")
        return 'b2b'

def is_b2b_only(db: Session, org_id: str = None) -> bool:
    """Check if only B2B customers are allowed"""
    return get_customer_mode(db, org_id) == 'b2b'

def is_b2c_only(db: Session, org_id: str = None) -> bool:
    """Check if only B2C customers are allowed"""
    return get_customer_mode(db, org_id) == 'b2c'

def is_hybrid_mode(db: Session, org_id: str = None) -> bool:
    """Check if both B2B and B2C customers are allowed"""
    return get_customer_mode(db, org_id) == 'hybrid'