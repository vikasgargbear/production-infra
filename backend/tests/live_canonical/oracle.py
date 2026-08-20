"""Independent paise-precision oracle; deliberately imports no app calculator."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP, localcontext
from typing import Any, Iterable


ZERO = Decimal("0.00")
MONEY = Decimal("0.01")
HUNDRED = Decimal("100")


def decimal(value: Any) -> Decimal:
    if not isinstance(value, str):
        raise TypeError("oracle numeric inputs must be decimal strings")
    result = Decimal(value)
    if not result.is_finite():
        raise ValueError("oracle numeric inputs must be finite")
    return result


def money(value: Decimal) -> Decimal:
    with localcontext() as context:
        context.prec = 64
        rounded = value.quantize(MONEY, rounding=ROUND_HALF_UP)
    return ZERO if rounded == 0 else rounded


def _tax(base: Decimal, gst: Decimal, cess: Decimal, supply: str, denominator=HUNDRED):
    cess_amount = money(base * cess / denominator)
    if supply == "inter_state":
        cgst = sgst = ZERO
        igst = money(base * gst / denominator)
    elif supply == "intra_state":
        cgst = money(base * gst / Decimal("2") / denominator)
        sgst = cgst
        igst = ZERO
    else:
        raise ValueError(f"unknown supply type: {supply}")
    return cgst, sgst, igst, cess_amount


def _amounts(
    value: Decimal,
    line: dict[str, Any],
    supply: str,
    *,
    price_basis: str | None = None,
):
    gst = decimal(line["gst_rate"])
    cess = decimal(line.get("cess_rate", "0"))
    taxable = line["taxability"] in {"taxable", "zero_rated"}
    if not taxable:
        gst = cess = Decimal("0")
    effective_basis = price_basis or line["price_basis"]
    if effective_basis == "tax_inclusive" and gst + cess:
        payable = money(value)
        components = _tax(payable, gst, cess, supply, HUNDRED + gst + cess)
        net = payable - sum(components, ZERO)
    else:
        net = money(value)
        components = _tax(net if taxable else ZERO, gst, cess, supply)
        payable = money(net + sum(components, ZERO))
    if line.get("tax_charge_mechanism", "normal") == "reverse_charge":
        payable = net
    return net, components, payable


def _discount(spec: dict[str, str] | None, prefix: str, basis: Decimal):
    if not spec:
        return ZERO
    kind = spec[f"{prefix}_discount_kind"]
    value = decimal(spec[f"{prefix}_discount_value"])
    if kind == "none":
        result = ZERO
    elif kind == "percent":
        result = money(basis * value / HUNDRED)
    elif kind == "amount":
        result = money(value)
    else:
        raise ValueError(f"unsupported {prefix} discount kind: {kind}")
    if result > basis:
        raise ValueError("discount exceeds its basis")
    return result


def _allocate(total: Decimal, bases: list[Decimal]) -> list[Decimal]:
    if total == 0:
        return [ZERO for _ in bases]
    eligible = sum(bases, ZERO)
    if total > eligible or eligible == 0:
        raise ValueError("invalid document discount basis")
    result: list[Decimal] = []
    remaining = total
    last = max(index for index, value in enumerate(bases) if value > 0)
    for index, basis in enumerate(bases):
        if basis == 0:
            share = ZERO
        elif index == last:
            share = remaining
        else:
            share = money(total * basis / eligible)
        result.append(share)
        remaining -= share
    return result


def calculate_document(case: dict[str, Any]) -> dict[str, Any]:
    """Calculate expected header and lines from oracle-only resolved tax facts."""

    supply = case["supply_type"]
    rows = []
    for source in case["lines"]:
        quantity = decimal(source["billed_quantity"])
        free = decimal(source.get("free_quantity", "0"))
        priced_quantity = quantity + (
            free if source.get("free_supply_tax_treatment") == "included_at_unit_rate" else 0
        )
        rate = decimal(source["quoted_unit_rate"])
        gross = money(priced_quantity * rate)
        net, tax, payable = _amounts(gross, source, supply)
        line_discount_spec = source.get("line_discount")
        discount_basis_kind = (
            line_discount_spec.get("line_discount_basis", "taxable_value")
            if line_discount_spec
            else "taxable_value"
        )
        discount_basis = payable if discount_basis_kind == "price_value" else net
        line_discount = _discount(line_discount_spec, "line", discount_basis)
        remaining = discount_basis - line_discount
        net, tax, payable = _amounts(
            remaining,
            source,
            supply,
            price_basis=(
                "tax_inclusive"
                if discount_basis_kind == "price_value"
                else "tax_exclusive"
            ),
        )
        rows.append(
            {
                "line_key": source["line_key"],
                "source": source,
                "gross_amount": gross,
                "line_discount_amount": line_discount,
                "document_discount_amount": ZERO,
                "net_value_amount": net,
                "gst_taxable_value": (
                    net
                    if source["taxability"] in {"taxable", "zero_rated"}
                    else ZERO
                ),
                "tax": tax,
                "line_total": payable,
            }
        )

    doc_spec = case.get("document_discount")
    if doc_spec:
        basis_kind = doc_spec.get("document_discount_basis", "taxable_value")
        bases = [
            (row["line_total"] if basis_kind == "price_value" else row["net_value_amount"])
            if row["source"].get("document_discount_eligible", True)
            else ZERO
            for row in rows
        ]
        doc_total = _discount(doc_spec, "document", sum(bases, ZERO))
        for row, share in zip(rows, _allocate(doc_total, bases)):
            row["document_discount_amount"] = share
            source = row["source"]
            basis = row["line_total"] if basis_kind == "price_value" else row["net_value_amount"]
            row["net_value_amount"], row["tax"], row["line_total"] = _amounts(
                basis - share,
                source,
                supply,
                price_basis=(
                    "tax_inclusive" if basis_kind == "price_value" else "tax_exclusive"
                ),
            )
            row["gst_taxable_value"] = (
                row["net_value_amount"]
                if source["taxability"] in {"taxable", "zero_rated"}
                else ZERO
            )

    totals = {
        "subtotal": sum((row["gross_amount"] for row in rows), ZERO),
        "discount_total": sum(
            (row["line_discount_amount"] + row["document_discount_amount"] for row in rows),
            ZERO,
        ),
        "net_value_total": sum((row["net_value_amount"] for row in rows), ZERO),
        "gst_taxable_total": sum((row["gst_taxable_value"] for row in rows), ZERO),
        "cgst_total": sum((row["tax"][0] for row in rows), ZERO),
        "sgst_total": sum((row["tax"][1] for row in rows), ZERO),
        "igst_total": sum((row["tax"][2] for row in rows), ZERO),
        "cess_total": sum((row["tax"][3] for row in rows), ZERO),
        "recipient_assessed_tax_total": sum(
            (
                sum(row["tax"], ZERO)
                if row["source"].get("tax_charge_mechanism") == "reverse_charge"
                else ZERO
                for row in rows
            ),
            ZERO,
        ),
    }
    pre_round = sum((row["line_total"] for row in rows), ZERO)
    if case.get("rounding_policy") == "nearest_rupee":
        grand = pre_round.quantize(Decimal("1"), rounding=ROUND_HALF_UP).quantize(MONEY)
    else:
        grand = pre_round
    totals["rounding_adjustment"] = grand - pre_round
    totals["grand_total"] = grand
    totals["lines"] = rows
    return totals


def calculate_reversal(
    original: dict[str, Any],
    cumulative_ratios: dict[str, str],
    prior: dict[str, dict[str, Decimal]] | None = None,
    gst_tax_treatment: str = "statutory",
) -> tuple[dict[str, Any], dict[str, dict[str, Decimal]]]:
    """Return cumulative-target-minus-prior paise for partial/final reversals."""

    prior = prior or {}
    current: dict[str, dict[str, Decimal]] = {}
    components = (
        "net_value_amount",
        "gst_taxable_value",
        "cgst_amount",
        "sgst_amount",
        "igst_amount",
        "cess_amount",
        "recipient_assessed_tax_amount",
        "line_total",
    )
    totals = {key: ZERO for key in components}
    for line in original["lines"]:
        key = line["line_key"]
        ratio = decimal(cumulative_ratios[key])
        if ratio < 0 or ratio > 1:
            raise ValueError("reversal cumulative ratio must be between zero and one")
        source_values = {
            "net_value_amount": line["net_value_amount"],
            "gst_taxable_value": line["gst_taxable_value"],
            "cgst_amount": line["tax"][0],
            "sgst_amount": line["tax"][1],
            "igst_amount": line["tax"][2],
            "cess_amount": line["tax"][3],
            "recipient_assessed_tax_amount": (
                sum(line["tax"], ZERO)
                if line["source"].get("tax_charge_mechanism") == "reverse_charge"
                else ZERO
            ),
            "line_total": line["line_total"],
        }
        previous = prior.get(key, {})
        cumulative: dict[str, Decimal] = {}
        if gst_tax_treatment == "commercial_only":
            prior_financial = previous.get("net_value_amount", ZERO)
            if line["source"].get("tax_charge_mechanism") != "reverse_charge":
                prior_financial += sum(
                    (previous.get(component, ZERO) for component in (
                        "cgst_amount", "sgst_amount", "igst_amount", "cess_amount"
                    )),
                    ZERO,
                )
            financial_target = (
                source_values["line_total"]
                if ratio == 1
                else money(source_values["line_total"] * ratio)
            )
            financial_credit = financial_target - prior_financial
            if financial_credit < 0:
                raise ValueError("commercial-only reversal moved financial credit backwards")
            totals["net_value_amount"] += financial_credit
            totals["line_total"] += financial_credit
            cumulative = dict(previous)
            cumulative["net_value_amount"] = (
                previous.get("net_value_amount", ZERO) + financial_credit
            )
            cumulative["line_total"] = (
                previous.get("line_total", ZERO) + financial_credit
            )
            for component in components:
                cumulative.setdefault(component, ZERO)
            current[key] = cumulative
            continue
        for component in components:
            target = (
                source_values[component]
                if ratio == 1
                else money(source_values[component] * ratio)
            )
            reversed_now = target - previous.get(component, ZERO)
            if reversed_now < 0:
                raise ValueError("reversal cumulative ratio moved backwards")
            totals[component] += reversed_now
            cumulative[component] = target
        current[key] = cumulative
    return (
        {
            "net_value_total": totals["net_value_amount"],
            "gst_taxable_total": totals["gst_taxable_value"],
            "cgst_total": totals["cgst_amount"],
            "sgst_total": totals["sgst_amount"],
            "igst_total": totals["igst_amount"],
            "cess_total": totals["cess_amount"],
            "recipient_assessed_tax_total": totals["recipient_assessed_tax_amount"],
            "grand_total": totals["line_total"],
            "gst_tax_treatment": gst_tax_treatment,
        },
        current,
    )


def calculate_withholding(case: dict[str, Any]) -> dict[str, Decimal]:
    gross = money(decimal(case["gross_basis_amount"]))
    threshold = money(decimal(case.get("transaction_threshold", "0")))
    prior = money(decimal(case.get("prior_aggregate_basis", "0")))
    if case.get("threshold_application", "full_amount") == "excess_only":
        eligible = max(ZERO, prior + gross - threshold) - max(ZERO, prior - threshold)
    elif prior + gross > threshold:
        eligible = gross
    else:
        eligible = ZERO
    withheld = money(eligible * decimal(case["withholding_rate"]) / HUNDRED)
    return {
        "basis_amount": gross,
        "eligible_basis_amount": eligible,
        "withheld_amount": withheld,
        "cash_disbursed_amount": gross - withheld,
        "gross_advance_amount": gross,
    }


def as_wire_money(values: dict[str, Any], keys: Iterable[str]) -> dict[str, str]:
    return {key: format(money(values[key]), ".2f") for key in keys}
