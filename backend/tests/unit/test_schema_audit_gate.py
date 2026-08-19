from pathlib import Path

import pytest

from app.core.utils import schema_validator


def test_checked_in_schema_docs_produce_usable_tables():
    schema_validator._SCHEMA_CACHE = None

    schema = schema_validator.parse_schema_doc(required=True)

    assert len(schema) > 0
    assert "sales.invoices" in schema
    assert "invoice_id" in schema["sales.invoices"]


def test_required_schema_parse_fails_closed_when_docs_are_missing(monkeypatch):
    schema_validator._SCHEMA_CACHE = None
    monkeypatch.setattr(schema_validator, "_default_schema_doc_paths", lambda: [])

    with pytest.raises(FileNotFoundError, match="No schema documentation found"):
        schema_validator.parse_schema_doc(required=True)


def test_markdown_parser_rejects_docs_without_column_definitions(tmp_path: Path):
    schema_doc = tmp_path / "empty.md"
    schema_doc.write_text("# Schema\n\n### sales.invoices\n", encoding="utf-8")

    assert schema_validator._parse_schema_docs([schema_doc]) == {}
