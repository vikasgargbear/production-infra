from __future__ import annotations

import ast
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
PROVISIONER = REPOSITORY_ROOT / "backend/scripts/provision_canonical_demo.py"
COMPILER = REPOSITORY_ROOT / "backend/scripts/compile_live18_browser_fixture.py"


def _ids() -> dict[str, str]:
    module = ast.parse(PROVISIONER.read_text(encoding="utf-8"))
    assignment = next(
        node
        for node in module.body
        if isinstance(node, ast.Assign)
        and any(isinstance(target, ast.Name) and target.id == "IDS" for target in node.targets)
    )
    return ast.literal_eval(assignment.value)


def test_lane_b_demo_accounts_use_reserved_exact_identities() -> None:
    identities = _ids()

    assert identities["cash_on_hand_account"].endswith("0018")
    assert identities["cheques_in_hand_account"].endswith("0019")
    assert identities["customer_advance_account"].endswith("0020")


def test_browser_compiler_resolves_receipt_accounts_from_postgresql_roles() -> None:
    source = COMPILER.read_text(encoding="utf-8")

    for role in ("cash_on_hand", "cheques_in_hand", "customer_advance"):
        assert f"key='{role}'" in source
    assert "cash_account.id::text" in source
    assert "cheque_account.id::text" in source
    assert "customer_advance_account.id::text" in source
    assert "ORDER BY cash_account" not in source
    assert "LIMIT 1" not in source[source.index("JOIN core.settings cash_role") : source.index("WHERE branch.org_id")]


def test_demo_cash_limits_are_canonical_branch_settings() -> None:
    source = PROVISIONER.read_text(encoding="utf-8")

    assert "finance.cash_receipt_rules" in source
    assert '"max_single_amount"' in source
    assert '"max_customer_rolling_amount"' in source
    assert '"rolling_window_days"' in source
