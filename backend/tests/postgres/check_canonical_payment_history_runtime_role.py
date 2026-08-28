"""Compile canonical payment-history SQL as the restricted runtime role."""

from __future__ import annotations

import os
from datetime import date
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.api.routes import canonical_payment_history_reads as reads


ORG_ID = UUID("d3000000-0000-7000-8000-000000000001")
BRANCH_ID = UUID("d3000000-0000-7000-8000-000000000002")
PAYMENT_ID = UUID("d3000000-0000-7000-8000-000000000099")


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with Session(engine) as session, session.begin():
            session.execute(text('SET LOCAL ROLE "erp_runtime"'))
            assert session.scalar(text("SELECT current_user")) == "erp_runtime"
            assert session.scalar(text(
                "SELECT rolsuper OR rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=current_user"
            )) is False
            for table_name in (
                "finance.payments", "finance.allocations",
                "finance.open_items", "finance.accounting_events", "finance.journal_entries",
                "finance.journal_lines", "parties.parties", "parties.customer_accounts",
                "parties.supplier_accounts", "sales.invoices", "procurement.supplier_invoices",
            ):
                assert session.scalar(text(
                    "SELECT has_table_privilege(current_user, :table_name, 'SELECT')"
                ), {"table_name": table_name}) is True
            assert session.scalar(text(
                "SELECT has_table_privilege("
                "current_user, 'automation.command_requests', 'SELECT')"
            )) is False
            assert session.scalar(text(
                "SELECT has_function_privilege("
                "current_user, "
                "'erp_automation_reads.payment_post_provenance(uuid)', 'EXECUTE')"
            )) is True
            params = {
                "org_id": ORG_ID,
                "organization_scope": False,
                "branch_ids": [BRANCH_ID],
                "direction": "all",
                "date_from": date(2026, 8, 1),
                "date_to": date(2026, 8, 31),
                "search": None,
                "payment_id": PAYMENT_ID,
                "limit": 25,
                "offset": 0,
            }
            count_sql = (
                reads._EVIDENCE_CTES
                + " SELECT COUNT(*) FROM authoritative_payments payment "
                + reads._filter_sql()
            )
            assert session.execute(text(count_sql), params).scalar_one() == 0
            list_sql = (
                reads._EVIDENCE_CTES
                + " SELECT payment.* FROM authoritative_payments payment "
                + reads._filter_sql()
                + " ORDER BY payment.payment_date DESC LIMIT :limit OFFSET :offset"
            )
            assert session.execute(text(list_sql), params).fetchall() == []
            for sql in (
                next(value for value in reads.canonical_payment_detail.__code__.co_consts
                     if isinstance(value, str) and "WITH item_totals AS" in value),
                next(value for value in reads.canonical_payment_detail.__code__.co_consts
                     if isinstance(value, str) and "SELECT line.id AS journal_line_id" in value),
            ):
                assert session.execute(text(sql), params).fetchall() == []
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
