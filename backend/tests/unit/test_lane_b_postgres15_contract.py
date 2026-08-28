from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
FIXTURE = ROOT / "backend/tests/postgres/check_lane_b_payment_command_contract.py"


def test_lane_b_postgres15_contract_covers_named_authorities_and_write_fences() -> None:
    source = FIXTURE.read_text(encoding="utf-8")

    assert "150000 <= version < 160000" in source
    assert '("INSERT", "UPDATE", "DELETE")' in source
    assert "post_customer_cheque_clearance" in source
    assert "post_customer_cheque_bounce" in source
    assert "post_supplier_payment" in source
    assert "apply_supplier_advance" in source
    assert "apply_supplier_adjustment_credit" in source
    assert "mark_journal_reversed" in source
    assert "synchronize_open_item_status" in source
    assert "session.rollback()" in source
