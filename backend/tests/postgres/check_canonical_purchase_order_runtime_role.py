"""Execute the canonical purchase-order history read as the runtime DB role."""

from __future__ import annotations

import os
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.api.routes import canonical_erp_reads


ORG_ID = UUID("d3000000-0000-7000-8000-000000000001")


def _purchase_order_history_sql() -> str:
    return next(
        value
        for value in canonical_erp_reads.purchase_orders.__code__.co_consts
        if isinstance(value, str)
        and "FROM procurement.purchase_orders purchase" in value
    )


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with Session(engine) as session:
            session.execute(text('SET LOCAL ROLE "erp_runtime"'))
            assert session.scalar(text("SELECT current_user")) == "erp_runtime"
            assert session.scalar(text(
                "SELECT rolsuper OR rolbypassrls FROM pg_catalog.pg_roles "
                "WHERE rolname=current_user"
            )) is False
            assert session.scalar(text(
                "SELECT has_table_privilege(current_user, "
                "'procurement.purchase_orders', 'SELECT')"
            )) is True
            # The canonical runtime inherits the baseline erp_app INSERT/UPDATE
            # grants. RLS, command scopes, and invariant triggers guard those
            # mutations; DELETE is deliberately absent. Check the real grant
            # contract one privilege at a time instead of treating a comma-list
            # as an all-or-none permission.
            assert session.scalar(text(
                "SELECT has_table_privilege(current_user, "
                "'procurement.purchase_orders', 'INSERT')"
            )) is True
            assert session.scalar(text(
                "SELECT has_table_privilege(current_user, "
                "'procurement.purchase_orders', 'UPDATE')"
            )) is True
            assert session.scalar(text(
                "SELECT has_table_privilege(current_user, "
                "'procurement.purchase_orders', 'DELETE')"
            )) is False
            assert session.scalar(text(
                "SELECT has_table_privilege(current_user, "
                "'procurement.purchase_order_lines', 'SELECT')"
            )) is True

            rows = session.execute(
                text(_purchase_order_history_sql()),
                {
                    "org_id": ORG_ID,
                    "date_from": None,
                    "date_to": None,
                    "search": "CODEX-E2E-missing",
                    "status": None,
                    "limit": 1,
                    "offset": 0,
                },
            ).mappings().all()
            assert rows == []
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
