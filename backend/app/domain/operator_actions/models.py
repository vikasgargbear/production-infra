"""Transport-independent values and failures for canonical operator actions."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Mapping, Optional
from uuid import UUID


class ActionErrorCode(str, Enum):
    AUTH_REQUIRED = "AUTH_REQUIRED"
    SCOPE_DENIED = "SCOPE_DENIED"
    BRANCH_DENIED = "BRANCH_DENIED"
    AMBIGUOUS_REFERENCE = "AMBIGUOUS_REFERENCE"
    VALIDATION_FAILED = "VALIDATION_FAILED"
    STALE_VERSION = "STALE_VERSION"
    PREVIEW_EXPIRED = "PREVIEW_EXPIRED"
    PREVIEW_CHANGED = "PREVIEW_CHANGED"
    APPROVAL_REQUIRED = "APPROVAL_REQUIRED"
    IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT"
    PERIOD_CLOSED = "PERIOD_CLOSED"
    INSUFFICIENT_STOCK = "INSUFFICIENT_STOCK"
    BATCH_BLOCKED = "BATCH_BLOCKED"
    POLICY_BLOCKED = "POLICY_BLOCKED"


class OperatorActionError(RuntimeError):
    def __init__(
        self,
        code: ActionErrorCode,
        message: str,
        *,
        retryable: bool = False,
        metadata: Optional[Mapping[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable
        self.metadata = dict(metadata or {})


@dataclass(frozen=True)
class ActionContext:
    auth_user_id: UUID
    user_id: UUID
    organization_id: UUID
    membership_id: UUID
    agent_grant_id: UUID
    client_id: str
    operation_key: str
    permission: str
    branch_ids: tuple[UUID, ...]
    organization_scope: bool = False
    delegated_command_request_id: Optional[UUID] = None


@dataclass(frozen=True)
class PreparedCommand:
    command_request_id: UUID
    command_type: str
    preview_hash: str
    expires_at: datetime
    resolved_references: tuple[Mapping[str, Any], ...]
    source_versions: tuple[Mapping[str, Any], ...]
    calculation_ruleset: tuple[Mapping[str, Any], ...]
    inventory_impact: tuple[Mapping[str, Any], ...]
    financial_impact: tuple[Mapping[str, Any], ...]
    tax_impact: tuple[Mapping[str, Any], ...]
    policy_warnings: tuple[Mapping[str, Any], ...] = ()
    required_approvals: tuple[Mapping[str, Any], ...] = ()


@dataclass(frozen=True)
class CommandReview:
    """Immutable command envelope exposed to an independently authorized reviewer."""

    command_request_id: UUID
    command_type: str
    capability_code: str
    status: str
    requested_by_membership_id: UUID
    branch_id: Optional[UUID]
    destination_branch_id: Optional[UUID]
    target_resource_type: str
    target_resource_id: UUID
    target_row_version: int
    serializer_version: str
    preview_media_type: str
    preview_canonical_json: str
    preview_hash: str
    request_hash: str
    aggregate_version_hash: str
    approval_policy: str
    required_approval_count: int
    expires_at: datetime
    resolved_references: tuple[Mapping[str, Any], ...]
    source_versions: tuple[Mapping[str, Any], ...]
    calculation_ruleset: tuple[Mapping[str, Any], ...]
    inventory_impact: tuple[Mapping[str, Any], ...]
    financial_impact: tuple[Mapping[str, Any], ...]
    tax_impact: tuple[Mapping[str, Any], ...]
    policy_warnings: tuple[Mapping[str, Any], ...] = ()
    required_approvals: tuple[Mapping[str, Any], ...] = ()


@dataclass(frozen=True)
class CommandExecution:
    command_request_id: UUID
    command_type: str
    status: str
    preview_hash: str
    resource_type: Optional[str] = None
    resource_id: Optional[UUID] = None
    approved_at: Optional[datetime] = None
    executed_at: Optional[datetime] = None
    idempotency_replayed: bool = False


@dataclass(frozen=True)
class CommandState:
    command_request_id: UUID
    command_type: str
    status: str
    preview_hash: str
    expires_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    executed_at: Optional[datetime] = None
    resource_type: Optional[str] = None
    resource_id: Optional[UUID] = None
    failure: Optional[Mapping[str, Any]] = None
    audit_references: tuple[Mapping[str, Any], ...] = field(default_factory=tuple)
