#!/usr/bin/env python3
"""Verify the installed finance command clock uses the active org timezone."""

from __future__ import annotations

import os

import psycopg2


DATABASE_URL = os.environ["DATABASE_URL"].replace(
    "postgresql+psycopg2://", "postgresql://", 1
)
RESOLVERS = (
    "erp_automation_commands.resolve_customer_receipt_prepare(uuid,uuid,uuid,uuid,uuid,character varying,uuid,jsonb)",
    "erp_automation_commands.resolve_supplier_advance_prepare(uuid,uuid,uuid,uuid,uuid,character varying,uuid,jsonb)",
    "erp_automation_commands.resolve_supplier_payment_prepare(uuid,uuid,uuid,uuid,uuid,character varying,uuid,jsonb)",
)


def main() -> int:
    with psycopg2.connect(DATABASE_URL) as connection:
        connection.autocommit = False
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT procedure.oid::regprocedure::text,
                       pg_catalog.pg_get_functiondef(procedure.oid)
                  FROM pg_catalog.pg_proc procedure
                 WHERE procedure.oid = ANY(%s::pg_catalog.regprocedure[])
                 ORDER BY procedure.oid::regprocedure::text
                """,
                (list(RESOLVERS),),
            )
            rows = cursor.fetchall()
            assert len(rows) == len(RESOLVERS), rows
            for signature, definition in rows:
                assert "payment_date>CURRENT_DATE" not in definition, signature
                business_clock = (
                    'payment_date>"erp_core_commands".'
                    '"current_organization_business_date"()'
                )
                assert business_clock in definition, signature
                assert definition.index(
                    "PERFORM erp_security.activate_context(auth_user_id,organization_id);"
                ) < definition.index(business_clock), signature

            cursor.execute(
                """
                SELECT procedure.prosecdef,
                       owner.rolname,
                       pg_catalog.has_function_privilege(
                           'erp_runtime', procedure.oid, 'EXECUTE'
                       ),
                       pg_catalog.has_function_privilege(
                           'erp_app', procedure.oid, 'EXECUTE'
                       ),
                       pg_catalog.pg_get_functiondef(procedure.oid)
                  FROM pg_catalog.pg_proc procedure
                  JOIN pg_catalog.pg_roles owner ON owner.oid=procedure.proowner
                 WHERE procedure.oid =
                       'erp_core_commands.current_organization_business_date()'
                       ::pg_catalog.regprocedure
                """
            )
            security_definer, owner, runtime_execute, app_execute, definition = (
                cursor.fetchone()
            )
            assert (
                security_definer,
                owner,
                runtime_execute,
                app_execute,
            ) == (
                True,
                "erp_migration_owner",
                True,
                False,
            )
            assert "current_setting('app.org_id', true)" in definition
            assert "transaction_timestamp() AT TIME ZONE organization.timezone" in definition
            assert "organization.status = 'active'" in definition
        connection.rollback()

    print("finance organization business-date authority passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
