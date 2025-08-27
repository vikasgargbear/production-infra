"""
Company API Router
Handles company profile and settings
"""
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from datetime import datetime
import json

from ...core.database import get_db
from ...core.auth_utils import get_org_id_from_header

logger = logging.getLogger(__name__)

router = APIRouter(tags=["company"])

@router.get("/info")
def get_company_info(
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """Get company information"""
    try:
        # First try to get from organizations table
        org_query = """
            SELECT 
                org_id,
                org_name,
                legal_name,
                gst_number,
                pan_number,
                drug_license_number,
                fssai_number,
                registered_address,
                correspondence_address,
                contact_numbers,
                email_addresses,
                website,
                business_settings,
                created_at,
                updated_at
            FROM master.organizations
            WHERE org_id = :org_id
        """
        
        result = db.execute(text(org_query), {"org_id": org_id})
        org_data = result.first()
        
        if org_data:
            # Parse JSON fields
            registered_addr = {}
            contact_nums = {}
            email_addrs = {}
            
            if org_data.registered_address:
                try:
                    registered_addr = json.loads(org_data.registered_address) if isinstance(org_data.registered_address, str) else org_data.registered_address
                except:
                    registered_addr = {}
            
            if org_data.contact_numbers:
                try:
                    contact_nums = json.loads(org_data.contact_numbers) if isinstance(org_data.contact_numbers, str) else org_data.contact_numbers
                except:
                    contact_nums = {}
                    
            if org_data.email_addresses:
                try:
                    email_addrs = json.loads(org_data.email_addresses) if isinstance(org_data.email_addresses, str) else org_data.email_addresses
                except:
                    email_addrs = {}
            
            # Return formatted data matching frontend expectations
            return {
                "name": org_data.org_name or "Your Company",
                "address": registered_addr.get("line1", ""),
                "city": registered_addr.get("city", ""),
                "state": registered_addr.get("state", ""),
                "pincode": registered_addr.get("pincode", ""),
                "country": "India",
                "phone": contact_nums.get("primary", ""),
                "email": email_addrs.get("primary", ""),
                "website": org_data.website or "",
                "gst": org_data.gst_number or "",
                "pan": org_data.pan_number or "",
                "drug_license_no": org_data.drug_license_number or "",
                "fssai_no": org_data.fssai_number or "",
                "logo": None
            }
        
        # If not found, try settings table
        settings_query = """
            SELECT 
                setting_value
            FROM settings.organization_settings
            WHERE org_id = :org_id AND setting_key = 'company_info'
        """
        
        settings_result = db.execute(text(settings_query), {"org_id": org_id})
        settings_data = settings_result.first()
        
        if settings_data and settings_data.setting_value:
            return json.loads(settings_data.setting_value)
        
        # Return default values if nothing found
        return {
            "name": "Your Company",
            "address": "",
            "city": "",
            "state": "",
            "pincode": "",
            "country": "India",
            "phone": "",
            "email": "",
            "website": "",
            "gst": "",
            "pan": "",
            "logo": None
        }
        
    except Exception as e:
        logger.error(f"Error fetching company info: {str(e)}")
        # Return default values on error
        return {
            "name": "Your Company",
            "address": "",
            "city": "",
            "state": "",
            "pincode": "",
            "country": "India",
            "phone": "",
            "email": "",
            "website": "",
            "gst": "",
            "pan": "",
            "logo": None
        }

@router.put("/info")
def update_company_info(
    company_data: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """Update company information"""
    try:
        # First, check if organization exists
        check_query = """
            SELECT org_id FROM master.organizations 
            WHERE org_id = :org_id
        """
        
        exists = db.execute(text(check_query), {"org_id": org_id}).first()
        
        # Prepare JSON fields
        registered_address = json.dumps({
            "line1": company_data.get("address", ""),
            "city": company_data.get("city", ""),
            "state": company_data.get("state", ""),
            "pincode": company_data.get("pincode", "")
        })
        
        contact_numbers = json.dumps({
            "primary": company_data.get("phone", "")
        })
        
        email_addresses = json.dumps({
            "primary": company_data.get("email", "")
        })
        
        if exists:
            # Update existing organization
            update_query = """
                UPDATE master.organizations
                SET 
                    org_name = :name,
                    registered_address = :registered_address::jsonb,
                    contact_numbers = :contact_numbers::jsonb,
                    email_addresses = :email_addresses::jsonb,
                    website = :website,
                    gst_number = :gst,
                    pan_number = :pan,
                    drug_license_number = :drug_license_no,
                    fssai_number = :fssai_no,
                    updated_at = CURRENT_TIMESTAMP
                WHERE org_id = :org_id
                RETURNING org_id, org_name, gst_number, pan_number
            """
        else:
            # This shouldn't happen as organization is created during setup
            # But handle it just in case
            return {
                "error": "Organization not found. Please complete initial setup."
            }
        
        # Execute the update
        result = db.execute(text(update_query), {
            "org_id": org_id,
            "name": company_data.get("name", ""),
            "registered_address": registered_address,
            "contact_numbers": contact_numbers,
            "email_addresses": email_addresses,
            "website": company_data.get("website", ""),
            "gst": company_data.get("gst", ""),
            "pan": company_data.get("pan", ""),
            "drug_license_no": company_data.get("drug_license_no", ""),
            "fssai_no": company_data.get("fssai_no", "")
        })
        
        db.commit()
        
        # Also store in settings for backward compatibility
        settings_query = """
            INSERT INTO settings.organization_settings (org_id, setting_key, setting_value)
            VALUES (:org_id, 'company_info', :setting_value)
            ON CONFLICT (org_id, setting_key) 
            DO UPDATE SET setting_value = :setting_value, updated_at = CURRENT_TIMESTAMP
        """
        
        db.execute(text(settings_query), {
            "org_id": org_id,
            "setting_value": json.dumps(company_data)
        })
        
        db.commit()
        
        # Return the data in same format as GET
        return company_data
        
    except Exception as e:
        logger.error(f"Error updating company info: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update company info: {str(e)}")

@router.get("/org-id")
def get_organization_id(
    org_id: str = Depends(get_org_id_from_header)
):
    """Get current organization ID"""
    return {"org_id": org_id}

@router.get("/settings")
def get_company_settings(
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """Get company settings"""
    try:
        query = """
            SELECT 
                setting_key, 
                setting_value
            FROM settings.organization_settings
            WHERE org_id = :org_id
        """
        
        result = db.execute(text(query), {"org_id": org_id})
        settings_rows = result.fetchall()
        
        # Convert to dictionary
        settings = {}
        for row in settings_rows:
            key = row.setting_key
            value = row.setting_value
            
            # Try to parse JSON values
            try:
                settings[key] = json.loads(value) if value else None
            except:
                settings[key] = value
        
        # Add default settings if missing
        default_settings = {
            "invoice_prefix": "INV",
            "challan_prefix": "DC",
            "order_prefix": "ORD",
            "enable_gst": True,
            "enable_barcode": True,
            "enable_batch_tracking": True,
            "enable_expiry_tracking": True,
            "currency": "INR",
            "date_format": "DD/MM/YYYY",
            "financial_year_start": "04-01",
            "invoice_terms": "Net 30 days",
            "default_payment_terms": 30
        }
        
        for key, default_value in default_settings.items():
            if key not in settings:
                settings[key] = default_value
        
        return settings
        
    except Exception as e:
        logger.error(f"Error fetching company settings: {str(e)}")
        return {}

@router.put("/settings")
def update_company_settings(
    settings: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """Update company settings"""
    try:
        # Update each setting
        for key, value in settings.items():
            # Convert value to JSON string if it's not already
            if not isinstance(value, str):
                value = json.dumps(value)
            
            query = """
                INSERT INTO settings.organization_settings (org_id, setting_key, setting_value)
                VALUES (:org_id, :key, :value)
                ON CONFLICT (org_id, setting_key)
                DO UPDATE SET setting_value = :value, updated_at = CURRENT_TIMESTAMP
            """
            
            db.execute(text(query), {
                "org_id": org_id,
                "key": key,
                "value": value
            })
        
        db.commit()
        
        # Return updated settings
        return get_company_settings(db, org_id)
        
    except Exception as e:
        logger.error(f"Error updating company settings: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update company settings: {str(e)}")