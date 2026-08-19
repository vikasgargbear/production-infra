import json
from collections import Counter
from pathlib import Path

import pytest

from app.core.utils import schema_validator


REPO_ROOT = Path(__file__).resolve().parents[3]


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


def test_every_current_query_schema_failure_has_exact_fail_closed_inventory():
    inventory_path = REPO_ROOT / "docs/architecture/query-schema-conflicts.json"
    inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
    expected = Counter(
        (query["file"], query["line"], query["query_sha256"])
        for classification in inventory["classifications"]
        for query in classification["queries"]
    )

    actual = Counter()
    app_root = REPO_ROOT / "backend/app"
    for module_path in app_root.rglob("*.py"):
        if any(
            skipped in str(module_path)
            for skipped in ("migrations", "__pycache__", "venv", ".venv", "test_")
        ):
            continue

        result = schema_validator.validate_module(module_path)
        relative_file = module_path.relative_to(REPO_ROOT).as_posix()
        actual.update(
            (relative_file, error["line"], error["query_sha256"])
            for error in result["errors"]
        )

    assert inventory["readiness_state"] == "pending-live-baseline"
    assert inventory["expected_failure_count"] == 36
    assert sum(expected.values()) == inventory["expected_failure_count"]
    assert actual == expected
