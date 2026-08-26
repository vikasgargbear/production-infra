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
