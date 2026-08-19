"""Credential-gated live calculation and Supabase persistence matrix."""

from decimal import Decimal, ROUND_HALF_UP
from itertools import product

import pytest

from tests.live_erp.test_live_write_contracts import _today_iso


CENT = Decimal("0.01")


def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENT, rounding=ROUND_HALF_UP)


def _rupees(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def _expected_line(item, gst_type: str):
    quantity = Decimal(str(item["quantity"]))
    unit_price = Decimal(str(item["unit_price"]))
    discount_percent = Decimal(str(item.get("discount_percent", 0)))
    gst_percent = Decimal(str(item.get("gst_percent", 0)))
    subtotal = _money(quantity * unit_price)
    discount = _money(subtotal * discount_percent / Decimal("100"))
    taxable = subtotal - discount

    if gst_type == "IGST":
        igst = _money(taxable * gst_percent / Decimal("100"))
        cgst = sgst = Decimal("0")
    else:
        half_rate = gst_percent / Decimal("2")
        cgst = _money(taxable * half_rate / Decimal("100"))
        sgst = _money(taxable * half_rate / Decimal("100"))
        igst = Decimal("0")

    total_tax = cgst + sgst + igst
    return {
        "subtotal": subtotal,
        "discount_amount": discount,
        "taxable_amount": taxable,
        "cgst_amount": cgst,
        "sgst_amount": sgst,
        "igst_amount": igst,
        "total_tax_amount": total_tax,
        "line_total": taxable + total_tax,
    }


@pytest.mark.parametrize("gst_type", ["CGST/SGST", "IGST"])
def test_live_calculation_preview_matrix(api_json, gst_type):
    quantities = ["0.01", "1", "2.5", "100"]
    prices = ["0", "0.01", "1.005", "99.99", "1234.567"]
    discounts = ["0", "12.5", "100"]
    gst_rates = ["0", "5", "12", "18", "28"]

    for quantity, price, discount, gst_rate in product(
        quantities, prices, discounts, gst_rates
    ):
        item = {
            "product_id": 1,
            "quantity": quantity,
            "unit_price": price,
            "discount_percent": discount,
            "gst_percent": gst_rate,
        }
        response, body = api_json(
            "POST",
            "/api/calculations/invoice",
            payload={"gst_type": gst_type, "items": [item]},
        )
        assert response.status_code == 200, body

        expected = _expected_line(item, gst_type)
        actual = body["line_items"][0]
        for field in (
            "subtotal",
            "discount_amount",
            "taxable_amount",
            "cgst_amount",
            "sgst_amount",
            "igst_amount",
            "total_tax_amount",
            "line_total",
        ):
            assert _money(actual[field]) == expected[field], (
                gst_type,
                item,
                field,
                actual[field],
                expected[field],
            )


def _live_invoice_fixtures(db_query, live_config):
    rows = db_query(
        """
        WITH supply AS (
            SELECT LEFT(COALESCE(ob.branch_gst_number, o.gst_number), 2) AS state_code
            FROM master.org_branches ob
            JOIN master.organizations o ON o.org_id = ob.org_id
            WHERE ob.org_id = %s AND ob.branch_id = %s AND ob.is_active = true
        ), ranked_customers AS (
            SELECT
                c.customer_id,
                c.customer_name,
                LEFT(c.gst_number, 2) = supply.state_code AS is_same_state,
                ROW_NUMBER() OVER (
                    PARTITION BY LEFT(c.gst_number, 2) = supply.state_code
                    ORDER BY c.customer_id
                ) AS rank
            FROM parties.customers c
            CROSS JOIN supply
            WHERE c.org_id = %s
              AND LENGTH(COALESCE(c.gst_number, '')) = 15
        )
        SELECT customer_id, customer_name, is_same_state
        FROM ranked_customers
        WHERE rank = 1
        ORDER BY is_same_state DESC
        """,
        (
            live_config.test_org_id,
            live_config.test_branch_id,
            live_config.test_org_id,
        ),
    )
    by_regime = {"CGST/SGST" if row["is_same_state"] else "IGST": row for row in rows}
    assert set(by_regime) == {"CGST/SGST", "IGST"}, (
        "live test org must have valid same-state and interstate GST customers"
    )

    batches = db_query(
        """
        SELECT DISTINCT ON (b.batch_id)
               b.product_id, b.batch_id, b.batch_number,
               COALESCE(b.mrp_per_unit, 0) AS mrp
        FROM inventory.batches b
        JOIN inventory.location_wise_stock l ON l.batch_id = b.batch_id
        JOIN inventory.storage_locations location
          ON location.location_id = l.location_id
        WHERE b.org_id = %s
          AND l.org_id = %s
          AND location.org_id = %s
          AND location.branch_id = %s
          AND b.batch_status = 'active'
          AND b.quantity_available >= 20
          AND COALESCE(l.quantity_available, 0) >= 20
        ORDER BY b.batch_id DESC, l.stock_id DESC
        LIMIT 3
        """,
        (
            live_config.test_org_id,
            live_config.test_org_id,
            live_config.test_org_id,
            live_config.test_branch_id,
        ),
    )
    assert len(batches) >= 3, "live test org needs three batches with at least 20 units"
    return by_regime, batches


@pytest.mark.parametrize("gst_type", ["CGST/SGST", "IGST"])
def test_live_multi_item_invoice_persists_exact_supabase_totals(
    api_json,
    db_query,
    live_config,
    unique_suffix,
    gst_type,
):
    customers, batches = _live_invoice_fixtures(db_query, live_config)
    customer = customers[gst_type]
    inputs = [
        (batches[0], "1", "10.50", "0", "5", "2"),
        (batches[1], "2", "100.005", "10", "12", "0"),
        (batches[2], "3", "999.99", "33.33", "28", "1"),
    ]
    items = [
        {
            "product_id": batch["product_id"],
            "batch_id": batch["batch_id"],
            "batch_number": batch["batch_number"],
            "quantity": quantity,
            "free_quantity": free_quantity,
            "unit_price": price,
            "mrp": str(batch["mrp"] or price),
            "discount_percent": discount,
            "gst_percent": rate,
        }
        for batch, quantity, price, discount, rate, free_quantity in inputs
    ]
    payload = {
        "customer_id": customer["customer_id"],
        "invoice_date": _today_iso(),
        "discount_type": "fixed",
        "discount_amount": "50.00",
        "notes": f"LIVE calculation matrix {gst_type} {unique_suffix}",
        "items": items,
    }
    invoice_id = None

    try:
        response, body = api_json("POST", "/api/invoices/", payload=payload)
        assert response.status_code == 201, body
        invoice_id = body["invoice_id"]

        header = db_query(
            """
            SELECT subtotal_amount, discount_amount, scheme_discount,
                   taxable_amount, cgst_amount, sgst_amount, igst_amount,
                   total_tax_amount, round_off_amount, final_amount, gst_type
            FROM sales.invoices
            WHERE org_id = %s AND invoice_id = %s
            """,
            (live_config.test_org_id, invoice_id),
        )[0]
        lines = db_query(
            """
            SELECT discount_amount, taxable_amount,
                   cgst_amount, sgst_amount, igst_amount,
                   total_tax_amount, line_total
            FROM sales.invoice_items
            WHERE invoice_id = %s
            ORDER BY invoice_item_id
            """,
            (invoice_id,),
        )
        assert len(lines) == len(items)
        assert header["gst_type"] == gst_type
        assert _money(header["taxable_amount"]) == _money(
            sum(_money(line["taxable_amount"]) for line in lines)
        )
        assert _money(header["cgst_amount"]) == _money(
            sum(_money(line["cgst_amount"]) for line in lines)
        )
        assert _money(header["sgst_amount"]) == _money(
            sum(_money(line["sgst_amount"]) for line in lines)
        )
        assert _money(header["igst_amount"]) == _money(
            sum(_money(line["igst_amount"]) for line in lines)
        )
        assert _money(header["total_tax_amount"]) == (
            _money(header["cgst_amount"])
            + _money(header["sgst_amount"])
            + _money(header["igst_amount"])
        )
        before_round = _money(header["taxable_amount"]) + _money(header["total_tax_amount"])
        assert _money(header["final_amount"]) == _money(_rupees(before_round))
        assert _money(header["round_off_amount"]) == _money(_rupees(before_round) - before_round)
    finally:
        if invoice_id is not None:
            cancel_response, cancel_body = api_json(
                "POST",
                f"/api/invoices/{invoice_id}/cancel",
                payload={
                    "reason": f"LIVE calculation matrix cleanup {unique_suffix}",
                    "create_credit_note": False,
                    "reverse_inventory": True,
                },
            )
            assert cancel_response.status_code == 200, cancel_body
