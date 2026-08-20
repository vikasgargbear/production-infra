import hashlib
import importlib.util
import json
import sys
from pathlib import Path

import pytest

from app.domain.operator_actions.contract import ACTION_POLICIES
from scripts import generate_canonical_baseline as baseline


REPO_ROOT = Path(__file__).resolve().parents[3]
PLATFORM_ROOT = REPO_ROOT / "database" / "canonical" / "platform"
GENERATOR_PATH = PLATFORM_ROOT / "generate_platform_contract.py"


def _load_generator():
    spec = importlib.util.spec_from_file_location("canonical_platform_generator", GENERATOR_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_checked_in_platform_artifacts_are_deterministic_and_catalog_bound() -> None:
    generator = _load_generator()
    manifest_text, mapping_text, trigger_sql = generator.generated_artifacts()
    manifest = json.loads(manifest_text)

    assert (PLATFORM_ROOT / "platform-manifest.json").read_text(encoding="utf-8") == manifest_text
    assert (PLATFORM_ROOT / "baseline-platform-enforcements.json").read_text(encoding="utf-8") == mapping_text
    assert (PLATFORM_ROOT / "trigger-foundations.sql").read_text(encoding="utf-8") == trigger_sql
    assert manifest["resolved_platform_blocker_count"] == 15
    assert manifest["resolved_platform_blockers"] == {
        "global_reference_seed": 2,
        "preflight": 13,
    }
    assert manifest["unresolved_platform_blocker_count"] == 3
    assert manifest["baseline_mapping_sha256"] == hashlib.sha256(mapping_text.encode()).hexdigest()
    assert f"canonical_catalog_sha256: {manifest['catalog_sha256']}" in trigger_sql


def test_preflights_cover_exact_schema_set_and_auth_uuid_key() -> None:
    mapping = baseline._load_enforcement_mapping(
        PLATFORM_ROOT / "baseline-platform-enforcements.json"
    )
    preflight = {key: value for key, value in mapping.platform.items() if value[0] == "preflight"}

    assert len(preflight) == 13
    assert set(preflight) == {
        "preflight:auth.users",
        "preflight:schema:automation",
        "preflight:schema:calculation",
        "preflight:schema:catalog",
        "preflight:schema:compliance",
        "preflight:schema:core",
        "preflight:schema:finance",
        "preflight:schema:hr",
        "preflight:schema:inventory",
        "preflight:schema:parties",
        "preflight:schema:procurement",
        "preflight:schema:sales",
        "preflight:schema:tax",
    }
    sql = "\n".join(statement for _category, _hash, statements in preflight.values() for statement in statements)
    assert "IF NOT EXISTS" not in sql.upper()
    assert "auth.users.id must be NOT NULL uuid" in sql
    assert "index_row.indisunique" in sql
    assert "index_row.indimmediate" in sql
    assert "index_row.indpred IS NULL" in sql
    assert "auth.users must be a table or partitioned table" in sql
    assert "CREATE SCHEMA" not in sql
    assert "ALTER TABLE auth.users" not in sql


def test_bootstrap_seeds_are_exact_and_regulated_ledgers_deploy_empty() -> None:
    generator = _load_generator()
    manifest_text, mapping_text, _trigger_sql = generator.generated_artifacts()
    manifest = json.loads(manifest_text)
    catalog, _requirements, _catalog_hash = generator.load_catalog()
    permission_codes = {
        table["rls"]["write_permission"]
        for table in catalog.tables
        if table["rls"]["write_permission"] is not None
    }
    operator_permissions = {policy.permission for policy in ACTION_POLICIES.values()}

    assert generator.CANONICAL_OPERATOR_PERMISSIONS == operator_permissions
    assert {
        permission: generator.PERMISSION_RISKS[permission]
        for permission in operator_permissions
    } == {
        policy.permission: policy.risk_class for policy in ACTION_POLICIES.values()
    }
    assert set(manifest["seed_authorities"]["core.permissions"]["exact_codes"]) == (
        permission_codes | operator_permissions
    )
    assert manifest["seed_authorities"]["core.permissions"]["authority_kind"] == "application_contract"
    assert len(manifest["seed_authorities"]["core.permissions"]["dataset_sha256"]) == 64
    assert manifest["seed_authorities"]["catalog.units_of_measure"]["exact_codes"] == [
        "EA", "PK", "KG", "G", "MG", "MCG", "L", "ML", "M", "CM", "MM"
    ]
    assert len(manifest["seed_authorities"]["catalog.units_of_measure"]["dataset_sha256"]) == 64
    seed_sql = "\n".join(
        statement
        for entry in json.loads(mapping_text)["platform_enforcements"]
        if entry["category"] == "global_reference_seed"
        for statement in entry["statements"]
    )
    assert "(code, domain, action, risk_class, description)\nVALUES" in seed_sql
    assert "(code, name, symbol, dimension, decimal_places)\nVALUES" in seed_sql
    assert "(code, domain, action, risk_class, description, status)\nVALUES" not in seed_sql
    assert "(code, name, symbol, dimension, decimal_places, status)\nVALUES" not in seed_sql
    for table in (
        "core.reference_data_releases",
        "catalog.ingredients",
        "tax.tax_code_versions",
    ):
        assert manifest["seed_authorities"][table]["population_mode"] == "regulated_import"
        assert manifest["seed_authorities"][table]["baseline_rows"] == 0
    unresolved = manifest["unresolved_platform_blockers"]
    assert not any(key.startswith("global_reference_seed:") for key in unresolved)


def test_platform_and_security_fragments_compose_without_hiding_remaining_blockers() -> None:
    catalog = baseline.load_and_validate_catalog(REPO_ROOT / "database" / "canonical" / "domains")
    fragments = [
        baseline._load_enforcement_mapping(
            REPO_ROOT / "database" / "canonical" / "security" / "baseline-platform-enforcements.json"
        ),
        baseline._load_enforcement_mapping(
            PLATFORM_ROOT / "baseline-platform-enforcements.json"
        ),
    ]
    mappings = baseline._merge_reviewed_mappings(fragments)
    result = baseline.generate_baseline(
        catalog,
        enforcement_mapping=mappings.invariants,
        platform_mapping=mappings.platform,
        allow_draft=True,
    )
    counts: dict[str, int] = {}
    for blocker in result.blockers:
        counts[blocker["category"]] = counts.get(blocker["category"], 0) + 1

    invariant_count = sum(
        len(table.get("cross_row_invariants", [])) for table in catalog.tables
    )
    assert counts == {
        "cross_row_invariant": invariant_count,
        "trigger_plumbing": 3,
    }
    remaining_count = invariant_count + 3
    assert len(result.blockers) == remaining_count
    assert result.deployable is False
    with pytest.raises(
        baseline.GenerationError,
        match=rf"{remaining_count} baseline requirements",
    ):
        baseline.generate_baseline(
            catalog,
            enforcement_mapping=mappings.invariants,
            platform_mapping=mappings.platform,
        )


def test_duplicate_mapping_keys_are_rejected() -> None:
    mapping = baseline._load_enforcement_mapping(
        PLATFORM_ROOT / "baseline-platform-enforcements.json"
    )
    with pytest.raises(baseline.GenerationError, match="duplicate reviewed keys"):
        baseline._merge_reviewed_mappings([mapping, mapping])


def test_trigger_foundations_do_not_claim_complete_bindings_or_audit_authority() -> None:
    sql = (PLATFORM_ROOT / "trigger-foundations.sql").read_text(encoding="utf-8")
    manifest = json.loads((PLATFORM_ROOT / "platform-manifest.json").read_text(encoding="utf-8"))

    assert "no trigger_plumbing blocker is resolved" in sql
    assert "CREATE TRIGGER" not in sql
    assert "SECURITY DEFINER" not in sql
    assert "SECURITY INVOKER" in sql
    assert "ON CONFLICT ON CONSTRAINT outbox_events_aggregate_version_uq DO NOTHING" in sql
    assert "different payload" in sql
    assert manifest["trigger_foundations"]["installed_bindings"] == 0
    assert manifest["trigger_foundations"]["audit_helper"] is None
    assert all(
        f"trigger_plumbing:{kind}" in manifest["unresolved_platform_blockers"]
        for kind in ("immutability", "audit", "outbox")
    )


def test_postgres15_gate_is_hard_bounded_to_disposable_local_database() -> None:
    script = (REPO_ROOT / "database" / "canonical" / "ci" / "run_postgres15_gate.sh").read_text(encoding="utf-8")
    workflow = (REPO_ROOT / ".github" / "workflows" / "production-readiness.yml").read_text(encoding="utf-8")

    assert "CANONICAL_CI_ALLOW_DISPOSABLE" in script
    assert 'test "$PGDATABASE" = canonical_ci' in script
    assert "127.0.0.1|localhost" in script
    assert 'test "$server_major" = 15' in script
    assert "--draft" not in script
    assert "--enforcement-root database/canonical" in script
    assert "find database/canonical -type f -name 'test_*.sql'" in script
    assert 'psql -X -v ON_ERROR_STOP=1 -f "$fixture"' in script
    assert 'test "$fixture_count" -gt 0' in script
    assert "--enforcement-root database/canonical" in workflow
    assert "mapping_args" not in workflow
    assert "SUPABASE" not in script


def test_postgres15_gate_auto_includes_all_fixtures_and_mutations_roll_back() -> None:
    fixtures = tuple(
        sorted(
            (REPO_ROOT / "database" / "canonical").glob("**/test_*.sql")
        )
    )
    assert fixtures

    transactional_sql = []
    for fixture in fixtures:
        sql = fixture.read_text(encoding="utf-8")
        if any(token in sql for token in ("INSERT INTO ", "UPDATE ", "DELETE FROM ")):
            transactional_sql.append(fixture)
            assert "BEGIN;" in sql, f"mutating fixture is not transactional: {fixture}"
            assert sql.rstrip().endswith("ROLLBACK;"), (
                f"mutating fixture does not roll back: {fixture}"
            )
            assert "COMMIT;" not in sql

    assert transactional_sql


def test_approval_fixture_rejects_subject_and_accepts_distinct_authorized_member() -> None:
    fixture = (
        REPO_ROOT
        / "database"
        / "canonical"
        / "invariants_agent"
        / "test_invariants_agent.sql"
    ).read_text(encoding="utf-8")

    assert "same-subject separate approval was accepted" in fixture
    assert fixture.count("'10000000-0000-0000-0000-000000000021', 'approved'") == 1
    assert fixture.count("'10000000-0000-0000-0000-000000000022', 'approved'") == 1
    assert "'10000000-0000-0000-0000-000000000022',\n    '10000000-0000-0000-0000-000000000030'" in fixture


def test_medicine_composition_trigger_branches_before_table_specific_fields() -> None:
    mapping = (
        REPO_ROOT
        / "database"
        / "canonical"
        / "invariants_agent"
        / "baseline-invariants-agent-enforcements.json"
    ).read_text(encoding="utf-8")

    assert "target_product uuid := CASE WHEN TG_TABLE_NAME = 'products'" not in mapping
    assert "IF TG_TABLE_NAME = 'products' THEN" in mapping
    assert "ELSIF TG_OP = 'DELETE' THEN" in mapping
    assert "target_product := OLD.product_id" in mapping
