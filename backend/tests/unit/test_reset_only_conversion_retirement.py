from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def test_reset_only_readiness_has_no_legacy_conversion_lane() -> None:
    production_workflow = (
        ROOT / ".github/workflows/production-readiness.yml"
    ).read_text(encoding="utf-8")

    assert "run_conversion_preflight" not in production_workflow
    assert "compile_legacy_conversion_plan" not in production_workflow
    assert not (ROOT / ".github/workflows/canonical-conversion-preflight.yml").exists()
    assert not (ROOT / "backend/scripts/compile_legacy_conversion_plan.py").exists()
    assert not (ROOT / "backend/scripts/sql/canonical_conversion_preflight.sql").exists()


def test_retired_source_conversion_snapshots_are_not_working_authority() -> None:
    assert not (ROOT / "database/live-conversion-preflight-evidence.json").exists()
    assert not (ROOT / "database/live-source-relation-inventory.json").exists()
    assert not (
        ROOT / "docs/architecture/canonical-production-review-response.md"
    ).exists()


def test_retired_source_capture_cannot_extend_canonical_schema_authority() -> None:
    for relative_path in (
        "backend/scripts/capture_supabase_schema.py",
        "backend/scripts/sql/capture_supabase_schema.sql",
        "database/live-schema-evidence.json",
        "database/live-row-count-evidence.json",
        "docs/operations/supabase-live-schema-capture.md",
        "docs/architecture/query-schema-conflicts.json",
    ):
        assert not (ROOT / relative_path).exists()

    validator = (ROOT / "backend/app/core/utils/schema_validator.py").read_text(
        encoding="utf-8"
    )
    assert "database/canonical/domains" in validator
    assert "live-schema-evidence" not in validator


def test_active_deployment_and_auth_docs_do_not_name_retired_runtime_relations() -> None:
    render = (ROOT / "docs/deployment/render.md").read_text(encoding="utf-8")
    auth = (ROOT / "docs/architecture/authentication.md").read_text(encoding="utf-8")

    assert "jfrairkkzxwkhbtqejnz" not in render
    assert "master.org_users" not in auth
    assert "core.users" in auth
