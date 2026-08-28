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
