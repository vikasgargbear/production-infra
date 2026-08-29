"""Delegated MCP adapter for the shared canonical invoice-draft workspace."""

from __future__ import annotations

from typing import Any, Literal, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ....core.database import get_db
from ....domain.operator_actions import (
    ACTION_POLICIES,
    PREPARE_PAYLOAD_MODELS,
    ActionContext,
    DraftPrepareBinding,
    OperatorActionError,
    OperatorActionService,
    get_operator_action_service,
    validate_prepare_payload_semantics,
)
from ....infrastructure.invoice_drafts import (
    abandon_invoice_draft,
    create_invoice_draft,
    get_invoice_draft,
    list_invoice_drafts,
    update_invoice_draft,
)
from ..canonical_invoice_drafts import (
    CreateInvoiceDraftRequest,
    DocumentKind,
    DraftStatus,
    InvoiceDraftListResponse,
    InvoiceDraftPayload,
    InvoiceDraftResponse,
    InvoiceDraftVersionRequest,
    OPERATION_BY_KIND,
    UpdateInvoiceDraftRequest,
    _database_error,
    _draft_response,
    validate_editor_state,
)
from .mcp_actions import (
    PreparedCommandResponse,
    _prepared_response,
    _require_adapter,
    _require_release_gate,
    get_action_context,
)


router = APIRouter(
    prefix="/internal/mcp/invoice-drafts",
    tags=["Internal MCP"],
    include_in_schema=False,
)


class MCPCreateInvoiceDraftRequest(CreateInvoiceDraftRequest):
    created_via: Literal["mcp"]


def _activate(db: Session, context: ActionContext) -> None:
    db.execute(
        text(
            """
            SELECT erp_security.activate_context(:auth_user_id,:org_id),
                   pg_catalog.set_config('app.request_id',:request_id,true)
            """
        ),
        {
            "auth_user_id": context.auth_user_id,
            "org_id": context.organization_id,
            "request_id": str(uuid4()),
        },
    )


def _require_kind(context: ActionContext, document_kind: str, branch_id: UUID) -> str:
    operation_key = OPERATION_BY_KIND[document_kind]
    policy = ACTION_POLICIES[operation_key]
    if (
        context.operation_key != operation_key
        or context.permission != policy.permission
        or context.delegated_command_request_id is not None
        or (
            not context.organization_scope
            and branch_id not in context.branch_ids
        )
    ):
        raise HTTPException(
            status_code=403,
            detail="Delegation does not authorize this invoice draft",
        )
    return operation_key


def _load(db: Session, context: ActionContext, draft_id: UUID) -> dict[str, Any]:
    row = get_invoice_draft(
        db, org_id=context.organization_id, draft_id=draft_id
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Invoice draft not found")
    _require_kind(context, str(row["document_kind"]), row["branch_id"])
    return row


@router.post("", response_model=InvoiceDraftResponse, status_code=201)
def create_draft(
    request: MCPCreateInvoiceDraftRequest,
    context: ActionContext = Depends(get_action_context),
    db: Session = Depends(get_db),
) -> InvoiceDraftResponse:
    _require_kind(context, request.document_kind, request.branch_id)
    _activate(db, context)
    draft_id = uuid4()
    try:
        create_invoice_draft(
            db,
            org_id=context.organization_id,
            draft_id=draft_id,
            document_kind=request.document_kind,
            branch_id=request.branch_id,
            title=request.title,
            payload=request.payload.model_dump(mode="json"),
            created_via="mcp",
        )
        db.commit()
    except DBAPIError as error:
        db.rollback()
        _database_error(error)
    _activate(db, context)
    return _draft_response(_load(db, context, draft_id))


@router.get("", response_model=InvoiceDraftListResponse)
def list_drafts(
    document_kind: DocumentKind,
    branch_id: UUID,
    status: Optional[DraftStatus] = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    context: ActionContext = Depends(get_action_context),
    db: Session = Depends(get_db),
) -> InvoiceDraftListResponse:
    _require_kind(context, document_kind, branch_id)
    _activate(db, context)
    rows, total = list_invoice_drafts(
        db,
        org_id=context.organization_id,
        document_kind=document_kind,
        status=status,
        limit=limit,
        offset=offset,
        branch_ids=(branch_id,),
    )
    return InvoiceDraftListResponse(
        drafts=[_draft_response(row) for row in rows], total=total
    )


@router.get("/{draft_id}", response_model=InvoiceDraftResponse)
def get_draft(
    draft_id: UUID,
    context: ActionContext = Depends(get_action_context),
    db: Session = Depends(get_db),
) -> InvoiceDraftResponse:
    _activate(db, context)
    return _draft_response(_load(db, context, draft_id))


@router.patch("/{draft_id}", response_model=InvoiceDraftResponse)
def update_draft(
    draft_id: UUID,
    request: UpdateInvoiceDraftRequest,
    context: ActionContext = Depends(get_action_context),
    db: Session = Depends(get_db),
) -> InvoiceDraftResponse:
    _activate(db, context)
    current = _load(db, context, draft_id)
    payload = request.payload or InvoiceDraftPayload.model_validate(current["payload"])
    validate_editor_state(str(current["document_kind"]), payload)
    try:
        update_invoice_draft(
            db,
            org_id=context.organization_id,
            draft_id=draft_id,
            expected_row_version=request.expected_row_version,
            set_title="title" in request.model_fields_set,
            title=request.title,
            payload=payload.model_dump(mode="json"),
        )
        db.commit()
    except DBAPIError as error:
        db.rollback()
        _database_error(error)
    _activate(db, context)
    return _draft_response(_load(db, context, draft_id))


@router.post("/{draft_id}/abandon", response_model=InvoiceDraftResponse)
def abandon_draft(
    draft_id: UUID,
    request: InvoiceDraftVersionRequest,
    context: ActionContext = Depends(get_action_context),
    db: Session = Depends(get_db),
) -> InvoiceDraftResponse:
    _activate(db, context)
    _load(db, context, draft_id)
    try:
        abandon_invoice_draft(
            db,
            org_id=context.organization_id,
            draft_id=draft_id,
            expected_row_version=request.expected_row_version,
        )
        db.commit()
    except DBAPIError as error:
        db.rollback()
        _database_error(error)
    _activate(db, context)
    return _draft_response(_load(db, context, draft_id))


@router.post("/{draft_id}/prepare", response_model=PreparedCommandResponse)
def prepare_draft(
    draft_id: UUID,
    request: InvoiceDraftVersionRequest,
    context: ActionContext = Depends(get_action_context),
    db: Session = Depends(get_db),
    service: OperatorActionService = Depends(get_operator_action_service),
) -> PreparedCommandResponse:
    _activate(db, context)
    draft = _load(db, context, draft_id)
    if draft["status"] != "open" or int(draft["row_version"]) != request.expected_row_version:
        raise HTTPException(status_code=409, detail="Invoice draft row version changed")
    envelope = InvoiceDraftPayload.model_validate(draft["payload"])
    if envelope.command_payload is None:
        raise HTTPException(status_code=422, detail="Invoice draft command_payload is required")
    operation_key = _require_kind(
        context, str(draft["document_kind"]), draft["branch_id"]
    )
    policy = ACTION_POLICIES[operation_key]
    _require_release_gate(service)
    _require_adapter(service, operation_key)
    command_payload = dict(envelope.command_payload)
    idempotency_key = f"invoice-draft:{draft_id}:v{request.expected_row_version}"
    command_payload["idempotency_key"] = idempotency_key
    try:
        payload = PREPARE_PAYLOAD_MODELS[operation_key].model_validate(command_payload)
        validate_prepare_payload_semantics(operation_key, payload)
    except OperatorActionError as error:
        raise HTTPException(status_code=409, detail=error.message) from error
    except (ValidationError, ValueError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    if getattr(payload, "branch_id") != draft["branch_id"]:
        raise HTTPException(status_code=422, detail="Invoice draft branch differs from payload")
    values = payload.model_dump(mode="python", exclude_none=True)
    values.pop("idempotency_key", None)
    try:
        command = service.prepare(
            policy=policy,
            payload=values,
            idempotency_key=idempotency_key,
            context=context,
            draft_binding=DraftPrepareBinding(
                draft_id=draft_id,
                expected_row_version=request.expected_row_version,
                payload_sha256=str(draft["payload_sha256"]),
            ),
        )
    except OperatorActionError as error:
        raise HTTPException(status_code=409, detail=error.message) from error
    return _prepared_response(command, policy)


__all__ = ["router"]
