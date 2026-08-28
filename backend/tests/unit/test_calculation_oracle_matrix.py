"""Independent arithmetic oracle and deterministic matrices for ERP calculations."""

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP, localcontext
from itertools import product

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
    calculate_document,
    calculate_reversal,
)


D = Decimal
MONEY = D("0.01")
ZERO = D("0.00")
NO_DISCOUNT = DiscountInput(
    DiscountKind.NONE, D("0"), DiscountBasis.PRE_TAX_VALUE
)
EMPTY_STATE = PriorReversalState((), (), ZERO)


def money(value: Decimal) -> Decimal:
    """Test-only HALF_UP oracle; never calls production rounding code."""
    with localcontext() as context:
        context.prec = 64
        return value.quantize(MONEY, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class OracleAmounts:
    net: Decimal
    taxable: Decimal
    cgst: Decimal
    sgst: Decimal
    igst: Decimal
    cess: Decimal
    payable: Decimal

    @property
    def tax(self) -> Decimal:
        return self.cgst + self.sgst + self.igst + self.cess


def oracle_amounts(
    price: Decimal,
    price_basis: PriceBasis,
    gst_rate: Decimal,
    cess_rate: Decimal,
    gst_type: GstType,
    taxability: TaxabilitySnapshot,
) -> OracleAmounts:
    """Derive components directly from the documented line formulas."""
    price = money(price)
    taxable_supply = taxability in {
        TaxabilitySnapshot.TAXABLE,
        TaxabilitySnapshot.ZERO_RATED,
    }
    total_rate = gst_rate + cess_rate
    if price_basis is PriceBasis.TAX_INCLUSIVE and total_rate:
        denominator = D("100") + total_rate
        tax_base = price
        if gst_type is GstType.INTRA_STATE:
            cgst = money(tax_base * gst_rate / D("2") / denominator)
            sgst = cgst
            igst = ZERO
        else:
            cgst = sgst = ZERO
            igst = money(tax_base * gst_rate / denominator)
        cess = money(tax_base * cess_rate / denominator)
        net = price - cgst - sgst - igst - cess
        return OracleAmounts(net, net, cgst, sgst, igst, cess, price)

    net = price
    taxable = net if taxable_supply else ZERO
    if gst_type is GstType.INTRA_STATE:
        cgst = money(taxable * gst_rate / D("200"))
        sgst = cgst
        igst = ZERO
    else:
        cgst = sgst = ZERO
        igst = money(taxable * gst_rate / D("100"))
    cess = money(taxable * cess_rate / D("100"))
    return OracleAmounts(
        net,
        taxable,
        cgst,
        sgst,
        igst,
        cess,
        money(net + cgst + sgst + igst + cess),
    )


def oracle_discount(discount: DiscountInput, basis: Decimal) -> Decimal:
    if discount.kind is DiscountKind.NONE:
        return ZERO
    if discount.kind is DiscountKind.PERCENT:
        return money(basis * discount.value / D("100"))
    return money(discount.value)


def oracle_product(line: ProductLineInput, gst_type: GstType):
    priced_quantity = line.billed_quantity
    if line.free_supply_tax_treatment is FreeSupplyTaxTreatment.INCLUDE_AT_UNIT_PRICE:
        priced_quantity += line.free_quantity
    gross_price = money(priced_quantity * line.quoted_unit_rate)
    gross = oracle_amounts(
        gross_price,
        line.price_basis,
        line.gst_rate,
        line.cess_rate,
        gst_type,
        line.taxability_snapshot,
    )
    basis = (
        gross.net
        if line.line_discount.basis is DiscountBasis.PRE_TAX_VALUE
        else gross.payable
    )
    discount = oracle_discount(line.line_discount, basis)
    if discount == ZERO:
        adjusted = gross
    elif line.line_discount.basis is DiscountBasis.PRE_TAX_VALUE:
        adjusted_basis = PriceBasis.TAX_EXCLUSIVE
        adjusted_price = gross.net - discount
        adjusted = oracle_amounts(
            adjusted_price,
            adjusted_basis,
            line.gst_rate,
            line.cess_rate,
            gst_type,
            line.taxability_snapshot,
        )
    else:
        adjusted_basis = PriceBasis.TAX_INCLUSIVE
        adjusted_price = gross.payable - discount
        adjusted = oracle_amounts(
            adjusted_price,
            adjusted_basis,
            line.gst_rate,
            line.cess_rate,
            gst_type,
            line.taxability_snapshot,
        )
    return gross_price, gross, discount, adjusted


def make_product(
    line_id: str,
    *,
    billed: str,
    free: str,
    price: str,
    price_basis: PriceBasis,
    discount: DiscountInput,
    gst: str,
    cess: str,
    gst_type: GstType,
    taxability: TaxabilitySnapshot = TaxabilitySnapshot.TAXABLE,
    free_treatment: FreeSupplyTaxTreatment = FreeSupplyTaxTreatment.EXCLUDE_FROM_VALUE,
    mechanism: TaxChargeMechanism = TaxChargeMechanism.NORMAL,
    eligible: bool = True,
) -> ProductLineInput:
    del gst_type  # Kept explicit at each call site so matrix cases remain readable.
    billed_value = D(billed)
    free_value = D(free)
    factor = D("2.500000")
    line = ProductLineInput(
        line_id=line_id,
        billed_quantity=billed_value,
        free_quantity=free_value,
        uom_conversion_factor=factor,
        base_billed_quantity=(billed_value * factor).quantize(
            D("0.000001"), rounding=ROUND_HALF_UP
        ),
        base_free_quantity=(free_value * factor).quantize(
            D("0.000001"), rounding=ROUND_HALF_UP
        ),
        quoted_unit_rate=D(price),
        price_basis=price_basis,
        line_discount=discount,
        gst_rate=D(gst),
        cess_rate=D(cess),
        taxability_snapshot=taxability,
        tax_charge_mechanism=mechanism,
        free_supply_tax_treatment=free_treatment,
        document_discount_eligible=eligible,
    )
    return line


def assert_line_matches_oracle(line, source: ProductLineInput, gst_type: GstType) -> None:
    gross_price, gross, discount, expected = oracle_product(source, gst_type)
    assert line.gross_price_amount == gross_price
    assert line.line_discount_amount == discount
    assert line.line_pre_tax_discount_amount == gross.net - expected.net
    assert line.net_value_amount == expected.net
    assert line.gst_taxable_value == expected.taxable
    assert line.tax.cgst_amount == expected.cgst
    assert line.tax.sgst_amount == expected.sgst
    assert line.tax.igst_amount == expected.igst
    assert line.tax.cess_amount == expected.cess
    assert line.tax.total_tax_amount == expected.tax


def test_product_arithmetic_matches_independent_oracle_matrix() -> None:
    quantity_cases = (
        ("0.000001", "0"),
        ("1.250000", "0.750000"),
        ("0", "2.000000"),
    )
    discounts = (
        NO_DISCOUNT,
        DiscountInput(DiscountKind.PERCENT, D("12.500000"), DiscountBasis.PRE_TAX_VALUE),
        DiscountInput(DiscountKind.PERCENT, D("7.250000"), DiscountBasis.PRICE_VALUE),
    )
    tax_profiles = (("0", "0"), ("5", "0"), ("18", "1"), ("28", "12"))
    cases = product(
        quantity_cases,
        ("0.0001", "118.3700"),
        tuple(PriceBasis),
        discounts,
        tax_profiles,
        tuple(GstType),
        tuple(FreeSupplyTaxTreatment),
    )
    for index, (
        (billed, free),
        price,
        price_basis,
        discount,
        (gst, cess),
        gst_type,
        free_treatment,
    ) in enumerate(cases):
        source = make_product(
            f"p{index}",
            billed=billed,
            free=free,
            price=price,
            price_basis=price_basis,
            discount=discount,
            gst=gst,
            cess=cess,
            gst_type=gst_type,
            free_treatment=free_treatment,
        )
        document = DocumentInput(
            (source,),
            (),
            gst_type,
            ZeroRatedMode.NOT_APPLICABLE,
            RoundingPolicy.NONE,
            TaxChargeMechanism.NORMAL,
            NO_DISCOUNT,
        )
        result = calculate_document(document)
        assert_line_matches_oracle(result.products[0], source, gst_type)
        expected_payable = oracle_product(source, gst_type)[3].payable
        assert result.grand_total == expected_payable


@pytest.mark.parametrize(
    "taxability,zero_mode,gst,cess",
    (
        (TaxabilitySnapshot.EXEMPT, ZeroRatedMode.NOT_APPLICABLE, "0", "0"),
        (TaxabilitySnapshot.NIL_RATED, ZeroRatedMode.NOT_APPLICABLE, "0", "0"),
        (TaxabilitySnapshot.NON_GST, ZeroRatedMode.NOT_APPLICABLE, "0", "0"),
        (TaxabilitySnapshot.ZERO_RATED, ZeroRatedMode.WITHOUT_PAYMENT, "0", "0"),
        (TaxabilitySnapshot.ZERO_RATED, ZeroRatedMode.WITH_IGST, "18", "0"),
    ),
)
@pytest.mark.parametrize("price_basis", tuple(PriceBasis))
def test_taxability_modes_match_oracle(
    taxability: TaxabilitySnapshot,
    zero_mode: ZeroRatedMode,
    gst: str,
    cess: str,
    price_basis: PriceBasis,
) -> None:
    source = make_product(
        "classification",
        billed="2.000000",
        free="1.000000",
        price="99.9900",
        price_basis=price_basis,
        discount=DiscountInput(
            DiscountKind.PERCENT, D("5.000000"), DiscountBasis.PRE_TAX_VALUE
        ),
        gst=gst,
        cess=cess,
        gst_type=GstType.INTER_STATE,
        taxability=taxability,
        free_treatment=FreeSupplyTaxTreatment.INCLUDE_AT_UNIT_PRICE,
    )
    result = calculate_document(
        DocumentInput(
            (source,),
            (),
            GstType.INTER_STATE,
            zero_mode,
            RoundingPolicy.NONE,
            TaxChargeMechanism.NORMAL,
            NO_DISCOUNT,
        )
    )
    assert_line_matches_oracle(result.products[0], source, GstType.INTER_STATE)


def allocate_paise(total: Decimal, bases: tuple[Decimal, ...]) -> tuple[Decimal, ...]:
    """Independent proportional allocation expressed as integer paise moves."""
    raw = tuple(total * basis / sum(bases, ZERO) for basis in bases)
    allocated = [money(share) for share in raw]
    remaining_paise = int((total - sum(allocated, ZERO)) / MONEY)
    direction = 1 if remaining_paise > 0 else -1
    while remaining_paise:
        if direction > 0:
            candidates = [i for i in range(len(bases)) if allocated[i] < bases[i]]
            chosen = max(candidates, key=lambda i: (raw[i] - allocated[i], -i))
        else:
            candidates = [i for i in range(len(bases)) if allocated[i] > ZERO]
            chosen = max(candidates, key=lambda i: (allocated[i] - raw[i], -i))
        allocated[chosen] += MONEY * direction
        remaining_paise -= direction
    return tuple(allocated)


@pytest.mark.parametrize("basis", tuple(DiscountBasis))
def test_multi_line_document_discount_residual_matches_paise_oracle(
    basis: DiscountBasis,
) -> None:
    sources = []
    for index, (price, gst, price_basis) in enumerate(
        (
            ("0.0100", "5", PriceBasis.TAX_EXCLUSIVE),
            ("0.0100", "18", PriceBasis.TAX_INCLUSIVE),
            ("0.0100", "28", PriceBasis.TAX_EXCLUSIVE),
        )
    ):
        source = make_product(
            f"residual-{index}",
            billed="1.000000",
            free="0",
            price=price,
            price_basis=price_basis,
            discount=NO_DISCOUNT,
            gst=gst,
            cess="0",
            gst_type=GstType.INTER_STATE,
        )
        sources.append(source)

    undiscounted = [oracle_product(line, GstType.INTER_STATE)[3] for line in sources]
    bases = tuple(
        amounts.net if basis is DiscountBasis.PRE_TAX_VALUE else amounts.payable
        for amounts in undiscounted
    )
    total_discount = D("0.02")
    expected_allocations = allocate_paise(total_discount, bases)
    result = calculate_document(
        DocumentInput(
            tuple(sources),
            (),
            GstType.INTER_STATE,
            ZeroRatedMode.NOT_APPLICABLE,
            RoundingPolicy.NONE,
            TaxChargeMechanism.NORMAL,
            DiscountInput(DiscountKind.AMOUNT, total_discount, basis),
        )
    )
    actual = tuple(line.document_discount_amount for line in result.products)
    assert actual == expected_allocations
    assert sum(actual, ZERO) == total_discount
    assert all(ZERO <= allocation <= eligible for allocation, eligible in zip(actual, bases))
    for source, before, allocation, actual_line in zip(
        sources, undiscounted, expected_allocations, result.products
    ):
        if allocation == ZERO:
            after = before
        elif basis is DiscountBasis.PRE_TAX_VALUE:
            after = oracle_amounts(
                before.net - allocation,
                PriceBasis.TAX_EXCLUSIVE,
                source.gst_rate,
                source.cess_rate,
                GstType.INTER_STATE,
                source.taxability_snapshot,
            )
        else:
            after = oracle_amounts(
                before.payable - allocation,
                PriceBasis.TAX_INCLUSIVE,
                source.gst_rate,
                source.cess_rate,
                GstType.INTER_STATE,
                source.taxability_snapshot,
            )
        assert actual_line.net_value_amount == after.net
        assert actual_line.gst_taxable_value == after.taxable
        assert actual_line.tax.total_tax_amount == after.tax


@pytest.mark.parametrize("gst_type", tuple(GstType))
@pytest.mark.parametrize("price_basis", tuple(PriceBasis))
def test_fixed_line_discount_matches_oracle(
    gst_type: GstType, price_basis: PriceBasis
) -> None:
    source = make_product(
        "fixed-discount",
        billed="3.000000",
        free="1.000000",
        price="99.9999",
        price_basis=price_basis,
        discount=DiscountInput(
            DiscountKind.AMOUNT, D("10.01"), DiscountBasis.PRICE_VALUE
        ),
        gst="18",
        cess="1",
        gst_type=gst_type,
        free_treatment=FreeSupplyTaxTreatment.INCLUDE_AT_UNIT_PRICE,
    )
    result = calculate_document(
        DocumentInput(
            (source,), (), gst_type, ZeroRatedMode.NOT_APPLICABLE,
            RoundingPolicy.NONE, TaxChargeMechanism.NORMAL, NO_DISCOUNT,
        )
    )
    assert_line_matches_oracle(result.products[0], source, gst_type)


@pytest.mark.parametrize("gst_type", tuple(GstType))
@pytest.mark.parametrize("rounding_policy", tuple(RoundingPolicy))
def test_multi_line_cumulative_returns_telescope_every_component(
    gst_type: GstType, rounding_policy: RoundingPolicy
) -> None:
    product_one = make_product(
        "p1",
        billed="7.000000",
        free="0",
        price="17.4999",
        price_basis=PriceBasis.TAX_EXCLUSIVE,
        discount=DiscountInput(
            DiscountKind.PERCENT, D("3.250000"), DiscountBasis.PRE_TAX_VALUE
        ),
        gst="5",
        cess="1",
        gst_type=gst_type,
    )
    product_two = make_product(
        "p2",
        billed="7.000000",
        free="7.000000",
        price="0.0190",
        price_basis=PriceBasis.TAX_INCLUSIVE,
        discount=NO_DISCOUNT,
        gst="18",
        cess="1",
        gst_type=gst_type,
        free_treatment=FreeSupplyTaxTreatment.INCLUDE_AT_UNIT_PRICE,
    )
    charge = ChargeLineInput(
        line_id="freight",
        charge_code="FREIGHT",
        quoted_amount=D("0.07"),
        price_basis=PriceBasis.TAX_INCLUSIVE,
        taxability_snapshot=TaxabilitySnapshot.TAXABLE,
        tax_charge_mechanism=TaxChargeMechanism.NORMAL,
        gst_rate=D("18"),
        cess_rate=D("1"),
        document_discount_eligible=True,
    )
    original = calculate_document(
        DocumentInput(
            (product_one, product_two),
            (charge,),
            gst_type,
            ZeroRatedMode.NOT_APPLICABLE,
            rounding_policy,
            TaxChargeMechanism.NORMAL,
            DiscountInput(
                DiscountKind.PERCENT, D("2.500000"), DiscountBasis.PRE_TAX_VALUE
            ),
        )
    )
    expected_grand_total = original.pre_round_total
    if rounding_policy is RoundingPolicy.NEAREST_RUPEE:
        expected_grand_total = original.pre_round_total.quantize(
            D("1"), rounding=ROUND_HALF_UP
        )
    assert original.grand_total == expected_grand_total
    assert original.rounding_adjustment == expected_grand_total - original.pre_round_total

    state = EMPTY_STATE
    partitions = []
    charge_parts = tuple(map(D, ("0.10", "0.20", "0.30", "0.15", "0.10", "0.10", "0.05")))
    for index, charge_ratio in enumerate(charge_parts):
        final = index == len(charge_parts) - 1
        request = ReversalInput(
            (
                ProductReversalInput(
                    "p1", D("1"), D("0"), D("2.5"), D("0"),
                    ReversalValueBasis.BASE_QUANTITY, final,
                ),
                ProductReversalInput(
                    "p2", D("1"), D("1"), D("2.5"), D("2.5"),
                    ReversalValueBasis.BASE_QUANTITY, final,
                ),
            ),
            (ChargeReversalInput("freight", charge_ratio, final),),
            state,
        )
        current = calculate_reversal(original, request)
        state = accumulate_reversal_state(state, current)
        partitions.append(current)

    scalar_fields = (
        "gross_price_amount",
        "line_discount_amount",
        "document_discount_amount",
        "net_value_amount",
        "gst_taxable_value",
        "pre_round_total",
        "rounding_adjustment",
        "grand_total",
    )
    for field in scalar_fields:
        assert sum((getattr(part, field) for part in partitions), ZERO) == getattr(
            original, field
        )
    for component in ("cgst_amount", "sgst_amount", "igst_amount", "cess_amount"):
        assert sum((getattr(part.tax, component) for part in partitions), ZERO) == getattr(
            original.tax, component
        )
    assert state.rounding_adjustment == original.rounding_adjustment
    for prior_line, original_line in zip(state.products, original.products):
        assert prior_line.net_value_amount == original_line.net_value_amount
        assert prior_line.gst_taxable_value == original_line.gst_taxable_value
        assert prior_line.tax == original_line.tax
    assert state.charges[0].net_value_amount == original.charges[0].net_value_amount
    assert state.charges[0].tax == original.charges[0].tax


def test_reverse_charge_matrix_uses_tax_as_evidence_not_supplier_payable() -> None:
    for gst_type, gst, cess, discount_rate in product(
        tuple(GstType), ("5", "18", "28"), ("0", "1", "12"), ("0", "7.5")
    ):
        discount = DiscountInput(
            DiscountKind.PERCENT,
            D(discount_rate),
            DiscountBasis.PRE_TAX_VALUE,
        )
        source = make_product(
            "rcm",
            billed="2.500000",
            free="0.500000",
            price="99.9900",
            price_basis=PriceBasis.TAX_EXCLUSIVE,
            discount=discount,
            gst=gst,
            cess=cess,
            gst_type=gst_type,
            mechanism=TaxChargeMechanism.REVERSE_CHARGE,
            free_treatment=FreeSupplyTaxTreatment.INCLUDE_AT_UNIT_PRICE,
        )
        result = calculate_document(
            DocumentInput(
                (source,),
                (),
                gst_type,
                ZeroRatedMode.NOT_APPLICABLE,
                RoundingPolicy.NONE,
                TaxChargeMechanism.REVERSE_CHARGE,
                NO_DISCOUNT,
            )
        )
        line = result.products[0]
        assert_line_matches_oracle(line, source, gst_type)
        assert line.line_total == line.net_value_amount
        assert result.recipient_assessed_tax_total == result.tax.total_tax_amount
        assert result.grand_total == result.net_value_amount


def test_unsupported_or_unrepresentable_cases_fail_before_arithmetic() -> None:
    with pytest.raises(ValueError, match="non-taxable.*zero GST"):
        make_product(
            "bad-classification",
            billed="1",
            free="0",
            price="100",
            price_basis=PriceBasis.TAX_EXCLUSIVE,
            discount=NO_DISCOUNT,
            gst="5",
            cess="0",
            gst_type=GstType.INTER_STATE,
            taxability=TaxabilitySnapshot.EXEMPT,
        )
    with pytest.raises(ValueError, match="zero cess"):
        source = make_product(
            "zero-rated-cess-not-permitted",
            billed="1",
            free="0",
            price="100",
            price_basis=PriceBasis.TAX_EXCLUSIVE,
            discount=NO_DISCOUNT,
            gst="18",
            cess="1",
            gst_type=GstType.INTER_STATE,
            taxability=TaxabilitySnapshot.ZERO_RATED,
        )
        DocumentInput(
            (source,), (), GstType.INTER_STATE, ZeroRatedMode.WITH_IGST,
            RoundingPolicy.NONE, TaxChargeMechanism.NORMAL, NO_DISCOUNT,
        )
    valid_source = make_product(
        "specific-cess-not-representable",
        billed="1",
        free="0",
        price="100",
        price_basis=PriceBasis.TAX_EXCLUSIVE,
        discount=NO_DISCOUNT,
        gst="18",
        cess="0",
        gst_type=GstType.INTER_STATE,
    )
    with pytest.raises(TypeError, match="unexpected keyword.*cess_amount_per_unit"):
        ProductLineInput(
            **valid_source.__dict__,
            cess_amount_per_unit=D("1.00"),
        )
    with pytest.raises(ValueError, match="monetary value exceeds"):
        charge = ChargeLineInput(
            line_id="overflow",
            charge_code="FREIGHT",
            quoted_amount=D("999999999999999999.99"),
            price_basis=PriceBasis.TAX_EXCLUSIVE,
            taxability_snapshot=TaxabilitySnapshot.TAXABLE,
            tax_charge_mechanism=TaxChargeMechanism.NORMAL,
            gst_rate=D("1"),
            cess_rate=D("0"),
            document_discount_eligible=False,
        )
        calculate_document(
            DocumentInput(
                (), (charge,), GstType.INTER_STATE, ZeroRatedMode.NOT_APPLICABLE,
                RoundingPolicy.NONE, TaxChargeMechanism.NORMAL, NO_DISCOUNT,
            )
        )
