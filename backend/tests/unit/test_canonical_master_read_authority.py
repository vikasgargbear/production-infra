import inspect

from app.api.routes import canonical_erp_reads


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
