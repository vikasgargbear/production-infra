"""First-party ERP web transport for canonical operator commands.

The browser and MCP transports intentionally authenticate differently, but
both terminate at the same ``OperatorActionService``.  Browser requests use
the signed ERP session and a distinct, reviewed first-party client grant; they
never impersonate the MCP service or accept tenant identity from headers.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
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


class InventoryAdjustmentEvidence(StrictDTO):
    evidence_attachment_id: UUID
    status: Literal["verified", "retained"]
    document_date: date
    verified_at: datetime
    retention_until: date


class InventoryAdjustmentUom(StrictDTO):
    uom_conversion_id: UUID
    from_uom_code: str
    to_uom_code: str
    multiplier: Decimal


class InventoryAdjustmentEligibility(StrictDTO):
    branch_id: UUID
    location_id: UUID
    counted_by_membership_id: UUID
    product_id: UUID
    batch_id: UUID
    system_base_quantity: Decimal
    uom_conversions: list[InventoryAdjustmentUom]
    evidence: list[InventoryAdjustmentEvidence]


class InventoryAdjustmentReadbackLine(StrictDTO):
    inventory_document_line_id: UUID
    product_id: UUID
    batch_id: UUID
    system_base_quantity: Decimal
    counted_base_quantity: Decimal
    gain_base_quantity: Decimal
    unit_cost: Decimal
    gain_value: Decimal
    ledger_entry_id: UUID
    ledger_quantity_delta: Decimal
    ledger_value_delta: Decimal
    current_on_hand_quantity: Decimal


class InventoryAdjustmentReadback(StrictDTO):
    command_request_id: UUID
    inventory_document_id: UUID
    document_number: str
    status: Literal["posted"]
    branch_id: UUID
    total_gain_base_quantity: Decimal
    total_gain_value: Decimal
    journal_entry_id: UUID
    journal_status: Literal["posted"]
    journal_debit_total: Decimal
    journal_credit_total: Decimal
    accounting_event_id: UUID
    lines: list[InventoryAdjustmentReadbackLine]


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
               AND (:command_request_id IS NULL OR :approval_mode OR (
                    command.agent_grant_id=grant_row.id
                    AND command.requested_by_membership_id=membership.id
               ))
               AND (NOT :approval_mode OR command.requested_by_membership_id<>membership.id)
               AND (grant_row.branch_id IS NULL
                    OR (:command_request_id IS NULL
                        AND grant_row.branch_id=ANY(CAST(:branch_ids AS uuid[])))
                    OR (:command_request_id IS NOT NULL
                        AND grant_row.branch_id IN (command.branch_id, command.destination_branch_id)))
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
            "approval_mode": operation_key == "automation.command.approve",
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


@router.get(
    "/inventory-adjustment/eligibility",
    response_model=InventoryAdjustmentEligibility,
)
def inventory_adjustment_eligibility(
    branch_id: UUID,
    location_id: UUID,
    batch_id: UUID,
    adjustment_date: date,
    user: dict = Depends(_web_user),
    db: Session = Depends(get_db),
) -> InventoryAdjustmentEligibility:
    """Return only server-proven facts needed to prepare a cycle-count gain.

    The browser must not derive membership, evidence, UOM, location, or current
    stock authority from display data.  Unsupported lots and missing physical
    count evidence therefore fail closed before a command can be prepared.
    """

    context = _resolve_context(
        db,
        user,
        "inventory.adjustment.prepare",
        branch_ids=(branch_id,),
    )
    rows = db.execute(
        text(
            """
            SELECT product.id AS product_id,
                   batch.id AS batch_id,
                   balance.on_hand_quantity AS system_base_quantity,
                   conversion.id AS uom_conversion_id,
                   conversion.from_uom_code,
                   conversion.to_uom_code,
                   conversion.multiplier
              FROM inventory.stock_balances AS balance
              JOIN inventory.locations AS location
                ON location.org_id=balance.org_id
               AND location.id=balance.location_id
               AND location.branch_id=balance.branch_id
              JOIN inventory.batches AS batch
                ON batch.org_id=balance.org_id
               AND batch.id=balance.batch_id
               AND batch.product_id=balance.product_id
              JOIN catalog.products AS product
                ON product.org_id=balance.org_id
               AND product.id=balance.product_id
              JOIN catalog.uom_conversions AS conversion
                ON conversion.org_id=product.org_id
               AND conversion.product_id=product.id
             WHERE balance.org_id=:org_id
               AND balance.branch_id=:branch_id
               AND balance.location_id=:location_id
               AND balance.batch_id=:batch_id
               AND balance.on_hand_quantity>0
               AND balance.inventory_value>0
               AND balance.average_unit_cost>0
               AND location.status='active'
               AND location.location_type='saleable'
               AND location.allows_sale
               AND NOT location.allows_negative_stock
               AND location.temperature_min_c IS NULL
               AND location.temperature_max_c IS NULL
               AND product.status='active'
               AND NOT product.cold_chain_required
               AND COALESCE(product.drug_schedule,'NONE') NOT IN ('H','H1','X')
               AND NOT COALESCE(product.ndps_regulated,false)
               AND batch.status='released'
               AND batch.released_at IS NOT NULL
               AND batch.released_at<=transaction_timestamp()
               AND batch.expires_on>:adjustment_date
               AND batch.mrp>0
               AND batch.mrp_uom_conversion_id IS NOT NULL
               AND conversion.status='active'
               AND conversion.from_uom_code<>conversion.to_uom_code
               AND conversion.to_uom_code=product.base_uom_code
               AND conversion.multiplier>0
               AND conversion.valid_from<=:adjustment_date
               AND (conversion.valid_until IS NULL OR conversion.valid_until>=:adjustment_date)
             ORDER BY conversion.from_uom_code, conversion.id
            """
        ),
        {
            "org_id": context.organization_id,
            "branch_id": branch_id,
            "location_id": location_id,
            "batch_id": batch_id,
            "adjustment_date": adjustment_date,
        },
    ).fetchall()
    if not rows:
        raise HTTPException(
            status_code=409,
            detail=_detail(
                ActionErrorCode.POLICY_BLOCKED,
                "This batch has no eligible cycle-count UOM or saleable stock context",
            ),
        )
    first = rows[0]._mapping
    evidence_rows = db.execute(
        text(
            """
            SELECT attachment.id AS evidence_attachment_id,
                   attachment.status,
                   attachment.document_date,
                   attachment.verified_at,
                   attachment.retention_until
              FROM core.attachments AS attachment
             WHERE attachment.org_id=:org_id
               AND attachment.evidence_kind='inventory_cycle_count_sheet'
               AND attachment.status IN ('verified','retained')
               AND attachment.verified_at IS NOT NULL
               AND attachment.verified_at<=transaction_timestamp()
               AND attachment.document_date=:adjustment_date
               AND attachment.retention_until IS NOT NULL
               AND attachment.retention_until>=:adjustment_date
               AND attachment.sha256 IS NOT NULL
               AND NOT EXISTS (
                   SELECT 1 FROM automation.command_requests AS prior
                    WHERE prior.org_id=attachment.org_id
                      AND prior.capability_code='inventory.adjustment.prepare'
                      AND prior.status NOT IN ('failed','expired','cancelled')
                      AND convert_from(prior.request_bytes,'UTF8')::jsonb
                          ->>'evidence_attachment_id'=attachment.id::text
               )
             ORDER BY attachment.verified_at DESC, attachment.id
            """
        ),
        {
            "org_id": context.organization_id,
            "adjustment_date": adjustment_date,
        },
    ).fetchall()
    if not evidence_rows:
        raise HTTPException(
            status_code=409,
            detail=_detail(
                ActionErrorCode.POLICY_BLOCKED,
                "No unused verified inventory cycle-count sheet exists for this India-local date",
            ),
        )
    return InventoryAdjustmentEligibility(
        branch_id=branch_id,
        location_id=location_id,
        counted_by_membership_id=context.membership_id,
        product_id=first["product_id"],
        batch_id=first["batch_id"],
        system_base_quantity=first["system_base_quantity"],
        uom_conversions=[
            InventoryAdjustmentUom(
                uom_conversion_id=row._mapping["uom_conversion_id"],
                from_uom_code=row._mapping["from_uom_code"],
                to_uom_code=row._mapping["to_uom_code"],
                multiplier=row._mapping["multiplier"],
            )
            for row in rows
        ],
        evidence=[InventoryAdjustmentEvidence(**dict(row._mapping)) for row in evidence_rows],
    )


@router.get(
    "/inventory-adjustment/commands/{command_request_id}/readback",
    response_model=InventoryAdjustmentReadback,
)
def inventory_adjustment_readback(
    command_request_id: UUID,
    user: dict = Depends(_web_user),
    db: Session = Depends(get_db),
) -> InventoryAdjustmentReadback:
    """Reconcile the posted stock, valuation ledger, journal, and event."""

    context = _command_context(
        db, user, "automation.command.execute", command_request_id
    )
    rows = db.execute(
        text(
            """
            SELECT command.id AS command_request_id,
                   document.id AS inventory_document_id,
                   document.document_number,
                   document.status,
                   document.branch_id,
                   document.total_abs_base_quantity AS total_gain_base_quantity,
                   document.total_value AS total_gain_value,
                   journal.id AS journal_entry_id,
                   journal.status AS journal_status,
                   journal.transaction_debit_total AS journal_debit_total,
                   journal.transaction_credit_total AS journal_credit_total,
                   event.id AS accounting_event_id,
                   document_line.id AS inventory_document_line_id,
                   document_line.product_id,
                   document_line.batch_id,
                   document_line.system_quantity AS system_base_quantity,
                   document_line.counted_quantity AS counted_base_quantity,
                   document_line.variance_quantity AS gain_base_quantity,
                   document_line.unit_cost,
                   document_line.extended_cost AS gain_value,
                   ledger.id AS ledger_entry_id,
                   ledger.quantity_delta AS ledger_quantity_delta,
                   ledger.value_delta AS ledger_value_delta,
                   balance.on_hand_quantity AS current_on_hand_quantity
              FROM automation.command_requests AS command
              JOIN inventory.inventory_documents AS document
                ON document.org_id=command.org_id
               AND document.id=command.target_resource_id
              JOIN inventory.inventory_document_lines AS document_line
                ON document_line.org_id=document.org_id
               AND document_line.inventory_document_id=document.id
              JOIN inventory.stock_ledger_entries AS ledger
                ON ledger.org_id=document_line.org_id
               AND ledger.inventory_document_id=document.id
               AND ledger.inventory_document_line_id=document_line.id
               AND ledger.entry_kind='count_gain'
              JOIN inventory.stock_balances AS balance
                ON balance.org_id=ledger.org_id
               AND balance.branch_id=ledger.branch_id
               AND balance.location_id=ledger.location_id
               AND balance.product_id=ledger.product_id
               AND balance.batch_id=ledger.batch_id
              JOIN finance.accounting_events AS event
                ON event.org_id=document.org_id
               AND event.inventory_document_id=document.id
               AND event.event_type='inventory_valuation'
              JOIN finance.journal_entries AS journal
                ON journal.org_id=event.org_id
               AND journal.id=event.journal_entry_id
             WHERE command.org_id=:org_id
               AND command.id=:command_request_id
               AND command.capability_code='inventory.adjustment.prepare'
               AND command.status='succeeded'
               AND document.status='posted'
               AND journal.status='posted'
             ORDER BY document_line.line_number, document_line.id
            """
        ),
        {
            "org_id": context.organization_id,
            "command_request_id": command_request_id,
        },
    ).fetchall()
    if not rows:
        raise HTTPException(
            status_code=409,
            detail=_detail(
                ActionErrorCode.POLICY_BLOCKED,
                "Posted cycle-count stock, journal, and event readback is incomplete",
            ),
        )
    header = rows[0]._mapping
    line_values = [row._mapping for row in rows]
    if (
        any(
            row["gain_base_quantity"] != row["ledger_quantity_delta"]
            or row["gain_value"] != row["ledger_value_delta"]
            or row["counted_base_quantity"] != row["current_on_hand_quantity"]
            for row in line_values
        )
        or sum((row["gain_base_quantity"] for row in line_values), Decimal("0"))
        != header["total_gain_base_quantity"]
        or sum((row["gain_value"] for row in line_values), Decimal("0"))
        != header["total_gain_value"]
        or header["journal_debit_total"] != header["total_gain_value"]
        or header["journal_credit_total"] != header["total_gain_value"]
    ):
        raise HTTPException(
            status_code=409,
            detail=_detail(
                ActionErrorCode.STALE_VERSION,
                "Posted cycle-count readback does not match its stock or valuation evidence",
            ),
        )
    return InventoryAdjustmentReadback(
        command_request_id=header["command_request_id"],
        inventory_document_id=header["inventory_document_id"],
        document_number=header["document_number"],
        status=header["status"],
        branch_id=header["branch_id"],
        total_gain_base_quantity=header["total_gain_base_quantity"],
        total_gain_value=header["total_gain_value"],
        journal_entry_id=header["journal_entry_id"],
        journal_status=header["journal_status"],
        journal_debit_total=header["journal_debit_total"],
        journal_credit_total=header["journal_credit_total"],
        accounting_event_id=header["accounting_event_id"],
        lines=[
            InventoryAdjustmentReadbackLine(
                inventory_document_line_id=row["inventory_document_line_id"],
                product_id=row["product_id"],
                batch_id=row["batch_id"],
                system_base_quantity=row["system_base_quantity"],
                counted_base_quantity=row["counted_base_quantity"],
                gain_base_quantity=row["gain_base_quantity"],
                unit_cost=row["unit_cost"],
                gain_value=row["gain_value"],
                ledger_entry_id=row["ledger_entry_id"],
                ledger_quantity_delta=row["ledger_quantity_delta"],
                ledger_value_delta=row["ledger_value_delta"],
                current_on_hand_quantity=row["current_on_hand_quantity"],
            )
            for row in line_values
        ],
    )


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


@router.get(
    "/inventory-adjustment/commands/{command_request_id}/review",
    response_model=PreparedResponse,
)
def inventory_adjustment_review(
    command_request_id: UUID,
    user: dict = Depends(_web_user),
    db: Session = Depends(get_db),
) -> PreparedResponse:
    """Load the immutable preview for a distinct authorized approver."""

    context = _command_context(
        db, user, "automation.command.approve", command_request_id
    )
    row = db.execute(
        text(
            """
            SELECT command.id,
                   command.operation,
                   command.status,
                   command.expires_at,
                   command.preview_hash,
                   convert_from(command.preview_bytes,'UTF8')::jsonb AS preview
              FROM automation.command_requests AS command
             WHERE command.org_id=:org_id
               AND command.id=:command_request_id
               AND command.capability_code='inventory.adjustment.prepare'
               AND command.approval_policy='separate_approver'
               AND command.status IN ('prepared','pending_approval','approved')
               AND command.expires_at>transaction_timestamp()
               AND command.requested_by_membership_id<>:membership_id
             FOR SHARE
            """
        ),
        {
            "org_id": context.organization_id,
            "command_request_id": command_request_id,
            "membership_id": context.membership_id,
        },
    ).first()
    if row is None:
        raise HTTPException(
            status_code=404,
            detail=_detail(
                ActionErrorCode.SCOPE_DENIED,
                "No unexpired cycle-count preview is available for independent approval",
            ),
        )
    value = row._mapping
    preview = value["preview"]
    return PreparedResponse(
        command_request_id=value["id"],
        command_type=value["operation"],
        preview_hash="sha256:" + bytes(value["preview_hash"]).hex(),
        expires_at=value["expires_at"],
        resolved_references=list(preview.get("resolved_references") or []),
        source_versions=list(preview.get("source_versions") or []),
        calculation_ruleset=list(preview.get("calculation_ruleset") or []),
        inventory_impact=list(preview.get("inventory_impact") or []),
        financial_impact=list(preview.get("financial_impact") or []),
        tax_impact=list(preview.get("tax_impact") or []),
        policy_warnings=list(preview.get("policy_warnings") or []),
        required_approvals=[{"policy": "separate_approver", "count": 1}],
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
