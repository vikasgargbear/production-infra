import inspect
from uuid import uuid4

from app.api.routes import canonical_erp_reads
from app.api.routes.internal import (
    mcp_canonical_reads,
    mcp_canonical_resolution_reads,
)


class _CountResult:
    def __init__(self, value: int):
        self.value = value

    def scalar_one(self) -> int:
        return self.value


class _CountDatabase:
    def __init__(self, counts: list[int]):
        self.counts = list(counts)
        self.calls: list[tuple[str, dict]] = []

    def execute(self, statement, parameters=None):
        self.calls.append((str(statement), parameters or {}))
        return _CountResult(self.counts.pop(0))


def test_shared_search_parameters_bound_fallback_and_phone_suffix() -> None:
    typo = canonical_erp_reads._master_search_parameters("  Paracetmol  ")
    assert typo["search"] == "paracetmol"
    assert typo["prefix"] == "paracetmol%"
    assert typo["allow_contains"] is True
    assert typo["allow_fuzzy"] is True
    assert "paracet_mol%" in typo["fuzzy_patterns"]
    assert len(typo["fuzzy_patterns"]) <= 32

    phone = canonical_erp_reads._master_search_parameters("+91 9876")
    assert phone["allow_phone_suffix"] is True
    assert phone["phone_digits"] == "919876"

    short = canonical_erp_reads._master_search_parameters("pa")
    assert short["allow_contains"] is False
    assert short["allow_fuzzy"] is False
    assert short["allow_phone_suffix"] is False


def test_product_search_uses_fallback_only_after_primary_count_misses(
    monkeypatch,
) -> None:
    org_id = uuid4()
    captured_rows: list[tuple[str, dict]] = []
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda *_args: org_id)
    monkeypatch.setattr(
        canonical_erp_reads,
        "_rows",
        lambda _db, sql, parameters: captured_rows.append((sql, parameters)) or [],
    )

    primary_db = _CountDatabase([1])
    canonical_erp_reads.products(search="para", user={}, db=primary_db)
    assert len(primary_db.calls) == 1
    assert "fallback_ingredient" not in primary_db.calls[0][0]
    assert "fallback_manufacturer" not in primary_db.calls[0][0]
    assert "fallback_ingredient" not in captured_rows[-1][0]

    fallback_db = _CountDatabase([0, 1])
    canonical_erp_reads.products(search="paracetmol", user={}, db=fallback_db)
    assert len(fallback_db.calls) == 2
    assert "fallback_ingredient.normalized_name" in fallback_db.calls[1][0]
    assert "fallback_manufacturer.legal_name" in fallback_db.calls[1][0]
    assert "LIKE ANY(CAST(:fuzzy_patterns AS text[]))" in captured_rows[-1][0]


def test_rest_party_searches_project_addresses_and_limit_before_balances() -> None:
    customer = inspect.getsource(canonical_erp_reads.customers)
    supplier = inspect.getsource(canonical_erp_reads.suppliers)

    for source in (customer, supplier):
        assert "WITH ranked AS MATERIALIZED" in source
        assert source.index("LIMIT :limit OFFSET :skip") < source.index(
            "FROM finance.open_items item"
        )
        for field in (
            "address.line1 AS address_line1",
            "address.line2 AS address_line2",
            "address.city",
            "address.state_code",
            "address.postal_code AS pincode",
        ):
            assert field in source

    assert "contact.name AS contact_person_name" in customer
    assert "contact.name AS contact_person" in supplier


def test_rest_search_responses_preserve_disambiguation_projections(monkeypatch) -> None:
    org_id = uuid4()
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda *_args: org_id)

    product_row = {
        "product_id": uuid4(),
        "product_name": "Paracetamol 500",
        "manufacturer_name": "Aaso Labs",
        "category_name": "Analgesic",
        "packing_summary": "STRIP × 10 EA",
    }
    monkeypatch.setattr(
        canonical_erp_reads, "_rows", lambda *_args, **_kwargs: [product_row]
    )
    product = canonical_erp_reads.products(
        20, 0, None, "para", False, {}, _CountDatabase([1])
    )["products"][0]
    assert product["manufacturer_name"] == "Aaso Labs"
    assert product["category_name"] == "Analgesic"
    assert product["packing_summary"] == "STRIP × 10 EA"

    customer_row = {
        "customer_id": uuid4(),
        "customer_name": "City Pharmacy",
        "address_line1": "Market Road",
        "address_line2": None,
        "city": "Pune",
        "state_code": "27",
        "pincode": "411001",
        "credit_limit": 0,
        "current_outstanding": 0,
    }
    monkeypatch.setattr(
        canonical_erp_reads, "_rows", lambda *_args, **_kwargs: [customer_row]
    )
    customer = canonical_erp_reads.customers(
        20, 0, "city", {}, _CountDatabase([1])
    )["customers"][0]
    assert customer["city"] == "Pune"
    assert customer["state_code"] == "27"
    assert customer["address_line1"] == "Market Road"


def test_name_first_order_and_rest_mcp_fallback_contract_stay_aligned() -> None:
    handlers = (
        canonical_erp_reads.products,
        canonical_erp_reads.customers,
        canonical_erp_reads.suppliers,
        mcp_canonical_reads._canonical_product_rows,
        mcp_canonical_reads.canonical_supplier_search,
        mcp_canonical_resolution_reads.canonical_customer_search,
    )
    for handler in handlers:
        source = inspect.getsource(handler)
        assert "_master_search_parameters" in source
        assert "LIKE ANY(CAST(:fuzzy_patterns AS text[]))" in source
        assert any(
            primary_call in source
            for primary_call in (
                "load_rows(False)",
                "count_products(False)",
                "count_customers(False)",
            )
        )

    product_rest = inspect.getsource(canonical_erp_reads.products)
    product_mcp = inspect.getsource(mcp_canonical_reads._canonical_product_rows)
    assert product_rest.index("lower(p.name)=:search") < product_rest.index(
        "lower(p.sku)=:search"
    )
    assert product_mcp.index(
        "lower(product.name)=:search"
    ) < product_mcp.index("lower(product.sku)=:search")
    assert "packing_summary" in product_rest
    assert "packing_summary" in product_mcp
