import hashlib
import importlib.util
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOT = REPO_ROOT / "database" / "canonical" / "invariants_agent"
GENERATOR_PATH = ROOT / "generate_invariants_agent_contract.py"
MAPPING_PATH = ROOT / "baseline-invariants-agent-enforcements.json"
MANIFEST_PATH = ROOT / "invariants-agent-manifest.json"
STABLE_MAPPING_PATH = (
    REPO_ROOT / "database" / "canonical" / "invariants" / "baseline-stable-enforcements.json"
)


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def _generator():
    return _load_module("canonical_invariants_agent", GENERATOR_PATH)


def _baseline():
    backend = REPO_ROOT / "backend"
    sys.path.insert(0, str(backend))
    try:
        from scripts import generate_canonical_baseline
    finally:
        sys.path.pop(0)
    return generate_canonical_baseline


def _by_key() -> dict[str, str]:
    mapping = json.loads(MAPPING_PATH.read_text(encoding="utf-8"))
    return {
        f"{entry['table']}:{entry['invariant']}": "\n".join(entry["statements"])
        for entry in mapping["enforcements"]
    }


def test_artifacts_are_deterministic_catalog_bound_and_complete() -> None:
    generator = _generator()
    mapping_text, manifest_text = generator.generated_artifacts()
    manifest = json.loads(manifest_text)

    assert MAPPING_PATH.read_text(encoding="utf-8") == mapping_text
    assert MANIFEST_PATH.read_text(encoding="utf-8") == manifest_text
    assert manifest["mapping_sha256"] == hashlib.sha256(mapping_text.encode()).hexdigest()
    assert manifest["reviewed_count"] == 16
    assert manifest["resolved_count"] == 5
    assert manifest["blocked_count"] == 11
    assert manifest["reviewed_count"] == (
        manifest["resolved_count"] + manifest["blocked_count"]
    )
    assert set(manifest["resolved_invariants"]).isdisjoint(manifest["blocked_invariants"])
    assert set(manifest["resolved_invariants"]) | set(manifest["blocked_invariants"]) == generator.REVIEW_KEYS


def test_mapping_is_disjoint_and_composes_with_existing_stable_mapping() -> None:
    baseline = _baseline()
    stable = baseline._load_enforcement_mapping(STABLE_MAPPING_PATH)
    follow_up = baseline._load_enforcement_mapping(MAPPING_PATH)
    combined = baseline._merge_reviewed_mappings([stable, follow_up])
    catalog = baseline.load_and_validate_catalog(
        REPO_ROOT / "database" / "canonical" / "domains"
    )
    result = baseline.generate_baseline(
        catalog,
        enforcement_mapping=combined.invariants,
        allow_draft=True,
    )
    unresolved = {
        blocker["key"]
        for blocker in result.blockers
        if blocker["category"] == "cross_row_invariant"
    }

    assert set(stable.invariants).isdisjoint(follow_up.invariants)
    assert len(combined.invariants) == len(stable.invariants) + 5
    assert set(follow_up.invariants).isdisjoint(unresolved)
    assert set(json.loads(MANIFEST_PATH.read_text())["blocked_invariants"]) <= unresolved


def test_sql_is_static_private_and_does_not_claim_external_authority() -> None:
    sql = "\n".join(_by_key().values())

    assert "IF NOT EXISTS" not in sql.upper()
    assert "SECURITY DEFINER" not in sql.upper()
    assert "SET search_path = ''" in sql
    assert "EXECUTE format" not in sql
    assert "CDSCO" not in sql
    assert "NDPS ingredient" not in sql
    assert 'REVOKE ALL ON SCHEMA "erp_invariants_agent"' in sql
    assert sql.count("CREATE FUNCTION") == sql.count("REVOKE ALL ON FUNCTION")


def test_audit_chain_has_exact_version_lock_serialization_and_fork_guards() -> None:
    audit = _by_key()["core.audit_events:audit_events_append_only"]

    assert "pg-jsonb-sha256-v1" in audit
    assert "pg_advisory_xact_lock" in audit
    assert "hashtextextended(NEW.org_id::text, 9042026)" in audit
    assert "NEW.chain_sequence IS DISTINCT FROM COALESCE(prior_sequence, 0) + 1" in audit
    assert "jsonb_build_object" in audit
    assert "pg_catalog.sha256" in audit
    assert "ORDER BY event.chain_sequence DESC" in audit
    assert "NEW.previous_event_hash IS DISTINCT FROM chain_head" in audit
    assert "audit evidence hash does not match pg-jsonb-sha256-v1" in audit
    assert "audit_events_evidence_hash_uq" in audit
    assert "audit_events_chain_link_uq" in audit
    assert "audit events are append-only" in audit


def test_product_guards_are_fail_closed_without_a_fabricated_command_bypass() -> None:
    by_key = _by_key()
    state = by_key["catalog.products:products_state_and_first_use"]
    composition = by_key[
        "catalog.product_ingredients:active_medicine_has_composition"
    ]

    assert "post-first-use regulated product changes require an approved versioned command; none is persisted" in state
    assert "post-first-use composition changes require an approved versioned command; none is persisted" in state
    assert "NEW.regulatory_ruleset_version" in state
    assert "NEW.schedule_h2_applicable_from" in state
    assert "NEW.traceability_product_code" in state
    assert "active medicine requires a current active composition" in composition
    assert "composition.valid_from <= CURRENT_DATE" in composition
    assert "composition.valid_until >= CURRENT_DATE" in composition


def test_approval_guard_proves_distinct_active_organization_approver() -> None:
    approval = _by_key()[
        "automation.command_approvals:command_approval_separation_of_duties"
    ]

    assert "NEW.approver_membership_id = request_row.requested_by_membership_id" in approval
    assert "NEW.approver_membership_id = grant_subject" in approval
    assert "permission.code = 'automation.command.approve'" in approval
    assert "access_grant.scope_kind = 'organization'" in approval
    assert "access_grant.expires_at > pg_catalog.transaction_timestamp()" in approval
    assert "membership.status = 'active'" in approval
    assert "role.status = 'active'" in approval


def test_application_and_external_fact_requirements_remain_blocked() -> None:
    blocked = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))[
        "blocked_invariants"
    ]

    assert "automation.command_requests:command_execution_guard" in blocked
    assert "automation.command_requests:command_request_matches_grant" in blocked
    assert "catalog.products:products_regulatory_classification" in blocked
    assert "core.document_sequences:document_sequences_atomic_allocation" in blocked
    assert all(len(item["reason"]) >= 120 for item in blocked.values())
