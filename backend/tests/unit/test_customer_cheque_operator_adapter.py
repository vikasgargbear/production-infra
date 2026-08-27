from __future__ import annotations

from backend.app.infrastructure.operator_actions import customer_cheque, registry


def test_cheque_actions_have_typed_prepare_and_execute_bindings() -> None:
    clearance = registry.ACTION_ADAPTER_BINDINGS[
        "finance.customer_cheque_clearance.prepare"
    ]
    bounce = registry.ACTION_ADAPTER_BINDINGS[
        "finance.customer_cheque_bounce.prepare"
    ]

    assert clearance.available is True
    assert clearance.prepare_function == (
        "erp_automation_commands.persist_customer_cheque_clearance_prepare"
    )
    assert clearance.execute_function == (
        "erp_finance_commands.post_customer_cheque_clearance"
    )
    assert bounce.available is True
    assert bounce.prepare_function == (
        "erp_automation_commands.persist_customer_cheque_bounce_prepare"
    )
    assert bounce.execute_function == "erp_finance_commands.post_customer_cheque_bounce"


def test_cheque_adapter_calls_exact_named_prepare_authorities() -> None:
    clearance_resolve = str(customer_cheque.RESOLVE_CUSTOMER_CHEQUE_CLEARANCE_SQL)
    clearance_persist = str(customer_cheque.PERSIST_CUSTOMER_CHEQUE_CLEARANCE_SQL)
    bounce_resolve = str(customer_cheque.RESOLVE_CUSTOMER_CHEQUE_BOUNCE_SQL)
    bounce_persist = str(customer_cheque.PERSIST_CUSTOMER_CHEQUE_BOUNCE_SQL)

    assert "resolve_customer_cheque_clearance_prepare" in clearance_resolve
    assert "persist_customer_cheque_clearance_prepare" in clearance_persist
    assert "resolve_customer_cheque_bounce_prepare" in bounce_resolve
    assert "persist_customer_cheque_bounce_prepare" in bounce_persist
    assert "INSERT INTO" not in "\n".join(
        (clearance_resolve, clearance_persist, bounce_resolve, bounce_persist)
    )
