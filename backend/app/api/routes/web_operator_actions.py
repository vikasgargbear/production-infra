"""First-party ERP web transport for canonical operator commands.

The browser and MCP transports intentionally authenticate differently, but
both terminate at the same ``OperatorActionService``.  Browser requests use
the signed ERP session and a distinct, reviewed first-party client grant; they
never impersonate the MCP service or accept tenant identity from headers.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import text
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.security.permissions import PermissionChecker
from ...domain.operator_actions import (
    ACTION_POLICIES,
    PREPARE_PAYLOAD_MODELS,
    ActionContext,
    ActionErrorCode,
    OperatorActionError,
    OperatorActionService,
    OperatorCommandType,
    get_operator_action_service,
    validate_prepare_payload_semantics,
)


router = APIRouter(prefix="/web/actions", tags=["Canonical ERP Commands"])
WEB_CLIENT_ID = "aasopharma-erp-web"
WEB_BEARER = HTTPBearer(auto_error=False)
PREVIEW_HASH_PATTERN = r"^sha256:[0-9a-f]{64}$"
IDEMPOTENCY_KEY_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"


class StrictDTO(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class ApprovalRequest(StrictDTO):
    preview_hash: str = Field(pattern=PREVIEW_HASH_PATTERN)
    approval_intent: Literal["approve"]
    idempotency_key: str = Field(pattern=IDEMPOTENCY_KEY_PATTERN)


class ExecutionRequest(StrictDTO):
    preview_hash: str = Field(pattern=PREVIEW_HASH_PATTERN)
    idempotency_key: str = Field(pattern=IDEMPOTENCY_KEY_PATTERN)


class PreparedResponse(StrictDTO):
    command_request_id: UUID
    command_type: str
    status: Literal["prepared"] = "prepared"
    preview_hash: str
    expires_at: datetime
    resolved_references: list[dict[str, Any]]
    source_versions: list[dict[str, Any]]
    calculation_ruleset: list[dict[str, Any]]
    inventory_impact: list[dict[str, Any]]
    financial_impact: list[dict[str, Any]]
    tax_impact: list[dict[str, Any]]
    policy_warnings: list[dict[str, Any]]
    required_approvals: list[dict[str, Any]]


class ExecutionResponse(StrictDTO):
    command_request_id: UUID
    command_type: str
    status: str
    preview_hash: str
    resource_type: Optional[str] = None
    resource_id: Optional[UUID] = None
    approved_at: Optional[datetime] = None
    executed_at: Optional[datetime] = None
    idempotency_replayed: bool = False


async def _web_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(WEB_BEARER),
) -> dict[str, Any]:
    """Expose the existing ERP bearer requirement in the public OpenAPI contract."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing or invalid authentication token")
    return await PermissionChecker()(
        authorization=f"{credentials.scheme} {credentials.credentials}"
    )


def _detail(code: ActionErrorCode, message: str, metadata: Optional[dict] = None):
    return {
        "code": code.value,
        "message": message,
        "retryable": False,
        "metadata": metadata or {},
    }


def _raise_action(error: OperatorActionError) -> None:
    status_by_code = {
        ActionErrorCode.AUTH_REQUIRED: 401,
        ActionErrorCode.SCOPE_DENIED: 403,
        ActionErrorCode.BRANCH_DENIED: 403,
        ActionErrorCode.VALIDATION_FAILED: 422,
        ActionErrorCode.AMBIGUOUS_REFERENCE: 409,
        ActionErrorCode.STALE_VERSION: 409,
        ActionErrorCode.PREVIEW_EXPIRED: 409,
        ActionErrorCode.PREVIEW_CHANGED: 409,
        ActionErrorCode.APPROVAL_REQUIRED: 409,
        ActionErrorCode.IDEMPOTENCY_CONFLICT: 409,
        ActionErrorCode.PERIOD_CLOSED: 409,
        ActionErrorCode.INSUFFICIENT_STOCK: 409,
        ActionErrorCode.BATCH_BLOCKED: 409,
        ActionErrorCode.POLICY_BLOCKED: 409,
    }
    raise HTTPException(
        status_code=status_by_code[error.code],
        detail={
            "code": error.code.value,
            "message": error.message,
            "retryable": error.retryable,
            "metadata": error.metadata,
        },
    ) from error


def _uuid(value: Any, claim: str) -> UUID:
    try:
        return UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail=f"Invalid ERP {claim} claim") from exc


def _resolve_context(
    db: Session,
    user: dict[str, Any],
    operation_key: str,
    *,
    branch_ids: tuple[UUID, ...] = (),
    command_request_id: Optional[UUID] = None,
) -> ActionContext:
    """Resolve exactly one reviewed first-party grant for the signed user."""
    if not WEB_CLIENT_ID:
        raise HTTPException(status_code=503, detail="ERP web client authority is not configured")
    org_id = _uuid(user.get("org_id"), "organization")
    auth_user_id = _uuid(user.get("auth_user_id"), "identity")
    user_id = _uuid(user.get("user_id"), "user")
    policy = ACTION_POLICIES[operation_key]
    db.execute(
        text("SELECT erp_security.activate_context(:auth_user_id, :org_id)"),
        {"auth_user_id": auth_user_id, "org_id": org_id},
    )
    rows = db.execute(
        text(
            """
            SELECT grant_row.id AS agent_grant_id,
                   grant_row.subject_membership_id AS membership_id,
                   grant_row.branch_id AS grant_branch_id,
                   command.branch_id AS command_branch_id,
                   command.destination_branch_id AS command_destination_branch_id
              FROM automation.agent_grants AS grant_row
              JOIN automation.agent_grant_capabilities AS capability
                ON capability.org_id=grant_row.org_id
               AND capability.agent_grant_id=grant_row.id
              JOIN core.memberships AS membership
                ON membership.org_id=grant_row.org_id
               AND membership.id=grant_row.subject_membership_id
              JOIN core.users AS user_row ON user_row.id=membership.user_id
              JOIN core.organizations AS organization ON organization.id=grant_row.org_id
              LEFT JOIN automation.command_requests AS command
                ON command.org_id=grant_row.org_id
               AND command.id=CAST(:command_request_id AS uuid)
             WHERE grant_row.org_id=:org_id
               AND grant_row.client_id=:client_id
               AND grant_row.status='active'
               AND grant_row.expires_at>transaction_timestamp()
               AND grant_row.consented_by_membership_id=grant_row.subject_membership_id
               AND user_row.id=:user_id AND user_row.auth_user_id=:auth_user_id
               AND user_row.status='active' AND membership.status='active'
               AND organization.status='active'
               AND capability.capability_code=:operation_key
               AND capability.status='active'
               AND (:command_request_id IS NULL OR (
                    command.agent_grant_id=grant_row.id
                    AND command.requested_by_membership_id=membership.id
               ))
               AND (:command_request_id IS NOT NULL OR grant_row.branch_id IS NULL
                    OR grant_row.branch_id=ANY(CAST(:branch_ids AS uuid[])))
             ORDER BY grant_row.id
             LIMIT 2
            """
        ),
        {
            "org_id": org_id,
            "client_id": WEB_CLIENT_ID,
            "operation_key": operation_key,
            "user_id": user_id,
            "auth_user_id": auth_user_id,
            "command_request_id": str(command_request_id) if command_request_id else None,
            "branch_ids": list(branch_ids),
        },
    ).fetchall()
    if len(rows) != 1:
        raise HTTPException(
            status_code=403,
            detail=_detail(
                ActionErrorCode.SCOPE_DENIED,
                "Exactly one active reviewed ERP web authority is required",
                {"operation_key": operation_key},
            ),
        )
    row = rows[0]._mapping
    resolved_branch_ids = branch_ids
    if command_request_id is not None:
        resolved_branch_ids = tuple(
            value
            for value in (
                row["command_branch_id"],
                row["command_destination_branch_id"],
            )
            if value is not None
        )
    return ActionContext(
        auth_user_id=auth_user_id,
        user_id=user_id,
        organization_id=org_id,
        membership_id=row["membership_id"],
        agent_grant_id=row["agent_grant_id"],
        client_id=WEB_CLIENT_ID,
        operation_key=operation_key,
        permission=policy.permission,
        branch_ids=resolved_branch_ids,
        organization_scope=row["grant_branch_id"] is None,
        delegated_command_request_id=command_request_id,
    )


def _ready(service: OperatorActionService, operation_key: str) -> None:
    if not service.deployment_readiness():
        raise HTTPException(status_code=503, detail="Canonical command authority is unavailable")
    if service.adapter_readiness().get(operation_key) is not True:
        raise HTTPException(status_code=503, detail="Canonical command adapter is unavailable")


@router.post("/{command_type}/prepare", response_model=PreparedResponse)
def prepare_action(
    command_type: OperatorCommandType,
    raw_payload: dict[str, Any] = Body(...),
    user: dict = Depends(_web_user),
    db: Session = Depends(get_db),
    service: OperatorActionService = Depends(get_operator_action_service),
) -> PreparedResponse:
    operation_key = command_type.value
    policy = ACTION_POLICIES[operation_key]
    _ready(service, operation_key)
    try:
        payload = PREPARE_PAYLOAD_MODELS[operation_key].model_validate(raw_payload)
        validate_prepare_payload_semantics(operation_key, payload)
    except (ValidationError, ValueError) as exc:
        errors = exc.errors(include_url=False) if isinstance(exc, ValidationError) else []
        raise HTTPException(
            status_code=422,
            detail=_detail(
                ActionErrorCode.VALIDATION_FAILED,
                str(exc) if not errors else "Operator action payload is invalid",
                {"errors": errors} if errors else None,
            ),
        ) from exc
    branches = tuple(getattr(payload, name) for name in policy.branch_fields)
    context = _resolve_context(db, user, operation_key, branch_ids=branches)
    values = payload.model_dump(mode="python", exclude_none=True)
    idempotency_key = values.pop("idempotency_key")
    try:
        command = service.prepare(
            policy=policy,
            payload=values,
            idempotency_key=idempotency_key,
            context=context,
        )
    except OperatorActionError as exc:
        _raise_action(exc)
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


def _command_context(db: Session, user: dict, operation: str, command_id: UUID):
    return _resolve_context(
        db, user, operation, command_request_id=command_id
    )


@router.post("/commands/{command_request_id}/approve", response_model=ExecutionResponse)
def approve_command(
    command_request_id: UUID,
    request: ApprovalRequest,
    user: dict = Depends(_web_user),
    db: Session = Depends(get_db),
    service: OperatorActionService = Depends(get_operator_action_service),
) -> ExecutionResponse:
    operation = "automation.command.approve"
    _ready(service, operation)
    context = _command_context(db, user, operation, command_request_id)
    try:
        result = service.approve(
            command_request_id=command_request_id,
            preview_hash=request.preview_hash,
            idempotency_key=request.idempotency_key,
            context=context,
        )
    except OperatorActionError as exc:
        _raise_action(exc)
    return ExecutionResponse(**result.__dict__)


@router.post("/commands/{command_request_id}/execute", response_model=ExecutionResponse)
def execute_command(
    command_request_id: UUID,
    request: ExecutionRequest,
    user: dict = Depends(_web_user),
    db: Session = Depends(get_db),
    service: OperatorActionService = Depends(get_operator_action_service),
) -> ExecutionResponse:
    operation = "automation.command.execute"
    _ready(service, operation)
    context = _command_context(db, user, operation, command_request_id)
    try:
        result = service.execute(
            command_request_id=command_request_id,
            preview_hash=request.preview_hash,
            idempotency_key=request.idempotency_key,
            context=context,
        )
    except OperatorActionError as exc:
        _raise_action(exc)
    return ExecutionResponse(**result.__dict__)
