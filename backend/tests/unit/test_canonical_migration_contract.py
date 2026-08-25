from __future__ import annotations

import json
import importlib.util
from pathlib import Path
import re
import subprocess
import sys

from scripts.canonical_migration_contract import load_contract


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def test_canonical_migration_contract_is_linear_complete_and_declared() -> None:
    contract = load_contract()
    authority = json.loads(
        (REPOSITORY_ROOT / "database/schema-authority.json").read_text(encoding="utf-8")
    )
    declared = set(authority["required_migration_files"])

    assert contract.revisions[0].down_revision is None
    assert all(
        current.down_revision == previous.revision
        for previous, current in zip(contract.revisions, contract.revisions[1:])
    )
    assert contract.head == contract.revisions[-1].revision
    assert set(contract.required_files) <= declared
    domain_contract = json.loads(
        (REPOSITORY_ROOT / "database/canonical/domains/_contract.json").read_text(
            encoding="utf-8"
        )
    )
    assert contract.canonical_table_count >= domain_contract["table_count"]


def test_all_18_operation_relations_exist_in_the_migration_chain() -> None:
    matrix = json.loads(
        (REPOSITORY_ROOT / "docs/architecture/core-operation-authority-matrix.json")
        .read_text(encoding="utf-8")
    )
    assert len(matrix["operations"]) == 18
    migration_sql = "\n".join(
        (REPOSITORY_ROOT / relative_path).read_text(encoding="utf-8")
        for relative_path in load_contract().required_files
        if relative_path.endswith(".sql")
    )
    for operation in matrix["operations"]:
        assert operation["operation_key"]
        assert operation["rest_readback"].startswith("/api/")
        assert operation["mcp_prepare_tool"].startswith("erp_")
        for function in [operation["prepare_sql"], *operation["execute_sql"]]:
            schema, name = function.split(".", 1)
            definition = re.compile(
                rf'CREATE (?:OR REPLACE )?FUNCTION "?{re.escape(schema)}"?\."?{re.escape(name)}"?\('
            )
            assert definition.search(migration_sql), (
                f"{operation['id']}: missing command owner {function}"
            )
        for relation in operation["authoritative_tables"]:
            assert relation in migration_sql, f"{operation['id']}: missing {relation}"

    mcp_contract = json.loads(
        (REPOSITORY_ROOT / "docs/architecture/mcp-operator-actions.json").read_text(
            encoding="utf-8"
        )
    )
    published_tools = {
        action["tool"]
        for section in ("prepare_actions", "resolution_reads", "shared_actions")
        for action in mcp_contract[section]
    }
    assert {
        operation["mcp_prepare_tool"] for operation in matrix["operations"]
    } <= published_tools
    assert set(matrix["shared_mcp_lifecycle"]) <= published_tools


def test_retired_transaction_audit_failures_are_not_canonical_staging_evidence() -> None:
    evidence = json.loads(
        (REPOSITORY_ROOT / "database/live-schema-evidence.json").read_text(
            encoding="utf-8"
        )
    )
    audit_path = REPOSITORY_ROOT / "backend/scripts/audit/transaction_integrity_audit.py"
    spec = importlib.util.spec_from_file_location("retired_transaction_integrity", audit_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    codes = {issue.code for issue in module.collect_issues()}

    assert evidence["project_ref"] == "jfrairkkzxwkhbtqejnz"
    assert evidence["evidence_state"] == "captured_not_baselined"
    assert evidence["migration_history_available"] is False
    retired_codes = {
        "PAYMENT_IDEMPOTENCY_SCHEMA_UNVERIFIED",
        "ALLOCATION_TABLE_UNBASELINED",
        "LIVE_ALLOCATION_PROJECTION_OWNERSHIP_CONFLICT",
        "BANK_RECONCILIATION_SCHEMA_UNBASELINED",
        "LIVE_JOURNAL_IMMUTABILITY_NOT_DEPLOYED",
        "LIVE_ORDER_INVOICE_OWNERSHIP_CONFLICT",
        "LIVE_GRN_INVENTORY_OWNERSHIP_CONFLICT",
    }
    assert codes == {"CANONICAL_TRANSACTION_LIVE_EVIDENCE_MISSING"}
    assert codes.isdisjoint(retired_codes)
    assert module.RETIRED_SOURCE_PROJECT_REF == evidence["project_ref"]
    assert module.CANONICAL_STAGING_PROJECT_REF != evidence["project_ref"]
    staging_workflow = (
        REPOSITORY_ROOT / ".github/workflows/canonical-staging.yml"
    ).read_text(encoding="utf-8")
    assert evidence["project_ref"] not in staging_workflow
    assert "transaction_integrity_audit.py" in staging_workflow
    assert "--live-evidence staging-evidence/canonical-transaction-integrity.json" in staging_workflow
    assert '--expected-git-sha "$GITHUB_SHA"' in staging_workflow


def test_staging_workflow_has_no_literal_alembic_head_or_table_count() -> None:
    workflow = (
        REPOSITORY_ROOT / ".github/workflows/canonical-staging.yml"
    ).read_text(encoding="utf-8")
    contract = load_contract()

    assert contract.head not in workflow
    assert "canonical_migration_contract.py --print-head" in workflow
    assert "canonical_migration_contract.py --print-table-count" in workflow
    assert "--arg revision \"$CANONICAL_ALEMBIC_HEAD\"" in workflow
    assert "--argjson canonical_table_count \"$CANONICAL_TABLE_COUNT\"" in workflow


def test_canonical_migration_contract_cli_is_stable() -> None:
    script = REPOSITORY_ROOT / "backend/scripts/canonical_migration_contract.py"
    contract = load_contract()
    head = subprocess.run(
        ["python3", str(script), "--print-head"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    table_count = subprocess.run(
        ["python3", str(script), "--print-table-count"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()

    assert head == contract.head
    assert table_count == str(contract.canonical_table_count)
