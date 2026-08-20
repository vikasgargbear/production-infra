"""Canonical INR document arithmetic using Decimal and line-level reconciliation."""

from __future__ import annotations

from dataclasses import dataclass, replace
from decimal import Decimal, ROUND_HALF_UP, localcontext
from functools import wraps
from typing import Dict, Iterable, List, Sequence, Tuple, Union

from .models import (
    ChargeLineInput,
    ChargeLineResult,
    ChargeReversalInput,
    DiscountBasis,
    DiscountInput,
    DiscountKind,
    DocumentInput,
    DocumentResult,
    FreeSupplyTaxTreatment,
    GstTaxTreatment,
    GstType,
    MAX_MONEY,
    PriceBasis,
    PriorChargeReversalTotals,
    PriorProductReversalTotals,
    PriorReversalState,
    ProductLineInput,
    ProductLineResult,
    ProductReversalInput,
    ReversalInput,
    ReversalResult,
    ReversalValueBasis,
    RoundingPolicy,
    ReversedLineResult,
    TaxAmounts,
    TaxChargeMechanism,
    TaxabilitySnapshot,
)


MONEY = Decimal("0.01")
HUNDRED = Decimal("100")
ZERO_MONEY = Decimal("0.00")


class CalculationInvariantError(RuntimeError):
    """Raised only when an internal monetary reconciliation invariant fails."""


def _high_precision(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        with localcontext() as context:
            context.prec = 64
            return function(*args, **kwargs)

    return wrapped


def round_money(value: Decimal) -> Decimal:
    if not isinstance(value, Decimal):
        raise TypeError("monetary values must be Decimal")
    if not value.is_finite():
        raise ValueError("monetary values must be finite")
    if abs(value) > MAX_MONEY:
        raise ValueError("monetary value exceeds numeric(20,2)")
    with localcontext() as context:
        context.prec = 64
        rounded = value.quantize(MONEY, rounding=ROUND_HALF_UP)
    return ZERO_MONEY if rounded == 0 else rounded


def money_string(value: Decimal) -> str:
    return format(round_money(value), ".2f")


@dataclass(frozen=True)
class _Amounts:
    net_value: Decimal
    gst_taxable_value: Decimal
    tax: TaxAmounts
    payable: Decimal


@dataclass(frozen=True)
class _WorkingLine:
    source: Union[ProductLineInput, ChargeLineInput]
    gross_price: Decimal
    line_discount: Decimal
    line_pre_tax_discount: Decimal
    document_discount: Decimal
    document_pre_tax_discount: Decimal
    amounts: _Amounts


def _tax_from_base(
    base: Decimal,
    gst_rate: Decimal,
    cess_rate: Decimal,
    gst_type: GstType,
    denominator: Decimal = HUNDRED,
) -> TaxAmounts:
    cess = round_money(base * cess_rate / denominator)
    if gst_type is GstType.INTER_STATE:
        cgst = ZERO_MONEY
        sgst = ZERO_MONEY
        igst = round_money(base * gst_rate / denominator)
    else:
        cgst = round_money(base * gst_rate / Decimal("2") / denominator)
        sgst = cgst
        igst = ZERO_MONEY
    return TaxAmounts(
        cgst_amount=cgst,
        sgst_amount=sgst,
        igst_amount=igst,
        cess_amount=cess,
        total_tax_amount=cgst + sgst + igst + cess,
    )


def _from_pre_tax(
    net_value: Decimal,
    gst_rate: Decimal,
    cess_rate: Decimal,
    gst_type: GstType,
    taxability: TaxabilitySnapshot,
) -> _Amounts:
    net_value = round_money(net_value)
    gst_taxable = (
        net_value
        if taxability in (TaxabilitySnapshot.TAXABLE, TaxabilitySnapshot.ZERO_RATED)
        else ZERO_MONEY
    )
    tax = _tax_from_base(gst_taxable, gst_rate, cess_rate, gst_type)
    return _Amounts(
        net_value,
        gst_taxable,
        tax,
        round_money(net_value + tax.total_tax_amount),
    )


def _from_inclusive(
    payable: Decimal,
    gst_rate: Decimal,
    cess_rate: Decimal,
    gst_type: GstType,
    taxability: TaxabilitySnapshot,
) -> _Amounts:
    payable = round_money(payable)
    total_rate = gst_rate + cess_rate
    if total_rate == 0:
        return _from_pre_tax(payable, gst_rate, cess_rate, gst_type, taxability)
    denominator = HUNDRED + total_rate
    tax = _tax_from_base(payable, gst_rate, cess_rate, gst_type, denominator)
    net_value = payable - tax.total_tax_amount
    return _Amounts(net_value, net_value, tax, payable)


def _from_price(
    price: Decimal,
    price_mode: PriceBasis,
    gst_rate: Decimal,
    cess_rate: Decimal,
    gst_type: GstType,
    taxability: TaxabilitySnapshot,
) -> _Amounts:
    if price_mode is PriceBasis.TAX_INCLUSIVE:
        return _from_inclusive(price, gst_rate, cess_rate, gst_type, taxability)
    return _from_pre_tax(price, gst_rate, cess_rate, gst_type, taxability)


def _discount_amount(discount: DiscountInput, basis_amount: Decimal) -> Decimal:
    basis_amount = round_money(basis_amount)
    if discount.kind is DiscountKind.NONE:
        return ZERO_MONEY
    if discount.kind is DiscountKind.PERCENT:
        return round_money(basis_amount * discount.value / HUNDRED)
    amount = round_money(discount.value)
    if amount > basis_amount:
        raise ValueError("discount amount cannot exceed its eligible basis")
    return amount


def _calculate_product(line: ProductLineInput, gst_type: GstType) -> _WorkingLine:
    priced_quantity = line.billed_quantity
    if line.free_supply_tax_treatment is FreeSupplyTaxTreatment.INCLUDE_AT_UNIT_PRICE:
        priced_quantity += line.free_quantity
    gross_price = round_money(priced_quantity * line.quoted_unit_rate)
    gross = _from_price(
        gross_price,
        line.price_basis,
        line.gst_rate,
        line.cess_rate,
        gst_type,
        line.taxability_snapshot,
    )

    discount_basis = (
        gross.net_value
        if line.line_discount.basis is DiscountBasis.PRE_TAX_VALUE
        else gross.payable
    )
    line_discount = _discount_amount(line.line_discount, discount_basis)
    if line_discount == 0:
        amounts = gross
    elif line.line_discount.basis is DiscountBasis.PRE_TAX_VALUE:
        amounts = _from_pre_tax(
            gross.net_value - line_discount,
            line.gst_rate,
            line.cess_rate,
            gst_type,
            line.taxability_snapshot,
        )
    else:
        amounts = _from_inclusive(
            gross.payable - line_discount,
            line.gst_rate,
            line.cess_rate,
            gst_type,
            line.taxability_snapshot,
        )
    return _WorkingLine(
        source=line,
        gross_price=gross_price,
        line_discount=line_discount,
        line_pre_tax_discount=gross.net_value - amounts.net_value,
        document_discount=ZERO_MONEY,
        document_pre_tax_discount=ZERO_MONEY,
        amounts=amounts,
    )


def _calculate_charge(line: ChargeLineInput, gst_type: GstType) -> _WorkingLine:
    gross_price = round_money(line.quoted_amount)
    amounts = _from_price(
        gross_price,
        line.price_basis,
        line.gst_rate,
        line.cess_rate,
        gst_type,
        line.taxability_snapshot,
    )
    return _WorkingLine(
        source=line,
        gross_price=gross_price,
        line_discount=ZERO_MONEY,
        line_pre_tax_discount=ZERO_MONEY,
        document_discount=ZERO_MONEY,
        document_pre_tax_discount=ZERO_MONEY,
        amounts=amounts,
    )


def _calculate_commercial_credit_lines(document: DocumentInput) -> List[_WorkingLine]:
    """Treat quoted prices as gross financial-credit bases without GST adjustment."""
    working: List[_WorkingLine] = []
    for line in document.products:
        priced_quantity = line.billed_quantity
        if line.free_supply_tax_treatment is FreeSupplyTaxTreatment.INCLUDE_AT_UNIT_PRICE:
            priced_quantity += line.free_quantity
        gross_price = round_money(priced_quantity * line.quoted_unit_rate)
        line_discount = _discount_amount(line.line_discount, gross_price)
        net_value = gross_price - line_discount
        working.append(_WorkingLine(
            source=line,
            gross_price=gross_price,
            line_discount=line_discount,
            line_pre_tax_discount=line_discount,
            document_discount=ZERO_MONEY,
            document_pre_tax_discount=ZERO_MONEY,
            amounts=_from_pre_tax(net_value, Decimal("0"), Decimal("0"), document.gst_type, TaxabilitySnapshot.NON_GST),
        ))
    for line in document.charges:
        gross_price = round_money(line.quoted_amount)
        working.append(_WorkingLine(
            source=line,
            gross_price=gross_price,
            line_discount=ZERO_MONEY,
            line_pre_tax_discount=ZERO_MONEY,
            document_discount=ZERO_MONEY,
            document_pre_tax_discount=ZERO_MONEY,
            amounts=_from_pre_tax(gross_price, Decimal("0"), Decimal("0"), document.gst_type, TaxabilitySnapshot.NON_GST),
        ))

    eligible = [
        (index, item.amounts.net_value)
        for index, item in enumerate(working)
        if item.source.document_discount_eligible
    ]
    pool = sum((basis for _, basis in eligible), ZERO_MONEY)
    total_discount = _discount_amount(document.document_discount, pool)
    allocations = _allocate_exact(total_discount, eligible)
    return [
        replace(
            item,
            document_discount=allocations.get(index, ZERO_MONEY),
            document_pre_tax_discount=allocations.get(index, ZERO_MONEY),
            amounts=_from_pre_tax(
                item.amounts.net_value - allocations.get(index, ZERO_MONEY),
                Decimal("0"), Decimal("0"), document.gst_type, TaxabilitySnapshot.NON_GST,
            ),
        )
        for index, item in enumerate(working)
    ]
def _allocate_exact(
    amount: Decimal, indexed_bases: Sequence[Tuple[int, Decimal]]
) -> Dict[int, Decimal]:
    """Allocate paise proportionally, preserving HALF_UP shares and exact residual."""
    amount = round_money(amount)
    allocations = {index: ZERO_MONEY for index, _ in indexed_bases}
    if amount == 0:
        return allocations
    total_basis = sum((basis for _, basis in indexed_bases), ZERO_MONEY)
    if total_basis <= 0:
        raise ValueError("a positive discount requires a positive eligible basis")
    if amount > total_basis:
        raise ValueError("document discount cannot exceed its eligible basis")

    raw = {index: amount * basis / total_basis for index, basis in indexed_bases}
    bases = {index: round_money(basis) for index, basis in indexed_bases}
    for index, _ in indexed_bases:
        allocations[index] = min(round_money(raw[index]), bases[index])

    residual = round_money(amount - sum(allocations.values(), ZERO_MONEY))
    step = MONEY if residual > 0 else -MONEY
    while residual != 0:
        if step > 0:
            candidates = [index for index, _ in indexed_bases if allocations[index] < bases[index]]
            candidates.sort(key=lambda index: (raw[index] - allocations[index], -index), reverse=True)
        else:
            candidates = [index for index, _ in indexed_bases if allocations[index] > 0]
            candidates.sort(key=lambda index: (allocations[index] - raw[index], -index), reverse=True)
        if not candidates:
            raise CalculationInvariantError("discount residual could not be allocated")
        for index in candidates:
            if residual == 0:
                break
            allocations[index] += step
            residual -= step
    return allocations


def _apply_document_discount(
    lines: Sequence[_WorkingLine], discount: DiscountInput, gst_type: GstType
) -> List[_WorkingLine]:
    eligible = [
        (
            index,
            line.amounts.net_value
            if discount.basis is DiscountBasis.PRE_TAX_VALUE
            else line.amounts.payable,
        )
        for index, line in enumerate(lines)
        if line.source.document_discount_eligible
    ]
    pool = sum((basis for _, basis in eligible), ZERO_MONEY)
    if discount.kind is not DiscountKind.NONE and discount.value > 0 and pool <= 0:
        raise ValueError("a positive document discount requires a positive eligible basis")
    total_discount = _discount_amount(discount, pool)
    allocations = _allocate_exact(total_discount, eligible)

    adjusted: List[_WorkingLine] = []
    for index, line in enumerate(lines):
        allocated = allocations.get(index, ZERO_MONEY)
        source = line.source
        gst_rate = source.gst_rate
        cess_rate = source.cess_rate
        taxability = source.taxability_snapshot
        if allocated == 0:
            amounts = line.amounts
        elif discount.basis is DiscountBasis.PRE_TAX_VALUE:
            amounts = _from_pre_tax(
                line.amounts.net_value - allocated,
                gst_rate,
                cess_rate,
                gst_type,
                taxability,
            )
        else:
            amounts = _from_inclusive(
                line.amounts.payable - allocated,
                gst_rate,
                cess_rate,
                gst_type,
                taxability,
            )
        adjusted.append(
            replace(
                line,
                document_discount=allocated,
                document_pre_tax_discount=line.amounts.net_value - amounts.net_value,
                amounts=amounts,
            )
        )
    return adjusted


def _sum_tax(lines: Iterable[Union[ProductLineResult, ChargeLineResult, ReversedLineResult]]) -> TaxAmounts:
    lines = tuple(lines)
    return TaxAmounts(
        cgst_amount=sum((line.tax.cgst_amount for line in lines), ZERO_MONEY),
        sgst_amount=sum((line.tax.sgst_amount for line in lines), ZERO_MONEY),
        igst_amount=sum((line.tax.igst_amount for line in lines), ZERO_MONEY),
        cess_amount=sum((line.tax.cess_amount for line in lines), ZERO_MONEY),
        total_tax_amount=sum((line.tax.total_tax_amount for line in lines), ZERO_MONEY),
    )


def _assert_tax(tax: TaxAmounts) -> None:
    if tax.total_tax_amount != (
        tax.cgst_amount + tax.sgst_amount + tax.igst_amount + tax.cess_amount
    ):
        raise CalculationInvariantError("tax components do not reconcile")


@_high_precision
def calculate_document(document: DocumentInput) -> DocumentResult:
    """Calculate a complete product/charge document without I/O or mutation."""
    if not isinstance(document, DocumentInput):
        raise TypeError("document must be DocumentInput")
    if document.gst_tax_treatment is GstTaxTreatment.COMMERCIAL_ONLY:
        working = _calculate_commercial_credit_lines(document)
    else:
        working = [_calculate_product(line, document.gst_type) for line in document.products]
        working.extend(_calculate_charge(line, document.gst_type) for line in document.charges)
        working = _apply_document_discount(working, document.document_discount, document.gst_type)

    product_count = len(document.products)
    products = tuple(
        ProductLineResult(
            line_id=line.source.line_id,
            billed_quantity=line.source.billed_quantity,
            free_quantity=line.source.free_quantity,
            uom_conversion_factor=line.source.uom_conversion_factor,
            base_billed_quantity=line.source.base_billed_quantity,
            base_free_quantity=line.source.base_free_quantity,
            quoted_unit_rate=line.source.quoted_unit_rate,
            price_basis=line.source.price_basis,
            free_supply_tax_treatment=line.source.free_supply_tax_treatment,
            gst_rate=line.source.gst_rate,
            cess_rate=line.source.cess_rate,
            taxability_snapshot=line.source.taxability_snapshot,
            tax_charge_mechanism=line.source.tax_charge_mechanism,
            gross_price_amount=line.gross_price,
            line_discount_amount=line.line_discount,
            line_pre_tax_discount_amount=line.line_pre_tax_discount,
            document_discount_amount=line.document_discount,
            document_pre_tax_discount_amount=line.document_pre_tax_discount,
            net_value_amount=line.amounts.net_value,
            gst_taxable_value=line.amounts.gst_taxable_value,
            tax=line.amounts.tax,
            recipient_assessed_tax_amount=(
                line.amounts.tax.total_tax_amount
                if document.tax_charge_mechanism is TaxChargeMechanism.REVERSE_CHARGE
                else ZERO_MONEY
            ),
            line_total=(
                line.amounts.net_value
                if document.tax_charge_mechanism is TaxChargeMechanism.REVERSE_CHARGE
                else line.amounts.payable
            ),
        )
        for line in working[:product_count]
        if isinstance(line.source, ProductLineInput)
    )
    charges = tuple(
        ChargeLineResult(
            line_id=line.source.line_id,
            charge_code=line.source.charge_code,
            quoted_amount=line.source.quoted_amount,
            price_basis=line.source.price_basis,
            taxability_snapshot=line.source.taxability_snapshot,
            gst_rate=line.source.gst_rate,
            cess_rate=line.source.cess_rate,
            tax_charge_mechanism=line.source.tax_charge_mechanism,
            gross_price_amount=line.gross_price,
            document_discount_amount=line.document_discount,
            document_pre_tax_discount_amount=line.document_pre_tax_discount,
            net_value_amount=line.amounts.net_value,
            gst_taxable_value=line.amounts.gst_taxable_value,
            tax=line.amounts.tax,
            recipient_assessed_tax_amount=(
                line.amounts.tax.total_tax_amount
                if document.tax_charge_mechanism is TaxChargeMechanism.REVERSE_CHARGE
                else ZERO_MONEY
            ),
            line_total=(
                line.amounts.net_value
                if document.tax_charge_mechanism is TaxChargeMechanism.REVERSE_CHARGE
                else line.amounts.payable
            ),
        )
        for line in working[product_count:]
        if isinstance(line.source, ChargeLineInput)
    )
    all_lines = products + charges
    tax = _sum_tax(all_lines)
    pre_round_total = sum((line.line_total for line in all_lines), ZERO_MONEY)
    if document.rounding_policy is RoundingPolicy.NEAREST_RUPEE:
        grand_total = pre_round_total.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        rounding_adjustment = round_money(grand_total - pre_round_total)
    else:
        rounding_adjustment = ZERO_MONEY
        grand_total = pre_round_total
    result = DocumentResult(
        gst_type=document.gst_type,
        zero_rated_mode=document.zero_rated_mode,
        rounding_policy=document.rounding_policy,
        tax_charge_mechanism=document.tax_charge_mechanism,
        products=products,
        charges=charges,
        gross_price_amount=sum((line.gross_price_amount for line in all_lines), ZERO_MONEY),
        line_discount_amount=sum((line.line_discount_amount for line in products), ZERO_MONEY),
        document_discount_amount=sum(
            (line.document_discount_amount for line in all_lines), ZERO_MONEY
        ),
        net_value_amount=sum((line.net_value_amount for line in all_lines), ZERO_MONEY),
        gst_taxable_value=sum((line.gst_taxable_value for line in all_lines), ZERO_MONEY),
        tax=tax,
        recipient_assessed_tax_total=sum(
            (line.recipient_assessed_tax_amount for line in all_lines), ZERO_MONEY
        ),
        pre_round_total=pre_round_total,
        rounding_adjustment=rounding_adjustment,
        grand_total=grand_total,
        gst_tax_treatment=document.gst_tax_treatment,
    )
    assert_document_reconciles(result)
    return result


def assert_document_reconciles(result: DocumentResult) -> None:
    lines = result.products + result.charges
    _assert_tax(result.tax)
    if result.tax != _sum_tax(lines):
        raise CalculationInvariantError("header tax does not equal line tax")
    if result.gst_type is GstType.INTRA_STATE and (
        result.tax.cgst_amount != result.tax.sgst_amount
        or result.tax.igst_amount != ZERO_MONEY
    ):
        raise CalculationInvariantError("intra-state tax components are inconsistent")
    if result.gst_type is GstType.INTER_STATE and (
        result.tax.cgst_amount != ZERO_MONEY or result.tax.sgst_amount != ZERO_MONEY
    ):
        raise CalculationInvariantError("inter-state tax components are inconsistent")
    if result.net_value_amount != sum((line.net_value_amount for line in lines), ZERO_MONEY):
        raise CalculationInvariantError("header net value does not equal line net values")
    if result.gst_taxable_value != sum((line.gst_taxable_value for line in lines), ZERO_MONEY):
        raise CalculationInvariantError("header GST taxable value does not equal line values")
    expected_recipient_assessed = (
        result.tax.total_tax_amount
        if result.tax_charge_mechanism is TaxChargeMechanism.REVERSE_CHARGE
        else ZERO_MONEY
    )
    if result.recipient_assessed_tax_total != expected_recipient_assessed:
        raise CalculationInvariantError("recipient-assessed tax total does not match charge mechanism")
    expected_pre_round = result.net_value_amount + result.tax.total_tax_amount
    if result.tax_charge_mechanism is TaxChargeMechanism.REVERSE_CHARGE:
        expected_pre_round = result.net_value_amount
    if result.pre_round_total != expected_pre_round:
        raise CalculationInvariantError("pre-round total does not match payable components")
    if result.pre_round_total != sum((line.line_total for line in lines), ZERO_MONEY):
        raise CalculationInvariantError("pre-round total does not equal line totals")
    if result.grand_total != result.pre_round_total + result.rounding_adjustment:
        raise CalculationInvariantError("grand total does not reconcile with rounding")
    if result.rounding_policy is RoundingPolicy.NONE and result.rounding_adjustment != 0:
        raise CalculationInvariantError("rounding adjustment must be zero when policy is none")
    for line in lines:
        _assert_tax(line.tax)
        if line.recipient_assessed_tax_amount != (
            line.tax.total_tax_amount
            if line.tax_charge_mechanism is TaxChargeMechanism.REVERSE_CHARGE
            else ZERO_MONEY
        ):
            raise CalculationInvariantError(f"line {line.line_id} recipient-assessed tax is inconsistent")
        expected_line_total = line.net_value_amount + line.tax.total_tax_amount
        if line.tax_charge_mechanism is TaxChargeMechanism.REVERSE_CHARGE:
            expected_line_total = line.net_value_amount
        if line.line_total != expected_line_total:
            raise CalculationInvariantError(f"line {line.line_id} does not reconcile")


def _component_delta(original: Decimal, prior: Decimal, cumulative_ratio: Decimal) -> Decimal:
    if prior > original:
        raise ValueError("prior reversed amount exceeds original amount")
    cumulative_target = round_money(original * cumulative_ratio)
    if cumulative_target < prior:
        raise ValueError("prior reversed amount exceeds the cumulative proportional target")
    return cumulative_target - prior


def _tax_delta(original: TaxAmounts, prior: TaxAmounts, cumulative_ratio: Decimal) -> TaxAmounts:
    cgst = _component_delta(original.cgst_amount, prior.cgst_amount, cumulative_ratio)
    sgst = _component_delta(original.sgst_amount, prior.sgst_amount, cumulative_ratio)
    igst = _component_delta(original.igst_amount, prior.igst_amount, cumulative_ratio)
    cess = _component_delta(original.cess_amount, prior.cess_amount, cumulative_ratio)
    return TaxAmounts(cgst, sgst, igst, cess, cgst + sgst + igst + cess)


def _zero_tax() -> TaxAmounts:
    return TaxAmounts(ZERO_MONEY, ZERO_MONEY, ZERO_MONEY, ZERO_MONEY, ZERO_MONEY)


def _reverse_product_line(
    source: ProductLineResult,
    item: ProductReversalInput,
    prior: PriorProductReversalTotals,
    gst_tax_treatment: GstTaxTreatment,
) -> ReversedLineResult:
    if prior.value_basis is not item.value_basis:
        raise ValueError("reversal value basis must match prior reversals for the line")
    factor = source.uom_conversion_factor
    expected_prior_base_billed = (prior.reversed_billed_quantity * factor).quantize(
        Decimal("0.000001"), rounding=ROUND_HALF_UP
    )
    expected_prior_base_free = (prior.reversed_free_quantity * factor).quantize(
        Decimal("0.000001"), rounding=ROUND_HALF_UP
    )
    if prior.reversed_base_billed_quantity != expected_prior_base_billed:
        raise ValueError("prior base billed quantity contradicts the UOM conversion factor")
    if prior.reversed_base_free_quantity != expected_prior_base_free:
        raise ValueError("prior base free quantity contradicts the UOM conversion factor")
    expected_base_billed = (item.reversed_billed_quantity * factor).quantize(
        Decimal("0.000001"), rounding=ROUND_HALF_UP
    )
    expected_base_free = (item.reversed_free_quantity * factor).quantize(
        Decimal("0.000001"), rounding=ROUND_HALF_UP
    )
    if item.reversed_base_billed_quantity != expected_base_billed:
        raise ValueError("reversed_base_billed_quantity contradicts the UOM conversion factor")
    if item.reversed_base_free_quantity != expected_base_free:
        raise ValueError("reversed_base_free_quantity contradicts the UOM conversion factor")

    cumulative_billed = prior.reversed_billed_quantity + item.reversed_billed_quantity
    cumulative_free = prior.reversed_free_quantity + item.reversed_free_quantity
    cumulative_base_billed = (
        prior.reversed_base_billed_quantity + item.reversed_base_billed_quantity
    )
    cumulative_base_free = prior.reversed_base_free_quantity + item.reversed_base_free_quantity
    if cumulative_billed > source.billed_quantity:
        raise ValueError("cumulative reversed billed quantity exceeds original quantity")
    if cumulative_free > source.free_quantity:
        raise ValueError("cumulative reversed free quantity exceeds original quantity")
    if cumulative_base_billed > source.base_billed_quantity:
        raise ValueError("cumulative reversed base billed quantity exceeds original quantity")
    if cumulative_base_free > source.base_free_quantity:
        raise ValueError("cumulative reversed base free quantity exceeds original quantity")
    if item.final_residual and (
        cumulative_billed != source.billed_quantity
        or cumulative_free != source.free_quantity
        or cumulative_base_billed != source.base_billed_quantity
        or cumulative_base_free != source.base_free_quantity
    ):
        raise ValueError("final residual reversal must consume every remaining line quantity")

    if item.value_basis is ReversalValueBasis.BILLED_QUANTITY:
        if source.billed_quantity == 0:
            raise ValueError("cannot use billed quantity basis for a free-only line")
        prior_ratio = prior.reversed_billed_quantity / source.billed_quantity
        cumulative_ratio = cumulative_billed / source.billed_quantity
    else:
        original_base = source.base_billed_quantity + source.base_free_quantity
        prior_base = prior.reversed_base_billed_quantity + prior.reversed_base_free_quantity
        cumulative_base = cumulative_base_billed + cumulative_base_free
        prior_ratio = prior_base / original_base
        cumulative_ratio = cumulative_base / original_base
    current_ratio = cumulative_ratio - prior_ratio
    if gst_tax_treatment is GstTaxTreatment.COMMERCIAL_ONLY:
        prior_financial = prior.net_value_amount + (
            prior.tax.total_tax_amount
            if source.tax_charge_mechanism is TaxChargeMechanism.NORMAL
            else ZERO_MONEY
        )
        financial_credit = _component_delta(
            source.line_total, prior_financial, cumulative_ratio
        )
        return ReversedLineResult(
            line_id=source.line_id,
            ratio=current_ratio,
            cumulative_ratio=cumulative_ratio,
            value_basis=item.value_basis,
            reversed_billed_quantity=item.reversed_billed_quantity,
            reversed_free_quantity=item.reversed_free_quantity,
            reversed_base_billed_quantity=item.reversed_base_billed_quantity,
            reversed_base_free_quantity=item.reversed_base_free_quantity,
            gross_price_amount=financial_credit,
            line_discount_amount=ZERO_MONEY,
            document_discount_amount=ZERO_MONEY,
            net_value_amount=financial_credit,
            gst_taxable_value=ZERO_MONEY,
            tax=_zero_tax(),
            recipient_assessed_tax_amount=ZERO_MONEY,
            line_total=financial_credit,
        )
    tax = _tax_delta(source.tax, prior.tax, cumulative_ratio)
    net_value = _component_delta(
        source.net_value_amount, prior.net_value_amount, cumulative_ratio
    )
    gst_taxable = _component_delta(
        source.gst_taxable_value, prior.gst_taxable_value, cumulative_ratio
    )
    return ReversedLineResult(
        line_id=source.line_id,
        ratio=current_ratio,
        cumulative_ratio=cumulative_ratio,
        value_basis=item.value_basis,
        reversed_billed_quantity=item.reversed_billed_quantity,
        reversed_free_quantity=item.reversed_free_quantity,
        reversed_base_billed_quantity=item.reversed_base_billed_quantity,
        reversed_base_free_quantity=item.reversed_base_free_quantity,
        gross_price_amount=_component_delta(
            source.gross_price_amount, prior.gross_price_amount, cumulative_ratio
        ),
        line_discount_amount=_component_delta(
            source.line_discount_amount, prior.line_discount_amount, cumulative_ratio
        ),
        document_discount_amount=_component_delta(
            source.document_discount_amount, prior.document_discount_amount, cumulative_ratio
        ),
        net_value_amount=net_value,
        gst_taxable_value=gst_taxable,
        tax=tax,
        recipient_assessed_tax_amount=(
            tax.total_tax_amount
            if source.tax_charge_mechanism is TaxChargeMechanism.REVERSE_CHARGE
            else ZERO_MONEY
        ),
        line_total=(
            net_value
            if source.tax_charge_mechanism is TaxChargeMechanism.REVERSE_CHARGE
            else net_value + tax.total_tax_amount
        ),
    )


def _reverse_charge_line(
    source: ChargeLineResult,
    item: ChargeReversalInput,
    prior: PriorChargeReversalTotals,
    gst_tax_treatment: GstTaxTreatment,
) -> ReversedLineResult:
    cumulative_ratio = prior.reversed_ratio + item.ratio
    if cumulative_ratio > 1:
        raise ValueError("cumulative charge reversal ratio exceeds 1")
    if item.final_residual and cumulative_ratio != 1:
        raise ValueError("final residual charge reversal must consume the remaining ratio")
    if gst_tax_treatment is GstTaxTreatment.COMMERCIAL_ONLY:
        prior_financial = prior.net_value_amount + (
            prior.tax.total_tax_amount
            if source.tax_charge_mechanism is TaxChargeMechanism.NORMAL
            else ZERO_MONEY
        )
        financial_credit = _component_delta(
            source.line_total, prior_financial, cumulative_ratio
        )
        return ReversedLineResult(
            line_id=source.line_id,
            ratio=item.ratio,
            cumulative_ratio=cumulative_ratio,
            value_basis=None,
            reversed_billed_quantity=Decimal("0"),
            reversed_free_quantity=Decimal("0"),
            reversed_base_billed_quantity=Decimal("0"),
            reversed_base_free_quantity=Decimal("0"),
            gross_price_amount=financial_credit,
            line_discount_amount=ZERO_MONEY,
            document_discount_amount=ZERO_MONEY,
            net_value_amount=financial_credit,
            gst_taxable_value=ZERO_MONEY,
            tax=_zero_tax(),
            recipient_assessed_tax_amount=ZERO_MONEY,
            line_total=financial_credit,
        )
    tax = _tax_delta(source.tax, prior.tax, cumulative_ratio)
    net_value = _component_delta(
        source.net_value_amount, prior.net_value_amount, cumulative_ratio
    )
    gst_taxable = _component_delta(
        source.gst_taxable_value, prior.gst_taxable_value, cumulative_ratio
    )
    return ReversedLineResult(
        line_id=source.line_id,
        ratio=item.ratio,
        cumulative_ratio=cumulative_ratio,
        value_basis=None,
        reversed_billed_quantity=Decimal("0"),
        reversed_free_quantity=Decimal("0"),
        reversed_base_billed_quantity=Decimal("0"),
        reversed_base_free_quantity=Decimal("0"),
        gross_price_amount=_component_delta(
            source.gross_price_amount, prior.gross_price_amount, cumulative_ratio
        ),
        line_discount_amount=ZERO_MONEY,
        document_discount_amount=_component_delta(
            source.document_discount_amount, prior.document_discount_amount, cumulative_ratio
        ),
        net_value_amount=net_value,
        gst_taxable_value=gst_taxable,
        tax=tax,
        recipient_assessed_tax_amount=(
            tax.total_tax_amount
            if source.tax_charge_mechanism is TaxChargeMechanism.REVERSE_CHARGE
            else ZERO_MONEY
        ),
        line_total=(
            net_value
            if source.tax_charge_mechanism is TaxChargeMechanism.REVERSE_CHARGE
            else net_value + tax.total_tax_amount
        ),
    )


@_high_precision
def calculate_reversal(original: DocumentResult, request: ReversalInput) -> ReversalResult:
    """Reverse exact original components using an explicit quantity/charge basis."""
    if not isinstance(original, DocumentResult):
        raise TypeError("original must be DocumentResult")
    if not isinstance(request, ReversalInput):
        raise TypeError("request must be ReversalInput")
    products_by_id = {line.line_id: line for line in original.products}
    charges_by_id = {line.line_id: line for line in original.charges}
    prior_products = {line.line_id: line for line in request.prior_state.products}
    prior_charges = {line.line_id: line for line in request.prior_state.charges}
    unknown_prior = (set(prior_products) - set(products_by_id)) | (
        set(prior_charges) - set(charges_by_id)
    )
    if unknown_prior:
        raise ValueError(f"prior reversal state contains unknown line_id: {sorted(unknown_prior)[0]}")

    products: List[ReversedLineResult] = []
    for item in request.products:
        source = products_by_id.get(item.line_id)
        if source is None:
            raise ValueError(f"unknown product line_id: {item.line_id}")
        prior = prior_products.get(item.line_id) or PriorProductReversalTotals(
            line_id=item.line_id,
            value_basis=item.value_basis,
            reversed_billed_quantity=Decimal("0"),
            reversed_free_quantity=Decimal("0"),
            reversed_base_billed_quantity=Decimal("0"),
            reversed_base_free_quantity=Decimal("0"),
            gross_price_amount=ZERO_MONEY,
            line_discount_amount=ZERO_MONEY,
            document_discount_amount=ZERO_MONEY,
            net_value_amount=ZERO_MONEY,
            gst_taxable_value=ZERO_MONEY,
            tax=_zero_tax(),
        )
        products.append(_reverse_product_line(source, item, prior, request.gst_tax_treatment))

    charges: List[ReversedLineResult] = []
    for item in request.charges:
        source = charges_by_id.get(item.line_id)
        if source is None:
            raise ValueError(f"unknown charge line_id: {item.line_id}")
        prior = prior_charges.get(item.line_id) or PriorChargeReversalTotals(
            item.line_id,
            Decimal("0"),
            ZERO_MONEY,
            ZERO_MONEY,
            ZERO_MONEY,
            ZERO_MONEY,
            _zero_tax(),
        )
        charges.append(_reverse_charge_line(source, item, prior, request.gst_tax_treatment))

    all_lines = tuple(products + charges)
    tax = _sum_tax(all_lines)
    pre_round_total = sum((line.line_total for line in all_lines), ZERO_MONEY)
    prior_lines = request.prior_state.products + request.prior_state.charges
    prior_pre_round = sum(
        (
            line.net_value_amount
            + (
                ZERO_MONEY
                if original.tax_charge_mechanism is TaxChargeMechanism.REVERSE_CHARGE
                else line.tax.total_tax_amount
            )
            for line in prior_lines
        ),
        ZERO_MONEY,
    )
    cumulative_pre_round = prior_pre_round + pre_round_total
    if cumulative_pre_round > original.pre_round_total:
        raise ValueError("cumulative reversal payable exceeds original pre-round total")
    if original.pre_round_total == 0:
        rounding_target = ZERO_MONEY
    else:
        rounding_target = round_money(
            original.rounding_adjustment
            * cumulative_pre_round
            / original.pre_round_total
        )
    prior_rounding = request.prior_state.rounding_adjustment
    if original.rounding_adjustment >= 0 and not (
        ZERO_MONEY <= prior_rounding <= original.rounding_adjustment
    ):
        raise ValueError("prior rounding reversal exceeds original adjustment")
    if original.rounding_adjustment < 0 and not (
        original.rounding_adjustment <= prior_rounding <= ZERO_MONEY
    ):
        raise ValueError("prior rounding reversal exceeds original adjustment")
    rounding_adjustment = rounding_target - prior_rounding
    result = ReversalResult(
        gst_type=original.gst_type,
        zero_rated_mode=original.zero_rated_mode,
        rounding_policy=original.rounding_policy,
        tax_charge_mechanism=original.tax_charge_mechanism,
        products=tuple(products),
        charges=tuple(charges),
        gross_price_amount=sum((line.gross_price_amount for line in all_lines), ZERO_MONEY),
        line_discount_amount=sum((line.line_discount_amount for line in all_lines), ZERO_MONEY),
        document_discount_amount=sum(
            (line.document_discount_amount for line in all_lines), ZERO_MONEY
        ),
        net_value_amount=sum((line.net_value_amount for line in all_lines), ZERO_MONEY),
        gst_taxable_value=sum((line.gst_taxable_value for line in all_lines), ZERO_MONEY),
        tax=tax,
        recipient_assessed_tax_total=sum(
            (line.recipient_assessed_tax_amount for line in all_lines), ZERO_MONEY
        ),
        pre_round_total=pre_round_total,
        rounding_adjustment=rounding_adjustment,
        grand_total=pre_round_total + rounding_adjustment,
        gst_tax_treatment=request.gst_tax_treatment,
    )
    assert_reversal_reconciles(result)
    return result


def accumulate_reversal_state(
    prior: PriorReversalState, reversal: ReversalResult
) -> PriorReversalState:
    """Combine one locked reversal result into the persisted cumulative state."""
    if not isinstance(prior, PriorReversalState):
        raise TypeError("prior must be PriorReversalState")
    if not isinstance(reversal, ReversalResult):
        raise TypeError("reversal must be ReversalResult")
    products = {line.line_id: line for line in prior.products}
    charges = {line.line_id: line for line in prior.charges}
    for line in reversal.products:
        existing = products.get(line.line_id)
        if existing and existing.value_basis is not line.value_basis:
            raise ValueError("reversal value basis cannot change while accumulating state")
        existing_tax = existing.tax if existing else _zero_tax()
        products[line.line_id] = PriorProductReversalTotals(
            line_id=line.line_id,
            value_basis=line.value_basis,
            reversed_billed_quantity=(
                existing.reversed_billed_quantity if existing else Decimal("0")
            ) + line.reversed_billed_quantity,
            reversed_free_quantity=(
                existing.reversed_free_quantity if existing else Decimal("0")
            ) + line.reversed_free_quantity,
            reversed_base_billed_quantity=(
                existing.reversed_base_billed_quantity if existing else Decimal("0")
            ) + line.reversed_base_billed_quantity,
            reversed_base_free_quantity=(
                existing.reversed_base_free_quantity if existing else Decimal("0")
            ) + line.reversed_base_free_quantity,
            gross_price_amount=(
                existing.gross_price_amount if existing else ZERO_MONEY
            ) + line.gross_price_amount,
            line_discount_amount=(
                existing.line_discount_amount if existing else ZERO_MONEY
            ) + line.line_discount_amount,
            document_discount_amount=(
                existing.document_discount_amount if existing else ZERO_MONEY
            ) + line.document_discount_amount,
            net_value_amount=(existing.net_value_amount if existing else ZERO_MONEY)
            + line.net_value_amount,
            gst_taxable_value=(
                existing.gst_taxable_value if existing else ZERO_MONEY
            ) + line.gst_taxable_value,
            tax=TaxAmounts(
                existing_tax.cgst_amount + line.tax.cgst_amount,
                existing_tax.sgst_amount + line.tax.sgst_amount,
                existing_tax.igst_amount + line.tax.igst_amount,
                existing_tax.cess_amount + line.tax.cess_amount,
                existing_tax.total_tax_amount + line.tax.total_tax_amount,
            ),
        )
    for line in reversal.charges:
        existing = charges.get(line.line_id)
        existing_tax = existing.tax if existing else _zero_tax()
        charges[line.line_id] = PriorChargeReversalTotals(
            line_id=line.line_id,
            reversed_ratio=(existing.reversed_ratio if existing else Decimal("0")) + line.ratio,
            gross_price_amount=(
                existing.gross_price_amount if existing else ZERO_MONEY
            ) + line.gross_price_amount,
            document_discount_amount=(
                existing.document_discount_amount if existing else ZERO_MONEY
            ) + line.document_discount_amount,
            net_value_amount=(existing.net_value_amount if existing else ZERO_MONEY)
            + line.net_value_amount,
            gst_taxable_value=(
                existing.gst_taxable_value if existing else ZERO_MONEY
            ) + line.gst_taxable_value,
            tax=TaxAmounts(
                existing_tax.cgst_amount + line.tax.cgst_amount,
                existing_tax.sgst_amount + line.tax.sgst_amount,
                existing_tax.igst_amount + line.tax.igst_amount,
                existing_tax.cess_amount + line.tax.cess_amount,
                existing_tax.total_tax_amount + line.tax.total_tax_amount,
            ),
        )
    return PriorReversalState(
        tuple(products[line_id] for line_id in sorted(products)),
        tuple(charges[line_id] for line_id in sorted(charges)),
        prior.rounding_adjustment + reversal.rounding_adjustment,
    )


def assert_reversal_reconciles(result: ReversalResult) -> None:
    lines = result.products + result.charges
    _assert_tax(result.tax)
    if result.tax != _sum_tax(lines):
        raise CalculationInvariantError("reversal header tax does not equal line tax")
    if result.gst_type is GstType.INTRA_STATE and (
        result.tax.cgst_amount != result.tax.sgst_amount
        or result.tax.igst_amount != ZERO_MONEY
    ):
        raise CalculationInvariantError("reversal intra-state tax components are inconsistent")
    if result.gst_type is GstType.INTER_STATE and (
        result.tax.cgst_amount != ZERO_MONEY or result.tax.sgst_amount != ZERO_MONEY
    ):
        raise CalculationInvariantError("reversal inter-state tax components are inconsistent")
    if result.net_value_amount != sum((line.net_value_amount for line in lines), ZERO_MONEY):
        raise CalculationInvariantError("reversal net value does not reconcile")
    if result.gst_taxable_value != sum(
        (line.gst_taxable_value for line in lines), ZERO_MONEY
    ):
        raise CalculationInvariantError("reversal GST taxable value does not reconcile")
    expected_recipient_assessed = (
        result.tax.total_tax_amount
        if result.tax_charge_mechanism is TaxChargeMechanism.REVERSE_CHARGE
        else ZERO_MONEY
    )
    if result.recipient_assessed_tax_total != expected_recipient_assessed:
        raise CalculationInvariantError("reversal recipient-assessed tax does not reconcile")
    expected_pre_round = result.net_value_amount + result.tax.total_tax_amount
    if result.tax_charge_mechanism is TaxChargeMechanism.REVERSE_CHARGE:
        expected_pre_round = result.net_value_amount
    if result.pre_round_total != expected_pre_round:
        raise CalculationInvariantError("reversal pre-round total does not reconcile")
    if result.pre_round_total != sum((line.line_total for line in lines), ZERO_MONEY):
        raise CalculationInvariantError("reversal pre-round total does not equal line totals")
    if result.grand_total != result.pre_round_total + result.rounding_adjustment:
        raise CalculationInvariantError("reversal grand total does not reconcile")
