from dataclasses import fields, is_dataclass
from decimal import Decimal, ROUND_HALF_UP
from itertools import product
import random

import pytest

from app.domain.calculations import (
    ChargeLineInput,
    ChargeReversalInput,
    DiscountBasis,
    DiscountInput,
    DiscountKind,
    DocumentInput,
    FreeSupplyTaxTreatment,
    GstType,
    GstTaxTreatment,
    PriceBasis,
    PriorReversalState,
    ProductLineInput,
    ProductReversalInput,
    ReversalInput,
    ReversalValueBasis,
    RoundingPolicy,
    TaxChargeMechanism,
    TaxabilitySnapshot,
    ZeroRatedMode,
    accumulate_reversal_state,
    assert_document_reconciles,
    assert_reversal_reconciles,
    calculate_document,
    calculate_reversal,
    money_string,
    reversal_input_payload,
    round_money,
)


D = Decimal
NO_DISCOUNT = DiscountInput(DiscountKind.NONE, D("0"), DiscountBasis.PRE_TAX_VALUE)
EMPTY_REVERSAL_STATE = PriorReversalState((), (), D("0.00"))


def product_line(
    line_id="p1",
    *,
    billed="1",
    free="0",
    factor="1",
    base_billed=None,
    base_free=None,
    price="100",
    price_mode=PriceBasis.TAX_EXCLUSIVE,
    line_discount=NO_DISCOUNT,
    gst="18",
    cess="0",
    taxability=TaxabilitySnapshot.TAXABLE,
    mechanism=TaxChargeMechanism.NORMAL,
    free_policy=FreeSupplyTaxTreatment.EXCLUDE_FROM_VALUE,
    eligible=True,
):
    billed_value = D(billed)
    free_value = D(free)
    factor_value = D(factor)
    if base_billed is None:
        base_billed = (billed_value * factor_value).quantize(
            D("0.000001"), rounding=ROUND_HALF_UP
        )
    if base_free is None:
        base_free = (free_value * factor_value).quantize(
            D("0.000001"), rounding=ROUND_HALF_UP
        )
    return ProductLineInput(
        line_id=line_id,
        billed_quantity=billed_value,
        free_quantity=free_value,
        uom_conversion_factor=factor_value,
        base_billed_quantity=D(base_billed),
        base_free_quantity=D(base_free),
        quoted_unit_rate=D(price),
        price_basis=price_mode,
        line_discount=line_discount,
        gst_rate=D(gst),
        cess_rate=D(cess),
        taxability_snapshot=taxability,
        tax_charge_mechanism=mechanism,
        free_supply_tax_treatment=free_policy,
        document_discount_eligible=eligible,
    )


def charge_line(
    line_id="c1",
    *,
    amount="10",
    price_mode=PriceBasis.TAX_EXCLUSIVE,
    taxability=TaxabilitySnapshot.TAXABLE,
    mechanism=TaxChargeMechanism.NORMAL,
    gst="18",
    cess="0",
    eligible=False,
):
    return ChargeLineInput(
        line_id=line_id,
        charge_code="FREIGHT",
        quoted_amount=D(amount),
        price_basis=price_mode,
        taxability_snapshot=taxability,
        tax_charge_mechanism=mechanism,
        gst_rate=D(gst),
        cess_rate=D(cess),
        document_discount_eligible=eligible,
    )


def document(
    *products_,
    charges=(),
    gst_type=GstType.INTER_STATE,
    zero_rated_mode=ZeroRatedMode.NOT_APPLICABLE,
    rounding_policy=RoundingPolicy.NONE,
    mechanism=TaxChargeMechanism.NORMAL,
    discount=NO_DISCOUNT,
    gst_tax_treatment=GstTaxTreatment.STATUTORY,
):
    return DocumentInput(
        tuple(products_), tuple(charges), gst_type, zero_rated_mode,
        rounding_policy, mechanism, discount, gst_tax_treatment,
    )


def reversal(*products_, charges=(), prior_state=EMPTY_REVERSAL_STATE,
             gst_tax_treatment=GstTaxTreatment.STATUTORY):
    return ReversalInput(tuple(products_), tuple(charges), prior_state, gst_tax_treatment)


def test_commercial_only_document_uses_quoted_gross_credit_and_zero_gst():
    result = calculate_document(document(
        product_line(price="118", price_mode=PriceBasis.TAX_INCLUSIVE, gst="18"),
        gst_tax_treatment=GstTaxTreatment.COMMERCIAL_ONLY,
    ))
    assert result.gst_tax_treatment is GstTaxTreatment.COMMERCIAL_ONLY
    assert result.gross_price_amount == D("118.00")
    assert result.net_value_amount == D("118.00")
    assert result.gst_taxable_value == D("0.00")
    assert result.tax.total_tax_amount == D("0.00")
    assert result.grand_total == D("118.00")


def test_commercial_only_reversal_preserves_original_payable_after_statutory_partial():
    original = calculate_document(document(product_line(billed="2", price="100", gst="18")))
    statutory = calculate_reversal(original, reversal(ProductReversalInput(
        "p1", D("1"), D("0"), D("1"), D("0"),
        ReversalValueBasis.BILLED_QUANTITY, False,
    )))
    state = accumulate_reversal_state(EMPTY_REVERSAL_STATE, statutory)
    commercial = calculate_reversal(original, reversal(ProductReversalInput(
        "p1", D("1"), D("0"), D("1"), D("0"),
        ReversalValueBasis.BILLED_QUANTITY, True,
    ), prior_state=state, gst_tax_treatment=GstTaxTreatment.COMMERCIAL_ONLY))
    assert statutory.grand_total == commercial.grand_total == D("118.00")
    assert commercial.net_value_amount == D("118.00")
    assert commercial.gst_taxable_value == D("0.00")
    assert commercial.tax.total_tax_amount == D("0.00")


def walk_values(value):
    if is_dataclass(value):
        for field in fields(value):
            yield from walk_values(getattr(value, field.name))
    elif isinstance(value, tuple):
        for item in value:
            yield from walk_values(item)
    else:
        yield value


def assert_money_shape(value):
    assert isinstance(value, Decimal)
    assert value.is_finite()
    assert value == value.quantize(D("0.01"))


def test_half_up_rounding_and_canonical_string_never_use_float():
    assert round_money(D("1.005")) == D("1.01")
    assert round_money(D("-1.005")) == D("-1.01")
    assert money_string(D("0")) == "0.00"
    assert money_string(D("12.345")) == "12.35"
    with pytest.raises(TypeError, match="Decimal"):
        round_money(1.005)


def test_strict_inputs_reject_float_string_nan_and_untyped_enums():
    with pytest.raises(TypeError, match="quoted_unit_rate"):
        ProductLineInput(
            line_id="p", billed_quantity=D("1"), free_quantity=D("0"),
            uom_conversion_factor=D("1"), base_billed_quantity=D("1"),
            base_free_quantity=D("0"), quoted_unit_rate=1.0,
            price_basis=PriceBasis.TAX_EXCLUSIVE, line_discount=NO_DISCOUNT,
            gst_rate=D("5"), cess_rate=D("0"),
            taxability_snapshot=TaxabilitySnapshot.TAXABLE,
            tax_charge_mechanism=TaxChargeMechanism.NORMAL,
            free_supply_tax_treatment=FreeSupplyTaxTreatment.EXCLUDE_FROM_VALUE,
            document_discount_eligible=True,
        )
    with pytest.raises(TypeError, match="gst_rate"):
        ProductLineInput(
            line_id="p", billed_quantity=D("1"), free_quantity=D("0"),
            uom_conversion_factor=D("1"), base_billed_quantity=D("1"),
            base_free_quantity=D("0"), quoted_unit_rate=D("1"),
            price_basis=PriceBasis.TAX_EXCLUSIVE, line_discount=NO_DISCOUNT,
            gst_rate="5", cess_rate=D("0"),
            taxability_snapshot=TaxabilitySnapshot.TAXABLE,
            tax_charge_mechanism=TaxChargeMechanism.NORMAL,
            free_supply_tax_treatment=FreeSupplyTaxTreatment.EXCLUDE_FROM_VALUE,
            document_discount_eligible=True,
        )
    with pytest.raises(ValueError, match="finite"):
        product_line(price="NaN")
    with pytest.raises(TypeError, match="GstType"):
        DocumentInput(
            (product_line(),), (), "IGST", ZeroRatedMode.NOT_APPLICABLE,
            RoundingPolicy.NONE, TaxChargeMechanism.NORMAL, NO_DISCOUNT,
        )


@pytest.mark.parametrize(
    "billed,free,factor,error",
    [
        ("-1", "0", "1", "billed_quantity"),
        ("0", "0", "1", "must be greater"),
        ("1", "0", "0", "uom_conversion_factor"),
    ],
)
def test_quantity_boundaries_fail_closed(billed, free, factor, error):
    with pytest.raises(ValueError, match=error):
        product_line(billed=billed, free=free, factor=factor)


@pytest.mark.parametrize(
    "factory,error",
    [
        (lambda: product_line(billed="0.0000001"), "six decimal"),
        (lambda: product_line(price="1.00001"), "four decimal"),
        (lambda: product_line(gst="18.0000001"), "six decimal"),
        (lambda: charge_line(amount="1.001"), "two decimal"),
        (lambda: product_line(gst="1000"), r"numeric\(9,6\)"),
    ],
)
def test_numeric_precision_and_storage_boundaries_fail_closed(factory, error):
    with pytest.raises(ValueError, match=error):
        factory()


def test_money_overflow_fails_as_a_domain_error():
    with pytest.raises(ValueError, match=r"numeric\(20,2\)"):
        round_money(D("1000000000000000000"))


def test_canonical_numeric_maxima_and_one_step_overflows_are_controlled():
    max_quantity = "99999999999999.999999"
    max_unit_rate = "9999999999999999.9999"
    accepted = calculate_document(document(product_line(
        billed="1", factor="1", price=max_unit_rate, gst="0",
    )))
    assert accepted.gross_price_amount == D("9999999999999999.9999").quantize(D("0.01"))

    with pytest.raises(ValueError, match=r"numeric\(20,6\)"):
        product_line(billed="100000000000000.000000", factor="1")
    with pytest.raises(ValueError, match=r"numeric\(20,4\)"):
        product_line(price="10000000000000000.0000")

    oversized_product = product_line(
        billed=max_quantity, factor="1", price=max_unit_rate, gst="0",
    )
    with pytest.raises(ValueError, match=r"numeric\(20,2\)"):
        calculate_document(document(oversized_product))


@pytest.mark.parametrize(
    "field,value,error",
    [
        ("base_billed", "9.999999", "base_billed_quantity"),
        ("base_free", "2.000001", "base_free_quantity"),
    ],
)
def test_base_quantities_must_match_commercial_quantities_and_conversion(field, value, error):
    kwargs = {field: value}
    with pytest.raises(ValueError, match=error):
        product_line(billed="5", free="1", factor="2", **kwargs)


def test_free_supply_policy_is_explicit_and_changes_value_not_physical_quantity():
    excluded = calculate_document(document(product_line(billed="10", free="2", factor="10")))
    included = calculate_document(document(product_line(
        billed="10", free="2", factor="10",
        free_policy=FreeSupplyTaxTreatment.INCLUDE_AT_UNIT_PRICE,
    )))

    assert excluded.products[0].gross_price_amount == D("1000.00")
    assert included.products[0].gross_price_amount == D("1200.00")
    assert excluded.products[0].free_quantity == included.products[0].free_quantity == D("2")
    assert excluded.products[0].base_billed_quantity == included.products[0].base_billed_quantity == D("100.000000")
    assert excluded.products[0].base_free_quantity == included.products[0].base_free_quantity == D("20.000000")


def test_free_only_supply_requires_base_valuation_for_reversal():
    original = calculate_document(document(product_line(
        billed="0", free="5", factor="10",
        free_policy=FreeSupplyTaxTreatment.INCLUDE_AT_UNIT_PRICE,
    )))
    with pytest.raises(ValueError, match="free-only"):
        calculate_reversal(original, reversal(ProductReversalInput(
            "p1", D("0"), D("1"), D("0"), D("10"),
            ReversalValueBasis.BILLED_QUANTITY, False,
        )))

    reversed_document = calculate_reversal(original, reversal(ProductReversalInput(
        "p1", D("0"), D("1"), D("0"), D("10"),
        ReversalValueBasis.BASE_QUANTITY, False,
    )))
    assert reversed_document.products[0].ratio == D("0.2")
    assert reversed_document.grand_total == D("118.00")


@pytest.mark.parametrize("gst_type", tuple(GstType))
@pytest.mark.parametrize("price_mode", tuple(PriceBasis))
@pytest.mark.parametrize("gst,cess", [("0", "0"), ("5", "0"), ("18", "1"), ("28", "12")])
def test_tax_modes_price_modes_and_cess_reconcile(gst_type, price_mode, gst, cess):
    result = calculate_document(document(
        product_line(price="118.37", price_mode=price_mode, gst=gst, cess=cess),
        gst_type=gst_type,
    ))
    line = result.products[0]
    assert_money_shape(line.net_value_amount)
    assert_money_shape(line.gst_taxable_value)
    assert_money_shape(line.tax.cess_amount)
    assert line.line_total == line.net_value_amount + line.tax.total_tax_amount
    if gst_type is GstType.INTER_STATE:
        assert line.tax.cgst_amount == line.tax.sgst_amount == D("0.00")
    else:
        assert line.tax.igst_amount == D("0.00")
        assert line.tax.cgst_amount + line.tax.sgst_amount + line.tax.cess_amount == line.tax.total_tax_amount
    if price_mode is PriceBasis.TAX_INCLUSIVE:
        assert line.line_total == D("118.37")


def test_inclusive_one_paise_residual_is_preserved_exactly():
    result = calculate_document(document(product_line(
        price="0.01", price_mode=PriceBasis.TAX_INCLUSIVE, gst="18", cess="1",
    ), gst_type=GstType.INTRA_STATE))
    line = result.products[0]
    assert line.line_total == D("0.01")
    assert line.tax.total_tax_amount == (
        line.tax.cgst_amount + line.tax.sgst_amount + line.tax.igst_amount + line.tax.cess_amount
    )


@pytest.mark.parametrize("amount", ("0.01", "0.06", "0.07", "1.06"))
@pytest.mark.parametrize("cess", ("0", "1"))
def test_inclusive_intra_components_stay_equal_while_inter_preserves_payable(amount, cess):
    intra = calculate_document(document(product_line(
        price=amount, price_mode=PriceBasis.TAX_INCLUSIVE, gst="18", cess=cess,
    ), gst_type=GstType.INTRA_STATE))
    inter = calculate_document(document(product_line(
        price=amount, price_mode=PriceBasis.TAX_INCLUSIVE, gst="18", cess=cess,
    ), gst_type=GstType.INTER_STATE))
    assert intra.products[0].tax.cgst_amount == intra.products[0].tax.sgst_amount
    assert intra.products[0].line_total == D(amount)
    assert inter.products[0].line_total == D(amount)
    assert intra.pre_round_total == intra.products[0].net_value_amount + intra.tax.total_tax_amount
    assert inter.pre_round_total == inter.products[0].net_value_amount + inter.tax.total_tax_amount


@pytest.mark.parametrize("discount_basis", tuple(DiscountBasis))
@pytest.mark.parametrize("discount_kind,value", [(DiscountKind.PERCENT, "12.5"), (DiscountKind.AMOUNT, "10.01")])
def test_line_discount_basis_is_explicit(discount_basis, discount_kind, value):
    discount = DiscountInput(discount_kind, D(value), discount_basis)
    result = calculate_document(document(product_line(
        price="118", price_mode=PriceBasis.TAX_INCLUSIVE, line_discount=discount,
    )))
    line = result.products[0]
    assert line.line_discount_amount > 0
    assert line.line_pre_tax_discount_amount > 0
    assert line.line_total == line.net_value_amount + line.tax.total_tax_amount


def test_document_discount_residual_is_exact_across_many_one_paise_lines():
    lines = tuple(product_line(f"p{i}", price="0.01", gst="0") for i in range(7))
    result = calculate_document(document(
        *lines,
        discount=DiscountInput(DiscountKind.AMOUNT, D("0.03"), DiscountBasis.PRE_TAX_VALUE),
    ))
    allocations = [line.document_discount_amount for line in result.products]
    assert sum(allocations) == D("0.03")
    assert sorted(allocations) == [D("0.00")] * 4 + [D("0.01")] * 3
    assert result.net_value_amount == D("0.04")
    assert result.gst_taxable_value == D("0.04")


def test_percentage_document_discount_uses_only_explicitly_eligible_lines():
    result = calculate_document(document(
        product_line("eligible", price="100", eligible=True),
        product_line("excluded", price="100", eligible=False),
        charges=(charge_line(eligible=False),),
        discount=DiscountInput(DiscountKind.PERCENT, D("10"), DiscountBasis.PRE_TAX_VALUE),
    ))
    assert result.document_discount_amount == D("10.00")
    assert result.products[0].document_discount_amount == D("10.00")
    assert result.products[1].document_discount_amount == D("0.00")
    assert result.charges[0].document_discount_amount == D("0.00")


def test_positive_document_discount_without_eligible_value_fails():
    with pytest.raises(ValueError, match="positive eligible basis"):
        calculate_document(document(
            product_line(eligible=False),
            discount=DiscountInput(DiscountKind.PERCENT, D("10"), DiscountBasis.PRE_TAX_VALUE),
        ))


def test_charge_taxation_is_explicit_and_separate_from_products():
    result = calculate_document(document(
        product_line(gst="5"),
        charges=(
            charge_line("taxable", amount="100", gst="18", cess="2"),
            charge_line(
                "outside", amount="50", taxability=TaxabilitySnapshot.NON_GST,
                gst="0", cess="0",
            ),
        ),
    ))
    assert result.charges[0].tax.total_tax_amount == D("20.00")
    assert result.charges[1].tax.total_tax_amount == D("0.00")
    assert result.charges[1].net_value_amount == D("50.00")
    assert result.charges[1].gst_taxable_value == D("0.00")
    with pytest.raises(ValueError, match="zero GST"):
        charge_line(taxability=TaxabilitySnapshot.NON_GST, gst="5")


@pytest.mark.parametrize(
    "taxability",
    (TaxabilitySnapshot.EXEMPT, TaxabilitySnapshot.NIL_RATED, TaxabilitySnapshot.NON_GST),
)
def test_non_gst_taxable_treatments_keep_net_value_but_zero_gst_basis(taxability):
    result = calculate_document(document(product_line(
        price="100", gst="0", cess="0", taxability=taxability,
    )))
    line = result.products[0]
    assert line.net_value_amount == D("100.00")
    assert line.gst_taxable_value == D("0.00")
    assert line.tax.total_tax_amount == D("0.00")
    assert line.line_total == D("100.00")


def test_zero_rated_without_payment_and_with_igst_are_explicit():
    without_payment = calculate_document(document(product_line(
        price="100", gst="0", cess="0", taxability=TaxabilitySnapshot.ZERO_RATED,
    ), zero_rated_mode=ZeroRatedMode.WITHOUT_PAYMENT))
    assert without_payment.gst_taxable_value == D("100.00")
    assert without_payment.tax.total_tax_amount == D("0.00")
    assert without_payment.grand_total == D("100.00")

    with_igst = calculate_document(document(product_line(
        price="100", gst="18", cess="0", taxability=TaxabilitySnapshot.ZERO_RATED,
    ), zero_rated_mode=ZeroRatedMode.WITH_IGST))
    assert with_igst.gst_taxable_value == D("100.00")
    assert with_igst.tax.igst_amount == D("18.00")
    assert with_igst.grand_total == D("118.00")


@pytest.mark.parametrize(
    "kwargs,error",
    [
        ({"gst_type": GstType.INTRA_STATE, "zero_rated_mode": ZeroRatedMode.WITHOUT_PAYMENT}, "must use IGST"),
        ({"zero_rated_mode": ZeroRatedMode.NOT_APPLICABLE}, "explicit zero_rated_mode"),
        ({"zero_rated_mode": ZeroRatedMode.WITHOUT_PAYMENT}, "zero tax rates"),
        ({"zero_rated_mode": ZeroRatedMode.WITH_IGST}, "positive GST"),
    ],
)
def test_illegal_zero_rated_combinations_fail_closed(kwargs, error):
    gst = "18" if kwargs["zero_rated_mode"] is ZeroRatedMode.WITHOUT_PAYMENT else "0"
    with pytest.raises(ValueError, match=error):
        document(product_line(
            gst=gst, cess="0", taxability=TaxabilitySnapshot.ZERO_RATED,
        ), **kwargs)


@pytest.mark.parametrize("workflow", ("sales", "procurement"))
def test_sales_and_procurement_reverse_charge_payable_and_reversal(workflow):
    reverse_charge = calculate_document(document(product_line(
        price="100", gst="18", mechanism=TaxChargeMechanism.REVERSE_CHARGE,
    ), mechanism=TaxChargeMechanism.REVERSE_CHARGE))
    assert reverse_charge.tax.total_tax_amount == D("18.00")
    assert reverse_charge.recipient_assessed_tax_total == D("18.00")
    assert reverse_charge.pre_round_total == D("100.00")
    assert reverse_charge.grand_total == D("100.00")

    reversed_document = calculate_reversal(reverse_charge, reversal(ProductReversalInput(
        "p1", D("1"), D("0"), D("1"), D("0"),
        ReversalValueBasis.BASE_QUANTITY, True,
    )))
    assert reversed_document.tax.total_tax_amount == D("18.00")
    assert reversed_document.recipient_assessed_tax_total == D("18.00")
    assert reversed_document.grand_total == D("100.00")

    normal = calculate_document(document(product_line(price="100", gst="18")))
    assert normal.recipient_assessed_tax_total == D("0.00")
    assert normal.grand_total == D("118.00")
    assert workflow in {"sales", "procurement"}


def test_reverse_charge_rejects_inclusive_prices_and_mismatched_line_mechanisms():
    with pytest.raises(ValueError, match="tax-exclusive"):
        document(product_line(
            price_mode=PriceBasis.TAX_INCLUSIVE,
            mechanism=TaxChargeMechanism.REVERSE_CHARGE,
        ), mechanism=TaxChargeMechanism.REVERSE_CHARGE)
    with pytest.raises(ValueError, match="must match"):
        document(product_line(), mechanism=TaxChargeMechanism.REVERSE_CHARGE)


@pytest.mark.parametrize(
    "amount,expected_adjustment,expected_total",
    [("10.49", "-0.49", "10.00"), ("10.50", "0.50", "11.00")],
)
def test_nearest_rupee_rounding_boundaries(amount, expected_adjustment, expected_total):
    result = calculate_document(document(product_line(
        price=amount, gst="0",
    ), rounding_policy=RoundingPolicy.NEAREST_RUPEE))
    assert result.pre_round_total == D(amount)
    assert result.rounding_adjustment == D(expected_adjustment)
    assert result.grand_total == D(expected_total)

    no_rounding = calculate_document(document(product_line(
        price=amount, gst="0",
    ), rounding_policy=RoundingPolicy.NONE))
    assert no_rounding.rounding_adjustment == D("0.00")
    assert no_rounding.grand_total == D(amount)


def test_cumulative_returns_consume_rounding_adjustment_without_paise_drift():
    original = calculate_document(document(product_line(
        billed="3", factor="1", price="10.50", gst="0",
    ), rounding_policy=RoundingPolicy.NEAREST_RUPEE))
    assert original.rounding_adjustment == D("0.50")
    state = EMPTY_REVERSAL_STATE
    reversals = []
    for index in range(3):
        current = calculate_reversal(original, reversal(ProductReversalInput(
            "p1", D("1"), D("0"), D("1"), D("0"),
            ReversalValueBasis.BASE_QUANTITY, index == 2,
        ), prior_state=state))
        reversals.append(current)
        state = accumulate_reversal_state(state, current)
    assert sum((item.rounding_adjustment for item in reversals), D("0.00")) == D("0.50")
    assert sum((item.pre_round_total for item in reversals), D("0.00")) == original.pre_round_total
    assert sum((item.grand_total for item in reversals), D("0.00")) == original.grand_total
    assert state.rounding_adjustment == original.rounding_adjustment


def test_header_reconciliation_and_output_tree_contain_no_floats():
    result = calculate_document(document(
        product_line("p1", billed="2.5", free="1", factor="10", price="99.995", gst="5", cess="1"),
        product_line("p2", price="120", price_mode=PriceBasis.TAX_INCLUSIVE, gst="18"),
        charges=(charge_line(amount="17.25", gst="18"),),
        gst_type=GstType.INTRA_STATE,
        discount=DiscountInput(DiscountKind.AMOUNT, D("12.37"), DiscountBasis.PRE_TAX_VALUE),
    ))
    assert_document_reconciles(result)
    assert not any(isinstance(value, float) for value in walk_values(result))
    for line in result.products + result.charges:
        for amount in (
            line.gross_price_amount,
            line.document_discount_amount,
            line.net_value_amount,
            line.gst_taxable_value,
            line.tax.cgst_amount,
            line.tax.sgst_amount,
            line.tax.igst_amount,
            line.tax.cess_amount,
            line.line_total,
        ):
            assert_money_shape(amount)


def test_partial_and_full_reversals_are_proportional_and_reconcile():
    original = calculate_document(document(
        product_line("p", billed="3", free="1", factor="10", price="99.99", gst="18", cess="1"),
        charges=(charge_line("freight", amount="10", gst="18"),),
        discount=DiscountInput(DiscountKind.AMOUNT, D("10"), DiscountBasis.PRE_TAX_VALUE),
    ))
    partial = calculate_reversal(original, reversal(
        ProductReversalInput(
            "p", D("1"), D("0"), D("10"), D("0"),
            ReversalValueBasis.BILLED_QUANTITY, False,
        ),
        charges=(ChargeReversalInput("freight", D("0.5"), False),),
    ))
    assert partial.products[0].ratio * D("3") == D("1")
    assert partial.charges[0].ratio == D("0.5")
    assert_reversal_reconciles(partial)

    full = calculate_reversal(original, reversal(
        ProductReversalInput(
            "p", D("3"), D("1"), D("30"), D("10"),
            ReversalValueBasis.BASE_QUANTITY, True,
        ),
        charges=(ChargeReversalInput("freight", D("1"), True),),
    ))
    assert full.gross_price_amount == original.gross_price_amount
    assert full.line_discount_amount == original.line_discount_amount
    assert full.document_discount_amount == original.document_discount_amount
    assert full.net_value_amount == original.net_value_amount
    assert full.gst_taxable_value == original.gst_taxable_value
    assert full.tax == original.tax
    assert full.grand_total == original.grand_total


def test_reversal_base_quantities_cannot_contradict_original_conversion_factor():
    original = calculate_document(document(product_line(
        billed="2", free="1", factor="10",
    )))
    with pytest.raises(ValueError, match="base_billed_quantity contradicts"):
        calculate_reversal(original, reversal(ProductReversalInput(
            "p1", D("1"), D("0"), D("9.999999"), D("0"),
            ReversalValueBasis.BASE_QUANTITY, False,
        )))
    with pytest.raises(ValueError, match="base_free_quantity contradicts"):
        calculate_reversal(original, reversal(ProductReversalInput(
            "p1", D("0"), D("1"), D("0"), D("9.999999"),
            ReversalValueBasis.BASE_QUANTITY, False,
        )))


def test_cumulative_partial_reversals_telescope_to_exact_original_components():
    original = calculate_document(document(
        product_line(
            "p", billed="3", free="3", factor="10", price="0.019",
            gst="18", cess="1",
            free_policy=FreeSupplyTaxTreatment.INCLUDE_AT_UNIT_PRICE,
        ),
        charges=(charge_line(
            "freight", amount="0.07", price_mode=PriceBasis.TAX_INCLUSIVE,
            gst="18", cess="1",
        ),),
        gst_type=GstType.INTRA_STATE,
        discount=DiscountInput(DiscountKind.AMOUNT, D("0.01"), DiscountBasis.PRE_TAX_VALUE),
    ))
    state = EMPTY_REVERSAL_STATE
    partitions = []
    artifact_payloads = []
    for index, charge_ratio in enumerate((D("0.33"), D("0.33"), D("0.34"))):
        request = reversal(
            ProductReversalInput(
                "p", D("1"), D("1"), D("10"), D("10"),
                ReversalValueBasis.BASE_QUANTITY, index == 2,
            ),
            charges=(ChargeReversalInput("freight", charge_ratio, index == 2),),
            prior_state=state,
        )
        artifact_payloads.append(reversal_input_payload(request))
        current = calculate_reversal(original, request)
        assert_reversal_reconciles(current)
        partitions.append(current)
        state = accumulate_reversal_state(state, current)

    def total(field):
        return sum((getattr(item, field) for item in partitions), D("0.00"))

    assert total("gross_price_amount") == original.gross_price_amount
    assert total("line_discount_amount") == original.line_discount_amount
    assert total("document_discount_amount") == original.document_discount_amount
    assert total("net_value_amount") == original.net_value_amount
    assert total("gst_taxable_value") == original.gst_taxable_value
    assert total("grand_total") == original.grand_total
    assert sum((item.tax.cgst_amount for item in partitions), D("0.00")) == original.tax.cgst_amount
    assert sum((item.tax.sgst_amount for item in partitions), D("0.00")) == original.tax.sgst_amount
    assert sum((item.tax.igst_amount for item in partitions), D("0.00")) == original.tax.igst_amount
    assert sum((item.tax.cess_amount for item in partitions), D("0.00")) == original.tax.cess_amount
    assert state.products[0].tax == original.products[0].tax
    assert state.charges[0].tax == original.charges[0].tax
    assert artifact_payloads[0]["prior_state"] == {
        "charges": [], "products": [], "rounding_adjustment": "0.00"
    }
    assert artifact_payloads[1]["prior_state"]["products"][0][
        "gross_price_amount"
    ] == format(partitions[0].products[0].gross_price_amount, "f")
    assert artifact_payloads[1]["prior_state"]["charges"][0][
        "reversed_ratio"
    ] == "0.33"
    assert artifact_payloads[2]["products"][0]["final_residual"] is True
    assert artifact_payloads[2]["charges"][0] == {
        "final_residual": True, "line_id": "freight", "ratio": "0.34"
    }

    with pytest.raises(ValueError, match="cumulative reversed billed"):
        calculate_reversal(original, reversal(ProductReversalInput(
            "p", D("0.000001"), D("0"), D("0.000010"), D("0"),
            ReversalValueBasis.BASE_QUANTITY, False,
        ), prior_state=state))


def test_final_residual_mode_rejects_incomplete_quantity_or_charge_ratio():
    original = calculate_document(document(
        product_line("p", billed="2", factor="10"),
        charges=(charge_line("freight"),),
    ))
    with pytest.raises(ValueError, match="every remaining line quantity"):
        calculate_reversal(original, reversal(ProductReversalInput(
            "p", D("1"), D("0"), D("10"), D("0"),
            ReversalValueBasis.BASE_QUANTITY, True,
        )))
    with pytest.raises(ValueError, match="remaining ratio"):
        calculate_reversal(original, reversal(
            charges=(ChargeReversalInput("freight", D("0.99"), True),),
        ))


@pytest.mark.parametrize(
    "reversal_request,error",
    [
        (reversal(ProductReversalInput(
            "missing", D("1"), D("0"), D("1"), D("0"),
            ReversalValueBasis.BASE_QUANTITY, False,
        )), "unknown product"),
        (reversal(ProductReversalInput(
            "p1", D("2"), D("0"), D("2"), D("0"),
            ReversalValueBasis.BILLED_QUANTITY, False,
        )), "exceeds original"),
        (reversal(charges=(ChargeReversalInput("missing", D("0.5"), False),)), "unknown charge"),
    ],
)
def test_reversal_boundaries_fail_closed(reversal_request, error):
    original = calculate_document(document(product_line()))
    with pytest.raises(ValueError, match=error):
        calculate_reversal(original, reversal_request)


def test_combinatorial_matrix_reconciles_all_quantity_price_tax_and_discount_modes():
    cases = product(
        ("0.001", "1", "2.5"),
        ("0.01", "1.005", "99.999"),
        ("0", "1"),
        ("0", "5", "18", "28"),
        ("0", "1", "12"),
        tuple(GstType),
        tuple(PriceBasis),
        tuple(DiscountBasis),
    )
    for index, (quantity, price, free, gst, cess, gst_type, price_mode, basis) in enumerate(cases):
        line_discount = DiscountInput(DiscountKind.PERCENT, D("12.5"), basis)
        result = calculate_document(document(
            product_line(
                f"p{index}", billed=quantity, free=free,
                price=price, price_mode=price_mode,
                line_discount=line_discount, gst=gst, cess=cess,
                free_policy=FreeSupplyTaxTreatment.INCLUDE_AT_UNIT_PRICE,
            ),
            gst_type=gst_type,
        ))
        assert_document_reconciles(result)


def test_seeded_multi_line_documents_and_reversals_are_deterministic():
    def run(seed):
        rng = random.Random(seed)
        results = []
        for document_index in range(200):
            lines = []
            for line_index in range(rng.randint(1, 8)):
                billed = D(rng.randint(0, 5000)) / D("100")
                free = D(rng.randint(0, 500)) / D("100")
                if billed + free == 0:
                    billed = D("0.01")
                factor = D(rng.randint(1, 100))
                lines.append(product_line(
                    f"p{line_index}", billed=str(billed), free=str(free),
                    factor=str(factor),
                    price=str(D(rng.randint(0, 1000000)) / D("1000")),
                    price_mode=rng.choice(tuple(PriceBasis)), gst=str(rng.choice((0, 5, 12, 18, 28))),
                    cess=str(rng.choice((0, 1, 12))), eligible=bool(rng.randint(0, 1)),
                    free_policy=rng.choice(tuple(FreeSupplyTaxTreatment)),
                ))
            if not any(line.document_discount_eligible and line.quoted_unit_rate > 0 for line in lines):
                lines[0] = product_line(
                    lines[0].line_id, billed=str(lines[0].billed_quantity),
                    free=str(lines[0].free_quantity), factor=str(lines[0].uom_conversion_factor),
                    price="1", eligible=True,
                )
            discount = DiscountInput(
                DiscountKind.PERCENT, D(rng.randint(0, 10000)) / D("100"),
                rng.choice(tuple(DiscountBasis)),
            )
            result = calculate_document(document(
                *lines, gst_type=rng.choice(tuple(GstType)), discount=discount,
            ))
            assert_document_reconciles(result)
            first = result.products[0]
            reversed_document = calculate_reversal(result, reversal(ProductReversalInput(
                first.line_id, first.billed_quantity, first.free_quantity,
                first.base_billed_quantity, first.base_free_quantity,
                ReversalValueBasis.BASE_QUANTITY, True,
            )))
            assert reversed_document.grand_total == first.line_total
            assert_reversal_reconciles(reversed_document)
            results.append((result.grand_total, result.tax.total_tax_amount))
        return results

    assert run(20260819) == run(20260819)
