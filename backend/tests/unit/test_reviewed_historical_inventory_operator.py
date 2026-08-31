from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
WORKFLOW = ROOT / ".github/workflows/reviewed-historical-inventory.yml"
SCRIPT = ROOT / "backend/scripts/apply_reviewed_historical_inventory.py"


def test_operator_uses_existing_canonical_authorities_and_exact_identity() -> None:
    source = SCRIPT.read_text(encoding="utf-8")

    assert 'os.environ.get("RAILWAY_GIT_COMMIT_SHA")' in source
    assert "refusing reviewed historical import against production" in source
    assert "HistoricalImportRequest.model_validate" in source
    assert "_wire_fact(" in source
    assert "erp_security.activate_context" in source
    assert "core.organization.manage" in source
    assert "import_historical_migration_facts" in source
    assert "install_historical_tax_snapshot" in source
    assert "promote_historical_product_inventory_batch" in source
    assert "historical_product_inventory_cutover_status" in source
    assert "with redirect_stdout(sys.stderr):" in source
    assert "file=receipt_stream" in source
    for forbidden in ("DELETE FROM", "TRUNCATE ", "DROP SCHEMA"):
        assert forbidden not in source


def test_workflow_keeps_private_rows_out_of_source_and_refuses_resets() -> None:
    source = WORKFLOW.read_text(encoding="utf-8")

    assert "REVIEWED_HISTORICAL_IMPORT_BATCH_B64_GZIP" in source
    assert 'test "$(git rev-parse HEAD)" = "$REVIEWED_SHA"' in source
    assert "git merge-base --is-ancestor" in source
    assert "refusing reviewed import" in source.lower()
    assert "-- python /app/scripts/apply_reviewed_historical_inventory.py" in source
    assert "/app/backend/scripts/apply_reviewed_historical_inventory.py" not in source
    assert 'raw_response="$RUNNER_TEMP/reviewed-inventory-ssh-output"' in source
    assert "awk '/^\\{.*\\}$/ { receipt=$0 }" in source
    assert "actions/upload-artifact@v4" in source
    assert "retention-days: 14" in source
    assert "${{ runner.temp }}" not in source
    for forbidden in (
        "DROP SCHEMA",
        "TRUNCATE ",
        "DELETE FROM",
        "railway reset",
        "provision-demo",
    ):
        assert forbidden not in source
