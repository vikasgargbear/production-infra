"""Typed contracts for non-persistent financial calculation previews."""

from decimal import Decimal
from datetime import date
from typing import Annotated, List, Literal, Optional, Union
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    PlainSerializer,
    PositiveInt,
    WithJsonSchema,
)


GSTType = Literal["CGST/SGST", "IGST"]
FreeSupplyTaxTreatment = Literal[
    "excluded_from_taxable_value", "included_at_unit_rate"
]
EntityId = Union[PositiveInt, UUID]


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


class CalculationLine(BaseModel):
    product_id: Optional[EntityId] = None
    product_name: Optional[str] = Field(default=None, max_length=255)
    quantity: Decimal = Field(ge=0)
    free_quantity: Decimal = Field(default=Decimal("0"), ge=0)
    free_supply_tax_treatment: FreeSupplyTaxTreatment = (
        "excluded_from_taxable_value"
    )
    unit_price: Decimal = Field(ge=0)
    mrp: Decimal = Field(default=Decimal("0"), ge=0)
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    gst_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    tax_percent: Optional[Decimal] = Field(default=None, ge=0, le=100)

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


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


class PurchaseCalculationRequest(BaseModel):
    supplier_id: Optional[EntityId] = None
    gst_type: GSTType = "CGST/SGST"
    items: List[CalculationLine] = Field(min_length=1, max_length=500)
    freight_charges: Decimal = Field(default=Decimal("0"), ge=0)
    insurance_charges: Decimal = Field(default=Decimal("0"), ge=0)
    other_charges: Decimal = Field(default=Decimal("0"), ge=0)

    model_config = ConfigDict(extra="forbid")


class ChallanCalculationRequest(BaseModel):
    customer_id: EntityId
    gst_type: GSTType
    items: List[CalculationLine] = Field(min_length=1, max_length=500)
    freight_charges: Decimal = Field(default=Decimal("0"), ge=0)

    model_config = ConfigDict(extra="forbid")


class CalculationPreviewLine(BaseModel):
    """Exact line contract shared by sales calculation previews."""

    product_id: Optional[EntityId] = None
    batch_id: Optional[EntityId] = None
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


class ChallanCalculationPreviewTotals(BaseModel):
    subtotal_amount: ExactNonNegativeDecimal
    discount_amount: ExactNonNegativeDecimal
    taxable_amount: ExactNonNegativeDecimal
    cgst_amount: ExactNonNegativeDecimal
    sgst_amount: ExactNonNegativeDecimal
    igst_amount: ExactNonNegativeDecimal
    total_tax_amount: ExactNonNegativeDecimal
    freight_charges: ExactNonNegativeDecimal
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


class ChallanCalculationPreviewResponse(BaseModel):
    success: Literal[True]
    line_items: List[CalculationPreviewLine] = Field(min_length=1, max_length=500)
    totals: ChallanCalculationPreviewTotals
    calculation_timestamp: int = Field(ge=0)
    gst_type: GSTType

    model_config = ConfigDict(extra="forbid")


class PurchaseCalculationPreviewLine(BaseModel):
    product_id: Optional[EntityId] = None
    product_name: Optional[str] = None
    quantity: ExactNonNegativeDecimal
    unit_price: ExactNonNegativeDecimal
    discount_percent: ExactPercent
    discount_amount: ExactNonNegativeDecimal
    tax_percent: ExactPercent
    taxable_amount: ExactNonNegativeDecimal
    cgst_amount: ExactNonNegativeDecimal
    sgst_amount: ExactNonNegativeDecimal
    igst_amount: ExactNonNegativeDecimal
    tax_amount: ExactNonNegativeDecimal
    line_total: ExactNonNegativeDecimal
    mrp: ExactNonNegativeDecimal

    model_config = ConfigDict(extra="forbid")


class PurchaseCalculationPreviewTotals(BaseModel):
    subtotal_amount: ExactNonNegativeDecimal
    discount_amount: ExactNonNegativeDecimal
    taxable_amount: ExactNonNegativeDecimal
    cgst_amount: ExactNonNegativeDecimal
    sgst_amount: ExactNonNegativeDecimal
    igst_amount: ExactNonNegativeDecimal
    tax_amount: ExactNonNegativeDecimal
    freight_charges: ExactNonNegativeDecimal
    insurance_charges: ExactNonNegativeDecimal
    other_charges: ExactNonNegativeDecimal
    round_off_amount: ExactDecimal
    total_amount: ExactNonNegativeDecimal
    invoice_total: ExactNonNegativeDecimal

    model_config = ConfigDict(extra="forbid")


class PurchaseCalculationPreviewResponse(BaseModel):
    success: Literal[True]
    line_items: List[PurchaseCalculationPreviewLine] = Field(
        min_length=1, max_length=500
    )
    totals: PurchaseCalculationPreviewTotals
    calculation_timestamp: int = Field(ge=0)
    gst_type: GSTType

    model_config = ConfigDict(extra="forbid")


class ReturnCalculationLine(BaseModel):
    product_id: Optional[EntityId] = None
    return_quantity: Decimal = Field(gt=0)
    paid_quantity: Decimal = Field(default=Decimal("0"), ge=0)
    free_quantity: Decimal = Field(default=Decimal("0"), ge=0)
    unit_price: Decimal = Field(ge=0)
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    tax_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)

    model_config = ConfigDict(extra="forbid")


class ReturnCalculationRequest(BaseModel):
    return_type: Literal["sales", "purchase"]
    customer_id: Optional[EntityId] = None
    supplier_id: Optional[EntityId] = None
    gst_type: GSTType = "CGST/SGST"
    include_gst: bool = True
    items: List[ReturnCalculationLine] = Field(min_length=1, max_length=500)

    model_config = ConfigDict(extra="forbid")


class ReturnCalculationPreviewLine(BaseModel):
    product_id: Optional[EntityId] = None
    return_quantity: ExactNonNegativeDecimal
    taxable_quantity: ExactNonNegativeDecimal
    unit_price: ExactNonNegativeDecimal
    discount_percent: ExactPercent
    discount_amount: ExactNonNegativeDecimal
    tax_percent: ExactPercent
    taxable_amount: ExactNonNegativeDecimal
    cgst_amount: ExactNonNegativeDecimal
    sgst_amount: ExactNonNegativeDecimal
    igst_amount: ExactNonNegativeDecimal
    tax_amount: ExactNonNegativeDecimal
    total_amount: ExactNonNegativeDecimal

    model_config = ConfigDict(extra="forbid")


class ReturnCalculationPreviewTotals(BaseModel):
    subtotal: ExactNonNegativeDecimal
    tax_amount: ExactNonNegativeDecimal
    cgst_amount: ExactNonNegativeDecimal
    sgst_amount: ExactNonNegativeDecimal
    igst_amount: ExactNonNegativeDecimal
    round_off_amount: ExactDecimal
    total_amount: ExactNonNegativeDecimal
    total_return_quantity: ExactNonNegativeDecimal

    model_config = ConfigDict(extra="forbid")


class ReturnCalculationPreviewResponse(BaseModel):
    success: Literal[True]
    line_items: List[ReturnCalculationPreviewLine] = Field(
        min_length=1, max_length=500
    )
    totals: ReturnCalculationPreviewTotals
    calculation_timestamp: int = Field(ge=0)
    gst_type: GSTType

    model_config = ConfigDict(extra="forbid")


class NoteCalculationRequest(BaseModel):
    note_type: Literal["credit", "debit"]
    party_type: Literal["customer", "supplier"] = "customer"
    party_id: Optional[EntityId] = None
    gst_type: GSTType = "CGST/SGST"
    include_gst: bool = True
    items: List[CalculationLine] = Field(min_length=1, max_length=500)

    model_config = ConfigDict(extra="forbid")


class NoteCalculationPreviewLine(BaseModel):
    product_id: Optional[EntityId] = None
    product_name: Optional[str] = None
    quantity: ExactNonNegativeDecimal
    free_quantity: ExactNonNegativeDecimal
    free_supply_tax_treatment: FreeSupplyTaxTreatment
    unit_price: ExactNonNegativeDecimal
    mrp: ExactNonNegativeDecimal
    discount_percent: ExactPercent
    gst_percent: ExactPercent
    tax_percent: Optional[ExactPercent] = None
    subtotal_amount: ExactNonNegativeDecimal
    discount_amount: ExactNonNegativeDecimal
    taxable_amount: ExactNonNegativeDecimal
    cgst_amount: ExactNonNegativeDecimal
    sgst_amount: ExactNonNegativeDecimal
    igst_amount: ExactNonNegativeDecimal
    tax_amount: ExactNonNegativeDecimal
    total_amount: ExactNonNegativeDecimal

    model_config = ConfigDict(extra="forbid")


class NoteCalculationPreviewTotals(BaseModel):
    subtotal_amount: ExactNonNegativeDecimal
    discount_amount: ExactNonNegativeDecimal
    taxable_amount: ExactNonNegativeDecimal
    cgst_amount: ExactNonNegativeDecimal
    sgst_amount: ExactNonNegativeDecimal
    igst_amount: ExactNonNegativeDecimal
    tax_amount: ExactNonNegativeDecimal
    total_amount: ExactNonNegativeDecimal

    model_config = ConfigDict(extra="forbid")


class NoteCalculationPreviewResponse(BaseModel):
    success: Literal[True]
    line_items: List[NoteCalculationPreviewLine] = Field(
        min_length=1, max_length=500
    )
    totals: NoteCalculationPreviewTotals
    calculation_timestamp: int = Field(ge=0)
    gst_type: GSTType

    model_config = ConfigDict(extra="forbid")
