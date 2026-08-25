from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.routing import APIRoute

from app.api.routes.internal import mcp_actions
from app.domain.operator_actions import ActionContext, CommandState


def _context(command_id, *, organization_scope=False):
    branch_id = uuid4()
    return ActionContext(
        auth_user_id=uuid4(),
        user_id=uuid4(),
        organization_id=uuid4(),
        membership_id=uuid4(),
        agent_grant_id=uuid4(),
        client_id="reviewed-mcp-client",
        operation_key="automation.command.status.get",
        permission="automation.command.view",
        branch_ids=(branch_id,),
        organization_scope=organization_scope,
        delegated_command_request_id=command_id,
    )


class _Service:
    def __init__(self, state):
        self.state = state

    def deployment_readiness(self):
        return True

    def get_status(self, **_kwargs):
        return self.state


def _posted(payment_id):
    party_id, settlement_id, prepayment_id = uuid4(), uuid4(), uuid4()
    return {
        "payment_id": payment_id,
        "payment_number": "SA-2026-000001",
        "payment_date": "2026-08-25",
        "branch_id": uuid4(),
        "supplier_account_id": uuid4(),
        "supplier_name": "Verified Supplier",
        "party_id": party_id,
        "bank_account_id": uuid4(),
        "settlement_account_id": settlement_id,
        "supplier_prepayment_account_id": prepayment_id,
        "payment_method": "upi",
        "external_reference": "UPI-SA-2026-000001",
        "cash_disbursed_amount": Decimal("168.01"),
        "gross_advance_amount": Decimal("168.01"),
        "withheld_amount": Decimal("0.00"),
        "status": "posted",
        "accounting_event_id": uuid4(),
        "journal_entry_id": uuid4(),
        "journal_number": "JRN-2026-000001",
        "journal_debit_total": Decimal("168.01"),
        "journal_credit_total": Decimal("168.01"),
        "allocations": [
            {
                "allocation_id": uuid4(),
                "purchase_order_id": uuid4(),
                "purchase_order_number": "PO-2026-000001",
                "purchase_order_line_id": uuid4(),
                "line_number": 1,
                "product_id": uuid4(),
                "product_code": "SKU-1",
                "product_name": "Product",
                "prepayment_open_item_id": uuid4(),
                "cash_disbursed_amount": Decimal("168.01"),
                "withheld_amount": Decimal("0.00"),
                "gross_advance_amount": Decimal("168.01"),
                "prepayment_principal_amount": Decimal("168.01"),
                "withholding_id": None,
                "allocation_date": "2026-08-25",
                "status": "posted",
            }
        ],
        "journal_lines": [
            {
                "journal_line_id": uuid4(),
                "line_number": 1,
                "account_id": prepayment_id,
                "party_id": party_id,
                "debit": Decimal("168.01"),
                "credit": Decimal("0.00"),
            },
            {
                "journal_line_id": uuid4(),
                "line_number": 2,
                "account_id": settlement_id,
                "party_id": None,
                "debit": Decimal("0.00"),
                "credit": Decimal("168.01"),
            },
        ],
        "allocation_reconciled": True,
        "journal_balanced": True,
        "prepayment_reconciled": True,
        "withholding_reconciled": True,
    }


def test_mcp_supplier_advance_reuses_typed_rest_projection(monkeypatch):
    command_id, payment_id = uuid4(), uuid4()
    context = _context(command_id)
    state = CommandState(
        command_request_id=command_id,
        command_type="finance.supplier_advance.post",
        status="succeeded",
        preview_hash="sha256:" + "a" * 64,
        resource_type="payment",
        resource_id=payment_id,
    )
    calls = []

    def project(**kwargs):
        calls.append(kwargs)
        return _posted(payment_id)

    monkeypatch.setattr(mcp_actions, "posted_supplier_advance", project)
    response = mcp_actions.supplier_advance_readback(
        command_request_id=command_id,
        context=context,
        service=_Service(state),
        db=object(),
    )

    assert response.payment_id == payment_id
    assert response.gross_advance_amount == Decimal("168.01")
    assert response.journal_balanced is True
    assert calls[0]["user"] == {
        "org_id": str(context.organization_id),
        "auth_user_id": str(context.auth_user_id),
        "is_admin": False,
        "branch_ids": [str(context.branch_ids[0])],
    }


@pytest.mark.parametrize(
    ("command_type", "status", "resource_type", "resource_id"),
    [
        ("finance.supplier_payment.post", "succeeded", "payment", None),
        ("finance.supplier_advance.post", "approved", "payment", None),
        ("finance.supplier_advance.post", "succeeded", "supplier_invoice", uuid4()),
    ],
)
def test_mcp_supplier_advance_readback_fails_closed_before_projection(
    monkeypatch, command_type, status, resource_type, resource_id
):
    command_id = uuid4()
    state = CommandState(
        command_request_id=command_id,
        command_type=command_type,
        status=status,
        preview_hash="sha256:" + "a" * 64,
        resource_type=resource_type,
        resource_id=resource_id,
    )
    monkeypatch.setattr(
        mcp_actions,
        "posted_supplier_advance",
        lambda **_kwargs: pytest.fail("ineligible command reached REST readback"),
    )
    with pytest.raises(HTTPException) as error:
        mcp_actions.supplier_advance_readback(
            command_request_id=command_id,
            context=_context(command_id),
            service=_Service(state),
            db=object(),
        )
    assert error.value.status_code == 409


def test_finance_readback_routes_publish_exact_response_models():
    routes = {
        route.path: route
        for route in mcp_actions.router.routes
        if isinstance(route, APIRoute)
    }
    assert routes[
        "/internal/mcp/commands/{command_request_id}/supplier-advance-readback"
    ].response_model is mcp_actions.PostedSupplierAdvanceResponse
    assert routes[
        "/internal/mcp/commands/{command_request_id}/expense-claim-readback"
    ].response_model is mcp_actions.ExpenseClaimReadback
