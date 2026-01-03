"""
Business Settings API
Handles billing, inventory, compliance configuration

MODERNIZED: Uses TenantAwareSession + PermissionChecker
"""
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from pydantic import BaseModel, Field
import logging
from datetime import datetime
import json

from ....core.tenant_service import TenantAwareSession, get_tenant_aware_db, with_tenant_context
from ....core.org_context import OrgContext, get_org_context
from ....core.permissions import PermissionChecker
from ...services.settings.settings_service import invalidate_settings_cache  # CACHE: Clear on update

logger = logging.getLogger(__name__)

router = APIRouter()


# Pydantic models
class SettingUpdate(BaseModel):
    setting_value: Any
    setting_type: Optional[str] = Field(None, pattern="^(boolean|string|number|json)$")
    description: Optional[str] = None
    
class BillingSettings(BaseModel):
    allow_billing_without_customer: bool = False
    default_cash_customer_name: str = "Cash Customer"
    allow_negative_stock: bool = False
    enforce_batch_selection: bool = True  # If false, auto-select via FIFO
    auto_round_off_invoice: bool = True
    round_off_limit: float = 0.50
    
class InventorySettings(BaseModel):
    allow_negative_stock: bool = False
    auto_fifo_selection: bool = True  # Auto-select oldest batch when not enforcing manual selection
    track_expiry_dates: bool = True
    low_stock_alert_percentage: float = 20.0
    auto_update_mrp: bool = True
    enforce_barcode_scanning: bool = False
    
class ComplianceSettings(BaseModel):
    enforce_drug_license_check: bool = True
    drug_license_expiry_alert_days: int = 30
    enforce_gst_validation: bool = True
    require_pharmacist_approval: bool = False
    maintain_narcotic_register: bool = True


# Helper functions
def _parse_setting_value(value: str, setting_type: str):
    """Parse setting value based on type"""
    if setting_type == "boolean":
        return value.lower() in ('true', '1', 'yes') if isinstance(value, str) else bool(value)
    elif setting_type == "number":
        return float(value)
    elif setting_type == "json":
        return json.loads(value) if isinstance(value, str) else value
    return value


async def _get_all_settings_internal(db: TenantAwareSession, org_id: str) -> Dict:
    """Internal helper to get all settings"""
    query = """
        SELECT setting_category, setting_key, setting_value, setting_type, description, updated_at
        FROM master.system_settings
        WHERE org_id = :org_id
        ORDER BY setting_category, setting_key
    """
    
    result = db.execute(text(query), {"org_id": org_id})
    settings_by_category = {}
    
    for row in result:
        category = row.setting_category
        if category not in settings_by_category:
            settings_by_category[category] = {}
        
        value = _parse_setting_value(row.setting_value, row.setting_type)
        settings_by_category[category][row.setting_key] = {
            "value": value,
            "type": row.setting_type,
            "description": row.description,
            "updated_at": row.updated_at
        }
    
    return settings_by_category


async def _upsert_settings(db: TenantAwareSession, org_id: str, user_id: int, category: str, updates: list):
    """Helper to upsert multiple settings"""
    for key, value, setting_type in updates:
        upsert_query = """
            INSERT INTO master.system_settings (
                org_id, setting_category, setting_key, setting_value, 
                setting_type, is_active, created_by
            ) VALUES (
                :org_id, :category, :key, :value, :type, true, :user_id
            )
            ON CONFLICT (org_id, setting_category, setting_key) 
            DO UPDATE SET 
                setting_value = EXCLUDED.setting_value,
                updated_at = CURRENT_TIMESTAMP
        """
        db.execute(text(upsert_query), {
            "org_id": org_id,
            "category": category,
            "key": key,
            "value": str(value),
            "type": setting_type,
            "user_id": user_id
        })


@router.get("/all")
@with_tenant_context
async def get_all_settings(
    _: dict = Depends(PermissionChecker("settings", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get all business settings categorized"""
    try:
        return await _get_all_settings_internal(db, context.org_id)
    except Exception as e:
        logger.error(f"Error fetching settings: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch settings: {str(e)}")


@router.get("/billing")
@with_tenant_context
async def get_billing_settings(
    _: dict = Depends(PermissionChecker("settings", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get billing configuration"""
    try:
        settings = await _get_all_settings_internal(db, context.org_id)
        billing = settings.get("billing", {})
        
        return BillingSettings(
            allow_billing_without_customer=billing.get("allow_billing_without_customer", {}).get("value", False),
            default_cash_customer_name=billing.get("default_cash_customer_name", {}).get("value", "Cash Customer"),
            allow_negative_stock=billing.get("allow_negative_stock", {}).get("value", False),
            enforce_batch_selection=billing.get("enforce_batch_selection", {}).get("value", True),
            auto_round_off_invoice=billing.get("auto_round_off_invoice", {}).get("value", True),
            round_off_limit=billing.get("round_off_limit", {}).get("value", 0.50)
        )
    except Exception as e:
        logger.error(f"Error fetching billing settings: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch billing settings")


@router.put("/billing")
@with_tenant_context
async def update_billing_settings(
    settings: BillingSettings,
    _: dict = Depends(PermissionChecker("settings", "edit")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Update billing configuration"""
    try:
        updates = [
            ("allow_billing_without_customer", settings.allow_billing_without_customer, "boolean"),
            ("default_cash_customer_name", settings.default_cash_customer_name, "string"),
            ("allow_negative_stock", settings.allow_negative_stock, "boolean"),
            ("enforce_batch_selection", settings.enforce_batch_selection, "boolean"),
            ("auto_round_off_invoice", settings.auto_round_off_invoice, "boolean"),
            ("round_off_limit", settings.round_off_limit, "number")
        ]
        
        await _upsert_settings(db, context.org_id, context.user_id, "billing", updates)
        db.commit()
        invalidate_settings_cache(str(context.org_id))  # CACHE: Clear on update
        
        return {"message": "Billing settings updated successfully"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating billing settings: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update: {str(e)}")


@router.get("/inventory")
@with_tenant_context
async def get_inventory_settings(
    _: dict = Depends(PermissionChecker("settings", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get inventory configuration"""
    try:
        settings = await _get_all_settings_internal(db, context.org_id)
        inventory = settings.get("inventory", {})
        
        return InventorySettings(
            allow_negative_stock=inventory.get("allow_negative_stock", {}).get("value", False),
            auto_fifo_selection=inventory.get("auto_fifo_selection", {}).get("value", True),
            track_expiry_dates=inventory.get("track_expiry_dates", {}).get("value", True),
            low_stock_alert_percentage=inventory.get("low_stock_alert_percentage", {}).get("value", 20.0),
            auto_update_mrp=inventory.get("auto_update_mrp", {}).get("value", True),
            enforce_barcode_scanning=inventory.get("enforce_barcode_scanning", {}).get("value", False)
        )
    except Exception as e:
        logger.error(f"Error fetching inventory settings: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch inventory settings")


@router.put("/inventory")
@with_tenant_context
async def update_inventory_settings(
    settings: InventorySettings,
    _: dict = Depends(PermissionChecker("settings", "edit")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Update inventory configuration"""
    try:
        updates = [
            ("allow_negative_stock", settings.allow_negative_stock, "boolean"),
            ("auto_fifo_selection", settings.auto_fifo_selection, "boolean"),
            ("track_expiry_dates", settings.track_expiry_dates, "boolean"),
            ("low_stock_alert_percentage", settings.low_stock_alert_percentage, "number"),
            ("auto_update_mrp", settings.auto_update_mrp, "boolean"),
            ("enforce_barcode_scanning", settings.enforce_barcode_scanning, "boolean")
        ]
        
        await _upsert_settings(db, context.org_id, context.user_id, "inventory", updates)
        db.commit()
        invalidate_settings_cache(str(context.org_id))  # CACHE: Clear on update
        
        return {"message": "Inventory settings updated successfully"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating inventory settings: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update: {str(e)}")


@router.get("/compliance")
@with_tenant_context
async def get_compliance_settings(
    _: dict = Depends(PermissionChecker("settings", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get compliance configuration"""
    try:
        settings = await _get_all_settings_internal(db, context.org_id)
        compliance = settings.get("compliance", {})
        
        return ComplianceSettings(
            enforce_drug_license_check=compliance.get("enforce_drug_license_check", {}).get("value", True),
            drug_license_expiry_alert_days=compliance.get("drug_license_expiry_alert_days", {}).get("value", 30),
            enforce_gst_validation=compliance.get("enforce_gst_validation", {}).get("value", True),
            require_pharmacist_approval=compliance.get("require_pharmacist_approval", {}).get("value", False),
            maintain_narcotic_register=compliance.get("maintain_narcotic_register", {}).get("value", True)
        )
    except Exception as e:
        logger.error(f"Error fetching compliance settings: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch compliance settings")


@router.put("/compliance")
@with_tenant_context
async def update_compliance_settings(
    settings: ComplianceSettings,
    _: dict = Depends(PermissionChecker("settings", "edit")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Update compliance configuration"""
    try:
        updates = [
            ("enforce_drug_license_check", settings.enforce_drug_license_check, "boolean"),
            ("drug_license_expiry_alert_days", settings.drug_license_expiry_alert_days, "number"),
            ("enforce_gst_validation", settings.enforce_gst_validation, "boolean"),
            ("require_pharmacist_approval", settings.require_pharmacist_approval, "boolean"),
            ("maintain_narcotic_register", settings.maintain_narcotic_register, "boolean")
        ]
        
        await _upsert_settings(db, context.org_id, context.user_id, "compliance", updates)
        db.commit()
        invalidate_settings_cache(str(context.org_id))  # CACHE: Clear on update
        
        return {"message": "Compliance settings updated successfully"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating compliance settings: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update: {str(e)}")


@router.post("/initialize")
@with_tenant_context
async def initialize_default_settings(
    _: dict = Depends(PermissionChecker("settings", "edit")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Initialize default business settings for a new organization"""
    try:
        default_settings = [
            # Billing
            ("billing", "allow_billing_without_customer", "false", "boolean"),
            ("billing", "default_cash_customer_name", "Cash Customer", "string"),
            ("billing", "allow_negative_stock", "false", "boolean"),
            ("billing", "enforce_batch_selection", "true", "boolean"),
            ("billing", "auto_round_off_invoice", "true", "boolean"),
            ("billing", "round_off_limit", "0.50", "number"),
            # Inventory
            ("inventory", "allow_negative_stock", "false", "boolean"),
            ("inventory", "auto_fifo_selection", "true", "boolean"),
            ("inventory", "track_expiry_dates", "true", "boolean"),
            ("inventory", "low_stock_alert_percentage", "20", "number"),
            ("inventory", "auto_update_mrp", "true", "boolean"),
            ("inventory", "enforce_barcode_scanning", "false", "boolean"),
            # Compliance
            ("compliance", "enforce_drug_license_check", "true", "boolean"),
            ("compliance", "drug_license_expiry_alert_days", "30", "number"),
            ("compliance", "enforce_gst_validation", "true", "boolean"),
            ("compliance", "require_pharmacist_approval", "false", "boolean"),
            ("compliance", "maintain_narcotic_register", "true", "boolean"),
            # General
            ("general", "invoice_prefix", "INV", "string"),
            ("general", "order_prefix", "ORD", "string"),
            ("general", "challan_prefix", "DC", "string"),
            ("general", "default_payment_terms", "30", "number"),
            ("general", "financial_year_start", "04-01", "string")
        ]
        
        for category, key, value, setting_type in default_settings:
            db.execute(text("""
                INSERT INTO master.system_settings (
                    org_id, setting_category, setting_key, setting_value, 
                    setting_type, is_active, created_by
                ) VALUES (:org_id, :category, :key, :value, :type, true, :user_id)
                ON CONFLICT (org_id, setting_category, setting_key) DO NOTHING
            """), {
                "org_id": context.org_id,
                "category": category,
                "key": key,
                "value": value,
                "type": setting_type,
                "user_id": context.user_id
            })
        
        db.commit()
        return {"message": "Default settings initialized successfully"}
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error initializing settings: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to initialize: {str(e)}")


@router.get("/{category}/{key}")
@with_tenant_context
async def get_specific_setting(
    category: str,
    key: str,
    _: dict = Depends(PermissionChecker("settings", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get a specific setting by category and key"""
    try:
        result = db.execute(text("""
            SELECT setting_value, setting_type, description, updated_at
            FROM master.system_settings
            WHERE org_id = :org_id AND setting_category = :category 
            AND setting_key = :key AND is_active = true
        """), {"org_id": context.org_id, "category": category, "key": key}).first()
        
        if not result:
            raise HTTPException(status_code=404, detail="Setting not found")
        
        value = _parse_setting_value(result.setting_value, result.setting_type)
        
        return {
            "value": value,
            "type": result.setting_type,
            "description": result.description,
            "updated_at": result.updated_at
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching setting: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch setting")


@router.put("/{category}/{key}")
@with_tenant_context
async def update_specific_setting(
    category: str,
    key: str,
    update: SettingUpdate,
    _: dict = Depends(PermissionChecker("settings", "edit")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Update a specific setting"""
    try:
        value_str = str(update.setting_value)
        if update.setting_type == "json":
            value_str = json.dumps(update.setting_value)
        
        db.execute(text("""
            INSERT INTO master.system_settings (
                org_id, setting_category, setting_key, setting_value, 
                setting_type, description, is_active, created_by
            ) VALUES (:org_id, :category, :key, :value, :type, :desc, true, :user_id)
            ON CONFLICT (org_id, setting_category, setting_key) 
            DO UPDATE SET 
                setting_value = EXCLUDED.setting_value,
                setting_type = COALESCE(EXCLUDED.setting_type, master.system_settings.setting_type),
                description = COALESCE(EXCLUDED.description, master.system_settings.description),
                updated_at = CURRENT_TIMESTAMP
        """), {
            "org_id": context.org_id,
            "category": category,
            "key": key,
            "value": value_str,
            "type": update.setting_type,
            "desc": update.description,
            "user_id": context.user_id
        })
        
        db.commit()
        return {"message": f"Setting {category}.{key} updated successfully"}
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating setting: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update: {str(e)}")


@router.get("/export")
@with_tenant_context
async def export_settings(
    _: dict = Depends(PermissionChecker("settings", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Export all settings for backup"""
    try:
        settings = await _get_all_settings_internal(db, context.org_id)
        return {
            "org_id": str(context.org_id),
            "exported_at": datetime.utcnow().isoformat(),
            "settings": settings
        }
    except Exception as e:
        logger.error(f"Error exporting settings: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to export settings")


@router.post("/import")
@with_tenant_context
async def import_settings(
    settings_data: dict,
    _: dict = Depends(PermissionChecker("settings", "edit")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Import settings from backup"""
    try:
        imported_count = 0
        settings = settings_data.get("settings", {})
        
        for category, category_settings in settings.items():
            for key, setting_info in category_settings.items():
                db.execute(text("""
                    INSERT INTO master.system_settings (
                        org_id, setting_category, setting_key, setting_value, 
                        setting_type, description, is_active, created_by
                    ) VALUES (:org_id, :category, :key, :value, :type, :desc, true, :user_id)
                    ON CONFLICT (org_id, setting_category, setting_key) 
                    DO UPDATE SET 
                        setting_value = EXCLUDED.setting_value,
                        updated_at = CURRENT_TIMESTAMP
                """), {
                    "org_id": context.org_id,
                    "category": category,
                    "key": key,
                    "value": str(setting_info.get("value", "")),
                    "type": setting_info.get("type", "string"),
                    "desc": setting_info.get("description", ""),
                    "user_id": context.user_id
                })
                imported_count += 1
        
        db.commit()
        return {"message": "Settings imported", "imported_count": imported_count}
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error importing settings: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to import: {str(e)}")
