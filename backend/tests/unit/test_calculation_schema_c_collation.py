from __future__ import annotations

import hashlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
GENERATOR = (
    ROOT
    / "database/canonical/calculation_authority/generate_calculation_authority.py"
)
GENERATED_SQL = (
    ROOT / "database/canonical/calculation_authority/calculation-authority.sql"
)
MIGRATION = (
    ROOT / "backend/alembic/sql/20260825_0020_calculation_schema_c_collation.sql"
)
REVISION = (
    ROOT / "backend/alembic/versions/20260825_0020_calculation_schema_c_collation.py"
)


def test_calculation_schema_key_order_is_locale_independent_everywhere() -> None:
    generator = GENERATOR.read_text(encoding="utf-8")
    generated = GENERATED_SQL.read_text(encoding="utf-8")
    exact_order = 'pg_catalog.array_agg(key ORDER BY key COLLATE "C")'
    legacy_order = "pg_catalog.array_agg(key ORDER BY key)"

    assert generator.count(exact_order) == 15
    assert generated.count(exact_order) == 15
    assert legacy_order not in generator
    assert legacy_order not in generated


def test_calculation_schema_collation_migration_is_exact_hash_bound() -> None:
    migration = MIGRATION.read_text(encoding="utf-8")
    revision = REVISION.read_text(encoding="utf-8")

    assert hashlib.sha256(migration.encode("utf-8")).hexdigest() in revision
    assert 'revision = "20260825_0020"' in revision
    assert 'down_revision = "20260825_0019"' in revision
    for expected_hash in (
        "db834c04e671195c7e0a2ecf5592cbdd3c84b403a7f01cefe8977f6a16f80d03",
        "e34e27df9a33aac447026a10925e4396d72cafaf6b7da81deda3be49232ab18a",
        "6174e366b33e1cf092085fc9cb2e551d6a1f02015d1364c870dfe17df555be33",
        "1966f2ab105df85c714210b64d1a951d82cd549f12487b38f78bcbd720632607",
    ):
        assert expected_hash in migration
    assert migration.count('COLLATE "C"') == 1
    assert "ERRCODE='55000'" in migration
