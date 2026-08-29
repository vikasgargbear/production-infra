"""Typed authority and transport guards for MCP product activation."""

from __future__ import annotations

import hashlib
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.routes import canonical_erp_reads
from app.api.routes.internal import mcp_master_commands, mcp_master_contract
from app.domain.operator_actions import ActionContext
from app.infrastructure import canonical_write_commands


ROOT = Path(__file__).resolve().parents[3]


def _context(**changes) -> ActionContext:
    values = {
        "auth_user_id": uuid4(),
        "user_id": uuid4(),
        "organization_id": uuid4(),
        "membership_id": uuid4(),
        "agent_grant_id": uuid4(),
        "client_id": "product-activation-test",
        "operation_key": "catalog.product.activate",
        "permission": "catalog.product.manage",
        "branch_ids": (),
        "organization_scope": True,
        "delegated_command_request_id": None,
    }
    values.update(changes)
    return ActionContext(**values)


def test_activation_tool_is_consequential_actor_confirmed_and_strict() -> None:
    policy = mcp_master_contract.MASTER_WRITE_POLICIES[
        "catalog.product.activate"
    ]
    operations = (
        ROOT / "backend/mcp_runtime/aasopharma_mcp/operations.py"
    ).read_text(encoding="utf-8")

    assert policy.permission == "catalog.product.manage"
    assert policy.risk_class == "consequential_write"
    assert policy.approval_policy == "actor_confirmation"
    assert policy.branch_fields == ()
    assert '"erp_product_activate", "catalog.product.activate"' in operations
    assert "PRODUCT_ACTIVATION_SCHEMA, \"master_write\"" in operations
    assert '"required": ["product_id", "row_version", "idempotency_key"]' in operations
    assert '"additionalProperties": False' in operations

    with pytest.raises(ValidationError):
        mcp_master_commands.MCPProductActivation.model_validate({
            "product_id": str(uuid4()),
            "row_version": 1,
            "idempotency_key": "activation-test-0001",
            "activate_without_review": True,
        })


def test_activation_uses_one_shared_database_command_and_exact_key_hash(
    monkeypatch,
) -> None:
    product_id = uuid4()
    organization_id = uuid4()
    captured = {}

    def activate(_db, **parameters):
        captured.update(parameters)
        return {"product_id": product_id}

    monkeypatch.setattr(
        canonical_write_commands, "activate_configured_product", activate
    )
    activation = canonical_erp_reads.CanonicalProductActivationWrite(
        row_version=7,
        manufacturer_traceability_code="MFG-TRACE-7",
    )

    canonical_erp_reads._execute_canonical_product_activation(
        object(),
        org_id=organization_id,
        product_id=product_id,
        activation=activation,
        idempotency_key="activation-test-0002",
    )

    assert captured == {
        "org_id": organization_id,
        "product_id": product_id,
        "expected_row_version": 7,
        "manufacturer_traceability_code": "MFG-TRACE-7",
        "idempotency_key_hash": hashlib.sha256(
            b"activation-test-0002"
        ).digest(),
    }


def test_internal_activation_adapter_returns_exact_identity_and_replay(
    monkeypatch,
) -> None:
    product_id = uuid4()
    context = _context()
    captured = {}

    def run(db, action_context, operation_key, execute):
        captured.update({
            "db": db,
            "context": action_context,
            "operation_key": operation_key,
        })
        return execute()

    def activate(_db, **parameters):
        captured["activation"] = parameters
        return {
            "product_id": product_id,
            "product_code": "PROD-000007",
            "product_name": "Reviewed Product",
            "new_row_version": 8,
            "idempotency_replayed": True,
        }

    monkeypatch.setattr(mcp_master_commands, "_run_master_write", run)
    monkeypatch.setattr(
        mcp_master_commands, "_execute_canonical_product_activation", activate
    )
    database = object()
    result = mcp_master_commands.activate_product(
        mcp_master_commands.MCPProductActivation.model_validate({
            "product_id": str(product_id),
            "row_version": 7,
            "manufacturer_traceability_code": None,
            "idempotency_key": "activation-test-0003",
        }),
        context,
        database,
    )

    assert captured["operation_key"] == "catalog.product.activate"
    assert captured["context"] is context
    assert captured["activation"] == {
        "org_id": context.organization_id,
        "product_id": product_id,
        "activation": canonical_erp_reads.CanonicalProductActivationWrite(
            row_version=7,
            manufacturer_traceability_code=None,
        ),
        "idempotency_key": "activation-test-0003",
    }
    assert result == {
        "product_id": product_id,
        "product_code": "PROD-000007",
        "product_name": "Reviewed Product",
        "row_version": 8,
        "idempotency_replayed": True,
        "lifecycle_status": "active",
        "message": "Product activated and ready for purchasing and sale",
    }


@pytest.mark.parametrize(
    "context",
    (
        _context(organization_scope=False),
        _context(branch_ids=(uuid4(),)),
        _context(delegated_command_request_id=uuid4()),
        _context(operation_key="catalog.product_draft.configure"),
    ),
)
def test_activation_delegation_fails_closed_outside_exact_tenant_scope(
    context: ActionContext,
) -> None:
    with pytest.raises(HTTPException) as denied:
        mcp_master_commands._require_master_authority(
            context, "catalog.product.activate"
        )
    assert denied.value.status_code == 403


def test_activation_has_published_exact_readback_and_mounted_internal_route() -> None:
    operations = (
        ROOT / "backend/mcp_runtime/aasopharma_mcp/operations.py"
    ).read_text(encoding="utf-8")
    assert '"master.product_setup.get", "erp_product_setup_get"' in operations
    assert '"/api/internal/mcp/reads/product-setup", "catalog.product.manage", 1' in operations

    paths = {route.path for route in mcp_master_commands.router.routes}
    assert "/internal/mcp/master/products/activate" in paths
