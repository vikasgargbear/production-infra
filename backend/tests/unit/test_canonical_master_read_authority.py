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


def test_bank_projection_never_exposes_or_guesses_secret_or_balance_facts() -> None:
    source = inspect.getsource(canonical_erp_reads.canonical_bank_accounts)
    for forbidden in (
        "account_number_ciphertext",
        "account_number_hash",
        "is_default_account",
        "COALESCE",
    ):
        assert forbidden not in source
