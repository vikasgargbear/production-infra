from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path

from scripts import generate_canonical_baseline as baseline


REPO = Path(__file__).resolve().parents[3]
ROOT = REPO / "database" / "canonical" / "commands_core"
GENERATOR = ROOT / "generate_core_commands_contract.py"


def _module():
    spec = importlib.util.spec_from_file_location("canonical_core_commands", GENERATOR)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _mapping_sql() -> str:
    mapping = json.loads((ROOT / "baseline-core-command-enforcements.json").read_text())
    return "\n".join(statement for entry in mapping["enforcements"] for statement in entry["statements"])


def test_generated_artifacts_are_deterministic_catalog_bound_and_partition_source() -> None:
    generator = _module()
    mapping_text, manifest_text = generator.generated_artifacts()
    manifest = json.loads(manifest_text)
    source = json.loads(
        (REPO / "database/canonical/invariants_agent/invariants-agent-manifest.json").read_text()
    )

    assert mapping_text == (ROOT / "baseline-core-command-enforcements.json").read_text()
    assert manifest_text == (ROOT / "core-commands-manifest.json").read_text()
    assert manifest["mapping_sha256"] == hashlib.sha256(mapping_text.encode()).hexdigest()
    assert manifest["catalog_sha256"] == generator._catalog_hash()
    assert manifest["resolved_count"] == 7
    assert manifest["blocked_count"] == 4
    assert "core.data_retention_cases:data_retention_cases_command_guard" in manifest[
        "resolved_invariants"
    ]
    assert set(manifest["resolved_invariants"]).isdisjoint(manifest["blocked_invariants"])
    assert set(manifest["resolved_invariants"]) | set(manifest["blocked_invariants"]) == set(
        source["blocked_invariants"]
    )


def test_mapping_composes_and_resolves_exactly_seven_prior_blockers() -> None:
    catalog = baseline.load_and_validate_catalog(REPO / "database/canonical/domains")
    paths = [
        REPO / "database/canonical/invariants/baseline-stable-enforcements.json",
        REPO / "database/canonical/invariants_agent/baseline-invariants-agent-enforcements.json",
    ]
    before = baseline._merge_reviewed_mappings(
        [baseline._load_enforcement_mapping(path) for path in paths]
    )
    commands = baseline._load_enforcement_mapping(ROOT / "baseline-core-command-enforcements.json")
    after = baseline._merge_reviewed_mappings([before, commands])
    before_result = baseline.generate_baseline(
        catalog, enforcement_mapping=before.invariants, allow_draft=True
    )
    after_result = baseline.generate_baseline(
        catalog, enforcement_mapping=after.invariants, allow_draft=True
    )
    remaining = {
        blocker["key"]
        for blocker in after_result.blockers
        if blocker["category"] == "cross_row_invariant"
    }

    assert len(commands.invariants) == 7
    assert len(before_result.blockers) - len(after_result.blockers) == 7
    assert set(_module().BLOCKED_REASONS) <= remaining


def test_sql_boundary_is_private_static_and_runtime_surface_is_narrow() -> None:
    sql = _mapping_sql()
    grant_lines = [line for line in sql.splitlines() if "GRANT EXECUTE ON FUNCTION" in line]

    assert "SECURITY DEFINER" in sql
    assert "SET search_path = ''" in sql
    assert "EXECUTE format" not in sql
    assert "IF NOT EXISTS" not in sql.upper()
    assert 'REVOKE ALL ON TABLE "erp_core_commands"."command_scopes"' in sql
    assert 'REVOKE ALL ON SCHEMA "erp_core_commands"' in sql
    assert len(grant_lines) == 5
    assert all('TO "erp_app"' in line for line in grant_lines)
    assert all("erp_runtime" not in line.split(" TO ", 1)[-1] for line in grant_lines)
    assert any('"complete_retention_case"' in line for line in grant_lines)


def test_access_grants_are_terminal_and_permission_resolution_is_transactional() -> None:
    sql = _mapping_sql()
    security = (
        REPO / "database/canonical/security/baseline-platform-enforcements.json"
    ).read_text()

    assert "terminal access grant is immutable" in sql
    assert "new access grant validity window has already ended" in sql
    assert "non-revoked access grant cannot carry revocation evidence" in sql
    assert "access-grant identity and validity window are immutable" in sql
    assert "NEW.expires_at>pg_catalog.transaction_timestamp()" in sql
    assert "grant_row.valid_from_at <= pg_catalog.transaction_timestamp()" in security
    assert "grant_row.expires_at > pg_catalog.transaction_timestamp()" in security
    assert "erp_security.has_permission(permission_code,branch_id)" in sql


def test_document_allocation_is_locked_idempotent_monotonic_and_replayable() -> None:
    sql = _mapping_sql()

    assert "WHERE org_id=organization_id AND id=sequence_id FOR UPDATE" in sql
    assert "core.claim_idempotency_key" in sql
    assert "sequence.next_value" in sql
    assert "SET next_value=next_value+1" in sql
    assert "NEW.next_value<>OLD.next_value+1" in sql
    assert "claim.status='succeeded'" in sql
    assert "claim.response_body" in sql
    assert "pg_catalog.greatest(sequence.padding::integer" in sql
    assert "document-sequence identity and format are immutable" in sql
    assert "new document sequence must start active" in sql


def test_versioned_master_changes_require_scoped_idempotent_commands() -> None:
    sql = _mapping_sql()

    assert "setting values are replaced by a new version, never updated in place" in sql
    assert "setting retirement requires atomic replacement command lineage" in sql
    assert "customer credit terms require the audited canonical command" in sql
    assert "supplier payment terms require the audited canonical command" in sql
    assert "expected_row_version" in sql
    assert "row_version=row_version+1" in sql
    assert "app.request_id" in sql
    assert "extensions.digest" in sql
    assert "expected_row_version IS NULL" in sql
    assert "changed before term update" in sql


def test_party_identity_freezes_after_every_typed_posted_use() -> None:
    sql = _mapping_sql()

    assert "FROM sales.invoices" in sql
    assert "FROM procurement.supplier_invoices" in sql
    assert "FROM tax.documents" in sql
    assert "invoice.status IN ('posted','reversed')" in sql
    assert "party identity used by a posted document is immutable" in sql
    assert "archived party is immutable" in sql
    assert "new party must start draft" in sql


def test_unsupported_agent_and_regulatory_facts_remain_explicitly_blocked() -> None:
    manifest = json.loads((ROOT / "core-commands-manifest.json").read_text())
    blocked = manifest["blocked_invariants"]

    assert "automation.agent_grant_capabilities:agent_grant_capabilities_revocation" in blocked
    assert "automation.command_requests:command_request_matches_grant" in blocked
    assert "automation.command_requests:command_execution_guard" in blocked
    assert "catalog.products:products_regulatory_classification" in blocked
    assert all(len(item["reason"]) >= 150 for item in blocked.values())


def test_postgres_fixture_is_rollback_only() -> None:
    fixture = (ROOT / "test_core_commands_rollback.sql").read_text()

    assert fixture.startswith("\\set ON_ERROR_STOP on\n\nBEGIN;")
    assert fixture.rstrip().endswith("ROLLBACK;")
    assert "prosecdef" in fixture
    assert "has_function_privilege" in fixture
    assert "command_scopes" in fixture
    assert "complete_retention_case" in fixture
    assert "runtime_commands<>5" in fixture
    assert "data_retention_cases_command_guard" in fixture
    assert "guard_triggers<>7" in fixture
