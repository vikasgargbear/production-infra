from __future__ import annotations

import json
from pathlib import Path
import subprocess

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
    assert contract.canonical_table_count == 111


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
        for relation in operation["authoritative_tables"]:
            assert relation in migration_sql, f"{operation['id']}: missing {relation}"


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
