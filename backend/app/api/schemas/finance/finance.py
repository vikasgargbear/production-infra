"""
Finance schemas for payments, allocations, journals, and expenses
"""
from typing import List, Optional, Dict, Any
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict
from enum import Enum


# =============================================================================
# ENUMS
# =============================================================================

class AllocationMethod(str, Enum):
    """Payment allocation methods"""
    FIFO = "fifo"
    LIFO = "lifo"
    PROPORTIONAL = "proportional"
    MANUAL = "manual"


class JournalEntryType(str, Enum):
    """Journal entry types"""
    MANUAL = "manual"
    AUTO = "auto"
    SYSTEM = "system"
    REVERSAL = "reversal"


# =============================================================================
# PAYMENT ALLOCATION SCHEMAS
# =============================================================================

class AllocationRequest(BaseModel):
    """Request to allocate a payment to an invoice"""
    
    payment_id: int = Field(..., description="Payment ID to allocate from")
    invoice_id: int = Field(..., description="Invoice ID to allocate to")
    amount: Decimal = Field(..., gt=0, description="Amount to allocate")

    model_config = ConfigDict(str_strip_whitespace=True)


class BulkAllocationRequest(BaseModel):
    """Request to allocate a payment to multiple invoices"""
    
    payment_id: int
    allocations: List[Dict[str, Any]] = Field(
        ..., 
        min_length=1,
        description="List of {invoice_id, amount} dicts"
    )

    model_config = ConfigDict(str_strip_whitespace=True)


class AutoAllocationRequest(BaseModel):
    """Request for automatic payment allocation"""
    
    payment_id: int
    method: AllocationMethod = Field(default=AllocationMethod.FIFO)
    max_invoices: Optional[int] = Field(None, ge=1, description="Limit invoices to allocate")

    model_config = ConfigDict(str_strip_whitespace=True)


class AllocationResponse(BaseModel):
    """Response for allocation operation"""
    
    allocation_id: int
    payment_id: int
    invoice_id: int
    allocated_amount: Decimal
    allocation_date: date
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# JOURNAL ENTRY SCHEMAS
# =============================================================================

class JournalLineCreate(BaseModel):
    """Schema for journal entry line"""
    
    account_code: str = Field(..., description="Chart of accounts code")
    account_name: Optional[str] = None
    description: Optional[str] = Field(None, max_length=200)
    debit_amount: Decimal = Field(default=Decimal("0"), ge=0)
    credit_amount: Decimal = Field(default=Decimal("0"), ge=0)
    cost_center: Optional[str] = Field(None, max_length=50)

    @field_validator("debit_amount", "credit_amount", mode="before")
    @classmethod
    def ensure_decimal(cls, v):
        if v is None:
            return Decimal("0")
        return Decimal(str(v))

    model_config = ConfigDict(str_strip_whitespace=True)


class JournalEntryCreate(BaseModel):
    """Schema for creating journal entry"""
    
    entry_date: date = Field(default_factory=date.today)
    reference_number: Optional[str] = Field(None, max_length=50)
    narration: str = Field(..., min_length=1, max_length=500, description="Entry description")
    entry_type: JournalEntryType = Field(default=JournalEntryType.MANUAL)
    source_type: Optional[str] = Field(None, description="invoice, payment, return, adjustment")
    source_id: Optional[int] = None
    lines: List[JournalLineCreate] = Field(..., min_length=2)

    @model_validator(mode="after")
    def validate_balanced(self):
        """Ensure debits equal credits"""
        total_debit = sum(line.debit_amount for line in self.lines)
        total_credit = sum(line.credit_amount for line in self.lines)
        if abs(total_debit - total_credit) > Decimal("0.01"):
            raise ValueError(f"Entry not balanced: Debit={total_debit}, Credit={total_credit}")
        return self

    model_config = ConfigDict(str_strip_whitespace=True)


class JournalLineResponse(BaseModel):
    """Schema for journal line response"""
    
    line_id: int
    account_code: str
    account_name: Optional[str] = None
    description: Optional[str] = None
    debit_amount: Decimal
    credit_amount: Decimal
    cost_center: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class JournalEntryResponse(BaseModel):
    """Schema for journal entry response"""
    
    entry_id: int
    entry_number: str
    entry_date: date
    reference_number: Optional[str] = None
    narration: str
    entry_type: str
    source_type: Optional[str] = None
    source_id: Optional[int] = None
    total_debit: Decimal
    total_credit: Decimal
    lines: List[JournalLineResponse] = Field(default_factory=list)
    created_at: datetime
    created_by: Optional[int] = None
    is_posted: bool = False

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# EXPENSE SCHEMAS
# =============================================================================

class ExpenseLineCreate(BaseModel):
    """Schema for expense line item"""
    
    expense_type: str = Field(..., description="Type of expense")
    description: Optional[str] = Field(None, max_length=200)
    amount: Decimal = Field(..., gt=0)
    tax_amount: Decimal = Field(default=Decimal("0"), ge=0)
    account_code: Optional[str] = Field(None, max_length=20)

    model_config = ConfigDict(str_strip_whitespace=True)


class ExpenseClaimCreate(BaseModel):
    """Schema for creating expense claim"""
    
    claim_date: date = Field(default_factory=date.today)
    claimant_name: str = Field(..., max_length=100)
    department: Optional[str] = Field(None, max_length=50)
    description: str = Field(..., max_length=500)
    lines: List[ExpenseLineCreate] = Field(..., min_length=1)
    attachments: List[str] = Field(default_factory=list)

    model_config = ConfigDict(str_strip_whitespace=True)


class ExpenseClaimResponse(BaseModel):
    """Schema for expense claim response"""
    
    claim_id: int
    claim_number: str
    claim_date: date
    claimant_name: str
    department: Optional[str] = None
    description: str
    total_amount: Decimal
    tax_amount: Decimal
    status: str = "pending"
    lines: List[dict] = Field(default_factory=list)
    created_at: datetime
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


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
    debit: Decimal = Decimal("0")
    credit: Decimal = Decimal("0")
    balance: Decimal = Decimal("0")

    model_config = ConfigDict(from_attributes=True)


class LedgerSummary(BaseModel):
    """Summary of ledger account"""
    
    party_id: int
    party_name: str
    party_type: str  # customer, supplier
    opening_balance: Decimal = Decimal("0")
    total_debit: Decimal = Decimal("0")
    total_credit: Decimal = Decimal("0")
    closing_balance: Decimal = Decimal("0")
    transactions: List[LedgerTransaction] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class LedgerRequest(BaseModel):
    """Request for ledger report"""
    
    party_id: int
    party_type: str = Field(..., description="customer or supplier")
    from_date: Optional[date] = None
    to_date: Optional[date] = None
    include_details: bool = True

    model_config = ConfigDict(str_strip_whitespace=True)
