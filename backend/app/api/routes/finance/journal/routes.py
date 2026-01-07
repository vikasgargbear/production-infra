"""
Journal Entry management endpoints
REFACTORED: Uses JournalService for database operations
"""
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, validator
import logging
from ....services.document_number_service import DocumentNumberService
from ....services.finance.journal.service import JournalService

from .....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from .....core.auth.org_context import get_org_context, OrgContext
from .....core.security.permissions import PermissionChecker

logger = logging.getLogger(__name__)

router = APIRouter(tags=["journal-entries"])

class JournalLineCreate(BaseModel):
    account_code: str
    account_name: str
    debit_amount: Decimal = Field(default=0, ge=0)
    credit_amount: Decimal = Field(default=0, ge=0)
    narration: Optional[str] = None

class JournalEntryCreate(BaseModel):
    journal_date: date = Field(default_factory=date.today)
    reference_number: Optional[str] = None
    narration: str
    lines: List[JournalLineCreate] = Field(..., min_items=2)
    created_by: Optional[int] = None
    
    @validator('lines')
    def validate_balanced_entry(cls, v):
        total_debit = sum(line.debit_amount for line in v)
        total_credit = sum(line.credit_amount for line in v)
        if total_debit != total_credit:
            raise ValueError(f'Entry must be balanced. Debit: {total_debit}, Credit: {total_credit}')
        if total_debit == 0:
            raise ValueError('Entry cannot have zero amounts')
        return v

@router.get("/generate-journal-number")
@with_tenant_context
async def generate_journal_number(
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Generate unique journal entry number"""
    try:
        journal_number = DocumentNumberService.generate_number(db.session, "journal_entry", str(context.org_id))
        return {"journal_number": journal_number, "generated_at": datetime.now().isoformat()}
    except Exception as e:
        logger.error(f"Error generating journal number: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate journal number: {str(e)}")

@router.get("/chart-of-accounts")
@with_tenant_context
async def get_chart_of_accounts(
    search: Optional[str] = Query(None),
    account_type: Optional[str] = Query(None),
    active_only: bool = Query(True),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Get chart of accounts"""
    try:
        accounts = JournalService.get_chart_of_accounts(db, str(context.org_id), search, account_type, active_only)
        return {"accounts": accounts, "total": len(accounts)}
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
    """Create a new journal entry"""
    try:
        org_id = str(context.org_id)
        journal_number = DocumentNumberService.generate_number(db.session, "journal_entry", org_id)
        
        if not journal_entry.created_by:
            journal_entry.created_by = JournalService.get_active_user(db, org_id)
            if not journal_entry.created_by:
                raise HTTPException(status_code=400, detail="Unable to determine user")
        
        total_debit = sum(line.debit_amount for line in journal_entry.lines)
        total_credit = sum(line.credit_amount for line in journal_entry.lines)
        
        journal_id = JournalService.insert_journal_entry(db, org_id, {
            "journal_number": journal_number, "journal_date": journal_entry.journal_date,
            "reference_number": journal_entry.reference_number, "narration": journal_entry.narration,
            "created_by": journal_entry.created_by
        })
        
        for line in journal_entry.lines:
            account_id = JournalService.get_or_create_account(db, org_id, line.account_code, line.account_name)
            JournalService.insert_journal_line(db, {
                "journal_id": journal_id, "account_id": account_id,
                "account_code": line.account_code, "account_name": line.account_name,
                "debit_amount": line.debit_amount, "credit_amount": line.credit_amount,
                "line_narration": line.narration
            })
        
        return {
            "message": "Journal entry created successfully",
            "data": {"journal_id": journal_id, "journal_number": journal_number,
                     "total_debit": float(total_debit), "total_credit": float(total_credit),
                     "lines_count": len(journal_entry.lines)}
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
    """Get list of journal entries"""
    try:
        org_id = str(context.org_id)
        entries = JournalService.list_journal_entries(db, org_id, from_date, to_date, search, limit, offset)
        total_count = JournalService.count_journal_entries(db, org_id, from_date, to_date, search)
        return {"entries": entries, "total": total_count, "limit": limit, "offset": offset}
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
    """Get detailed journal entry"""
    try:
        header = JournalService.get_journal_entry(db, str(context.org_id), journal_id)
        if not header:
            raise HTTPException(status_code=404, detail="Journal entry not found")
        
        lines = JournalService.get_journal_lines(db, journal_id)
        total_debit = sum(float(line.get("debit_amount", 0)) for line in lines)
        total_credit = sum(float(line.get("credit_amount", 0)) for line in lines)
        
        return {"entry": header, "lines": lines, "totals": {"debit": total_debit, "credit": total_credit}}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting journal entry details: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve journal entry details")

@router.post("/{journal_id}/reverse")
@with_tenant_context
async def reverse_journal_entry(
    journal_id: int,
    reversal_data: dict,
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Reverse a journal entry"""
    try:
        header = JournalService.get_journal_entry(db, str(context.org_id), journal_id)
        if not header:
            raise HTTPException(status_code=404, detail="Journal entry not found")
        if header.get("entry_status") == "reversed":
            raise HTTPException(status_code=400, detail="Entry already reversed")
        
        JournalService.reverse_journal_entry(db, journal_id, reversal_data.get("reason", ""))
        return {"message": "Journal entry reversed successfully", "journal_id": journal_id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error reversing journal entry: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to reverse journal entry")