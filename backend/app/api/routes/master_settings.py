"""
Master Settings API
Manages system-wide configuration and business rules
"""
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel, Field
import logging
from datetime import datetime
import json

from ...core.database import get_db
from ...core.secure_auth import get_org_id_string  # SECURE: JWT-based auth

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/master-settings", tags=["master-settings"])

class SettingUpdate(BaseModel):
    """Schema for updating a setting"""
    setting_value: Any
    setting_type: Optional[str] = Field(None, pattern="^(boolean|string|number|json)$")
    description: Optional[str] = None
    
class BillingSettings(BaseModel):
    """Schema for billing configuration"""
    allow_billing_without_customer: bool = False
    default_cash_customer_name: str = "Cash Customer"
    allow_negative_stock: bool = False
    allow_expired_product_sale: bool = False
    enforce_batch_selection: bool = True
    auto_round_off_invoice: bool = True
    round_off_limit: float = 0.50
    
class InventorySettings(BaseModel):
    """Schema for inventory configuration"""
    allow_negative_stock: bool = False
    track_batch_wise: bool = True
    track_expiry_dates: bool = True
    low_stock_alert_percentage: float = 20.0
    auto_update_mrp: bool = True
    enforce_barcode_scanning: bool = False
    
class ComplianceSettings(BaseModel):
    """Schema for compliance configuration"""
    enforce_drug_license_check: bool = True
    drug_license_expiry_alert_days: int = 30
    enforce_gst_validation: bool = True
    require_pharmacist_approval: bool = False
    maintain_narcotic_register: bool = True
    
class GeneralSettings(BaseModel):
    """Schema for general system settings"""
    company_name: str
    company_address: str
    company_phone: str
    company_email: str
    company_gst: str
    default_payment_terms: int = 30
    invoice_prefix: str = "INV"
    order_prefix: str = "ORD"
    challan_prefix: str = "DC"
    financial_year_start: str = "04-01"  # MM-DD

@router.get("/all")
async def get_all_settings(
    org_id: str = Depends(get_org_id_string),
    db: Session = Depends(get_db)
):
    """
    Get all master settings for the organization
    
    Returns categorized settings for easy management
    """
    try:
        query = """
            SELECT 
                setting_id,
                setting_category,
                setting_key,
                setting_value,
                setting_type,
                description,
                is_active,
                updated_at
            FROM master.system_settings
            WHERE org_id = :org_id
            ORDER BY setting_category, setting_key
        """
        
        result = db.execute(text(query), {"org_id": org_id})
        settings = [dict(row._mapping) for row in result]
        
        # Group by category
        settings_by_category = {}
        for setting in settings:
            category = setting["setting_category"]
            if category not in settings_by_category:
                settings_by_category[category] = {}
            
            # Parse JSON values
            value = setting["setting_value"]
            if setting["setting_type"] == "json" and isinstance(value, str):
                try:
                    value = json.loads(value)
                except:
                    pass
            elif setting["setting_type"] == "boolean":
                value = value.lower() in ('true', '1', 'yes') if isinstance(value, str) else bool(value)
            elif setting["setting_type"] == "number":
                try:
                    value = float(value)
                except:
                    pass
                    
            settings_by_category[category][setting["setting_key"]] = {
                "value": value,
                "type": setting["setting_type"],
                "description": setting["description"],
                "updated_at": setting["updated_at"]
            }
        
        return settings_by_category
        
    except Exception as e:
        logger.error(f"Error fetching settings: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch settings: {str(e)}")

@router.get("/billing")
async def get_billing_settings(
    org_id: str = Depends(get_org_id_string),
    db: Session = Depends(get_db)
):
    """Get billing-specific settings"""
    try:
        settings = await get_all_settings(org_id, db)
        billing_settings = settings.get("billing", {})
        
        return BillingSettings(
            allow_billing_without_customer=billing_settings.get("allow_billing_without_customer", {}).get("value", False),
            default_cash_customer_name=billing_settings.get("default_cash_customer_name", {}).get("value", "Cash Customer"),
            allow_negative_stock=billing_settings.get("allow_negative_stock", {}).get("value", False),
            allow_expired_product_sale=billing_settings.get("allow_expired_product_sale", {}).get("value", False),
            enforce_batch_selection=billing_settings.get("enforce_batch_selection", {}).get("value", True),
            auto_round_off_invoice=billing_settings.get("auto_round_off_invoice", {}).get("value", True),
            round_off_limit=billing_settings.get("round_off_limit", {}).get("value", 0.50)
        )
        
    except Exception as e:
        logger.error(f"Error fetching billing settings: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch billing settings")

@router.put("/billing")
async def update_billing_settings(
    settings: BillingSettings,
    org_id: str = Depends(get_org_id_string),
    db: Session = Depends(get_db)
):
    """Update billing configuration"""
    try:
        # Update each setting
        billing_updates = [
            ("allow_billing_without_customer", settings.allow_billing_without_customer, "boolean"),
            ("default_cash_customer_name", settings.default_cash_customer_name, "string"),
            ("allow_negative_stock", settings.allow_negative_stock, "boolean"),
            ("allow_expired_product_sale", settings.allow_expired_product_sale, "boolean"),
            ("enforce_batch_selection", settings.enforce_batch_selection, "boolean"),
            ("auto_round_off_invoice", settings.auto_round_off_invoice, "boolean"),
            ("round_off_limit", settings.round_off_limit, "number")
        ]
        
        for key, value, setting_type in billing_updates:
            upsert_query = """
                INSERT INTO master.system_settings (
                    org_id, setting_category, setting_key, setting_value, 
                    setting_type, is_active, created_by
                ) VALUES (
                    :org_id, 'billing', :key, :value, :type, true, 1
                )
                ON CONFLICT (org_id, setting_category, setting_key) 
                DO UPDATE SET 
                    setting_value = EXCLUDED.setting_value,
                    updated_at = CURRENT_TIMESTAMP
            """
            
            db.execute(text(upsert_query), {
                "org_id": org_id,
                "key": key,
                "value": str(value),
                "type": setting_type
            })
        
        db.commit()
        
        return {"message": "Billing settings updated successfully"}
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating billing settings: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update billing settings: {str(e)}")

@router.get("/inventory")
async def get_inventory_settings(
    org_id: str = Depends(get_org_id_string),
    db: Session = Depends(get_db)
):
    """Get inventory-specific settings"""
    try:
        settings = await get_all_settings(org_id, db)
        inventory_settings = settings.get("inventory", {})
        
        return InventorySettings(
            allow_negative_stock=inventory_settings.get("allow_negative_stock", {}).get("value", False),
            track_batch_wise=inventory_settings.get("track_batch_wise", {}).get("value", True),
            track_expiry_dates=inventory_settings.get("track_expiry_dates", {}).get("value", True),
            low_stock_alert_percentage=inventory_settings.get("low_stock_alert_percentage", {}).get("value", 20.0),
            auto_update_mrp=inventory_settings.get("auto_update_mrp", {}).get("value", True),
            enforce_barcode_scanning=inventory_settings.get("enforce_barcode_scanning", {}).get("value", False)
        )
        
    except Exception as e:
        logger.error(f"Error fetching inventory settings: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch inventory settings")

@router.put("/inventory")
async def update_inventory_settings(
    settings: InventorySettings,
    org_id: str = Depends(get_org_id_string),
    db: Session = Depends(get_db)
):
    """Update inventory configuration"""
    try:
        inventory_updates = [
            ("allow_negative_stock", settings.allow_negative_stock, "boolean"),
            ("track_batch_wise", settings.track_batch_wise, "boolean"),
            ("track_expiry_dates", settings.track_expiry_dates, "boolean"),
            ("low_stock_alert_percentage", settings.low_stock_alert_percentage, "number"),
            ("auto_update_mrp", settings.auto_update_mrp, "boolean"),
            ("enforce_barcode_scanning", settings.enforce_barcode_scanning, "boolean")
        ]
        
        for key, value, setting_type in inventory_updates:
            upsert_query = """
                INSERT INTO master.system_settings (
                    org_id, setting_category, setting_key, setting_value, 
                    setting_type, is_active, created_by
                ) VALUES (
                    :org_id, 'inventory', :key, :value, :type, true, 1
                )
                ON CONFLICT (org_id, setting_category, setting_key) 
                DO UPDATE SET 
                    setting_value = EXCLUDED.setting_value,
                    updated_at = CURRENT_TIMESTAMP
            """
            
            db.execute(text(upsert_query), {
                "org_id": org_id,
                "key": key,
                "value": str(value),
                "type": setting_type
            })
        
        db.commit()
        
        return {"message": "Inventory settings updated successfully"}
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating inventory settings: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update inventory settings: {str(e)}")

@router.get("/compliance")
async def get_compliance_settings(
    org_id: str = Depends(get_org_id_string),
    db: Session = Depends(get_db)
):
    """Get compliance-specific settings"""
    try:
        settings = await get_all_settings(org_id, db)
        compliance_settings = settings.get("compliance", {})
        
        return ComplianceSettings(
            enforce_drug_license_check=compliance_settings.get("enforce_drug_license_check", {}).get("value", True),
            drug_license_expiry_alert_days=compliance_settings.get("drug_license_expiry_alert_days", {}).get("value", 30),
            enforce_gst_validation=compliance_settings.get("enforce_gst_validation", {}).get("value", True),
            require_pharmacist_approval=compliance_settings.get("require_pharmacist_approval", {}).get("value", False),
            maintain_narcotic_register=compliance_settings.get("maintain_narcotic_register", {}).get("value", True)
        )
        
    except Exception as e:
        logger.error(f"Error fetching compliance settings: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch compliance settings")

@router.put("/compliance")
async def update_compliance_settings(
    settings: ComplianceSettings,
    org_id: str = Depends(get_org_id_string),
    db: Session = Depends(get_db)
):
    """Update compliance configuration"""
    try:
        compliance_updates = [
            ("enforce_drug_license_check", settings.enforce_drug_license_check, "boolean"),
            ("drug_license_expiry_alert_days", settings.drug_license_expiry_alert_days, "number"),
            ("enforce_gst_validation", settings.enforce_gst_validation, "boolean"),
            ("require_pharmacist_approval", settings.require_pharmacist_approval, "boolean"),
            ("maintain_narcotic_register", settings.maintain_narcotic_register, "boolean")
        ]
        
        for key, value, setting_type in compliance_updates:
            upsert_query = """
                INSERT INTO master.system_settings (
                    org_id, setting_category, setting_key, setting_value, 
                    setting_type, is_active, created_by
                ) VALUES (
                    :org_id, 'compliance', :key, :value, :type, true, 1
                )
                ON CONFLICT (org_id, setting_category, setting_key) 
                DO UPDATE SET 
                    setting_value = EXCLUDED.setting_value,
                    updated_at = CURRENT_TIMESTAMP
            """
            
            db.execute(text(upsert_query), {
                "org_id": org_id,
                "key": key,
                "value": str(value),
                "type": setting_type
            })
        
        db.commit()
        
        return {"message": "Compliance settings updated successfully"}
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating compliance settings: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update compliance settings: {str(e)}")

@router.post("/initialize-defaults")
async def initialize_default_settings(
    org_id: str = Depends(get_org_id_string),
    db: Session = Depends(get_db)
):
    """
    Initialize default settings for a new organization
    
    Creates all necessary default configurations
    """
    try:
        # Default settings to create
        default_settings = [
            # Billing settings
            ("billing", "allow_billing_without_customer", "false", "boolean", "Allow creating invoices without customer selection"),
            ("billing", "default_cash_customer_name", "Cash Customer", "string", "Default name for cash sales"),
            ("billing", "allow_negative_stock", "false", "boolean", "Allow selling products with negative stock"),
            ("billing", "allow_expired_product_sale", "false", "boolean", "Allow selling expired products"),
            ("billing", "enforce_batch_selection", "true", "boolean", "Require batch selection during billing"),
            ("billing", "auto_round_off_invoice", "true", "boolean", "Automatically round off invoice totals"),
            ("billing", "round_off_limit", "0.50", "number", "Maximum round off amount allowed"),
            
            # Inventory settings
            ("inventory", "allow_negative_stock", "false", "boolean", "Allow negative stock levels"),
            ("inventory", "track_batch_wise", "true", "boolean", "Track inventory by batch"),
            ("inventory", "track_expiry_dates", "true", "boolean", "Track product expiry dates"),
            ("inventory", "low_stock_alert_percentage", "20", "number", "Alert when stock falls below this percentage"),
            ("inventory", "auto_update_mrp", "true", "boolean", "Automatically update MRP from purchase"),
            ("inventory", "enforce_barcode_scanning", "false", "boolean", "Require barcode scanning for products"),
            
            # Compliance settings
            ("compliance", "enforce_drug_license_check", "true", "boolean", "Check drug license validity before operations"),
            ("compliance", "drug_license_expiry_alert_days", "30", "number", "Days before license expiry to show alert"),
            ("compliance", "enforce_gst_validation", "true", "boolean", "Validate GST numbers"),
            ("compliance", "require_pharmacist_approval", "false", "boolean", "Require pharmacist approval for certain operations"),
            ("compliance", "maintain_narcotic_register", "true", "boolean", "Maintain separate register for narcotic drugs"),
            
            # General settings
            ("general", "invoice_prefix", "INV", "string", "Prefix for invoice numbers"),
            ("general", "order_prefix", "ORD", "string", "Prefix for order numbers"),
            ("general", "challan_prefix", "DC", "string", "Prefix for delivery challan numbers"),
            ("general", "default_payment_terms", "30", "number", "Default payment terms in days"),
            ("general", "financial_year_start", "04-01", "string", "Financial year start date (MM-DD)")
        ]
        
        # Insert all default settings
        for category, key, value, setting_type, description in default_settings:
            insert_query = """
                INSERT INTO master.system_settings (
                    org_id, setting_category, setting_key, setting_value, 
                    setting_type, description, is_active, created_by
                ) VALUES (
                    :org_id, :category, :key, :value, :type, :description, true, 1
                )
                ON CONFLICT (org_id, setting_category, setting_key) DO NOTHING
            """
            
            db.execute(text(insert_query), {
                "org_id": org_id,
                "category": category,
                "key": key,
                "value": value,
                "type": setting_type,
                "description": description
            })
        
        db.commit()
        
        return {"message": "Default settings initialized successfully"}
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error initializing default settings: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to initialize settings: {str(e)}")

@router.get("/setting/{category}/{key}")
async def get_specific_setting(
    category: str,
    key: str,
    org_id: str = Depends(get_org_id_string),
    db: Session = Depends(get_db)
):
    """Get a specific setting by category and key"""
    try:
        query = """
            SELECT 
                setting_value,
                setting_type,
                description,
                updated_at
            FROM master.system_settings
            WHERE org_id = :org_id
                AND setting_category = :category
                AND setting_key = :key
                AND is_active = true
        """
        
        result = db.execute(text(query), {
            "org_id": org_id,
            "category": category,
            "key": key
        })
        
        setting = result.first()
        if not setting:
            raise HTTPException(status_code=404, detail="Setting not found")
        
        # Parse value based on type
        value = setting.setting_value
        if setting.setting_type == "boolean":
            value = value.lower() in ('true', '1', 'yes')
        elif setting.setting_type == "number":
            value = float(value)
        elif setting.setting_type == "json":
            value = json.loads(value)
        
        return {
            "value": value,
            "type": setting.setting_type,
            "description": setting.description,
            "updated_at": setting.updated_at
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching setting: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch setting")

@router.put("/setting/{category}/{key}")
async def update_specific_setting(
    category: str,
    key: str,
    update: SettingUpdate,
    org_id: str = Depends(get_org_id_string),
    db: Session = Depends(get_db)
):
    """Update a specific setting"""
    try:
        # Convert value to string for storage
        value_str = str(update.setting_value)
        if update.setting_type == "json":
            value_str = json.dumps(update.setting_value)
        
        upsert_query = """
            INSERT INTO master.system_settings (
                org_id, setting_category, setting_key, setting_value, 
                setting_type, description, is_active, created_by
            ) VALUES (
                :org_id, :category, :key, :value, :type, :description, true, 1
            )
            ON CONFLICT (org_id, setting_category, setting_key) 
            DO UPDATE SET 
                setting_value = EXCLUDED.setting_value,
                setting_type = COALESCE(EXCLUDED.setting_type, master.system_settings.setting_type),
                description = COALESCE(EXCLUDED.description, master.system_settings.description),
                updated_at = CURRENT_TIMESTAMP
        """
        
        db.execute(text(upsert_query), {
            "org_id": org_id,
            "category": category,
            "key": key,
            "value": value_str,
            "type": update.setting_type,
            "description": update.description
        })
        
        db.commit()
        
        return {"message": f"Setting {category}.{key} updated successfully"}
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating setting: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update setting: {str(e)}")

@router.get("/export")
async def export_settings(
    org_id: str = Depends(get_org_id_string),
    db: Session = Depends(get_db)
):
    """Export all settings as JSON for backup or migration"""
    try:
        settings = await get_all_settings(org_id, db)
        
        return {
            "org_id": org_id,
            "exported_at": datetime.utcnow().isoformat(),
            "settings": settings
        }
        
    except Exception as e:
        logger.error(f"Error exporting settings: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to export settings")

@router.post("/import")
async def import_settings(
    settings_data: dict,
    org_id: str = Depends(get_org_id_string),
    db: Session = Depends(get_db)
):
    """Import settings from JSON backup"""
    try:
        imported_count = 0
        settings = settings_data.get("settings", {})
        
        for category, category_settings in settings.items():
            for key, setting_info in category_settings.items():
                # Insert or update each setting
                upsert_query = """
                    INSERT INTO master.system_settings (
                        org_id, setting_category, setting_key, setting_value, 
                        setting_type, description, is_active, created_by
                    ) VALUES (
                        :org_id, :category, :key, :value, :type, :description, true, 1
                    )
                    ON CONFLICT (org_id, setting_category, setting_key) 
                    DO UPDATE SET 
                        setting_value = EXCLUDED.setting_value,
                        setting_type = EXCLUDED.setting_type,
                        description = EXCLUDED.description,
                        updated_at = CURRENT_TIMESTAMP
                """
                
                db.execute(text(upsert_query), {
                    "org_id": org_id,
                    "category": category,
                    "key": key,
                    "value": str(setting_info.get("value", "")),
                    "type": setting_info.get("type", "string"),
                    "description": setting_info.get("description", "")
                })
                
                imported_count += 1
        
        db.commit()
        
        return {
            "message": "Settings imported successfully",
            "imported_count": imported_count
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error importing settings: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to import settings: {str(e)}")