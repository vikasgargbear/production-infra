"""
Settings API Router
Handles organization settings and feature toggles
"""
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
import json

from ...core.database import get_db
from ...core.auth_utils import get_org_id_from_header

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Settings"])

# Default feature settings
DEFAULT_FEATURES = {
    # System Features
    "system_notifications": False,  # Currently disabled to prevent errors
    "auto_fifo_allocation": True,
    "inventory_tracking": True,
    "credit_limit_enforcement": False,

    # Inventory Features
    "allowNegativeStock": False,
    "expiryDateMandatory": True,
    "batchWiseTracking": True,
    "stockAdjustmentApproval": False,
    "lowStockAlerts": True,

    # Sales Features
    "creditLimitForParties": True,
    "creditLimitThreshold": 100000,
    "salesReturnFlow": "with-credit-note",
    "salesApprovalRequired": False,
    "discountLimit": 20,

    # Purchase Features
    "grnWorkflow": True,
    "purchaseApprovalLimit": 50000,
    "autoGeneratePurchaseOrder": False,
    "vendorRatingSystem": False,

    # E-Way Bill
    "ewayBillEnabled": True,
    "ewayBillThreshold": 50000,
    "autoGenerateEwayBill": False,

    # GST Features
    "gstRoundOff": True,
    "reverseChargeApplicable": False,
    "compositionScheme": False,
    "tcsApplicable": False,
    
    # Payment Features
    "allowPartialPayments": True,
    "autoReconciliation": False,
    "paymentReminders": True,
    "reminderDays": [7, 15, 30],
    
    # General Features
    "multiCurrency": False,
    "multiLocation": True,
    "barcodeScannerIntegration": False,
    "smsNotifications": False,
    "emailNotifications": True,
    "whatsappNotifications": False,
    
    # Security Features
    "twoFactorAuth": False,
    "ipRestriction": False,
    "sessionTimeout": 30,
    "passwordComplexity": "medium",
    
    # Workflow Features
    "purchaseWorkflow": True,
    "salesWorkflow": False,
    "paymentApproval": True,
    "returnApproval": True
}

@router.get("/features")
def get_feature_settings(
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """Get all feature settings for an organization"""
    try:
        # Try to get settings from database
        query = """
            SELECT setting_key, setting_value, setting_type
            FROM system.org_settings
            WHERE org_id = :org_id 
            AND category = 'features'
            AND is_active = true
        """
        
        result = db.execute(text(query), {"org_id": org_id})
        settings = {}
        
        for row in result:
            try:
                if row.setting_type == 'json':
                    settings[row.setting_key] = json.loads(row.setting_value)
                elif row.setting_type == 'boolean':
                    settings[row.setting_key] = row.setting_value.lower() == 'true'
                elif row.setting_type == 'number':
                    settings[row.setting_key] = float(row.setting_value)
                else:
                    settings[row.setting_key] = row.setting_value
            except Exception as e:
                logger.warning(f"Failed to parse setting {row.setting_key}: {e}")
                settings[row.setting_key] = row.setting_value
        
        # Merge with defaults to ensure all features are present
        features = {**DEFAULT_FEATURES, **settings}
        
        return {
            "success": True,
            "data": {
                "features": features,
                "org_id": org_id
            }
        }
        
    except Exception as e:
        logger.error(f"Error fetching feature settings: {str(e)}")
        # Return defaults if database fetch fails
        return {
            "success": True,
            "data": {
                "features": DEFAULT_FEATURES,
                "org_id": org_id,
                "using_defaults": True
            }
        }

@router.post("/features")
def update_feature_settings(
    features: Dict[str, Any],
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """Update feature settings for an organization"""
    try:
        # Update each feature setting
        for key, value in features.items():
            # Determine setting type
            if isinstance(value, bool):
                setting_type = 'boolean'
                setting_value = str(value)
            elif isinstance(value, (int, float)):
                setting_type = 'number'
                setting_value = str(value)
            elif isinstance(value, (list, dict)):
                setting_type = 'json'
                setting_value = json.dumps(value)
            else:
                setting_type = 'string'
                setting_value = str(value)
            
            # Upsert the setting
            upsert_query = """
                INSERT INTO system.org_settings (
                    org_id, category, setting_key, setting_value, setting_type, is_active
                ) VALUES (
                    :org_id, 'features', :key, :value, :type, true
                )
                ON CONFLICT (org_id, category, setting_key) 
                DO UPDATE SET 
                    setting_value = EXCLUDED.setting_value,
                    setting_type = EXCLUDED.setting_type,
                    updated_at = CURRENT_TIMESTAMP
            """
            
            db.execute(text(upsert_query), {
                "org_id": org_id,
                "key": key,
                "value": setting_value,
                "type": setting_type
            })
        
        db.commit()
        
        return {
            "success": True,
            "message": "Feature settings updated successfully",
            "data": {
                "features": features,
                "org_id": org_id
            }
        }
        
    except Exception as e:
        logger.error(f"Error updating feature settings: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update feature settings: {str(e)}")

@router.get("/general")
def get_general_settings(
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """Get general settings for an organization"""
    try:
        # Get organization info
        org_query = """
            SELECT 
                org_name, org_code, 
                address, city, state, pincode, country,
                phone, email, website,
                gst_number, pan_number, drug_license_number,
                logo_url, currency_code, fiscal_year_start
            FROM master.organizations
            WHERE org_id = :org_id
        """
        
        result = db.execute(text(org_query), {"org_id": org_id}).fetchone()
        
        if result:
            return {
                "success": True,
                "data": {
                    "org_name": result.org_name,
                    "org_code": result.org_code,
                    "address": result.address,
                    "city": result.city,
                    "state": result.state,
                    "pincode": result.pincode,
                    "country": result.country,
                    "phone": result.phone,
                    "email": result.email,
                    "website": result.website,
                    "gst_number": result.gst_number,
                    "pan_number": result.pan_number,
                    "drug_license_number": result.drug_license_number,
                    "logo_url": result.logo_url,
                    "currency_code": result.currency_code,
                    "fiscal_year_start": result.fiscal_year_start
                }
            }
        else:
            raise HTTPException(status_code=404, detail="Organization not found")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching general settings: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch general settings: {str(e)}")

@router.post("/general")
def update_general_settings(
    settings: Dict[str, Any],
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """Update general settings for an organization"""
    try:
        # Build update query dynamically based on provided fields
        allowed_fields = [
            'org_name', 'org_code', 'address', 'city', 'state', 'pincode', 'country',
            'phone', 'email', 'website', 'gst_number', 'pan_number', 'drug_license_number',
            'logo_url', 'currency_code', 'fiscal_year_start'
        ]
        
        update_fields = []
        params = {"org_id": org_id}
        
        for field in allowed_fields:
            if field in settings:
                update_fields.append(f"{field} = :{field}")
                params[field] = settings[field]
        
        if update_fields:
            update_query = f"""
                UPDATE master.organizations 
                SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP
                WHERE org_id = :org_id
            """
            
            db.execute(text(update_query), params)
            db.commit()
        
        return {
            "success": True,
            "message": "General settings updated successfully",
            "data": settings
        }
        
    except Exception as e:
        logger.error(f"Error updating general settings: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update general settings: {str(e)}")

@router.post("/features/database-flags")
def update_database_feature_flags(
    features: Dict[str, bool],
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """
    Update database-level feature flags (like system_notifications)
    This controls actual database behavior through feature_flags table
    """
    try:
        # First ensure the feature_flags table exists
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS system_config.feature_flags (
                feature_name VARCHAR(100) PRIMARY KEY,
                is_enabled BOOLEAN DEFAULT true,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))

        updated_features = {}

        for feature_name, is_enabled in features.items():
            # Special handling for system_notifications
            if feature_name == "system_notifications":
                # Update the database feature flag
                db.execute(text("""
                    INSERT INTO system_config.feature_flags (feature_name, is_enabled, description)
                    VALUES (:name, :enabled, :desc)
                    ON CONFLICT (feature_name) DO UPDATE SET
                        is_enabled = :enabled,
                        updated_at = CURRENT_TIMESTAMP
                """), {
                    "name": "system_notifications",
                    "enabled": is_enabled,
                    "desc": "Controls whether system creates automatic notifications"
                })
                logger.info(f"System notifications {'enabled' if is_enabled else 'disabled'}")

            # Handle other system-level features
            elif feature_name in ["auto_fifo_allocation", "inventory_tracking", "credit_limit_enforcement"]:
                db.execute(text("""
                    INSERT INTO system_config.feature_flags (feature_name, is_enabled, description)
                    VALUES (:name, :enabled, :desc)
                    ON CONFLICT (feature_name) DO UPDATE SET
                        is_enabled = :enabled,
                        updated_at = CURRENT_TIMESTAMP
                """), {
                    "name": feature_name,
                    "enabled": is_enabled,
                    "desc": f"System feature: {feature_name}"
                })

            updated_features[feature_name] = is_enabled

        db.commit()

        return {
            "success": True,
            "message": "Database feature flags updated successfully",
            "features": updated_features
        }

    except Exception as e:
        logger.error(f"Error updating database feature flags: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update database feature flags: {str(e)}")