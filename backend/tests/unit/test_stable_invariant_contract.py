import hashlib
import importlib.util
import json
import sys
from pathlib import Path

from scripts import generate_canonical_baseline as baseline


REPO_ROOT = Path(__file__).resolve().parents[3]
INVARIANTS_ROOT = REPO_ROOT / "database" / "canonical" / "invariants"
GENERATOR_PATH = INVARIANTS_ROOT / "generate_stable_contract.py"
MAPPING_PATH = INVARIANTS_ROOT / "baseline-stable-enforcements.json"
MANIFEST_PATH = INVARIANTS_ROOT / "stable-invariants-manifest.json"
PG15_FIXTURE_PATH = INVARIANTS_ROOT / "test_stable_invariants.sql"


def _load_generator():
    spec = importlib.util.spec_from_file_location("canonical_stable_invariants", GENERATOR_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_stable_invariant_artifacts_are_deterministic_and_catalog_bound() -> None:
    generator = _load_generator()
    mapping_text, manifest_text = generator.generated_artifacts()
    manifest = json.loads(manifest_text)

    assert MAPPING_PATH.read_text(encoding="utf-8") == mapping_text
    assert MANIFEST_PATH.read_text(encoding="utf-8") == manifest_text
    assert manifest["mapping_sha256"] == hashlib.sha256(mapping_text.encode()).hexdigest()
    assert manifest["resolved_count"] == 14
    assert manifest["blocked_count"] == 18
    assert manifest["resolved_count"] + manifest["blocked_count"] == 32
    assert "catalog.ingredients:ingredient_reference_release" in manifest["blocked_invariants"]
    assert "core.reference_data_releases:reference_data_release_import" in manifest["blocked_invariants"]
    assert "core.data_retention_cases:data_retention_cases_command_guard" in manifest[
        "blocked_invariants"
    ]
    assert set(manifest["stable_domains"]) == {
        "core",
        "parties",
        "catalog",
        "hr",
        "automation",
    }


def test_every_stable_invariant_has_exactly_one_honest_disposition() -> None:
    generator = _load_generator()
    invariants = generator._load_invariants()
    definitions = generator._definitions()

    assert set(definitions).isdisjoint(generator.BLOCKED_REASONS)
    assert set(invariants) == set(definitions) | set(generator.BLOCKED_REASONS)
    assert all(reason.strip() for reason in generator.BLOCKED_REASONS.values())
    assert all(len(reason) >= 80 for reason in generator.BLOCKED_REASONS.values())


def test_mapping_composes_and_reduces_only_its_exact_invariant_set() -> None:
    catalog = baseline.load_and_validate_catalog(REPO_ROOT / "database" / "canonical" / "domains")
    mapping = baseline._load_enforcement_mapping(MAPPING_PATH)
    all_invariants = sum(len(table.get("cross_row_invariants", [])) for table in catalog.tables)

    result = baseline.generate_baseline(
        catalog,
        enforcement_mapping=mapping.invariants,
        allow_draft=True,
    )
    unresolved = {
        blocker["key"]
        for blocker in result.blockers
        if blocker["category"] == "cross_row_invariant"
    }

    assert len(mapping.invariants) == 14
    assert len(unresolved) == all_invariants - 14
    assert set(mapping.invariants).isdisjoint(unresolved)
    assert set(json.loads(MANIFEST_PATH.read_text())["blocked_invariants"]) <= unresolved
    assert result.deployable is False


def test_generated_sql_is_static_fail_closed_and_private() -> None:
    mapping = json.loads(MAPPING_PATH.read_text(encoding="utf-8"))
    sql = "\n".join(
        statement
        for entry in mapping["enforcements"]
        for statement in entry["statements"]
    )

    assert "IF NOT EXISTS" not in sql.upper()
    assert "SECURITY DEFINER" not in sql.upper()
    assert "SET search_path = ''" in sql
    assert "EXECUTE format" not in sql
    assert "EXECUTE IMMEDIATE" not in sql
    assert sql.count("CREATE EXTENSION \"btree_gist\"") == 1
    assert sql.count("CREATE CONSTRAINT TRIGGER") == 12
    assert sql.count("CREATE FUNCTION") == 13
    assert sql.count("REVOKE ALL ON FUNCTION") == 13
    assert 'GRANT EXECUTE ON FUNCTION "core"."claim_idempotency_key"' in sql
    assert 'GRANT EXECUTE ON FUNCTION "erp_stable_invariants"' not in sql


def test_idempotency_and_delivery_guards_cover_direct_table_mutations() -> None:
    mapping = json.loads(MAPPING_PATH.read_text(encoding="utf-8"))
    by_key = {
        f"{entry['table']}:{entry['invariant']}": "\n".join(entry["statements"])
        for entry in mapping["enforcements"]
    }
    idempotency = by_key["core.idempotency_keys:idempotency_claim_once"]
    attachments = by_key["core.attachments:attachments_evidence_immutability"]
    outbox = by_key["core.outbox_events:outbox_delivery_transition"]

    assert "ON CONFLICT (org_id, actor_membership_id, operation, idempotency_key_hash) DO NOTHING" in idempotency
    assert "FOR UPDATE" in idempotency
    assert "different request" in idempotency
    assert "IF TG_OP = 'INSERT'" in idempotency
    assert "new idempotency key must be an empty claimed row" in idempotency
    assert "new idempotency key must be an empty claimed row" not in attachments
    assert "terminal idempotency response is immutable" in idempotency
    assert '"INSERT OR UPDATE OR DELETE"' not in idempotency
    assert "AFTER INSERT OR UPDATE OR DELETE" in idempotency
    assert "outbox payload and aggregate identity are immutable" in outbox
    assert "NEW.attempt_count <> OLD.attempt_count + 1" in outbox
    assert "terminal outbox event is immutable" in outbox


def test_temporal_employee_and_mcp_guards_are_not_placeholder_sql() -> None:
    mapping = json.loads(MAPPING_PATH.read_text(encoding="utf-8"))
    by_key = {
        f"{entry['table']}:{entry['invariant']}": "\n".join(entry["statements"])
        for entry in mapping["enforcements"]
    }

    for key in (
        "parties.addresses:addresses_primary_period_no_overlap",
        "catalog.uom_conversions:uom_conversions_no_overlap",
        "catalog.product_ingredients:product_ingredients_no_overlap",
    ):
        assert "EXCLUDE USING gist" in by_key[key]
        assert "daterange(" in by_key[key]
        assert "WITH &&" in by_key[key]

    employee = by_key["hr.employees:employees_state_transition"]
    assert "pg_advisory_xact_lock" in employee
    assert "WITH RECURSIVE managers" in employee
    assert "reporting cycle" in employee

    grant = by_key["automation.agent_grants:agent_grants_state_expiry_and_revocation"]
    assert "consented agent grant scope is immutable" in grant
    assert "NEW.status = 'executing'" in grant
    assert "AND (CASE WHEN TG_OP = 'INSERT'" in grant
    assert "grant_row.expires_at <= pg_catalog.transaction_timestamp()" in grant

    approval = by_key["automation.command_approvals:command_approval_exact_preview"]
    assert "command approvals are append-only" in approval
    assert "FOR SHARE" in approval
    assert "an approved command snapshot cannot be replaced" in approval


def test_application_orchestration_requirements_remain_explicit_blockers() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    blocked = manifest["blocked_invariants"]

    assert "automation.command_requests:command_execution_guard" in blocked
    assert "automation.command_requests:command_request_matches_grant" in blocked
    assert "catalog.products:products_regulatory_classification" in blocked
    assert "core.document_sequences:document_sequences_atomic_allocation" in blocked
    assert "core.audit_events:audit_events_append_only" in blocked


def test_postgres15_fixture_is_rollback_only_and_wired_after_the_clean_baseline() -> None:
    fixture = PG15_FIXTURE_PATH.read_text(encoding="utf-8")
    gate = (
        REPO_ROOT / "database" / "canonical" / "ci" / "run_postgres15_gate.sh"
    ).read_text(encoding="utf-8")

    assert fixture.startswith("\\set ON_ERROR_STOP on")
    assert "BEGIN;" in fixture
    assert fixture.rstrip().endswith("ROLLBACK;")
    assert "core.claim_idempotency_key" in fixture
    assert "EXCEPTION WHEN exclusion_violation" in fixture
    assert "employee reporting cycle was accepted" in fixture
    assert "revoked agent grant executed a command" in fixture
    assert fixture.count("EXCEPTION WHEN object_not_in_prerequisite_state") == 2
    assert "set_config('app.request_id'" in fixture
    assert "ALTER TABLE core.organizations DISABLE TRIGGER USER" in fixture
    assert fixture.index("INSERT INTO core.organizations") < fixture.index("INSERT INTO core.users")
    assert "'organization', 'Fixture Party', 'draft'" in fixture
    assert "ALTER TABLE core.reference_data_releases DISABLE TRIGGER USER" in fixture
    assert "ALTER TABLE catalog.ingredients DISABLE TRIGGER USER" in fixture
    assert "without claiming an official import" in fixture
    assert "DISABLE TRIGGER command_requests_exact_capability_guard" in fixture
    assert "DISABLE TRIGGER command_requests_prepare_scope_guard" in fixture
    assert "DISABLE TRIGGER command_requests_execution_guard" in fixture
    assert "DISABLE TRIGGER command_approvals_reviewed_write_guard" in fixture
    assert "aggregate_version_hash" in fixture
    assert "'automation.command.approve'" in fixture
    assert fixture.count("'00000000-0000-0000-0000-000000000007', 'approved'") == 2
    assert "find database/canonical -type f -name 'test_*.sql'" in gate
    assert 'psql -X -v ON_ERROR_STOP=1 -f "$fixture"' in gate
    assert gate.index('psql -X -v ON_ERROR_STOP=1 -f "$tmpdir/canonical-baseline.sql"') < gate.index(
        "fixture_count=0"
    )
