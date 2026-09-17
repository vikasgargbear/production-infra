"""Bounded replay preserves immutable evidence and avoids stock reposting."""
from scripts.generate_historical_product_tax_replay_migration import OUTPUT, SOURCE, render


def test_generated_repair_matches_forward_revision():
    assert OUTPUT.read_text() == render()


def test_repair_is_scoped_bound_and_idempotent():
    sql = SOURCE.read_text()
    for predicate in (
        "fact.org_id=organization_id", "fact.dataset_id=reviewed_dataset_id",
        "binding.source_fact_id=fact.id", "product.setup_review_required",
        "binding.gst_rate=(product_fact.payload->>'gst_rate')::numeric",
        "product.hsn_code=binding.hsn_code", "NOT EXISTS",
        "version.org_id=organization_id AND version.product_id=product.id",
        "LIMIT batch_size", "replayed:=replayed+1",
    ):
        assert predicate in sql
    assert "install_source_product_tax(" in sql
    assert "INSERT INTO" not in sql and "UPDATE " not in sql and "DELETE " not in sql


def test_progress_and_batch_budget_include_repair():
    sql = render()
    assert "LIMIT (batch_size-replayed)" in sql
    assert "SELECT products_remaining+count(*) INTO products_remaining" in sql
    assert "'complete',products_remaining=0" in sql
    assert "assert_context(" in sql and "'core.organization.manage'" in sql
