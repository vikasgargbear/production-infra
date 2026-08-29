"""Prove tenant product reference masters through the restricted runtime role."""

from __future__ import annotations

import hashlib
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


def _digest(value: str) -> bytes:
    return hashlib.sha256(value.encode("utf-8")).digest()


def _denied(connection, statement: str, parameters: dict) -> None:
    savepoint = connection.begin_nested()
    try:
        connection.execute(text(statement), parameters)
    except DBAPIError:
        savepoint.rollback()
    else:
        savepoint.rollback()
        raise AssertionError("restricted or cross-tenant product reference write succeeded")


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            fixture._seed(connection)
            connection.exec_driver_sql('SET SESSION AUTHORIZATION "erp_runtime"')
            connection.execute(text(
                "SELECT pg_catalog.set_config('app.request_id',pg_catalog.gen_random_uuid()::text,true)"
            ))
            connection.execute(
                text("SELECT erp_security.activate_context(:auth,:org)"),
                {"auth": fixture.AUTH_A, "org": fixture.ORG_A},
            )

            category_sql = """
                SELECT category_id,category_code,created_category_name,row_version,idempotency_replayed
                  FROM erp_master_commands.create_product_category(
                    :org,:name,:key,transaction_timestamp()+interval '1 hour'
                  )
            """
            category_parameters = {
                "org": fixture.ORG_A, "name": "Analgesics",
                "key": _digest("reference-category"),
            }
            category = connection.execute(text(category_sql), category_parameters).one()
            assert category[1:4] == ("ANALGESICS", "Analgesics", 1)
            assert category[-1] is False
            assert connection.execute(text(category_sql), category_parameters).one()[:-1] == category[:-1]
            assert connection.execute(text(category_sql), category_parameters).one()[-1] is True
            _denied(
                connection,
                category_sql,
                {
                    **category_parameters,
                    "name": "  analgesics  ",
                    "key": _digest("reference-category-duplicate"),
                },
            )

            manufacturer_sql = """
                SELECT manufacturer_party_id,legal_name,row_version,idempotency_replayed
                  FROM erp_master_commands.create_product_manufacturer(
                    :org,:name,:key,transaction_timestamp()+interval '1 hour'
                  )
            """
            manufacturer_parameters = {
                "org": fixture.ORG_A, "name": "Exact Pharma Laboratories",
                "key": _digest("reference-manufacturer"),
            }
            manufacturer = connection.execute(
                text(manufacturer_sql), manufacturer_parameters
            ).one()
            assert manufacturer[1:] == ("Exact Pharma Laboratories", 1, False)
            assert connection.execute(
                text(manufacturer_sql), manufacturer_parameters
            ).one() == (*manufacturer[:-1], True)
            assert connection.execute(text("""
                SELECT status,row_version
                  FROM parties.parties
                 WHERE org_id=:org AND id=:party
            """), {
                "org": fixture.ORG_A, "party": manufacturer[0],
            }).one() == ("active", 2)
            _denied(
                connection,
                manufacturer_sql,
                {
                    **manufacturer_parameters,
                    "name": " exact pharma laboratories ",
                    "key": _digest("reference-manufacturer-duplicate"),
                },
            )

            visible = connection.execute(text("""
                SELECT party.legal_name
                  FROM catalog.manufacturers manufacturer
                  JOIN parties.parties party
                    ON party.org_id=manufacturer.org_id AND party.id=manufacturer.party_id
                 WHERE manufacturer.org_id=:org
            """), {"org": fixture.ORG_A}).scalars().all()
            assert visible == ["Exact Pharma Laboratories"]
            assert connection.execute(text("""
                SELECT count(*) FROM parties.supplier_accounts
                 WHERE org_id=:org AND party_id=:party
            """), {"org": fixture.ORG_A, "party": manufacturer[0]}).scalar_one() == 0

            _denied(
                connection,
                "INSERT INTO catalog.categories(org_id,code,name) VALUES (:org,'FORGED','Forged')",
                {"org": fixture.ORG_A},
            )
            _denied(
                connection,
                "SELECT * FROM erp_master_commands.create_product_category(:org,'Hidden',:key,transaction_timestamp()+interval '1 hour')",
                {"org": fixture.ORG_B, "key": _digest("cross-tenant-category")},
            )
        finally:
            transaction.rollback()
            connection.exec_driver_sql("RESET SESSION AUTHORIZATION")
            engine.dispose()


if __name__ == "__main__":
    main()
