"""Strict inputs and exact outputs for canonical document calculations."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP, localcontext
from enum import Enum
from typing import Optional, Tuple


ZERO = Decimal("0")
MONEY_QUANTUM = Decimal("0.01")
QUANTITY_QUANTUM = Decimal("0.000001")
RATE_QUANTUM = Decimal("0.000001")
UNIT_RATE_QUANTUM = Decimal("0.0001")
MAX_QUANTITY = Decimal("99999999999999.999999")
MAX_RATE = Decimal("999.999999")
MAX_UNIT_RATE = Decimal("9999999999999999.9999")
MAX_MONEY = Decimal("999999999999999999.99")


class GstType(str, Enum):
    INTRA_STATE = "intra_state"
    INTER_STATE = "inter_state"


class PriceBasis(str, Enum):
    TAX_EXCLUSIVE = "tax_exclusive"
    TAX_INCLUSIVE = "tax_inclusive"


class DiscountKind(str, Enum):
    NONE = "none"
    PERCENT = "percent"
    AMOUNT = "amount"


class DiscountBasis(str, Enum):
    PRE_TAX_VALUE = "pre_tax_value"
    PRICE_VALUE = "price_value"


class FreeSupplyTaxTreatment(str, Enum):
    EXCLUDE_FROM_VALUE = "excluded_from_taxable_value"
    INCLUDE_AT_UNIT_PRICE = "included_at_unit_rate"


class TaxabilitySnapshot(str, Enum):
    TAXABLE = "taxable"
    ZERO_RATED = "zero_rated"
    EXEMPT = "exempt"
    NIL_RATED = "nil_rated"
    NON_GST = "non_gst"


class ZeroRatedMode(str, Enum):
    NOT_APPLICABLE = "not_applicable"
    WITHOUT_PAYMENT = "without_payment"
    WITH_IGST = "with_igst"


class RoundingPolicy(str, Enum):
    NONE = "none"
    NEAREST_RUPEE = "nearest_rupee"


class TaxChargeMechanism(str, Enum):
    NORMAL = "normal"
    REVERSE_CHARGE = "reverse_charge"


class GstTaxTreatment(str, Enum):
    STATUTORY = "statutory"
    COMMERCIAL_ONLY = "commercial_only"


class ReversalValueBasis(str, Enum):
    BILLED_QUANTITY = "billed_quantity"
    BASE_QUANTITY = "base_quantity"


def _require_decimal(value: Decimal, field: str) -> Decimal:
    if not isinstance(value, Decimal) or isinstance(value, bool):
        raise TypeError(f"{field} must be Decimal")
    if not value.is_finite():
        raise ValueError(f"{field} must be finite")
    return value


def _require_non_negative(value: Decimal, field: str) -> Decimal:
    value = _require_decimal(value, field)
    if value < ZERO:
        raise ValueError(f"{field} must be non-negative")
    return value


def _require_quantity(value: Decimal, field: str, *, positive: bool = False) -> Decimal:
    value = _require_non_negative(value, field)
    if value > MAX_QUANTITY:
        raise ValueError(f"{field} exceeds numeric(20,6)")
    if value != value.quantize(QUANTITY_QUANTUM, rounding=ROUND_HALF_UP):
        raise ValueError(f"{field} cannot exceed six decimal places")
    if positive and value <= ZERO:
        raise ValueError(f"{field} must be greater than zero")
    return value


def _require_money(value: Decimal, field: str) -> Decimal:
    value = _require_non_negative(value, field)
    if value > MAX_MONEY:
        raise ValueError(f"{field} exceeds numeric(20,2)")
    if value != value.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP):
        raise ValueError(f"{field} must be rounded to two decimal places")
    return value


def _require_signed_money(value: Decimal, field: str) -> Decimal:
    value = _require_decimal(value, field)
    if abs(value) > MAX_MONEY:
        raise ValueError(f"{field} exceeds numeric(20,2)")
    if value != value.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP):
        raise ValueError(f"{field} must be rounded to two decimal places")
    return value


def _require_rate(value: Decimal, field: str) -> Decimal:
    value = _require_non_negative(value, field)
    if value > MAX_RATE:
        raise ValueError(f"{field} exceeds numeric(9,6)")
    if value != value.quantize(RATE_QUANTUM, rounding=ROUND_HALF_UP):
        raise ValueError(f"{field} cannot exceed six decimal places")
    return value


def _require_unit_rate(value: Decimal, field: str) -> Decimal:
    value = _require_non_negative(value, field)
    if value > MAX_UNIT_RATE:
        raise ValueError(f"{field} exceeds numeric(20,4)")
    if value != value.quantize(UNIT_RATE_QUANTUM, rounding=ROUND_HALF_UP):
        raise ValueError(f"{field} cannot exceed four decimal places")
    return value


def _require_enum(value: object, enum_type: type, field: str) -> None:
    if not isinstance(value, enum_type):
        raise TypeError(f"{field} must be {enum_type.__name__}")


def _require_line_id(value: str, field: str = "line_id") -> None:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string")


@dataclass(frozen=True)
class DiscountInput:
    kind: DiscountKind
    value: Decimal
    basis: DiscountBasis

    def __post_init__(self) -> None:
        _require_enum(self.kind, DiscountKind, "discount.kind")
        _require_enum(self.basis, DiscountBasis, "discount.basis")
        value = _require_non_negative(self.value, "discount.value")
        if self.kind is DiscountKind.NONE and value != ZERO:
            raise ValueError("NONE discount value must be zero")
        if self.kind is DiscountKind.PERCENT and value > Decimal("100"):
            raise ValueError("percentage discount cannot exceed 100")
        if self.kind is DiscountKind.PERCENT:
            _require_rate(value, "discount.value")
        if self.kind is DiscountKind.AMOUNT:
            _require_money(value, "discount.value")


@dataclass(frozen=True)
class ProductLineInput:
    line_id: str
    billed_quantity: Decimal
    free_quantity: Decimal
    uom_conversion_factor: Decimal
    base_billed_quantity: Decimal
    base_free_quantity: Decimal
    quoted_unit_rate: Decimal
    price_basis: PriceBasis
    line_discount: DiscountInput
    gst_rate: Decimal
    cess_rate: Decimal
    taxability_snapshot: TaxabilitySnapshot
    tax_charge_mechanism: TaxChargeMechanism
    free_supply_tax_treatment: FreeSupplyTaxTreatment
    document_discount_eligible: bool

    def __post_init__(self) -> None:
        _require_line_id(self.line_id)
        billed = _require_quantity(self.billed_quantity, "billed_quantity")
        free = _require_quantity(self.free_quantity, "free_quantity")
        if billed + free <= ZERO:
            raise ValueError("billed_quantity + free_quantity must be greater than zero")
        factor = _require_quantity(
            self.uom_conversion_factor, "uom_conversion_factor", positive=True
        )
        base_billed = _require_quantity(self.base_billed_quantity, "base_billed_quantity")
        base_free = _require_quantity(self.base_free_quantity, "base_free_quantity")
        with localcontext() as context:
            context.prec = 64
            expected_billed = (billed * factor).quantize(
                QUANTITY_QUANTUM, rounding=ROUND_HALF_UP
            )
            expected_free = (free * factor).quantize(
                QUANTITY_QUANTUM, rounding=ROUND_HALF_UP
            )
        if base_billed != expected_billed:
            raise ValueError("base_billed_quantity must equal billed_quantity * uom_conversion_factor")
        if base_free != expected_free:
            raise ValueError("base_free_quantity must equal free_quantity * uom_conversion_factor")
        _require_unit_rate(self.quoted_unit_rate, "quoted_unit_rate")
        _require_enum(self.price_basis, PriceBasis, "price_basis")
        if not isinstance(self.line_discount, DiscountInput):
            raise TypeError("line_discount must be DiscountInput")
        _require_rate(self.gst_rate, "gst_rate")
        _require_rate(self.cess_rate, "cess_rate")
        _require_enum(self.taxability_snapshot, TaxabilitySnapshot, "taxability_snapshot")
        _require_enum(
            self.tax_charge_mechanism, TaxChargeMechanism, "tax_charge_mechanism"
        )
        if self.taxability_snapshot not in (
            TaxabilitySnapshot.TAXABLE,
            TaxabilitySnapshot.ZERO_RATED,
        ) and (
            self.gst_rate != ZERO or self.cess_rate != ZERO
        ):
            raise ValueError("non-taxable taxability snapshots must have zero GST and cess rates")
        _require_enum(
            self.free_supply_tax_treatment,
            FreeSupplyTaxTreatment,
            "free_supply_tax_treatment",
        )
        if not isinstance(self.document_discount_eligible, bool):
            raise TypeError("document_discount_eligible must be bool")


@dataclass(frozen=True)
class ChargeLineInput:
    line_id: str
    charge_code: str
    quoted_amount: Decimal
    price_basis: PriceBasis
    taxability_snapshot: TaxabilitySnapshot
    tax_charge_mechanism: TaxChargeMechanism
    gst_rate: Decimal
    cess_rate: Decimal
    document_discount_eligible: bool

    def __post_init__(self) -> None:
        _require_line_id(self.line_id)
        _require_line_id(self.charge_code, "charge_code")
        _require_money(self.quoted_amount, "quoted_amount")
        _require_enum(self.price_basis, PriceBasis, "price_basis")
        _require_enum(self.taxability_snapshot, TaxabilitySnapshot, "taxability_snapshot")
        _require_enum(
            self.tax_charge_mechanism, TaxChargeMechanism, "tax_charge_mechanism"
        )
        gst_rate = _require_rate(self.gst_rate, "gst_rate")
        cess_rate = _require_rate(self.cess_rate, "cess_rate")
        if self.taxability_snapshot not in (
            TaxabilitySnapshot.TAXABLE,
            TaxabilitySnapshot.ZERO_RATED,
        ) and (
            gst_rate != ZERO or cess_rate != ZERO
        ):
            raise ValueError("non-taxable taxability snapshots must have zero GST and cess rates")
        if not isinstance(self.document_discount_eligible, bool):
            raise TypeError("document_discount_eligible must be bool")


@dataclass(frozen=True)
class DocumentInput:
    products: Tuple[ProductLineInput, ...]
    charges: Tuple[ChargeLineInput, ...]
    gst_type: GstType
    zero_rated_mode: ZeroRatedMode
    rounding_policy: RoundingPolicy
    tax_charge_mechanism: TaxChargeMechanism
    document_discount: DiscountInput
    gst_tax_treatment: GstTaxTreatment = GstTaxTreatment.STATUTORY

    def __post_init__(self) -> None:
        if not isinstance(self.products, tuple) or not all(
            isinstance(line, ProductLineInput) for line in self.products
        ):
            raise TypeError("products must be a tuple of ProductLineInput")
        if not isinstance(self.charges, tuple) or not all(
            isinstance(line, ChargeLineInput) for line in self.charges
        ):
            raise TypeError("charges must be a tuple of ChargeLineInput")
        if not self.products and not self.charges:
            raise ValueError("document must contain at least one product or charge")
        _require_enum(self.gst_type, GstType, "gst_type")
        _require_enum(self.zero_rated_mode, ZeroRatedMode, "zero_rated_mode")
        _require_enum(self.rounding_policy, RoundingPolicy, "rounding_policy")
        _require_enum(
            self.tax_charge_mechanism, TaxChargeMechanism, "tax_charge_mechanism"
        )
        _require_enum(self.gst_tax_treatment, GstTaxTreatment, "gst_tax_treatment")
        if not isinstance(self.document_discount, DiscountInput):
            raise TypeError("document_discount must be DiscountInput")
        line_ids = [line.line_id for line in self.products + self.charges]
        if len(line_ids) != len(set(line_ids)):
            raise ValueError("line_id must be unique within a document")
        lines = self.products + self.charges
        if any(
            line.tax_charge_mechanism is not self.tax_charge_mechanism for line in lines
        ):
            raise ValueError("every line tax_charge_mechanism must match the document")
        if self.tax_charge_mechanism is TaxChargeMechanism.REVERSE_CHARGE:
            if any(line.taxability_snapshot is not TaxabilitySnapshot.TAXABLE for line in lines):
                raise ValueError("reverse-charge documents support taxable lines only")
            if any(line.price_basis is not PriceBasis.TAX_EXCLUSIVE for line in lines):
                raise ValueError("reverse-charge quoted prices must be tax-exclusive")
            if any(
                isinstance(line, ProductLineInput)
                and line.line_discount.basis is not DiscountBasis.PRE_TAX_VALUE
                for line in lines
            ) or self.document_discount.basis is not DiscountBasis.PRE_TAX_VALUE:
                raise ValueError("reverse-charge discounts must use the pre-tax basis")
        has_zero_rated = any(
            line.taxability_snapshot is TaxabilitySnapshot.ZERO_RATED for line in lines
        )
        if has_zero_rated and self.zero_rated_mode is ZeroRatedMode.NOT_APPLICABLE:
            raise ValueError("zero-rated lines require an explicit zero_rated_mode")
        if not has_zero_rated and self.zero_rated_mode is not ZeroRatedMode.NOT_APPLICABLE:
            raise ValueError("non-zero-rated documents require zero_rated_mode=not_applicable")
        if has_zero_rated:
            if any(
                line.taxability_snapshot is not TaxabilitySnapshot.ZERO_RATED
                for line in lines
            ):
                raise ValueError("zero-rated and non-zero-rated lines cannot share a document")
            if self.gst_type is not GstType.INTER_STATE:
                raise ValueError("zero-rated export/SEZ documents must use IGST treatment")
            if self.zero_rated_mode is ZeroRatedMode.WITHOUT_PAYMENT and any(
                line.gst_rate != ZERO or line.cess_rate != ZERO for line in lines
            ):
                raise ValueError("zero-rated supplies without payment must have zero tax rates")
            if self.zero_rated_mode is ZeroRatedMode.WITH_IGST and any(
                line.gst_rate <= ZERO or line.cess_rate != ZERO for line in lines
            ):
                raise ValueError("zero-rated supplies with IGST require positive GST and zero cess")


@dataclass(frozen=True)
class TaxAmounts:
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    cess_amount: Decimal
    total_tax_amount: Decimal

    def __post_init__(self) -> None:
        for field in (
            "cgst_amount", "sgst_amount", "igst_amount", "cess_amount", "total_tax_amount"
        ):
            _require_money(getattr(self, field), field)
        if self.total_tax_amount != (
            self.cgst_amount + self.sgst_amount + self.igst_amount + self.cess_amount
        ):
            raise ValueError("total_tax_amount must equal its tax components")


@dataclass(frozen=True)
class ProductLineResult:
    line_id: str
    billed_quantity: Decimal
    free_quantity: Decimal
    uom_conversion_factor: Decimal
    base_billed_quantity: Decimal
    base_free_quantity: Decimal
    quoted_unit_rate: Decimal
    price_basis: PriceBasis
    free_supply_tax_treatment: FreeSupplyTaxTreatment
    gst_rate: Decimal
    cess_rate: Decimal
    taxability_snapshot: TaxabilitySnapshot
    tax_charge_mechanism: TaxChargeMechanism
    gross_price_amount: Decimal
    line_discount_amount: Decimal
    line_pre_tax_discount_amount: Decimal
    document_discount_amount: Decimal
    document_pre_tax_discount_amount: Decimal
    net_value_amount: Decimal
    gst_taxable_value: Decimal
    tax: TaxAmounts
    recipient_assessed_tax_amount: Decimal
    line_total: Decimal

    def __post_init__(self) -> None:
        for field in (
            "gross_price_amount", "line_discount_amount",
            "line_pre_tax_discount_amount", "document_discount_amount",
            "document_pre_tax_discount_amount", "net_value_amount",
            "gst_taxable_value", "recipient_assessed_tax_amount", "line_total",
        ):
            _require_money(getattr(self, field), field)


@dataclass(frozen=True)
class ChargeLineResult:
    line_id: str
    charge_code: str
    quoted_amount: Decimal
    price_basis: PriceBasis
    taxability_snapshot: TaxabilitySnapshot
    tax_charge_mechanism: TaxChargeMechanism
    gst_rate: Decimal
    cess_rate: Decimal
    gross_price_amount: Decimal
    document_discount_amount: Decimal
    document_pre_tax_discount_amount: Decimal
    net_value_amount: Decimal
    gst_taxable_value: Decimal
    tax: TaxAmounts
    recipient_assessed_tax_amount: Decimal
    line_total: Decimal

    def __post_init__(self) -> None:
        for field in (
            "gross_price_amount", "document_discount_amount",
            "document_pre_tax_discount_amount", "net_value_amount",
            "gst_taxable_value", "recipient_assessed_tax_amount", "line_total",
        ):
            _require_money(getattr(self, field), field)


@dataclass(frozen=True)
class DocumentResult:
    gst_type: GstType
    zero_rated_mode: ZeroRatedMode
    rounding_policy: RoundingPolicy
    tax_charge_mechanism: TaxChargeMechanism
    products: Tuple[ProductLineResult, ...]
    charges: Tuple[ChargeLineResult, ...]
    gross_price_amount: Decimal
    line_discount_amount: Decimal
    document_discount_amount: Decimal
    net_value_amount: Decimal
    gst_taxable_value: Decimal
    tax: TaxAmounts
    recipient_assessed_tax_total: Decimal
    pre_round_total: Decimal
    rounding_adjustment: Decimal
    grand_total: Decimal
    gst_tax_treatment: GstTaxTreatment

    def __post_init__(self) -> None:
        for field in (
            "gross_price_amount", "line_discount_amount", "document_discount_amount",
            "net_value_amount", "gst_taxable_value", "recipient_assessed_tax_total",
            "pre_round_total", "grand_total",
        ):
            _require_money(getattr(self, field), field)
        _require_signed_money(self.rounding_adjustment, "rounding_adjustment")
        _require_enum(self.gst_tax_treatment, GstTaxTreatment, "gst_tax_treatment")


@dataclass(frozen=True)
class ProductReversalInput:
    line_id: str
    reversed_billed_quantity: Decimal
    reversed_free_quantity: Decimal
    reversed_base_billed_quantity: Decimal
    reversed_base_free_quantity: Decimal
    value_basis: ReversalValueBasis
    final_residual: bool

    def __post_init__(self) -> None:
        _require_line_id(self.line_id)
        billed = _require_quantity(
            self.reversed_billed_quantity, "reversed_billed_quantity"
        )
        free = _require_quantity(
            self.reversed_free_quantity, "reversed_free_quantity"
        )
        base_billed = _require_quantity(
            self.reversed_base_billed_quantity, "reversed_base_billed_quantity"
        )
        base_free = _require_quantity(
            self.reversed_base_free_quantity, "reversed_base_free_quantity"
        )
        if billed + free + base_billed + base_free <= ZERO:
            raise ValueError("a product reversal must reverse a positive quantity")
        _require_enum(self.value_basis, ReversalValueBasis, "value_basis")
        if not isinstance(self.final_residual, bool):
            raise TypeError("final_residual must be bool")


@dataclass(frozen=True)
class ChargeReversalInput:
    line_id: str
    ratio: Decimal
    final_residual: bool

    def __post_init__(self) -> None:
        _require_line_id(self.line_id)
        ratio = _require_non_negative(self.ratio, "ratio")
        if ratio > Decimal("1"):
            raise ValueError("charge reversal ratio cannot exceed 1")
        if not isinstance(self.final_residual, bool):
            raise TypeError("final_residual must be bool")


@dataclass(frozen=True)
class PriorProductReversalTotals:
    line_id: str
    value_basis: ReversalValueBasis
    reversed_billed_quantity: Decimal
    reversed_free_quantity: Decimal
    reversed_base_billed_quantity: Decimal
    reversed_base_free_quantity: Decimal
    gross_price_amount: Decimal
    line_discount_amount: Decimal
    document_discount_amount: Decimal
    net_value_amount: Decimal
    gst_taxable_value: Decimal
    tax: TaxAmounts

    def __post_init__(self) -> None:
        _require_line_id(self.line_id)
        _require_enum(self.value_basis, ReversalValueBasis, "value_basis")
        for field in (
            "reversed_billed_quantity", "reversed_free_quantity",
            "reversed_base_billed_quantity", "reversed_base_free_quantity",
        ):
            _require_quantity(getattr(self, field), field)
        for field in (
            "gross_price_amount", "line_discount_amount",
            "document_discount_amount", "net_value_amount", "gst_taxable_value",
        ):
            _require_money(getattr(self, field), field)
        if not isinstance(self.tax, TaxAmounts):
            raise TypeError("tax must be TaxAmounts")


@dataclass(frozen=True)
class PriorChargeReversalTotals:
    line_id: str
    reversed_ratio: Decimal
    gross_price_amount: Decimal
    document_discount_amount: Decimal
    net_value_amount: Decimal
    gst_taxable_value: Decimal
    tax: TaxAmounts

    def __post_init__(self) -> None:
        _require_line_id(self.line_id)
        ratio = _require_non_negative(self.reversed_ratio, "reversed_ratio")
        if ratio > Decimal("1"):
            raise ValueError("reversed_ratio cannot exceed 1")
        for field in (
            "gross_price_amount", "document_discount_amount",
            "net_value_amount", "gst_taxable_value"
        ):
            _require_money(getattr(self, field), field)
        if not isinstance(self.tax, TaxAmounts):
            raise TypeError("tax must be TaxAmounts")


@dataclass(frozen=True)
class PriorReversalState:
    products: Tuple[PriorProductReversalTotals, ...]
    charges: Tuple[PriorChargeReversalTotals, ...]
    rounding_adjustment: Decimal

    def __post_init__(self) -> None:
        if not isinstance(self.products, tuple) or not all(
            isinstance(line, PriorProductReversalTotals) for line in self.products
        ):
            raise TypeError("products must be a tuple of PriorProductReversalTotals")
        if not isinstance(self.charges, tuple) or not all(
            isinstance(line, PriorChargeReversalTotals) for line in self.charges
        ):
            raise TypeError("charges must be a tuple of PriorChargeReversalTotals")
        ids = [line.line_id for line in self.products + self.charges]
        if len(ids) != len(set(ids)):
            raise ValueError("prior reversal line_id must be unique")
        _require_signed_money(self.rounding_adjustment, "rounding_adjustment")


@dataclass(frozen=True)
class ReversalInput:
    products: Tuple[ProductReversalInput, ...]
    charges: Tuple[ChargeReversalInput, ...]
    prior_state: PriorReversalState
    gst_tax_treatment: GstTaxTreatment = GstTaxTreatment.STATUTORY

    def __post_init__(self) -> None:
        if not isinstance(self.products, tuple) or not all(
            isinstance(line, ProductReversalInput) for line in self.products
        ):
            raise TypeError("products must be a tuple of ProductReversalInput")
        if not isinstance(self.charges, tuple) or not all(
            isinstance(line, ChargeReversalInput) for line in self.charges
        ):
            raise TypeError("charges must be a tuple of ChargeReversalInput")
        if not self.products and not self.charges:
            raise ValueError("reversal must contain at least one product or charge")
        if not isinstance(self.prior_state, PriorReversalState):
            raise TypeError("prior_state must be PriorReversalState")
        _require_enum(self.gst_tax_treatment, GstTaxTreatment, "gst_tax_treatment")
        ids = [line.line_id for line in self.products + self.charges]
        if len(ids) != len(set(ids)):
            raise ValueError("reversal line_id must be unique")


@dataclass(frozen=True)
class ReversedLineResult:
    line_id: str
    ratio: Decimal
    cumulative_ratio: Decimal
    value_basis: Optional[ReversalValueBasis]
    reversed_billed_quantity: Decimal
    reversed_free_quantity: Decimal
    reversed_base_billed_quantity: Decimal
    reversed_base_free_quantity: Decimal
    gross_price_amount: Decimal
    line_discount_amount: Decimal
    document_discount_amount: Decimal
    net_value_amount: Decimal
    gst_taxable_value: Decimal
    tax: TaxAmounts
    recipient_assessed_tax_amount: Decimal
    line_total: Decimal

    def __post_init__(self) -> None:
        for field in (
            "gross_price_amount", "line_discount_amount", "document_discount_amount",
            "net_value_amount", "gst_taxable_value", "recipient_assessed_tax_amount",
            "line_total",
        ):
            _require_money(getattr(self, field), field)


@dataclass(frozen=True)
class ReversalResult:
    gst_type: GstType
    zero_rated_mode: ZeroRatedMode
    rounding_policy: RoundingPolicy
    tax_charge_mechanism: TaxChargeMechanism
    products: Tuple[ReversedLineResult, ...]
    charges: Tuple[ReversedLineResult, ...]
    gross_price_amount: Decimal
    line_discount_amount: Decimal
    document_discount_amount: Decimal
    net_value_amount: Decimal
    gst_taxable_value: Decimal
    tax: TaxAmounts
    recipient_assessed_tax_total: Decimal
    pre_round_total: Decimal
    rounding_adjustment: Decimal
    grand_total: Decimal
    gst_tax_treatment: GstTaxTreatment

    def __post_init__(self) -> None:
        for field in (
            "gross_price_amount", "line_discount_amount", "document_discount_amount",
            "net_value_amount", "gst_taxable_value", "recipient_assessed_tax_total",
            "pre_round_total", "grand_total",
        ):
            _require_money(getattr(self, field), field)
        _require_signed_money(self.rounding_adjustment, "rounding_adjustment")
        _require_enum(self.gst_tax_treatment, GstTaxTreatment, "gst_tax_treatment")
