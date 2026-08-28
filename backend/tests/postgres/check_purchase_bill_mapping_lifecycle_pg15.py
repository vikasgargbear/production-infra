"""Carry reviewed purchase-bill evidence through the persisted purchase chain.

This acceptance fixture joins the non-posting MCP review contract to the real
PO -> GRN -> supplier-invoice command lifecycle.  It runs only against the
explicitly opted-in loopback PostgreSQL 15 Alembic database and never calls a
live MCP or ERP endpoint.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime
from decimal import Decimal
import os
from typing import Any, Mapping
from urllib.parse import quote
from uuid import UUID, uuid4

import psycopg2
from psycopg2.extensions import AsIs, register_adapter
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.routes.canonical_supplier_invoice_reads import posted_supplier_invoice
from mcp_runtime.aasopharma_mcp.purchase_bill_mapping import (
    review_purchase_bill_mapping,
)
from scripts import provision_canonical_demo as fixture

from check_sales_invoice_direct_issue_acceptance import _seed_reference_authority
from check_supplier_invoice_landed_cost_lifecycle_pg15 import (
    _admin_dsn,
    _approve_and_execute,
    _assert_disposable_pg15,
    _configure_fixture_ids,
    _prepare,
    _role_url,
    _service,
)


def _mapping(
    *,
    business_date: date,
    supplier_invoice_number: str,
) -> dict[str, Any]:
    return {
        "review_id": f"pg15-purchase-bill-{uuid4()}",
        "revision": 1,
        "parent_mapping_hash": None,
        "evidence": {
            "source_kind": "image",
            "source_reference": "disposable PostgreSQL 15 fixture",
            "supplier_name": "Synthetic Medicines Distributor Private Limited",
            "supplier_gstin": "27DEMOC5678D1Z5",
            "invoice_number": supplier_invoice_number,
            "invoice_date": business_date.isoformat(),
            "additional_document_fields": [
                {"label": "Taxable value", "value": "5000.00", "uncertain": False},
                {"label": "CGST", "value": "300.00", "uncertain": False},
                {"label": "SGST", "value": "300.00", "uncertain": False},
                {"label": "Invoice total", "value": "5600.00", "uncertain": False},
            ],
        },
        "supplier_resolution": {
            "status": "matched",
            "supplier_id": fixture.IDS["supplier_account"],
            "canonical_name": "Synthetic Medicines Distributor Private Limited",
            "proposed_supplier_name": None,
            "candidate_supplier_ids": [],
            "skip_reason": None,
        },
        "lines": [
            {
                "line_id": "line-1",
                "source_fields": {
                    "description": "Synthetic tablet 500 mg 1*10",
                    "pack": "1*10",
                    "batch": "MAP-BATCH-001",
                    "expiry": "09/28",
                    "mrp": "150.00",
                    "quantity": "20",
                    "free_quantity": "1",
                    "rate": "100.0000",
                    "discount": "0%",
                    "hsn": "30049099",
                    "tax": "12%",
                },
                "uncertain_fields": [],
                "product_resolution": {
                    "status": "matched",
                    "product_id": fixture.IDS["product"],
                    "canonical_name": "Synthetic tablet 500 mg",
                    "candidate_product_ids": [],
                    "proposed_product": None,
                    "skip_reason": None,
                },
            },
            {
                "line_id": "line-2",
                "source_fields": {
                    "description": "Synthetic tablet 500 mg 1*10",
                    "pack": "1*10",
                    "batch": "MAP-BATCH-002",
                    "expiry": "10/28",
                    "mrp": "160.00",
                    "quantity": "30",
                    "free_quantity": "1.5",
                    "rate": "100.0000",
                    "discount": "0%",
                    "hsn": "30049099",
                    "tax": "12%",
                },
                "uncertain_fields": [],
                "product_resolution": {
                    "status": "matched",
                    "product_id": fixture.IDS["product"],
                    "canonical_name": "Synthetic tablet 500 mg",
                    "candidate_product_ids": [],
                    "proposed_product": None,
                    "skip_reason": None,
                },
            },
        ],
        "unresolved_fields": [],
        "skipped_fields": [],
        "explicit_skip_permission": False,
    }


def _ready_mapping(review: Mapping[str, Any]) -> Mapping[str, Any]:
    assert review["status"] == "ready_for_canonical_prepare_validation"
    assert review["next_steps"][0] == {
        "sequence": 1,
        "tool": "erp_purchase_order_prepare",
        "state": "awaiting_canonical_validation",
        "blockers": [],
    }
    assert review["posting_performed"] is False
    mapping = review["mapping"]
    assert mapping["supplier_resolution"]["status"] == "matched"
    assert all(
        line["product_resolution"]["status"] == "matched"
        for line in mapping["lines"]
    )
    return mapping


def _discount(raw: str | None) -> dict[str, str]:
    if raw in {None, "", "0", "0%"}:
        return {
            "line_discount_kind": "none",
            "line_discount_basis": "taxable_value",
            "line_discount_value": "0",
        }
    assert raw.endswith("%"), "fixture accepts only explicit percentage evidence"
    return {
        "line_discount_kind": "percent",
        "line_discount_basis": "taxable_value",
        "line_discount_value": raw[:-1],
    }


def _expiry_month(raw: str) -> str:
    month_text, year_text = raw.split("/", maxsplit=1)
    month = int(month_text)
    year = 2000 + int(year_text)
    assert 1 <= month <= 12
    return date(year, month, 1).isoformat()


def _purchase_order_payload_from_review(
    review: Mapping[str, Any], *, business_date: date
) -> dict[str, Any]:
    mapping = _ready_mapping(review)
    payload = fixture.purchase_order_payload(business_date=business_date)
    payload.update(
        idempotency_key=f"pg15-mapped-po-{review['mapping_hash']}",
        supplier_account_id=mapping["supplier_resolution"]["supplier_id"],
    )
    payload["lines"] = []
    for line in mapping["lines"]:
        source = line["source_fields"]
        payload["lines"].append({
            "product_id": line["product_resolution"]["product_id"],
            # Canonical product validation supplies the active UOM conversion.
            "uom_conversion_id": fixture.IDS["uom_conversion"],
            "billed_quantity": source["quantity"],
            "free_quantity": source["free_quantity"],
            "free_supply_tax_treatment": "excluded_from_taxable_value",
            "quoted_unit_rate": source["rate"],
            "price_basis": "tax_exclusive",
            "line_discount": _discount(source["discount"]),
            "document_discount_eligible": True,
        })
    return payload


def _goods_receipt_payload_from_review(
    review: Mapping[str, Any],
    *,
    purchase_order_id: UUID,
    purchase_order_line_ids: list[UUID],
    business_date: date,
    received_at: datetime,
) -> dict[str, Any]:
    mapping = _ready_mapping(review)
    assert len(purchase_order_line_ids) == len(mapping["lines"])
    payload = fixture.goods_receipt_payload(
        str(purchase_order_id),
        str(purchase_order_line_ids[0]),
        business_date=business_date,
        received_at=received_at,
    )
    payload.update(
        idempotency_key=f"pg15-mapped-grn-{review['mapping_hash']}",
        supplier_account_id=mapping["supplier_resolution"]["supplier_id"],
    )
    template_batch = payload["lines"][0]["batches"][0]
    payload["lines"] = []
    for line, purchase_order_line_id in zip(
        mapping["lines"], purchase_order_line_ids, strict=True
    ):
        source = line["source_fields"]
        batch = deepcopy(template_batch)
        batch.update(
            manufacturer_batch_number=source["batch"],
            expires_on=_expiry_month(source["expiry"]),
            mrp=source["mrp"],
            received_quantity=source["quantity"],
            accepted_quantity=source["quantity"],
            free_quantity=source["free_quantity"],
        )
        payload["lines"].append({
            "purchase_order_line_id": str(purchase_order_line_id),
            "batches": [batch],
        })
    return payload


def _supplier_invoice_payload_from_review(
    review: Mapping[str, Any],
    *,
    goods_receipt_id: UUID,
    goods_receipt_line_ids: list[UUID],
    portal_evidence: dict[str, str],
    business_date: date,
) -> dict[str, Any]:
    mapping = _ready_mapping(review)
    evidence = mapping["evidence"]
    assert len(goods_receipt_line_ids) == len(mapping["lines"])
    assert evidence["invoice_number"] == portal_evidence["supplier_invoice_number"]
    assert evidence["invoice_date"] == business_date.isoformat()
    payload = fixture.supplier_invoice_payload(
        str(goods_receipt_id),
        str(goods_receipt_line_ids[0]),
        portal_evidence,
        business_date=business_date,
    )
    payload.update(
        idempotency_key=f"pg15-mapped-invoice-{review['mapping_hash']}",
        supplier_account_id=mapping["supplier_resolution"]["supplier_id"],
        supplier_invoice_number=evidence["invoice_number"],
        invoice_date=evidence["invoice_date"],
    )
    template_line = payload["lines"][0]
    payload["lines"] = []
    for mapped_line, goods_receipt_line_id in zip(
        mapping["lines"], goods_receipt_line_ids, strict=True
    ):
        source = mapped_line["source_fields"]
        line = deepcopy(template_line)
        line.update(
            billed_quantity=source["quantity"],
            free_quantity=source["free_quantity"],
            quoted_unit_rate=source["rate"],
            line_discount=_discount(source["discount"]),
            goods_receipt_line_id=str(goods_receipt_line_id),
            allocated_base_billed_quantity=source["quantity"],
            allocated_base_free_quantity=source["free_quantity"],
        )
        payload["lines"].append(line)
    return payload


def _assert_ask_back_contract(base: dict[str, Any]) -> None:
    missing = deepcopy(base)
    missing["unresolved_fields"] = [{
        "path": "lines.line-1.source_fields.quantity",
        "reason": "Quantity is not legible on the bill image.",
        "required_for": ["purchase_order", "goods_receipt", "supplier_invoice"],
    }]
    missing_result = review_purchase_bill_mapping(missing)
    assert missing_result["status"] == "needs_context"
    for next_step in missing_result["next_steps"]:
        assert next_step["state"] == "blocked"
        assert (
            "unresolved_fields:lines.line-1.source_fields.quantity"
            in next_step["blockers"]
        )

    ambiguous = deepcopy(base)
    ambiguous["supplier_resolution"] = {
        "status": "unresolved",
        "supplier_id": None,
        "canonical_name": None,
        "proposed_supplier_name": None,
        "candidate_supplier_ids": [str(uuid4()), str(uuid4())],
        "skip_reason": None,
    }
    ambiguous_result = review_purchase_bill_mapping(ambiguous)
    assert ambiguous_result["status"] == "needs_context"
    assert ambiguous_result["next_steps"][0]["state"] == "blocked"
    assert "supplier_unresolved" in ambiguous_result["next_steps"][0]["blockers"]
    assert ambiguous_result["mapping"]["supplier_resolution"][
        "candidate_supplier_ids"
    ] == ambiguous["supplier_resolution"]["candidate_supplier_ids"]

    ambiguous_product = deepcopy(base)
    ambiguous_product["lines"][1]["product_resolution"] = {
        "status": "unresolved",
        "product_id": None,
        "canonical_name": None,
        "candidate_product_ids": [fixture.IDS["product"], str(uuid4())],
        "proposed_product": None,
        "skip_reason": None,
    }
    product_result = review_purchase_bill_mapping(ambiguous_product)
    assert product_result["status"] == "needs_context"
    assert "product_unresolved:line-2" in product_result["next_steps"][0]["blockers"]

    missing_lot = deepcopy(base)
    missing_lot["lines"][1]["source_fields"]["batch"] = None
    missing_lot["lines"][1]["source_fields"]["expiry"] = None
    missing_lot["unresolved_fields"] = [
        {
            "path": "lines.line-2.source_fields.batch",
            "reason": "Batch number is not legible.",
            "required_for": ["goods_receipt", "supplier_invoice"],
        },
        {
            "path": "lines.line-2.source_fields.expiry",
            "reason": "Expiry month is not legible.",
            "required_for": ["goods_receipt", "supplier_invoice"],
        },
    ]
    lot_result = review_purchase_bill_mapping(missing_lot)
    assert lot_result["status"] == "needs_context"
    assert lot_result["next_steps"][0]["blockers"] == []
    for next_step in lot_result["next_steps"][1:]:
        assert "unresolved_fields:lines.line-2.source_fields.batch" in next_step[
            "blockers"
        ]
        assert "unresolved_fields:lines.line-2.source_fields.expiry" in next_step[
            "blockers"
        ]

    confirmed_duplicate = deepcopy(base)
    confirmed_duplicate["lines"][1]["source_fields"] = deepcopy(
        confirmed_duplicate["lines"][0]["source_fields"]
    )
    confirmed_result = review_purchase_bill_mapping(confirmed_duplicate)
    assert confirmed_result["status"] == "ready_for_canonical_prepare_validation"
    assert len(confirmed_result["mapping"]["lines"]) == 2
    assert (
        confirmed_result["mapping"]["lines"][0]["source_fields"]
        == confirmed_result["mapping"]["lines"][1]["source_fields"]
    )

    suspected_duplicate = deepcopy(confirmed_duplicate)
    suspected_duplicate["unresolved_fields"] = [{
        "path": "lines.line-2",
        "reason": "This may be duplicate OCR evidence; confirm it is a second bill line.",
        "required_for": ["purchase_order", "goods_receipt", "supplier_invoice"],
    }]
    suspected_result = review_purchase_bill_mapping(suspected_duplicate)
    assert suspected_result["status"] == "needs_context"
    assert all(next_step["state"] == "blocked" for next_step in suspected_result["next_steps"])

    optional_skip = deepcopy(base)
    optional_skip["explicit_skip_permission"] = True
    optional_skip["skipped_fields"] = [{
        "path": "evidence.additional_document_fields.freight",
        "reason": "User confirmed that unreadable optional freight may be omitted.",
        "required_for": [],
    }]
    skipped_result = review_purchase_bill_mapping(optional_skip)
    assert skipped_result["status"] == "ready_for_canonical_prepare_validation"
    assert skipped_result["next_steps"][0]["blockers"] == []
    assert skipped_result["mapping"]["explicit_skip_permission"] is True


def _assert_persisted_chain(
    runtime_url: str,
    runtime_dsn: str,
    *,
    purchase_order_id: UUID,
    goods_receipt_id: UUID,
    supplier_invoice_id: UUID,
    supplier_invoice_number: str,
) -> None:
    with psycopg2.connect(runtime_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s,%s)",
            (fixture.IDS["operator_auth_user"], fixture.IDS["org"]),
        )
        cursor.execute(
            """
            SELECT purchase.status,purchase.supplier_account_id,line.product_id,
                   line.billed_quantity,line.free_quantity,line.quoted_unit_rate
              FROM procurement.purchase_orders purchase
              JOIN procurement.purchase_order_lines line
                ON line.org_id=purchase.org_id AND line.purchase_order_id=purchase.id
             WHERE purchase.org_id=%s AND purchase.id=%s
             ORDER BY line.line_number
            """,
            (fixture.IDS["org"], purchase_order_id),
        )
        purchase_rows = cursor.fetchall()
        assert purchase_rows == [
            (
                "received",
                fixture.IDS["supplier_account"],
                fixture.IDS["product"],
                Decimal("20.000000"),
                Decimal("1.000000"),
                Decimal("100.0000"),
            ),
            (
                "received",
                fixture.IDS["supplier_account"],
                fixture.IDS["product"],
                Decimal("30.000000"),
                Decimal("1.500000"),
                Decimal("100.0000"),
            ),
        ]
        cursor.execute(
            """
            SELECT receipt.status,batch.batch_number,batch.expires_on,
                   batch.mrp,line.received_quantity,line.free_quantity
              FROM procurement.goods_receipts receipt
              JOIN procurement.goods_receipt_lines line
                ON line.org_id=receipt.org_id AND line.goods_receipt_id=receipt.id
              JOIN inventory.batches batch
                ON batch.org_id=line.org_id AND batch.id=line.batch_id
             WHERE receipt.org_id=%s AND receipt.id=%s
             ORDER BY line.line_number
            """,
            (fixture.IDS["org"], goods_receipt_id),
        )
        receipt_rows = cursor.fetchall()
        assert receipt_rows == [
            (
                "posted",
                "MAP-BATCH-001",
                date(2028, 9, 1),
                Decimal("150.00"),
                Decimal("20.000000"),
                Decimal("1.000000"),
            ),
            (
                "posted",
                "MAP-BATCH-002",
                date(2028, 10, 1),
                Decimal("160.00"),
                Decimal("30.000000"),
                Decimal("1.500000"),
            ),
        ]
        cursor.execute(
            """
            SELECT invoice.status,invoice.supplier_invoice_number,
                   line.billed_quantity,line.free_quantity,line.quoted_unit_rate,
                   receipt_line.goods_receipt_id,
                   (SELECT count(*) FROM finance.open_items item
                     JOIN finance.accounting_events item_event
                       ON item_event.org_id=item.org_id
                      AND item_event.id=item.accounting_event_id
                    WHERE item.org_id=invoice.org_id
                      AND item_event.supplier_invoice_id=invoice.id),
                   (SELECT count(*) FROM tax.documents document
                     WHERE document.org_id=invoice.org_id
                       AND document.supplier_invoice_id=invoice.id),
                   (SELECT count(*) FROM finance.journal_entries journal
                     JOIN finance.accounting_events journal_event
                       ON journal_event.org_id=journal.org_id
                      AND journal_event.journal_entry_id=journal.id
                    WHERE journal.org_id=invoice.org_id
                      AND journal_event.supplier_invoice_id=invoice.id)
              FROM procurement.supplier_invoices invoice
              JOIN procurement.supplier_invoice_lines line
                ON line.org_id=invoice.org_id AND line.supplier_invoice_id=invoice.id
              JOIN procurement.supplier_invoice_receipt_allocations allocation
                ON allocation.org_id=line.org_id
               AND allocation.supplier_invoice_line_id=line.id
              JOIN procurement.goods_receipt_lines receipt_line
                ON receipt_line.org_id=allocation.org_id
               AND receipt_line.id=allocation.goods_receipt_line_id
             WHERE invoice.org_id=%s AND invoice.id=%s
             ORDER BY line.line_number
            """,
            (fixture.IDS["org"], supplier_invoice_id),
        )
        invoice_rows = cursor.fetchall()
        assert len(invoice_rows) == 2
        assert [row[0] for row in invoice_rows] == ["posted", "posted"]
        assert [row[1] for row in invoice_rows] == [
            supplier_invoice_number,
            supplier_invoice_number,
        ]
        assert [(row[2], row[3], row[4]) for row in invoice_rows] == [
            (Decimal("20.000000"), Decimal("1.000000"), Decimal("100.0000")),
            (Decimal("30.000000"), Decimal("1.500000"), Decimal("100.0000")),
        ]
        assert all(UUID(str(row[5])) == goods_receipt_id for row in invoice_rows)
        assert all(row[6:] == (1, 1, 1) for row in invoice_rows)

    engine = create_engine(runtime_url, pool_pre_ping=True)
    try:
        with Session(engine) as session:
            readback = posted_supplier_invoice(
                supplier_invoice_id,
                user={
                    "org_id": fixture.IDS["org"],
                    "auth_user_id": fixture.IDS["operator_auth_user"],
                },
                db=session,
            )
    finally:
        engine.dispose()
    assert readback.status == "posted"
    assert len(readback.lines) == 2
    assert readback.grand_total == Decimal("5600.00")
    assert readback.open_item_principal == Decimal("5600.00")
    assert readback.journal_debit_total == readback.journal_credit_total


def run_lifecycle() -> None:
    register_adapter(UUID, lambda value: AsIs(f"'{value}'::uuid"))
    admin_url = os.environ["DATABASE_URL"]
    _assert_disposable_pg15(admin_url)
    admin_dsn = _admin_dsn(admin_url)
    password = quote(f"pg15-{uuid4()}", safe="")
    runtime_url = _role_url(admin_url, "erp_runtime", password)
    calculator_url = _role_url(admin_url, "erp_calculator", password)
    runtime_dsn = _admin_dsn(runtime_url)
    organization_pan = _configure_fixture_ids()

    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute("SHOW server_version_num")
        assert int(cursor.fetchone()[0]) // 10000 == 15
        cursor.execute(f'ALTER ROLE "erp_runtime" LOGIN PASSWORD \'{password}\'')
        cursor.execute(f'ALTER ROLE "erp_calculator" LOGIN PASSWORD \'{password}\'')
    with psycopg2.connect(admin_dsn) as connection:
        fixture.bootstrap_identity(connection, organization_pan=organization_pan)
    with psycopg2.connect(admin_dsn) as connection:
        _seed_reference_authority(connection)
    with psycopg2.connect(runtime_dsn) as connection:
        business_date, business_instant = fixture.organization_business_clock(connection)
    with psycopg2.connect(admin_dsn) as connection:
        fixture.seed_business_master(connection, business_date=business_date)
        fixture.seed_end_to_end_master(connection, business_date=business_date)
    with psycopg2.connect(runtime_dsn) as connection:
        fixture.activate_demo_product(connection)
    with psycopg2.connect(admin_dsn) as connection:
        portal_evidence = fixture.seed_supplier_invoice_portal_evidence(
            connection, business_date=business_date
        )

    raw_mapping = _mapping(
        business_date=business_date,
        supplier_invoice_number=portal_evidence["supplier_invoice_number"],
    )
    _assert_ask_back_contract(raw_mapping)
    review = review_purchase_bill_mapping(raw_mapping)

    with _service(runtime_url, calculator_url) as service:
        purchase = _approve_and_execute(
            service,
            _prepare(
                service,
                "procurement.purchase_order.prepare",
                _purchase_order_payload_from_review(review, business_date=business_date),
            ),
        )
        purchase_order_id = purchase.resource_id
        assert purchase_order_id is not None
        with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM procurement.purchase_order_lines "
                "WHERE org_id=%s AND purchase_order_id=%s ORDER BY line_number",
                (fixture.IDS["org"], purchase_order_id),
            )
            purchase_order_line_ids = [UUID(str(row[0])) for row in cursor.fetchall()]
        assert len(purchase_order_line_ids) == 2

        receipt = _approve_and_execute(
            service,
            _prepare(
                service,
                "procurement.goods_receipt.prepare",
                _goods_receipt_payload_from_review(
                    review,
                    purchase_order_id=purchase_order_id,
                    purchase_order_line_ids=purchase_order_line_ids,
                    business_date=business_date,
                    received_at=business_instant,
                ),
            ),
        )
        goods_receipt_id = receipt.resource_id
        assert goods_receipt_id is not None
        with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
            cursor.execute(
                "SELECT id,purchase_order_line_id FROM procurement.goods_receipt_lines "
                "WHERE org_id=%s AND goods_receipt_id=%s ORDER BY line_number",
                (fixture.IDS["org"], goods_receipt_id),
            )
            receipt_rows = cursor.fetchall()
        goods_receipt_line_ids = [UUID(str(row[0])) for row in receipt_rows]
        assert [UUID(str(row[1])) for row in receipt_rows] == purchase_order_line_ids

        supplier_invoice = _approve_and_execute(
            service,
            _prepare(
                service,
                "procurement.supplier_invoice.prepare",
                _supplier_invoice_payload_from_review(
                    review,
                    goods_receipt_id=goods_receipt_id,
                    goods_receipt_line_ids=goods_receipt_line_ids,
                    portal_evidence=portal_evidence,
                    business_date=business_date,
                ),
            ),
        )
        supplier_invoice_id = supplier_invoice.resource_id
        assert supplier_invoice_id is not None

    _assert_persisted_chain(
        runtime_url,
        runtime_dsn,
        purchase_order_id=purchase_order_id,
        goods_receipt_id=goods_receipt_id,
        supplier_invoice_id=supplier_invoice_id,
        supplier_invoice_number=portal_evidence["supplier_invoice_number"],
    )
    print(
        "purchase-bill mapping PostgreSQL 15 lifecycle passed: "
        f"purchase_order={purchase_order_id} goods_receipt={goods_receipt_id} "
        f"supplier_invoice={supplier_invoice_id}"
    )


if __name__ == "__main__":
    run_lifecycle()
