"""Compile every exact document-history projection as the restricted runtime role."""

from __future__ import annotations

import os
from datetime import date
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.api.routes import canonical_document_history_reads as reads


ORG_ID = UUID("d3000000-0000-7000-8000-000000000001")
BRANCH_ID = UUID("d3000000-0000-7000-8000-000000000002")
KINDS = (
    "sales_invoice", "sales_order", "sales_dispatch",
    "supplier_invoice", "purchase_order", "goods_receipt",
    "sales_return", "purchase_return",
)
TABLES = (
    "core.organizations", "parties.parties", "parties.customer_accounts", "parties.supplier_accounts",
    "sales.invoices", "sales.invoice_lines", "sales.invoice_dispatch_allocations",
    "sales.orders", "sales.order_lines", "sales.dispatches", "sales.dispatch_lines",
    "sales.returns", "sales.return_lines", "procurement.purchase_orders",
    "procurement.purchase_order_lines", "procurement.supplier_invoices",
    "procurement.supplier_invoice_lines", "procurement.supplier_invoice_receipt_allocations",
    "procurement.goods_receipts", "procurement.goods_receipt_lines",
    "procurement.purchase_returns", "procurement.purchase_return_lines",
    "finance.accounting_events", "finance.open_items", "finance.allocations",
)


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with Session(engine) as session, session.begin():
            session.execute(text('SET LOCAL ROLE "erp_runtime"'))
            assert session.scalar(text("SELECT current_user")) == "erp_runtime"
            assert int(session.scalar(text("SHOW server_version_num"))) // 10000 == 15
            assert session.scalar(text(
                "SELECT rolsuper OR rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=current_user"
            )) is False
            for table_name in TABLES:
                assert session.scalar(text(
                    "SELECT has_table_privilege(current_user, :table_name, 'SELECT')"
                ), {"table_name": table_name}) is True, f"erp_runtime cannot read {table_name}"

            source = reads._history_sources()
            filters = reads._filter_sql()
            for kind in KINDS:
                params = {
                    "org_id": ORG_ID,
                    "business_date": date(2026, 8, 25),
                    "organization_scope": False,
                    "branch_ids": [BRANCH_ID],
                    "document_kind": kind,
                    "document_group": None,
                    "status": "posted" if kind not in {"sales_order", "purchase_order"} else "approved",
                    "date_from": date(2026, 8, 1),
                    "date_to": date(2026, 8, 31),
                    "search": "runtime-role-no-match",
                    "limit": 25,
                    "offset": 0,
                }
                assert session.execute(text(
                    source + " SELECT * FROM authoritative_documents " + filters
                    + " ORDER BY document_date DESC, document_number DESC, document_id DESC LIMIT :limit OFFSET :offset"
                ), params).fetchall() == []

            returns_params = {
                **params,
                "organization_scope": True,
                "document_kind": None,
                "document_group": "returns",
                "status": "reversed",
            }
            assert session.execute(text(
                source + " SELECT COUNT(*) FROM authoritative_documents " + filters
            ), returns_params).scalar_one() == 0
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
