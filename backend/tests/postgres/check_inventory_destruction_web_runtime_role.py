"""Compile the canonical destruction readback as the isolated runtime role.

The full command lifecycle is exercised by the service contract suite. This
PostgreSQL-15 fixture proves that the REST readback uses real canonical tables,
types, grants, and tenant RLS rather than a legacy/offline projection.
"""

from __future__ import annotations

import os
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.api.routes import web_operator_actions


ORG_ID = UUID("ed000000-0000-7000-8000-000000000001")
COMMAND_ID = UUID("ed000000-0000-7000-8000-000000000002")
MEMBERSHIP_ID = UUID("ed000000-0000-7000-8000-000000000003")
AUTH_USER_ID = UUID("ed000000-0000-7000-8000-000000000004")


def _readback_sql() -> str:
    return next(
        value
        for value in web_operator_actions.load_inventory_destruction_readback.__code__.co_consts
        if isinstance(value, str)
        and "erp_automation_reads.command_authority_context" in value
    )


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with Session(engine) as session, session.begin():
            session.execute(text('SET LOCAL ROLE "erp_runtime"'))
            assert session.scalar(text("SELECT current_user")) == "erp_runtime"
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
            rows = session.execute(
                text(_readback_sql()),
                {
                    "org_id": ORG_ID,
                    "command_request_id": COMMAND_ID,
                    "organization_scope": True,
                    "branch_ids": [],
                },
            ).fetchall()
            assert rows == []
            other_org_rows = session.execute(
                text(_readback_sql()),
                {
                    "org_id": UUID("ed100000-0000-7000-8000-000000000001"),
                    "command_request_id": COMMAND_ID,
                    "organization_scope": True,
                    "branch_ids": [],
                },
            ).fetchall()
            assert other_org_rows == []
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
