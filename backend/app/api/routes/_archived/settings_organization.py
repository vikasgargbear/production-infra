"""
Organization Settings API
Handles organization profile and general info

MODERNIZED: Uses TenantAwareSession + PermissionChecker
"""
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
import logging

from ....core.tenant_service import TenantAwareSession, get_tenant_aware_db, with_tenant_context
from ....core.org_context import OrgContext, get_org_context
from ....core.permissions import PermissionChecker

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("")
@with_tenant_context
async def get_organization_settings(
    _: dict = Depends(PermissionChecker("settings", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get organization profile and general settings"""
    try:
        org_id = context.org_id
        
        query = """
            SELECT 
                org_name, org_code, 
                address, city, state, pincode, country,
                phone, email, website,
                gst_number, pan_number, drug_license_number,
                logo_url, currency_code, fiscal_year_start
            FROM master.organizations
            WHERE org_id = :org_id
        """
        
        result = db.execute(text(query), {"org_id": org_id}).fetchone()
        
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
        logger.error(f"Error fetching organization settings: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch settings: {str(e)}")


@router.put("")
@with_tenant_context
async def update_organization_settings(
    settings: Dict[str, Any],
    _: dict = Depends(PermissionChecker("settings", "edit")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Update organization profile settings"""
    try:
        org_id = context.org_id
        
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
        
        return {"success": True, "message": "Organization settings updated successfully"}
        
    except Exception as e:
        logger.error(f"Error updating organization settings: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update settings: {str(e)}")
