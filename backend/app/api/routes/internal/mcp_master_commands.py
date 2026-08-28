"""Delegated MCP adapters for canonical master commands."""

from __future__ import annotations

import hashlib
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ....core.database import get_db
from ....core.money import money_json
from ....domain.operator_actions import ActionContext
from ...schemas.master.customer import CanonicalCustomerCreate, CanonicalCustomerUpdate
from ...schemas.master.supplier import CanonicalSupplierCreate, CanonicalSupplierUpdate
from ....infrastructure import canonical_write_commands
from ..canonical_erp_reads import (
    CanonicalProductDraftCreate,
    _execute_canonical_customer_create,
    _execute_canonical_product_create,
    _execute_canonical_supplier_create,
    _raise_master_create_database_error,
)
from .mcp_actions import get_action_context
from .mcp_master_contract import (
    CUSTOMER_UPDATE_OPERATION,
    SUPPLIER_UPDATE_OPERATION,
    master_write_policy_for,
)


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


class MCPCustomerUpdate(CanonicalCustomerUpdate):
    customer_id: UUID
    idempotency_key: str = Field(
        min_length=8, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"
    )
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MCPSupplierUpdate(CanonicalSupplierUpdate):
    supplier_id: UUID
    idempotency_key: str = Field(
        min_length=8, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"
    )
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def _require_master_authority(context: ActionContext, operation_key: str) -> None:
    policy = master_write_policy_for(operation_key)
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


def _run_master_write(
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
    return _run_master_write(
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
    return _run_master_write(
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
    return _run_master_write(
        db,
        context,
        "parties.supplier.create",
        lambda: _execute_canonical_supplier_create(
            db, context.organization_id, supplier, request.idempotency_key
        ),
    )


@router.post("/customers/update")
def update_customer(
    request: MCPCustomerUpdate,
    context: ActionContext = Depends(get_action_context),
    db: Session = Depends(get_db),
):
    update = CanonicalCustomerUpdate.model_validate(
        request.model_dump(exclude={"customer_id", "idempotency_key"}, exclude_unset=True)
    )
    fields = update.model_fields_set - {"account_row_version", "party_row_version"}

    def execute():
        changed = canonical_write_commands.update_customer_account(
            db,
            org_id=context.organization_id,
            customer_id=request.customer_id,
            expected_account_row_version=update.account_row_version,
            expected_party_row_version=update.party_row_version,
            set_customer_name="customer_name" in fields,
            customer_name=update.customer_name,
            set_customer_type="customer_type" in fields,
            customer_type=update.customer_type,
            set_primary_phone="primary_phone" in fields,
            primary_phone=update.primary_phone,
            set_primary_email="primary_email" in fields,
            primary_email=str(update.primary_email) if update.primary_email else None,
            set_contact_person_name="contact_person_name" in fields,
            contact_person_name=update.contact_person_name,
            set_pan="pan_number" in fields,
            pan=update.pan_number,
            set_credit_limit="credit_limit" in fields,
            credit_limit=update.credit_limit,
            set_credit_days="credit_days" in fields,
            credit_days=update.credit_days,
            idempotency_key_hash=hashlib.sha256(
                request.idempotency_key.encode("utf-8")
            ).digest(),
        )
        return {
            "customer_id": changed["customer_account_id"],
            "party_id": changed["party_id"],
            "customer_code": changed["customer_code"],
            "customer_name": changed["updated_customer_name"],
            "customer_type": changed["updated_customer_type"],
            "primary_phone": changed["updated_primary_phone"],
            "primary_email": changed["updated_primary_email"],
            "contact_person_name": changed["updated_contact_person_name"],
            "pan_number": changed["updated_pan"],
            "credit_limit": money_json(changed["updated_credit_limit"]),
            "credit_days": changed["updated_credit_days"],
            "account_row_version": changed["account_row_version"],
            "party_row_version": changed["party_row_version"],
            "idempotency_replayed": changed["idempotency_replayed"],
        }

    return _run_master_write(
        db, context, CUSTOMER_UPDATE_OPERATION, execute
    )


@router.post("/suppliers/update")
def update_supplier(
    request: MCPSupplierUpdate,
    context: ActionContext = Depends(get_action_context),
    db: Session = Depends(get_db),
):
    update = CanonicalSupplierUpdate.model_validate(
        request.model_dump(exclude={"supplier_id", "idempotency_key"}, exclude_unset=True)
    )
    fields = update.model_fields_set - {"account_row_version", "party_row_version"}

    def execute():
        changed = canonical_write_commands.update_supplier_account(
            db,
            org_id=context.organization_id,
            supplier_id=request.supplier_id,
            expected_account_row_version=update.account_row_version,
            expected_party_row_version=update.party_row_version,
            set_supplier_name="supplier_name" in fields,
            supplier_name=update.supplier_name,
            set_primary_phone="primary_phone" in fields,
            primary_phone=update.primary_phone,
            set_primary_email="primary_email" in fields,
            primary_email=str(update.primary_email) if update.primary_email else None,
            set_contact_person_name="contact_person" in fields,
            contact_person_name=update.contact_person,
            set_pan="pan_number" in fields,
            pan=update.pan_number,
            set_payment_days="payment_days" in fields,
            payment_days=update.payment_days,
            idempotency_key_hash=hashlib.sha256(
                request.idempotency_key.encode("utf-8")
            ).digest(),
        )
        return {
            "supplier_id": changed["supplier_account_id"],
            "party_id": changed["party_id"],
            "supplier_code": changed["supplier_code"],
            "supplier_name": changed["updated_supplier_name"],
            "primary_phone": changed["updated_primary_phone"],
            "primary_email": changed["updated_primary_email"],
            "contact_person": changed["updated_contact_person_name"],
            "pan_number": changed["updated_pan"],
            "payment_days": changed["updated_payment_days"],
            "account_row_version": changed["account_row_version"],
            "party_row_version": changed["party_row_version"],
            "idempotency_replayed": changed["idempotency_replayed"],
        }

    return _run_master_write(
        db, context, SUPPLIER_UPDATE_OPERATION, execute
    )
