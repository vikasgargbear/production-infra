"""Compile canonical supplier-payment SELECT projections as erp_runtime."""

from __future__ import annotations

import inspect
import os
from datetime import date
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.api.routes import canonical_supplier_payment_reads as reads


ORG_ID = UUID("d3000000-0000-7000-8000-000000000001")
RESOURCE_ID = UUID("d3000000-0000-7000-8000-000000000099")


def _sql(function, marker: str) -> str:
    return next(value for value in function.__code__.co_consts if isinstance(value, str) and marker in value)


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with Session(engine) as session:
            session.execute(text('SET LOCAL ROLE "erp_runtime"'))
            assert session.scalar(text("SELECT current_user")) == "erp_runtime"
            assert session.scalar(text(
                "SELECT rolsuper OR rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=current_user"
            )) is False
            for table_name in (
                "core.branches", "core.attachments", "finance.bank_accounts", "finance.accounts",
                "finance.open_items", "finance.allocations", "finance.accounting_events",
                "finance.payments", "finance.journal_entries", "finance.journal_lines",
                "procurement.supplier_invoices", "procurement.supplier_invoice_lines",
                "procurement.supplier_invoice_receipt_allocations",
                "procurement.goods_receipt_lines", "procurement.purchase_order_advance_allocations",
                "parties.supplier_accounts", "parties.parties", "tax.organization_fiscal_tax_facts",
            ):
                assert session.scalar(text(
                    "SELECT has_table_privilege(current_user, :table_name, 'SELECT')"
                ), {"table_name": table_name}) is True
            base = {
                "org_id": ORG_ID, "payment_id": RESOURCE_ID,
                "payment_date": date(2026, 8, 25), "organization_scope": False,
                "branch_ids": [RESOURCE_ID],
            }
            for sql in (
                _sql(reads.supplier_payment_context, "SELECT branch.id AS branch_id"),
                _sql(reads.supplier_payment_context, "SELECT bank.id AS bank_account_id"),
                _sql(reads.supplier_payment_context, "WITH effective_cash AS"),
                _sql(reads.posted_supplier_payment, "SELECT payment.id AS payment_id"),
                _sql(reads.posted_supplier_payment, "WITH effective AS"),
                _sql(reads.posted_supplier_payment, "SELECT line.id AS journal_line_id"),
            ):
                session.execute(text(sql), base).fetchall()
            source = inspect.getsource(reads)
            assert "purchases." not in source
            assert "supplier_invoice_items" not in source
            assert "::integer" not in source
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
