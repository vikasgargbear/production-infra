import hashlib
import importlib.util
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
SECURITY_ROOT = REPO_ROOT / "database" / "canonical" / "security"
GENERATOR_PATH = SECURITY_ROOT / "generate_security_contract.py"


def _load_generator():
    spec = importlib.util.spec_from_file_location("canonical_security_generator", GENERATOR_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_checked_in_security_artifacts_are_deterministic_and_catalog_bound() -> None:
    generator = _load_generator()
    sql, manifest_text, baseline_mapping_text = generator.generated_artifacts()
    manifest = json.loads(manifest_text)
    contract, tables, _catalog_hash = generator.load_catalog()

    assert (SECURITY_ROOT / "canonical_rls.sql").read_text(encoding="utf-8") == sql
    assert (SECURITY_ROOT / "policy-manifest.json").read_text(encoding="utf-8") == manifest_text
    assert (SECURITY_ROOT / "baseline-platform-enforcements.json").read_text(encoding="utf-8") == baseline_mapping_text
    assert manifest["catalog_table_count"] == len(manifest["tables"]) == len(tables)
    assert manifest["catalog_table_count"] == contract["table_count"]
    assert len({entry["table"] for entry in manifest["tables"]}) == len(tables)
    assert f"canonical_catalog_sha256: {manifest['catalog_sha256']}" in sql
    assert len(manifest["catalog_sha256"]) == 64
    int(manifest["catalog_sha256"], 16)


def test_roles_are_non_owning_at_runtime_and_have_no_rls_bypass() -> None:
    sql = (SECURITY_ROOT / "canonical_rls.sql").read_text(encoding="utf-8")

    assert 'CREATE ROLE "erp_migration_owner" NOLOGIN' in sql
    assert '"erp_migration_owner" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT BYPASSRLS' in sql
    assert '"erp_app" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS' in sql
    assert '"erp_runtime" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS' in sql
    assert 'GRANT "erp_app" TO "erp_runtime";' in sql
    assert 'REVOKE "erp_migration_owner" FROM "erp_app", "erp_runtime";' in sql
    assert 'GRANT USAGE ON SCHEMA "extensions" TO "erp_migration_owner";' in sql
    assert 'OWNER TO "erp_runtime"' not in sql
    assert 'OWNER TO "erp_app"' not in sql
    assert "service_role" not in sql.lower()
    assert "IF NOT EXISTS" not in sql
    assert sql.count("\nBEGIN;\n") == 1
    assert sql.rstrip().endswith("COMMIT;")


def test_bootstrap_acl_changes_precede_managed_owner_transfer() -> None:
    sql = (SECURITY_ROOT / "canonical_rls.sql").read_text(encoding="utf-8")

    schema_acl = 'GRANT USAGE ON SCHEMA "core" TO "erp_app";'
    schema_owner = 'ALTER SCHEMA "core" OWNER TO "erp_migration_owner";'
    table_acl = 'GRANT SELECT, UPDATE ON TABLE "core"."organizations" TO "erp_app";'
    table_owner = (
        'ALTER TABLE "core"."organizations" OWNER TO "erp_migration_owner";'
    )
    default_privileges = (
        'ALTER DEFAULT PRIVILEGES FOR ROLE "erp_migration_owner" IN SCHEMA "core" '
        'REVOKE ALL ON TABLES FROM PUBLIC;'
    )
    assert sql.index(schema_acl) < sql.index(schema_owner)
    assert sql.index(table_acl) < sql.index(table_owner)
    assert sql.index(default_privileges) < sql.index(schema_owner)
    assert sql.index('GRANT "erp_migration_owner" TO CURRENT_USER;') < sql.index(
        'CREATE SCHEMA "erp_security" AUTHORIZATION "erp_migration_owner";'
    )
    assert sql.index('REVOKE "erp_migration_owner" FROM CURRENT_USER;') < sql.rindex(
        "COMMIT;"
    )


def test_every_table_has_reviewed_grants_and_policy_shape() -> None:
    generator = _load_generator()
    _contract, tables, _catalog_hash = generator.load_catalog()
    manifest = json.loads((SECURITY_ROOT / "policy-manifest.json").read_text(encoding="utf-8"))
    sql = (SECURITY_ROOT / "canonical_rls.sql").read_text(encoding="utf-8")
    by_class: dict[str, list[dict]] = {}
    for entry in manifest["tables"]:
        by_class.setdefault(entry["rls_class"], []).append(entry)

    expected_by_class: dict[str, int] = {}
    for table in tables:
        rls_class = table["rls"]["class"]
        expected_by_class[rls_class] = expected_by_class.get(rls_class, 0) + 1
    assert {key: len(value) for key, value in by_class.items()} == expected_by_class
    forced = sum(table["rls"]["force"] for table in tables)
    assert sum(entry["force_rls"] for entry in manifest["tables"]) == forced
    assert sql.count("CREATE POLICY ") == sum(len(entry["policies"]) for entry in manifest["tables"])
    assert sql.count(" FORCE ROW LEVEL SECURITY;") == forced
    assert sql.count(" ENABLE ROW LEVEL SECURITY;") == len(tables)
    assert sql.count(' OWNER TO "erp_migration_owner";') >= len(tables)

    for entry in manifest["tables"]:
        schema, table = entry["table"].split(".")
        qualified = f'"{schema}"."{table}"'
        if entry["rls_class"] == "global_reference_read_only":
            assert entry["runtime_grants"] == ["SELECT"]
            assert f"GRANT SELECT ON TABLE {qualified} TO \"erp_app\";" in sql
            assert f"GRANT SELECT, INSERT" not in sql.split(f"ON TABLE {qualified}")[0][-40:]
        else:
            privileges = ", ".join(entry["runtime_grants"])
            assert f"GRANT {privileges} ON TABLE {qualified} TO \"erp_app\";" in sql


def test_session_helpers_fail_closed_and_private_lookup_cannot_be_called_by_runtime() -> None:
    sql = (SECURITY_ROOT / "canonical_rls.sql").read_text(encoding="utf-8")

    assert "current_setting('app.org_id', true)" in sql
    assert "current_setting('app.membership_id', true)" in sql
    assert sql.count("EXCEPTION WHEN invalid_text_representation THEN") == 2
    assert 'SET row_security = off' in sql
    assert "EXECUTE '" not in sql
    assert "EXECUTE format" not in sql
    assert (
        'REVOKE ALL ON FUNCTION "erp_security"."is_active_membership"(uuid, uuid) '
        'FROM PUBLIC, "erp_app", "erp_runtime";'
    ) in sql
    assert (
        'GRANT EXECUTE ON FUNCTION "erp_security"."is_active_membership"(uuid, uuid) '
        'TO "erp_app";'
    ) not in sql
    assert "membership.org_id = organization_id" in sql
    assert "membership.id = membership_id" in sql
    assert "membership.status = 'active'" in sql
    assert "membership.revoked_at IS NULL" in sql
    assert (
        'CREATE FUNCTION "erp_security"."activate_context"('
        "verified_auth_user_id uuid, requested_organization_id uuid)"
    ) in sql
    assert "user_row.auth_user_id = verified_auth_user_id" in sql
    assert "membership.user_id = user_row.id" in sql
    assert "membership.org_id = requested_organization_id" in sql
    assert "INTO STRICT resolved_user_id, resolved_membership_id" in sql
    assert "pg_catalog.set_config('app.auth_user_id', verified_auth_user_id::text, true)" in sql
    assert "pg_catalog.set_config('app.user_id', resolved_user_id::text, true)" in sql
    assert "pg_catalog.set_config('app.org_id', requested_organization_id::text, true)" in sql
    assert "pg_catalog.set_config('app.membership_id', resolved_membership_id::text, true)" in sql
    assert "activate_context(organization_id uuid, membership_id uuid)" not in sql
    assert 'CREATE FUNCTION "erp_security"."current_user_id"' in sql


def test_branch_scope_is_derived_from_relational_access_grants() -> None:
    generator = _load_generator()
    _contract, tables, _catalog_hash = generator.load_catalog()
    manifest = json.loads((SECURITY_ROOT / "policy-manifest.json").read_text(encoding="utf-8"))
    sql = (SECURITY_ROOT / "canonical_rls.sql").read_text(encoding="utf-8")
    branch_scoped = {entry["table"]: entry["branch_scope_column"] for entry in manifest["tables"] if entry["branch_scope_column"]}
    expected_branch_scoped = {
        mapping["table"]: mapping["branch_scope_column"]
        for mapping in (generator._policy_mapping(table) for table in tables)
        if mapping["branch_scope_column"]
    }

    assert branch_scoped == expected_branch_scoped
    assert branch_scoped["core.branches"] == "id"
    assert branch_scoped["inventory.stock_balances"] == "branch_id"
    assert branch_scoped["finance.payments"] == "branch_id"
    assert branch_scoped["tax.registration_branches"] == "branch_id"
    assert "branch_ids" not in sql
    assert "FROM core.access_grants AS grant_row" in sql
    assert "JOIN core.role_permissions AS role_permission" in sql
    assert "grant_row.scope_kind = 'organization'" in sql
    assert "grant_row.scope_kind = 'branch' AND grant_row.branch_id = target_branch_id" in sql
    assert "target_branch_id IS NULL AND grant_row.scope_kind = 'organization'" in sql
    for entry in manifest["tables"]:
        if entry["rls_class"] == "tenant_membership":
            if entry["mutation_enforcement"] in {
                "restricted_security_definer_commands_only",
                "isolated_provider_security_definer_commands_only",
            }:
                assert entry["runtime_grants"] == ["SELECT"]
                continue
            assert entry["write_permission"]
            assert f"'{entry['write_permission']}'" in sql


def test_identity_and_global_reference_exceptions_are_explicit() -> None:
    sql = (SECURITY_ROOT / "canonical_rls.sql").read_text(encoding="utf-8")
    manifest = json.loads((SECURITY_ROOT / "policy-manifest.json").read_text(encoding="utf-8"))
    references = {entry["table"] for entry in manifest["tables"] if entry["rls_class"] == "global_reference_read_only"}

    assert references == {
        "catalog.ingredients",
        "catalog.units_of_measure",
        "compliance.controlled_movement_rule_versions",
        "core.permissions",
        "core.reference_data_releases",
        "tax.einvoice_rule_versions",
        "tax.gst_adjustment_rule_versions",
        "tax.tax_code_versions",
        "tax.withholding_rule_versions",
    }
    by_table = {entry["table"]: entry for entry in manifest["tables"]}
    regulated_references = references - {"catalog.units_of_measure", "core.permissions"}
    for table in regulated_references:
        assert by_table[table]["population_mode"] == "regulated_import"
        assert by_table[table]["mutation_enforcement"] == "regulated_import_security_definer_only"
    assert 'CREATE POLICY "erp_insert" ON "core"."organizations"' not in sql
    assert 'CREATE POLICY "erp_delete" ON "core"."organizations"' not in sql
    assert 'GRANT SELECT, UPDATE ON TABLE "core"."organizations" TO "erp_app";' in sql
    assert 'erp_security.can_view_user("id")' in sql
    assert "target_membership.user_id = target_user_id" in sql
    for name in references:
        schema, table = name.split(".")
        qualified = f'"{schema}"."{table}"'
        assert f'CREATE POLICY "erp_select" ON {qualified} FOR SELECT TO "erp_app" USING (true);' in sql
        assert f'CREATE POLICY "erp_insert" ON {qualified}' not in sql


def test_negative_sql_fixture_covers_context_spoof_branch_and_write_boundaries() -> None:
    fixture = (SECURITY_ROOT / "test_rls_negative.sql").read_text(encoding="utf-8")

    required_evidence = (
        "missing context exposed tenant rows",
        "missing membership exposed tenant rows",
        "cross-organization membership spoof exposed tenant rows",
        "malformed organization context did not fail closed",
        "legacy organization plus membership activation unexpectedly succeeded",
        "authenticated user activated another user membership",
        "disabled authenticated user activated a membership",
        "authenticated activation did not bind the exact resolved identity",
        "matching actor did not receive exactly its granted branch",
        "organization visibility is not current-organization only",
        "global user visibility crossed organization boundary",
        "branch-scoped actor updated another branch",
        "cross-organization insert unexpectedly succeeded",
    )
    assert all(message in fixture for message in required_evidence)
    assert 'SET LOCAL ROLE "erp_runtime";' in fixture
    assert "set_config('app.org_id'" in fixture
    assert "set_config('app.membership_id'" in fixture
    assert "erp_security.activate_context" in fixture
    assert "INSERT INTO auth.users" in fixture
    assert "current_setting('app.auth_user_id'" in fixture
    assert "current_setting('app.user_id'" in fixture
    assert fixture.rstrip().endswith("ROLLBACK;")
    assert "COMMIT;" not in fixture


def test_catalog_hash_changes_when_policy_relevant_catalog_data_changes() -> None:
    generator = _load_generator()
    _contract, tables, original_hash = generator.load_catalog()
    copied = json.loads(json.dumps(tables))
    copied[0]["rls"]["write_permission"] += ".changed"
    payload = {
        "contract": _contract,
        "authority_tables": json.loads(generator.AUTHORITY_PATH.read_text(encoding="utf-8"))["canonical_tables"],
        "tables": sorted(copied, key=lambda item: item["name"]),
    }
    changed_hash = hashlib.sha256(generator._canonical_json(payload).encode("utf-8")).hexdigest()

    assert changed_hash != original_hash


def test_uuid_only_catalog_requires_no_sequence_privileges() -> None:
    generator = _load_generator()
    _contract, tables, _catalog_hash = generator.load_catalog()
    manifest = json.loads((SECURITY_ROOT / "policy-manifest.json").read_text(encoding="utf-8"))
    sql = (SECURITY_ROOT / "canonical_rls.sql").read_text(encoding="utf-8").lower()
    defaults = [column[3] for table in tables for column in table["columns"] if column[3] is not None]
    types = [column[1].lower() for table in tables for column in table["columns"]]

    assert manifest["identity_sequences"]["count"] == 0
    assert manifest["identity_sequences"]["runtime_sequence_grants"] == []
    assert not any("nextval" in value.lower() for value in defaults)
    assert not ({"serial", "bigserial", "smallserial"} & set(types))
    assert " on sequence " not in sql
    assert manifest["postgres15_execution_gate"] == {
        "fixture": "test_rls_negative.sql",
        "live_database_allowed": False,
        "server_major": 15,
        "status": "required_on_disposable_clean_database",
    }


def test_unconditionally_append_only_facts_have_no_update_or_delete_surface() -> None:
    manifest = json.loads((SECURITY_ROOT / "policy-manifest.json").read_text(encoding="utf-8"))
    sql = (SECURITY_ROOT / "canonical_rls.sql").read_text(encoding="utf-8")
    insert_only = [entry for entry in manifest["tables"] if entry["mutation_enforcement"] == "database_privilege_insert_only"]

    assert {entry["table"] for entry in insert_only} == {
        "automation.command_approvals",
        "compliance.controlled_substance_entries",
        "compliance.temperature_readings",
        "core.audit_events",
        "finance.accounting_events",
        "finance.bank_statement_lines",
        "inventory.stock_ledger_entries",
        "tax.documents",
            "tax.portal_document_lines",
            "tax.withholding_basis_lines",
    }
    for entry in insert_only:
        schema, table = entry["table"].split(".")
        qualified = f'"{schema}"."{table}"'
        assert entry["runtime_grants"] == ["SELECT", "INSERT"]
        assert entry["policies"] == ["SELECT", "INSERT"]
        assert f'CREATE POLICY "erp_update" ON {qualified}' not in sql
        assert f'CREATE POLICY "erp_delete" ON {qualified}' not in sql
        assert f"GRANT SELECT, INSERT ON TABLE {qualified} TO \"erp_app\";" in sql


def test_mutation_class_command_matrix_is_least_privilege() -> None:
    generator = _load_generator()
    _contract, tables, _catalog_hash = generator.load_catalog()
    by_name = {table["name"]: table for table in tables}
    manifest = json.loads((SECURITY_ROOT / "policy-manifest.json").read_text(encoding="utf-8"))
    entries = {entry["table"]: entry for entry in manifest["tables"]}

    delete_tables = {name for name, entry in entries.items() if "DELETE" in entry["runtime_grants"]}
    assert delete_tables == {"core.role_permissions", "inventory.stock_balances"}
    assert entries["core.role_permissions"]["runtime_grants"] == ["SELECT", "INSERT", "DELETE"]
    assert entries["inventory.stock_balances"]["runtime_grants"] == ["SELECT", "INSERT", "UPDATE", "DELETE"]
    assert entries["core.organizations"]["runtime_grants"] == ["SELECT", "UPDATE"]
    assert entries["core.outbox_events"]["runtime_grants"] == ["SELECT", "INSERT", "UPDATE"]
    assert entries["core.idempotency_keys"]["runtime_grants"] == ["SELECT", "INSERT", "UPDATE"]

    for name, table in by_name.items():
        entry = entries[name]
        assert entry["policies"] == entry["runtime_grants"]
        if table["retention"]["hard_delete"] is False:
            assert "DELETE" not in entry["runtime_grants"]
        mutation_class = table["mutation_class"]
        if "append_only" in mutation_class or "immutable" in mutation_class:
            assert "DELETE" not in entry["runtime_grants"]
            if entry["mutation_enforcement"] == "database_privilege_insert_only":
                assert "UPDATE" not in entry["runtime_grants"]
        if any(token in mutation_class for token in ("state_machine", "draft_then", "append_then", "approval_then")):
            assert "DELETE" not in entry["runtime_grants"]


def test_baseline_mapping_resolves_only_the_95_security_platform_blockers() -> None:
    baseline_path = REPO_ROOT / "backend" / "scripts" / "generate_canonical_baseline.py"
    spec = importlib.util.spec_from_file_location("baseline_security_integration_test", baseline_path)
    assert spec is not None and spec.loader is not None
    baseline = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = baseline
    spec.loader.exec_module(baseline)

    catalog = baseline.load_and_validate_catalog(REPO_ROOT / "database" / "canonical" / "domains")
    mappings = baseline._load_enforcement_mapping(SECURITY_ROOT / "baseline-platform-enforcements.json")
    result = baseline.generate_baseline(
        catalog,
        platform_mapping=mappings.platform,
        allow_draft=True,
    )
    unresolved_categories = {blocker["category"] for blocker in result.blockers}
    manifest = json.loads((SECURITY_ROOT / "policy-manifest.json").read_text(encoding="utf-8"))
    mapping_bytes = (SECURITY_ROOT / "baseline-platform-enforcements.json").read_bytes()

    assert len(mappings.platform) == len(catalog.tables) + 5
    assert not ({"rls_policy", "rls_helper", "roles_grants"} & unresolved_categories)
    assert {"cross_row_invariant", "trigger_plumbing", "preflight", "global_reference_seed"} <= unresolved_categories
    assert result.deployable is False
    assert manifest["baseline_integration"]["resolved_platform_blocker_count"] == len(catalog.tables) + 5
    assert manifest["baseline_integration"]["mapping_sha256"] == hashlib.sha256(mapping_bytes).hexdigest()
    with __import__("pytest").raises(baseline.GenerationError, match="lack reviewed executable enforcement"):
        baseline.generate_baseline(catalog, platform_mapping=mappings.platform)
