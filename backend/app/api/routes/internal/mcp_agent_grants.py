"""Application-owned MCP agent grant authorization boundary."""

from __future__ import annotations

from datetime import timedelta
import hmac
import os
import time
from typing import List, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from ....core.auth.jwt_auth import create_access_token
from ....core.database import get_db
from ....domain.operator_actions import ActionPolicy
from ....domain.operator_actions import policy_for as operator_policy_for
from .mcp_contract import policy_for
router = APIRouter(
    prefix="/internal/mcp/agent-grants", tags=["Internal MCP"], include_in_schema=False
)
bearer = HTTPBearer(auto_error=False)

# Code-owned release gates. An operator environment variable must not be able to
# assert that an unverified SDK or hosted flow is complete.
HOSTED_OAUTH_CONSENT_UI_IMPLEMENTED = True
HOSTED_OAUTH_CONSENT_SDK_TARGET = "2.112.3"
HOSTED_OAUTH_CONSENT_SDK_VERIFIED = True
HOSTED_OAUTH_CONSENT_IMPLEMENTED = (
    HOSTED_OAUTH_CONSENT_UI_IMPLEMENTED and HOSTED_OAUTH_CONSENT_SDK_VERIFIED
)
CANONICAL_MCP_READ_API_IMPLEMENTED = True
CANONICAL_SCHEMA_DEPLOYMENT_VERIFIED = True
MCP_STAGING_VERIFIED = True
SUPABASE_DYNAMIC_CLIENT_REGISTRATION_ENABLED = False
# Only the reviewed adapter subset is published. Transfer and destruction stay
# unexported and fail closed at the application adapter boundary.
CANONICAL_OPERATOR_ACTION_ADAPTERS_VERIFIED = True


class GrantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    issuer: str = Field(min_length=8, max_length=512)
    subject: UUID
    organization_id: UUID
    client_id: str = Field(min_length=1, max_length=255)
    operation_key: str = Field(min_length=3, max_length=128)
    capability_code: str = Field(pattern=r"^[a-z][a-z0-9_.]{2,127}$")
    operation_mode: str = Field(pattern=r"^read$")
    branch_id: Optional[UUID] = None


class GrantResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    allowed: bool
    issuer: str
    subject: str
    client_id: str
    operation_key: str
    capability_code: str
    organization_id: str
    membership_id: str
    agent_grant_id: str
    branch_ids: List[str]
    delegated_access_token: str
    expires_at: int


class OperatorGrantRequest(BaseModel):
    """Exact OAuth identity and one bounded canonical operator operation."""

    model_config = ConfigDict(extra="forbid")

    issuer: str = Field(min_length=8, max_length=512)
    subject: UUID
    client_id: str = Field(min_length=1, max_length=255)
    organization_id: UUID
    operation_key: str = Field(pattern=r"^[a-z][a-z0-9_.]{2,127}$")
    capability_code: str = Field(pattern=r"^[a-z][a-z0-9_.]{2,127}$")
    operation_mode: Literal["read", "write"]
    branch_ids: List[UUID] = Field(default_factory=list, max_length=2)
    command_request_id: Optional[UUID] = None

    @model_validator(mode="after")
    def branch_ids_are_ordered_and_unique(self):
        if len(set(self.branch_ids)) != len(self.branch_ids):
            raise ValueError("branch_ids must be unique and preserve source/destination order")
        return self


class OperatorGrantResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    allowed: bool
    issuer: str
    subject: str
    client_id: str
    operation_key: str
    capability_code: str
    operation_mode: Literal["read", "write"]
    permission_code: str
    organization_id: str
    membership_id: str
    agent_grant_id: str
    branch_ids: List[str]
    organization_scope: bool
    command_request_id: Optional[str]
    delegated_access_token: str
    expires_at: int


def _internal_auth(credentials: Optional[HTTPAuthorizationCredentials]) -> None:
    expected = os.getenv("MCP_INTERNAL_SERVICE_TOKEN", "")
    supplied = credentials.credentials if credentials else ""
    if len(expected) < 32 or not hmac.compare_digest(expected, supplied):
        raise HTTPException(status_code=401, detail="Invalid MCP service credential")


def _configured_client_ids() -> tuple[str, ...]:
    return tuple(
        value.strip()
        for value in os.getenv("MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS", "").split(",")
        if value.strip()
    )


def _require_release_gates() -> None:
    blockers = []
    if not HOSTED_OAUTH_CONSENT_IMPLEMENTED:
        blockers.append("hosted OAuth consent is not implemented")
    if not CANONICAL_MCP_READ_API_IMPLEMENTED:
        blockers.append("canonical MCP read authorization is not implemented")
    if not CANONICAL_SCHEMA_DEPLOYMENT_VERIFIED:
        blockers.append("canonical schema deployment is not verified")
    if not MCP_STAGING_VERIFIED:
        blockers.append("MCP staging verification is incomplete")
    if blockers:
        raise HTTPException(status_code=503, detail="; ".join(blockers))


def _require_readiness_gates() -> None:
    blockers = []
    if not HOSTED_OAUTH_CONSENT_IMPLEMENTED:
        blockers.append("hosted OAuth consent is not implemented")
    if not CANONICAL_SCHEMA_DEPLOYMENT_VERIFIED:
        blockers.append("canonical schema deployment is not verified")
    if not MCP_STAGING_VERIFIED:
        blockers.append("MCP staging verification is incomplete")
    if not SUPABASE_DYNAMIC_CLIENT_REGISTRATION_ENABLED and not _configured_client_ids():
        blockers.append("Supabase DCR is disabled and no client is pre-registered")
    if blockers:
        raise HTTPException(status_code=503, detail="; ".join(blockers))


def _require_operator_release_gates() -> None:
    blockers = []
    if not HOSTED_OAUTH_CONSENT_IMPLEMENTED:
        blockers.append("hosted OAuth consent is not implemented")
    if not CANONICAL_SCHEMA_DEPLOYMENT_VERIFIED:
        blockers.append("canonical schema deployment is not verified")
    if not MCP_STAGING_VERIFIED:
        blockers.append("MCP staging verification is incomplete")
    if not CANONICAL_OPERATOR_ACTION_ADAPTERS_VERIFIED:
        blockers.append("canonical operator action adapters are not verified")
    if blockers:
        raise HTTPException(status_code=503, detail="; ".join(blockers))


def _operator_capability_approval_policy(policy: ActionPolicy) -> str:
    # Shared transport operations are still consented using the canonical
    # capability vocabulary. The command's own approval policy is separately
    # revalidated below and by the durable command functions.
    return {
        "explicit_human": "actor_confirmation",
        "command_policy": "actor_confirmation",
    }.get(policy.approval_policy, policy.approval_policy)


def _validate_operator_request(
    request: OperatorGrantRequest, policy: ActionPolicy
) -> tuple[str, str]:
    operation_mode = "read" if policy.risk_class == "read_only" else "write"
    if request.capability_code != policy.operation_key or request.operation_mode != operation_mode:
        raise HTTPException(status_code=403, detail="Operator capability does not match the operation")

    is_prepare = bool(policy.branch_fields)
    if is_prepare:
        if request.command_request_id is not None:
            raise HTTPException(status_code=403, detail="Prepare delegation cannot target an existing command")
        if len(request.branch_ids) != len(policy.branch_fields):
            raise HTTPException(status_code=403, detail="Operator branch scope does not match the operation")
    else:
        if request.operation_key in {
            "automation.command.approve",
            "automation.command.execute",
        } and request.command_request_id is None:
            raise HTTPException(status_code=403, detail="Shared command delegation requires command_request_id")
        if request.branch_ids:
            raise HTTPException(status_code=403, detail="Shared command branch scope is database-derived")
    return operation_mode, _operator_capability_approval_policy(policy)


def _operator_grant_rows(
    db: Session,
    request: OperatorGrantRequest,
    policy: ActionPolicy,
    operation_mode: str,
    capability_approval_policy: str,
):
    """Resolve one live grant while deriving command branch scope in SQL."""
    return db.execute(
        text(
            """
            WITH requested_scope(branch_id) AS (
                SELECT unnest(CAST(:branch_ids AS uuid[]))
            )
            SELECT grant_row.org_id, grant_row.id AS agent_grant_id,
                   grant_row.subject_membership_id AS membership_id,
                   grant_row.branch_id AS grant_branch_id,
                   user_row.id AS canonical_user_id, user_row.auth_user_id,
                   command.id AS command_request_id,
                   command.branch_id AS command_branch_id,
                   command.destination_branch_id AS command_destination_branch_id,
                   floor(extract(epoch FROM least(
                       grant_row.expires_at,
                       CASE
                           WHEN :operation_key IN (
                               'automation.command.approve',
                               'automation.command.execute'
                           ) THEN command.expires_at
                           ELSE grant_row.expires_at
                       END
                   )))::bigint AS authority_expires_at
              FROM automation.agent_grants AS grant_row
              JOIN automation.agent_grant_capabilities AS capability
                ON capability.org_id=grant_row.org_id
               AND capability.agent_grant_id=grant_row.id
              JOIN core.memberships AS membership
                ON membership.org_id=grant_row.org_id
               AND membership.id=grant_row.subject_membership_id
              JOIN core.users AS user_row ON user_row.id=membership.user_id
              JOIN core.organizations AS organization ON organization.id=grant_row.org_id
              LEFT JOIN LATERAL erp_automation_reads.command_authority_context(
                   grant_row.org_id, :command_request_id
              ) AS command ON true
              LEFT JOIN automation.agent_grants AS command_grant
                ON command_grant.org_id=grant_row.org_id
               AND command_grant.id=command.agent_grant_id
              LEFT JOIN automation.agent_grant_capabilities AS command_capability
                ON command_capability.org_id=grant_row.org_id
               AND command_capability.agent_grant_id=command.agent_grant_id
               AND command_capability.capability_code=command.capability_code
              LEFT JOIN core.memberships AS command_membership
                ON command_membership.org_id=command_grant.org_id
               AND command_membership.id=command_grant.subject_membership_id
              LEFT JOIN core.users AS command_user
                ON command_user.id=command_membership.user_id
             WHERE grant_row.org_id=:organization_id
               AND user_row.auth_user_id=:subject
               AND user_row.status='active' AND membership.status='active'
               AND organization.status='active'
               AND grant_row.client_id=:client_id
               AND grant_row.status='active'
               AND grant_row.expires_at>transaction_timestamp()
               AND capability.capability_code=:capability_code
               AND capability.operation_mode=:operation_mode
               AND capability.risk_class=:risk_class
               AND capability.approval_policy=:capability_approval_policy
               AND capability.status='active'
               AND (
                   (:command_request_id IS NULL AND (
                       grant_row.branch_id IS NULL
                       OR (cardinality(CAST(:branch_ids AS uuid[]))=1
                           AND grant_row.branch_id=ANY(CAST(:branch_ids AS uuid[])))
                   ))
                   OR (:command_request_id IS NOT NULL AND command.id IS NOT NULL AND (
                       grant_row.branch_id IS NULL
                       OR (command.destination_branch_id IS NULL
                           AND grant_row.branch_id=command.branch_id)
                   ))
               )
               AND (
                   :command_request_id IS NULL
                   OR (command_grant.status='active'
                       AND command_grant.expires_at>transaction_timestamp()
                       AND command_grant.client_id=:client_id
                       AND command_membership.status='active'
                       AND command_user.status='active'
                       AND command_capability.status='active'
                       AND command_capability.operation_mode=command.operation_mode
                       AND command_capability.risk_class=command.risk_class
                       AND command_capability.approval_policy=command.approval_policy
                       AND (command_capability.maximum_amount IS NULL
                            OR (command.requested_amount<=command_capability.maximum_amount
                                AND command.currency_code=command_capability.currency_code)))
               )
               AND (
                   :operation_key<>'automation.command.execute'
                   OR command.agent_grant_id=grant_row.id
               )
               AND (
                   :operation_key<>'automation.command.status.get'
                   OR :command_request_id IS NULL
                   OR command.agent_grant_id=grant_row.id
               )
               AND (
                   :operation_key<>'automation.command.approve'
                   OR command.status IN ('prepared','pending_approval')
                      AND command.expires_at>transaction_timestamp()
               )
               AND (
                   :operation_key<>'automation.command.execute'
                   OR (command.status IN ('prepared','pending_approval','approved','succeeded')
                       AND command.expires_at>transaction_timestamp()
                       AND NOT EXISTS (
                           SELECT 1 FROM automation.command_approvals AS rejection
                            WHERE rejection.org_id=grant_row.org_id
                              AND rejection.command_request_id=command.id
                              AND rejection.decision='rejected'
                              AND rejection.preview_hash=command.preview_hash
                              AND rejection.aggregate_version_hash=command.aggregate_version_hash
                       )
                       AND (
                           SELECT count(*)
                             FROM automation.command_approvals AS approval
                            WHERE approval.org_id=grant_row.org_id
                              AND approval.command_request_id=command.id
                              AND approval.decision='approved'
                              AND approval.preview_hash=command.preview_hash
                              AND approval.aggregate_version_hash=command.aggregate_version_hash
                              AND approval.valid_until_at>transaction_timestamp()
                              AND (command.approval_policy<>'actor_confirmation'
                                   OR approval.approver_membership_id=command.requested_by_membership_id)
                              AND (command.approval_policy='actor_confirmation'
                                   OR approval.approver_membership_id<>command.requested_by_membership_id)
                              AND (command.approval_policy<>'human_compliance_approver'
                                   OR approval.authentication_strength='mfa')
                       )>=command.required_approval_count)
               )
               AND (
                   :operation_key<>'automation.command.approve'
                   OR command.approval_policy<>'separate_approver'
                   OR (membership.id<>command.requested_by_membership_id
                       AND membership.id<>command_grant.subject_membership_id)
               )
               AND EXISTS (
                   SELECT 1
                     FROM core.access_grants AS grant_access
                     JOIN core.roles AS grant_role
                       ON grant_role.org_id=grant_access.org_id
                      AND grant_role.id=grant_access.role_id
                     JOIN core.role_permissions AS grant_role_permission
                       ON grant_role_permission.org_id=grant_role.org_id
                      AND grant_role_permission.role_id=grant_role.id
                     JOIN core.permissions AS grant_permission
                       ON grant_permission.code=grant_role_permission.permission_code
                    WHERE grant_access.org_id=grant_row.org_id
                      AND grant_access.membership_id=membership.id
                      AND grant_access.status='active'
                      AND grant_access.valid_from_at<=transaction_timestamp()
                      AND (grant_access.expires_at IS NULL
                           OR grant_access.expires_at>transaction_timestamp())
                      AND grant_role.status='active' AND grant_permission.status='active'
                      AND grant_permission.code=:permission_code
                      AND ((grant_row.branch_id IS NULL
                            AND grant_access.scope_kind='organization'
                            AND grant_access.branch_id IS NULL)
                           OR (grant_row.branch_id IS NOT NULL
                               AND grant_access.scope_kind='branch'
                               AND grant_access.branch_id=grant_row.branch_id))
               )
               AND NOT EXISTS (
                   SELECT 1
                     FROM (
                         SELECT branch_id FROM requested_scope
                          WHERE :command_request_id IS NULL
                         UNION ALL
                         SELECT command.branch_id
                          WHERE :command_request_id IS NOT NULL AND command.branch_id IS NOT NULL
                         UNION ALL
                         SELECT command.destination_branch_id
                          WHERE :command_request_id IS NOT NULL
                            AND command.destination_branch_id IS NOT NULL
                     ) AS required_scope(branch_id)
                    WHERE NOT EXISTS (
                              SELECT 1 FROM core.branches AS branch
                               WHERE branch.org_id=grant_row.org_id
                                 AND branch.id=required_scope.branch_id
                                 AND branch.status='active'
                          )
                       OR NOT EXISTS (
                              SELECT 1
                                FROM core.access_grants AS access_grant
                                JOIN core.roles AS role
                                  ON role.org_id=access_grant.org_id
                                 AND role.id=access_grant.role_id
                                JOIN core.role_permissions AS role_permission
                                  ON role_permission.org_id=role.org_id
                                 AND role_permission.role_id=role.id
                                JOIN core.permissions AS permission
                                  ON permission.code=role_permission.permission_code
                               WHERE access_grant.org_id=grant_row.org_id
                                 AND access_grant.membership_id=membership.id
                                 AND access_grant.status='active'
                                 AND access_grant.valid_from_at<=transaction_timestamp()
                                 AND (access_grant.expires_at IS NULL
                                      OR access_grant.expires_at>transaction_timestamp())
                                 AND role.status='active' AND permission.status='active'
                                 AND permission.code=:permission_code
                                 AND ((access_grant.scope_kind='organization'
                                       AND access_grant.branch_id IS NULL)
                                      OR (access_grant.scope_kind='branch'
                                          AND access_grant.branch_id=required_scope.branch_id))
                          )
               )
             ORDER BY grant_row.org_id, grant_row.id
             LIMIT 2
            """
        ),
        {
            "subject": request.subject,
            "client_id": request.client_id,
            "organization_id": request.organization_id,
            "operation_key": request.operation_key,
            "capability_code": request.capability_code,
            "operation_mode": operation_mode,
            "risk_class": policy.risk_class,
            "capability_approval_policy": capability_approval_policy,
            "permission_code": policy.permission,
            "branch_ids": request.branch_ids,
            "command_request_id": request.command_request_id,
        },
    ).fetchall()


def _grant_rows(db: Session, request: GrantRequest, permission_code: str):
    return db.execute(
        text(
            """
            SELECT DISTINCT grant_row.org_id, grant_row.id AS agent_grant_id,
                   grant_row.subject_membership_id AS membership_id,
                   grant_row.branch_id AS grant_branch_id,
                   COALESCE(CAST(:branch_id AS uuid), grant_row.branch_id)
                     AS delegated_branch_id,
                   user_row.id AS canonical_user_id,
                   user_row.auth_user_id, capability.allow_sensitive_read
              FROM automation.agent_grants AS grant_row
              JOIN automation.agent_grant_capabilities AS capability
                ON capability.org_id=grant_row.org_id
               AND capability.agent_grant_id=grant_row.id
              JOIN core.memberships AS membership
                ON membership.org_id=grant_row.org_id
               AND membership.id=grant_row.subject_membership_id
              JOIN core.users AS user_row ON user_row.id=membership.user_id
              JOIN core.organizations AS organization
                ON organization.id=grant_row.org_id
             WHERE grant_row.org_id=:organization_id
               AND user_row.auth_user_id=:subject
               AND user_row.status='active' AND membership.status='active'
               AND organization.status='active'
               AND grant_row.client_id=:client_id
               AND grant_row.status='active'
               AND grant_row.expires_at>transaction_timestamp()
               AND capability.capability_code=:capability_code
               AND capability.operation_mode='read'
               AND capability.risk_class='read_only'
               AND capability.approval_policy='none'
               AND capability.status='active'
               AND (:branch_id IS NULL OR grant_row.branch_id IS NULL
                    OR grant_row.branch_id=CAST(:branch_id AS uuid))
               AND (:branch_id IS NULL OR EXISTS (
                   SELECT 1 FROM core.branches AS requested_branch
                    WHERE requested_branch.org_id=grant_row.org_id
                      AND requested_branch.id=CAST(:branch_id AS uuid)
                      AND requested_branch.status='active'
               ))
               AND EXISTS (
                   SELECT 1
                     FROM core.access_grants AS access_grant
                     JOIN core.roles AS role
                       ON role.org_id=access_grant.org_id AND role.id=access_grant.role_id
                     JOIN core.role_permissions AS role_permission
                       ON role_permission.org_id=role.org_id AND role_permission.role_id=role.id
                     JOIN core.permissions AS permission
                       ON permission.code=role_permission.permission_code
                    WHERE access_grant.org_id=grant_row.org_id
                      AND access_grant.membership_id=grant_row.subject_membership_id
                      AND access_grant.status='active'
                      AND access_grant.valid_from_at<=transaction_timestamp()
                      AND (access_grant.expires_at IS NULL OR access_grant.expires_at>transaction_timestamp())
                      AND role.status='active' AND permission.status='active'
                      AND permission.code=:permission_code
                      AND ((access_grant.scope_kind='organization'
                            AND access_grant.branch_id IS NULL)
                           OR (grant_row.branch_id IS NOT NULL
                               AND access_grant.scope_kind='branch'
                               AND access_grant.branch_id=grant_row.branch_id))
               )
               AND (:branch_id IS NULL OR EXISTS (
                   SELECT 1
                     FROM core.access_grants AS requested_access
                     JOIN core.roles AS requested_role
                       ON requested_role.org_id=requested_access.org_id
                      AND requested_role.id=requested_access.role_id
                     JOIN core.role_permissions AS requested_role_permission
                       ON requested_role_permission.org_id=requested_role.org_id
                      AND requested_role_permission.role_id=requested_role.id
                     JOIN core.permissions AS requested_permission
                       ON requested_permission.code=requested_role_permission.permission_code
                    WHERE requested_access.org_id=grant_row.org_id
                      AND requested_access.membership_id=grant_row.subject_membership_id
                      AND requested_access.status='active'
                      AND requested_access.valid_from_at<=transaction_timestamp()
                      AND (requested_access.expires_at IS NULL
                           OR requested_access.expires_at>transaction_timestamp())
                      AND requested_role.status='active'
                      AND requested_permission.status='active'
                      AND requested_permission.code=:permission_code
                      AND ((requested_access.scope_kind='organization'
                            AND requested_access.branch_id IS NULL)
                           OR (requested_access.scope_kind='branch'
                               AND requested_access.branch_id=CAST(:branch_id AS uuid)))
               ))
             ORDER BY grant_row.id
             LIMIT 2
            """
        ),
        {
            "organization_id": request.organization_id,
            "subject": request.subject,
            "client_id": request.client_id,
            "capability_code": request.capability_code,
            "permission_code": permission_code,
            "branch_id": request.branch_id,
        },
    ).fetchall()


@router.post("/authorize", response_model=GrantResponse)
def authorize_agent_grant(
    request: GrantRequest,
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> GrantResponse:
    _internal_auth(credentials)
    _require_release_gates()
    policy = policy_for(request.operation_key)
    if (
        policy is None
        or request.capability_code != policy.capability_code
        or request.operation_mode != "read"
    ):
        raise HTTPException(status_code=403, detail="Operation is not an allowlisted canonical MCP read")
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    expected_issuer = f"{supabase_url}/auth/v1" if supabase_url else ""
    allowed_clients = _configured_client_ids()
    if not expected_issuer or request.issuer != expected_issuer:
        raise HTTPException(status_code=403, detail="OAuth issuer is not configured or allowed")
    if not allowed_clients or request.client_id not in allowed_clients:
        raise HTTPException(status_code=403, detail="OAuth client is not pre-registered")

    db.execute(
        text("SELECT erp_security.activate_context(:auth_user_id, :org_id)"),
        {"auth_user_id": request.subject, "org_id": request.organization_id},
    )
    rows = _grant_rows(db, request, policy.permission_code)
    if len(rows) != 1:
        raise HTTPException(status_code=403, detail="Exactly one active MCP agent grant is required")
    grant = rows[0]._mapping
    if policy.sensitive_read and not grant["allow_sensitive_read"]:
        raise HTTPException(status_code=403, detail="Agent grant excludes sensitive supplier reads")
    branch_ids = (
        [str(grant["delegated_branch_id"])]
        if grant["delegated_branch_id"] else []
    )
    claims = {
        "auth_user_id": str(grant["auth_user_id"]),
        "user_id": str(grant["canonical_user_id"]),
        "org_id": str(grant["org_id"]),
        "membership_id": str(grant["membership_id"]),
        "agent_grant_id": str(grant["agent_grant_id"]),
        "branch_ids": branch_ids,
        "mcp_client_id": request.client_id,
        "mcp_operation": request.operation_key,
        "mcp_capability": request.capability_code,
        "mcp_allow_sensitive_read": bool(grant["allow_sensitive_read"]),
        "mcp_delegated": True,
        "token_profile": "canonical_mcp_delegation_v1",
    }
    expires_at = int(time.time()) + 300
    delegated = create_access_token(claims, expires_delta=timedelta(minutes=5))
    return GrantResponse(
        allowed=True,
        issuer=request.issuer,
        subject=str(request.subject),
        client_id=request.client_id,
        operation_key=request.operation_key,
        capability_code=request.capability_code,
        organization_id=str(grant["org_id"]),
        membership_id=str(grant["membership_id"]),
        agent_grant_id=str(grant["agent_grant_id"]),
        branch_ids=branch_ids,
        delegated_access_token=delegated,
        expires_at=expires_at,
    )


@router.post("/authorize-action", response_model=OperatorGrantResponse)
def authorize_operator_action(
    request: OperatorGrantRequest,
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> OperatorGrantResponse:
    """Issue one short-lived, command/branch-bound operator delegation."""
    _internal_auth(credentials)
    _require_operator_release_gates()
    policy = operator_policy_for(request.operation_key)
    if policy is None:
        raise HTTPException(status_code=403, detail="Operation is not an allowlisted operator action")
    operation_mode, capability_approval_policy = _validate_operator_request(request, policy)

    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    expected_issuer = f"{supabase_url}/auth/v1" if supabase_url else ""
    allowed_clients = _configured_client_ids()
    if not expected_issuer or request.issuer != expected_issuer:
        raise HTTPException(status_code=403, detail="OAuth issuer is not configured or allowed")
    if not allowed_clients or request.client_id not in allowed_clients:
        raise HTTPException(status_code=403, detail="OAuth client is not pre-registered")

    db.execute(
        text("SELECT erp_security.activate_context(:auth_user_id, :org_id)"),
        {"auth_user_id": request.subject, "org_id": request.organization_id},
    )
    rows = _operator_grant_rows(
        db, request, policy, operation_mode, capability_approval_policy
    )
    if len(rows) != 1:
        raise HTTPException(status_code=403, detail="Exactly one active operator agent grant is required")
    grant = rows[0]._mapping
    if request.command_request_id is None:
        branch_ids = [str(value) for value in request.branch_ids]
    else:
        branch_ids = [
            str(value)
            for value in (
                grant["command_branch_id"],
                grant["command_destination_branch_id"],
            )
            if value is not None
        ]
    organization_scope = grant["grant_branch_id"] is None
    now = int(time.time())
    lifetime_seconds = min(300, int(grant["authority_expires_at"]) - now)
    if lifetime_seconds < 1:
        raise HTTPException(status_code=403, detail="Operator authority expires before delegation")

    claims = {
        "auth_user_id": str(grant["auth_user_id"]),
        "user_id": str(grant["canonical_user_id"]),
        "org_id": str(grant["org_id"]),
        "membership_id": str(grant["membership_id"]),
        "agent_grant_id": str(grant["agent_grant_id"]),
        "branch_ids": branch_ids,
        "mcp_client_id": request.client_id,
        "operator_operation": request.operation_key,
        "operator_permission": policy.permission,
        "operator_organization_scope": organization_scope,
        "operator_delegated": True,
        "token_profile": "canonical_operator_delegation_v1",
    }
    if request.command_request_id is not None:
        claims["operator_command_request_id"] = str(request.command_request_id)
    delegated = create_access_token(
        claims, expires_delta=timedelta(seconds=lifetime_seconds)
    )
    return OperatorGrantResponse(
        allowed=True,
        issuer=request.issuer,
        subject=str(request.subject),
        client_id=request.client_id,
        operation_key=request.operation_key,
        capability_code=request.capability_code,
        operation_mode=operation_mode,
        permission_code=policy.permission,
        organization_id=str(grant["org_id"]),
        membership_id=str(grant["membership_id"]),
        agent_grant_id=str(grant["agent_grant_id"]),
        branch_ids=branch_ids,
        organization_scope=organization_scope,
        command_request_id=(
            str(request.command_request_id) if request.command_request_id is not None else None
        ),
        delegated_access_token=delegated,
        expires_at=now + lifetime_seconds,
    )


@router.get("/ready")
def agent_grant_readiness(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
):
    _internal_auth(credentials)
    _require_readiness_gates()
    client_ids = _configured_client_ids()
    if not client_ids:
        raise HTTPException(
            status_code=503,
            detail="No reviewed pre-registered OAuth client path is configured",
        )
    relations = db.execute(
        text(
            """
            SELECT to_regclass('automation.agent_grants') IS NOT NULL
                   AND to_regclass('automation.agent_grant_capabilities') IS NOT NULL
                   AS available
            """
        )
    ).scalar()
    if relations is not True:
        raise HTTPException(status_code=503, detail="Canonical agent-grant authority is unavailable")
    return {"status": "ready", "grant_authority": "automation.agent_grants"}
