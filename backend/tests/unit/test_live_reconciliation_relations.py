from tests.live_canonical.reconciliation import (
    HEADER_OWNED_DETAIL_RELATIONS,
    JOURNAL_EFFECT_OPERATIONS,
    STOCK_EFFECT_OPERATIONS,
    CanonicalReconciler,
)


ORG_ID = "d3000000-0000-7000-8000-000000000001"
MATCH_ID = "d3000000-0000-7000-8000-000000000002"
STATEMENT_LINE_ID = "d3000000-0000-7000-8000-000000000003"


def test_bank_reconciliation_loads_statement_line_through_match_header() -> None:
    calls: list[tuple[str, tuple[str, str]]] = []

    def query(sql: str, params: tuple[str, str]):
        calls.append((sql, params))
        if 'FROM "finance"."reconciliation_matches"' in sql:
            assert "id = %s::uuid" in sql
            assert params == (ORG_ID, MATCH_ID)
            return [{"id": MATCH_ID, "bank_statement_line_id": STATEMENT_LINE_ID}]
        if 'FROM "finance"."bank_statement_lines"' in sql:
            assert '"id" = %s::uuid' in sql
            assert '"bank_statement_line_id"' not in sql
            assert params == (ORG_ID, STATEMENT_LINE_ID)
            return [{"id": STATEMENT_LINE_ID, "amount": "168.00"}]
        raise AssertionError(f"unexpected reconciliation query: {sql}")

    header, statement_lines = CanonicalReconciler(query, ORG_ID)._load_resource_rows(
        "finance.bank_reconciliation",
        MATCH_ID,
    )

    assert header == [{"id": MATCH_ID, "bank_statement_line_id": STATEMENT_LINE_ID}]
    assert statement_lines == [{"id": STATEMENT_LINE_ID, "amount": "168.00"}]
    assert len(calls) == 2


def test_bank_reconciliation_relation_is_explicit_and_fails_closed() -> None:
    relation = HEADER_OWNED_DETAIL_RELATIONS["finance.bank_reconciliation"]
    assert relation.header_foreign_key == "bank_statement_line_id"
    assert relation.detail_primary_key == "id"

    def query(sql: str, params: tuple[str, str]):
        if 'FROM "finance"."reconciliation_matches"' in sql:
            return [{"id": MATCH_ID}]
        raise AssertionError("detail query must not run without the reviewed header link")

    reconciler = CanonicalReconciler(query, ORG_ID)
    try:
        reconciler._load_resource_rows("finance.bank_reconciliation", MATCH_ID)
    except AssertionError as error:
        assert "omitted reviewed relation bank_statement_line_id" in str(error)
    else:
        raise AssertionError("missing bank-statement-line identity must fail closed")


def test_stock_and_journal_effect_sets_cover_posting_operations() -> None:
    assert {
        "sales.dispatch", "sales.invoice", "sales.return",
        "procurement.goods_receipt", "procurement.purchase_return",
        "inventory.transfer", "inventory.adjustment", "inventory.destruction",
    } == STOCK_EFFECT_OPERATIONS
    assert {
        "sales.dispatch", "sales.invoice", "sales.return",
        "procurement.supplier_invoice", "procurement.purchase_return",
        "finance.customer_receipt", "finance.supplier_payment",
        "finance.supplier_advance", "finance.adjustment_note",
        "finance.expense_claim", "inventory.adjustment", "inventory.destruction",
    } == JOURNAL_EFFECT_OPERATIONS
