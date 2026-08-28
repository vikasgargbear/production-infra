"""Delegated MCP adapters for canonical master creation commands."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ....core.database import get_db
from ....domain.operator_actions import ActionContext
from ...schemas.master.customer import CanonicalCustomerCreate
from ...schemas.master.supplier import CanonicalSupplierCreate
from ..canonical_erp_reads import (
    CanonicalProductDraftCreate,
    _execute_canonical_customer_create,
    _execute_canonical_product_create,
    _execute_canonical_supplier_create,
    _raise_master_create_database_error,
)
from .mcp_actions import get_action_context
from .mcp_master_contract import master_create_policy_for


router = APIRouter(
    prefix="/internal/mcp/master", tags=["Internal MCP"], include_in_schema=False
)


class MCPProductDraftCreate(CanonicalProductDraftCreate):
    idempotency_key: str = Field(
        min_length=8, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"
    )
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MCPCustomerCreate(CanonicalCustomerCreate):
    idempotency_key: str = Field(
        min_length=8, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"
    )
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MCPSupplierCreate(CanonicalSupplierCreate):
    idempotency_key: str = Field(
        min_length=8, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"
    )
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def _require_master_authority(context: ActionContext, operation_key: str) -> None:
    policy = master_create_policy_for(operation_key)
    if (
        policy is None
        or context.operation_key != operation_key
        or context.permission != policy.permission
        or not context.organization_scope
        or context.branch_ids
        or context.delegated_command_request_id is not None
    ):
        raise HTTPException(
            status_code=403,
            detail="Delegation does not authorize this organization-global master command",
        )


def _activate_master_context(db: Session, context: ActionContext) -> None:
    db.execute(
        text("""
            SELECT erp_security.activate_context(:auth_user_id,:org_id),
                   pg_catalog.set_config('app.request_id',:request_id,true)
        """),
        {
            "auth_user_id": context.auth_user_id,
            "org_id": context.organization_id,
            "request_id": str(uuid4()),
        },
    )


def _run_master_create(
    db: Session,
    context: ActionContext,
    operation_key: str,
    execute,
) -> Any:
    _require_master_authority(context, operation_key)
    _activate_master_context(db, context)
    try:
        created = execute()
        db.commit()
        return dict(created)
    except DBAPIError as exc:
        db.rollback()
        _raise_master_create_database_error(exc)


@router.post("/products")
def create_product_draft(
    request: MCPProductDraftCreate,
    context: ActionContext = Depends(get_action_context),
    db: Session = Depends(get_db),
):
    product = CanonicalProductDraftCreate.model_validate(
        request.model_dump(exclude={"idempotency_key"})
    )
    return _run_master_create(
        db,
        context,
        "catalog.product_draft.create",
        lambda: _execute_canonical_product_create(
            db, context.organization_id, product, request.idempotency_key
        ),
    )


@router.post("/customers")
def create_customer(
    request: MCPCustomerCreate,
    context: ActionContext = Depends(get_action_context),
    db: Session = Depends(get_db),
):
    customer = CanonicalCustomerCreate.model_validate(
        request.model_dump(exclude={"idempotency_key"})
    )
    return _run_master_create(
        db,
        context,
        "parties.customer.create",
        lambda: _execute_canonical_customer_create(
            db, context.organization_id, customer, request.idempotency_key
        ),
    )


@router.post("/suppliers")
def create_supplier(
    request: MCPSupplierCreate,
    context: ActionContext = Depends(get_action_context),
    db: Session = Depends(get_db),
):
    supplier = CanonicalSupplierCreate.model_validate(
        request.model_dump(exclude={"idempotency_key"})
    )
    return _run_master_create(
        db,
        context,
        "parties.supplier.create",
        lambda: _execute_canonical_supplier_create(
            db, context.organization_id, supplier, request.idempotency_key
        ),
    )
