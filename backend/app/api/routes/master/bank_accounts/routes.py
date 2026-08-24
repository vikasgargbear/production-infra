"""Canonical bank-account reads and fail-closed mutation boundaries."""

from fastapi import APIRouter, Depends, HTTPException
import logging

from .....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from .....core.auth.org_context import get_org_context, OrgContext
from .....core.security.permissions import PermissionChecker
from .....core.money import money_json

# Service layer
from ....services.master.bank_account_service import BankAccountService

logger = logging.getLogger(__name__)

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
                "code": account.get("code"),
                "name": account.get("name"),
                "balance": money_json(account.get("balance") or 0),
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
                "currency_code": account.get("currency_code"),
                "created_at": account.get("created_at").isoformat() if account.get("created_at") else None,
                "updated_at": account.get("updated_at").isoformat() if account.get("updated_at") else None
            })
        
        return result
    except Exception as e:
        logger.error(f"Error fetching bank accounts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch bank accounts: {str(e)}")

def _bank_write_unavailable() -> None:
    raise HTTPException(
        status_code=503,
        detail=(
            "Canonical bank-account mutations are unavailable until the "
            "reviewed finance command is connected"
        ),
    )


@router.post("/")
@with_tenant_context
async def create_bank_account(
    _: dict = Depends(PermissionChecker("master", "create")),
    context: OrgContext = Depends(get_org_context),
):
    """Reject creation without parsing or persisting a legacy payload."""
    del context
    _bank_write_unavailable()

@router.put("/{account_id}")
@with_tenant_context
async def update_bank_account(
    account_id: str,
    _: dict = Depends(PermissionChecker("master", "edit")),
    context: OrgContext = Depends(get_org_context),
):
    """Reject edits without resolving or mutating a legacy row."""
    del account_id, context
    _bank_write_unavailable()

@router.delete("/{account_id}")
@with_tenant_context
async def delete_bank_account(
    account_id: str,
    _: dict = Depends(PermissionChecker("master", "delete")),
    context: OrgContext = Depends(get_org_context),
):
    """Reject deletion until the canonical command exists."""
    del account_id, context
    _bank_write_unavailable()

@router.put("/{account_id}/set-default")
@with_tenant_context
async def set_default_account(
    account_id: str,
    _: dict = Depends(PermissionChecker("master", "edit")),
    context: OrgContext = Depends(get_org_context),
):
    """Reject default-account changes until the canonical command exists."""
    del account_id, context
    _bank_write_unavailable()
