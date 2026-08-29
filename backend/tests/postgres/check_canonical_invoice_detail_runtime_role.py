"""Execute canonical HTTP and MCP invoice reads as the restricted runtime role."""

from __future__ import annotations

import os
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.api.routes.canonical_erp_reads import _canonical_invoice_detail
from app.api.routes.internal import mcp_canonical_resolution_reads


ORG_ID = UUID("d3000000-0000-7000-8000-000000000001")
BRANCH_ID = UUID("d3000000-0000-7000-8000-000000000002")
INVOICE_ID = UUID("d3d8a988-335f-5619-a621-f42f891b6514")
SHA256_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"


def _mcp_direct_issue_sql() -> str:
    return next(
        value
        for value in mcp_canonical_resolution_reads.canonical_sales_invoice_get
        .__code__.co_consts
        if isinstance(value, str)
        and "sales_invoice_direct_issue_provenance" in value
    )


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with Session(engine) as session:
            session.execute(text('SET LOCAL ROLE "erp_runtime"'))
            assert session.scalar(text("SELECT current_user")) == "erp_runtime"
            assert int(session.scalar(text("SHOW server_version_num"))) // 10000 == 15
            assert session.scalar(text(
                "SELECT pg_catalog.to_regprocedure('pg_catalog.sha256(bytea)')"
            )) is not None
            assert session.scalar(text(
                "SELECT has_function_privilege("
                "current_user, 'pg_catalog.sha256(bytea)', 'EXECUTE')"
            )) is True
            assert session.scalar(text(
                "SELECT pg_catalog.encode(pg_catalog.sha256('abc'::bytea), 'hex')"
            )) == SHA256_ABC
            assert session.scalar(text(
                "SELECT has_schema_privilege(current_user, 'extensions', 'USAGE')"
            )) is False
            assert session.scalar(text(
                "SELECT has_table_privilege("
                "current_user, 'automation.command_requests', 'SELECT')"
            )) is False
            assert session.scalar(text(
                "SELECT has_function_privilege("
                "current_user, "
                "'erp_automation_reads.sales_invoice_product_identity(uuid,uuid)', "
                "'EXECUTE')"
            )) is True
            assert session.execute(text(
                "SELECT * FROM erp_automation_reads.sales_invoice_product_identity("
                ":org_id,:invoice_id)"
            ), {"org_id": ORG_ID, "invoice_id": INVOICE_ID}).fetchall() == []

            try:
                _canonical_invoice_detail(session, ORG_ID, INVOICE_ID)
            except HTTPException as missing:
                assert missing.status_code == 404
            else:
                raise AssertionError("empty canonical database unexpectedly returned invoice")

            rows = session.execute(
                text(_mcp_direct_issue_sql()),
                {
                    "org_id": ORG_ID,
                    "branch_id": BRANCH_ID,
                    "document_id": INVOICE_ID,
                },
            ).fetchall()
            assert rows == []
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
