"""
Finance-related schemas for payments, allocations, journals, and expenses
Centralized from inline route definitions
"""
from typing import List, Optional, Dict, Any
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, Field, validator


# =============================================================================
# PAYMENT ALLOCATION SCHEMAS
# =============================================================================

class AllocationRequest(BaseModel):
    """Request to allocate a payment to an invoice"""
    payment_id: int
    invoice_id: int
    amount: float = Field(gt=0, description="Amount to allocate")


class BulkAllocationRequest(BaseModel):
    """Request to allocate a payment to multiple invoices"""
    payment_id: int
    allocations: List[Dict[str, Any]]  # [{"invoice_id": 1, "amount": 100}, ...]


class AutoAllocationRequest(BaseModel):
    """Request for automatic payment allocation"""
    payment_id: int
    method: str = Field(default="fifo", pattern="^(fifo|lifo|proportional)$")


# =============================================================================
# JOURNAL ENTRY SCHEMAS
# =============================================================================

class JournalLineCreate(BaseModel):
    """Schema for journal entry line"""
    account_code: str = Field(..., description="Chart of accounts code")
    account_name: Optional[str] = None
    description: Optional[str] = None
    debit_amount: Decimal = Field(default=Decimal("0"), ge=0)
    credit_amount: Decimal = Field(default=Decimal("0"), ge=0)
    cost_center: Optional[str] = None
    
    @validator('credit_amount', 'debit_amount', pre=True)
    def ensure_decimal(cls, v):
        if v is None:
            return Decimal("0")
        return Decimal(str(v))


class JournalEntryCreate(BaseModel):
    """Schema for creating journal entry"""
    entry_date: date
    reference_number: Optional[str] = None
    narration: str = Field(..., min_length=1, description="Entry description")
    entry_type: str = Field(default="manual", description="manual, auto, system")
    source_type: Optional[str] = None  # invoice, payment, return, adjustment
    source_id: Optional[int] = None
    lines: List[JournalLineCreate] = Field(..., min_items=2)
    
    @validator('lines')
    def validate_balanced(cls, v):
        total_debit = sum(line.debit_amount for line in v)
        total_credit = sum(line.credit_amount for line in v)
        if abs(total_debit - total_credit) > Decimal("0.01"):
            raise ValueError(f"Entry not balanced: Debit={total_debit}, Credit={total_credit}")
        return v


# =============================================================================
# EXPENSE SCHEMAS
# =============================================================================

class ExpenseLineCreate(BaseModel):
    """Schema for expense line item"""
    expense_type: str = Field(..., description="Type of expense")
    description: Optional[str] = None
    amount: Decimal = Field(..., gt=0)
    tax_amount: Decimal = Field(default=Decimal("0"), ge=0)
    account_code: Optional[str] = None


class ExpenseClaimCreate(BaseModel):
    """Schema for creating expense claim"""
    claim_date: date = Field(default_factory=date.today)
    claimant_name: str
    department: Optional[str] = None
    description: str
    lines: List[ExpenseLineCreate] = Field(..., min_items=1)
    attachments: Optional[List[str]] = None


# =============================================================================
# LEDGER SCHEMAS
# =============================================================================

class LedgerTransaction(BaseModel):
    """Individual ledger transaction"""
    id: int
    date: date
    type: str
    reference: str
    description: str
    debit: float
    credit: float
    balance: float


class LedgerSummary(BaseModel):
    """Summary of ledger account"""
    party_id: int
    party_name: str
    party_type: str
    opening_balance: float
    total_debit: float
    total_credit: float
    closing_balance: float
    transactions: List[LedgerTransaction]
