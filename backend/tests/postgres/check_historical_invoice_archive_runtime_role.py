"""Prove the historical invoice archive through the restricted runtime role."""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError


HERE = Path(__file__).resolve().parent
FIXTURE_PATH = HERE / "check_canonical_master_write_function_runtime_role.py"
SPEC = importlib.util.spec_from_file_location("master_write_fixture", FIXTURE_PATH)
assert SPEC and SPEC.loader
fixture = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(fixture)


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            fixture._seed(connection)
            connection.exec_driver_sql('SET SESSION AUTHORIZATION "erp_runtime"')
            connection.execute(
                text("SELECT erp_security.activate_context(:auth,:org)"),
                {"auth": fixture.AUTH_A, "org": fixture.ORG_A},
            )
            assert connection.execute(text(
                "SELECT has_table_privilege(current_user, "
                "'automation.historical_migration_facts', 'SELECT')"
            )).scalar_one() is False
            result = connection.execute(
                text(
                    """
                    SELECT erp_automation_reads.historical_sales_invoice_archive(
                      :org,NULL::uuid[],'',0,50
                    )
                    """
                ),
                {"org": fixture.ORG_A},
            ).scalar_one()
            assert result == {"items": [], "total": 0, "offset": 0, "limit": 50}

            savepoint = connection.begin_nested()
            try:
                connection.execute(
                    text(
                        """
                        SELECT erp_automation_reads.historical_sales_invoice_archive(
                          :org,NULL::uuid[],'',0,50
                        )
                        """
                    ),
                    {"org": fixture.ORG_B},
                )
            except DBAPIError:
                savepoint.rollback()
            else:
                savepoint.rollback()
                raise AssertionError("cross-tenant historical invoice archive succeeded")
        finally:
            transaction.rollback()
            connection.exec_driver_sql("RESET SESSION AUTHORIZATION")
            engine.dispose()


if __name__ == "__main__":
    main()
