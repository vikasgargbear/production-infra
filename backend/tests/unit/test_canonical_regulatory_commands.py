from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


REPO = Path(__file__).resolve().parents[3]
ROOT = REPO / "database" / "canonical" / "commands_regulatory"
GENERATOR = ROOT / "generate_regulatory_commands.py"


def _module():
    spec = importlib.util.spec_from_file_location("canonical_regulatory_commands", GENERATOR)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _sql() -> str:
    mapping = json.loads((ROOT / "baseline-regulatory-command-enforcements.json").read_text())
    return "\n".join(
        statement
        for enforcement in mapping["enforcements"]
        for statement in enforcement["statements"]
    )


def test_generated_regulatory_artifacts_are_current() -> None:
    mapping, manifest = _module().generated_artifacts()
    assert mapping == (ROOT / "baseline-regulatory-command-enforcements.json").read_text()
    assert manifest == (ROOT / "regulatory-command-manifest.json").read_text()


def test_eight_required_invariants_are_fully_mapped() -> None:
    manifest = json.loads((ROOT / "regulatory-command-manifest.json").read_text())
    assert manifest["resolved_count"] == 8
    assert set(manifest["resolved_invariants"]) == {
        "core.reference_data_releases:reference_data_release_import",
        "catalog.ingredients:ingredient_reference_release",
        "catalog.products:products_regulatory_classification",
        "tax.tax_code_versions:tax_code_versions_release_authority",
        "tax.withholding_rule_versions:withholding_rule_versions_release_authority",
        "compliance.controlled_movement_rule_versions:controlled_movement_rule_versions_release_authority",
        "tax.einvoice_rule_versions:einvoice_rule_versions_release_authority",
        "tax.gst_adjustment_rule_versions:gst_adjustment_rule_versions_release_authority",
    }
    assert manifest["blocker_delta"] == {
        "current_catalog_before_mapping": 8,
        "current_catalog_resolved": 8,
        "current_catalog_after_mapping": 0,
        "pre_correction_global_net": -1,
    }


def test_catalog_uses_typed_reviewer_retrieval_and_release_provenance() -> None:
    core = json.loads((REPO / "database/canonical/domains/core.json").read_text())
    catalog = json.loads((REPO / "database/canonical/domains/catalog.json").read_text())
    release = next(table for table in core["tables"] if table["name"] == "core.reference_data_releases")
    product = next(table for table in catalog["tables"] if table["name"] == "catalog.products")
    release_columns = {column[0] for column in release["columns"]}
    product_columns = {column[0]: column for column in product["columns"]}
    assert {
        "reviewed_by_user_id",
        "source_storage_bucket",
        "source_storage_object_path",
        "dataset_storage_bucket",
        "dataset_storage_object_path",
    } <= release_columns
    assert "reviewed_by" not in release_columns
    assert any(fk["columns"] == ["reviewed_by_user_id"] and fk["references"] == "core.users" for fk in release["foreign_keys"])
    assert "hsn_release_id" in product_columns
    assert "tax_code_version_id" not in product_columns
    for field in (
        "drug_schedule",
        "requires_prescription",
        "ndps_regulated",
        "regulatory_ruleset_version",
    ):
        assert product_columns[field][2] is True
    assert any(
        check["name"] == "products_active_regulatory_ck"
        and "num_nonnulls" in check["expression"]
        for check in product["checks"]
    )


def test_import_is_official_exact_retrievable_and_not_mcp_callable() -> None:
    sql = _sql()
    manifest = json.loads((ROOT / "regulatory-command-manifest.json").read_text())
    for fragment in (
        "SESSION_USER<>'erp_regulatory_importer'",
        "source_storage_bucket",
        "source_storage_object_path",
        "dataset_storage_bucket",
        "dataset_storage_object_path",
        "p_dataset_bytes IS DISTINCT FROM pg_catalog.convert_to(dataset_rows::text,'UTF8')",
        "source or canonical dataset SHA-256 mismatch",
        "reviewer must be an active typed user",
        "p_effective_from>CURRENT_DATE",
        "cdsco\\.gov\\.in",
        "gst\\.gov\\.in",
        "cbic-gst\\.gov\\.in",
        "gstn\\.org\\.in",
        "incometax\\.gov\\.in",
        "incometaxindia\\.gov\\.in",
    ):
        assert fragment in sql
    assert "evil.example" not in sql
    assert manifest["security"]["mcp_functions"] == []
    assert "GRANT EXECUTE ON FUNCTION" in sql
    assert "import_ingredient_release" in sql and "import_tax_release" in sql
    assert "import_withholding_release" in sql
    assert "import_controlled_movement_release" in sql
    assert "import_einvoice_rule_release" in sql
    assert "import_gst_adjustment_rule_release" in sql
    assert "dor\\.gov\\.in" in sql
    assert "TO \"erp_app\"" not in "\n".join(
        line for line in sql.splitlines() if "import_" in line and "GRANT EXECUTE" in line
    )


def test_activation_derives_independent_regulatory_dimensions_and_hsn_release() -> None:
    sql = _sql()
    for fragment in (
        "derived_schedule:=CASE max_schedule",
        "bool_or(ingredient.ndps_classification<>'NONE')",
        "min(ingredient.schedule_h2_applicable_from)",
        "effective Schedule H2 product lacks manufacturer traceability code",
        "medicine composition lacks one complete effective reviewed ingredient release",
        "hsn_release_id=tax_release.id",
        "selected HSN tax version is not active, effective or product-matched",
        "v1 activation fails closed without a reviewed non-medicine regulatory authority",
    ):
        assert fragment in sql
    assert "selected_tax_code_version_id" not in sql
    assert "tax_code_version_id=tax_version.id" not in sql


def test_release_supersession_blocks_stale_products_and_downstream_use() -> None:
    sql = _sql()
    assert sql.count("SET status='blocked'") == 2
    assert "ingredient.release_id=prior_id" in sql
    assert "tax_version.release_id=p_release_id" in sql
    assert "product HSN is absent from the active effective tax release" in sql
    assert "product ingredient classification release is no longer active" in sql
    for table in (
        "sales_order_lines_product_reference_guard",
        "sales_dispatch_lines_product_reference_guard",
        "sales_invoice_lines_product_reference_guard",
        "procurement_purchase_order_lines_product_reference_guard",
        "procurement_goods_receipt_lines_product_reference_guard",
        "procurement_supplier_invoice_lines_product_reference_guard",
    ):
        assert table in sql


def test_regulated_ledgers_are_not_misclassified_as_bootstrap_seeds() -> None:
    manifest = json.loads((ROOT / "regulatory-command-manifest.json").read_text())
    assert manifest["regulated_seed_status"] == {
        "population_mode": "regulated_import",
        "empty_baseline_tables": [
            "core.reference_data_releases",
            "catalog.ingredients",
            "tax.tax_code_versions",
            "tax.withholding_rule_versions",
            "compliance.controlled_movement_rule_versions",
            "tax.einvoice_rule_versions",
            "tax.gst_adjustment_rule_versions",
        ],
        "baseline_seed_blockers_removed": 7,
        "operational_readiness": "blocked_until_active_official_reviewed_releases_are_imported",
    }
    platform = json.loads(
        (REPO / "database/canonical/platform/platform-manifest.json").read_text()
    )["unresolved_platform_blockers"]
    assert not any(key.startswith("global_reference_seed:") for key in platform)


def test_empty_regulated_ledgers_fail_closed_at_activation_and_posting() -> None:
    sql = _sql()
    assert '"assert_reference_readiness"(effective_on date)' in sql
    assert "no active reviewed ingredient classification release is ready" in sql
    assert "no active reviewed HSN/SAC tax release is ready" in sql
    assert sql.count("_regulatory_posting_guard") >= 7
    assert "posting product lacks active reviewed regulatory reference authority" in sql
    for source_date in (
        "NEW.order_date",
        "NEW.invoice_date",
        "NEW.return_date",
        "NEW.received_at::date",
        "NEW.supplier_invoice_date",
    ):
        assert source_date in sql
    assert '"product_ready"(NEW.org_id,product_id,effective_date)' in sql


def test_mapping_removes_exactly_five_current_catalog_blockers() -> None:
    scripts = REPO / "backend" / "scripts"
    sys.path.insert(0, str(scripts))
    try:
        import generate_canonical_baseline as baseline
    finally:
        sys.path.remove(str(scripts))
    catalog = baseline.load_and_validate_catalog(REPO / "database/canonical/domains")
    before = baseline.generate_baseline(catalog, allow_draft=True)
    command_mapping = baseline._load_enforcement_mapping(
        ROOT / "baseline-regulatory-command-enforcements.json"
    )
    after = baseline.generate_baseline(
        catalog,
        enforcement_mapping=command_mapping.invariants,
        platform_mapping=command_mapping.platform,
        allow_draft=True,
    )
    removed = {item["key"] for item in before.blockers} - {item["key"] for item in after.blockers}
    assert removed == set(json.loads((ROOT / "regulatory-command-manifest.json").read_text())["resolved_invariants"])


def test_withholding_import_is_fixed_schema_non_overlapping_and_atomic() -> None:
    sql = _sql()
    for fragment in (
        "'withholding_rules'",
        "withholding dataset is not one exact non-overlapping reviewed typed set",
        "left_row.ordinality<right_row.ordinality",
        "UPDATE tax.withholding_rule_versions SET status='retired'",
        "withholding exact-set count mismatch",
        "matching transaction-local request id",
        "withholding rule identity, applicability and calculation authority are immutable",
    ):
        assert fragment in sql
    assert "INSERT INTO tax.withholding_rule_versions" in sql
    withholding_fragment = sql[sql.index('"import_withholding_release"'):]
    assert "fiscal_year_start_from" in withholding_fragment
    assert "fiscal_year_start_to" in withholding_fragment
    assert "fiscal_year_from" not in withholding_fragment
    assert "cess_rate" not in withholding_fragment


def test_plumbing_audit_allows_only_scoped_importer_system_actions() -> None:
    plumbing = (REPO / "database/canonical/plumbing/canonical_plumbing.sql").read_text()
    assert "SESSION_USER = 'erp_regulatory_importer'" in plumbing
    assert "event_request_id IS NOT NULL" in plumbing
    assert "scope.scope='reference_import'" in plumbing
    assert "WHEN regulatory_import_scope THEN 'system'" in plumbing
    assert 'GRANT "erp_migration_owner" TO "erp_regulatory_importer"' not in plumbing


def test_postgres_fixture_is_rollback_only() -> None:
    fixture = (ROOT / "test_regulatory_commands_rollback.sql").read_text()
    assert fixture.startswith("\\set ON_ERROR_STOP on\n\nBEGIN;")
    assert fixture.rstrip().endswith("ROLLBACK;")
    assert "has_function_privilege" in fixture
    assert "SESSION_USER = ''erp_regulatory_importer''" in fixture
