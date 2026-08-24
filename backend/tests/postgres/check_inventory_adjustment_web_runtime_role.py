"""Compile the browser cycle-count eligibility/readback SQL on PostgreSQL 15.

The disposable gate has no live user or inventory rows after its rollback
fixtures. Executing both org-scoped reads as ``erp_app`` still proves schema
names, numeric types, RLS compatibility, and runtime SELECT privileges rather
than merely inspecting SQL source text.
"""

from __future__ import annotations

import os
from datetime import date
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.api.routes import web_operator_actions


ORG_ID = UUID("d3000000-0000-7000-8000-000000000001")
BRANCH_ID = UUID("d3000000-0000-7000-8000-000000000002")
LOCATION_ID = UUID("d3000000-0000-7000-8000-000000000003")
BATCH_ID = UUID("d3000000-0000-7000-8000-000000000004")
COMMAND_ID = UUID("d3000000-0000-7000-8000-000000000005")
MEMBERSHIP_ID = UUID("d3000000-0000-7000-8000-000000000006")
AUTH_USER_ID = UUID("d3000000-0000-7000-8000-000000000007")


def _sql(function, marker: str) -> str:
    return next(
        value
        for value in function.__code__.co_consts
        if isinstance(value, str) and marker in value
    )


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with Session(engine) as session, session.begin():
            session.execute(text('SET LOCAL ROLE "erp_app"'))
            assert session.scalar(text("SELECT current_user")) == "erp_app"
            assert int(session.scalar(text("SHOW server_version_num"))) // 10000 == 15
            session.execute(
                text(
                    """
                    SELECT set_config('app.org_id', :org_id, true),
                           set_config('app.membership_id', :membership_id, true),
                           set_config('app.auth_user_id', :auth_user_id, true)
                    """
                ),
                {
                    "org_id": str(ORG_ID),
                    "membership_id": str(MEMBERSHIP_ID),
                    "auth_user_id": str(AUTH_USER_ID),
                },
            )
            eligibility_rows = session.execute(
                text(_sql(
                    web_operator_actions.inventory_adjustment_eligibility,
                    "FROM inventory.stock_balances AS balance",
                )),
                {
                    "org_id": ORG_ID,
                    "branch_id": BRANCH_ID,
                    "location_id": LOCATION_ID,
                    "batch_id": BATCH_ID,
                    "adjustment_date": date(2026, 8, 25),
                },
            ).fetchall()
            assert eligibility_rows == []
            evidence_rows = session.execute(
                text(_sql(
                    web_operator_actions.inventory_adjustment_eligibility,
                    "FROM core.attachments AS attachment",
                )),
                {"org_id": ORG_ID, "adjustment_date": date(2026, 8, 25)},
            ).fetchall()
            assert evidence_rows == []
            readback_rows = session.execute(
                text(_sql(
                    web_operator_actions.inventory_adjustment_readback,
                    "FROM automation.command_requests AS command",
                )),
                {"org_id": ORG_ID, "command_request_id": COMMAND_ID},
            ).fetchall()
            assert readback_rows == []
            review_rows = session.execute(
                text(_sql(
                    web_operator_actions.inventory_adjustment_review,
                    "FROM automation.command_requests AS command",
                )),
                {
                    "org_id": ORG_ID,
                    "command_request_id": COMMAND_ID,
                    "membership_id": MEMBERSHIP_ID,
                },
            ).fetchall()
            assert review_rows == []
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
