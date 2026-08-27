#!/usr/bin/env python3
"""Prove the deployment write fence against the migrated PostgreSQL head."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import psycopg2


ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend/scripts"))
from manage_canonical_write_fence import apply_fence  # noqa: E402


DATABASE_URL = os.environ["DATABASE_URL"]
PSYCOPG_DSN = DATABASE_URL.replace("postgresql+psycopg2://", "postgresql://", 1)
COMMIT_SHA = subprocess.check_output(
    ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
).strip()


def scalar(query: str):
    with psycopg2.connect(PSYCOPG_DSN) as connection:
        with connection.cursor() as cursor:
            cursor.execute(query)
            return cursor.fetchone()[0]


def require_runtime_denial(statement: str) -> None:
    try:
        with psycopg2.connect(PSYCOPG_DSN) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SET ROLE erp_runtime")
                cursor.execute(statement)
    except psycopg2.Error as error:
        if error.pgcode != "42501":
            raise AssertionError(
                f"write-fence probe failed with unexpected SQLSTATE {error.pgcode}"
            ) from error
        return
    raise AssertionError("erp_runtime retained a write path while the fence was closed")


closed = False
try:
    close_receipt = apply_fence(
        DATABASE_URL,
        action="close",
        commit_sha=COMMIT_SHA,
    )
    closed = True
    assert close_receipt["state"] == "closed"
    assert close_receipt["runtime_inherits_erp_app"] is False
    assert all(
        not any(counts.values())
        for counts in close_receipt["service_mutation_privileges"].values()
    )

    # Readiness remains observable while every business mutation boundary is
    # closed. These probes represent both inherited direct DML and typed
    # command execution used by mounted API routes.
    assert scalar("SELECT 1") == 1
    require_runtime_denial(
        "UPDATE catalog.products SET name=name WHERE false"
    )
    require_runtime_denial(
        "UPDATE parties.addresses SET updated_at=updated_at WHERE false"
    )
    require_runtime_denial(
        "UPDATE core.attachments SET status=status WHERE false"
    )
    require_runtime_denial(
        "INSERT INTO parties.addresses DEFAULT VALUES"
    )
    require_runtime_denial(
        "INSERT INTO core.attachments DEFAULT VALUES"
    )
    require_runtime_denial(
        "SELECT erp_automation_commands.execute_approved_command(NULL,NULL)"
    )
finally:
    if closed:
        open_receipt = apply_fence(
            DATABASE_URL,
            action="open",
            commit_sha=COMMIT_SHA,
        )
        assert open_receipt["state"] == "open"
        assert open_receipt["runtime_inherits_erp_app"] is True

assert scalar(
    "SELECT pg_catalog.has_table_privilege('erp_runtime','catalog.products','UPDATE')"
) is False
assert scalar(
    "SELECT pg_catalog.has_function_privilege("
    "'erp_runtime','erp_master_commands.update_product_draft(uuid,uuid,bigint,"
    "boolean,text,boolean,text,boolean,text)','EXECUTE')"
) is True
assert scalar(
    "SELECT pg_catalog.has_schema_privilege('erp_runtime','erp_automation_commands','USAGE')"
) is True
print("canonical write-fence PostgreSQL lifecycle passed")
