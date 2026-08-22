"""Hidden service-to-service boundary behind published canonical MCP commands."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jwt import InvalidTokenError as JWTError
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from ....core.auth.jwt_auth import decode_jwt
from ....domain.operator_actions import (
    ACTION_POLICIES,
    PREPARE_PAYLOAD_MODELS,
    PUBLISHED_OPERATOR_OPERATION_KEYS,
    ActionContext,
    ActionErrorCode,
    CommandExecution,
    CommandState,
    OperatorActionError,
    OperatorActionService,
    OperatorCommandType,
    PreparedCommand,
    get_operator_action_service,
    policy_for,
    validate_prepare_payload_semantics,
)
from .mcp_agent_grants import _internal_auth, bearer


router = APIRouter(
    prefix="/internal/mcp",
    tags=["Internal MCP Operator Actions"],
    include_in_schema=False,
)

ACTION_TOKEN_PROFILE = "canonical_operator_delegation_v1"
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


class OperationPolicyResponse(StrictDTO):
    operation_key: str
    permission: str
    risk_class: str
    schema_profile: str
    approval_policy: str
    branch_fields: list[str]


class PreparedCommandResponse(StrictDTO):
    command_request_id: UUID
    command_type: str
    status: Literal["prepared"] = "prepared"
    preview_hash: str = Field(pattern=PREVIEW_HASH_PATTERN)
    expires_at: datetime
    operation_policy: OperationPolicyResponse
    resolved_references: list[dict[str, Any]]
    source_versions: list[dict[str, Any]]
    calculation_ruleset: list[dict[str, Any]]
    inventory_impact: list[dict[str, Any]]
    financial_impact: list[dict[str, Any]]
    tax_impact: list[dict[str, Any]]
    policy_warnings: list[dict[str, Any]]
    required_approvals: list[dict[str, Any]]


class CommandExecutionResponse(StrictDTO):
    command_request_id: UUID
    command_type: str
    status: str
    preview_hash: str = Field(pattern=PREVIEW_HASH_PATTERN)
    resource_type: Optional[str] = None
    resource_id: Optional[UUID] = None
    approved_at: Optional[datetime] = None
    executed_at: Optional[datetime] = None
    idempotency_replayed: bool = False


class CommandStatusResponse(StrictDTO):
    command_request_id: UUID
    command_type: str
    status: str
    preview_hash: str = Field(pattern=PREVIEW_HASH_PATTERN)
    expires_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    executed_at: Optional[datetime] = None
    resource_type: Optional[str] = None
    resource_id: Optional[UUID] = None
    failure: Optional[dict[str, Any]] = None
    audit_references: list[dict[str, Any]]


def _error_detail(
    code: ActionErrorCode,
    message: str,
    *,
    retryable: bool = False,
    metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    return {
        "code": code.value,
        "message": message,
        "retryable": retryable,
        "metadata": metadata or {},
    }


def _raise_action_error(error: OperatorActionError) -> None:
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
    status_code = status_by_code[error.code]
    if error.metadata.get("reason") in {
        "COMMAND_ADAPTER_UNAVAILABLE",
        "CANONICAL_BASELINE_UNVERIFIED",
    }:
        status_code = 503
    raise HTTPException(
        status_code=status_code,
        detail=_error_detail(
            error.code,
            error.message,
            retryable=error.retryable,
            metadata=error.metadata,
        ),
    ) from error


def _uuid_claim(claims: dict[str, Any], name: str) -> UUID:
    try:
        return UUID(str(claims[name]))
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=401,
            detail=_error_detail(ActionErrorCode.AUTH_REQUIRED, "Invalid canonical delegation"),
        ) from exc


def _parse_action_token(header: str) -> dict[str, Any]:
    scheme, separator, token = header.partition(" ")
    if separator != " " or scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(
            status_code=401,
            detail=_error_detail(ActionErrorCode.AUTH_REQUIRED, "Canonical delegation is required"),
        )
    try:
        claims = decode_jwt(token.strip(), check_blacklist=False)
    except JWTError as exc:
        raise HTTPException(
            status_code=401,
            detail=_error_detail(ActionErrorCode.AUTH_REQUIRED, "Invalid canonical delegation"),
        ) from exc
    if (
        claims.get("operator_delegated") is not True
        or claims.get("token_profile") != ACTION_TOKEN_PROFILE
    ):
        raise HTTPException(
            status_code=401,
            detail=_error_detail(ActionErrorCode.AUTH_REQUIRED, "Invalid canonical delegation"),
        )
    return claims


def get_action_context(
    delegated_authorization: str = Header(
        ..., alias="X-MCP-Delegated-Authorization", min_length=8, max_length=8192
    ),
    service_credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> ActionContext:
    """Require service authentication and a short-lived signed action grant."""
    _internal_auth(service_credentials)
    claims = _parse_action_token(delegated_authorization)
    operation_key = claims.get("operator_operation")
    permission = claims.get("operator_permission")
    client_id = claims.get("mcp_client_id")
    raw_branches = claims.get("branch_ids")
    if (
        not isinstance(operation_key, str)
        or not isinstance(permission, str)
        or not isinstance(client_id, str)
        or not client_id
        or not isinstance(raw_branches, list)
        or len(raw_branches) > 2
    ):
        raise HTTPException(
            status_code=401,
            detail=_error_detail(ActionErrorCode.AUTH_REQUIRED, "Invalid canonical delegation"),
        )
    try:
        branch_ids = tuple(UUID(str(value)) for value in raw_branches)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=401,
            detail=_error_detail(ActionErrorCode.AUTH_REQUIRED, "Invalid canonical branch delegation"),
        ) from exc
    if len(set(branch_ids)) != len(branch_ids):
        raise HTTPException(
            status_code=401,
            detail=_error_detail(ActionErrorCode.AUTH_REQUIRED, "Invalid canonical branch delegation"),
        )
    raw_command_request_id = claims.get("operator_command_request_id")
    try:
        delegated_command_request_id = (
            UUID(str(raw_command_request_id)) if raw_command_request_id is not None else None
        )
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=401,
            detail=_error_detail(ActionErrorCode.AUTH_REQUIRED, "Invalid canonical command delegation"),
        ) from exc
    return ActionContext(
        auth_user_id=_uuid_claim(claims, "auth_user_id"),
        user_id=_uuid_claim(claims, "user_id"),
        organization_id=_uuid_claim(claims, "org_id"),
        membership_id=_uuid_claim(claims, "membership_id"),
        agent_grant_id=_uuid_claim(claims, "agent_grant_id"),
        client_id=client_id,
        operation_key=operation_key,
        permission=permission,
        branch_ids=branch_ids,
        organization_scope=claims.get("operator_organization_scope") is True,
        delegated_command_request_id=delegated_command_request_id,
    )


def _require_release_gate(service: OperatorActionService) -> None:
    if not service.deployment_readiness():
        _raise_action_error(
            OperatorActionError(
                ActionErrorCode.POLICY_BLOCKED,
                "Canonical baseline deployment is not verified",
                metadata={"reason": "CANONICAL_BASELINE_UNVERIFIED"},
            )
        )


def _require_authority(context: ActionContext, operation_key: str) -> None:
    policy = policy_for(operation_key)
    if policy is None or context.operation_key != operation_key or context.permission != policy.permission:
        _raise_action_error(
            OperatorActionError(
                ActionErrorCode.SCOPE_DENIED,
                "Delegation does not authorize this canonical operation",
                metadata={"operation_key": operation_key},
            )
        )


def _require_adapter(service: OperatorActionService, operation_key: str) -> None:
    if service.adapter_readiness().get(operation_key) is not True:
        _raise_action_error(
            OperatorActionError(
                ActionErrorCode.POLICY_BLOCKED,
                "Canonical command adapter is not registered",
                metadata={"operation_key": operation_key, "reason": "COMMAND_ADAPTER_UNAVAILABLE"},
            )
        )


def _require_payload_branches(context: ActionContext, policy, payload: BaseModel) -> None:
    requested = tuple(getattr(payload, field_name) for field_name in policy.branch_fields)
    if len(requested) == 2 and requested[0] == requested[1]:
        _raise_action_error(
            OperatorActionError(
                ActionErrorCode.BRANCH_DENIED,
                "Source and destination branches must differ",
            )
        )
    # An organization-scoped durable grant may still yield a JWT bounded to the
    # exact branches requested for this operation. Empty branch_ids is reserved
    # for non-payload operations and must never broaden a prepare delegation.
    if context.organization_scope and not context.branch_ids:
        return
    allowed = set(context.branch_ids)
    if any(branch_id not in allowed for branch_id in requested):
        _raise_action_error(
            OperatorActionError(
                ActionErrorCode.BRANCH_DENIED,
                "Command branch is outside the delegated scope",
            )
        )


def _require_command_binding(context: ActionContext, command_request_id: UUID) -> None:
    if context.delegated_command_request_id != command_request_id:
        _raise_action_error(
            OperatorActionError(
                ActionErrorCode.SCOPE_DENIED,
                "Delegation does not authorize this canonical command",
                metadata={"command_request_id": str(command_request_id)},
            )
        )


def _prepared_response(command: PreparedCommand, policy) -> PreparedCommandResponse:
    return PreparedCommandResponse(
        command_request_id=command.command_request_id,
        command_type=command.command_type,
        preview_hash=command.preview_hash,
        expires_at=command.expires_at,
        operation_policy=OperationPolicyResponse(
            operation_key=policy.operation_key,
            permission=policy.permission,
            risk_class=policy.risk_class,
            schema_profile=policy.schema_profile,
            approval_policy=policy.approval_policy,
            branch_fields=list(policy.branch_fields),
        ),
        resolved_references=[dict(item) for item in command.resolved_references],
        source_versions=[dict(item) for item in command.source_versions],
        calculation_ruleset=[dict(item) for item in command.calculation_ruleset],
        inventory_impact=[dict(item) for item in command.inventory_impact],
        financial_impact=[dict(item) for item in command.financial_impact],
        tax_impact=[dict(item) for item in command.tax_impact],
        policy_warnings=[dict(item) for item in command.policy_warnings],
        required_approvals=[dict(item) for item in command.required_approvals],
    )


def _execution_response(command: CommandExecution) -> CommandExecutionResponse:
    return CommandExecutionResponse(**command.__dict__)


@router.post(
    "/actions/{command_type}/prepare",
    response_model=PreparedCommandResponse,
)
def prepare_action(
    command_type: OperatorCommandType,
    raw_payload: dict[str, Any] = Body(...),
    context: ActionContext = Depends(get_action_context),
    service: OperatorActionService = Depends(get_operator_action_service),
) -> PreparedCommandResponse:
    operation_key = command_type.value
    policy = ACTION_POLICIES[operation_key]
    _require_release_gate(service)
    _require_authority(context, operation_key)
    if context.delegated_command_request_id is not None:
        _raise_action_error(
            OperatorActionError(
                ActionErrorCode.SCOPE_DENIED,
                "Prepare delegation cannot target an existing command",
            )
        )
    _require_adapter(service, operation_key)
    try:
        payload = PREPARE_PAYLOAD_MODELS[operation_key].model_validate(raw_payload)
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail=_error_detail(
                ActionErrorCode.VALIDATION_FAILED,
                "Operator action payload is invalid",
                metadata={"errors": exc.errors(include_url=False)},
            ),
        ) from exc
    validated_payload = payload.model_dump(mode="python", exclude_none=True)
    try:
        validate_prepare_payload_semantics(operation_key, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=_error_detail(
                ActionErrorCode.VALIDATION_FAILED,
                str(exc),
            ),
        ) from exc
    idempotency_key = validated_payload.pop("idempotency_key")
    _require_payload_branches(context, policy, payload)
    try:
        command = service.prepare(
            policy=policy,
            payload=validated_payload,
            idempotency_key=idempotency_key,
            context=context,
        )
    except OperatorActionError as exc:
        _raise_action_error(exc)
    return _prepared_response(command, policy)


@router.post(
    "/commands/{command_request_id}/approve",
    response_model=CommandExecutionResponse,
)
def approve_command(
    command_request_id: UUID,
    request: ApprovalRequest,
    context: ActionContext = Depends(get_action_context),
    service: OperatorActionService = Depends(get_operator_action_service),
) -> CommandExecutionResponse:
    operation_key = "automation.command.approve"
    _require_release_gate(service)
    _require_authority(context, operation_key)
    _require_command_binding(context, command_request_id)
    _require_adapter(service, operation_key)
    try:
        result = service.approve(
            command_request_id=command_request_id,
            preview_hash=request.preview_hash,
            idempotency_key=request.idempotency_key,
            context=context,
        )
    except OperatorActionError as exc:
        _raise_action_error(exc)
    return _execution_response(result)


@router.post(
    "/commands/{command_request_id}/execute",
    response_model=CommandExecutionResponse,
)
def execute_command(
    command_request_id: UUID,
    request: ExecutionRequest,
    context: ActionContext = Depends(get_action_context),
    service: OperatorActionService = Depends(get_operator_action_service),
) -> CommandExecutionResponse:
    operation_key = "automation.command.execute"
    _require_release_gate(service)
    _require_authority(context, operation_key)
    _require_command_binding(context, command_request_id)
    _require_adapter(service, operation_key)
    try:
        result = service.execute(
            command_request_id=command_request_id,
            preview_hash=request.preview_hash,
            idempotency_key=request.idempotency_key,
            context=context,
        )
    except OperatorActionError as exc:
        _raise_action_error(exc)
    return _execution_response(result)


@router.get(
    "/commands/{command_request_id}",
    response_model=CommandStatusResponse,
)
def get_command_status(
    command_request_id: UUID,
    context: ActionContext = Depends(get_action_context),
    service: OperatorActionService = Depends(get_operator_action_service),
) -> CommandStatusResponse:
    operation_key = "automation.command.status.get"
    _require_release_gate(service)
    _require_authority(context, operation_key)
    _require_command_binding(context, command_request_id)
    _require_adapter(service, operation_key)
    try:
        result: CommandState = service.get_status(
            command_request_id=command_request_id,
            context=context,
        )
    except OperatorActionError as exc:
        _raise_action_error(exc)
    return CommandStatusResponse(
        **{
            **result.__dict__,
            "audit_references": [dict(item) for item in result.audit_references],
            "failure": dict(result.failure) if result.failure is not None else None,
        }
    )


@router.get("/actions/ready")
def action_readiness(
    context: ActionContext = Depends(get_action_context),
    service: OperatorActionService = Depends(get_operator_action_service),
):
    operation_key = "automation.command.status.get"
    _require_authority(context, operation_key)
    blockers: list[str] = []
    if not service.deployment_readiness():
        blockers.append("canonical baseline deployment is not verified")
    readiness = service.adapter_readiness()
    missing = sorted(
        key
        for key in PUBLISHED_OPERATOR_OPERATION_KEYS
        if readiness.get(key) is not True
    )
    if missing:
        blockers.append("missing canonical command adapters: " + ", ".join(missing))
    if blockers:
        raise HTTPException(
            status_code=503,
            detail=_error_detail(
                ActionErrorCode.POLICY_BLOCKED,
                "; ".join(blockers),
                metadata={"missing_adapters": missing},
            ),
        )
    return {
        "status": "ready",
        "registered_operations": sorted(PUBLISHED_OPERATOR_OPERATION_KEYS),
    }
