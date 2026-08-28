"""Compile canonical party and reporting projections as restricted erp_runtime."""

from __future__ import annotations

import os
from datetime import date
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.api.routes import (
    canonical_party_aging_reads as aging,
    canonical_party_ledger_reads as ledger,
    canonical_reporting_reads as reporting,
)


ORG_ID = UUID("d3000000-0000-7000-8000-000000000001")
BRANCH_ID = UUID("d3000000-0000-7000-8000-000000000002")
PARTY_ACCOUNT_ID = UUID("d3000000-0000-7000-8000-000000000099")


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with Session(engine) as session, session.begin():
            session.execute(text('SET LOCAL ROLE "erp_runtime"'))
            assert session.scalar(text("SELECT current_user")) == "erp_runtime"
            assert session.scalar(text(
                "SELECT rolsuper OR rolbypassrls "
                "FROM pg_catalog.pg_roles WHERE rolname=current_user"
            )) is False
            for table_name in (
                "finance.accounts", "finance.journal_entries", "finance.journal_lines",
                "finance.allocations", "finance.accounting_events", "finance.open_items",
                "parties.parties", "parties.contacts", "parties.customer_accounts",
                "parties.supplier_accounts", "sales.invoices",
                "procurement.supplier_invoices",
            ):
                assert session.scalar(text(
                    "SELECT has_table_privilege(current_user, :table_name, 'SELECT')"
                ), {"table_name": table_name}) is True
            assert session.scalar(text(
                "SELECT has_table_privilege("
                "current_user, 'automation.command_requests', 'SELECT')"
            )) is False

            period = {
                "org_id": ORG_ID,
                "date_from": date(2026, 8, 1),
                "date_to": date(2026, 8, 31),
                "organization_scope": False,
                "branch_ids": [BRANCH_ID],
            }
            assert session.execute(
                text(reporting._TRIAL_BALANCE_SQL), period
            ).fetchall() == []
            assert session.execute(
                text(reporting._CUSTOMER_ACTIVITY_SQL), period
            ).fetchall() == []

            # EXPLAIN resolves every relation, column, function, cast, and runtime
            # privilege without requiring seeded tenant identity or executing the
            # organization business-date authority in this empty compile fixture.
            session.execute(text("EXPLAIN " + aging._AGING_SQL), {
                "org_id": ORG_ID,
                "party_type": "customer",
                "organization_scope": False,
                "branch_ids": [BRANCH_ID],
            }).fetchall()
            session.execute(text("EXPLAIN " + ledger._STATEMENT_SQL), {
                **period,
                "party_account_id": PARTY_ACCOUNT_ID,
                "party_type": "customer",
                "page_size": 100,
                "offset": 0,
            }).fetchall()
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
