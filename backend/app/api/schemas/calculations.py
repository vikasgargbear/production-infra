"""Typed contracts for non-persistent financial calculation previews."""

from decimal import Decimal
from datetime import date
from typing import Annotated, List, Literal, Optional
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    PlainSerializer,
    WithJsonSchema,
)


GSTType = Literal["CGST/SGST", "IGST"]
FreeSupplyTaxTreatment = Literal[
    "excluded_from_taxable_value", "included_at_unit_rate"
]


def _decimal_wire(value: Decimal) -> str:
    """Serialize authority-owned decimals without an IEEE-754 conversion."""
    return format(value, "f")


_DECIMAL_STRING_SCHEMA = {
    "type": "string",
    "pattern": r"^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$",
    "description": "Exact base-10 decimal string; never a JSON number.",
}
_NON_NEGATIVE_DECIMAL_STRING_SCHEMA = {
    **_DECIMAL_STRING_SCHEMA,
    "pattern": r"^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$",
}

ExactDecimal = Annotated[
    Decimal,
    PlainSerializer(_decimal_wire, return_type=str, when_used="json"),
    WithJsonSchema(_DECIMAL_STRING_SCHEMA, mode="serialization"),
]
ExactNonNegativeDecimal = Annotated[
    Decimal,
    Field(ge=0),
    PlainSerializer(_decimal_wire, return_type=str, when_used="json"),
    WithJsonSchema(_NON_NEGATIVE_DECIMAL_STRING_SCHEMA, mode="serialization"),
]
ExactPercent = Annotated[
    Decimal,
    Field(ge=0, le=100),
    PlainSerializer(_decimal_wire, return_type=str, when_used="json"),
    WithJsonSchema(_NON_NEGATIVE_DECIMAL_STRING_SCHEMA, mode="serialization"),
]


class CanonicalSalesCalculationLine(BaseModel):
    """Sales preview input without any browser-owned tax rate."""

    product_id: UUID
    quantity: Decimal = Field(ge=0)
    free_quantity: Decimal = Field(default=Decimal("0"), ge=0)
    free_supply_tax_treatment: FreeSupplyTaxTreatment = (
        "excluded_from_taxable_value"
    )
    unit_price: Decimal = Field(ge=0)
    mrp: Decimal = Field(default=Decimal("0"), ge=0)
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class InvoiceCalculationRequest(BaseModel):
    branch_id: UUID
    customer_id: UUID
    document_date: date
    items: List[CanonicalSalesCalculationLine] = Field(min_length=1, max_length=500)
    freight_charges: Decimal = Field(default=Decimal("0"), ge=0)
    insurance_charges: Decimal = Field(default=Decimal("0"), ge=0)
    other_charges: Decimal = Field(default=Decimal("0"), ge=0)
    discount_type: Literal["percentage", "amount", "fixed"] = "percentage"
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)

    model_config = ConfigDict(extra="forbid")


class SalesOrderCalculationLine(CanonicalSalesCalculationLine):
    batch_id: Optional[UUID] = None
    batch_number: Optional[str] = Field(default=None, max_length=128)
    uom: Optional[str] = Field(default=None, max_length=32)
    pack_type: Optional[str] = Field(default=None, max_length=32)


class SalesOrderCalculationRequest(BaseModel):
    branch_id: UUID
    customer_id: UUID
    order_date: date
    delivery_date: Optional[date] = None
    items: List[SalesOrderCalculationLine] = Field(min_length=1, max_length=200)
    delivery_charges: Decimal = Field(default=Decimal("0"), ge=0)
    other_charges: Decimal = Field(default=Decimal("0"), ge=0)
    discount_type: Literal["percentage", "amount", "fixed"] = "percentage"
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)

    model_config = ConfigDict(extra="forbid")


class CalculationPreviewLine(BaseModel):
    """Exact line contract shared by sales calculation previews."""

    product_id: Optional[UUID] = None
    batch_id: Optional[UUID] = None
    quantity: ExactNonNegativeDecimal
    free_quantity: ExactNonNegativeDecimal
    free_supply_tax_treatment: FreeSupplyTaxTreatment
    subtotal: ExactNonNegativeDecimal
    discount_amount: ExactNonNegativeDecimal
    taxable_amount: ExactNonNegativeDecimal
    cgst_amount: ExactNonNegativeDecimal
    sgst_amount: ExactNonNegativeDecimal
    igst_amount: ExactNonNegativeDecimal
    total_tax: ExactNonNegativeDecimal
    total_tax_amount: ExactNonNegativeDecimal
    line_total: ExactNonNegativeDecimal
    gst_percent: Optional[ExactPercent] = None
    cgst_percent: Optional[ExactPercent] = None
    sgst_percent: Optional[ExactPercent] = None
    igst_percent: Optional[ExactPercent] = None
    scheme_discount: Optional[ExactNonNegativeDecimal] = None
    model_config = ConfigDict(extra="forbid")


class CanonicalSalesCalculationPreviewLine(CalculationPreviewLine):
    hsn_code: str = Field(pattern=r"^[0-9]{4,8}$")
    taxability: Literal["taxable", "exempt", "nil_rated", "non_gst"]
    tax_code_version_id: UUID
    tax_release_id: UUID
    tax_version_number: int = Field(ge=1)
    tax_effective_from: date
    tax_effective_to: Optional[date] = None
    tax_ruleset_version: str = Field(min_length=1, max_length=128)


class InvoiceCalculationPreviewTotals(BaseModel):
    subtotal_amount: ExactNonNegativeDecimal
    discount_amount: ExactNonNegativeDecimal
    scheme_discount: ExactNonNegativeDecimal
    scheme_discount_percent: ExactPercent
    taxable_amount: ExactNonNegativeDecimal
    cgst_amount: ExactNonNegativeDecimal
    sgst_amount: ExactNonNegativeDecimal
    igst_amount: ExactNonNegativeDecimal
    total_tax_amount: ExactNonNegativeDecimal
    freight_charges: ExactNonNegativeDecimal
    insurance_charges: ExactNonNegativeDecimal
    other_charges: ExactNonNegativeDecimal
    round_off_amount: ExactDecimal
    final_amount: ExactNonNegativeDecimal

    model_config = ConfigDict(extra="forbid")


class InvoiceCalculationPreviewResponse(BaseModel):
    success: Literal[True]
    line_items: List[CanonicalSalesCalculationPreviewLine] = Field(
        min_length=1, max_length=500
    )
    totals: InvoiceCalculationPreviewTotals
    calculation_timestamp: int = Field(ge=0)
    gst_type: GSTType

    model_config = ConfigDict(extra="forbid")
