from pathlib import Path

import pytest

from app.api.routes import canonical_erp_reads, canonical_goods_receipts
from app.core.utils import schema_validator


def test_checked_in_canonical_catalogs_are_the_only_static_schema_authority() -> None:
    schema_validator._SCHEMA_CACHE = None

    schema = schema_validator.parse_schema_doc(required=True)

    assert "core.organizations" in schema
    assert "sales.invoices" in schema
    assert "id" in schema["sales.invoices"]
    assert "master.organizations" not in schema
    assert "public.document_number_sequences" not in schema


def test_required_schema_parse_fails_closed_without_canonical_catalogs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    schema_validator._SCHEMA_CACHE = None
    monkeypatch.setattr(schema_validator, "_default_canonical_domain_paths", lambda: [])

    with pytest.raises(FileNotFoundError, match="No canonical domain catalogs"):
        schema_validator.parse_schema_doc(required=True)


@pytest.mark.parametrize(
    "module_path",
    [
        Path(canonical_erp_reads.__file__),
        Path(canonical_goods_receipts.__file__),
    ],
)
def test_canonical_read_sql_matches_canonical_catalogs(module_path: Path) -> None:
    schema_validator._SCHEMA_CACHE = None
    result = schema_validator.validate_module(module_path)
    assert result["errors"] == []


def test_retired_live_capture_cannot_expand_the_schema_contract() -> None:
    source = Path(schema_validator.__file__).read_text(encoding="utf-8")

    assert "live-schema-evidence" not in source
    assert "captured_not_baselined" not in source
    assert "_load_live_verified_columns" not in source
