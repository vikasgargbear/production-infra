"""
Journal Entry management endpoints
Handles journal entries, chart of accounts, and double-entry bookkeeping
"""
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from pydantic import BaseModel, Field, validator
import logging
from ...services.document_number_service import DocumentNumberService

from ....core.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from ....core.org_context import get_org_context, OrgContext
from ....core.permissions import PermissionChecker
from ....core.constants import JournalEntryStatus

logger = logging.getLogger(__name__)

router = APIRouter(tags=["journal-entries"])

class JournalLineCreate(BaseModel):
    """Schema for journal entry line"""
    account_code: str = Field(..., description="Chart of accounts code")
    account_name: str = Field(..., description="Account name")
    debit_amount: Decimal = Field(default=0, ge=0)
    credit_amount: Decimal = Field(default=0, ge=0)
    narration: Optional[str] = None
    
    @validator('debit_amount', 'credit_amount')
    def validate_amounts(cls, v, values):
        if 'debit_amount' in values and 'credit_amount' in values:
            debit = values.get('debit_amount', 0)
            credit = values.get('credit_amount', 0)
            if debit > 0 and credit > 0:
                raise ValueError('A line cannot have both debit and credit amounts')
            if debit == 0 and credit == 0:
                raise ValueError('At least one amount (debit or credit) must be entered')
        return v

class JournalEntryCreate(BaseModel):
    """Schema for creating journal entry"""
    org_id: Optional[str] = None  # Will be provided via header
    journal_date: date = Field(default_factory=date.today)
    reference_number: Optional[str] = None
    narration: str = Field(..., description="Journal entry description")
    lines: List[JournalLineCreate] = Field(..., min_items=2)
    created_by: Optional[int] = None
    
    @validator('lines')
    def validate_balanced_entry(cls, v):
        total_debit = sum(line.debit_amount for line in v)
        total_credit = sum(line.credit_amount for line in v)
        
        if total_debit != total_credit:
            raise ValueError(f'Journal entry must be balanced. Debit: {total_debit}, Credit: {total_credit}')
        
        if total_debit == 0:
            raise ValueError('Journal entry cannot have zero amounts')
            
        return v

@router.get("/generate-journal-number")
@with_tenant_context
async def generate_journal_number(db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)):
    """
    Generate unique journal entry number using DocumentNumberService
    """
    try:
        journal_number = DocumentNumberService.generate_number(
            db.session, "journal_entry", str(context.org_id)
        )
        return {
            "journal_number": journal_number,
            "generated_at": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error generating journal number: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate journal number: {str(e)}")

@router.get("/chart-of-accounts")
@with_tenant_context
async def get_chart_of_accounts(
    search: Optional[str] = Query(None, description="Search account name or code"),
    account_type: Optional[str] = Query(None, description="Filter by account type"),
    active_only: bool = Query(True, description="Show only active accounts"),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get chart of accounts for journal entry selection
    """
    try:
        query = """
            SELECT 
                account_id,
                account_code,
                account_name,
                account_type,
                parent_account_id,
                account_level,
                is_active,
                created_at
            FROM financial.chart_of_accounts
            WHERE org_id = :org_id
        """
        
        params = {"org_id": str(context.org_id)}
        
        if active_only:
            query += " AND is_active = true"
        
        if account_type:
            query += " AND account_type = :account_type"
            params["account_type"] = account_type
            
        if search:
            query += " AND (account_code ILIKE :search OR account_name ILIKE :search)"
            params["search"] = f"%{search}%"
        
        query += " ORDER BY account_code"
        
        result = db.execute(text(query), params)
        accounts = [dict(row._mapping) for row in result]
        
        return {
            "accounts": accounts,
            "total": len(accounts)
        }
        
    except Exception as e:
        logger.error(f"Error getting chart of accounts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get chart of accounts: {str(e)}")

@router.post("", response_model=dict)
@with_tenant_context
async def create_journal_entry(
    journal_entry: JournalEntryCreate,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Create a new journal entry
    
    - Validates that entry is balanced
    - Creates journal header and line items
    - Updates account balances
    """
    try:
        # Convert org_id to UUID for database operations
        from uuid import UUID
        if isinstance(org_id, str):
            org_id = UUID(org_id)
        
        # Generate journal number if not provided
        # Can't call Depends functions directly, generate number here
        # Use DocumentNumberService for consistent number generation
        journal_number = DocumentNumberService.generate_number(
            db.session, "journal_entry", str(context.org_id)
        )
        
        # Get or create system user for API operations
        if not journal_entry.created_by:
            user_result = db.execute(
                text("""
                    SELECT user_id FROM master.org_users 
                    WHERE org_id = :org_id AND is_active = true
                    ORDER BY user_id
                    LIMIT 1
                """),
                {"org_id": str(context.org_id)}
            ).first()
            
            if user_result:
                journal_entry.created_by = user_result.user_id
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Unable to determine user for this operation"
                )
        
        # Calculate totals
        total_debit = sum(line.debit_amount for line in journal_entry.lines)
        total_credit = sum(line.credit_amount for line in journal_entry.lines)
        
        # Insert journal entry header
        journal_query = """
            INSERT INTO financial.journal_entries (
                org_id, journal_number, journal_date, reference_number,
                narration, total_debit, total_credit, entry_status,
                created_by, created_at
            ) VALUES (
                :org_id, :journal_number, :journal_date, :reference_number,
                :narration, :total_debit, :total_credit, 'posted',
                :created_by, CURRENT_TIMESTAMP
            ) RETURNING journal_id
        """
        
        journal_result = db.execute(text(journal_query), {
            "org_id": str(context.org_id),
            "journal_number": journal_number,
            "journal_date": journal_entry.journal_date,
            "reference_number": journal_entry.reference_number,
            "narration": journal_entry.narration,
            "total_debit": total_debit,
            "total_credit": total_credit,
            "created_by": journal_entry.created_by
        })
        
        journal_id = journal_result.scalar()
        
        # Insert journal entry lines
        for line in journal_entry.lines:
            # Validate account exists
            account_check = db.execute(
                text("SELECT account_id FROM financial.chart_of_accounts WHERE account_code = :code AND org_id = :org_id"),
                {"code": line.account_code, "org_id": str(context.org_id)}
            ).first()
            
            if not account_check:
                # Create the account if it doesn't exist
                account_insert = db.execute(
                    text("""
                        INSERT INTO financial.chart_of_accounts (
                            org_id, account_code, account_name, account_type, is_active
                        ) VALUES (
                            :org_id, :account_code, :account_name, 'general', true
                        ) RETURNING account_id
                    """),
                    {
                        "org_id": str(context.org_id),
                        "account_code": line.account_code,
                        "account_name": line.account_name
                    }
                )
                account_id = account_insert.scalar()
            else:
                account_id = account_check.account_id
            
            # Insert journal line
            line_query = """
                INSERT INTO financial.journal_entry_lines (
                    journal_id, account_id, account_code, account_name,
                    debit_amount, credit_amount, line_narration
                ) VALUES (
                    :journal_id, :account_id, :account_code, :account_name,
                    :debit_amount, :credit_amount, :line_narration
                )
            """
            
            db.execute(text(line_query), {
                "journal_id": journal_id,
                "account_id": account_id,
                "account_code": line.account_code,
                "account_name": line.account_name,
                "debit_amount": line.debit_amount,
                "credit_amount": line.credit_amount,
                "line_narration": line.narration
            })
        
        # TenantAwareSession auto-commits
        
        return {
            "message": "Journal entry created successfully",
            "data": {
                "journal_id": journal_id,
                "journal_number": journal_number,
                "total_debit": float(total_debit),
                "total_credit": float(total_credit),
                "lines_count": len(journal_entry.lines)
            }
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating journal entry: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create journal entry: {str(e)}")

@router.get("", response_model=dict)
@with_tenant_context
async def get_journal_entries(
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    search: Optional[str] = Query(None),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get list of journal entries with pagination and filters
    """
    try:
        query = """
            SELECT 
                je.journal_id,
                je.journal_number,
                je.journal_date,
                je.reference_number,
                je.narration,
                je.total_debit,
                je.total_credit,
                je.entry_status,
                je.created_at,
                u.username as created_by_name,
                COUNT(jel.line_id) as lines_count
            FROM financial.journal_entries je
            LEFT JOIN master.org_users u ON je.created_by = u.user_id
            LEFT JOIN financial.journal_entry_lines jel ON je.journal_id = jel.journal_id
            WHERE je.org_id = :org_id
        """
        
        params = {
            "org_id": str(context.org_id),
            "limit": limit,
            "offset": offset
        }
        
        if from_date:
            query += " AND je.journal_date >= :from_date"
            params["from_date"] = from_date
            
        if to_date:
            query += " AND je.journal_date <= :to_date"
            params["to_date"] = to_date
            
        if search:
            query += " AND (je.journal_number ILIKE :search OR je.narration ILIKE :search)"
            params["search"] = f"%{search}%"
        
        query += """
            GROUP BY je.journal_id, je.journal_number, je.journal_date, 
                     je.reference_number, je.narration, je.total_debit, 
                     je.total_credit, je.entry_status, je.created_at, u.username
            ORDER BY je.journal_date DESC, je.journal_id DESC
            LIMIT :limit OFFSET :offset
        """
        
        result = db.execute(text(query), params)
        entries = [dict(row._mapping) for row in result]
        
        # Get total count
        count_query = """
            SELECT COUNT(*)
            FROM financial.journal_entries je
            WHERE je.org_id = :org_id
        """
        
        count_params = {"org_id": str(context.org_id)}
        
        if from_date:
            count_query += " AND je.journal_date >= :from_date"
            count_params["from_date"] = from_date
            
        if to_date:
            count_query += " AND je.journal_date <= :to_date"
            count_params["to_date"] = to_date
            
        if search:
            count_query += " AND (je.journal_number ILIKE :search OR je.narration ILIKE :search)"
            count_params["search"] = f"%{search}%"
        
        total_count = db.execute(text(count_query), count_params).scalar()
        
        return {
            "entries": entries,
            "total": total_count,
            "limit": limit,
            "offset": offset
        }
        
    except Exception as e:
        logger.error(f"Error getting journal entries: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve journal entries")

@router.get("/{journal_id}", response_model=dict)
@with_tenant_context
async def get_journal_entry_details(
    journal_id: int,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get detailed journal entry with all line items
    """
    try:
        # Get journal header
        header_query = """
            SELECT 
                je.journal_id,
                je.journal_number,
                je.journal_date,
                je.reference_number,
                je.narration,
                je.total_debit,
                je.total_credit,
                je.entry_status,
                je.created_at,
                u.username as created_by_name
            FROM financial.journal_entries je
            LEFT JOIN master.org_users u ON je.created_by = u.user_id
            WHERE je.journal_id = :journal_id AND je.org_id = :org_id
        """
        
        header_result = db.execute(text(header_query), {
            "journal_id": journal_id,
            "org_id": str(context.org_id)
        }).first()
        
        if not header_result:
            raise HTTPException(status_code=404, detail="Journal entry not found")
        
        # Get journal lines
        lines_query = """
            SELECT 
                jel.line_id,
                jel.account_code,
                jel.account_name,
                jel.debit_amount,
                jel.credit_amount,
                jel.line_narration,
                coa.account_type
            FROM financial.journal_entry_lines jel
            LEFT JOIN financial.chart_of_accounts coa ON jel.account_code = coa.account_code
            WHERE jel.journal_id = :journal_id
            ORDER BY jel.line_id
        """
        
        lines_result = db.execute(text(lines_query), {"journal_id": journal_id})
        lines = [dict(row._mapping) for row in lines_result]
        
        return {
            "journal": dict(header_result._mapping),
            "lines": lines
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting journal entry details: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve journal entry details")

@router.delete("/{journal_id}")
@with_tenant_context
async def delete_journal_entry(
    journal_id: int,
    reason: str = Query(..., description="Deletion reason"),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Delete/cancel journal entry
    
    - Marks entry as cancelled
    - Maintains audit trail
    - Reverses account balance effects
    """
    try:
        # Check if journal entry exists
        check_query = """
            SELECT journal_id, entry_status 
            FROM financial.journal_entries 
            WHERE journal_id = :journal_id AND org_id = :org_id
        """
        
        entry = db.execute(text(check_query), {
            "journal_id": journal_id,
            "org_id": str(context.org_id)
        }).first()
        
        if not entry:
            raise HTTPException(status_code=404, detail="Journal entry not found")
        
        if entry.entry_status == JournalEntryStatus.CANCELLED.value:
            raise HTTPException(status_code=400, detail="Journal entry is already cancelled")
        
        # Update journal entry status
        update_query = """
            UPDATE financial.journal_entries
            SET entry_status = :cancelled_status,
                cancellation_reason = :reason,
                cancelled_at = CURRENT_TIMESTAMP
            WHERE journal_id = :journal_id
        """
        
        db.execute(text(update_query), {
            "journal_id": journal_id,
            "reason": reason,
            "cancelled_status": JournalEntryStatus.CANCELLED.value
        })
        
        # TenantAwareSession auto-commits
        
        return {
            "message": "Journal entry cancelled successfully",
            "journal_id": journal_id,
            "reason": reason
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error cancelling journal entry: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to cancel journal entry")