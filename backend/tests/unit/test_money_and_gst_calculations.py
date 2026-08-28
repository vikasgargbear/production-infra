from decimal import Decimal
from itertools import product
import random

import pytest

from app.api.services.purchase.calculations import PurchaseCalculator
from app.api.services.returns.return_calculation import ReturnCalculator
from app.api.services.sales.calculation import calculate_sales_totals
from app.api.shared.calculations import calculate_gst_components, calculate_line_item
from app.core.money import money, rupees


def _sales_totals(items, gst_type="CGST/SGST", **kwargs):
    """Test helper that models rates after server authority has resolved them."""
    resolved = [
        {
            **item,
            "resolved_gst_percent": item.get("gst_percent", 0),
        }
        for item in items
    ]
    return calculate_sales_totals(resolved, gst_type, **kwargs)


def test_commercial_rounding_is_half_up():
    assert money("1.005") == Decimal("1.01")
    assert rupees("10.50") == Decimal("11")


def test_gst_components_are_exact_and_sum_to_total():
    result = calculate_gst_components(
        Decimal("156.92"), Decimal("5"), "CGST/SGST"
    )

    assert result["cgst_amount"] == Decimal("3.92")
    assert result["sgst_amount"] == Decimal("3.92")
    assert result["total_tax_amount"] == (
        result["cgst_amount"] + result["sgst_amount"]
    )


@pytest.mark.parametrize(
    "taxable,rate,gst_type",
    [
        ("-0.01", "18", "IGST"),
        ("100", "-1", "IGST"),
        ("100", "18", "unknown"),
        ("NaN", "18", "IGST"),
    ],
)
def test_gst_components_fail_closed_for_invalid_inputs(taxable, rate, gst_type):
    with pytest.raises(ValueError):
        calculate_gst_components(
            Decimal(taxable), Decimal(rate), gst_type
        )


def test_line_item_rejects_invalid_business_values():
    with pytest.raises(ValueError, match="discount_percent"):
        calculate_line_item(1, 100, 101, 18)

    with pytest.raises(ValueError, match="finite"):
        calculate_line_item(float("inf"), 100, 0, 18)


def test_invoice_discount_is_apportioned_before_gst_with_no_residual_drift():
    result = _sales_totals(
        items=[
            {
                "quantity": 2,
                "unit_price": 100,
                "discount_percent": 10,
                "gst_percent": 5,
            },
            {
                "quantity": 3,
                "unit_price": 200,
                "discount_percent": 0,
                "gst_percent": 18,
            },
        ],
        gst_type="CGST/SGST",
        discount_type="fixed",
        discount_amount=100,
    )

    assert result["subtotal_amount"] == 800.0
    assert result["discount_amount"] == 20.0
    assert result["scheme_discount"] == 100.0
    assert result["taxable_amount"] == 680.0
    assert result["total_tax_amount"] == 102.0
    assert result["final_amount"] == 782.0
    assert sum(item["scheme_discount"] for item in result["calculated_items"]) == 100.0
    assert sum(item["taxable_amount"] for item in result["calculated_items"]) == 680.0
    assert sum(item["total_tax_amount"] for item in result["calculated_items"]) == 102.0


def test_invoice_ignores_client_supplied_calculated_amounts():
    result = _sales_totals(
        items=[{
            "quantity": 1,
            "unit_price": 100,
            "discount_percent": 0,
            "gst_percent": 18,
            "taxable_amount": 1,
            "igst_amount": 0,
            "line_total": 1,
        }],
        gst_type="IGST",
    )

    assert result["taxable_amount"] == 100.0
    assert result["igst_amount"] == 18.0
    assert result["final_amount"] == 118.0


def test_fixed_discount_cannot_make_taxable_amount_negative():
    with pytest.raises(ValueError, match="cannot exceed"):
        _sales_totals(
            items=[{
                "quantity": 1,
                "unit_price": 100,
                "discount_percent": 0,
                "gst_percent": 18,
            }],
            discount_type="fixed",
            discount_amount=100.01,
        )


@pytest.mark.parametrize(
    "items,kwargs,error",
    [
        ([], {}, "at least one"),
        ([{"quantity": 1, "unit_price": 1}], {"discount_type": "unknown"}, "discount_type"),
        ([{"quantity": 1, "free_quantity": -1, "unit_price": 1}], {}, "free_quantity"),
    ],
)
def test_invoice_rejects_invalid_document_shapes(items, kwargs, error):
    with pytest.raises(ValueError, match=error):
        _sales_totals(items=items, **kwargs)


def test_invoice_accepts_string_document_discounts_from_json_payloads():
    result = _sales_totals(
        items=[{"quantity": "2", "unit_price": "100", "gst_percent": "18"}],
        gst_type="IGST",
        discount_type="percentage",
        discount_percent="12.5",
    )

    assert result["scheme_discount"] == 25.0
    assert result["taxable_amount"] == 175.0
    assert result["igst_amount"] == 31.5


def test_line_calculation_matrix_covers_prices_quantities_discounts_and_gst():
    quantities = ["0", "0.01", "1", "2.5", "9999"]
    prices = ["0", "0.01", "1.005", "99.99", "1234.567"]
    discounts = ["0", "1", "12.5", "100"]
    gst_rates = ["0", "5", "12", "18", "28"]
    gst_types = ["CGST/SGST", "IGST"]

    for quantity, price, discount, gst_rate, gst_type in product(
        quantities, prices, discounts, gst_rates, gst_types
    ):
        result = calculate_line_item(
            Decimal(quantity), Decimal(price), Decimal(discount), Decimal(gst_rate), gst_type
        )
        subtotal = Decimal(str(result["subtotal"]))
        discount_amount = Decimal(str(result["discount_amount"]))
        taxable = Decimal(str(result["taxable_amount"]))
        cgst = Decimal(str(result["cgst_amount"]))
        sgst = Decimal(str(result["sgst_amount"]))
        igst = Decimal(str(result["igst_amount"]))
        total_tax = Decimal(str(result["total_tax"]))
        line_total = Decimal(str(result["line_total"]))

        assert subtotal >= 0
        assert discount_amount >= 0
        assert taxable == subtotal - discount_amount
        assert total_tax == cgst + sgst + igst
        assert line_total == taxable + total_tax
        if gst_type == "IGST":
            assert cgst == 0 and sgst == 0
        else:
            assert igst == 0 and cgst == sgst


def test_multi_item_invoice_matrix_reconciles_every_header_and_line_total():
    rng = random.Random(20260819)
    gst_rates = [0, 5, 12, 18, 28]

    for gst_type in ["CGST/SGST", "IGST"]:
        for _ in range(250):
            items = []
            for product_id in range(1, rng.randint(2, 9)):
                items.append({
                    "product_id": product_id,
                    "quantity": str(Decimal(rng.randint(1, 5000)) / Decimal("100")),
                    "free_quantity": str(Decimal(rng.randint(0, 1000)) / Decimal("100")),
                    "unit_price": str(Decimal(rng.randint(0, 1000000)) / Decimal("1000")),
                    "discount_percent": str(Decimal(rng.randint(0, 10000)) / Decimal("100")),
                    "gst_percent": rng.choice(gst_rates),
                })

            preliminary = _sales_totals(items=items, gst_type=gst_type)
            discount_ceiling = Decimal(str(preliminary["taxable_amount"]))
            document_discount = money(discount_ceiling * Decimal(rng.randint(0, 100)) / Decimal("100"))
            result = _sales_totals(
                items=items,
                gst_type=gst_type,
                discount_type="fixed",
                discount_amount=document_discount,
                freight_charges=str(Decimal(rng.randint(0, 10000)) / Decimal("100")),
            )

            lines = result["calculated_items"]
            assert money(sum(Decimal(str(line["scheme_discount"])) for line in lines)) == money(
                result["scheme_discount"]
            )
            assert money(sum(Decimal(str(line["taxable_amount"])) for line in lines)) == money(
                result["taxable_amount"]
            )
            assert money(sum(Decimal(str(line["cgst_amount"])) for line in lines)) == money(
                result["cgst_amount"]
            )
            assert money(sum(Decimal(str(line["sgst_amount"])) for line in lines)) == money(
                result["sgst_amount"]
            )
            assert money(sum(Decimal(str(line["igst_amount"])) for line in lines)) == money(
                result["igst_amount"]
            )
            assert money(
                Decimal(str(result["cgst_amount"]))
                + Decimal(str(result["sgst_amount"]))
                + Decimal(str(result["igst_amount"]))
            ) == money(result["total_tax_amount"])
            assert all(Decimal(str(line["taxable_amount"])) >= 0 for line in lines)


def test_purchase_line_matrix_reconciles_gst_and_preserves_input_precision():
    for quantity, price, discount, gst_rate, gst_type in product(
        ["0.001", "1", "2.5", "100"],
        ["0", "0.01", "1.005", "99.9999", "1234.5678"],
        ["0", "12.5", "50", "100"],
        ["0", "5", "12", "18", "28"],
        ["CGST/SGST", "IGST"],
    ):
        result = PurchaseCalculator.calculate_item({
            "quantity": quantity,
            "unit_price": price,
            "discount_percent": discount,
            "gst_percent": gst_rate,
        }, gst_type)

        assert result.quantity == Decimal(quantity)
        assert result.unit_price == Decimal(price)
        assert result.taxable_amount == result.line_total - result.discount_amount
        assert result.tax_amount == (
            result.cgst_amount + result.sgst_amount + result.igst_amount
        )
        if gst_type == "IGST":
            assert result.cgst_amount == result.sgst_amount == 0
        else:
            assert result.igst_amount == 0


def test_purchase_totals_keep_insurance_separate_and_reconcile_lines():
    result = PurchaseCalculator.calculate_supplier_invoice_totals(
        items=[
            {"quantity": "2.5", "unit_price": "100.005", "discount_percent": "10", "gst_percent": "5"},
            {"quantity": "3", "unit_price": "9.99", "discount_percent": "0", "gst_percent": "18"},
        ],
        gst_type="CGST/SGST",
        freight_charges="10.50",
        insurance_charges="7.25",
        other_charges="3.75",
        tds_percent="1",
    )

    lines = result["calculated_items"]
    assert money(sum(Decimal(str(line["taxable_amount"])) for line in lines)) == money(result["taxable_amount"])
    assert money(sum(Decimal(str(line["tax_amount"])) for line in lines)) == money(result["tax_amount"])
    assert result["insurance_charges"] == 7.25
    assert result["other_charges"] == 3.75
    assert result["tds_amount"] == float(
        money(Decimal(str(result["taxable_amount"])) / Decimal("100"))
    )


def test_return_matrix_reconciles_paid_and_free_quantities():
    for quantity, paid, free, price, discount, rate, gst_type in product(
        ["1", "2.5"],
        ["0", "1"],
        ["0", "0.5"],
        ["0.01", "1.005", "99.99"],
        ["0", "12.5", "100"],
        ["0", "5", "18", "28"],
        ["CGST/SGST", "IGST"],
    ):
        result = ReturnCalculator.calculate_return_totals(
            [{
                "return_quantity": quantity,
                "paid_quantity": paid,
                "free_quantity": free,
                "unit_price": price,
                "discount_percent": discount,
                "tax_percent": rate,
            }],
            gst_type,
            include_gst=True,
            cap_to_paid_quantity=True,
            exclude_free_quantity_from_taxable=True,
        )

        assert result["total_return_quantity"] == Decimal(quantity)
        assert result["tax_amount"] == (
            result["cgst_amount"] + result["sgst_amount"] + result["igst_amount"]
        )
        if gst_type == "IGST":
            assert result["cgst_amount"] == result["sgst_amount"] == 0
        else:
            assert result["igst_amount"] == 0


@pytest.mark.parametrize(
    "calculator,args,error",
    [
        (PurchaseCalculator.calculate_item, ({"quantity": -1, "unit_price": 1},), "quantity"),
        (PurchaseCalculator.calculate_item, ({"quantity": 1, "unit_price": "NaN"},), "finite"),
        (
            ReturnCalculator.calculate_return_totals,
            ([], "CGST/SGST", True, False, False),
            "at least one",
        ),
    ],
)
def test_purchase_and_return_calculators_fail_closed(calculator, args, error):
    with pytest.raises(ValueError, match=error):
        calculator(*args)
