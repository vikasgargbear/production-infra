"""
Schemas for Credit Notes and Debit Notes
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, validator
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID


# Enum values for reason codes
CREDIT_NOTE_REASONS = [
    'SALES_RETURN', 'DAMAGED_GOODS', 'EXPIRED_GOODS',
    'WRONG_BILLING', 'RATE_DIFFERENCE', 'QUALITY_ISSUE',
    'SHORT_SUPPLY', 'DISCOUNT_ADJUSTMENT', 'OTHER'
]

DEBIT_NOTE_REASONS = [
    'RATE_CORRECTION', 'QUANTITY_CORRECTION', 'TAX_CORRECTION',
    'FREIGHT_CHARGES', 'LOADING_CHARGES', 'INTEREST_CHARGES',
    'PENALTY_CHARGES', 'SERVICE_CHARGES', 'OTHER'
]


class CreditNoteItem(BaseModel):
    """Item details for credit note"""
    product_id: int
    product_name: str
    batch_no: Optional[str] = None
    quantity: Decimal
    rate: Decimal
    discount_percent: Decimal = Decimal("0.00")
    tax_percent: Decimal = Decimal("0.00")
    amount: Decimal


class CreditNoteBase(BaseModel):
    """Base schema for credit note"""
    credit_note_date: date = Field(default_factory=date.today)
    customer_id: int
    reference_type: Optional[str] = Field(None, pattern="^(INVOICE|RETURN|ADJUSTMENT|OTHER)$")
    reference_id: Optional[int] = None
    reference_number: Optional[str] = None
    credit_amount: Decimal = Field(..., gt=0)
    tax_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    reason_code: str
    reason: str
    notes: Optional[str] = None
    is_gst_applicable: bool = Field(default=True)
    cgst_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    sgst_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    igst_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    items_detail: Optional[List[CreditNoteItem]] = None

    @validator('reason_code')
    def validate_reason_code(cls, v):
        if v not in CREDIT_NOTE_REASONS:
            raise ValueError(f'Invalid reason code. Must be one of: {", ".join(CREDIT_NOTE_REASONS)}')
        return v

    @validator('tax_amount')
    def validate_tax_amount(cls, v, values):
        if 'cgst_amount' in values and 'sgst_amount' in values and 'igst_amount' in values:
            expected = values['cgst_amount'] + values['sgst_amount'] + values['igst_amount']
            if abs(v - expected) > Decimal("0.01"):  # Allow small rounding difference
                raise ValueError('Tax amount must equal sum of CGST, SGST, and IGST')
        return v


class CreditNoteCreate(CreditNoteBase):
    """Schema for creating credit note"""
    pass


class CreditNoteUpdate(BaseModel):
    """Schema for updating credit note"""
    credit_note_date: Optional[date] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(draft|approved|cancelled)$")


class CreditNoteResponse(CreditNoteBase):
    """Schema for credit note response"""
    credit_note_id: int
    org_id: UUID
    branch_id: int
    credit_note_number: str
    total_amount: Decimal
    status: str
    applied_amount: Decimal = Field(default=Decimal("0.00"))
    remaining_amount: Decimal
    approved_by: Optional[int] = None
    approved_date: Optional[datetime] = None
    created_by: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DebitNoteBase(BaseModel):
    """Base schema for debit note"""
    debit_note_date: date = Field(default_factory=date.today)
    customer_id: int
    reference_type: Optional[str] = Field(None, pattern="^(INVOICE|INTEREST|PENALTY|ADJUSTMENT|OTHER)$")
    reference_id: Optional[int] = None
    reference_number: Optional[str] = None
    debit_amount: Decimal = Field(..., gt=0)
    tax_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    reason_code: str
    reason: str
    notes: Optional[str] = None
    is_gst_applicable: bool = Field(default=True)
    cgst_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    sgst_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    igst_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    items_detail: Optional[Dict[str, Any]] = None

    @validator('reason_code')
    def validate_reason_code(cls, v):
        if v not in DEBIT_NOTE_REASONS:
            raise ValueError(f'Invalid reason code. Must be one of: {", ".join(DEBIT_NOTE_REASONS)}')
        return v


class DebitNoteCreate(DebitNoteBase):
    """Schema for creating debit note"""
    pass


class DebitNoteUpdate(BaseModel):
    """Schema for updating debit note"""
    debit_note_date: Optional[date] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(draft|approved|cancelled)$")
    paid_amount: Optional[Decimal] = Field(None, ge=0)


class DebitNoteResponse(DebitNoteBase):
    """Schema for debit note response"""
    debit_note_id: int
    org_id: UUID
    branch_id: int
    debit_note_number: str
    total_amount: Decimal
    status: str
    paid_amount: Decimal = Field(default=Decimal("0.00"))
    payment_status: str
    approved_by: Optional[int] = None
    approved_date: Optional[datetime] = None
    created_by: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CreditNoteApplication(BaseModel):
    """Schema for applying credit note to invoice"""
    credit_note_id: int
    invoice_id: int
    applied_amount: Decimal = Field(..., gt=0)


class CreditNoteApplicationResponse(BaseModel):
    """Response for credit note application"""
    application_id: int
    credit_note_id: int
    invoice_id: int
    applied_amount: Decimal
    application_date: date
    created_at: datetime

    class Config:
        from_attributes = True