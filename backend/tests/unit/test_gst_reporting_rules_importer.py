from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from uuid import UUID

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
SQL = REPO_ROOT / "backend/alembic/sql/20260825_0004_gst_reporting_rules_importer.sql"
REVISION = REPO_ROOT / "backend/alembic/versions/20260825_0004_gst_reporting_rules_importer.py"
MANIFEST = SQL.with_suffix(".manifest.json")
SCRIPT = REPO_ROOT / "backend/scripts/import_gst_reporting_rules.py"
PG_FIXTURE = REPO_ROOT / "database/canonical/commands_regulatory/head_test_gst_reporting_rules_importer.sql"


def _load_script():
    spec = importlib.util.spec_from_file_location("import_gst_reporting_rules", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_migration_is_hash_bound_linear_and_runtime_has_no_statutory_defaults() -> None:
    sql = SQL.read_text(encoding="utf-8")
    revision = REVISION.read_text(encoding="utf-8")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    digest = hashlib.sha256(sql.encode()).hexdigest()

    assert manifest["source_sql_sha256"] == digest
    assert manifest["seed_policy"] == "operator_reviewed_global_release_only_no_defaults"
    assert 'revision = "20260825_0004"' in revision
    assert 'down_revision = "20260825_0003"' in revision
    assert digest in revision
    assert "250000" not in sql
    assert "100000" not in sql
    assert "250000" not in SCRIPT.read_text(encoding="utf-8")
    assert "100000" not in SCRIPT.read_text(encoding="utf-8")
    assert sql.rstrip().endswith("RESET ROLE;")


def test_database_importer_uses_governed_exact_set_and_distinct_activation() -> None:
    sql = SQL.read_text(encoding="utf-8")
    assert "SESSION_USER<>'erp_regulatory_importer'" in sql
    assert "erp_regulatory_commands.stage_release(" in sql
    assert "erp_regulatory_commands.finish_release(" in sql
    assert "p_activated_by_user_id=p_reviewed_by_user_id" in sql
    assert "GSTR-1 reporting activator must be a distinct active typed user" in sql
    assert "activation_request_id" in sql
    assert "DROP CONSTRAINT gstr1_reporting_rule_versions_effective_uq" in sql
    assert "gstr1_reporting_rule_versions_active_effective_uq" in sql
    assert "extensions.digest(p_source_bytes,'sha256')" in sql
    assert "extensions.digest(p_dataset_bytes,'sha256')" in sql
    assert "canonical PostgreSQL JSONB bytes" in sql
    assert "one complete non-overlapping exact rule set" in sql
    assert "replacement must preserve the complete historical effective range" in sql
    assert "p_dataset_kind<>'gst_reporting_rules' AND p_publication_date>p_effective_from" in sql
    assert "daterange(" in sql
    assert "ranges.next_from<>ranges.effective_to+1" in sql
    assert "matching_count=supplied_count" in sql
    assert "idempotency key has different exact input" in sql
    assert "activation request id was already used for another release" in sql
    assert "gstr1_reporting_rule_versions_release_guard" in sql
    assert "TO erp_regulatory_importer" in sql
    assert "FROM PUBLIC, erp_app, erp_runtime" in sql


def test_official_boundary_rules_exist_only_as_explicit_test_input() -> None:
    # GSTN-published boundary values are input data, never application defaults.
    rules = [
        {
            "id": "d4100000-0000-7000-8000-000000000001",
            "rule_code": "b2cl_invoice_value_threshold",
            "rule_version": "through-2024-07-31",
            "b2cl_threshold_amount": "250000.00",
            "effective_from": "2024-07-01",
            "effective_to": "2024-07-31",
        },
        {
            "id": "d4100000-0000-7000-8000-000000000002",
            "rule_code": "b2cl_invoice_value_threshold",
            "rule_version": "from-2024-08-01",
            "b2cl_threshold_amount": "100000.00",
            "effective_from": "2024-08-01",
            "effective_to": "",
        },
    ]
    assert rules[0]["effective_to"] == "2024-07-31"
    assert rules[1]["effective_from"] == "2024-08-01"
    assert date.fromisoformat(rules[1]["effective_from"]) == (
        date.fromisoformat(rules[0]["effective_to"]).fromordinal(
            date.fromisoformat(rules[0]["effective_to"]).toordinal() + 1
        )
    )


def test_operator_script_rejects_unofficial_source_and_hash_mismatch(tmp_path: Path) -> None:
    module = _load_script()
    with pytest.raises(module.ImportInputError, match="official authority"):
        module.validate_official_source("gstn", "https://example.com/rules.pdf")
    module.validate_official_source("gstn", "https://tutorial.gstn.org.in/rules.pdf")
    module.validate_official_source(
        "gst_portal",
        "https://tutorial.gst.gov.in/downloads/invoiceuploadofflineutility.pdf",
    )

    source = tmp_path / "official.pdf"
    source.write_bytes(b"official reviewed bytes")
    with pytest.raises(module.ImportInputError, match="SHA-256 mismatch"):
        module.checked_bytes(source, "00" * 32, "official source")


class _Cursor:
    def __init__(self) -> None:
        self.query = ""
        self.parameters = ()

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, parameters):
        self.query = query
        self.parameters = parameters

    def fetchone(self):
        return (self.parameters[0],)


class _Connection:
    def __init__(self) -> None:
        self.cursor_value = _Cursor()
        self.committed = False

    def cursor(self):
        return self.cursor_value

    def commit(self):
        self.committed = True


def _envelope(module, reviewer: UUID, activator: UUID):
    payload = b"[]"
    return module.ImportEnvelope(
        release_id=UUID("d4100000-0000-7000-8000-000000000010"),
        ruleset_version="gstn-reviewed-v1",
        source_authority="gstn",
        source_uri="https://tutorial.gstn.org.in/source.pdf",
        source_storage_bucket="regulatory",
        source_storage_object_path="gst/source.pdf",
        source_media_type="application/pdf",
        source_bytes=b"source",
        source_sha256=hashlib.sha256(b"source").digest(),
        dataset_storage_bucket="regulatory",
        dataset_storage_object_path="gst/rules.json",
        dataset_bytes=payload,
        dataset_sha256=hashlib.sha256(payload).digest(),
        publication_date=date(2024, 8, 1),
        effective_from=date(2024, 8, 1),
        effective_to=None,
        reviewed_by_user_id=reviewer,
        reviewed_at=datetime(2026, 8, 25, 8, tzinfo=timezone.utc),
        activated_by_user_id=activator,
        activated_at=datetime(2026, 8, 25, 9, tzinfo=timezone.utc),
        request_id=UUID("d4100000-0000-7000-8000-000000000013"),
    )


def test_operator_call_preserves_bytes_hashes_and_distinct_attestation() -> None:
    module = _load_script()
    reviewer = UUID("d4100000-0000-7000-8000-000000000011")
    activator = UUID("d4100000-0000-7000-8000-000000000012")
    connection = _Connection()
    envelope = _envelope(module, reviewer, activator)

    assert module.import_release(connection, envelope) == envelope.release_id
    assert connection.committed
    assert "import_gstr1_reporting_release" in connection.cursor_value.query
    assert connection.cursor_value.parameters[7] == envelope.source_bytes
    assert connection.cursor_value.parameters[8] == envelope.source_sha256
    assert connection.cursor_value.parameters[11] == envelope.dataset_bytes
    assert connection.cursor_value.parameters[12] == envelope.dataset_sha256
    assert connection.cursor_value.parameters[16] == str(reviewer)
    assert connection.cursor_value.parameters[18] == str(activator)
    assert connection.cursor_value.parameters[20] == str(envelope.request_id)

    with pytest.raises(module.ImportInputError, match="must be distinct"):
        module.import_release(connection, _envelope(module, reviewer, reviewer))


def test_postgres_fixture_gates_privileges_provenance_and_no_defaults() -> None:
    fixture = PG_FIXTURE.read_text(encoding="utf-8")
    assert fixture.startswith("\\set ON_ERROR_STOP on\n\nBEGIN;")
    assert fixture.rstrip().endswith("ROLLBACK;")
    assert "has_function_privilege('erp_regulatory_importer'" in fixture
    assert "NOT pg_catalog.has_function_privilege('erp_app'" in fixture
    assert "gstr1_reporting_rule_versions_release_guard" in fixture
    assert "importer_definition LIKE '%250000%'" in fixture
    assert "importer_definition LIKE '%100000%'" in fixture
