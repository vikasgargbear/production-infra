"""Prove 0020 fresh-head, incremental, reapply, and drift behavior on PG15."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

import psycopg2
from sqlalchemy.engine import make_url


ROOT = Path(__file__).resolve().parents[3]
MIGRATION = (
    ROOT / "backend/alembic/sql/20260825_0020_calculation_schema_c_collation.sql"
).read_text(encoding="utf-8")
INPUT_SIGNATURE = "erp_calculation_authority.assert_input_schema(jsonb)"
OUTPUT_SIGNATURE = "erp_calculation_authority.assert_output_schema(jsonb)"
OLD_ORDER = "pg_catalog.array_agg(key ORDER BY key)"
CURRENT_ORDER = 'pg_catalog.array_agg(key ORDER BY key COLLATE "C")'
OLD_INPUT_SHA256 = "db834c04e671195c7e0a2ecf5592cbdd3c84b403a7f01cefe8977f6a16f80d03"
OLD_OUTPUT_SHA256 = "e34e27df9a33aac447026a10925e4396d72cafaf6b7da81deda3be49232ab18a"
CURRENT_INPUT_SHA256 = "6174e366b33e1cf092085fc9cb2e551d6a1f02015d1364c870dfe17df555be33"
CURRENT_OUTPUT_SHA256 = "1966f2ab105df85c714210b64d1a951d82cd549f12487b38f78bcbd720632607"


def _definition(cursor, signature: str) -> str:
    cursor.execute(
        "SELECT pg_catalog.pg_get_functiondef(%s::pg_catalog.regprocedure)",
        (signature,),
    )
    return str(cursor.fetchone()[0])


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _expect_rejection(cursor) -> None:
    cursor.execute("SAVEPOINT before_calculation_validator_drift")
    try:
        cursor.execute(MIGRATION)
    except psycopg2.Error as error:
        assert error.pgcode == "55000"
        assert (
            "calculation schema validators differ from the reviewed collation "
            "migration precondition" in str(error)
        )
        cursor.execute("ROLLBACK TO SAVEPOINT before_calculation_validator_drift")
    else:
        raise AssertionError("0020 accepted altered calculation schema validators")


def main() -> None:
    url = make_url(os.environ["DATABASE_URL"])
    connection = psycopg2.connect(
        host=url.host,
        port=url.port or 5432,
        dbname=url.database,
        user=url.username,
        password=url.password or "",
    )
    try:
        with connection.cursor() as cursor:
            cursor.execute("SHOW server_version_num")
            assert 150000 <= int(cursor.fetchone()[0]) < 160000
            current_input = _definition(cursor, INPUT_SIGNATURE)
            current_output = _definition(cursor, OUTPUT_SIGNATURE)
            assert _sha256(current_input) == CURRENT_INPUT_SHA256
            assert _sha256(current_output) == CURRENT_OUTPUT_SHA256
            assert current_input.count(CURRENT_ORDER) == 12
            assert current_output.count(CURRENT_ORDER) == 3

            # A fresh 0001→0020 database already contains the exact generator
            # definitions; reapplying 0020 must be a byte-identical no-op.
            cursor.execute(MIGRATION)
            assert _sha256(_definition(cursor, INPUT_SIGNATURE)) == CURRENT_INPUT_SHA256
            assert _sha256(_definition(cursor, OUTPUT_SIGNATURE)) == CURRENT_OUTPUT_SHA256

            # Reconstruct the exact 0019 catalog definitions and prove the
            # incremental migration reaches the same reviewed current hashes.
            old_input = current_input.replace(CURRENT_ORDER, OLD_ORDER)
            old_output = current_output.replace(CURRENT_ORDER, OLD_ORDER)
            assert _sha256(old_input) == OLD_INPUT_SHA256
            assert _sha256(old_output) == OLD_OUTPUT_SHA256
            cursor.execute(old_input)
            cursor.execute(old_output)
            cursor.execute(MIGRATION)
            assert _sha256(_definition(cursor, INPUT_SIGNATURE)) == CURRENT_INPUT_SHA256
            assert _sha256(_definition(cursor, OUTPUT_SIGNATURE)) == CURRENT_OUTPUT_SHA256

            altered_input = current_input.replace(
                "product calculation input schema is invalid",
                "altered product calculation input schema is invalid",
            )
            assert altered_input != current_input and CURRENT_ORDER in altered_input
            cursor.execute(altered_input)
            altered_input_hash = _sha256(_definition(cursor, INPUT_SIGNATURE))
            _expect_rejection(cursor)
            assert _sha256(_definition(cursor, INPUT_SIGNATURE)) == altered_input_hash
            cursor.execute(current_input)

            altered_output = current_output.replace(
                "calculation output top-level schema is invalid",
                "altered calculation output top-level schema is invalid",
            )
            assert altered_output != current_output and CURRENT_ORDER in altered_output
            cursor.execute(altered_output)
            altered_output_hash = _sha256(_definition(cursor, OUTPUT_SIGNATURE))
            _expect_rejection(cursor)
            assert _sha256(_definition(cursor, OUTPUT_SIGNATURE)) == altered_output_hash
    finally:
        connection.rollback()
        connection.close()


if __name__ == "__main__":
    main()
