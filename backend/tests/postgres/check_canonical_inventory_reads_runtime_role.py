"""Execute canonical Stock Hub reads under PostgreSQL 15's restricted runtime role."""

from __future__ import annotations

import os
from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.api.routes import canonical_inventory_reads as reads


ORG_ID = UUID("d3000000-0000-7000-8000-000000000001")
BRANCH_ID = UUID("d3000000-0000-7000-8000-000000000002")
MEMBERSHIP_ID = UUID("d3000000-0000-7000-8000-000000000003")
AUTH_USER_ID = UUID("d3000000-0000-7000-8000-000000000004")
AS_OF = datetime(2026, 8, 25, 10, 0, tzinfo=timezone.utc)
BUSINESS_DATE = date(2026, 8, 25)


def _exercise_route_sql(session: Session) -> None:
    original = reads._activate, reads._scope, reads._clock
    reads._activate = lambda _db, _user: ORG_ID
    reads._scope = lambda _db, _org, _branch, _location: reads.InventoryScope(
        branch_id=BRANCH_ID,
        branch_code="EMPTY",
        branch_name="Empty canonical branch",
        location_id=None,
        location_code=None,
        location_name=None,
    )
    reads._clock = lambda _db, _org: (AS_OF, BUSINESS_DATE, "Asia/Kolkata")
    try:
        context = reads.inventory_context(user={}, db=session)
        assert context.organization_id == ORG_ID
        assert context.business_date == BUSINESS_DATE
        assert context.branches == []

        current = reads.current_stock(
            branch_id=BRANCH_ID, location_id=None, search=None,
            limit=1, cursor=None, user={}, db=session,
        )
        assert current.items == []
        assert current.total_count == current.summary.product_count == 0
        assert current.summary.batch_count == 0
        assert current.summary.positive_stock_batch_count == 0
        assert current.summary.exhausted_batch_count == 0

        batch_page = reads.batches(
            branch_id=BRANCH_ID, location_id=None, product_id=None, search=None,
            limit=1, cursor=None, user={}, db=session,
        )
        assert batch_page.items == []
        assert batch_page.total_count == batch_page.summary.batch_count == 0

        movement_page = reads.movements(
            branch_id=BRANCH_ID, location_id=None, product_id=None, batch_id=None,
            date_from=BUSINESS_DATE, date_to=BUSINESS_DATE,
            limit=1, cursor=None, user={}, db=session,
        )
        assert movement_page.items == []
        assert movement_page.total_count == movement_page.summary.movement_count == 0

        wrong_query = reads._query_fingerprint(
            "movements", organization_id=ORG_ID, branch_id=BRANCH_ID,
            location_id=None, product_id=None, batch_id=None,
            date_from=None, date_to=None,
        )
        cursor = reads._cursor({
            "posted_at": AS_OF.isoformat(), "movement_id": str(BRANCH_ID),
            "as_of": AS_OF.isoformat(), "business_date": BUSINESS_DATE.isoformat(),
            "query": wrong_query,
        })
        try:
            reads.movements(
                branch_id=BRANCH_ID, location_id=None, product_id=None, batch_id=None,
                date_from=BUSINESS_DATE, date_to=BUSINESS_DATE,
                limit=1, cursor=cursor, user={}, db=session,
            )
        except HTTPException as mismatch:
            assert mismatch.status_code == 422
        else:
            raise AssertionError("movement cursor was accepted with different date filters")
    finally:
        reads._activate, reads._scope, reads._clock = original


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with Session(engine) as session, session.begin():
            session.execute(text('SET LOCAL ROLE "erp_runtime"'))
            assert session.scalar(text("SELECT current_user")) == "erp_runtime"
            assert session.scalar(text(
                "SELECT rolsuper OR rolbypassrls FROM pg_catalog.pg_roles "
                "WHERE rolname=current_user"
            )) is False
            assert int(session.scalar(text("SHOW server_version_num"))) // 10000 == 15
            session.execute(text("""
                SELECT set_config('app.org_id', :org_id, true),
                       set_config('app.membership_id', :membership_id, true),
                       set_config('app.auth_user_id', :auth_user_id, true)
            """), {
                "org_id": str(ORG_ID), "membership_id": str(MEMBERSHIP_ID),
                "auth_user_id": str(AUTH_USER_ID),
            })

            tables = (
                "core.organizations", "core.branches", "core.memberships", "core.users",
                "catalog.products", "catalog.categories", "inventory.locations",
                "inventory.batches", "inventory.inventory_documents",
                "inventory.stock_ledger_entries", "compliance.recalls",
                "compliance.recall_batches",
            )
            for table_name in tables:
                assert session.scalar(text(
                    "SELECT has_table_privilege(current_user, :table_name, 'SELECT')"
                ), {"table_name": table_name}) is True, table_name

            for table_name in ("stock_balances", "stock_ledger_entries"):
                policy = session.execute(text("""
                    SELECT policy.qual, class.relrowsecurity, class.relforcerowsecurity
                      FROM pg_catalog.pg_policies policy
                      JOIN pg_catalog.pg_class class ON class.relname=policy.tablename
                      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=class.relnamespace
                       AND namespace.nspname=policy.schemaname
                     WHERE policy.schemaname='inventory' AND policy.tablename=:table_name
                       AND policy.policyname='erp_select'
                """), {"table_name": table_name}).one()
                assert policy.relrowsecurity is True
                assert policy.relforcerowsecurity is True
                assert "can_access_branch" in policy.qual

            _exercise_route_sql(session)

            page = session.execute(text("""
                WITH fixture(posted_at,id) AS (VALUES
                  ('2026-08-25T10:00:00Z'::timestamptz,
                   'd3000000-0000-7000-8000-000000000010'::uuid),
                  ('2026-08-25T10:00:00Z'::timestamptz,
                   'd3000000-0000-7000-8000-000000000009'::uuid))
                SELECT id FROM fixture
                 WHERE (posted_at,id)<(
                   '2026-08-25T10:00:00Z'::timestamptz,
                   'd3000000-0000-7000-8000-000000000010'::uuid)
                 ORDER BY posted_at DESC,id DESC
            """)).scalars().all()
            assert page == [UUID("d3000000-0000-7000-8000-000000000009")]
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
