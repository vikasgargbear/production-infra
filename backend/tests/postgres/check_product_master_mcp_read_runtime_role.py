"""Prove draft-aware MCP product search remains tenant-safe as erp_runtime."""

from __future__ import annotations

import os
from pathlib import Path
import importlib.util

from fastapi import HTTPException
from sqlalchemy import create_engine

from app.api.routes.internal import mcp_canonical_reads
from app.api.routes.internal.mcp_contract import CANONICAL_READ_POLICIES


HERE = Path(__file__).resolve().parent
FIXTURE_PATH = HERE / "check_canonical_master_write_function_runtime_role.py"
SPEC = importlib.util.spec_from_file_location("master_write_fixture", FIXTURE_PATH)
assert SPEC and SPEC.loader
fixture = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(fixture)


def _context(operation_key: str):
    return mcp_canonical_reads.CanonicalDelegation(
        auth_user_id=fixture.AUTH_A,
        user_id=fixture.USER_A,
        organization_id=fixture.ORG_A,
        membership_id=fixture.MEMBER_A,
        agent_grant_id=fixture.GRANT_A,
        client_id="postgres-runtime-test",
        policy=CANONICAL_READ_POLICIES[operation_key],
        branch_id=None,
        allow_sensitive_read=False,
    )


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            fixture._seed(connection)
            connection.exec_driver_sql('SET SESSION AUTHORIZATION "erp_runtime"')
            connection.exec_driver_sql(
                "SELECT pg_catalog.set_config("
                f"'app.request_id','{fixture.PRODUCT_A}',true)"
            )
            connection.exec_driver_sql(
                "SELECT erp_security.activate_context("
                f"'{fixture.AUTH_A}'::uuid,'{fixture.ORG_A}'::uuid)"
            )

            transactional = mcp_canonical_reads.canonical_product_search(
                "Draft", 20, 0, _context("master.products.search"), connection
            )
            assert transactional == []

            master = mcp_canonical_reads.canonical_product_master_search(
                "Draft", 20, 0,
                _context("master.product_catalog.search"), connection,
            )
            assert len(master) == 1
            assert {row["product_id"] for row in master} == {fixture.PRODUCT_A}
            assert all(row["lifecycle_status"] == "draft" for row in master)
            assert all(row["row_version"] == 1 for row in master)
            assert fixture.PRODUCT_B not in {row["product_id"] for row in master}

            try:
                mcp_canonical_reads.canonical_product_master_search(
                    "Draft", 20, 0, _context("master.products.search"), connection
                )
            except HTTPException as exc:
                assert exc.status_code == 403
            else:
                raise AssertionError("cross-operation product delegation unexpectedly succeeded")
        finally:
            transaction.rollback()
            connection.exec_driver_sql("RESET SESSION AUTHORIZATION")
            engine.dispose()


if __name__ == "__main__":
    main()
