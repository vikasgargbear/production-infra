"""Execute the complete canonical PO detail SQL as the restricted runtime role."""

from __future__ import annotations

import os
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.api.routes.canonical_purchase_order_reads import _canonical_purchase_order_detail


ORG_ID = UUID("d3000000-0000-7000-8000-000000000001")
PURCHASE_ORDER_ID = UUID("d3000000-0000-7000-8000-000000000099")


def _line_sql() -> str:
    return next(
        value for value in _canonical_purchase_order_detail.__code__.co_consts
        if isinstance(value, str) and "FROM procurement.purchase_order_lines line" in value
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
            for table_name in (
                "procurement.purchase_orders",
                "procurement.purchase_order_lines",
                "parties.supplier_accounts",
                "parties.parties",
                "catalog.products",
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
                "'erp_automation_reads.purchase_order_uom_provenance(uuid,uuid)', "
                "'EXECUTE')"
            )) is True
            assert session.execute(
                text(_line_sql()),
                {"org_id": ORG_ID, "purchase_order_id": PURCHASE_ORDER_ID},
            ).fetchall() == []
            try:
                _canonical_purchase_order_detail(session, ORG_ID, PURCHASE_ORDER_ID)
            except HTTPException as missing:
                assert missing.status_code == 404
            else:
                raise AssertionError("empty canonical database unexpectedly returned a PO")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
