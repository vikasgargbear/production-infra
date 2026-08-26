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


class CommandReviewResponse(PreparedResponse):
    status: str
    capability_code: str
    requested_by_membership_id: UUID
    branch_id: Optional[UUID]
    destination_branch_id: Optional[UUID]
    target_resource_type: str
    target_resource_id: UUID
    target_row_version: int
    serializer_version: str
    preview_media_type: str
    preview_canonical_json: str
    request_hash: str
    aggregate_version_hash: str
    approval_policy: str
    required_approval_count: int


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


class ExpenseClaimReadbackLine(StrictDTO):
    expense_claim_line_id: UUID
    line_number: int
    expense_date: date
    expense_account_id: UUID
    description: str
    merchant_name: str
    receipt_attachment_id: UUID
    receipt_evidence_kind: Literal["expense_receipt"]
    receipt_status: Literal["verified", "retained"]
    receipt_document_date: date
    receipt_verified_at: datetime
    receipt_retention_until: date
    receipt_sha256: str
    claimed_amount: Decimal
    approved_amount: Decimal


class ExpenseClaimReadback(StrictDTO):
    command_request_id: UUID
    expense_claim_id: UUID
    claim_number: str
    status: Literal["posted"]
    branch_id: UUID
    claimant_membership_id: UUID
    claim_date: date
    period_start: date
    period_end: date
    currency_code: Literal["INR"]
    claimed_amount: Decimal
    approved_amount: Decimal
    approved_by_membership_id: UUID
    posted_by_membership_id: UUID
    journal_entry_id: UUID
    journal_status: Literal["posted"]
    journal_debit_total: Decimal
    journal_credit_total: Decimal
    accounting_event_id: UUID
    lines: list[ExpenseClaimReadbackLine]


class ExpenseClaimContextAccount(StrictDTO):
    account_id: UUID
    account_code: str
    account_name: str
    account_type: Literal["expense", "liability"]
    currency_code: Literal["INR"]


class ExpenseClaimContextReceipt(StrictDTO):
    receipt_attachment_id: UUID
    original_filename: str
    media_type: str
    byte_size: int
    document_date: date
    status: Literal["verified", "retained"]
    verified_at: datetime
    retention_until: date
    sha256: str


class ExpenseClaimContext(StrictDTO):
    organization_id: UUID
    branch_id: UUID
    branch_code: str
    branch_name: str
    claimant_membership_id: UUID
    claimant_display_name: str
    business_date: date
    currency_code: Literal["INR"]
    tax_treatment: Literal["non_creditable_gross_expense"]
    expense_accounts: list[ExpenseClaimContextAccount]
    reimbursement_accounts: list[ExpenseClaimContextAccount]
    receipts: list[ExpenseClaimContextReceipt]
    unsupported_modes: list[str]


class InventoryDestructionReadbackLine(StrictDTO):
    inventory_document_line_id: UUID
    product_id: UUID
    batch_id: UUID
    destroyed_base_quantity: Decimal
    unit_cost: Decimal
    destroyed_value: Decimal
    ledger_entry_id: UUID
    ledger_quantity_delta: Decimal
    ledger_value_delta: Decimal
    remaining_on_hand_quantity: Decimal
    remaining_inventory_value: Decimal


class InventoryDestructionItcApplicationReadback(StrictDTO):
    input_credit_application_id: UUID
    input_credit_lot_id: UUID
    supplier_invoice_id: UUID
    supplier_invoice_line_id: UUID
    goods_receipt_line_id: UUID
    batch_id: UUID
    applied_base_quantity: Decimal
    applied_cgst_amount: Decimal
    applied_sgst_amount: Decimal
    applied_igst_amount: Decimal
    applied_cess_amount: Decimal
    remaining_lot_base_quantity: Decimal
    remaining_lot_cgst_amount: Decimal
    remaining_lot_sgst_amount: Decimal
    remaining_lot_igst_amount: Decimal
    remaining_lot_cess_amount: Decimal


class InventoryDestructionReadback(StrictDTO):
    command_request_id: UUID
    destruction_id: UUID
    destruction_number: str
    status: Literal["posted"]
    destruction_date: date
    method_code: Literal["licensed_incineration"]
    reason_code: Literal["expired", "damaged", "quality_rejected"]
    certificate_attachment_id: UUID
    itc_reversal_evidence_attachment_id: UUID
    physical_destruction_confirmed_at: datetime
    gst_registration_id: UUID
    gst_return_period_id: UUID
    gstr3b_return_id: UUID
    itc_reversal_rule_version_id: UUID
    itc_reversal_event_id: UUID
    itc_reversal_cgst_amount: Decimal
    itc_reversal_sgst_amount: Decimal
    itc_reversal_igst_amount: Decimal
    itc_reversal_cess_amount: Decimal
    created_by_membership_id: UUID
    approved_by_membership_id: UUID
    posted_by_membership_id: UUID
    inventory_document_id: UUID
    inventory_document_number: str
    branch_id: UUID
    location_id: UUID
    total_destroyed_base_quantity: Decimal
    total_destroyed_value: Decimal
    journal_entry_id: UUID
    journal_status: Literal["posted"]
    journal_debit_total: Decimal
    journal_credit_total: Decimal
    accounting_event_id: UUID
    lines: list[InventoryDestructionReadbackLine]
    input_credit_applications: list[InventoryDestructionItcApplicationReadback]


class BankReconciliationReadback(StrictDTO):
    command_request_id: UUID
    reconciliation_match_id: UUID
    status: Literal["matched"]
    bank_statement_id: UUID
    bank_statement_status: Literal["reconciling", "reconciled"]
    bank_statement_line_id: UUID
    statement_direction: Literal["credit", "debit"]
    bank_account_id: UUID
    bank_ledger_account_id: UUID
    journal_entry_id: UUID
    journal_status: Literal["posted"]
    journal_bank_line_id: UUID
    matched_amount: Decimal
    currency_code: str
    match_method: Literal["manual", "reference_exact"]
    journal_bank_debit: Decimal
    journal_bank_credit: Decimal
    audit_event_count: int
    outbox_event_count: int


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
              LEFT JOIN LATERAL erp_automation_reads.command_authority_context(
                   grant_row.org_id, CAST(:command_request_id AS uuid)
              ) AS command ON true
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
               AND (
                   NOT :approval_mode
                   OR command.approval_policy<>'separate_approver'
                   OR command.requested_by_membership_id<>membership.id
               )
               AND (grant_row.branch_id IS NULL
                    OR (:command_request_id IS NULL
                        AND grant_row.branch_id=ANY(CAST(:branch_ids AS uuid[])))
                    OR (:command_request_id IS NOT NULL
                        AND grant_row.branch_id=command.branch_id
                        AND (command.destination_branch_id IS NULL
                             OR grant_row.branch_id=command.destination_branch_id)))
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
               AND NOT erp_automation_reads.active_command_evidence_in_use(
                   attachment.org_id,
                   'inventory.adjustment.prepare',
                   'evidence_attachment_id',
                   attachment.id
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
    return load_inventory_adjustment_readback(
        command_request_id=command_request_id,
        context=context,
        db=db,
    )


def load_inventory_adjustment_readback(
    *,
    command_request_id: UUID,
    context: ActionContext,
    db: Session,
) -> InventoryAdjustmentReadback:
    """Load the shared exact cycle-count readback after transport authorization."""
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
              FROM erp_automation_reads.command_authority_context(
                   :org_id, :command_request_id
              ) AS command
              JOIN inventory.inventory_documents AS document
                ON document.org_id=:org_id
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
             WHERE command.id=:command_request_id
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


def activate_inventory_adjustment_readback_context(
    *, db: Session, context: ActionContext, command_request_id: UUID
) -> None:
    """Activate the verified delegation before a non-web transport readback."""

    db.execute(
        text(
            """
            SELECT erp_security.activate_context(:auth_user_id, :org_id),
                   pg_catalog.set_config('app.request_id', :request_id, true)
            """
        ),
        {
            "auth_user_id": context.auth_user_id,
            "org_id": context.organization_id,
            "request_id": str(command_request_id),
        },
    )


@router.get(
    "/expense-claims/context",
    response_model=ExpenseClaimContext,
)
def expense_claim_context(
    branch_id: UUID,
    user: dict = Depends(_web_user),
    db: Session = Depends(get_db),
) -> ExpenseClaimContext:
    """Return only canonical facts eligible for a new expense claim.

    Receipt evidence and account identities are selected here instead of being
    inferred from legacy category labels or browser state.  Prepare re-locks
    and revalidates every returned row, so stale or already-consumed evidence
    still fails closed at the write boundary.
    """

    context = _resolve_context(
        db,
        user,
        "finance.expense_claim.prepare",
        branch_ids=(branch_id,),
    )
    header_rows = db.execute(
        text(
            """
            SELECT organization.id AS organization_id,
                   branch.id AS branch_id,branch.code AS branch_code,
                   branch.name AS branch_name,membership.id AS claimant_membership_id,
                   COALESCE(employee.display_name,user_row.display_name) AS claimant_display_name,
                   (pg_catalog.transaction_timestamp() AT TIME ZONE organization.timezone)::date AS business_date
              FROM core.organizations organization
              JOIN core.branches branch
                ON branch.org_id=organization.id AND branch.id=:branch_id
              JOIN core.memberships membership
                ON membership.org_id=organization.id AND membership.id=:membership_id
              JOIN core.users user_row ON user_row.id=membership.user_id
              LEFT JOIN hr.employees employee
                ON employee.org_id=membership.org_id
               AND employee.membership_id=membership.id
             WHERE organization.id=:org_id AND organization.status='active'
               AND organization.country_code='IN'
               AND organization.base_currency='INR'
               AND organization.timezone='Asia/Kolkata'
               AND branch.status='active' AND membership.status='active'
               AND user_row.status='active'
               AND erp_security.can_access_branch(branch.id)
               AND erp_security.has_permission('finance.expense.manage',branch.id)
               AND erp_security.has_permission('finance.journal.post',branch.id)
               AND erp_security.has_permission('automation.command.execute',branch.id)
               AND (
                    employee.id IS NULL OR (
                        employee.status='active'
                        AND employee.branch_id=branch.id
                        AND employee.employment_start_date<=
                            (pg_catalog.transaction_timestamp() AT TIME ZONE organization.timezone)::date
                        AND (
                            employee.employment_end_date IS NULL
                            OR employee.employment_end_date>=
                                (pg_catalog.transaction_timestamp() AT TIME ZONE organization.timezone)::date
                        )
                    )
               )
            """
        ),
        {
            "org_id": context.organization_id,
            "branch_id": branch_id,
            "membership_id": context.membership_id,
        },
    ).fetchall()
    if len(header_rows) != 1:
        raise HTTPException(
            status_code=404,
            detail=_detail(
                ActionErrorCode.SCOPE_DENIED,
                "Exactly one active INR expense-claim context is required for this branch",
            ),
        )
    header_value = header_rows[0]._mapping
    account_rows = db.execute(
        text(
            """
            SELECT account.id AS account_id,account.code AS account_code,
                   account.name AS account_name,account.account_type,
                   account.currency_code
              FROM finance.accounts account
             WHERE account.org_id=:org_id AND account.status='active'
               AND account.currency_code='INR' AND NOT account.allows_party_posting
               AND account.account_type IN ('expense','liability')
             ORDER BY account.account_type,account.code,account.id
            """
        ),
        {"org_id": context.organization_id},
    ).fetchall()
    receipt_rows = db.execute(
        text(
            """
            SELECT attachment.id AS receipt_attachment_id,
                   attachment.original_filename,attachment.media_type,
                   attachment.byte_size,attachment.document_date,
                   attachment.status,attachment.verified_at,
                   attachment.retention_until,
                   pg_catalog.encode(attachment.sha256,'hex') AS sha256
             FROM core.attachments attachment
             WHERE attachment.org_id=:org_id
               AND attachment.branch_id=:branch_id
               AND attachment.evidence_kind='expense_receipt'
               AND attachment.status IN ('verified','retained')
               AND attachment.verified_at IS NOT NULL
               AND attachment.verified_at<=pg_catalog.transaction_timestamp()
               AND attachment.document_date IS NOT NULL
               AND attachment.retention_until>=:business_date
               AND attachment.byte_size>0
               AND pg_catalog.octet_length(attachment.sha256)=32
               AND NOT EXISTS (
                    SELECT 1
                      FROM finance.expense_claim_lines prior_line
                      JOIN finance.expense_claims prior_claim
                        ON prior_claim.org_id=prior_line.org_id
                       AND prior_claim.id=prior_line.expense_claim_id
                     WHERE prior_line.org_id=attachment.org_id
                       AND prior_line.receipt_attachment_id=attachment.id
                       AND prior_claim.status NOT IN ('rejected','cancelled')
               )
             ORDER BY attachment.document_date DESC,attachment.id
            """
        ),
        {
            "org_id": context.organization_id,
            "branch_id": branch_id,
            "business_date": header_value["business_date"],
        },
    ).fetchall()
    accounts = [ExpenseClaimContextAccount(**dict(row._mapping)) for row in account_rows]
    return ExpenseClaimContext(
        **dict(header_value),
        currency_code="INR",
        tax_treatment="non_creditable_gross_expense",
        expense_accounts=[row for row in accounts if row.account_type == "expense"],
        reimbursement_accounts=[row for row in accounts if row.account_type == "liability"],
        receipts=[
            ExpenseClaimContextReceipt(**dict(row._mapping)) for row in receipt_rows
        ],
        unsupported_modes=[
            "partial_approval",
            "gst_input_tax_credit",
            "withholding",
            "foreign_currency",
            "mileage_or_per_diem",
            "cash_advance",
            "unverified_or_reused_receipt",
            "backdated_submission",
        ],
    )


@router.get(
    "/expense-claims/commands/{command_request_id}/review",
    response_model=PreparedResponse,
)
def expense_claim_review(
    command_request_id: UUID,
    user: dict = Depends(_web_user),
    db: Session = Depends(get_db),
) -> PreparedResponse:
    """Load one immutable expense preview for its distinct authorized reviewer."""

    context = _command_context(db, user, "automation.command.approve", command_request_id)
    row = db.execute(
        text(
            """
            SELECT command.id,command.operation,command.expires_at,command.preview_hash,
                   convert_from(command.preview_bytes,'UTF8')::jsonb AS preview
              FROM erp_automation_reads.reviewable_command(
                   :org_id, :command_request_id, :agent_grant_id, :client_id
              ) command
             WHERE command.id=:command_request_id
               AND command.capability_code='finance.expense_claim.prepare'
               AND command.operation='finance.expense_claim.post'
               AND command.approval_policy='separate_approver'
               AND command.status IN ('prepared','pending_approval','approved')
               AND command.expires_at>transaction_timestamp()
               AND command.requested_by_membership_id<>:membership_id
            """
        ),
        {
            "org_id": context.organization_id,
            "command_request_id": command_request_id,
            "membership_id": context.membership_id,
            "agent_grant_id": context.agent_grant_id,
            "client_id": context.client_id,
        },
    ).first()
    if row is None:
        raise HTTPException(
            status_code=404,
            detail=_detail(
                ActionErrorCode.SCOPE_DENIED,
                "No unexpired expense claim preview is available for independent approval",
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


@router.get(
    "/expense-claims/commands/{command_request_id}/readback",
    response_model=ExpenseClaimReadback,
)
def expense_claim_readback(
    command_request_id: UUID,
    user: dict = Depends(_web_user),
    db: Session = Depends(get_db),
    service: OperatorActionService = Depends(get_operator_action_service),
) -> ExpenseClaimReadback:
    """Reconcile the posted claim, verified receipts, balanced journal, and event."""

    context = _command_context(db, user, "automation.command.execute", command_request_id)
    try:
        row = service.get_expense_claim_readback(
            command_request_id=command_request_id,
            context=context,
        )
    except OperatorActionError as exc:
        _raise_action(exc)
    return ExpenseClaimReadback(**dict(row))


@router.get(
    "/inventory-destruction/commands/{command_request_id}/readback",
    response_model=InventoryDestructionReadback,
)
def inventory_destruction_readback(
    command_request_id: UUID,
    user: dict = Depends(_web_user),
    db: Session = Depends(get_db),
) -> InventoryDestructionReadback:
    """Reconcile certified evidence, exact stock/value issue, and loss journal."""

    context = _command_context(
        db, user, "automation.command.execute", command_request_id
    )
    return load_inventory_destruction_readback(
        command_request_id=command_request_id,
        db=db,
        org_id=context.organization_id,
        organization_scope=context.organization_scope,
        branch_ids=list(context.branch_ids),
    )


def load_inventory_destruction_readback(
    *,
    command_request_id: UUID,
    db: Session,
    org_id: UUID,
    organization_scope: bool,
    branch_ids: list[UUID],
) -> InventoryDestructionReadback:
    """Authoritative posted projection shared by REST and MCP transports."""

    rows = db.execute(
        text(
            """
            SELECT command.id AS command_request_id,
                   destruction.id AS destruction_id,
                   destruction.destruction_number,
                   destruction.status,
                   destruction.destruction_date,
                   destruction.method_code,
                   destruction.reason_code,
                   destruction.certificate_attachment_id,
                   destruction.itc_reversal_evidence_attachment_id,
                   destruction.physical_destruction_confirmed_at,
                   destruction.gst_registration_id,
                   destruction.gst_return_period_id,
                   destruction.gstr3b_return_id,
                   destruction.itc_reversal_rule_version_id,
                   reversal.id AS itc_reversal_event_id,
                   reversal.cgst_amount AS itc_reversal_cgst_amount,
                   reversal.sgst_amount AS itc_reversal_sgst_amount,
                   reversal.igst_amount AS itc_reversal_igst_amount,
                   reversal.cess_amount AS itc_reversal_cess_amount,
                   destruction.created_by_membership_id,
                   destruction.approved_by_membership_id,
                   destruction.posted_by_membership_id,
                   document.id AS inventory_document_id,
                   document.document_number AS inventory_document_number,
                   document.branch_id,
                   document.total_abs_base_quantity AS total_destroyed_base_quantity,
                   document.total_value AS total_destroyed_value,
                   journal.id AS journal_entry_id,
                   journal.status AS journal_status,
                   journal.transaction_debit_total AS journal_debit_total,
                   journal.transaction_credit_total AS journal_credit_total,
                   event.id AS accounting_event_id,
                   document_line.id AS inventory_document_line_id,
                   document_line.from_location_id AS location_id,
                   document_line.product_id,
                   document_line.batch_id,
                   document_line.base_quantity AS destroyed_base_quantity,
                   document_line.unit_cost,
                   document_line.extended_cost AS destroyed_value,
                   ledger.id AS ledger_entry_id,
                   ledger.quantity_delta AS ledger_quantity_delta,
                   ledger.value_delta AS ledger_value_delta,
                   balance.on_hand_quantity AS remaining_on_hand_quantity,
                   balance.inventory_value AS remaining_inventory_value
              FROM erp_automation_reads.command_authority_context(
                   :org_id, :command_request_id
              ) AS command
              JOIN compliance.destructions AS destruction
                ON destruction.org_id=:org_id
               AND destruction.id=command.target_resource_id
              JOIN inventory.inventory_documents AS document
                ON document.org_id=destruction.org_id
               AND document.id=destruction.inventory_document_id
               AND document.destruction_id=destruction.id
              JOIN tax.input_credit_reversal_events AS reversal
                ON reversal.org_id=destruction.org_id
               AND reversal.destruction_id=destruction.id
               AND reversal.status='posted'
              JOIN inventory.inventory_document_lines AS document_line
                ON document_line.org_id=document.org_id
               AND document_line.inventory_document_id=document.id
              JOIN inventory.stock_ledger_entries AS ledger
                ON ledger.org_id=document_line.org_id
               AND ledger.inventory_document_id=document.id
               AND ledger.inventory_document_line_id=document_line.id
               AND ledger.entry_kind='issue'
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
             WHERE command.id=:command_request_id
               AND command.capability_code='inventory.destruction.prepare'
               AND command.operation='compliance.destruction.post'
               AND command.status='succeeded'
               AND destruction.status='posted'
               AND document.status='posted'
               AND journal.status='posted'
               AND (:organization_scope
                    OR document.branch_id=ANY(CAST(:branch_ids AS uuid[])))
             ORDER BY document_line.line_number, document_line.id
            """
        ),
        {
            "org_id": org_id,
            "command_request_id": command_request_id,
            "organization_scope": organization_scope,
            "branch_ids": branch_ids,
        },
    ).fetchall()
    if not rows:
        raise HTTPException(
            status_code=409,
            detail=_detail(
                ActionErrorCode.POLICY_BLOCKED,
                "Posted destruction evidence, stock ledger, or loss journal is incomplete",
            ),
        )
    header = rows[0]._mapping
    values = [row._mapping for row in rows]
    applications = db.execute(
        text(
            """
            SELECT application.id AS input_credit_application_id,
                   lot.id AS input_credit_lot_id,lot.supplier_invoice_id,
                   lot.supplier_invoice_line_id,lot.goods_receipt_line_id,lot.batch_id,
                   application.applied_base_quantity,application.applied_cgst_amount,
                   application.applied_sgst_amount,application.applied_igst_amount,
                   application.applied_cess_amount,
                   lot.remaining_base_quantity AS remaining_lot_base_quantity,
                   lot.remaining_cgst_amount AS remaining_lot_cgst_amount,
                   lot.remaining_sgst_amount AS remaining_lot_sgst_amount,
                   lot.remaining_igst_amount AS remaining_lot_igst_amount,
                   lot.remaining_cess_amount AS remaining_lot_cess_amount
              FROM tax.input_credit_applications application
              JOIN tax.input_credit_lots lot
                ON lot.org_id=application.org_id AND lot.id=application.input_credit_lot_id
             WHERE application.org_id=:org_id AND application.destruction_id=:destruction_id
               AND application.reversal_event_id=:reversal_event_id
               AND application.application_kind='destruction_reversal'
               AND application.status='posted'
             ORDER BY lot.acquired_on,lot.supplier_invoice_id,lot.supplier_invoice_line_id,lot.id
            """
        ),
        {"org_id": org_id, "destruction_id": header["destruction_id"],
         "reversal_event_id": header["itc_reversal_event_id"]},
    ).fetchall()
    reversal_total = sum(
        (header[f"itc_reversal_{component}_amount"] for component in ("cgst", "sgst", "igst", "cess")),
        Decimal("0"),
    )
    if (
        any(
            row["ledger_quantity_delta"] != -row["destroyed_base_quantity"]
            or row["ledger_value_delta"] != -row["destroyed_value"]
            or row["remaining_on_hand_quantity"] != 0
            or row["remaining_inventory_value"] != 0
            for row in values
        )
        or sum((row["destroyed_base_quantity"] for row in values), Decimal("0"))
        != header["total_destroyed_base_quantity"]
        or sum((row["destroyed_value"] for row in values), Decimal("0"))
        != header["total_destroyed_value"]
        or not applications
        or sum((row._mapping["applied_base_quantity"] for row in applications), Decimal("0"))
        != header["total_destroyed_base_quantity"]
        or header["journal_debit_total"] != header["total_destroyed_value"] + reversal_total
        or header["journal_credit_total"] != header["total_destroyed_value"] + reversal_total
        or any(row["location_id"] != header["location_id"] for row in values)
    ):
        raise HTTPException(
            status_code=409,
            detail=_detail(
                ActionErrorCode.STALE_VERSION,
                "Posted destruction readback does not match its exact stock or valuation evidence",
            ),
        )
    return InventoryDestructionReadback(
        command_request_id=header["command_request_id"],
        destruction_id=header["destruction_id"],
        destruction_number=header["destruction_number"],
        status=header["status"],
        destruction_date=header["destruction_date"],
        method_code=header["method_code"],
        reason_code=header["reason_code"],
        certificate_attachment_id=header["certificate_attachment_id"],
        itc_reversal_evidence_attachment_id=header["itc_reversal_evidence_attachment_id"],
        physical_destruction_confirmed_at=header["physical_destruction_confirmed_at"],
        gst_registration_id=header["gst_registration_id"],
        gst_return_period_id=header["gst_return_period_id"],
        gstr3b_return_id=header["gstr3b_return_id"],
        itc_reversal_rule_version_id=header["itc_reversal_rule_version_id"],
        itc_reversal_event_id=header["itc_reversal_event_id"],
        itc_reversal_cgst_amount=header["itc_reversal_cgst_amount"],
        itc_reversal_sgst_amount=header["itc_reversal_sgst_amount"],
        itc_reversal_igst_amount=header["itc_reversal_igst_amount"],
        itc_reversal_cess_amount=header["itc_reversal_cess_amount"],
        created_by_membership_id=header["created_by_membership_id"],
        approved_by_membership_id=header["approved_by_membership_id"],
        posted_by_membership_id=header["posted_by_membership_id"],
        inventory_document_id=header["inventory_document_id"],
        inventory_document_number=header["inventory_document_number"],
        branch_id=header["branch_id"],
        location_id=header["location_id"],
        total_destroyed_base_quantity=header["total_destroyed_base_quantity"],
        total_destroyed_value=header["total_destroyed_value"],
        journal_entry_id=header["journal_entry_id"],
        journal_status=header["journal_status"],
        journal_debit_total=header["journal_debit_total"],
        journal_credit_total=header["journal_credit_total"],
        accounting_event_id=header["accounting_event_id"],
        lines=[
            InventoryDestructionReadbackLine(
                inventory_document_line_id=row["inventory_document_line_id"],
                product_id=row["product_id"],
                batch_id=row["batch_id"],
                destroyed_base_quantity=row["destroyed_base_quantity"],
                unit_cost=row["unit_cost"],
                destroyed_value=row["destroyed_value"],
                ledger_entry_id=row["ledger_entry_id"],
                ledger_quantity_delta=row["ledger_quantity_delta"],
                ledger_value_delta=row["ledger_value_delta"],
                remaining_on_hand_quantity=row["remaining_on_hand_quantity"],
                remaining_inventory_value=row["remaining_inventory_value"],
            )
            for row in values
        ],
        input_credit_applications=[
            InventoryDestructionItcApplicationReadback(**dict(row._mapping))
            for row in applications
        ],
    )


@router.get(
    "/bank-reconciliation/commands/{command_request_id}/readback",
    response_model=BankReconciliationReadback,
)
def bank_reconciliation_readback(
    command_request_id: UUID,
    user: dict = Depends(_web_user),
    db: Session = Depends(get_db),
    service: OperatorActionService = Depends(get_operator_action_service),
) -> BankReconciliationReadback:
    """Return the exact immutable statement/journal match and its provenance."""

    operation = "automation.command.status.get"
    _ready(service, operation)
    context = _command_context(db, user, operation, command_request_id)
    try:
        row = service.get_bank_reconciliation_readback(
            command_request_id=command_request_id,
            context=context,
        )
    except OperatorActionError as exc:
        _raise_action(exc)
    return BankReconciliationReadback(**row)


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


def _review_response(review) -> CommandReviewResponse:
    values = dict(review.__dict__)
    for name in (
        "resolved_references", "source_versions", "calculation_ruleset",
        "inventory_impact", "financial_impact", "tax_impact",
        "policy_warnings", "required_approvals",
    ):
        values[name] = [dict(item) for item in values[name]]
    return CommandReviewResponse(**values)


@router.get(
    "/inventory-adjustment/commands/{command_request_id}/review",
    response_model=CommandReviewResponse,
    include_in_schema=False,
)
@router.get(
    "/commands/{command_request_id}/review",
    response_model=CommandReviewResponse,
)
def command_review(
    command_request_id: UUID,
    user: dict = Depends(_web_user),
    db: Session = Depends(get_db),
    service: OperatorActionService = Depends(get_operator_action_service),
) -> CommandReviewResponse:
    """Load exact immutable preview bytes using the reviewer's approval grant."""

    operation = "automation.command.approve"
    _ready(service, operation)
    context = _command_context(
        db, user, operation, command_request_id
    )
    try:
        review = service.review(
            command_request_id=command_request_id,
            context=context,
        )
    except OperatorActionError as exc:
        _raise_action(exc)
    return _review_response(review)


# Kept as a direct callable for existing first-party tests and imports; the
# public route above is the canonical endpoint for every available command.
inventory_adjustment_review = command_review


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


@router.get("/commands/{command_request_id}", response_model=ExecutionResponse)
def get_command_status(
    command_request_id: UUID,
    user: dict = Depends(_web_user),
    db: Session = Depends(get_db),
    service: OperatorActionService = Depends(get_operator_action_service),
) -> ExecutionResponse:
    """GET-only recovery after an ambiguous execute response; never retries a write."""

    operation = "automation.command.status.get"
    _ready(service, operation)
    context = _command_context(db, user, operation, command_request_id)
    try:
        result = service.get_status(
            command_request_id=command_request_id,
            context=context,
        )
    except OperatorActionError as exc:
        _raise_action(exc)
    return ExecutionResponse(**result.__dict__)
