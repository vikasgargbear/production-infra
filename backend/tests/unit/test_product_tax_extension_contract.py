"""Current tax scope is a forward extension of the global-reference baseline."""

import json
import hashlib
import re
from pathlib import Path


REPO = Path(__file__).resolve().parents[3]
CONTRACT = REPO / "database/canonical/operations/tax/product_tax_authority.contract.json"


def test_forward_revision_packages_current_named_sources_and_preserves_history() -> None:
    from scripts.generate_scoped_product_tax_migration import OUTPUT, TARGETS, render

    sql = OUTPUT.read_text()
    assert sql == render()
    revision = (REPO / "backend/alembic/versions/20260907_0077_scoped_product_tax.py").read_text()
    assert hashlib.sha256(sql.encode()).hexdigest() in revision
    assert 'down_revision = "20260901_0076"' in revision
    for functions in TARGETS.values():
        for function in functions:
            assert sql.count(f'."{function}"(') >= 1
    assert "future" in sql and "dispatch_date" in sql


def test_forward_tax_scope_metadata_matches_schema_and_forced_rls() -> None:
    contract = json.loads(CONTRACT.read_text())
    sql = (REPO / contract["source_owner"]).read_text()
    assert contract["scope"] == "global_reference_or_owning_organization"
    predicate = contract["tenant_predicate"]
    for table, metadata in contract["tables"].items():
        assert metadata["force_rls"] is True
        assert f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY;" in sql
        # Check each declared column in its own table's ALTER block.
        blocks = re.findall(rf"ALTER TABLE {re.escape(table)}\s+(.*?);", sql, re.S)
        for name, type_name in metadata["added_nullable_columns"].items():
            assert any(f"ADD COLUMN {name} {type_name}" in block for block in blocks)
        select = re.search(rf"ALTER POLICY {metadata['select_policy']} ON {re.escape(table)} USING\s+(.*?);", sql, re.S)
        assert select and "org_id IS NULL" in select[1] and predicate in select[1]
        owner = re.search(rf"CREATE POLICY {metadata['owner_policy']} ON {re.escape(table)} FOR ALL TO {contract['owner_role']}\s+(.*?);", sql, re.S)
        assert owner and owner[1].count(predicate) == 2  # USING and WITH CHECK
        assert f"CREATE UNIQUE INDEX {metadata['scoped_unique_index']}" in sql
        for status in metadata["scoped_statuses"]:
            assert f"'{status}'" in sql


def test_global_tax_identity_is_retained_alongside_scoped_identity() -> None:
    contract = json.loads(CONTRACT.read_text())
    sql = (REPO / contract["source_owner"]).read_text()
    core = json.loads((REPO / contract["baseline_descriptors"][0]).read_text())
    release = next(table for table in core["tables"] if table["name"] == "core.reference_data_releases")
    index_name = contract["tables"]["core.reference_data_releases"]["preserved_global_index"]
    assert next(index for index in release["indexes"] if index["name"] == index_name)["where"] == "status='active'"
    assert not re.search(rf"DROP\s+INDEX(?:\s+IF\s+EXISTS)?\s+(?:\w+\.)?{index_name}\b", sql, re.I)
    assert re.search(r"CREATE UNIQUE INDEX tax_code_versions_code_version_uq.*?WHERE org_id IS NULL;", sql, re.S)
    for foreign_key in contract["tables"]["tax.tax_code_versions"]["source_foreign_keys"]:
        assert f"ADD CONSTRAINT {foreign_key}" in sql
