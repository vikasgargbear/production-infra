"""Explicit response contracts for finance mutation endpoints."""

from pydantic import BaseModel, ConfigDict


class FinanceMutationModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ExpenseClaimCreated(FinanceMutationModel):
    claim_id: int
    claim_number: str
    total_amount: str
    expenses_count: int
    status: str


class ExpenseClaimCreateResponse(FinanceMutationModel):
    message: str
    data: ExpenseClaimCreated


class JournalEntryCreated(FinanceMutationModel):
    journal_id: int
    journal_number: str
    total_debit: str
    total_credit: str
    lines_count: int


class JournalEntryCreateResponse(FinanceMutationModel):
    message: str
    data: JournalEntryCreated


class GeneralPaymentCreated(FinanceMutationModel):
    payment_id: int
    payment_number: str
    amount: float
    status: str


class GeneralPaymentCreateResponse(FinanceMutationModel):
    message: str
    data: GeneralPaymentCreated


class CustomerReceiptCreateResponse(FinanceMutationModel):
    success: bool
    payment_id: int
    receipt_number: str
    amount: float
    message: str
