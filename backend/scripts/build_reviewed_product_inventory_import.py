#!/usr/bin/env python3
"""Build reviewed product/batch import requests from the reconciled migration CSVs.

This does not parse legacy files and does not write ERP data.  It promotes only the
already-reconciled rows into deterministic request batches for the canonical history
API; the database cutover later turns those facts into ordinary ERP records.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from uuid import UUID


MONEY = Decimal("0.01")
QUANTITY = Decimal("0.000001")
HSN = re.compile(r"^[0-9]{4,8}$")


def _decimal(value: str, *, scale: Decimal) -> Decimal:
    return Decimal((value or "0").strip()).quantize(scale, rounding=ROUND_HALF_UP)


def _date(value: str, *, required: bool = True) -> date | None:
    raw = (value or "").strip()
    if not raw:
        if required:
            raise ValueError("required date is missing")
        return None
    for pattern in ("%Y%m%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, pattern).date()
        except ValueError:
            pass
    raise ValueError(f"unsupported date {raw!r}")


def _read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as stream:
        return list(csv.DictReader(stream))


def _id_map(path: Path | None) -> dict[str, str]:
    if path is None:
        return {}
    result: dict[str, str] = {}
    for row in _read_csv(path):
        code = (row.get("source_product_code") or "").strip()
        identifier = (row.get("product_id") or "").strip()
        if not code or code in result:
            raise ValueError("product ID map contains a missing or duplicate source code")
        result[code] = str(UUID(identifier))
    return result


def build_requests(
    *,
    products_path: Path,
    batches_path: Path,
    organization_id: str,
    branch_id: str,
    dataset_id: str,
    opening_date: date,
    product_ids_path: Path | None = None,
) -> tuple[list[dict], dict]:
    organization_id = str(UUID(organization_id))
    branch_id = str(UUID(branch_id))
    product_ids = _id_map(product_ids_path)
    products = [row for row in _read_csv(products_path) if row["stock_state"] == "ready"]
    staged_batches: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in _read_csv(batches_path):
        if row["selection_state"] == "staged":
            staged_batches[row["source_product_code"].strip()].append(row)

    seen_codes: set[str] = set()
    seen_names: set[str] = set()
    facts: list[dict] = []
    positive_products = 0
    zero_products = 0
    excluded_batches: Counter[str] = Counter()
    for row in sorted(products, key=lambda item: item["source_product_code"]):
        code = row["source_product_code"].strip()
        name = row["product_name"].strip()
        normalized_name = " ".join(name.lower().split())
        if not code or code in seen_codes or not name or normalized_name in seen_names:
            raise ValueError("reviewed products require unique source codes and names")
        seen_codes.add(code)
        seen_names.add(normalized_name)
        if row["product_kind"].strip().lower() != "medicine":
            raise ValueError(f"{code}: reviewed product kind must be medicine")
        uom = row["base_uom_code"].strip()
        company = (row["manufacturer_candidate"] or row["company_candidate"]).strip()
        hsn = row["hsn_sac"].strip()
        gst = _decimal(row["gst_rate"], scale=QUANTITY)
        if not uom or not company or not HSN.fullmatch(hsn) or gst < 0:
            raise ValueError(f"{code}: reviewed setup facts are incomplete")
        raw_quantity = _decimal(row["cutover_quantity"], scale=QUANTITY)
        raw_value = _decimal(row["cutover_value"], scale=MONEY)
        source_batches = staged_batches.pop(code, [])
        key_counts = Counter(
            item["batch_number"].strip().lower() for item in source_batches
        )
        product_batches: list[dict] = []
        for batch in source_batches:
            number = batch["batch_number"].strip()
            if not number:
                excluded_batches["missing_batch_number"] += 1
                continue
            if key_counts[number.lower()] > 1:
                excluded_batches["duplicate_batch_number"] += 1
                continue
            try:
                batch_qty = _decimal(batch["quantity"], scale=QUANTITY)
                batch_amount = _decimal(batch["inventory_value"], scale=MONEY)
                mrp = _decimal(batch["mrp"], scale=MONEY)
                expiry = _date(batch["expires_on"])
                manufactured_on = _date(batch["manufactured_on"], required=False)
            except (ValueError, ArithmeticError):
                excluded_batches["invalid_batch_fact"] += 1
                continue
            if batch_qty <= 0 or batch_amount <= 0:
                excluded_batches["nonpositive_stock"] += 1
                continue
            if mrp <= 0:
                excluded_batches["missing_mrp"] += 1
                continue
            if expiry <= opening_date:
                excluded_batches["expired_at_cutover"] += 1
                continue
            if manufactured_on and manufactured_on > expiry:
                excluded_batches["invalid_manufacture_date"] += 1
                continue
            product_batches.append(
                {
                    **batch,
                    "_number": number,
                    "_quantity": batch_qty,
                    "_amount": batch_amount,
                    "_mrp": mrp,
                    "_expiry": expiry,
                    "_manufactured_on": manufactured_on,
                }
            )
        quantity = sum(
            (item["_quantity"] for item in product_batches), Decimal(0)
        ).quantize(QUANTITY)
        value = sum(
            (item["_amount"] for item in product_batches), Decimal(0)
        ).quantize(MONEY)
        if quantity > 0:
            positive_products += 1
        else:
            zero_products += 1

        product_fact = {
            "source_kind": "product",
            "record_key": f"reviewed-product:{code}",
            "event_date": opening_date.isoformat(),
            "product_code": code,
            "product_name": name,
            "quantity": str(quantity),
            "inventory_value": str(value),
            "selection_state": "reviewed",
            "payload": {
                "source_product_code": code,
                "source_company": company,
                "product_kind": "medicine",
                "base_uom_code": uom,
                "hsn_code": hsn,
                "gst_rate": str(gst),
                "hsn_gst_candidate_unique": True,
                "batch_reconciliation_status": "exact" if quantity > 0 else "none",
                "source_cutover_quantity": str(raw_quantity),
                "source_cutover_value": str(raw_value),
                "reviewed_saleable_quantity": str(quantity),
                "reviewed_saleable_value": str(value),
            },
        }
        if code in product_ids:
            product_fact["product_id"] = product_ids[code]
        facts.append(product_fact)

        for batch in sorted(product_batches, key=lambda item: item["_number"]):
            number = batch["_number"]
            expiry = batch["_expiry"]
            batch_qty = batch["_quantity"]
            batch_amount = batch["_amount"]
            mrp = batch["_mrp"]
            manufactured_on = batch["_manufactured_on"]
            batch_cost = (batch_amount / batch_qty).quantize(
                QUANTITY, rounding=ROUND_HALF_UP
            )
            if (batch_qty * batch_cost).quantize(MONEY, rounding=ROUND_HALF_UP) != batch_amount:
                raise ValueError(f"{code}/{number}: exact unit cost cannot reproduce inventory value")
            payload = {
                "mrp": str(mrp),
                "unit_cost": str(batch_cost),
                "base_uom_code": uom,
                "mrp_uom_code": uom,
                "mrp_uom_multiplier": "1.000000",
            }
            if manufactured_on:
                payload["manufactured_on"] = manufactured_on.isoformat()
            facts.append(
                {
                    "source_kind": "batch",
                    "record_key": f"reviewed-batch:{code}:{number}",
                    "event_date": expiry.isoformat(),
                    "product_id": product_ids.get(code),
                    "product_code": code,
                    "product_name": name,
                    "batch_number": number,
                    "quantity": str(batch_qty),
                    "inventory_value": str(batch_amount),
                    "selection_state": "reviewed",
                    "payload": payload,
                }
            )
    confirmation = f"IMPORT-HISTORY:{organization_id}:{dataset_id}"
    requests = [
        {
            "dataset_id": dataset_id,
            "branch_id": branch_id,
            "confirmation": confirmation,
            "facts": facts[offset : offset + 500],
        }
        for offset in range(0, len(facts), 500)
    ]
    summary = {
        "dataset_id": dataset_id,
        "organization_id": organization_id,
        "branch_id": branch_id,
        "opening_date": opening_date.isoformat(),
        "products": len(products),
        "positive_stock_products": positive_products,
        "zero_stock_products": zero_products,
        "batches": sum(1 for fact in facts if fact["source_kind"] == "batch"),
        "opening_quantity": str(sum(
            (Decimal(fact["quantity"]) for fact in facts if fact["source_kind"] == "batch"),
            Decimal(0),
        ).quantize(QUANTITY)),
        "opening_value": str(sum(
            (Decimal(fact["inventory_value"]) for fact in facts if fact["source_kind"] == "batch"),
            Decimal(0),
        ).quantize(MONEY)),
        "excluded_batches": dict(sorted(excluded_batches.items())),
        "staged_batches_outside_reviewed_products": sum(
            len(rows) for rows in staged_batches.values()
        ),
        "facts": len(facts),
        "request_batches": len(requests),
    }
    return requests, summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--products", type=Path, required=True)
    parser.add_argument("--batches", type=Path, required=True)
    parser.add_argument("--product-ids", type=Path)
    parser.add_argument("--organization-id", required=True)
    parser.add_argument("--branch-id", required=True)
    parser.add_argument("--dataset-id", required=True)
    parser.add_argument("--opening-date", type=date.fromisoformat, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    requests, summary = build_requests(
        products_path=args.products,
        batches_path=args.batches,
        product_ids_path=args.product_ids,
        organization_id=args.organization_id,
        branch_id=args.branch_id,
        dataset_id=args.dataset_id,
        opening_date=args.opening_date,
    )
    args.output.mkdir(parents=True, exist_ok=False)
    for index, request in enumerate(requests, start=1):
        (args.output / f"facts-{index:03d}.json").write_text(
            json.dumps(request, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
    (args.output / "summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary, sort_keys=True))


if __name__ == "__main__":
    main()
