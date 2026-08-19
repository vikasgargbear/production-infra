"""
Journal Entry management endpoints
REFACTORED: Uses JournalService for database operations
"""
from typing import Optional, List
from datetime import date, datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, validator
import logging
from ....services.document_number_service import (
    DocumentNumberService,
    document_number_reservation_openapi,
)
from ....services.finance.journal.service import JournalService
from ....schemas.finance.mutations import JournalEntryCreateResponse

from .....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from .....core.auth.org_context import get_org_context, OrgContext
from .....core.security.permissions import PermissionChecker
from .....core.money import money_json

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
    
    @validator('lines')
    def validate_balanced_entry(cls, v):
        total_debit = sum(line.debit_amount for line in v)
        total_credit = sum(line.credit_amount for line in v)
        if total_debit != total_credit:
            raise ValueError(f'Entry must be balanced. Debit: {total_debit}, Credit: {total_credit}')
        if total_debit == 0:
            raise ValueError('Entry cannot have zero amounts')
        return v


class JournalReversalCreate(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)
    reversal_date: date = Field(default_factory=date.today)

@router.post(
    "/generate-journal-number",
    operation_id="finance_reserve_journal_number_v1",
    summary="Reserve a journal entry number",
    openapi_extra=document_number_reservation_openapi("finance.create"),
)
@with_tenant_context
async def generate_journal_number(
    _: dict = Depends(PermissionChecker("finance", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Reserve and commit the next organization-scoped journal entry number."""
    try:
        journal_number = DocumentNumberService.reserve_number(
            db, "journal_entry", str(context.org_id)
        )
        return {"journal_number": journal_number, "generated_at": datetime.now(timezone.utc).isoformat()}
    except Exception as e:
        logger.error(f"Error generating journal number: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to reserve journal number")

@router.get("/chart-of-accounts")
@with_tenant_context
async def get_chart_of_accounts(
    search: Optional[str] = Query(None),
    account_type: Optional[str] = Query(None),
    active_only: bool = Query(True),
    _: dict = Depends(PermissionChecker("finance", "view")),
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

@router.post("", response_model=JournalEntryCreateResponse)
@with_tenant_context
async def create_journal_entry(
    journal_entry: JournalEntryCreate,
    _: dict = Depends(PermissionChecker("finance", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Create a new journal entry"""
    try:
        org_id = str(context.org_id)
        branch_id = context.primary_branch_id
        if branch_id is None:
            raise HTTPException(status_code=400, detail="An active branch is required")
        journal_number = DocumentNumberService.generate_number(db.session, "journal_entry", org_id)
        
        created_by = context.user_id
        
        total_debit = sum(line.debit_amount for line in journal_entry.lines)
        total_credit = sum(line.credit_amount for line in journal_entry.lines)
        
        journal_id = JournalService.insert_journal_entry(db, org_id, {
            "journal_number": journal_number, "journal_date": journal_entry.journal_date,
            "branch_id": branch_id, "journal_type": "manual",
            "reference_number": journal_entry.reference_number, "narration": journal_entry.narration,
            "created_by": created_by
        })
        
        for line in journal_entry.lines:
            account = JournalService.get_account(
                db, org_id, line.account_code, line.account_name
            )
            JournalService.insert_journal_line(db, {
                "journal_id": journal_id,
                "account_code": account["account_code"],
                "account_name": account["account_name"],
                "debit_amount": line.debit_amount, "credit_amount": line.credit_amount,
                "line_narration": line.narration
            })

        JournalService.post_journal_entry(
            db, org_id, journal_id, created_by
        )
        db.commit()
        
        return {
            "message": "Journal entry created successfully",
            "data": {"journal_id": journal_id, "journal_number": journal_number,
                     "total_debit": money_json(total_debit), "total_credit": money_json(total_credit),
                     "lines_count": len(journal_entry.lines)}
        }
    except HTTPException:
        db.rollback()
        raise
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
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
    _: dict = Depends(PermissionChecker("finance", "view")),
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
    _: dict = Depends(PermissionChecker("finance", "view")),
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
    reversal_data: JournalReversalCreate,
    _: dict = Depends(PermissionChecker("finance", "approve")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Reverse a journal entry"""
    try:
        org_id = str(context.org_id)
        reversal_number = DocumentNumberService.generate_number(
            db.session, "journal_entry", org_id
        )
        reversal_id = JournalService.reverse_journal_entry(
            db=db,
            org_id=org_id,
            journal_id=journal_id,
            journal_number=reversal_number,
            reversal_date=reversal_data.reversal_date,
            reason=reversal_data.reason,
            created_by=context.user_id,
        )
        db.commit()
        return {
            "message": "Compensating journal posted successfully",
            "original_journal_id": journal_id,
            "reversal_journal_id": reversal_id,
            "reversal_journal_number": reversal_number,
        }
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        db.rollback()
        logger.error("Error reversing journal entry: %s", e)
        raise HTTPException(status_code=500, detail="Failed to reverse journal entry") from e
