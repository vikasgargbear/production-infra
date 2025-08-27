"""
Bank Accounts API Router
Handles multiple bank accounts for organizations
Version: 1.0.0
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
import json

from ...core.database import get_db
from ...core.auth_utils import get_org_id_from_header

logger = logging.getLogger(__name__)

def validate_ifsc(ifsc_code: str) -> bool:
    """Validate IFSC code format"""
    import re
    pattern = r'^[A-Z]{4}0[A-Z0-9]{6}$'
    return bool(re.match(pattern, ifsc_code))

router = APIRouter(tags=["Bank Accounts"])

@router.get("/test")
def test_endpoint():
    """Test if router is working"""
    return {"message": "Bank accounts router is working", "status": "ok"}

@router.get("/")
def get_bank_accounts(
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """Get all bank accounts for an organization"""
    try:
        query = """
            SELECT 
                bank_account_id,
                org_id,
                account_name,
                account_number,
                account_type,
                bank_name,
                branch_name,
                ifsc_code,
                swift_code,
                bank_address,
                is_default_account,
                is_payment_account,
                is_active,
                created_at,
                updated_at
            FROM master.org_bank_accounts
            WHERE org_id = :org_id AND is_active = true
            ORDER BY is_default_account DESC, created_at DESC
        """
        
        result = db.execute(text(query), {"org_id": org_id})
        accounts = []
        
        for row in result:
            account = {
                "id": row.bank_account_id,
                "org_id": row.org_id,
                "account_name": row.account_name,
                "account_number": row.account_number,
                "account_type": row.account_type,
                "bank_name": row.bank_name,
                "branch_name": row.branch_name,
                "ifsc_code": row.ifsc_code,
                "swift_code": row.swift_code,
                "bank_address": json.loads(row.bank_address) if row.bank_address else None,
                "is_default_account": row.is_default_account,
                "is_payment_account": row.is_payment_account,
                "is_active": row.is_active,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None
            }
            accounts.append(account)
        
        return accounts
        
    except Exception as e:
        logger.error(f"Error fetching bank accounts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch bank accounts: {str(e)}")

@router.post("/")
def create_bank_account(
    account_data: dict = Body(...),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """Create a new bank account"""
    try:
        # Validate IFSC code format
        ifsc_code = account_data.get("ifsc_code", "").upper()
        if ifsc_code and not validate_ifsc(ifsc_code):
            raise HTTPException(status_code=400, detail="Invalid IFSC code format")
        
        # If this is marked as default, unset other defaults
        if account_data.get("is_default_account"):
            db.execute(text("""
                UPDATE master.org_bank_accounts
                SET is_default_account = false
                WHERE org_id = :org_id
            """), {"org_id": org_id})
        
        # Insert new account
        insert_query = """
            INSERT INTO master.org_bank_accounts (
                org_id, account_name, account_number, account_type,
                bank_name, branch_name, ifsc_code, swift_code,
                bank_address, is_default_account, is_payment_account, is_active
            ) VALUES (
                :org_id, :account_name, :account_number, :account_type,
                :bank_name, :branch_name, :ifsc_code, :swift_code,
                CAST(:bank_address AS jsonb), :is_default_account, :is_payment_account, true
            )
            RETURNING bank_account_id
        """
        
        result = db.execute(text(insert_query), {
            "org_id": org_id,
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
        })
        
        db.commit()
        
        new_id = result.first().bank_account_id
        return {"id": new_id, "message": "Bank account created successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating bank account: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create bank account: {str(e)}")

@router.put("/{account_id}")
def update_bank_account(
    account_id: int,
    account_data: dict = Body(...),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """Update a bank account"""
    try:
        # Validate IFSC code format if provided
        if "ifsc_code" in account_data:
            ifsc_code = account_data["ifsc_code"].upper()
            if ifsc_code and not validate_ifsc(ifsc_code):
                raise HTTPException(status_code=400, detail="Invalid IFSC code format")
            account_data["ifsc_code"] = ifsc_code
        
        # If setting as default, unset other defaults
        if account_data.get("is_default_account"):
            db.execute(text("""
                UPDATE master.org_bank_accounts
                SET is_default_account = false
                WHERE org_id = :org_id AND bank_account_id != :account_id
            """), {"org_id": org_id, "account_id": account_id})
        
        # Build update query dynamically
        update_fields = []
        params = {"org_id": org_id, "account_id": account_id}
        
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
            update_fields.append("updated_at = CURRENT_TIMESTAMP")
            
            update_query = f"""
                UPDATE master.org_bank_accounts
                SET {', '.join(update_fields)}
                WHERE org_id = :org_id AND bank_account_id = :account_id
            """
            
            db.execute(text(update_query), params)
            db.commit()
        
        return {"message": "Bank account updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating bank account: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update bank account: {str(e)}")

@router.delete("/{account_id}")
def delete_bank_account(
    account_id: int,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """Delete (soft delete) a bank account"""
    try:
        # Check if it's the default account
        check_query = """
            SELECT is_default_account, 
                   (SELECT COUNT(*) FROM master.org_bank_accounts 
                    WHERE org_id = :org_id AND is_active = true) as total_count
            FROM master.org_bank_accounts
            WHERE org_id = :org_id AND bank_account_id = :account_id
        """
        
        result = db.execute(text(check_query), {"org_id": org_id, "account_id": account_id}).first()
        
        if not result:
            raise HTTPException(status_code=404, detail="Bank account not found")
        
        if result.is_default_account and result.total_count > 1:
            raise HTTPException(
                status_code=400, 
                detail="Cannot delete default account. Please set another account as default first."
            )
        
        # Soft delete the account
        delete_query = """
            UPDATE master.org_bank_accounts
            SET is_active = false, updated_at = CURRENT_TIMESTAMP
            WHERE org_id = :org_id AND bank_account_id = :account_id
        """
        
        db.execute(text(delete_query), {"org_id": org_id, "account_id": account_id})
        db.commit()
        
        return {"message": "Bank account deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting bank account: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete bank account: {str(e)}")

@router.put("/{account_id}/set-default")
def set_default_account(
    account_id: int,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):
    """Set a bank account as default"""
    try:
        # Unset all other defaults
        db.execute(text("""
            UPDATE master.org_bank_accounts
            SET is_default_account = false
            WHERE org_id = :org_id
        """), {"org_id": org_id})
        
        # Set this account as default
        db.execute(text("""
            UPDATE master.org_bank_accounts
            SET is_default_account = true, updated_at = CURRENT_TIMESTAMP
            WHERE org_id = :org_id AND bank_account_id = :account_id
        """), {"org_id": org_id, "account_id": account_id})
        
        db.commit()
        
        return {"message": "Default account updated successfully"}
        
    except Exception as e:
        logger.error(f"Error setting default account: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to set default account: {str(e)}")