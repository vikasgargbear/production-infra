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


def test_live_verified_query_contract_clears_historical_failures_only():
    inventory_path = REPO_ROOT / "docs/architecture/query-schema-conflicts.json"
    inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
    historical = Counter(
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

    assert inventory["readiness_state"] == "live-verified-query-contracts"
    assert inventory["expected_failure_count"] == 0
    assert inventory["historical_failure_count"] == 36
    assert sum(historical.values()) == inventory["historical_failure_count"]
    assert actual == Counter()


def test_split_canonical_routers_use_canonical_domain_catalogs(tmp_path, monkeypatch):
    canonical_router = tmp_path / "canonical_adjustment_note_reads.py"
    canonical_router.write_text(
        'CANONICAL_SCHEMA_CATALOGS = True\n'
        'QUERY = """SELECT invoice.id, invoice.rounding_policy '
        'FROM sales.invoices invoice"""\n',
        encoding="utf-8",
    )
    monkeypatch.setattr(
        schema_validator,
        "_default_canonical_domain_paths",
        lambda: [REPO_ROOT / "database/canonical/domains/sales.json"],
    )

    result = schema_validator.validate_module(canonical_router)

    assert result["total_queries"] == 1
    assert result["valid_queries"] == 1
    assert result["errors"] == []


def test_live_schema_evidence_is_narrow_and_does_not_claim_baseline():
    evidence = json.loads(
        (REPO_ROOT / "database/live-schema-evidence.json").read_text(encoding="utf-8")
    )
    authority = json.loads(
        (REPO_ROOT / "database/schema-authority.json").read_text(encoding="utf-8")
    )

    verified = evidence["query_contract_verification"]["verified_columns"]
    assert evidence["evidence_state"] == "captured_not_baselined"
    assert evidence["migration_history_available"] is False
    assert evidence["query_contract_verification"]["historical_failure_count"] == 36
    assert evidence["query_contract_verification"]["current_failure_count"] == 0
    assert set(verified) == {
        "sales.delivery_challans",
        "sales.invoice_items",
        "sales.invoices",
        "sales.order_items",
        "sales.orders",
        "sales.sales_return_items",
        "sales.sales_returns",
    }
    assert evidence["pilot_readiness"]["status"] == "blocked"
    assert evidence["pilot_readiness"]["allows_live_writes"] is False
    assert (
        evidence["pilot_readiness"]["surface_assessment"]["business_reads"]
        == "blocked_pending_deployed_role_and_cross_tenant_proof"
    )
    assert evidence["tenant_isolation"]["force_rls_enabled"] == 0
    assert authority["readiness_state"] == "migrating"
    assert "latest_live_capture_evidence" not in authority


def test_live_schema_evidence_loader_fails_closed_on_an_unreviewed_state(tmp_path: Path):
    evidence_path = tmp_path / "evidence.json"
    evidence_path.write_text(
        json.dumps(
            {
                "evidence_state": "baselined",
                "artifact_sha256": "a" * 64,
                "capture_sql_sha256": "b" * 64,
                "query_contract_verification": {"verified_columns": {}},
            }
        ),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="captured_not_baselined"):
        schema_validator._load_live_verified_columns(evidence_path)
