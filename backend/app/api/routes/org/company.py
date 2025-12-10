"""
Company API Router
Handles company profile and settings
"""
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy import text
import logging
from datetime import datetime
import json

from ....core.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from ....core.org_context import get_org_context, OrgContext
from ....core.permissions import PermissionChecker
# get_org_id_string replaced with OrgContext  # SECURE: JWT-based auth

logger = logging.getLogger(__name__)

router = APIRouter(tags=["company"])

@router.get("/info")
@with_tenant_context
async def get_company_info(
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
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
        
        result = db.execute(text(org_query), {"org_id": str(context.org_id)})
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
            
            # Parse business_settings
            business_settings = {}
            if org_data.business_settings:
                try:
                    business_settings = json.loads(org_data.business_settings) if isinstance(org_data.business_settings, str) else org_data.business_settings
                except:
                    business_settings = {}
            
            # Get default bank account if exists
            bank_query = """
                SELECT account_name, account_number, bank_name, branch_name, ifsc_code, account_type
                FROM master.org_bank_accounts
                WHERE org_id = :org_id AND is_default_account = true AND is_active = true
                LIMIT 1
            """
            bank_result = db.execute(text(bank_query), {"org_id": str(context.org_id)})
            bank_data = bank_result.first()
            
            # Return formatted data matching frontend expectations
            response = {
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
                "logo": None,
                # Additional fields from business_settings
                "tagline": business_settings.get("tagline", ""),
                "financial_year_start": business_settings.get("financial_year_start", "2024-04-01"),
                "financial_year_end": business_settings.get("financial_year_end", "2025-03-31"),
                "currency": business_settings.get("currency", "INR"),
                "currency_symbol": business_settings.get("currency_symbol", "₹"),
                "invoice_prefix": business_settings.get("invoice_prefix", "INV/"),
                "challan_prefix": business_settings.get("challan_prefix", "DC/"),
                "po_prefix": business_settings.get("po_prefix", "PO/"),
                "return_prefix": business_settings.get("return_prefix", "RTN/"),
                "credit_note_prefix": business_settings.get("credit_note_prefix", "CN/"),
                "debit_note_prefix": business_settings.get("debit_note_prefix", "DN/"),
                "default_terms": business_settings.get("default_terms", ""),
                "default_footer": business_settings.get("default_footer", ""),
                "print_format": business_settings.get("print_format", "A4"),
                "show_signature": business_settings.get("show_signature", True),
                "show_logo": business_settings.get("show_logo", True),
                "show_bank_details": business_settings.get("show_bank_details", True)
            }
            
            # Add bank details if found
            if bank_data:
                response.update({
                    "bank_name": bank_data.bank_name or "",
                    "account_number": bank_data.account_number or "",
                    "account_name": bank_data.account_name or "",
                    "ifsc_code": bank_data.ifsc_code or "",
                    "branch_name": bank_data.branch_name or "",
                    "account_type": bank_data.account_type or ""
                })
            else:
                response.update({
                    "bank_name": "",
                    "account_number": "",
                    "account_name": "",
                    "ifsc_code": "",
                    "branch_name": "",
                    "account_type": ""
                })
            
            return response
        
        
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
@with_tenant_context
async def update_company_info(
    company_data: Dict[str, Any] = Body(...),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Update company information"""
    try:
        logger.info(f"Updating company info for org_id: {org_id}")
        logger.info(f"Received data: {company_data}")
        
        # First, check if organization exists
        check_query = """
            SELECT org_id FROM master.organizations 
            WHERE org_id = :org_id
        """
        
        exists = db.execute(text(check_query), {"org_id": str(context.org_id)}).first()
        
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
                    registered_address = CAST(:registered_address AS jsonb),
                    contact_numbers = CAST(:contact_numbers AS jsonb),
                    email_addresses = CAST(:email_addresses AS jsonb),
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
            "org_id": str(context.org_id),
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
        
        # TenantAwareSession auto-commits
        
        # Handle bank account data separately
        if any([company_data.get("bank_name"), company_data.get("account_number"), company_data.get("ifsc_code")]):
            # Check if bank account exists
            existing_bank = db.execute(text("""
                SELECT bank_account_id FROM master.org_bank_accounts
                WHERE org_id = :org_id AND is_default_account = true
                LIMIT 1
            """), {"org_id": str(context.org_id)}).first()
            
            if existing_bank:
                # Update existing bank account
                db.execute(text("""
                    UPDATE master.org_bank_accounts
                    SET account_name = :account_name,
                        account_number = :account_number,
                        bank_name = :bank_name,
                        branch_name = :branch_name,
                        ifsc_code = :ifsc_code,
                        account_type = :account_type,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE bank_account_id = :bank_account_id
                """), {
                    "bank_account_id": existing_bank.bank_account_id,
                    "account_name": company_data.get("account_name", company_data.get("name", "")),
                    "account_number": company_data.get("account_number", ""),
                    "bank_name": company_data.get("bank_name", ""),
                    "branch_name": company_data.get("branch_name", ""),
                    "ifsc_code": company_data.get("ifsc_code", "").upper() if company_data.get("ifsc_code") else "",
                    "account_type": company_data.get("account_type", "CURRENT")
                })
            elif company_data.get("account_number") and company_data.get("ifsc_code"):
                # Create new bank account only if required fields are present
                db.execute(text("""
                    INSERT INTO master.org_bank_accounts (
                        org_id, account_name, account_number, account_type,
                        bank_name, branch_name, ifsc_code,
                        is_default_account, is_active
                    ) VALUES (
                        :org_id, :account_name, :account_number, :account_type,
                        :bank_name, :branch_name, :ifsc_code,
                        true, true
                    )
                """), {
                    "org_id": str(context.org_id),
                    "account_name": company_data.get("account_name", company_data.get("name", "")),
                    "account_number": company_data.get("account_number"),
                    "account_type": company_data.get("account_type", "CURRENT"),
                    "bank_name": company_data.get("bank_name", ""),
                    "branch_name": company_data.get("branch_name", ""),
                    "ifsc_code": company_data.get("ifsc_code", "").upper()
                })
        
        # Update business_settings JSONB column (excluding bank data)
        business_settings = {
            "tagline": company_data.get("tagline", ""),
            "financial_year_start": company_data.get("financial_year_start", "2024-04-01"),
            "financial_year_end": company_data.get("financial_year_end", "2025-03-31"),
            "currency": company_data.get("currency", "INR"),
            "currency_symbol": company_data.get("currency_symbol", "₹"),
            "invoice_prefix": company_data.get("invoice_prefix", "INV/"),
            "challan_prefix": company_data.get("challan_prefix", "DC/"),
            "po_prefix": company_data.get("po_prefix", "PO/"),
            "return_prefix": company_data.get("return_prefix", "RTN/"),
            "credit_note_prefix": company_data.get("credit_note_prefix", "CN/"),
            "debit_note_prefix": company_data.get("debit_note_prefix", "DN/"),
            "default_terms": company_data.get("default_terms", ""),
            "default_footer": company_data.get("default_footer", ""),
            "print_format": company_data.get("print_format", "A4"),
            "show_signature": company_data.get("show_signature", True),
            "show_logo": company_data.get("show_logo", True),
            "show_bank_details": company_data.get("show_bank_details", True)
        }
        
        # Update business_settings column
        db.execute(text("""
            UPDATE master.organizations
            SET business_settings = CAST(:business_settings AS jsonb)
            WHERE org_id = :org_id
        """), {
            "org_id": str(context.org_id),
            "business_settings": json.dumps(business_settings)
        })
        
        # TenantAwareSession auto-commits
        
        # Return the data in same format as GET
        return company_data
        
    except Exception as e:
        logger.error(f"Error updating company info: {str(e)}")
        logger.error(f"Query parameters: org_id={org_id}, data={company_data}")
        db.rollback()
        
        # Check if it's a specific database error
        error_message = str(e)
        if "jsonb" in error_message.lower():
            error_message = "Error updating company data. Invalid JSON format."
        elif "syntax" in error_message.lower():
            error_message = "Database query syntax error. Please contact support."
        
        raise HTTPException(status_code=500, detail=f"Failed to update company info: {error_message}")

@router.get("/org-id")
@with_tenant_context
async def get_organization_id(
    org_id: str = Depends(get_org_id_string)
):
    """Get current organization ID"""
    return {"org_id": str(context.org_id)}

@router.get("/profile")
@with_tenant_context
async def get_company_profile(
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get complete company profile including all bank accounts - OPTIMIZED single query"""
    try:
        # Single optimized query with all data
        profile_query = """
            WITH org_data AS (
                SELECT 
                    o.org_id, o.org_name, o.legal_name, o.gst_number, o.pan_number,
                    o.drug_license_number, o.fssai_number, o.registered_address,
                    o.correspondence_address, o.contact_numbers, o.email_addresses,
                    o.website, o.business_settings, o.created_at, o.updated_at
                FROM master.organizations o
                WHERE o.org_id = :org_id
            ),
            bank_data AS (
                SELECT 
                    jsonb_agg(
                        jsonb_build_object(
                            'id', bank_account_id,
                            'account_name', account_name,
                            'account_number', account_number,
                            'bank_name', bank_name,
                            'branch_name', branch_name,
                            'ifsc_code', ifsc_code,
                            'account_type', account_type,
                            'is_default', is_default_account
                        ) ORDER BY is_default_account DESC, created_at ASC
                    ) as accounts
                FROM master.org_bank_accounts
                WHERE org_id = :org_id AND is_active = true
            ),
            qr_data AS (
                SELECT setting_value as qr_code
                FROM system_config.system_settings
                WHERE org_id = :org_id AND setting_key = 'payment_qr_code'
                LIMIT 1
            )
            SELECT 
                o.*, 
                COALESCE(b.accounts, '[]'::jsonb) as bank_accounts,
                q.qr_code as payment_qr_code
            FROM org_data o
            LEFT JOIN bank_data b ON true
            LEFT JOIN qr_data q ON true
        """
        
        result = db.execute(text(profile_query), {"org_id": str(context.org_id)})
        row = result.first()
        
        if not row:
            raise HTTPException(status_code=404, detail="Organization not found")
        
        # Parse JSON fields
        registered_addr = row.registered_address or {}
        if isinstance(registered_addr, str):
            registered_addr = json.loads(registered_addr)
            
        contact_nums = row.contact_numbers or {}
        if isinstance(contact_nums, str):
            contact_nums = json.loads(contact_nums)
            
        email_addrs = row.email_addresses or {}
        if isinstance(email_addrs, str):
            email_addrs = json.loads(email_addrs)
            
        business_settings = row.business_settings or {}
        if isinstance(business_settings, str):
            business_settings = json.loads(business_settings)
        
        # Parse bank accounts if string
        bank_accounts = row.bank_accounts
        if isinstance(bank_accounts, str):
            bank_accounts = json.loads(bank_accounts)
        
        # Build response
        return {
            "success": True,
            "data": {
                "name": row.org_name or "Your Company",
                "address": registered_addr.get("line1", ""),
                "city": registered_addr.get("city", ""),
                "state": registered_addr.get("state", ""),
                "pincode": registered_addr.get("pincode", ""),
                "gst": row.gst_number or "",
                "pan": row.pan_number or "",
                "drug_license": row.drug_license_number or "",
                "fssai": row.fssai_number or "",
                "phone": contact_nums.get("primary", ""),
                "email": email_addrs.get("primary", ""),
                "website": row.website or "",
                **business_settings,
                "bank_accounts": bank_accounts if bank_accounts else [],
                "payment_qr_code": row.payment_qr_code
            }
        }
        
    except Exception as e:
        logger.error(f"Error fetching company profile: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch company profile: {str(e)}")

@router.get("/bank-accounts")
@with_tenant_context
async def get_bank_accounts(
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get all bank accounts for the organization"""
    try:
        query = """
            SELECT 
                bank_account_id as id,
                account_name,
                account_number,
                bank_name,
                branch_name,
                ifsc_code,
                account_type,
                is_default_account,
                is_active
            FROM master.org_bank_accounts
            WHERE org_id = :org_id AND is_active = true
            ORDER BY is_default_account DESC, created_at ASC
        """
        
        result = db.execute(text(query), {"org_id": str(context.org_id)})
        bank_accounts = []
        
        for row in result:
            bank_accounts.append({
                "id": row.id,
                "account_name": row.account_name or "",
                "account_number": row.account_number or "",
                "bank_name": row.bank_name or "",
                "branch_name": row.branch_name or "",
                "ifsc_code": row.ifsc_code or "",
                "account_type": row.account_type or "CURRENT",
                "is_default": row.is_default_account or False
            })
        
        return {
            "success": True,
            "data": bank_accounts
        }
        
    except Exception as e:
        logger.error(f"Error fetching bank accounts: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "data": []
        }

@router.post("/qr-code")
@with_tenant_context
async def upload_qr_code(
    qr_data: Dict[str, str] = Body(...),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Upload payment QR code"""
    try:
        qr_code_base64 = qr_data.get("qr_code", "")
        
        if not qr_code_base64:
            raise HTTPException(status_code=400, detail="QR code data is required")
        
        # Store QR code in system settings
        query = """
            INSERT INTO system_config.system_settings (org_id, setting_key, setting_value)
            VALUES (:org_id, 'payment_qr_code', :qr_code)
            ON CONFLICT (org_id, setting_key)
            DO UPDATE SET setting_value = :qr_code, updated_at = CURRENT_TIMESTAMP
        """
        
        db.execute(text(query), {
            "org_id": str(context.org_id),
            "qr_code": qr_code_base64
        })
        
        # TenantAwareSession auto-commits
        
        return {
            "success": True,
            "message": "QR code uploaded successfully"
        }
        
    except Exception as e:
        logger.error(f"Error uploading QR code: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to upload QR code: {str(e)}")

@router.get("/settings")
@with_tenant_context
async def get_company_settings(
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get company settings"""
    try:
        query = """
            SELECT 
                setting_key, 
                setting_value
            FROM system_config.system_settings
            WHERE org_id = :org_id
        """
        
        result = db.execute(text(query), {"org_id": str(context.org_id)})
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
@with_tenant_context
async def update_company_settings(
    settings: Dict[str, Any] = Body(...),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Update company settings"""
    try:
        # Update each setting
        for key, value in settings.items():
            # Convert value to JSON string if it's not already
            if not isinstance(value, str):
                value = json.dumps(value)
            
            query = """
                INSERT INTO system_config.system_settings (org_id, setting_key, setting_value)
                VALUES (:org_id, :key, :value)
                ON CONFLICT (org_id, setting_key)
                DO UPDATE SET setting_value = :value, updated_at = CURRENT_TIMESTAMP
            """
            
            db.execute(text(query), {
                "org_id": str(context.org_id),
                "key": key,
                "value": value
            })
        
        # TenantAwareSession auto-commits
        
        # Return updated settings
        return get_company_settings(db, org_id)
        
    except Exception as e:
        logger.error(f"Error updating company settings: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update company settings: {str(e)}")