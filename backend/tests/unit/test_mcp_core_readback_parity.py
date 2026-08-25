from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.routing import APIRoute

from app.api.routes.internal import mcp_actions
from app.domain.operator_actions.models import ActionContext


class _Service:
    def __init__(self, state):
        self.state = state

    def deployment_readiness(self):
        return True

    def adapter_readiness(self):
        return {"automation.command.status.get": True}

    def get_succeeded_resource(self, *, command_request_id, context):
        assert command_request_id == context.delegated_command_request_id
        return self.state


def _context(command_request_id):
    return ActionContext(
        auth_user_id=uuid4(),
        user_id=uuid4(),
        organization_id=uuid4(),
        membership_id=uuid4(),
        agent_grant_id=uuid4(),
        client_id="mcp-readback-test",
        operation_key="automation.command.status.get",
        permission="automation.command.view",
        branch_ids=(uuid4(),),
        organization_scope=False,
        delegated_command_request_id=command_request_id,
    )


CASES = (
    (
        mcp_actions.sales_dispatch_readback,
        "sales_dispatch_acceptance_readback",
        "dispatch_id",
        "sales.dispatch.prepare",
        "sales.dispatch.post",
        "dispatch",
    ),
    (
        mcp_actions.sales_return_readback,
        "canonical_sales_return_readback",
        "return_id",
        "sales.return.prepare",
        "sales.return.post",
        "sales_return",
    ),
    (
        mcp_actions.purchase_return_readback,
        "canonical_purchase_return_readback",
        "return_id",
        "procurement.purchase_return.prepare",
        "procurement.purchase_return.post",
        "purchase_return",
    ),
    (
        mcp_actions.customer_receipt_readback,
        "canonical_customer_receipt_readback",
        "payment_id",
        "finance.customer_receipt.prepare",
        "finance.payment.post",
        "payment",
    ),
    (
        mcp_actions.supplier_payment_readback,
        "posted_supplier_payment",
        "payment_id",
        "finance.supplier_payment.prepare",
        "finance.payment.post",
        "payment",
    ),
    (
        mcp_actions.inventory_transfer_readback,
        "get_transfer_readback",
        "inventory_document_id",
        "inventory.transfer.prepare",
        "inventory.document.post",
        "inventory_document",
    ),
    (
        mcp_actions.inventory_adjustment_readback,
        "load_inventory_adjustment_readback",
        "command_request_id",
        "inventory.adjustment.prepare",
        "inventory.document.post",
        "inventory_document",
    ),
)


@pytest.mark.parametrize(
    ("route", "projection_name", "resource_argument", "capability", "operation", "resource_type"),
    CASES,
)
def test_mcp_readback_binds_exact_succeeded_command_then_reuses_projection(
    monkeypatch,
    route,
    projection_name,
    resource_argument,
    capability,
    operation,
    resource_type,
):
    command_id = uuid4()
    resource_id = command_id if resource_argument == "command_request_id" else uuid4()
    context = _context(command_id)
    calls = []
    projection_payload = {
        "projection": projection_name,
        "resource_id": str(resource_id),
        "status": "posted",
        "total": "168.00",
    }
    activations = []

    def projection(**kwargs):
        calls.append(kwargs)
        return projection_payload

    monkeypatch.setattr(mcp_actions, projection_name, projection)
    monkeypatch.setattr(
        mcp_actions,
        "activate_inventory_adjustment_readback_context",
        lambda **kwargs: activations.append(
            (kwargs["db"], kwargs["context"], kwargs["command_request_id"])
        ),
    )
    result = route(
        command_request_id=command_id,
        context=context,
        service=_Service(
            {
                "command_request_id": command_id,
                "capability_code": capability,
                "command_type": operation,
                "status": "succeeded",
                "resource_type": resource_type,
                "resource_id": resource_id,
            }
        ),
        db="canonical-db",
    )

    assert result is projection_payload
    assert result["resource_id"] == str(resource_id)
    assert result["status"] == "posted"
    assert result["total"] == "168.00"
    assert calls[0][resource_argument] == resource_id
    assert calls[0]["db"] == "canonical-db"
    if projection_name != "load_inventory_adjustment_readback":
        assert activations == []
        user = calls[0].get("user") or calls[0].get("current_user")
        assert user["org_id"] == str(context.organization_id)
        assert user["auth_user_id"] == str(context.auth_user_id)
        assert user["branch_ids"] == [str(context.branch_ids[0])]
    else:
        assert activations == [("canonical-db", context, command_id)]


def test_core_readback_contracts_are_one_exact_reviewed_mapping():
    assert {
        key: (
            contract.capability_code,
            contract.command_type,
            contract.resource_type,
        )
        for key, contract in mcp_actions.CORE_READBACK_CONTRACTS.items()
    } == {
        "sales_dispatch": (
            "sales.dispatch.prepare",
            "sales.dispatch.post",
            "dispatch",
        ),
        "sales_return": (
            "sales.return.prepare",
            "sales.return.post",
            "sales_return",
        ),
        "purchase_return": (
            "procurement.purchase_return.prepare",
            "procurement.purchase_return.post",
            "purchase_return",
        ),
        "customer_receipt": (
            "finance.customer_receipt.prepare",
            "finance.payment.post",
            "payment",
        ),
        "supplier_payment": (
            "finance.supplier_payment.prepare",
            "finance.payment.post",
            "payment",
        ),
        "inventory_transfer": (
            "inventory.transfer.prepare",
            "inventory.document.post",
            "inventory_document",
        ),
        "inventory_adjustment": (
            "inventory.adjustment.prepare",
            "inventory.document.post",
            "inventory_document",
        ),
    }


def test_receipt_readback_rejects_supplier_payment_capability_before_projection(
    monkeypatch,
):
    command_id = uuid4()
    monkeypatch.setattr(
        mcp_actions,
        "canonical_customer_receipt_readback",
        lambda **_kwargs: pytest.fail("mismatched capability reached projection"),
    )
    with pytest.raises(HTTPException) as error:
        mcp_actions.customer_receipt_readback(
            command_request_id=command_id,
            context=_context(command_id),
            service=_Service(
                {
                    "command_request_id": command_id,
                    "capability_code": "finance.supplier_payment.prepare",
                    "command_type": "finance.payment.post",
                    "status": "succeeded",
                    "resource_type": "payment",
                    "resource_id": uuid4(),
                }
            ),
            db=object(),
        )
    assert error.value.status_code == 409
    assert error.value.detail["metadata"]["expected_capability_code"] == (
        "finance.customer_receipt.prepare"
    )


def test_internal_routes_publish_the_existing_canonical_response_models():
    routes = {
        route.path: route
        for route in mcp_actions.router.routes
        if isinstance(route, APIRoute)
    }
    expected = {
        "sales-dispatch": mcp_actions.CanonicalSalesDispatchReadback,
        "sales-return": mcp_actions.PostedReturnReadback,
        "purchase-return": mcp_actions.PostedReturnReadback,
        "customer-receipt": mcp_actions.CanonicalCustomerReceiptReadback,
        "supplier-payment": mcp_actions.PostedSupplierPaymentResponse,
        "inventory-transfer": mcp_actions.TransferReadbackResponse,
        "inventory-adjustment": mcp_actions.InventoryAdjustmentReadback,
    }
    for suffix, model in expected.items():
        path = f"/internal/mcp/commands/{{command_request_id}}/{suffix}-readback"
        assert routes[path].response_model is model
