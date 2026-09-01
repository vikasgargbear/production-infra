"""Persisted invoice editor shared by the ERP web client and MCP adapters.

The editor state is never an accounting authority.  Only ``command_payload``
is compiled through the existing operator-action contract, and the exact
workspace revision is bound inside the same transaction that persists the
canonical prepare command.
"""

from __future__ import annotations

from typing import Any, Literal, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Security
from fastapi.security import HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.security.permissions import PermissionChecker
from ...domain.operator_actions import (
    ACTION_POLICIES,
    PREPARE_PAYLOAD_MODELS,
    DraftPrepareBinding,
    OperatorActionError,
    OperatorActionService,
    get_operator_action_service,
    validate_prepare_payload_semantics,
)
from ...infrastructure.invoice_drafts import (
    abandon_invoice_draft,
    create_invoice_draft,
    get_invoice_draft,
    list_invoice_drafts,
    update_invoice_draft,
)
from .web_operator_actions import (
    PreparedResponse,
    _raise_action,
    _ready,
    _resolve_context,
)


router = APIRouter(
    prefix="/canonical/invoice-drafts",
    tags=["Invoice Drafts"],
    dependencies=[Security(HTTPBearer(auto_error=False))],
)
AUTHENTICATED_USER = Depends(PermissionChecker())
DocumentKind = Literal["sales_invoice", "supplier_invoice"]
DraftStatus = Literal["open", "prepared", "posted", "abandoned"]
CreatedVia = Literal["web", "mcp"]

OPERATION_BY_KIND = {
    "sales_invoice": "sales.invoice.prepare",
    "supplier_invoice": "procurement.supplier_invoice.prepare",
}


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class InvoiceDraftPayload(StrictModel):
    schema_version: Literal["invoice-draft.v1"]
    editor_state: dict[str, Any]
    command_payload: Optional[dict[str, Any]]


class SalesInvoiceEditorState(BaseModel):
    """Minimum UI-reopen contract; nested invoice data remains editor-owned."""

    model_config = ConfigDict(extra="allow", strict=True)
    invoice: dict[str, Any]
    selected_customer: Optional[dict[str, Any]]
    current_step: int = Field(ge=1, le=3)


class SupplierInvoiceEditorState(BaseModel):
    """Minimum UI-reopen contract for the supplier-invoice editor."""

    model_config = ConfigDict(extra="allow", strict=True)
    selected_receipt_id: str
    invoice_number: str
    invoice_date: str
    received_date: str
    rates: dict[str, str]
    allocation_methods: dict[str, str]
    charge_allocation_methods: dict[str, str]
    itc_attested: bool


def validate_editor_state(
    document_kind: DocumentKind, payload: InvoiceDraftPayload
) -> InvoiceDraftPayload:
    model = (
        SalesInvoiceEditorState
        if document_kind == "sales_invoice"
        else SupplierInvoiceEditorState
    )
    model.model_validate(payload.editor_state)
    return payload


class CreateInvoiceDraftRequest(StrictModel):
    document_kind: DocumentKind
    # UUIDs cross both the browser and MCP HTTP boundaries as JSON strings.
    # Keep the enclosing model strict while allowing Pydantic's UUID parser for
    # this one transport field.
    branch_id: UUID = Field(strict=False)
    title: Optional[str] = Field(default=None, max_length=200)
    payload: InvoiceDraftPayload
    created_via: Literal["web"]

    @model_validator(mode="after")
    def validate_reopen_contract(self) -> "CreateInvoiceDraftRequest":
        validate_editor_state(self.document_kind, self.payload)
        return self


class UpdateInvoiceDraftRequest(StrictModel):
    expected_row_version: int = Field(gt=0)
    title: Optional[str] = Field(default=None, max_length=200)
    payload: Optional[InvoiceDraftPayload] = None


class InvoiceDraftVersionRequest(StrictModel):
    expected_row_version: int = Field(gt=0)


class InvoiceDraftResponse(StrictModel):
    draft_id: UUID
    document_kind: DocumentKind
    branch_id: UUID
    title: Optional[str]
    payload: InvoiceDraftPayload
    status: DraftStatus
    prepared_command_request_id: Optional[UUID]
    posted_resource_id: Optional[UUID]
    created_via: CreatedVia
    created_at: Any
    updated_at: Any
    row_version: int
    edit_path: str


class InvoiceDraftListResponse(StrictModel):
    drafts: list[InvoiceDraftResponse]
    total: int


def _activate(db: Session, user: dict[str, Any]) -> UUID:
    org_id = UUID(str(user["org_id"]))
    db.execute(
        text(
            """
            SELECT erp_security.activate_context(:auth_user_id,:org_id),
                   pg_catalog.set_config('app.request_id',:request_id,true)
            """
        ),
        {
            "auth_user_id": UUID(str(user["auth_user_id"])),
            "org_id": org_id,
            "request_id": str(uuid4()),
        },
    )
    return org_id


def _draft_response(row: dict[str, Any]) -> InvoiceDraftResponse:
    values = dict(row)
    values["draft_id"] = values.pop("id")
    values.pop("payload_sha256", None)
    values["edit_path"] = (
        f"#/sales/invoice?draft={values['draft_id']}"
        if values["document_kind"] == "sales_invoice"
        else f"#/purchase/supplier-invoice?draft={values['draft_id']}"
    )
    return InvoiceDraftResponse(**values)


def _database_error(error: DBAPIError) -> None:
    code = str(getattr(error.orig, "pgcode", "") or "")
    message = str(getattr(error.orig, "diag", None) and error.orig.diag.message_primary or error.orig)
    status = {
        "P0002": 404,
        "42501": 403,
        "22023": 422,
        "23505": 409,
        "23514": 409,
        "40001": 409,
    }.get(code, 500)
    raise HTTPException(status_code=status, detail=message) from error


def _load(db: Session, org_id: UUID, draft_id: UUID) -> dict[str, Any]:
    row = get_invoice_draft(db, org_id=org_id, draft_id=draft_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Invoice draft not found")
    return row


@router.post("", response_model=InvoiceDraftResponse, status_code=201)
def create_draft(
    request: CreateInvoiceDraftRequest,
    user: dict[str, Any] = AUTHENTICATED_USER,
    db: Session = Depends(get_db),
) -> InvoiceDraftResponse:
    org_id = _activate(db, user)
    draft_id = uuid4()
    try:
        create_invoice_draft(
            db,
            org_id=org_id,
            draft_id=draft_id,
            document_kind=request.document_kind,
            branch_id=request.branch_id,
            title=request.title,
            payload=request.payload.model_dump(mode="json"),
            created_via=request.created_via,
        )
        db.commit()
    except DBAPIError as error:
        db.rollback()
        _database_error(error)
    _activate(db, user)
    return _draft_response(_load(db, org_id, draft_id))


@router.get("", response_model=InvoiceDraftListResponse)
def list_drafts(
    document_kind: Optional[DocumentKind] = None,
    status: Optional[DraftStatus] = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: dict[str, Any] = AUTHENTICATED_USER,
    db: Session = Depends(get_db),
) -> InvoiceDraftListResponse:
    org_id = _activate(db, user)
    rows, total = list_invoice_drafts(
        db,
        org_id=org_id,
        document_kind=document_kind,
        status=status,
        limit=limit,
        offset=offset,
    )
    return InvoiceDraftListResponse(
        drafts=[_draft_response(row) for row in rows], total=total
    )


@router.get("/{draft_id}", response_model=InvoiceDraftResponse)
def get_draft(
    draft_id: UUID,
    user: dict[str, Any] = AUTHENTICATED_USER,
    db: Session = Depends(get_db),
) -> InvoiceDraftResponse:
    org_id = _activate(db, user)
    return _draft_response(_load(db, org_id, draft_id))


@router.patch("/{draft_id}", response_model=InvoiceDraftResponse)
def update_draft(
    draft_id: UUID,
    request: UpdateInvoiceDraftRequest,
    user: dict[str, Any] = AUTHENTICATED_USER,
    db: Session = Depends(get_db),
) -> InvoiceDraftResponse:
    org_id = _activate(db, user)
    current = _load(db, org_id, draft_id)
    payload = request.payload or InvoiceDraftPayload.model_validate(current["payload"])
    validate_editor_state(str(current["document_kind"]), payload)
    try:
        update_invoice_draft(
            db,
            org_id=org_id,
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
    _activate(db, user)
    return _draft_response(_load(db, org_id, draft_id))


@router.post("/{draft_id}/abandon", response_model=InvoiceDraftResponse)
def abandon_draft(
    draft_id: UUID,
    request: InvoiceDraftVersionRequest,
    user: dict[str, Any] = AUTHENTICATED_USER,
    db: Session = Depends(get_db),
) -> InvoiceDraftResponse:
    org_id = _activate(db, user)
    try:
        abandon_invoice_draft(
            db,
            org_id=org_id,
            draft_id=draft_id,
            expected_row_version=request.expected_row_version,
        )
        db.commit()
    except DBAPIError as error:
        db.rollback()
        _database_error(error)
    _activate(db, user)
    return _draft_response(_load(db, org_id, draft_id))


@router.post("/{draft_id}/prepare", response_model=PreparedResponse)
def prepare_draft(
    draft_id: UUID,
    request: InvoiceDraftVersionRequest,
    user: dict[str, Any] = AUTHENTICATED_USER,
    db: Session = Depends(get_db),
    service: OperatorActionService = Depends(get_operator_action_service),
) -> PreparedResponse:
    org_id = _activate(db, user)
    draft = _load(db, org_id, draft_id)
    if draft["status"] != "open":
        raise HTTPException(status_code=409, detail="Invoice draft is not open")
    if int(draft["row_version"]) != request.expected_row_version:
        raise HTTPException(status_code=409, detail="Invoice draft row version changed")
    envelope = InvoiceDraftPayload.model_validate(draft["payload"])
    if envelope.command_payload is None:
        raise HTTPException(
            status_code=422,
            detail="Invoice draft command_payload is required before prepare",
        )
    operation_key = OPERATION_BY_KIND[str(draft["document_kind"])]
    policy = ACTION_POLICIES[operation_key]
    _ready(service, operation_key)
    command_payload = dict(envelope.command_payload)
    idempotency_key = f"invoice-draft:{draft_id}:v{request.expected_row_version}"
    command_payload["idempotency_key"] = idempotency_key
    try:
        payload = PREPARE_PAYLOAD_MODELS[operation_key].model_validate(command_payload)
        validate_prepare_payload_semantics(operation_key, payload)
    except OperatorActionError as error:
        _raise_action(error, operation=operation_key)
    except (ValidationError, ValueError) as error:
        details = error.errors(include_url=False) if isinstance(error, ValidationError) else None
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Invoice draft command payload is invalid",
                "errors": details or [str(error)],
            },
        ) from error
    if getattr(payload, "branch_id") != draft["branch_id"]:
        raise HTTPException(
            status_code=422,
            detail="Invoice draft branch differs from command payload branch",
        )
    context = _resolve_context(
        db, user, operation_key, branch_ids=(draft["branch_id"],)
    )
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
        _raise_action(error, operation=operation_key, context=context)
    return PreparedResponse(
        command_request_id=command.command_request_id,
        command_type=command.command_type,
        preview_hash=command.preview_hash,
        expires_at=command.expires_at,
        resolved_references=[dict(item) for item in command.resolved_references],
        source_versions=[dict(item) for item in command.source_versions],
        calculation_ruleset=[dict(item) for item in command.calculation_ruleset],
        inventory_impact=[dict(item) for item in command.inventory_impact],
        financial_impact=[dict(item) for item in command.financial_impact],
        tax_impact=[dict(item) for item in command.tax_impact],
        policy_warnings=[dict(item) for item in command.policy_warnings],
        required_approvals=[dict(item) for item in command.required_approvals],
    )


__all__ = ["router"]
