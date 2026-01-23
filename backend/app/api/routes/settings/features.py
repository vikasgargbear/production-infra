"""
Feature Settings API
Handles feature toggles and flags

MODERNIZED: Uses TenantAwareSession + PermissionChecker
"""
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
import logging
import json

from ....core.auth.tenant_service import TenantAwareSession, get_tenant_aware_db, with_tenant_context
from ....core.auth.org_context import OrgContext, get_org_context
from ....core.security.permissions import PermissionChecker

logger = logging.getLogger(__name__)

router = APIRouter()

# Default feature settings
DEFAULT_FEATURES = {
    # System Features
    "system_notifications": False,
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
    "returnApproval": True,
    
    # Business Mode Configuration
    # - 'b2b': Only business customers (pharmacies, hospitals, etc.)
    # - 'b2c': Only individual/retail customers
    # - 'hybrid': Both B2B and B2C customers allowed
    "customer_mode": "b2b",
    "default_customer_type": "pharmacy",  # Default type for new B2B customers
    "require_drug_license": True,  # Require drug license for B2B customers
    "require_gst_for_b2b": False,  # GST optional for B2B customers
}


@router.get("")
@with_tenant_context
async def get_feature_settings(
    _: dict = Depends(PermissionChecker("settings", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get all feature settings for the organization"""
    try:
        org_id = context.org_id
        
        query = """
            SELECT setting_key, setting_value, setting_type
            FROM master.system_settings
            WHERE org_id = :org_id 
            AND setting_category = 'features'
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
        
        # Merge with defaults
        features = {**DEFAULT_FEATURES, **settings}
        
        return {
            "success": True,
            "data": {"features": features, "org_id": str(org_id)}
        }
        
    except Exception as e:
        logger.error(f"Error fetching feature settings: {str(e)}")
        return {
            "success": True,
            "data": {"features": DEFAULT_FEATURES, "using_defaults": True}
        }


@router.put("")
@with_tenant_context
async def update_feature_settings(
    features: Dict[str, Any],
    _: dict = Depends(PermissionChecker("settings", "edit")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Update feature settings for the organization"""
    try:
        org_id = context.org_id
        
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
            
            upsert_query = """
                INSERT INTO master.system_settings (
                    org_id, setting_category, setting_key, setting_value, setting_type, is_active, created_by
                ) VALUES (
                    :org_id, 'features', :key, :value, :type, true, :user_id
                )
                ON CONFLICT (org_id, setting_category, setting_key) 
                DO UPDATE SET 
                    setting_value = EXCLUDED.setting_value,
                    setting_type = EXCLUDED.setting_type,
                    updated_at = CURRENT_TIMESTAMP
            """
            
            db.execute(text(upsert_query), {
                "org_id": org_id,
                "key": key,
                "value": setting_value,
                "type": setting_type,
                "user_id": context.user_id
            })
        
        db.commit()
        
        return {"success": True, "message": "Feature settings updated successfully"}
        
    except Exception as e:
        logger.error(f"Error updating feature settings: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update feature settings: {str(e)}")


@router.put("/database-flags")
@with_tenant_context
async def update_database_feature_flags(
    features: Dict[str, bool],
    _: dict = Depends(PermissionChecker("settings", "edit")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Update database-level feature flags"""
    try:
        updated_features = {}

        for feature_name, is_enabled in features.items():
            existing = db.execute(text("""
                SELECT flag_id FROM system_config.feature_flags
                WHERE flag_key = :key AND org_id IS NULL
            """), {"key": feature_name}).first()

            if existing:
                db.execute(text("""
                    UPDATE system_config.feature_flags
                    SET is_active = :enabled, default_value = :value, updated_at = CURRENT_TIMESTAMP
                    WHERE flag_key = :key AND org_id IS NULL
                """), {"key": feature_name, "enabled": is_enabled, "value": str(is_enabled).lower()})
            else:
                db.execute(text("""
                    INSERT INTO system_config.feature_flags (
                        flag_key, flag_name, description, flag_type, default_value, is_active
                    ) VALUES (:key, :name, :desc, 'boolean', :value, :enabled)
                """), {
                    "key": feature_name,
                    "name": feature_name.replace('_', ' ').title(),
                    "desc": f"System feature: {feature_name}",
                    "value": str(is_enabled).lower(),
                    "enabled": is_enabled
                })

            updated_features[feature_name] = is_enabled

        db.commit()

        return {"success": True, "message": "Database feature flags updated", "features": updated_features}

    except Exception as e:
        logger.error(f"Error updating database feature flags: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update: {str(e)}")
