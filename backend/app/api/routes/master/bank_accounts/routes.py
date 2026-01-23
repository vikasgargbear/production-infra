"""
Bank Accounts API Router
Handles multiple bank accounts for organizations
REFACTORED: All SQL moved to BankAccountService
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Body
import logging
import json

from .....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from .....core.auth.org_context import get_org_context, OrgContext
from .....core.security.permissions import PermissionChecker

# Service layer
from ....services.master.bank_account_service import BankAccountService

logger = logging.getLogger(__name__)

def validate_ifsc(ifsc_code: str) -> bool:
    """Validate IFSC code format"""
    import re
    pattern = r'^[A-Z]{4}0[A-Z0-9]{6}$'
    return bool(re.match(pattern, ifsc_code))

router = APIRouter(tags=["Bank Accounts"])

@router.get("")
@router.get("/")
@with_tenant_context
async def get_bank_accounts(
    _: dict = Depends(PermissionChecker("master", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get all bank accounts for an organization"""
    try:
        accounts = BankAccountService.list_bank_accounts(db, str(context.org_id))
        
        # Transform for API response
        result = []
        for account in accounts:
            result.append({
                "id": account.get("bank_account_id"),
                "org_id": account.get("org_id"),
                "account_name": account.get("account_name"),
                "account_number": account.get("account_number"),
                "account_type": account.get("account_type"),
                "bank_name": account.get("bank_name"),
                "branch_name": account.get("branch_name"),
                "ifsc_code": account.get("ifsc_code"),
                "swift_code": account.get("swift_code"),
                "bank_address": account.get("bank_address"),
                "is_default_account": account.get("is_default_account"),
                "is_payment_account": account.get("is_payment_account"),
                "is_active": account.get("is_active"),
                "created_at": account.get("created_at").isoformat() if account.get("created_at") else None,
                "updated_at": account.get("updated_at").isoformat() if account.get("updated_at") else None
            })
        
        return result
    except Exception as e:
        logger.error(f"Error fetching bank accounts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch bank accounts: {str(e)}")

@router.post("/")
@with_tenant_context
async def create_bank_account(
    account_data: dict = Body(...),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Create a new bank account"""
    try:
        org_id = str(context.org_id)
        
        # Validate IFSC code format
        ifsc_code = account_data.get("ifsc_code", "").upper()
        if ifsc_code and not validate_ifsc(ifsc_code):
            raise HTTPException(status_code=400, detail="Invalid IFSC code format")
        
        # If this is marked as default, unset other defaults
        if account_data.get("is_default_account"):
            BankAccountService.unset_default_accounts(db, org_id)
        
        # Prepare data
        data = {
            "account_name": account_data.get("account_name", ""),
            "account_number": account_data.get("account_number", ""),
            "account_type": account_data.get("account_type", "CURRENT"),
            "bank_name": account_data.get("bank_name", ""),
            "branch_name": account_data.get("branch_name", ""),
            "ifsc_code": ifsc_code,
            "swift_code": account_data.get("swift_code", ""),
            "bank_address": json.dumps(account_data.get("bank_address", {})) if account_data.get("bank_address") else None,
            "is_default_account": account_data.get("is_default_account", False),
            "is_payment_account": account_data.get("is_payment_account", True)
        }
        
        new_id = BankAccountService.insert_bank_account(db, org_id, data)
        return {"id": new_id, "message": "Bank account created successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating bank account: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create bank account: {str(e)}")

@router.put("/{account_id}")
@with_tenant_context
async def update_bank_account(
    account_id: int,
    account_data: dict = Body(...),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Update a bank account"""
    try:
        org_id = str(context.org_id)
        
        # Validate IFSC code format if provided
        if "ifsc_code" in account_data:
            ifsc_code = account_data["ifsc_code"].upper()
            if ifsc_code and not validate_ifsc(ifsc_code):
                raise HTTPException(status_code=400, detail="Invalid IFSC code format")
            account_data["ifsc_code"] = ifsc_code
        
        # If setting as default, unset other defaults
        if account_data.get("is_default_account"):
            BankAccountService.unset_default_accounts(db, org_id, exclude_id=account_id)
        
        # Build update fields
        update_fields = []
        params = {}
        
        allowed_fields = [
            "account_name", "account_number", "account_type",
            "bank_name", "branch_name", "ifsc_code", "swift_code",
            "is_default_account", "is_payment_account"
        ]
        
        for field in allowed_fields:
            if field in account_data:
                update_fields.append(f"{field} = :{field}")
                params[field] = account_data[field]
        
        if "bank_address" in account_data:
            update_fields.append("bank_address = CAST(:bank_address AS jsonb)")
            params["bank_address"] = json.dumps(account_data["bank_address"])
        
        if update_fields:
            BankAccountService.update_bank_account_dynamic(db, org_id, account_id, update_fields, params)
        
        return {"message": "Bank account updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating bank account: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update bank account: {str(e)}")

@router.delete("/{account_id}")
@with_tenant_context
async def delete_bank_account(
    account_id: int,
    _: dict = Depends(PermissionChecker("master", "delete")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Delete (soft delete) a bank account"""
    try:
        org_id = str(context.org_id)
        
        # Check if it's the default account
        check = BankAccountService.get_account_delete_check(db, org_id, account_id)
        
        if not check:
            raise HTTPException(status_code=404, detail="Bank account not found")
        
        if check["is_default_account"] and check["total_count"] > 1:
            raise HTTPException(
                status_code=400, 
                detail="Cannot delete default account. Please set another account as default first."
            )
        
        BankAccountService.soft_delete_bank_account(db, org_id, account_id)
        return {"message": "Bank account deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting bank account: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete bank account: {str(e)}")

@router.put("/{account_id}/set-default")
@with_tenant_context
async def set_default_account(
    account_id: int,
    _: dict = Depends(PermissionChecker("master", "edit")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Set a bank account as default"""
    try:
        BankAccountService.set_default_account(db, str(context.org_id), account_id)
        return {"message": "Default account updated successfully"}
    except Exception as e:
        logger.error(f"Error setting default account: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to set default account: {str(e)}")