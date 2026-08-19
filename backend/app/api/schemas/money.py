"""OpenAPI types for exact monetary response values."""

from typing import Annotated, List, Optional

from pydantic import BaseModel, Field


MONEY_JSON_PATTERN = r"^-?(?:0|[1-9]\d*)\.\d{2}$"

MoneyJSON = Annotated[
    str,
    Field(
        pattern=MONEY_JSON_PATTERN,
        description=(
            "Exact monetary amount in major currency units with exactly two decimal "
            "places. Parse with a decimal library for arithmetic."
        ),
        examples=["1234.50"],
    ),
]


class GSTCalculationResponse(BaseModel):
    taxableAmount: MoneyJSON
    gstRate: float
    gstType: str
    cgst: MoneyJSON
    sgst: MoneyJSON
    igst: MoneyJSON
    totalTax: MoneyJSON
    total: MoneyJSON


class GSTR2BUploadStatusItem(BaseModel):
    upload_id: str
    return_period: str
    gstin: str
    file_name: str
    uploaded_at: Optional[str] = None
    total_invoices: int
    total_itc_available: MoneyJSON
    total_suppliers: int
    status: str
    reconciled: bool
    matched: int
    mismatched: int
    missing: int
    match_rate: float


class GSTR2BStatusResponse(BaseModel):
    uploads: List[GSTR2BUploadStatusItem]
    error: Optional[str] = None


class GSTR2BMismatchItem(BaseModel):
    id: str
    return_period: str
    supplier_gstin: str
    supplier_name: Optional[str] = None
    invoice_number: str
    invoice_date: Optional[str] = None
    invoice_value: MoneyJSON
    itc_available: MoneyJSON
    match_status: str
    mismatch_type: Optional[str] = None
    mismatch_details: Optional[str] = None
    our_invoice_number: Optional[str] = None
    our_invoice_amount: Optional[MoneyJSON] = None
    amount_difference: Optional[MoneyJSON] = None


class GSTR2BMismatchResponse(BaseModel):
    invoices: List[GSTR2BMismatchItem]
    total_count: int = 0
    total_itc_at_risk: MoneyJSON = "0.00"
    error: Optional[str] = None


class CollectionDailyPoint(BaseModel):
    date: str
    amount: MoneyJSON
    count: int


class CollectionPerformanceResponse(BaseModel):
    total_collections: MoneyJSON
    daily_collections: List[CollectionDailyPoint]
    collection_rate: float
    outstanding_change: float


class OutstandingInvoiceItem(BaseModel):
    id: int
    number: str
    date: str
    amount: MoneyJSON
    outstanding: MoneyJSON
    dueDate: str
    daysOverdue: int
    status: str


class ExactMoneyCustomerOutstandingResponse(BaseModel):
    customer_id: int
    invoices: List[OutstandingInvoiceItem]
    total_outstanding: MoneyJSON
