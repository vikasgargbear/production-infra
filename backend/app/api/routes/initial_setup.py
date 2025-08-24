"""
Initial setup endpoint for creating the first organization
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Dict, Any
import uuid
import json
import os
from datetime import datetime
import logging

from ...core.database import get_db
from ...core.supabase_auth import supabase_auth
from ...core.auth_utils import get_optional_org_id

logger = logging.getLogger(__name__)

router = APIRouter(tags=["setup"])

@router.get("/check")
async def check_setup_status(db: Session = Depends(get_db)):
    """Check if initial setup is complete"""
    try:
        # Check if any organization exists
        result = db.execute(text("""
            SELECT COUNT(*) as count FROM master.organizations
        """)).fetchone()
        
        has_org = result.count > 0 if result else False
        
        # If org exists, get the first one
        org_data = None
        if has_org:
            org = db.execute(text("""
                SELECT org_id, org_name, legal_name, gst_number, pan_number
                FROM master.organizations
                LIMIT 1
            """)).fetchone()
            
            if org:
                org_data = {
                    "org_id": str(org.org_id),
                    "org_name": org.org_name,
                    "legal_name": org.legal_name,
                    "gst_number": org.gst_number,
                    "pan_number": org.pan_number
                }
                
                # Store org_id in environment or config for frontend to use
                # This would be handled by auth/session in production
        
        return {
            "setup_complete": has_org,
            "organization": org_data
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error checking setup status: {str(e)}")

@router.post("/initialize")
async def initialize_organization(
    setup_data: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """
    Initialize the first organization and admin user
    
    Expected data:
    {
        "org_name": "Company Name",
        "legal_name": "Legal Company Name Pvt Ltd",
        "business_type": "PHARMACEUTICAL",
        "gst_number": "GST123456789",
        "pan_number": "ABCDE1234F",
        "drug_license_number": "DL-123456",
        "admin_email": "admin@company.com",
        "admin_password": "securepassword",
        "admin_name": "Admin User",
        "address": {
            "line1": "123 Main St",
            "city": "Mumbai",
            "state": "Maharashtra",
            "pincode": "400001"
        }
    }
    """
    try:
        # Check if org already exists
        existing = db.execute(text("""
            SELECT COUNT(*) as count FROM master.organizations
        """)).fetchone()
        
        if existing and existing.count > 0:
            raise HTTPException(status_code=400, detail="Organization already exists")
        
        # Generate a unique org_id for this organization
        org_id = str(uuid.uuid4())
        
        # Create organization
        db.execute(text("""
            INSERT INTO master.organizations (
                org_id, org_code, org_name, legal_name, business_type,
                gst_number, pan_number, drug_license_number,
                registered_address, contact_numbers, email_addresses,
                currency_code, date_format, time_zone,
                subscription_plan, subscription_status, user_limit,
                is_active, is_verified, created_at, updated_at
            ) VALUES (
                :org_id, :org_code, :org_name, :legal_name, :business_type,
                :gst_number, :pan_number, :drug_license_number,
                :address, :contact_numbers, :email_addresses,
                'INR', 'DD/MM/YYYY', 'Asia/Kolkata',
                'PREMIUM', 'ACTIVE', 100,
                true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """), {
            "org_id": org_id,
            "org_code": setup_data.get("org_code", "ORG001"),
            "org_name": setup_data["org_name"],
            "legal_name": setup_data.get("legal_name", setup_data["org_name"]),
            "business_type": setup_data.get("business_type", "PHARMACEUTICAL"),
            "gst_number": setup_data.get("gst_number"),
            "pan_number": setup_data.get("pan_number"),
            "drug_license_number": setup_data.get("drug_license_number"),
            "address": json.dumps(setup_data.get("address", {})),
            "contact_numbers": json.dumps({"primary": setup_data.get("phone", "")}),
            "email_addresses": json.dumps({"primary": setup_data.get("admin_email", "")})
        })
        
        # Create default branch
        db.execute(text("""
            INSERT INTO master.org_branches (
                org_id, branch_code, branch_name, branch_type,
                address, is_billing_location, is_shipping_location,
                is_default_location, is_active, created_at, updated_at
            ) VALUES (
                :org_id, 'BR001', 'Main Branch', 'HEAD_OFFICE',
                :address, true, true, true, true,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """), {
            "org_id": org_id,
            "address": json.dumps(setup_data.get("address", {}))
        })
        
        # Create admin user with proper Supabase Auth integration
        if setup_data.get("admin_email") and setup_data.get("admin_password"):
            auth_user_id = None
            
            # Check if Supabase Auth is configured
            if os.getenv("SUPABASE_SERVICE_ROLE_KEY"):
                try:
                    # Create user in Supabase Auth
                    user_metadata = {
                        "org_id": str(org_id),
                        "org_name": setup_data["org_name"],
                        "role": "admin",
                        "full_name": setup_data.get("admin_name", "Administrator")
                    }
                    
                    auth_user_id = await supabase_auth.create_auth_user(
                        email=setup_data["admin_email"],
                        password=setup_data["admin_password"],
                        user_metadata=user_metadata
                    )
                    
                    if auth_user_id:
                        logger.info(f"Created Supabase auth user with ID: {auth_user_id}")
                    else:
                        logger.warning("Could not create Supabase auth user, creating local user only")
                except Exception as e:
                    logger.error(f"Error creating Supabase auth user: {e}")
                    # Continue without Supabase auth if it fails
            else:
                logger.info("Supabase service role key not configured, skipping auth.users creation")
            
            # Create user in org_users table (linked to Supabase auth if available)
            # Note: full_name is a generated column, so we don't insert it
            admin_name_parts = setup_data.get("admin_name", "Administrator").split()
            first_name = admin_name_parts[0] if admin_name_parts else "Admin"
            last_name = " ".join(admin_name_parts[1:]) if len(admin_name_parts) > 1 else ""
            
            db.execute(text("""
                INSERT INTO master.org_users (
                    org_id, auth_user_id, username, email, mobile_number, 
                    employee_code, first_name, last_name,
                    is_active, is_admin, created_at, updated_at
                ) VALUES (
                    :org_id, :auth_user_id, :username, :email, :mobile_number,
                    'EMP001', :first_name, :last_name,
                    true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
            """), {
                "org_id": org_id,
                "auth_user_id": auth_user_id,  # Links to Supabase auth.users
                "username": setup_data.get("admin_email", "").split('@')[0],  # Use email prefix as username
                "email": setup_data["admin_email"],
                "mobile_number": setup_data.get("phone", ""),
                "first_name": first_name,
                "last_name": last_name
            })
        
        # Create default system settings
        default_settings = [
            ('billing', 'allow_billing_without_customer', 'false', 'boolean'),
            ('billing', 'default_cash_customer_name', 'Cash Customer', 'string'),
            ('billing', 'allow_negative_stock', 'false', 'boolean'),
            ('billing', 'enforce_batch_selection', 'true', 'boolean'),
            ('billing', 'auto_round_off_invoice', 'true', 'boolean'),
            ('inventory', 'track_batch_wise', 'true', 'boolean'),
            ('inventory', 'track_expiry_dates', 'true', 'boolean'),
            ('inventory', 'low_stock_alert_percentage', '20', 'number'),
            ('compliance', 'enforce_drug_license_check', 'true', 'boolean'),
            ('compliance', 'enforce_gst_validation', 'true', 'boolean')
        ]
        
        for category, key, value, type_ in default_settings:
            db.execute(text("""
                INSERT INTO master.system_settings (
                    org_id, setting_category, setting_key, setting_value,
                    setting_type, is_active, created_at
                ) VALUES (
                    :org_id, :category, :key, :value, :type, true, CURRENT_TIMESTAMP
                )
            """), {
                "org_id": org_id,
                "category": category,
                "key": key,
                "value": value,
                "type": type_
            })
        
        db.commit()
        
        return {
            "success": True,
            "message": "Organization initialized successfully",
            "organization": {
                "org_id": org_id,
                "org_name": setup_data["org_name"],
                "admin_email": setup_data.get("admin_email")
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to initialize organization: {str(e)}")

@router.get("/required-fields")
async def get_required_fields():
    """Get list of required fields for initial setup"""
    return {
        "required": [
            "org_name",
            "admin_email", 
            "admin_password"
        ],
        "optional": [
            "legal_name",
            "business_type",
            "gst_number",
            "pan_number",
            "drug_license_number",
            "admin_name",
            "phone",
            "address"
        ],
        "address_fields": [
            "line1",
            "line2",
            "city",
            "state",
            "pincode",
            "country"
        ]
    }