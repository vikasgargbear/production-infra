from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path


ROOT = Path(__file__).parents[3]
GENERATOR = ROOT / "backend/scripts/generate_sales_invoice_product_identity_migration.py"
SQL_PATH = ROOT / "backend/alembic/sql/20260828_0037_sales_invoice_product_identity.sql"
REVISION_PATH = (
    ROOT
    / "backend/alembic/versions/20260828_0037_sales_invoice_product_identity.py"
)
AUTOMATION_PRIVILEGE_FIXTURE = (
    ROOT / "database/canonical/commands_automation/test_automation_commands_rollback.sql"
)


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_product_identity_migration_is_generator_owned_and_hash_bound() -> None:
    generator = _load(GENERATOR, "sales_invoice_product_identity_generator")
    revision = _load(REVISION_PATH, "sales_invoice_product_identity_revision")
    sql = SQL_PATH.read_text(encoding="utf-8")

    assert generator.generate_sql() == sql
    assert revision.revision == "20260828_0037"
    assert revision.down_revision == "20260828_0036"
    assert hashlib.sha256(sql.encode()).hexdigest() == revision.EXPECTED_SQL_SHA256
    assert generator.FUNCTION_DEFINITION in sql


def test_product_identity_is_read_for_exact_resolved_product_versions() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")

    for fragment in (
        "resolve_sales_invoice_product_identities",
        "organization_id IS DISTINCT FROM erp_security.current_org_id()",
        "product.id=requested.product_id",
        "product.row_version=requested.product_row_version",
        "'product_code',matched.product_code",
        "'product_name',matched.product_name",
    ):
        assert fragment in sql
    assert "GRANT SELECT" not in sql
    assert "TO erp_calculator" in sql
    assert "TO erp_runtime" not in sql.split("GRANT EXECUTE", 1)[-1]


def test_product_identity_calculator_privilege_is_exactly_reviewed() -> None:
    fixture = AUTOMATION_PRIVILEGE_FIXTURE.read_text(encoding="utf-8")
    signature = (
        "erp_automation_commands.resolve_sales_invoice_product_identities(uuid,jsonb)"
    )

    assert fixture.count(signature) == 6
    assert f"'{signature}'\n       ) IS NOT NULL THEN" in fixture
    assert (
        "procedure.oid IS DISTINCT FROM pg_catalog.to_regprocedure("
        in fixture
    )
    for role in ("erp_runtime", "erp_app", "public"):
        assert f"'{role}',\n             '{signature}'" in fixture
    assert "'erp_calculator',\n             '" + signature + "'" in fixture
