from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path


ROOT = Path(__file__).parents[3]
SOURCE = ROOT / "database/canonical/operations/master/product_setup_commands.sql"
MIGRATION = ROOT / "backend/alembic/sql/20260829_0054_product_activation_business_date.sql"
REVISION = ROOT / "backend/alembic/versions/20260829_0054_product_activation_business_date.py"
GENERATOR = ROOT / "backend/scripts/generate_product_activation_business_date_migration.py"


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_business_date_migration_is_generated_hash_bound_and_linear() -> None:
    generator = _load(GENERATOR, "product_activation_business_date_generator")
    revision = _load(REVISION, "product_activation_business_date_revision")

    assert MIGRATION.read_text(encoding="utf-8") == generator.render()
    assert revision.revision == "20260829_0054"
    assert revision.down_revision == "20260829_0053"
    assert revision.EXPECTED_SQL_SHA256 == hashlib.sha256(MIGRATION.read_bytes()).hexdigest()


def test_activation_is_scoped_to_the_organization_clock_and_restores_the_session() -> None:
    source = SOURCE.read_text(encoding="utf-8")
    migration = MIGRATION.read_text(encoding="utf-8")

    assert "current_organization_business_date()" in source
    assert "SELECT organization.timezone INTO STRICT organization_timezone" in source
    assert "set_config('TimeZone',organization_timezone,true)" in source
    assert source.count("set_config('TimeZone',prior_timezone,true)") == 2
    assert "CURRENT_DATE BETWEEN" not in source
    assert (
        "REVOKE EXECUTE ON FUNCTION erp_regulatory_commands.activate_product" in migration
    )
