import inspect
from pathlib import Path

from app.api.routes import canonical_erp_reads
from app.api.routes.internal import mcp_canonical_reads


def test_product_batch_validity_uses_organization_business_date() -> None:
    source = inspect.getsource(canonical_erp_reads.product_batches)
    assert "transaction_timestamp() AT TIME ZONE organization.timezone" in source
    assert "business_clock.business_date" in source
    assert "::integer AS days_to_expiry" in source
    assert "CURRENT_DATE" not in source


def test_master_lists_have_no_first_organization_or_default_record_fallback() -> None:
    for handler in (
        canonical_erp_reads.products,
        canonical_erp_reads.customers,
        canonical_erp_reads.suppliers,
        canonical_erp_reads.employees,
        canonical_erp_reads.branches,
        canonical_erp_reads.canonical_bank_accounts,
    ):
        source = inspect.getsource(handler)
        assert "master.organizations" not in source
        assert "FROM core.organizations ORDER BY" not in source
        assert "FROM core.organizations\n         ORDER BY" not in source
        assert "first()" not in source
        assert "scalar_one_or_none" not in source


def test_product_search_serializes_exact_decimals_as_strings() -> None:
    source = inspect.getsource(canonical_erp_reads.products)
    assert "END)::text AS gst_percent" in source
    assert "COALESCE(stock.current_stock, 0)::text AS current_stock" in source


def test_mcp_transaction_and_master_product_searches_have_distinct_lifecycle_scope() -> None:
    query = inspect.getsource(mcp_canonical_reads._canonical_product_rows)
    transaction = inspect.getsource(mcp_canonical_reads.canonical_product_search)
    master = inspect.getsource(mcp_canonical_reads.canonical_product_master_search)

    assert "product.status IN ('active','blocked')" in query
    assert "(:include_drafts AND product.status='draft')" in query
    assert "product.status AS lifecycle_status" in query
    assert "product.row_version" in query
    assert "include_drafts=False" in transaction
    assert '"master.products.search"' in transaction
    assert "include_drafts=True" in master
    assert '"master.product_catalog.search"' in master


def test_product_master_search_has_a_runtime_role_and_rls_gate() -> None:
    root = Path(__file__).parents[3]
    gate = (root / "database/canonical/ci/run_alembic_postgres15_gate.sh").read_text()
    fixture = (
        root / "backend/tests/postgres/check_product_master_mcp_read_runtime_role.py"
    ).read_text()

    assert "check_product_master_mcp_read_runtime_role.py" in gate
    assert 'SET SESSION AUTHORIZATION "erp_runtime"' in fixture
    assert "master.product_catalog.search" in fixture
    assert "master.products.search" in fixture
    assert "PRODUCT_B not in" in fixture


def test_product_batch_reads_serialize_exact_decimals_as_strings() -> None:
    aggregate_source = inspect.getsource(canonical_erp_reads.products_with_batches)
    detail_source = inspect.getsource(canonical_erp_reads.product_batches)
    for exact_projection in (
        "batch.mrp::text",
        "stock.average_unit_cost::text",
        "COALESCE(stock.quantity_available, 0)::text",
        "COALESCE(batch_data.total_quantity_available, 0)::text",
        "END)::text AS gst_percent",
    ):
        assert exact_projection in aggregate_source
    for exact_projection in (
        "batch.mrp::text AS mrp_per_unit",
        "batch.mrp::text AS sale_price_per_unit",
        "balance.average_unit_cost::text AS cost_per_unit",
        "balance.on_hand_quantity::text AS quantity_available",
        "END)::text AS gst_percent",
    ):
        assert exact_projection in detail_source


def test_bank_projection_never_exposes_or_guesses_secret_or_balance_facts() -> None:
    source = inspect.getsource(canonical_erp_reads.canonical_bank_accounts)
    for forbidden in (
        "account_number_ciphertext",
        "account_number_hash",
        "is_default_account",
        "COALESCE",
    ):
        assert forbidden not in source
