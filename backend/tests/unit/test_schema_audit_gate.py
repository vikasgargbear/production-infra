from pathlib import Path

import pytest

from app.core.utils import schema_validator
from scripts import audit_schema


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_canonical_catalog_is_the_only_query_schema_authority() -> None:
    schema_validator._SCHEMA_CACHE = None

    catalog = schema_validator.parse_schema_catalog(required=True)

    assert len(catalog) == 124
    assert "sales.invoices" in catalog
    assert "id" in catalog["sales.invoices"]
    assert "invoice_id" not in catalog["sales.invoices"]
    assert "tax.input_credit_reversal_events" in catalog
    assert "physical_destruction_confirmed_at" in catalog["compliance.destructions"]


def test_required_catalog_parse_fails_closed_when_domains_are_missing(monkeypatch) -> None:
    schema_validator._SCHEMA_CACHE = None
    monkeypatch.setattr(schema_validator, "_default_canonical_domain_paths", lambda: [])

    with pytest.raises(FileNotFoundError, match="No canonical domain catalogs"):
        schema_validator.parse_schema_catalog(required=True)


def test_post_baseline_alembic_addition_targets_known_table(tmp_path: Path) -> None:
    sql = tmp_path / "addition.sql"
    sql.write_text(
        "ALTER TABLE core.missing ADD COLUMN fact_id uuid;\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="ADD COLUMN targets unknown table"):
        schema_validator._parse_alembic_schema_additions(
            [sql], {"core.known": {"id"}}
        )


def test_f_string_sql_is_validated_as_one_query(tmp_path: Path) -> None:
    module = tmp_path / "dynamic_read.py"
    module.write_text(
        'field = "id"\nQUERY = f"""SELECT invoice.id FROM sales.invoices invoice '
        'WHERE invoice.id = {field}"""\n',
        encoding="utf-8",
    )

    result = schema_validator.validate_module(module)

    assert result["total_queries"] == 1
    assert result["valid_queries"] == 1
    assert result["errors"] == []


def test_query_validation_rejects_retired_integer_id_column() -> None:
    with pytest.raises(ValueError, match="invoice_id"):
        schema_validator.validate_query(
            "SELECT invoice.invoice_id FROM sales.invoices AS invoice"
        )


def test_current_backend_queries_match_canonical_catalogs() -> None:
    schema_validator._SCHEMA_CACHE = None

    results = audit_schema.scan_directory(REPO_ROOT / "backend/app")

    assert results == []


def test_canonical_router_query_is_validated(tmp_path: Path) -> None:
    module = tmp_path / "canonical_read.py"
    module.write_text(
        'QUERY = """SELECT invoice.id, invoice.rounding_policy '
        'FROM sales.invoices AS invoice"""\n',
        encoding="utf-8",
    )

    result = schema_validator.validate_module(module)

    assert result["total_queries"] == 1
    assert result["valid_queries"] == 1
    assert result["errors"] == []
