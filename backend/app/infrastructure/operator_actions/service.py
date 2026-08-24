"""Fail-closed SQLAlchemy implementation of canonical operator actions."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import hashlib
import json
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ...core.database import SessionLocal
from ...domain.operator_actions.contract import ActionPolicy
from ...domain.operator_actions.models import (
    ActionContext,
    ActionErrorCode,
    CommandExecution,
    CommandState,
    OperatorActionError,
    PreparedCommand,
)
from ...domain.operator_actions.service import install_operator_action_service
from .registry import ACTION_ADAPTER_BINDINGS, ActionAdapterBinding
from .calculator_database import (
    calculator_database_configured,
    calculator_session_factory,
)
from .sales_order import (
    PERSIST_SALES_ORDER_SQL,
    RESOLVE_SALES_ORDER_SQL,
    calculation_documents,
    canonical_json_bytes,
)
from .sales_dispatch import (
    PERSIST_SALES_DISPATCH_SQL,
    RESOLVE_SALES_DISPATCH_SQL,
    dispatch_preview,
)
from .sales_invoice import (
    PERSIST_SALES_INVOICE_SQL,
    RESOLVE_SALES_INVOICE_SQL,
    calculation_documents as sales_invoice_calculation_documents,
)
from .purchase_order import (
    PERSIST_PURCHASE_ORDER_SQL,
    RESOLVE_PURCHASE_ORDER_SQL,
    calculation_documents as purchase_order_calculation_documents,
)
from .goods_receipt import (
    PERSIST_GOODS_RECEIPT_SQL,
    RESOLVE_GOODS_RECEIPT_SQL,
)
from .supplier_invoice import (
    PERSIST_SUPPLIER_INVOICE_SQL,
    RESOLVE_SUPPLIER_INVOICE_SQL,
    calculation_documents as supplier_invoice_calculation_documents,
)
from .sales_return import (
    PERSIST_SALES_RETURN_SQL,
    RESOLVE_SALES_RETURN_SQL,
    calculation_documents as sales_return_calculation_documents,
)
from .purchase_return import (
    PERSIST_PURCHASE_RETURN_SQL,
    RESOLVE_PURCHASE_RETURN_SQL,
    calculation_documents as purchase_return_calculation_documents,
)
from .customer_receipt import (
    PERSIST_CUSTOMER_RECEIPT_SQL,
    RESOLVE_CUSTOMER_RECEIPT_SQL,
)
from .supplier_advance import (
    PERSIST_SUPPLIER_ADVANCE_SQL,
    RESOLVE_SUPPLIER_ADVANCE_SQL,
)
from .supplier_payment import (
    PERSIST_SUPPLIER_PAYMENT_SQL,
    RESOLVE_SUPPLIER_PAYMENT_SQL,
)
from .inventory_adjustment import (
    PERSIST_INVENTORY_ADJUSTMENT_SQL,
    RESOLVE_INVENTORY_ADJUSTMENT_SQL,
)
from .runtime_database import (
    assert_runtime_principal,
    runtime_database_configured,
)


_ACTIVATE_CONTEXT_SQL = text(
    "SELECT erp_security.activate_context(:auth_user_id, :org_id)"
)

_DEPLOYMENT_READINESS_SQL = text(
    """
    SELECT
      (SELECT count(*)=110
         FROM pg_catalog.pg_class relation
         JOIN pg_catalog.pg_namespace namespace
           ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname IN (
              'core','parties','catalog','hr','inventory','sales',
              'procurement','finance','tax','compliance','automation','calculation'
            )
          AND relation.relkind='r')
      AND pg_catalog.to_regprocedure(
            'erp_security.activate_context(uuid,uuid)'
          ) IS NOT NULL
      AND EXISTS (
            SELECT 1
              FROM pg_catalog.pg_proc procedure
              JOIN pg_catalog.pg_namespace namespace
                ON namespace.oid=procedure.pronamespace
             WHERE namespace.nspname='erp_automation_commands'
               AND procedure.proname='prepare_operator_command'
          )
      AS ready
    """
)

_AUTHORIZE_SQL = text(
    """
    SELECT grant_row.branch_id
      FROM automation.agent_grants AS grant_row
      JOIN automation.agent_grant_capabilities AS capability
        ON capability.org_id=grant_row.org_id
       AND capability.agent_grant_id=grant_row.id
      JOIN core.memberships AS membership
        ON membership.org_id=grant_row.org_id
       AND membership.id=grant_row.subject_membership_id
      JOIN core.users AS user_row ON user_row.id=membership.user_id
      JOIN core.organizations AS organization ON organization.id=grant_row.org_id
     WHERE grant_row.org_id=:org_id
       AND grant_row.id=:agent_grant_id
       AND grant_row.subject_membership_id=:membership_id
       AND grant_row.client_id=:client_id
       AND grant_row.status='active'
       AND grant_row.expires_at>transaction_timestamp()
       AND membership.user_id=:user_id
       AND membership.status='active'
       AND user_row.auth_user_id=:auth_user_id
       AND user_row.status='active'
       AND organization.status='active'
       AND capability.capability_code=:operation_key
       AND capability.operation_mode=:operation_mode
       AND capability.risk_class=:risk_class
       AND capability.approval_policy=:approval_policy
       AND capability.status='active'
       AND EXISTS (
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
              AND access_grant.membership_id=grant_row.subject_membership_id
              AND access_grant.status='active'
              AND access_grant.valid_from_at<=transaction_timestamp()
              AND (access_grant.expires_at IS NULL
                   OR access_grant.expires_at>transaction_timestamp())
              AND ((grant_row.branch_id IS NULL
                    AND access_grant.scope_kind='organization'
                    AND access_grant.branch_id IS NULL)
                   OR (grant_row.branch_id IS NOT NULL
                       AND access_grant.scope_kind='branch'
                       AND access_grant.branch_id=grant_row.branch_id))
              AND role.status='active'
              AND permission.status='active'
              AND permission.code=:permission_code
       )
     LIMIT 2
    """
)

_COMMAND_STATUS_SQL = text(
    """
    SELECT request.id, request.operation, request.status, request.preview_hash,
           request.expires_at, request.completed_at,
           request.result_resource_type, request.result_resource_id,
           request.failure_code, request.failure_message,
           approval.approved_at
      FROM automation.command_requests AS request
      LEFT JOIN LATERAL (
          SELECT max(decided_at) AS approved_at
            FROM automation.command_approvals
           WHERE org_id=request.org_id
             AND command_request_id=request.id
             AND decision='approved'
             AND preview_hash=request.preview_hash
             AND aggregate_version_hash=request.aggregate_version_hash
      ) AS approval ON true
     WHERE request.org_id=:org_id
       AND request.id=:command_request_id
       AND request.agent_grant_id=:agent_grant_id
       AND request.requested_by_membership_id=:membership_id
     FOR SHARE OF request
    """
)

_COMMAND_AUDIT_SQL = text(
    """
    SELECT id, chain_sequence, occurred_at, event_type, resource_type,
           resource_id, mutation_kind, evidence_hash
      FROM core.audit_events
     WHERE org_id=:org_id AND command_request_id=:command_request_id
     ORDER BY chain_sequence, id
    """
)

_SET_REQUEST_CONTEXT_SQL = text(
    "SELECT pg_catalog.set_config('app.request_id', :request_id, true)"
)

_PREPARE_IDEMPOTENCY_LOCK_SQL = text(
    """
    SELECT pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            CAST(:org_id AS text) || ':' ||
            CAST(:agent_grant_id AS text) || ':' ||
            :operation || ':' ||
            pg_catalog.encode(:idempotency_key_hash, 'hex'),
            0
        )
    )
    """
)

_APPROVE_COMMAND_SQL = text(
    """
    SELECT erp_automation_commands.approve_operator_command(
        :org_id, :command_request_id, :approval_id, :preview_hash,
        :idempotency_key_hash,
        LEAST(
            (SELECT expires_at FROM automation.command_requests
              WHERE org_id=:org_id AND id=:command_request_id),
            transaction_timestamp() + interval '15 minutes'
        )
    ) AS command_request_id
    """
)

_APPROVAL_RESULT_SQL = text(
    """
    SELECT request.operation, request.status, request.preview_hash,
           request.result_resource_type, request.result_resource_id,
           approval.id AS approval_id, approval.decided_at
      FROM automation.command_requests AS request
      JOIN automation.command_approvals AS approval
        ON approval.org_id=request.org_id
       AND approval.command_request_id=request.id
     WHERE request.org_id=:org_id
       AND request.id=:command_request_id
       AND approval.approver_membership_id=:membership_id
       AND approval.idempotency_key_hash=:idempotency_key_hash
       AND approval.decision='approved'
       AND approval.preview_hash=request.preview_hash
     FOR SHARE OF request
    """
)

_EXECUTION_SNAPSHOT_SQL = text(
    """
    SELECT request.operation, request.status, request.preview_hash,
           request.result_resource_type, request.result_resource_id,
           request.completed_at
      FROM automation.command_requests AS request
     WHERE request.org_id=:org_id
       AND request.id=:command_request_id
       AND request.agent_grant_id=:agent_grant_id
       AND request.requested_by_membership_id=:membership_id
     FOR UPDATE
    """
)

_SET_COMMAND_CONTEXT_SQL = text(
    "SELECT pg_catalog.set_config("
    "'app.command_request_id', CAST(:command_request_id AS text), true)"
)

_EXECUTE_COMMAND_SQL = text(
    """
    SELECT erp_automation_commands.execute_approved_command(
        :org_id, :command_request_id
    ) AS response_bytes
    """
)


def _mapping_rows(result: Any) -> list[Mapping[str, Any]]:
    return list(result.mappings().all())


def _hash_string(value: Any) -> str:
    if isinstance(value, memoryview):
        value = value.tobytes()
    if isinstance(value, bytes) and len(value) == 32:
        return "sha256:" + value.hex()
    if (
        isinstance(value, str)
        and value.startswith("sha256:")
        and len(value) == 71
        and all(character in "0123456789abcdef" for character in value[7:])
    ):
        return value
    raise OperatorActionError(
        ActionErrorCode.POLICY_BLOCKED,
        "Canonical command contains an invalid preview hash",
        metadata={"reason": "INVALID_CANONICAL_PREVIEW_HASH"},
    )


def _preview_hash_bytes(value: str) -> bytes:
    prefix, separator, encoded = value.partition(":")
    if prefix != "sha256" or separator != ":" or len(encoded) != 64:
        raise OperatorActionError(
            ActionErrorCode.PREVIEW_CHANGED,
            "Preview hash is invalid",
        )
    try:
        decoded = bytes.fromhex(encoded)
    except ValueError as exc:
        raise OperatorActionError(
            ActionErrorCode.PREVIEW_CHANGED,
            "Preview hash is invalid",
        ) from exc
    return decoded


def _json_value(value: Any) -> Any:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, memoryview):
        return value.tobytes().hex()
    if isinstance(value, bytes):
        return value.hex()
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def _json_document(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        document = json.loads(value)
        if isinstance(document, dict):
            return document
    raise OperatorActionError(
        ActionErrorCode.POLICY_BLOCKED,
        "Canonical resolver returned an invalid document",
    )


def _lock_prepare_idempotency(
    session: Session,
    params: Mapping[str, Any],
    operation: str,
) -> None:
    """Serialize an exact prepare key before any draft rows are written."""
    session.execute(
        _PREPARE_IDEMPOTENCY_LOCK_SQL,
        {
            "org_id": params["org_id"],
            "agent_grant_id": params["agent_grant_id"],
            "operation": operation,
            "idempotency_key_hash": params["idempotency_key_hash"],
        },
    )


_DATABASE_ACTION_FAILURES: dict[str, tuple[ActionErrorCode, str, bool]] = {
    "21000": (
        ActionErrorCode.AMBIGUOUS_REFERENCE,
        "Canonical reference resolution is ambiguous",
        False,
    ),
    "22023": (
        ActionErrorCode.VALIDATION_FAILED,
        "Canonical command input is invalid",
        False,
    ),
    "22P02": (
        ActionErrorCode.VALIDATION_FAILED,
        "Canonical command input is invalid",
        False,
    ),
    "23502": (
        ActionErrorCode.VALIDATION_FAILED,
        "Canonical command input is incomplete",
        False,
    ),
    "23503": (
        ActionErrorCode.VALIDATION_FAILED,
        "Canonical command references an unavailable resource",
        False,
    ),
    "23505": (
        ActionErrorCode.IDEMPOTENCY_CONFLICT,
        "Canonical command conflicts with an existing idempotent request",
        False,
    ),
    "23514": (
        ActionErrorCode.VALIDATION_FAILED,
        "Canonical command violates a reviewed business rule",
        False,
    ),
    "40001": (
        ActionErrorCode.STALE_VERSION,
        "Canonical source facts changed; refresh and review again",
        True,
    ),
    "42501": (
        ActionErrorCode.SCOPE_DENIED,
        "Canonical command authority is insufficient",
        False,
    ),
    "55000": (
        ActionErrorCode.POLICY_BLOCKED,
        "Canonical command is not eligible in its current state",
        False,
    ),
    "0A000": (
        ActionErrorCode.POLICY_BLOCKED,
        "Canonical command is outside the reviewed product scope",
        False,
    ),
    "P0002": (
        ActionErrorCode.VALIDATION_FAILED,
        "Canonical command references a resource that is no longer available",
        False,
    ),
}


def _database_action_error(
    exc: DBAPIError, operation_key: str
) -> OperatorActionError | None:
    """Translate reviewed PostgreSQL business states without leaking DB detail."""
    original = exc.orig
    sqlstate = getattr(original, "sqlstate", None) or getattr(
        original, "pgcode", None
    )
    if not isinstance(sqlstate, str) or sqlstate not in _DATABASE_ACTION_FAILURES:
        return None

    diagnostic = getattr(original, "diag", None)
    primary = str(getattr(diagnostic, "message_primary", "") or "").lower()
    code, message, retryable = _DATABASE_ACTION_FAILURES[sqlstate]
    reason = "CANONICAL_DATABASE_POLICY_REJECTED"
    if "follow fefo" in primary:
        code = ActionErrorCode.BATCH_BLOCKED
        message = "Selected batches do not follow FEFO; refresh and use the earliest eligible batch"
        reason = "FEFO_ALLOCATION_REQUIRED"
    elif "exceeds locked stock" in primary or "exceeds locked on-hand stock" in primary:
        code = ActionErrorCode.INSUFFICIENT_STOCK
        message = "Selected batch stock is no longer sufficient; refresh available stock"
        reason = "INSUFFICIENT_LOCKED_STOCK"

    return OperatorActionError(
        code,
        message,
        retryable=retryable,
        metadata={
            "operation_key": operation_key,
            "reason": reason,
            "sqlstate": sqlstate,
        },
    )


class SqlAlchemyOperatorActionService:
    """Use only reviewed canonical facts/functions and one transaction per call."""

    def __init__(
        self,
        session_factory: Callable[[], Session] = SessionLocal,
        *,
        calculator_factory: Callable[[], Session] | None = None,
        runtime_principal_configured: bool | None = None,
        bindings: Mapping[str, ActionAdapterBinding] = ACTION_ADAPTER_BINDINGS,
    ) -> None:
        self._session_factory = session_factory
        self._calculator_factory = calculator_factory
        self._runtime_principal_configured = (
            runtime_database_configured()
            if runtime_principal_configured is None
            else runtime_principal_configured
        )
        self._bindings = dict(bindings)

    def deployment_readiness(self) -> bool:
        if not self._runtime_principal_configured:
            return False
        try:
            with self._session_factory() as session:
                with session.begin():
                    assert_runtime_principal(session)
                    row = session.execute(_DEPLOYMENT_READINESS_SQL).mappings().one()
                    return row["ready"] is True
        except Exception:
            return False

    def adapter_readiness(self) -> Mapping[str, bool]:
        readiness = {
            key: binding.available and self._runtime_principal_configured
            for key, binding in self._bindings.items()
        }
        calculator_ready = (
            self._calculator_factory is not None or calculator_database_configured()
        )
        for operation_key in (
            "sales.order.prepare",
            "sales.invoice.prepare",
            "procurement.purchase_order.prepare",
            "procurement.supplier_invoice.prepare",
            "sales.return.prepare",
            "procurement.purchase_return.prepare",
        ):
            readiness[operation_key] = (
                self._bindings[operation_key].available
                and self._runtime_principal_configured
                and calculator_ready
            )
        return readiness

    def _unavailable(self, operation_key: str) -> None:
        binding = self._bindings.get(operation_key)
        raise OperatorActionError(
            ActionErrorCode.POLICY_BLOCKED,
            "Canonical command adapter is not registered",
            metadata={
                "operation_key": operation_key,
                "reason": "COMMAND_ADAPTER_UNAVAILABLE",
                "coverage_reason": (
                    binding.unavailable_reason
                    if binding is not None
                    else "Operation is absent from the reviewed adapter registry"
                ),
            },
        )

    def prepare(
        self,
        *,
        policy: ActionPolicy,
        payload: Mapping[str, Any],
        idempotency_key: str,
        context: ActionContext,
    ) -> PreparedCommand:
        try:
            return self._prepare(
                policy=policy,
                payload=payload,
                idempotency_key=idempotency_key,
                context=context,
            )
        except DBAPIError as exc:
            translated = _database_action_error(exc, policy.operation_key)
            if translated is None:
                raise
            raise translated from exc

    def _prepare(
        self,
        *,
        policy: ActionPolicy,
        payload: Mapping[str, Any],
        idempotency_key: str,
        context: ActionContext,
    ) -> PreparedCommand:
        if policy.operation_key == "sales.dispatch.prepare":
            return self._prepare_sales_dispatch(
                policy=policy,
                payload=payload,
                idempotency_key=idempotency_key,
                context=context,
            )
        if policy.operation_key == "sales.invoice.prepare":
            return self._prepare_sales_invoice(
                policy=policy,
                payload=payload,
                idempotency_key=idempotency_key,
                context=context,
            )
        if policy.operation_key == "sales.return.prepare":
            return self._prepare_sales_return(
                policy=policy,
                payload=payload,
                idempotency_key=idempotency_key,
                context=context,
            )
        if policy.operation_key == "procurement.purchase_order.prepare":
            return self._prepare_purchase_order(
                policy=policy,
                payload=payload,
                idempotency_key=idempotency_key,
                context=context,
            )
        if policy.operation_key == "procurement.goods_receipt.prepare":
            return self._prepare_goods_receipt(
                policy=policy,
                payload=payload,
                idempotency_key=idempotency_key,
                context=context,
            )
        if policy.operation_key == "procurement.supplier_invoice.prepare":
            return self._prepare_supplier_invoice(
                policy=policy,
                payload=payload,
                idempotency_key=idempotency_key,
                context=context,
            )
        if policy.operation_key == "procurement.purchase_return.prepare":
            return self._prepare_purchase_return(
                policy=policy,
                payload=payload,
                idempotency_key=idempotency_key,
                context=context,
            )
        if policy.operation_key == "finance.customer_receipt.prepare":
            return self._prepare_customer_receipt(
                policy=policy,
                payload=payload,
                idempotency_key=idempotency_key,
                context=context,
            )
        if policy.operation_key == "finance.supplier_payment.prepare":
            return self._prepare_supplier_payment(
                policy=policy,
                payload=payload,
                idempotency_key=idempotency_key,
                context=context,
            )
        if policy.operation_key == "finance.supplier_advance.prepare":
            return self._prepare_supplier_advance(
                policy=policy,
                payload=payload,
                idempotency_key=idempotency_key,
                context=context,
            )
        if policy.operation_key == "inventory.adjustment.prepare":
            return self._prepare_inventory_adjustment(
                policy=policy,
                payload=payload,
                idempotency_key=idempotency_key,
                context=context,
            )
        if policy.operation_key != "sales.order.prepare":
            self._unavailable(policy.operation_key)
        if not self.adapter_readiness()[policy.operation_key]:
            raise OperatorActionError(
                ActionErrorCode.POLICY_BLOCKED,
                "Isolated calculation authority is not configured",
                metadata={
                    "operation_key": policy.operation_key,
                    "reason": "CALCULATOR_DATABASE_UNAVAILABLE",
                },
            )
        identity = (
            f"aasopharma:{context.organization_id}:{context.membership_id}:"
            f"sales.order.prepare:{idempotency_key}"
        )
        order_id = uuid5(NAMESPACE_URL, identity + ":order")
        command_id = uuid5(NAMESPACE_URL, identity + ":command")
        artifact_id = uuid5(NAMESPACE_URL, identity + ":artifact")
        request_id = uuid5(NAMESPACE_URL, identity + ":request")
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
        normalized = {key: _json_value(value) for key, value in payload.items()}
        normalized["lines"] = [
            {
                **{key: _json_value(value) for key, value in dict(line).items()},
                "line_id": str(uuid5(NAMESPACE_URL, identity + f":line:{index}")),
            }
            for index, line in enumerate(payload["lines"], start=1)
        ]
        normalized["charge_lines"] = [
            {
                **{key: _json_value(value) for key, value in dict(line).items()},
                "line_id": str(
                    uuid5(NAMESPACE_URL, identity + f":charge-line:{index}")
                ),
            }
            for index, line in enumerate(payload.get("charge_lines") or (), start=1)
        ]
        request_bytes = canonical_json_bytes(normalized)
        key_hash = hashlib.sha256(idempotency_key.encode("utf-8")).digest()
        sequence_key_hash = hashlib.sha256(
            (idempotency_key + ":document-sequence").encode("utf-8")
        ).digest()
        params = {
            "org_id": context.organization_id,
            "membership_id": context.membership_id,
            "auth_user_id": context.auth_user_id,
            "user_id": context.user_id,
            "agent_grant_id": context.agent_grant_id,
            "client_id": context.client_id,
            "request_json": request_bytes.decode("utf-8"),
            "order_id": order_id,
            "command_request_id": command_id,
            "artifact_id": artifact_id,
            "request_id": request_id,
            "idempotency_key_hash": key_hash,
            "sequence_key_hash": sequence_key_hash,
            "request_bytes": request_bytes,
            "expires_at": expires_at,
        }
        factory = self._calculator_factory or calculator_session_factory()
        with factory() as session:
            with session.begin():
                _lock_prepare_idempotency(session, params, "sales.order.prepare")
                rows = _mapping_rows(session.execute(RESOLVE_SALES_ORDER_SQL, params))
                if len(rows) != 1:
                    raise OperatorActionError(
                        ActionErrorCode.POLICY_BLOCKED,
                        "Canonical sales-order resolution is unavailable",
                    )
                resolution = _json_document(rows[0]["resolution"])
                try:
                    calculation_input, calculation_output = calculation_documents(
                        normalized, resolution, order_id=order_id
                    )
                except (TypeError, ValueError) as exc:
                    raise OperatorActionError(
                        ActionErrorCode.VALIDATION_FAILED,
                        "Sales-order commercial calculation input is invalid",
                        metadata={"reason": str(exc)},
                    ) from exc
                request_hash = hashlib.sha256(request_bytes).hexdigest()
                resolved_references = (
                    {"resource_type": "branch", "id": resolution["branch_id"]},
                    {
                        "resource_type": "customer_account",
                        "id": resolution["customer_account_id"],
                    },
                    {
                        "resource_type": "billing_address",
                        "id": resolution["billing_address_id"],
                    },
                    {
                        "resource_type": "shipping_address",
                        "id": resolution["shipping_address_id"],
                    },
                ) + (
                    (
                        {
                            "resource_type": "customer_tax_registration",
                            "id": resolution["customer_tax_registration_id"],
                        },
                    )
                    if resolution.get("customer_tax_registration_id")
                    else ()
                ) + tuple(
                    {
                        "resource_type": (
                            "product_uom_tax"
                            if line["line_kind"] == "product"
                            else "commercial_charge_tax_profile"
                        ),
                        **(
                            {
                                "product_id": line["product_id"],
                                "uom_conversion_id": line["uom_conversion_id"],
                            }
                            if line["line_kind"] == "product"
                            else {
                                "charge_code": line["charge_code"],
                                "charge_tax_profile_id": line[
                                    "charge_tax_profile_id"
                                ],
                            }
                        ),
                        "tax_code_version_id": line["tax_code_version_id"],
                        "tax_release_id": line["tax_release_id"],
                    }
                    for line in resolution["lines"]
                )
                source_versions = (
                    {
                        "resource_type": "branch",
                        "id": resolution["branch_id"],
                        "row_version": resolution["branch_row_version"],
                    },
                    {
                        "resource_type": "customer_account",
                        "id": resolution["customer_account_id"],
                        "row_version": resolution["customer_account_row_version"],
                    },
                    {
                        "resource_type": "billing_address",
                        "id": resolution["billing_address_id"],
                        "row_version": resolution["billing_address_row_version"],
                    },
                    {
                        "resource_type": "shipping_address",
                        "id": resolution["shipping_address_id"],
                        "row_version": resolution["shipping_address_row_version"],
                    },
                ) + (
                    (
                        {
                            "resource_type": "customer_tax_registration",
                            "id": resolution["customer_tax_registration_id"],
                            "row_version": resolution[
                                "customer_tax_registration_row_version"
                            ],
                            "taxpayer_type": resolution["customer_taxpayer_type"],
                        },
                    )
                    if resolution.get("customer_tax_registration_id")
                    else ()
                ) + tuple(
                    {
                        "resource_type": line["line_kind"],
                        **(
                            {
                                "id": line["product_id"],
                                "row_version": line["product_row_version"],
                                "uom_conversion_id": line["uom_conversion_id"],
                                "uom_valid_from": line["uom_valid_from"],
                                "uom_valid_until": line["uom_valid_until"],
                            }
                            if line["line_kind"] == "product"
                            else {
                                "id": line["charge_tax_profile_id"],
                                "row_version": line[
                                    "charge_tax_profile_row_version"
                                ],
                                "charge_code": line["charge_code"],
                                "effective_from": line[
                                    "charge_tax_profile_effective_from"
                                ],
                                "effective_to": line[
                                    "charge_tax_profile_effective_to"
                                ],
                            }
                        ),
                        "tax_code_version_id": line["tax_code_version_id"],
                        "tax_version_number": line["tax_version_number"],
                        "tax_effective_from": line["tax_effective_from"],
                        "tax_effective_to": line["tax_effective_to"],
                        "tax_release_id": line["tax_release_id"],
                        "tax_release_ruleset_version": line[
                            "tax_release_ruleset_version"
                        ],
                    }
                    for line in resolution["lines"]
                )
                totals = calculation_output["totals"]
                preview = {
                    "branch_id": resolution["branch_id"],
                    "calculation_artifact_id": str(artifact_id),
                    "calculation_hash": None,
                    "calculation_ruleset": [
                        {
                            "engine_version": calculation_output["engine_version"],
                            "ruleset_version": calculation_output["ruleset_version"],
                        }
                    ],
                    "capability_code": "sales.order.prepare",
                    "command_request_id": str(command_id),
                    "destination_branch_id": None,
                    "supply_type": resolution["supply_type"],
                    "zero_rated_payment_mode": resolution[
                        "zero_rated_payment_mode"
                    ],
                    "financial_impact": [
                        {"currency_code": "INR", "grand_total": totals["grand_total"]}
                    ],
                    "inventory_impact": [],
                    "operation": "sales.order.approve",
                    "organization_id": str(context.organization_id),
                    "request_hash": request_hash,
                    "resolved_references": list(resolved_references),
                    "source_versions": list(source_versions),
                    "target_resource_id": str(order_id),
                    "target_resource_type": "sales_order",
                    "tax_impact": [
                        {
                            "cgst_total": totals["cgst_total"],
                            "sgst_total": totals["sgst_total"],
                            "igst_total": totals["igst_total"],
                            "cess_total": totals["cess_total"],
                        }
                    ],
                }
                preview_bytes = canonical_json_bytes(preview)
                params.update(
                    {
                        "resolved_bytes": canonical_json_bytes(resolution),
                        "preview_bytes": preview_bytes,
                        "calculation_input_bytes": canonical_json_bytes(calculation_input),
                        "calculation_output_bytes": canonical_json_bytes(calculation_output),
                    }
                )
                persisted = _mapping_rows(session.execute(PERSIST_SALES_ORDER_SQL, params))
                if len(persisted) != 1:
                    raise OperatorActionError(
                        ActionErrorCode.POLICY_BLOCKED,
                        "Canonical sales-order prepare did not persist exactly once",
                    )
                persisted_result = _json_document(persisted[0]["command_request_id"])
                if UUID(str(persisted_result["command_request_id"])) != command_id:
                    raise OperatorActionError(
                        ActionErrorCode.IDEMPOTENCY_CONFLICT,
                        "Canonical sales-order idempotency replay differs",
                    )
                persisted_expiry = datetime.fromisoformat(
                    str(persisted_result["expires_at"]).replace("Z", "+00:00")
                )
                return PreparedCommand(
                    command_request_id=command_id,
                    command_type="sales.order.approve",
                    preview_hash="sha256:" + str(persisted_result["preview_hash"]),
                    expires_at=persisted_expiry,
                    resolved_references=resolved_references,
                    source_versions=source_versions,
                    calculation_ruleset=tuple(preview["calculation_ruleset"]),
                    inventory_impact=(),
                    financial_impact=tuple(preview["financial_impact"]),
                    tax_impact=tuple(preview["tax_impact"]),
                    required_approvals=(
                        {"policy": policy.approval_policy, "count": 1},
                    ),
                )

    def _prepare_supplier_invoice(
        self,
        *,
        policy: ActionPolicy,
        payload: Mapping[str, Any],
        idempotency_key: str,
        context: ActionContext,
    ) -> PreparedCommand:
        if not self.adapter_readiness()[policy.operation_key]:
            raise OperatorActionError(
                ActionErrorCode.POLICY_BLOCKED,
                "Isolated calculation authority is not configured",
                metadata={
                    "operation_key": policy.operation_key,
                    "reason": "CALCULATOR_DATABASE_UNAVAILABLE",
                },
            )
        identity = (
            f"aasopharma:{context.organization_id}:{context.membership_id}:"
            f"procurement.supplier_invoice.prepare:{idempotency_key}"
        )
        supplier_invoice_id = uuid5(NAMESPACE_URL, identity + ":supplier-invoice")
        command_id = uuid5(NAMESPACE_URL, identity + ":command")
        artifact_id = uuid5(NAMESPACE_URL, identity + ":artifact")
        request_id = uuid5(NAMESPACE_URL, identity + ":request")
        tax_document_id = uuid5(NAMESPACE_URL, identity + ":tax-document")
        journal_id = uuid5(NAMESPACE_URL, identity + ":journal")
        event_id = uuid5(NAMESPACE_URL, identity + ":accounting-event")
        open_item_id = uuid5(NAMESPACE_URL, identity + ":open-item")
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
        normalized = {key: _json_value(value) for key, value in payload.items()}
        normalized.update(
            {
                "supplier_invoice_id": str(supplier_invoice_id),
                "tax_document_id": str(tax_document_id),
                "journal_id": str(journal_id),
                "event_id": str(event_id),
                "open_item_id": str(open_item_id),
            }
        )
        normalized_lines = []
        for line_index, source_line in enumerate(payload["lines"], start=1):
            line = {
                key: _json_value(value) for key, value in dict(source_line).items()
            }
            line["line_id"] = str(
                uuid5(NAMESPACE_URL, identity + f":line:{line_index}")
            )
            line["allocation_id"] = str(
                uuid5(NAMESPACE_URL, identity + f":line:{line_index}:receipt")
            )
            normalized_lines.append(line)
        normalized["lines"] = normalized_lines
        normalized["expense_charge_lines"] = [
            {
                **{key: _json_value(value) for key, value in dict(line).items()},
                "line_id": str(
                    uuid5(NAMESPACE_URL, identity + f":charge-line:{index}")
                ),
            }
            for index, line in enumerate(
                payload.get("expense_charge_lines") or (), start=1
            )
        ]
        request_bytes = canonical_json_bytes(normalized)
        request_hash = hashlib.sha256(request_bytes).hexdigest()
        params = {
            "org_id": context.organization_id,
            "membership_id": context.membership_id,
            "auth_user_id": context.auth_user_id,
            "user_id": context.user_id,
            "agent_grant_id": context.agent_grant_id,
            "client_id": context.client_id,
            "supplier_invoice_id": supplier_invoice_id,
            "command_request_id": command_id,
            "artifact_id": artifact_id,
            "request_id": request_id,
            "tax_document_id": tax_document_id,
            "journal_id": journal_id,
            "event_id": event_id,
            "open_item_id": open_item_id,
            "idempotency_key_hash": hashlib.sha256(
                idempotency_key.encode("utf-8")
            ).digest(),
            "sequence_key_hash": hashlib.sha256(
                (idempotency_key + ":document-sequence").encode("utf-8")
            ).digest(),
            "request_json": request_bytes.decode("utf-8"),
            "request_bytes": request_bytes,
            "expires_at": expires_at,
        }
        factory = self._calculator_factory or calculator_session_factory()
        with factory() as session:
            with session.begin():
                _lock_prepare_idempotency(
                    session, params, "procurement.supplier_invoice.prepare"
                )
                rows = _mapping_rows(
                    session.execute(RESOLVE_SUPPLIER_INVOICE_SQL, params)
                )
                if len(rows) != 1:
                    raise OperatorActionError(
                        ActionErrorCode.POLICY_BLOCKED,
                        "Canonical supplier-invoice resolution is unavailable",
                    )
                resolution = _json_document(rows[0]["resolution"])
                try:
                    calculation_input, calculation_output = (
                        supplier_invoice_calculation_documents(
                            normalized,
                            resolution,
                            supplier_invoice_id=supplier_invoice_id,
                        )
                    )
                except (TypeError, ValueError) as exc:
                    raise OperatorActionError(
                        ActionErrorCode.VALIDATION_FAILED,
                        "Supplier-invoice commercial calculation input is invalid",
                        metadata={"reason": str(exc)},
                    ) from exc
                source_versions = tuple(resolution["source_versions"])
                resolved_references = tuple(
                    {
                        "resource_type": source["resource_type"],
                        **{
                            key: value
                            for key, value in source.items()
                            if key in {"id", "role", "goods_receipt_line_id"}
                        },
                    }
                    for source in source_versions
                )
                totals = calculation_output["totals"]
                calculation_ruleset = ({
                    "engine_version": calculation_output["engine_version"],
                    "ruleset_version": calculation_output["ruleset_version"],
                },)
                preview = {
                    "branch_id": resolution["branch_id"],
                    "calculation_artifact_id": str(artifact_id),
                    "calculation_hash": None,
                    "calculation_ruleset": list(calculation_ruleset),
                    "capability_code": "procurement.supplier_invoice.prepare",
                    "command_request_id": str(command_id),
                    "destination_branch_id": None,
                    "financial_impact": [{
                        "currency_code": "INR",
                        "supplier_payable": totals["grand_total"],
                        "inventory_value_delta": "0.00",
                    }],
                    "inventory_impact": [{
                        "effect": "receipt_cost_match_no_landed_cost",
                        "inventory_value_delta": "0.00",
                    }],
                    "itc_eligibility_basis": (
                        "taxable_resale_not_blocked_under_section_17"
                    ),
                    "legal_scope": resolution["legal_scope"],
                    "operation": "procurement.supplier_invoice.post",
                    "organization_id": str(context.organization_id),
                    "request_hash": request_hash,
                    "resolved_references": list(resolved_references),
                    "source_versions": list(source_versions),
                    "supply_type": resolution["supply_type"],
                    "target_resource_id": str(supplier_invoice_id),
                    "target_resource_type": "supplier_invoice",
                    "tax_charge_mechanism": "normal",
                    "tax_impact": [{
                        "cgst_total": totals["cgst_total"],
                        "sgst_total": totals["sgst_total"],
                        "igst_total": totals["igst_total"],
                        "cess_total": totals["cess_total"],
                        "itc_eligibility": "eligible",
                        "portal_document_line_id": resolution[
                            "portal_document_line_id"
                        ],
                    }],
                }
                params.update(
                    {
                        "resolved_bytes": canonical_json_bytes(resolution),
                        "preview_bytes": canonical_json_bytes(preview),
                        "calculation_input_bytes": canonical_json_bytes(
                            calculation_input
                        ),
                        "calculation_output_bytes": canonical_json_bytes(
                            calculation_output
                        ),
                    }
                )
                persisted = _mapping_rows(
                    session.execute(PERSIST_SUPPLIER_INVOICE_SQL, params)
                )
                if len(persisted) != 1:
                    raise OperatorActionError(
                        ActionErrorCode.POLICY_BLOCKED,
                        "Canonical supplier-invoice prepare did not persist exactly once",
                    )
                result = _json_document(persisted[0]["command_request_id"])
                if UUID(str(result["command_request_id"])) != command_id:
                    raise OperatorActionError(
                        ActionErrorCode.IDEMPOTENCY_CONFLICT,
                        "Canonical supplier-invoice idempotency replay differs",
                    )
                persisted_expiry = datetime.fromisoformat(
                    str(result["expires_at"]).replace("Z", "+00:00")
                )
                return PreparedCommand(
                    command_request_id=command_id,
                    command_type="procurement.supplier_invoice.post",
                    preview_hash="sha256:" + str(result["preview_hash"]),
                    expires_at=persisted_expiry,
                    resolved_references=resolved_references,
                    source_versions=source_versions,
                    calculation_ruleset=calculation_ruleset,
                    inventory_impact=tuple(preview["inventory_impact"]),
                    financial_impact=tuple(preview["financial_impact"]),
                    tax_impact=tuple(preview["tax_impact"]),
                    policy_warnings=({
                        "code": "HUMAN_ITC_ATTESTATION_REQUIRED",
                        "message": (
                            "Approval confirms taxable resale business use and no "
                            "Section 17 blocked-credit condition."
                        ),
                    },),
                    required_approvals=(
                        {"policy": policy.approval_policy, "count": 1},
                    ),
                )

    def _prepare_purchase_order(
        self,
        *,
        policy: ActionPolicy,
        payload: Mapping[str, Any],
        idempotency_key: str,
        context: ActionContext,
    ) -> PreparedCommand:
        if not self.adapter_readiness()[policy.operation_key]:
            raise OperatorActionError(
                ActionErrorCode.POLICY_BLOCKED,
                "Isolated calculation authority is not configured",
                metadata={
                    "operation_key": policy.operation_key,
                    "reason": "CALCULATOR_DATABASE_UNAVAILABLE",
                },
            )
        identity = (
            f"aasopharma:{context.organization_id}:{context.membership_id}:"
            f"procurement.purchase_order.prepare:{idempotency_key}"
        )
        purchase_order_id = uuid5(NAMESPACE_URL, identity + ":purchase-order")
        command_id = uuid5(NAMESPACE_URL, identity + ":command")
        artifact_id = uuid5(NAMESPACE_URL, identity + ":artifact")
        request_id = uuid5(NAMESPACE_URL, identity + ":request")
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
        normalized = {key: _json_value(value) for key, value in payload.items()}
        normalized["purchase_order_id"] = str(purchase_order_id)
        normalized["lines"] = [
            {
                **{key: _json_value(value) for key, value in dict(line).items()},
                "line_id": str(uuid5(NAMESPACE_URL, identity + f":line:{index}")),
            }
            for index, line in enumerate(payload["lines"], start=1)
        ]
        normalized["charge_lines"] = [
            {
                **{key: _json_value(value) for key, value in dict(line).items()},
                "line_id": str(
                    uuid5(NAMESPACE_URL, identity + f":charge-line:{index}")
                ),
            }
            for index, line in enumerate(payload.get("charge_lines") or (), start=1)
        ]
        request_bytes = canonical_json_bytes(normalized)
        request_hash = hashlib.sha256(request_bytes).hexdigest()
        key_hash = hashlib.sha256(idempotency_key.encode("utf-8")).digest()
        sequence_key_hash = hashlib.sha256(
            (idempotency_key + ":document-sequence").encode("utf-8")
        ).digest()
        params = {
            "org_id": context.organization_id,
            "membership_id": context.membership_id,
            "auth_user_id": context.auth_user_id,
            "user_id": context.user_id,
            "agent_grant_id": context.agent_grant_id,
            "client_id": context.client_id,
            "purchase_order_id": purchase_order_id,
            "command_request_id": command_id,
            "artifact_id": artifact_id,
            "request_id": request_id,
            "idempotency_key_hash": key_hash,
            "sequence_key_hash": sequence_key_hash,
            "request_json": request_bytes.decode("utf-8"),
            "request_bytes": request_bytes,
            "expires_at": expires_at,
        }
        factory = self._calculator_factory or calculator_session_factory()
        with factory() as session:
            with session.begin():
                _lock_prepare_idempotency(
                    session, params, "procurement.purchase_order.prepare"
                )
                rows = _mapping_rows(
                    session.execute(RESOLVE_PURCHASE_ORDER_SQL, params)
                )
                if len(rows) != 1:
                    raise OperatorActionError(
                        ActionErrorCode.POLICY_BLOCKED,
                        "Canonical purchase-order resolution is unavailable",
                    )
                resolution = _json_document(rows[0]["resolution"])
                try:
                    calculation_input, calculation_output = (
                        purchase_order_calculation_documents(
                            normalized,
                            resolution,
                            purchase_order_id=purchase_order_id,
                        )
                    )
                except (TypeError, ValueError) as exc:
                    raise OperatorActionError(
                        ActionErrorCode.VALIDATION_FAILED,
                        "Purchase-order commercial calculation input is invalid",
                        metadata={"reason": str(exc)},
                    ) from exc
                source_versions = tuple(resolution["source_versions"])
                resolved_references = tuple(
                    {
                        "resource_type": source["resource_type"],
                        **{
                            key: value
                            for key, value in source.items()
                            if key
                            in {
                                "id",
                                "registration_id",
                                "branch_id",
                                "product_id",
                                "charge_code",
                            }
                        },
                    }
                    for source in source_versions
                )
                totals = calculation_output["totals"]
                calculation_ruleset = (
                    {
                        "engine_version": calculation_output["engine_version"],
                        "ruleset_version": calculation_output["ruleset_version"],
                    },
                )
                preview = {
                    "branch_id": resolution["branch_id"],
                    "calculation_artifact_id": str(artifact_id),
                    "calculation_hash": None,
                    "calculation_ruleset": list(calculation_ruleset),
                    "capability_code": "procurement.purchase_order.prepare",
                    "command_request_id": str(command_id),
                    "destination_branch_id": None,
                    "financial_impact": [
                        {
                            "currency_code": "INR",
                            "supplier_commitment": totals["grand_total"],
                        }
                    ],
                    "inventory_impact": [],
                    "legal_scope": resolution["legal_scope"],
                    "operation": "procurement.purchase_order.approve",
                    "organization_id": str(context.organization_id),
                    "request_hash": request_hash,
                    "resolved_references": list(resolved_references),
                    "source_versions": list(source_versions),
                    "supply_type": resolution["supply_type"],
                    "target_resource_id": str(purchase_order_id),
                    "target_resource_type": "purchase_order",
                    "tax_charge_mechanism": "normal",
                    "tax_impact": [
                        {
                            "cgst_total": totals["cgst_total"],
                            "sgst_total": totals["sgst_total"],
                            "igst_total": totals["igst_total"],
                            "cess_total": totals["cess_total"],
                            "zero_rated_payment_mode": "not_applicable",
                        }
                    ],
                }
                params.update(
                    {
                        "resolved_bytes": canonical_json_bytes(resolution),
                        "preview_bytes": canonical_json_bytes(preview),
                        "calculation_input_bytes": canonical_json_bytes(
                            calculation_input
                        ),
                        "calculation_output_bytes": canonical_json_bytes(
                            calculation_output
                        ),
                    }
                )
                persisted = _mapping_rows(
                    session.execute(PERSIST_PURCHASE_ORDER_SQL, params)
                )
                if len(persisted) != 1:
                    raise OperatorActionError(
                        ActionErrorCode.POLICY_BLOCKED,
                        "Canonical purchase-order prepare did not persist exactly once",
                    )
                result = _json_document(persisted[0]["command_request_id"])
                if UUID(str(result["command_request_id"])) != command_id:
                    raise OperatorActionError(
                        ActionErrorCode.IDEMPOTENCY_CONFLICT,
                        "Canonical purchase-order idempotency replay differs",
                    )
                persisted_expiry = datetime.fromisoformat(
                    str(result["expires_at"]).replace("Z", "+00:00")
                )
                return PreparedCommand(
                    command_request_id=command_id,
                    command_type="procurement.purchase_order.approve",
                    preview_hash="sha256:" + str(result["preview_hash"]),
                    expires_at=persisted_expiry,
                    resolved_references=resolved_references,
                    source_versions=source_versions,
                    calculation_ruleset=calculation_ruleset,
                    inventory_impact=(),
                    financial_impact=tuple(preview["financial_impact"]),
                    tax_impact=tuple(preview["tax_impact"]),
                    required_approvals=(
                        {"policy": policy.approval_policy, "count": 1},
                    ),
                )

    def _prepare_goods_receipt(
        self,
        *,
        policy: ActionPolicy,
        payload: Mapping[str, Any],
        idempotency_key: str,
        context: ActionContext,
    ) -> PreparedCommand:
        if not self.adapter_readiness()[policy.operation_key]:
            raise OperatorActionError(
                ActionErrorCode.POLICY_BLOCKED,
                "Canonical runtime database principal is not configured",
                metadata={
                    "operation_key": policy.operation_key,
                    "reason": "RUNTIME_DATABASE_UNAVAILABLE",
                },
            )
        identity = (
            f"aasopharma:{context.organization_id}:{context.membership_id}:"
            f"procurement.goods_receipt.prepare:{idempotency_key}"
        )
        goods_receipt_id = uuid5(NAMESPACE_URL, identity + ":goods-receipt")
        inventory_document_id = uuid5(
            NAMESPACE_URL, identity + ":inventory-document"
        )
        command_id = uuid5(NAMESPACE_URL, identity + ":command")
        request_id = uuid5(NAMESPACE_URL, identity + ":request")
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
        normalized = {key: _json_value(value) for key, value in payload.items()}
        normalized["goods_receipt_id"] = str(goods_receipt_id)
        normalized["inventory_document_id"] = str(inventory_document_id)
        normalized_lines = []
        batch_number = 0
        for line in payload["lines"]:
            normalized_batches = []
            for batch in line["batches"]:
                batch_number += 1
                normalized_batches.append(
                    {
                        **{
                            key: _json_value(value)
                            for key, value in dict(batch).items()
                        },
                        "batch_id": str(
                            uuid5(
                                NAMESPACE_URL,
                                identity + f":batch:{batch_number}",
                            )
                        ),
                        "goods_receipt_line_id": str(
                            uuid5(
                                NAMESPACE_URL,
                                identity + f":receipt-line:{batch_number}",
                            )
                        ),
                        "inventory_document_line_id": str(
                            uuid5(
                                NAMESPACE_URL,
                                identity + f":inventory-line:{batch_number}",
                            )
                        ),
                    }
                )
            normalized_lines.append(
                {
                    **{
                        key: _json_value(value)
                        for key, value in dict(line).items()
                        if key != "batches"
                    },
                    "batches": normalized_batches,
                }
            )
        normalized["lines"] = normalized_lines
        request_bytes = canonical_json_bytes(normalized)
        request_hash = hashlib.sha256(request_bytes).hexdigest()
        params = {
            "org_id": context.organization_id,
            "membership_id": context.membership_id,
            "auth_user_id": context.auth_user_id,
            "user_id": context.user_id,
            "agent_grant_id": context.agent_grant_id,
            "client_id": context.client_id,
            "goods_receipt_id": goods_receipt_id,
            "inventory_document_id": inventory_document_id,
            "command_request_id": command_id,
            "request_id": request_id,
            "idempotency_key_hash": hashlib.sha256(
                idempotency_key.encode("utf-8")
            ).digest(),
            "sequence_key_hash": hashlib.sha256(
                (idempotency_key + ":document-sequence").encode("utf-8")
            ).digest(),
            "request_json": request_bytes.decode("utf-8"),
            "request_bytes": request_bytes,
            "expires_at": expires_at,
        }
        with self._session_factory() as session:
            with session.begin():
                assert_runtime_principal(session)
                _lock_prepare_idempotency(
                    session, params, "procurement.goods_receipt.prepare"
                )
                rows = _mapping_rows(
                    session.execute(RESOLVE_GOODS_RECEIPT_SQL, params)
                )
                if len(rows) != 1:
                    raise OperatorActionError(
                        ActionErrorCode.POLICY_BLOCKED,
                        "Canonical goods-receipt resolution is unavailable",
                    )
                resolution = _json_document(rows[0]["resolution"])
                source_versions = tuple(resolution["source_versions"])
                resolved_references = tuple(
                    {
                        "resource_type": source["resource_type"],
                        **{
                            key: value
                            for key, value in source.items()
                            if key
                            in {
                                "id",
                                "purchase_order_line_id",
                                "manufacturer_party_id",
                            }
                        },
                    }
                    for source in source_versions
                )
                inventory_impact = tuple(
                    {
                        "product_id": line["product_id"],
                        "batch_id": line["batch_id"],
                        "location_id": line["location_id"],
                        "base_accepted_quantity": line[
                            "base_accepted_quantity"
                        ],
                        "base_free_quantity": line["base_free_quantity"],
                        "unit_cost": line["unit_cost"],
                        "extended_cost": line["extended_cost"],
                        "costing_method": "moving_weighted_average",
                    }
                    for line in resolution["lines"]
                )
                preview = {
                    "branch_id": resolution["branch_id"],
                    "calculation_hash": None,
                    "calculation_ruleset": [],
                    "capability_code": "procurement.goods_receipt.prepare",
                    "command_request_id": str(command_id),
                    "destination_branch_id": None,
                    "financial_impact": [],
                    "inventory_impact": list(inventory_impact),
                    "legal_scope": resolution["legal_scope"],
                    "operation": "procurement.receipt.post",
                    "organization_id": str(context.organization_id),
                    "request_hash": request_hash,
                    "resolved_references": list(resolved_references),
                    "source_versions": list(source_versions),
                    "target_resource_id": str(goods_receipt_id),
                    "target_resource_type": "goods_receipt",
                    "tax_impact": [],
                }
                params.update(
                    {
                        "resolved_bytes": canonical_json_bytes(resolution),
                        "preview_bytes": canonical_json_bytes(preview),
                    }
                )
                persisted = _mapping_rows(
                    session.execute(PERSIST_GOODS_RECEIPT_SQL, params)
                )
                if len(persisted) != 1:
                    raise OperatorActionError(
                        ActionErrorCode.POLICY_BLOCKED,
                        "Canonical goods-receipt prepare did not persist exactly once",
                    )
                result = _json_document(persisted[0]["command_request_id"])
                if UUID(str(result["command_request_id"])) != command_id:
                    raise OperatorActionError(
                        ActionErrorCode.IDEMPOTENCY_CONFLICT,
                        "Canonical goods-receipt idempotency replay differs",
                    )
                persisted_expiry = datetime.fromisoformat(
                    str(result["expires_at"]).replace("Z", "+00:00")
                )
                return PreparedCommand(
                    command_request_id=command_id,
                    command_type="procurement.receipt.post",
                    preview_hash="sha256:" + str(result["preview_hash"]),
                    expires_at=persisted_expiry,
                    resolved_references=resolved_references,
                    source_versions=source_versions,
                    calculation_ruleset=(),
                    inventory_impact=inventory_impact,
                    financial_impact=(),
                    tax_impact=(),
                    required_approvals=(
                        {"policy": policy.approval_policy, "count": 1},
                    ),
                )

    def _prepare_sales_invoice(
        self,
        *,
        policy: ActionPolicy,
        payload: Mapping[str, Any],
        idempotency_key: str,
        context: ActionContext,
    ) -> PreparedCommand:
        if not self.adapter_readiness()[policy.operation_key]:
            raise OperatorActionError(
                ActionErrorCode.POLICY_BLOCKED,
                "Isolated calculation authority is not configured",
                metadata={
                    "operation_key": policy.operation_key,
                    "reason": "CALCULATOR_DATABASE_UNAVAILABLE",
                },
            )
        identity = (
            f"aasopharma:{context.organization_id}:{context.membership_id}:"
            f"sales.invoice.prepare:{idempotency_key}"
        )
        invoice_id = uuid5(NAMESPACE_URL, identity + ":invoice")
        command_id = uuid5(NAMESPACE_URL, identity + ":command")
        artifact_id = uuid5(NAMESPACE_URL, identity + ":artifact")
        request_id = uuid5(NAMESPACE_URL, identity + ":request")
        tax_document_id = uuid5(NAMESPACE_URL, identity + ":tax-document")
        journal_id = uuid5(NAMESPACE_URL, identity + ":journal")
        event_id = uuid5(NAMESPACE_URL, identity + ":accounting-event")
        open_item_id = uuid5(NAMESPACE_URL, identity + ":open-item")
        has_direct = any(
            str(line["fulfillment_source"]) == "direct_issue"
            for line in payload["lines"]
        )
        has_allocated = any(
            str(line["fulfillment_source"]) == "dispatch_allocated"
            for line in payload["lines"]
        )
        inventory_document_id = (
            uuid5(NAMESPACE_URL, identity + ":inventory-document")
            if has_direct
            else None
        )
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
        normalized = {key: _json_value(value) for key, value in payload.items()}
        normalized.update(
            {
                "invoice_id": str(invoice_id),
                "tax_document_id": str(tax_document_id),
                "journal_id": str(journal_id),
                "event_id": str(event_id),
                "open_item_id": str(open_item_id),
                "inventory_document_id": (
                    str(inventory_document_id) if inventory_document_id else None
                ),
            }
        )
        normalized_lines = []
        for line_index, source_line in enumerate(payload["lines"], start=1):
            line = {
                key: _json_value(value) for key, value in dict(source_line).items()
            }
            line["line_id"] = str(
                uuid5(NAMESPACE_URL, identity + f":line:{line_index}")
            )
            if line["fulfillment_source"] == "direct_issue":
                line["batch_allocations"] = [
                    {
                        **{
                            key: _json_value(value)
                            for key, value in dict(allocation).items()
                        },
                        "inventory_line_id": str(
                            uuid5(
                                NAMESPACE_URL,
                                identity
                                + f":line:{line_index}:inventory:{allocation_index}",
                            )
                        ),
                    }
                    for allocation_index, allocation in enumerate(
                        source_line["batch_allocations"], start=1
                    )
                ]
            else:
                line["dispatch_allocations"] = [
                    {
                        **{
                            key: _json_value(value)
                            for key, value in dict(allocation).items()
                        },
                        "invoice_dispatch_allocation_id": str(
                            uuid5(
                                NAMESPACE_URL,
                                identity
                                + f":line:{line_index}:dispatch:{allocation_index}",
                            )
                        ),
                    }
                    for allocation_index, allocation in enumerate(
                        source_line["dispatch_allocations"], start=1
                    )
                ]
            normalized_lines.append(line)
        normalized["lines"] = normalized_lines
        normalized["charge_lines"] = [
            {
                **{key: _json_value(value) for key, value in dict(line).items()},
                "line_id": str(
                    uuid5(NAMESPACE_URL, identity + f":charge-line:{index}")
                ),
            }
            for index, line in enumerate(payload.get("charge_lines") or (), start=1)
        ]
        request_bytes = canonical_json_bytes(normalized)
        request_hash = hashlib.sha256(request_bytes).hexdigest()
        key_hash = hashlib.sha256(idempotency_key.encode("utf-8")).digest()
        sequence_key_hash = hashlib.sha256(
            (idempotency_key + ":document-sequence").encode("utf-8")
        ).digest()
        params = {
            "org_id": context.organization_id,
            "membership_id": context.membership_id,
            "auth_user_id": context.auth_user_id,
            "user_id": context.user_id,
            "agent_grant_id": context.agent_grant_id,
            "client_id": context.client_id,
            "request_json": request_bytes.decode("utf-8"),
            "invoice_id": invoice_id,
            "inventory_document_id": inventory_document_id,
            "command_request_id": command_id,
            "artifact_id": artifact_id,
            "request_id": request_id,
            "idempotency_key_hash": key_hash,
            "sequence_key_hash": sequence_key_hash,
            "request_bytes": request_bytes,
            "expires_at": expires_at,
        }
        factory = self._calculator_factory or calculator_session_factory()
        with factory() as session:
            with session.begin():
                _lock_prepare_idempotency(session, params, "sales.invoice.prepare")
                rows = _mapping_rows(session.execute(RESOLVE_SALES_INVOICE_SQL, params))
                if len(rows) != 1:
                    raise OperatorActionError(
                        ActionErrorCode.POLICY_BLOCKED,
                        "Canonical sales-invoice resolution is unavailable",
                    )
                resolution = _json_document(rows[0]["resolution"])
                try:
                    calculation_input, calculation_output = (
                        sales_invoice_calculation_documents(
                            normalized, resolution, invoice_id=invoice_id
                        )
                    )
                except (TypeError, ValueError) as exc:
                    raise OperatorActionError(
                        ActionErrorCode.VALIDATION_FAILED,
                        "Sales-invoice commercial calculation input is invalid",
                        metadata={"reason": str(exc)},
                    ) from exc
                source_versions = tuple(resolution["source_versions"])
                resolved_references = tuple(
                    {
                        "resource_type": source["resource_type"],
                        **{
                            key: value
                            for key, value in source.items()
                            if key
                            in {
                                "id",
                                "location_id",
                                "product_id",
                                "batch_id",
                                "role",
                            }
                        },
                    }
                    for source in source_versions
                )
                totals = calculation_output["totals"]
                inventory_impacts = []
                if has_direct:
                    inventory_impacts.append(
                        {
                            "effect": "direct_sales_issue",
                            "inventory_document_id": str(inventory_document_id),
                            "base_quantity": resolution["total_abs_base_quantity"],
                            "inventory_value": resolution["total_inventory_value"],
                        }
                    )
                if has_allocated:
                    inventory_impacts.append(
                        {
                            "effect": "consume_posted_dispatch_lineage",
                            "stock_quantity_delta": "0.000000",
                            "inventory_value_delta": "0.00",
                        }
                    )
                inventory_impact = tuple(inventory_impacts)
                calculation_ruleset = (
                    {
                        "engine_version": calculation_output["engine_version"],
                        "ruleset_version": calculation_output["ruleset_version"],
                    },
                )
                preview = {
                    "branch_id": resolution["branch_id"],
                    "calculation_artifact_id": str(artifact_id),
                    "calculation_hash": None,
                    "calculation_ruleset": list(calculation_ruleset),
                    "capability_code": "sales.invoice.prepare",
                    "command_request_id": str(command_id),
                    "destination_branch_id": None,
                    "financial_impact": [
                        {
                            "currency_code": "INR",
                            "receivable": totals["grand_total"],
                            "direct_issue_cogs": (
                                resolution["total_inventory_value"]
                                if has_direct
                                else "0.00"
                            ),
                        }
                    ],
                    "inventory_impact": list(inventory_impact),
                    "legal_scope": resolution["legal_scope"],
                    "operation": "sales.invoice.post",
                    "organization_id": str(context.organization_id),
                    "request_hash": request_hash,
                    "resolved_references": list(resolved_references),
                    "source_versions": list(source_versions),
                    "supply_type": resolution["supply_type"],
                    "target_resource_id": str(invoice_id),
                    "target_resource_type": "sales_invoice",
                    "tax_charge_mechanism": "normal",
                    "tax_impact": [
                        {
                            "cgst_total": totals["cgst_total"],
                            "sgst_total": totals["sgst_total"],
                            "igst_total": totals["igst_total"],
                            "cess_total": totals["cess_total"],
                            "zero_rated_payment_mode": resolution[
                                "zero_rated_payment_mode"
                            ],
                        }
                    ],
                }
                params.update(
                    {
                        "resolved_bytes": canonical_json_bytes(resolution),
                        "preview_bytes": canonical_json_bytes(preview),
                        "calculation_input_bytes": canonical_json_bytes(
                            calculation_input
                        ),
                        "calculation_output_bytes": canonical_json_bytes(
                            calculation_output
                        ),
                    }
                )
                persisted = _mapping_rows(
                    session.execute(PERSIST_SALES_INVOICE_SQL, params)
                )
                if len(persisted) != 1:
                    raise OperatorActionError(
                        ActionErrorCode.POLICY_BLOCKED,
                        "Canonical sales-invoice prepare did not persist exactly once",
                    )
                persisted_result = _json_document(
                    persisted[0]["command_request_id"]
                )
                if UUID(str(persisted_result["command_request_id"])) != command_id:
                    raise OperatorActionError(
                        ActionErrorCode.IDEMPOTENCY_CONFLICT,
                        "Canonical sales-invoice idempotency replay differs",
                    )
                persisted_expiry = datetime.fromisoformat(
                    str(persisted_result["expires_at"]).replace("Z", "+00:00")
                )
                return PreparedCommand(
                    command_request_id=command_id,
                    command_type="sales.invoice.post",
                    preview_hash="sha256:" + str(persisted_result["preview_hash"]),
                    expires_at=persisted_expiry,
                    resolved_references=resolved_references,
                    source_versions=source_versions,
                    calculation_ruleset=calculation_ruleset,
                    inventory_impact=inventory_impact,
                    financial_impact=tuple(preview["financial_impact"]),
                    tax_impact=tuple(preview["tax_impact"]),
                    required_approvals=(
                        {"policy": policy.approval_policy, "count": 1},
                    ),
                )

    def _prepare_sales_return(
        self,
        *,
        policy: ActionPolicy,
        payload: Mapping[str, Any],
        idempotency_key: str,
        context: ActionContext,
    ) -> PreparedCommand:
        if not self.adapter_readiness()[policy.operation_key]:
            self._unavailable(policy.operation_key)
        identity = (
            f"aasopharma:{context.organization_id}:{context.membership_id}:"
            f"sales.return.prepare:{idempotency_key}"
        )
        identifiers = {
            name: uuid5(NAMESPACE_URL, identity + f":{name}")
            for name in (
                "sales_return_id", "inventory_document_id", "command_request_id",
                "artifact_id", "request_id", "adjustment_note_id", "journal_id",
                "event_id", "allocation_id", "residual_open_item_id",
            )
        }
        normalized = {key: _json_value(value) for key, value in payload.items()}
        normalized.update({key: str(value) for key, value in identifiers.items()})
        normalized["tax_document_id"] = (
            str(uuid5(NAMESPACE_URL, identity + ":tax_document_id"))
            if payload["gst_tax_treatment"] == "statutory"
            else None
        )
        normalized["lines"] = [
            {
                **{key: _json_value(value) for key, value in dict(line).items()},
                "line_id": str(uuid5(NAMESPACE_URL, identity + f":return-line:{index}")),
            }
            for index, line in enumerate(payload["lines"], start=1)
        ]
        request_bytes = canonical_json_bytes(normalized)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
        params = {
            "org_id": context.organization_id,
            "membership_id": context.membership_id,
            "auth_user_id": context.auth_user_id,
            "user_id": context.user_id,
            "agent_grant_id": context.agent_grant_id,
            "client_id": context.client_id,
            **identifiers,
            "tax_document_id": (
                UUID(normalized["tax_document_id"])
                if normalized["tax_document_id"] is not None
                else None
            ),
            "idempotency_key_hash": hashlib.sha256(idempotency_key.encode("utf-8")).digest(),
            "return_sequence_key_hash": hashlib.sha256((idempotency_key + ":sales-return-number").encode("utf-8")).digest(),
            "request_json": request_bytes.decode("utf-8"),
            "request_bytes": request_bytes,
            "expires_at": expires_at,
        }
        factory = self._calculator_factory or calculator_session_factory()
        with factory() as session:
            with session.begin():
                _lock_prepare_idempotency(session, params, "sales.return.prepare")
                rows = _mapping_rows(session.execute(RESOLVE_SALES_RETURN_SQL, params))
                if len(rows) != 1:
                    raise OperatorActionError(ActionErrorCode.POLICY_BLOCKED, "Canonical sales-return resolution is unavailable")
                resolution = _json_document(rows[0]["resolution"])
                try:
                    calculation_input, calculation_output = sales_return_calculation_documents(
                        normalized, resolution, sales_return_id=identifiers["sales_return_id"]
                    )
                except (TypeError, ValueError, KeyError) as exc:
                    raise OperatorActionError(
                        ActionErrorCode.VALIDATION_FAILED,
                        "Sales-return reversal calculation input is invalid",
                        metadata={"reason": str(exc)},
                    ) from exc
                totals = calculation_output["totals"]
                source_versions = tuple(resolution["source_versions"])
                resolved_references = tuple(
                    {key: value for key, value in source.items() if key in {"resource_type", "id", "role"}}
                    for source in source_versions
                )
                inventory_impact = tuple(
                    {
                        "product_id": line["product_id"],
                        "batch_id": line["batch_id"],
                        "to_location_id": line["to_location_id"],
                        "base_quantity": format(
                            Decimal(str(line["base_billed_quantity"]))
                            + Decimal(str(line["base_free_quantity"])),
                            "f",
                        ),
                        "unit_cost": line["unit_cost"],
                        "disposition": "return_to_stock_quarantine",
                    }
                    for line in resolution["lines"]
                )
                tax_impact = (
                    {
                        "gst_tax_treatment": resolution["gst_tax_treatment"],
                        "gst_taxable_total": totals["gst_taxable_total"],
                        "cgst_total": totals["cgst_total"],
                        "sgst_total": totals["sgst_total"],
                        "igst_total": totals["igst_total"],
                        "cess_total": totals["cess_total"],
                    },
                )
                preview = {
                    "branch_id": resolution["branch_id"],
                    "calculation_artifact_id": str(identifiers["artifact_id"]),
                    "calculation_ruleset": [{"engine_version": calculation_output["engine_version"], "ruleset_version": calculation_output["ruleset_version"]}],
                    "capability_code": "sales.return.prepare",
                    "command_request_id": str(identifiers["command_request_id"]),
                    "destination_branch_id": None,
                    "financial_impact": [{"currency_code": "INR", "receivable_credit": totals["grand_total"]}],
                    "inventory_impact": list(inventory_impact),
                    "legal_scope": resolution["legal_scope"],
                    "operation": "sales.return.post",
                    "organization_id": str(context.organization_id),
                    "request_hash": hashlib.sha256(request_bytes).hexdigest(),
                    "resolved_references": list(resolved_references),
                    "source_versions": list(source_versions),
                    "target_resource_id": str(identifiers["sales_return_id"]),
                    "target_resource_type": "sales_return",
                    "tax_impact": list(tax_impact),
                }
                params.update(
                    {
                        "resolved_bytes": canonical_json_bytes(resolution),
                        "preview_bytes": canonical_json_bytes(preview),
                        "calculation_input_bytes": canonical_json_bytes(calculation_input),
                        "calculation_output_bytes": canonical_json_bytes(calculation_output),
                    }
                )
                persisted = _mapping_rows(session.execute(PERSIST_SALES_RETURN_SQL, params))
                if len(persisted) != 1:
                    raise OperatorActionError(ActionErrorCode.POLICY_BLOCKED, "Canonical sales-return prepare did not persist exactly once")
                result = _json_document(persisted[0]["command_request_id"])
                if UUID(str(result["command_request_id"])) != identifiers["command_request_id"]:
                    raise OperatorActionError(ActionErrorCode.IDEMPOTENCY_CONFLICT, "Canonical sales-return idempotency replay differs")
                return PreparedCommand(
                    command_request_id=identifiers["command_request_id"],
                    command_type="sales.return.post",
                    preview_hash="sha256:" + str(result["preview_hash"]),
                    expires_at=datetime.fromisoformat(str(result["expires_at"]).replace("Z", "+00:00")),
                    resolved_references=resolved_references,
                    source_versions=source_versions,
                    calculation_ruleset=tuple(preview["calculation_ruleset"]),
                    inventory_impact=inventory_impact,
                    financial_impact=tuple(preview["financial_impact"]),
                    tax_impact=tax_impact,
                    required_approvals=({"policy": policy.approval_policy, "count": 1},),
                )

    def _prepare_purchase_return(
        self,
        *,
        policy: ActionPolicy,
        payload: Mapping[str, Any],
        idempotency_key: str,
        context: ActionContext,
    ) -> PreparedCommand:
        if not self.adapter_readiness()[policy.operation_key]:
            self._unavailable(policy.operation_key)
        identity = (
            f"aasopharma:{context.organization_id}:{context.membership_id}:"
            f"procurement.purchase_return.prepare:{idempotency_key}"
        )
        identifiers = {
            name: uuid5(NAMESPACE_URL, identity + f":{name}")
            for name in (
                "purchase_return_id", "inventory_document_id", "command_request_id",
                "artifact_id", "request_id", "adjustment_note_id", "journal_id",
                "event_id", "allocation_id", "residual_open_item_id",
            )
        }
        normalized = {key: _json_value(value) for key, value in payload.items()}
        normalized.update({key: str(value) for key, value in identifiers.items()})
        normalized["tax_document_id"] = (
            str(uuid5(NAMESPACE_URL, identity + ":tax_document_id"))
            if payload["gst_tax_treatment"] == "statutory"
            else None
        )
        normalized["lines"] = [
            {
                **{key: _json_value(value) for key, value in dict(line).items()},
                "line_id": str(uuid5(NAMESPACE_URL, identity + f":return-line:{index}")),
            }
            for index, line in enumerate(payload["lines"], start=1)
        ]
        request_bytes = canonical_json_bytes(normalized)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
        params = {
            "org_id": context.organization_id,
            "membership_id": context.membership_id,
            "auth_user_id": context.auth_user_id,
            "user_id": context.user_id,
            "agent_grant_id": context.agent_grant_id,
            "client_id": context.client_id,
            **identifiers,
            "tax_document_id": (
                UUID(normalized["tax_document_id"])
                if normalized["tax_document_id"] is not None
                else None
            ),
            "idempotency_key_hash": hashlib.sha256(
                idempotency_key.encode("utf-8")
            ).digest(),
            "return_sequence_key_hash": hashlib.sha256(
                (idempotency_key + ":purchase-return-number").encode("utf-8")
            ).digest(),
            "request_json": request_bytes.decode("utf-8"),
            "request_bytes": request_bytes,
            "expires_at": expires_at,
        }
        factory = self._calculator_factory or calculator_session_factory()
        with factory() as session:
            with session.begin():
                _lock_prepare_idempotency(
                    session, params, "procurement.purchase_return.prepare"
                )
                rows = _mapping_rows(session.execute(RESOLVE_PURCHASE_RETURN_SQL, params))
                if len(rows) != 1:
                    raise OperatorActionError(
                        ActionErrorCode.POLICY_BLOCKED,
                        "Canonical purchase-return resolution is unavailable",
                    )
                resolution = _json_document(rows[0]["resolution"])
                try:
                    calculation_input, calculation_output = (
                        purchase_return_calculation_documents(
                            normalized,
                            resolution,
                            purchase_return_id=identifiers["purchase_return_id"],
                        )
                    )
                except (TypeError, ValueError, KeyError) as exc:
                    raise OperatorActionError(
                        ActionErrorCode.VALIDATION_FAILED,
                        "Purchase-return reversal calculation input is invalid",
                        metadata={"reason": str(exc)},
                    ) from exc
                totals = calculation_output["totals"]
                source_versions = tuple(resolution["source_versions"])
                resolved_references = tuple(
                    {
                        key: value
                        for key, value in source.items()
                        if key in {"resource_type", "id", "role"}
                    }
                    for source in source_versions
                )
                inventory_impact = tuple(
                    {
                        "product_id": line["product_id"],
                        "batch_id": line["batch_id"],
                        "from_location_id": line["from_location_id"],
                        "base_quantity": format(
                            Decimal(str(line["base_billed_quantity"]))
                            + Decimal(str(line["base_free_quantity"])),
                            "f",
                        ),
                        "unit_cost": line["unit_cost"],
                        "movement_kind": "issue",
                    }
                    for line in resolution["lines"]
                )
                tax_impact = (
                    {
                        "gst_tax_treatment": resolution["gst_tax_treatment"],
                        "gst_taxable_total": totals["gst_taxable_total"],
                        "cgst_total": totals["cgst_total"],
                        "sgst_total": totals["sgst_total"],
                        "igst_total": totals["igst_total"],
                        "cess_total": totals["cess_total"],
                    },
                )
                preview = {
                    "branch_id": resolution["branch_id"],
                    "calculation_artifact_id": str(identifiers["artifact_id"]),
                    "calculation_ruleset": [
                        {
                            "engine_version": calculation_output["engine_version"],
                            "ruleset_version": calculation_output["ruleset_version"],
                        }
                    ],
                    "capability_code": "procurement.purchase_return.prepare",
                    "command_request_id": str(identifiers["command_request_id"]),
                    "destination_branch_id": None,
                    "financial_impact": [
                        {
                            "currency_code": "INR",
                            "payable_debit": totals["grand_total"],
                        }
                    ],
                    "inventory_impact": list(inventory_impact),
                    "legal_scope": resolution["legal_scope"],
                    "operation": "procurement.purchase_return.post",
                    "organization_id": str(context.organization_id),
                    "request_hash": hashlib.sha256(request_bytes).hexdigest(),
                    "resolved_references": list(resolved_references),
                    "source_versions": list(source_versions),
                    "target_resource_id": str(identifiers["purchase_return_id"]),
                    "target_resource_type": "purchase_return",
                    "tax_impact": list(tax_impact),
                }
                params.update(
                    {
                        "resolved_bytes": canonical_json_bytes(resolution),
                        "preview_bytes": canonical_json_bytes(preview),
                        "calculation_input_bytes": canonical_json_bytes(
                            calculation_input
                        ),
                        "calculation_output_bytes": canonical_json_bytes(
                            calculation_output
                        ),
                    }
                )
                persisted = _mapping_rows(
                    session.execute(PERSIST_PURCHASE_RETURN_SQL, params)
                )
                if len(persisted) != 1:
                    raise OperatorActionError(
                        ActionErrorCode.POLICY_BLOCKED,
                        "Canonical purchase-return prepare did not persist exactly once",
                    )
                result = _json_document(persisted[0]["command_request_id"])
                if UUID(str(result["command_request_id"])) != identifiers["command_request_id"]:
                    raise OperatorActionError(
                        ActionErrorCode.IDEMPOTENCY_CONFLICT,
                        "Canonical purchase-return idempotency replay differs",
                    )
                return PreparedCommand(
                    command_request_id=identifiers["command_request_id"],
                    command_type="procurement.purchase_return.post",
                    preview_hash="sha256:" + str(result["preview_hash"]),
                    expires_at=datetime.fromisoformat(
                        str(result["expires_at"]).replace("Z", "+00:00")
                    ),
                    resolved_references=resolved_references,
                    source_versions=source_versions,
                    calculation_ruleset=tuple(preview["calculation_ruleset"]),
                    inventory_impact=inventory_impact,
                    financial_impact=tuple(preview["financial_impact"]),
                    tax_impact=tax_impact,
                    required_approvals=(
                        {"policy": policy.approval_policy, "count": 1},
                    ),
                )

    def _prepare_customer_receipt(
        self,
        *,
        policy: ActionPolicy,
        payload: Mapping[str, Any],
        idempotency_key: str,
        context: ActionContext,
    ) -> PreparedCommand:
        if not self.adapter_readiness()[policy.operation_key]:
            self._unavailable(policy.operation_key)
        identity = (
            f"aasopharma:{context.organization_id}:{context.membership_id}:"
            f"finance.customer_receipt.prepare:{idempotency_key}"
        )
        identifiers = {
            name: uuid5(NAMESPACE_URL, identity + f":{name}")
            for name in ("payment_id", "command_request_id", "journal_id", "event_id")
        }
        normalized = {key: _json_value(value) for key, value in payload.items()}
        normalized.update({key: str(value) for key, value in identifiers.items()})
        normalized["allocations"] = [
            {
                **{key: _json_value(value) for key, value in dict(item).items()},
                "allocation_id": str(
                    uuid5(NAMESPACE_URL, identity + f":allocation:{index}")
                ),
            }
            for index, item in enumerate(payload["allocations"], start=1)
        ]
        request_bytes = canonical_json_bytes(normalized)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
        params = {
            "org_id": context.organization_id,
            "membership_id": context.membership_id,
            "auth_user_id": context.auth_user_id,
            "user_id": context.user_id,
            "agent_grant_id": context.agent_grant_id,
            "client_id": context.client_id,
            **identifiers,
            "idempotency_key_hash": hashlib.sha256(
                idempotency_key.encode("utf-8")
            ).digest(),
            "payment_sequence_key_hash": hashlib.sha256(
                (idempotency_key + ":customer-receipt-number").encode("utf-8")
            ).digest(),
            "journal_sequence_key_hash": hashlib.sha256(
                (idempotency_key + ":customer-receipt-journal").encode("utf-8")
            ).digest(),
            "request_json": request_bytes.decode("utf-8"),
            "request_bytes": request_bytes,
            "expires_at": expires_at,
        }
        with self._session_factory() as session:
            with session.begin():
                assert_runtime_principal(session)
                _lock_prepare_idempotency(
                    session, params, "finance.customer_receipt.prepare"
                )
                rows = _mapping_rows(
                    session.execute(RESOLVE_CUSTOMER_RECEIPT_SQL, params)
                )
                if len(rows) != 1:
                    raise OperatorActionError(
                        ActionErrorCode.POLICY_BLOCKED,
                        "Canonical customer-receipt resolution is unavailable",
                    )
                resolution = _json_document(rows[0]["resolution"])
                source_versions = tuple(resolution["source_versions"])
                resolved_references = tuple(
                    {
                        key: value
                        for key, value in source.items()
                        if key in {"resource_type", "id", "role"}
                    }
                    for source in source_versions
                    if source.get("id") is not None
                )
                allocation_impact = [
                    {
                        "open_item_id": item["open_item_id"],
                        "invoice_id": item["invoice_id"],
                        "allocated_amount": item["amount"],
                        "residual_after": item["residual_after"],
                    }
                    for item in resolution["allocations"]
                ]
                financial_impact = (
                    {
                        "currency_code": "INR",
                        "receipt_amount": resolution["amount"],
                        "settlement_account_id": resolution[
                            "settlement_account_id"
                        ],
                        "accounts_receivable_account_id": resolution[
                            "accounts_receivable_account_id"
                        ],
                        "allocations": allocation_impact,
                    },
                )
                preview = {
                    "branch_id": resolution["branch_id"],
                    "calculation_ruleset": [],
                    "capability_code": "finance.customer_receipt.prepare",
                    "command_request_id": str(identifiers["command_request_id"]),
                    "destination_branch_id": None,
                    "financial_impact": list(financial_impact),
                    "inventory_impact": [],
                    "legal_scope": resolution["legal_scope"],
                    "operation": "finance.payment.post",
                    "organization_id": str(context.organization_id),
                    "request_hash": hashlib.sha256(request_bytes).hexdigest(),
                    "resolved_references": list(resolved_references),
                    "source_versions": list(source_versions),
                    "target_resource_id": str(identifiers["payment_id"]),
                    "target_resource_type": "payment",
                    "tax_impact": [],
                }
                params.update(
                    {
                        "resolved_bytes": canonical_json_bytes(resolution),
                        "preview_bytes": canonical_json_bytes(preview),
                    }
                )
                persisted = _mapping_rows(
                    session.execute(PERSIST_CUSTOMER_RECEIPT_SQL, params)
                )
                if len(persisted) != 1:
                    raise OperatorActionError(
                        ActionErrorCode.POLICY_BLOCKED,
                        "Canonical customer-receipt prepare did not persist exactly once",
                    )
                result = _json_document(persisted[0]["command_request_id"])
                if UUID(str(result["command_request_id"])) != identifiers[
                    "command_request_id"
                ]:
                    raise OperatorActionError(
                        ActionErrorCode.IDEMPOTENCY_CONFLICT,
                        "Canonical customer-receipt idempotency replay differs",
                    )
                return PreparedCommand(
                    command_request_id=identifiers["command_request_id"],
                    command_type="finance.payment.post",
                    preview_hash="sha256:" + str(result["preview_hash"]),
                    expires_at=datetime.fromisoformat(
                        str(result["expires_at"]).replace("Z", "+00:00")
                    ),
                    resolved_references=resolved_references,
                    source_versions=source_versions,
                    calculation_ruleset=(),
                    inventory_impact=(),
                    financial_impact=financial_impact,
                    tax_impact=(),
                    required_approvals=(
                        {"policy": policy.approval_policy, "count": 1},
                    ),
                )

    def _prepare_supplier_payment(
        self,
        *,
        policy: ActionPolicy,
        payload: Mapping[str, Any],
        idempotency_key: str,
        context: ActionContext,
    ) -> PreparedCommand:
        if not self.adapter_readiness()[policy.operation_key]:
            self._unavailable(policy.operation_key)
        identity = (
            f"aasopharma:{context.organization_id}:{context.membership_id}:"
            f"finance.supplier_payment.prepare:{idempotency_key}"
        )
        identifiers = {
            name: uuid5(NAMESPACE_URL, identity + f":{name}")
            for name in ("payment_id", "command_request_id", "journal_id", "event_id")
        }
        normalized = {key: _json_value(value) for key, value in payload.items()}
        normalized.update(
            {
                key: str(value)
                for key, value in identifiers.items()
                if key in {"payment_id", "journal_id", "event_id"}
            }
        )
        normalized["allocations"] = [
            {
                **{key: _json_value(value) for key, value in dict(item).items()},
                "allocation_id": str(
                    uuid5(NAMESPACE_URL, identity + f":allocation:{index}")
                ),
            }
            for index, item in enumerate(payload["allocations"], start=1)
        ]
        request_bytes = canonical_json_bytes(normalized)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
        params = {
            "org_id": context.organization_id,
            "membership_id": context.membership_id,
            "auth_user_id": context.auth_user_id,
            "user_id": context.user_id,
            "agent_grant_id": context.agent_grant_id,
            "client_id": context.client_id,
            **identifiers,
            "idempotency_key_hash": hashlib.sha256(
                idempotency_key.encode("utf-8")
            ).digest(),
            "payment_sequence_key_hash": hashlib.sha256(
                (idempotency_key + ":supplier-payment-number").encode("utf-8")
            ).digest(),
            "journal_sequence_key_hash": hashlib.sha256(
                (idempotency_key + ":supplier-payment-journal").encode("utf-8")
            ).digest(),
            "request_json": request_bytes.decode("utf-8"),
            "request_bytes": request_bytes,
            "expires_at": expires_at,
        }
        with self._session_factory() as session:
            with session.begin():
                assert_runtime_principal(session)
                _lock_prepare_idempotency(
                    session, params, "finance.supplier_payment.prepare"
                )
                rows = _mapping_rows(
                    session.execute(RESOLVE_SUPPLIER_PAYMENT_SQL, params)
                )
                if len(rows) != 1:
                    raise OperatorActionError(
                        ActionErrorCode.POLICY_BLOCKED,
                        "Canonical supplier-payment resolution is unavailable",
                    )
                resolution = _json_document(rows[0]["resolution"])
                source_versions = tuple(resolution["source_versions"])
                resolved_references = tuple(
                    {
                        key: value
                        for key, value in source.items()
                        if key in {"resource_type", "id", "role"}
                    }
                    for source in source_versions
                    if source.get("id") is not None
                )
                allocation_impact = [
                    {
                        "open_item_id": item["open_item_id"],
                        "supplier_invoice_id": item["supplier_invoice_id"],
                        "allocated_amount": item["amount"],
                        "residual_after": item["residual_after"],
                    }
                    for item in resolution["allocations"]
                ]
                financial_impact = (
                    {
                        "currency_code": "INR",
                        "gross_liability_settlement": resolution["gross_amount"],
                        "cash_disbursed_amount": resolution["cash_amount"],
                        "withheld_amount": resolution["withheld_amount"],
                        "settlement_account_id": resolution[
                            "settlement_account_id"
                        ],
                        "accounts_payable_account_id": resolution[
                            "accounts_payable_account_id"
                        ],
                        "allocations": allocation_impact,
                    },
                )
                preview = {
                    "branch_id": resolution["branch_id"],
                    "calculation_ruleset": [],
                    "capability_code": "finance.supplier_payment.prepare",
                    "command_request_id": str(identifiers["command_request_id"]),
                    "destination_branch_id": None,
                    "financial_impact": list(financial_impact),
                    "inventory_impact": [],
                    "legal_scope": resolution["legal_scope"],
                    "operation": "finance.payment.post",
                    "organization_id": str(context.organization_id),
                    "request_hash": hashlib.sha256(request_bytes).hexdigest(),
                    "resolved_references": list(resolved_references),
                    "source_versions": list(source_versions),
                    "target_resource_id": str(identifiers["payment_id"]),
                    "target_resource_type": "payment",
                    "tax_impact": [],
                }
                params.update(
                    {
                        "resolved_bytes": canonical_json_bytes(resolution),
                        "preview_bytes": canonical_json_bytes(preview),
                    }
                )
                persisted = _mapping_rows(
                    session.execute(PERSIST_SUPPLIER_PAYMENT_SQL, params)
                )
                if len(persisted) != 1:
                    raise OperatorActionError(
                        ActionErrorCode.POLICY_BLOCKED,
                        "Canonical supplier-payment prepare did not persist exactly once",
                    )
                result = _json_document(persisted[0]["command_request_id"])
                if UUID(str(result["command_request_id"])) != identifiers[
                    "command_request_id"
                ]:
                    raise OperatorActionError(
                        ActionErrorCode.IDEMPOTENCY_CONFLICT,
                        "Canonical supplier-payment idempotency replay differs",
                    )
                return PreparedCommand(
                    command_request_id=identifiers["command_request_id"],
                    command_type="finance.payment.post",
                    preview_hash="sha256:" + str(result["preview_hash"]),
                    expires_at=datetime.fromisoformat(
                        str(result["expires_at"]).replace("Z", "+00:00")
                    ),
                    resolved_references=resolved_references,
                    source_versions=source_versions,
                    calculation_ruleset=(),
                    inventory_impact=(),
                    financial_impact=financial_impact,
                    tax_impact=(),
                    required_approvals=(
                        {"policy": policy.approval_policy, "count": 1},
                    ),
                )

    def _prepare_supplier_advance(
        self,
        *,
        policy: ActionPolicy,
        payload: Mapping[str, Any],
        idempotency_key: str,
        context: ActionContext,
    ) -> PreparedCommand:
        if not self.adapter_readiness()[policy.operation_key]:
            self._unavailable(policy.operation_key)
        identity = (
            f"aasopharma:{context.organization_id}:{context.membership_id}:"
            f"finance.supplier_advance.prepare:{idempotency_key}"
        )
        identifiers = {
            name: uuid5(NAMESPACE_URL, identity + f":{name}")
            for name in (
                "payment_id",
                "command_request_id",
                "journal_id",
                "event_id",
                "advance_allocation_id",
                "prepayment_open_item_id",
            )
        }
        normalized = {key: _json_value(value) for key, value in payload.items()}
        normalized.update(
            {
                key: str(value)
                for key, value in identifiers.items()
                if key
                in {"payment_id", "journal_id", "event_id"}
            }
        )
        normalized["allocations"] = [
            {
                **{
                    key: _json_value(value)
                    for key, value in dict(payload["allocations"][0]).items()
                },
                "advance_allocation_id": str(
                    identifiers["advance_allocation_id"]
                ),
                "prepayment_open_item_id": str(
                    identifiers["prepayment_open_item_id"]
                ),
            }
        ]
        request_bytes = canonical_json_bytes(normalized)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
        params = {
            "org_id": context.organization_id,
            "membership_id": context.membership_id,
            "auth_user_id": context.auth_user_id,
            "user_id": context.user_id,
            "agent_grant_id": context.agent_grant_id,
            "client_id": context.client_id,
            **{
                key: value
                for key, value in identifiers.items()
                if key
                in {"payment_id", "command_request_id", "journal_id", "event_id"}
            },
            "idempotency_key_hash": hashlib.sha256(
                idempotency_key.encode("utf-8")
            ).digest(),
            "payment_sequence_key_hash": hashlib.sha256(
                (idempotency_key + ":supplier-advance-number").encode("utf-8")
            ).digest(),
            "journal_sequence_key_hash": hashlib.sha256(
                (idempotency_key + ":supplier-advance-journal").encode("utf-8")
            ).digest(),
            "request_json": request_bytes.decode("utf-8"),
            "request_bytes": request_bytes,
            "expires_at": expires_at,
        }
        with self._session_factory() as session:
            with session.begin():
                assert_runtime_principal(session)
                _lock_prepare_idempotency(
                    session, params, "finance.supplier_advance.prepare"
                )
                rows = _mapping_rows(
                    session.execute(RESOLVE_SUPPLIER_ADVANCE_SQL, params)
                )
                if len(rows) != 1:
                    raise OperatorActionError(
                        ActionErrorCode.POLICY_BLOCKED,
                        "Canonical supplier-advance resolution is unavailable",
                    )
                resolution = _json_document(rows[0]["resolution"])
                source_versions = tuple(resolution["source_versions"])
                resolved_references = tuple(
                    {
                        key: value
                        for key, value in source.items()
                        if key in {"resource_type", "id", "role"}
                    }
                    for source in source_versions
                    if source.get("id") is not None
                )
                allocation = resolution["allocations"][0]
                financial_impact = (
                    {
                        "currency_code": "INR",
                        "gross_advance_amount": resolution["gross_amount"],
                        "cash_disbursed_amount": resolution["cash_amount"],
                        "withheld_amount": resolution["withheld_amount"],
                        "purchase_order_id": resolution["purchase_order_id"],
                        "purchase_order_line_id": allocation[
                            "purchase_order_line_id"
                        ],
                        "settlement_account_id": resolution[
                            "settlement_account_id"
                        ],
                        "supplier_prepayment_account_id": resolution[
                            "supplier_prepayment_account_id"
                        ],
                    },
                )
                preview = {
                    "branch_id": resolution["branch_id"],
                    "calculation_ruleset": [],
                    "capability_code": "finance.supplier_advance.prepare",
                    "command_request_id": str(identifiers["command_request_id"]),
                    "destination_branch_id": None,
                    "financial_impact": list(financial_impact),
                    "inventory_impact": [],
                    "legal_scope": resolution["legal_scope"],
                    "operation": "finance.supplier_advance.post",
                    "organization_id": str(context.organization_id),
                    "request_hash": hashlib.sha256(request_bytes).hexdigest(),
                    "resolved_references": list(resolved_references),
                    "source_versions": list(source_versions),
                    "target_resource_id": str(identifiers["payment_id"]),
                    "target_resource_type": "payment",
                    "tax_impact": [],
                }
                params.update(
                    {
                        "resolved_bytes": canonical_json_bytes(resolution),
                        "preview_bytes": canonical_json_bytes(preview),
                    }
                )
                persisted = _mapping_rows(
                    session.execute(PERSIST_SUPPLIER_ADVANCE_SQL, params)
                )
                if len(persisted) != 1:
                    raise OperatorActionError(
                        ActionErrorCode.POLICY_BLOCKED,
                        "Canonical supplier-advance prepare did not persist exactly once",
                    )
                result = _json_document(persisted[0]["command_request_id"])
                if UUID(str(result["command_request_id"])) != identifiers[
                    "command_request_id"
                ]:
                    raise OperatorActionError(
                        ActionErrorCode.IDEMPOTENCY_CONFLICT,
                        "Canonical supplier-advance idempotency replay differs",
                    )
                return PreparedCommand(
                    command_request_id=identifiers["command_request_id"],
                    command_type="finance.supplier_advance.post",
                    preview_hash="sha256:" + str(result["preview_hash"]),
                    expires_at=datetime.fromisoformat(
                        str(result["expires_at"]).replace("Z", "+00:00")
                    ),
                    resolved_references=resolved_references,
                    source_versions=source_versions,
                    calculation_ruleset=(),
                    inventory_impact=(),
                    financial_impact=financial_impact,
                    tax_impact=(),
                    required_approvals=(
                        {"policy": policy.approval_policy, "count": 1},
                    ),
                )

    def _prepare_inventory_adjustment(
        self,
        *,
        policy: ActionPolicy,
        payload: Mapping[str, Any],
        idempotency_key: str,
        context: ActionContext,
    ) -> PreparedCommand:
        if not self.adapter_readiness()[policy.operation_key]:
            self._unavailable(policy.operation_key)
        identity = (
            f"aasopharma:{context.organization_id}:{context.membership_id}:"
            f"inventory.adjustment.prepare:{idempotency_key}"
        )
        identifiers = {
            name: uuid5(NAMESPACE_URL, identity + f":{name}")
            for name in ("inventory_document_id", "command_request_id", "journal_id", "event_id")
        }
        normalized = {key: _json_value(value) for key, value in payload.items()}
        normalized.update(
            {
                "inventory_document_id": str(identifiers["inventory_document_id"]),
                "journal_id": str(identifiers["journal_id"]),
                "event_id": str(identifiers["event_id"]),
            }
        )
        normalized["lines"] = []
        line_number = 0
        for product_line in payload["lines"]:
            normalized_line = {
                key: _json_value(value)
                for key, value in dict(product_line).items()
                if key != "batch_counts"
            }
            counts = []
            for batch_count in product_line["batch_counts"]:
                line_number += 1
                counts.append(
                    {
                        **{
                            key: _json_value(value)
                            for key, value in dict(batch_count).items()
                        },
                        "inventory_document_line_id": str(
                            uuid5(NAMESPACE_URL, identity + f":line:{line_number}")
                        ),
                    }
                )
            normalized_line["batch_counts"] = counts
            normalized["lines"].append(normalized_line)
        request_bytes = canonical_json_bytes(normalized)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
        params = {
            "org_id": context.organization_id,
            "membership_id": context.membership_id,
            "auth_user_id": context.auth_user_id,
            "user_id": context.user_id,
            "agent_grant_id": context.agent_grant_id,
            "client_id": context.client_id,
            **identifiers,
            "idempotency_key_hash": hashlib.sha256(idempotency_key.encode("utf-8")).digest(),
            "document_sequence_key_hash": hashlib.sha256(
                (idempotency_key + ":stock-count-number").encode("utf-8")
            ).digest(),
            "journal_sequence_key_hash": hashlib.sha256(
                (idempotency_key + ":stock-count-journal").encode("utf-8")
            ).digest(),
            "request_json": request_bytes.decode("utf-8"),
            "request_bytes": request_bytes,
            "expires_at": expires_at,
        }
        with self._session_factory() as session:
            with session.begin():
                assert_runtime_principal(session)
                _lock_prepare_idempotency(
                    session, params, "inventory.adjustment.prepare"
                )
                rows = _mapping_rows(session.execute(RESOLVE_INVENTORY_ADJUSTMENT_SQL, params))
                if len(rows) != 1:
                    raise OperatorActionError(
                        ActionErrorCode.POLICY_BLOCKED,
                        "Canonical cycle-count gain resolution is unavailable",
                    )
                resolution = _json_document(rows[0]["resolution"])
                source_versions = tuple(resolution["source_versions"])
                resolved_references = tuple(
                    {
                        key: value
                        for key, value in source.items()
                        if key in {"resource_type", "id", "role"}
                    }
                    for source in source_versions
                    if source.get("id") is not None
                )
                inventory_impact = tuple(
                    {
                        "location_id": resolution["location_id"],
                        "product_id": line["product_id"],
                        "batch_id": line["batch_id"],
                        "system_base_quantity": line["system_base_quantity"],
                        "counted_base_quantity": line["counted_base_quantity"],
                        "gain_base_quantity": line["variance_base_quantity"],
                        "moving_weighted_average": line["unit_cost"],
                        "gain_value": line["extended_cost"],
                    }
                    for line in resolution["lines"]
                )
                financial_impact = (
                    {
                        "currency_code": "INR",
                        "debit_account_id": resolution["inventory_asset_account_id"],
                        "credit_account_id": resolution["inventory_count_gain_account_id"],
                        "amount": resolution["total_value"],
                    },
                )
                preview = {
                    "branch_id": resolution["branch_id"],
                    "calculation_ruleset": [],
                    "capability_code": "inventory.adjustment.prepare",
                    "command_request_id": str(identifiers["command_request_id"]),
                    "destination_branch_id": None,
                    "financial_impact": list(financial_impact),
                    "inventory_impact": list(inventory_impact),
                    "legal_scope": resolution["legal_scope"],
                    "operation": "inventory.document.post",
                    "organization_id": str(context.organization_id),
                    "request_hash": hashlib.sha256(request_bytes).hexdigest(),
                    "resolved_references": list(resolved_references),
                    "source_versions": list(source_versions),
                    "target_resource_id": str(identifiers["inventory_document_id"]),
                    "target_resource_type": "inventory_document",
                    "tax_impact": [
                        {
                            "supply_created": False,
                            "gst_amount": "0.00",
                            "itc_claimed_or_reversed": False,
                        }
                    ],
                }
                params.update(
                    {
                        "resolved_bytes": canonical_json_bytes(resolution),
                        "preview_bytes": canonical_json_bytes(preview),
                    }
                )
                persisted = _mapping_rows(session.execute(PERSIST_INVENTORY_ADJUSTMENT_SQL, params))
                if len(persisted) != 1:
                    raise OperatorActionError(
                        ActionErrorCode.POLICY_BLOCKED,
                        "Canonical cycle-count gain prepare did not persist exactly once",
                    )
                result = _json_document(persisted[0]["command_request_id"])
                if UUID(str(result["command_request_id"])) != identifiers["command_request_id"]:
                    raise OperatorActionError(
                        ActionErrorCode.IDEMPOTENCY_CONFLICT,
                        "Canonical cycle-count gain idempotency replay differs",
                    )
                return PreparedCommand(
                    command_request_id=identifiers["command_request_id"],
                    command_type="inventory.document.post",
                    preview_hash="sha256:" + str(result["preview_hash"]),
                    expires_at=datetime.fromisoformat(str(result["expires_at"]).replace("Z", "+00:00")),
                    resolved_references=resolved_references,
                    source_versions=source_versions,
                    calculation_ruleset=(),
                    inventory_impact=inventory_impact,
                    financial_impact=financial_impact,
                    tax_impact=tuple(preview["tax_impact"]),
                    required_approvals=({"policy": policy.approval_policy, "count": 1},),
                )

    def _prepare_sales_dispatch(
        self,
        *,
        policy: ActionPolicy,
        payload: Mapping[str, Any],
        idempotency_key: str,
        context: ActionContext,
    ) -> PreparedCommand:
        if not self.adapter_readiness()[policy.operation_key]:
            self._unavailable(policy.operation_key)
        identity = (
            f"aasopharma:{context.organization_id}:{context.membership_id}:"
            f"sales.dispatch.prepare:{idempotency_key}"
        )
        dispatch_id = uuid5(NAMESPACE_URL, identity + ":dispatch")
        inventory_document_id = uuid5(NAMESPACE_URL, identity + ":inventory-document")
        command_id = uuid5(NAMESPACE_URL, identity + ":command")
        request_id = uuid5(NAMESPACE_URL, identity + ":request")
        normalized = {key: _json_value(value) for key, value in payload.items()}
        normalized["dispatch_id"] = str(dispatch_id)
        normalized["inventory_document_id"] = str(inventory_document_id)
        normalized["valuation_journal_id"] = str(
            uuid5(NAMESPACE_URL, identity + ":valuation-journal")
        )
        normalized["valuation_event_id"] = str(
            uuid5(NAMESPACE_URL, identity + ":valuation-event")
        )
        normalized_lines = []
        for line_index, source_line in enumerate(payload["lines"], start=1):
            line = {
                key: _json_value(value) for key, value in dict(source_line).items()
            }
            allocations = []
            for allocation_index, source_allocation in enumerate(
                source_line["batch_allocations"], start=1
            ):
                allocation = {
                    key: _json_value(value)
                    for key, value in dict(source_allocation).items()
                }
                allocation["dispatch_line_id"] = str(
                    uuid5(
                        NAMESPACE_URL,
                        identity + f":dispatch-line:{line_index}:{allocation_index}",
                    )
                )
                allocation["inventory_line_id"] = str(
                    uuid5(
                        NAMESPACE_URL,
                        identity + f":inventory-line:{line_index}:{allocation_index}",
                    )
                )
                allocations.append(allocation)
            line["batch_allocations"] = allocations
            normalized_lines.append(line)
        normalized["lines"] = normalized_lines
        request_bytes = canonical_json_bytes(normalized)
        key_hash = hashlib.sha256(idempotency_key.encode("utf-8")).digest()
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
        params = {
            "org_id": context.organization_id,
            "membership_id": context.membership_id,
            "auth_user_id": context.auth_user_id,
            "user_id": context.user_id,
            "agent_grant_id": context.agent_grant_id,
            "client_id": context.client_id,
            "dispatch_id": dispatch_id,
            "inventory_document_id": inventory_document_id,
            "command_request_id": command_id,
            "request_id": request_id,
            "request_json": request_bytes.decode("utf-8"),
            "idempotency_key_hash": key_hash,
            "sequence_key_hash": hashlib.sha256(
                (idempotency_key + ":dispatch-document-sequence").encode("utf-8")
            ).digest(),
            "request_bytes": request_bytes,
            "expires_at": expires_at,
        }
        with self._session_factory() as session:
            with session.begin():
                assert_runtime_principal(session)
                _lock_prepare_idempotency(session, params, "sales.dispatch.prepare")
                rows = _mapping_rows(session.execute(RESOLVE_SALES_DISPATCH_SQL, params))
                if len(rows) != 1:
                    raise OperatorActionError(
                        ActionErrorCode.POLICY_BLOCKED,
                        "Canonical sales-dispatch resolution is unavailable",
                    )
                resolution = _json_document(rows[0]["resolution"])
                preview = dispatch_preview(
                    organization_id=context.organization_id,
                    command_request_id=command_id,
                    dispatch_id=dispatch_id,
                    request_hash=hashlib.sha256(request_bytes).hexdigest(),
                    resolution=resolution,
                )
                preview_bytes = canonical_json_bytes(preview)
                params.update(
                    {
                        "resolved_bytes": canonical_json_bytes(resolution),
                        "preview_bytes": preview_bytes,
                    }
                )
                persisted = _mapping_rows(
                    session.execute(PERSIST_SALES_DISPATCH_SQL, params)
                )
                if len(persisted) != 1:
                    raise OperatorActionError(
                        ActionErrorCode.POLICY_BLOCKED,
                        "Canonical sales-dispatch prepare did not persist exactly once",
                    )
                persisted_result = _json_document(
                    persisted[0]["command_request_id"]
                )
                if UUID(str(persisted_result["command_request_id"])) != command_id:
                    raise OperatorActionError(
                        ActionErrorCode.IDEMPOTENCY_CONFLICT,
                        "Canonical sales-dispatch idempotency replay differs",
                    )
                persisted_expiry = datetime.fromisoformat(
                    str(persisted_result["expires_at"]).replace("Z", "+00:00")
                )
                return PreparedCommand(
                    command_request_id=command_id,
                    command_type="sales.dispatch.post",
                    preview_hash="sha256:" + str(persisted_result["preview_hash"]),
                    expires_at=persisted_expiry,
                    resolved_references=tuple(preview["resolved_references"]),
                    source_versions=tuple(preview["source_versions"]),
                    calculation_ruleset=(),
                    inventory_impact=tuple(preview["inventory_impact"]),
                    financial_impact=tuple(preview["financial_impact"]),
                    tax_impact=(),
                    required_approvals=(
                        {"policy": policy.approval_policy, "count": 1},
                    ),
                )

    def approve(
        self,
        *,
        command_request_id: UUID,
        preview_hash: str,
        idempotency_key: str,
        context: ActionContext,
    ) -> CommandExecution:
        binding = self._bindings["automation.command.approve"]
        if not binding.available:
            self._unavailable(binding.operation_key)
        policy = ActionPolicy(
            operation_key="automation.command.approve",
            permission="automation.command.approve",
            risk_class="consequential_write",
            schema_profile="immutable_command_approval",
            approval_policy="actor_confirmation",
            branch_fields=(),
        )
        preview_hash_bytes = _preview_hash_bytes(preview_hash)
        key_hash = hashlib.sha256(idempotency_key.encode("utf-8")).digest()
        approval_id = uuid4()
        with self._session_factory() as session:
            with session.begin():
                self._authorize(session, context, policy)
                session.execute(
                    _SET_REQUEST_CONTEXT_SQL,
                    {"request_id": str(uuid4())},
                )
                params = {
                    "org_id": context.organization_id,
                    "command_request_id": command_request_id,
                    "approval_id": approval_id,
                    "preview_hash": preview_hash_bytes,
                    "idempotency_key_hash": key_hash,
                    "membership_id": context.membership_id,
                }
                session.execute(_APPROVE_COMMAND_SQL, params)
                rows = _mapping_rows(session.execute(_APPROVAL_RESULT_SQL, params))
                if len(rows) != 1:
                    raise OperatorActionError(
                        ActionErrorCode.POLICY_BLOCKED,
                        "Canonical approval result is unavailable",
                    )
                row = rows[0]
                return CommandExecution(
                    command_request_id=command_request_id,
                    command_type=row["operation"],
                    status="approved",
                    preview_hash=_hash_string(row["preview_hash"]),
                    resource_type=row["result_resource_type"],
                    resource_id=row["result_resource_id"],
                    approved_at=row["decided_at"],
                    idempotency_replayed=row["approval_id"] != approval_id,
                )

    def execute(
        self,
        *,
        command_request_id: UUID,
        preview_hash: str,
        idempotency_key: str,
        context: ActionContext,
    ) -> CommandExecution:
        binding = self._bindings["automation.command.execute"]
        if not binding.available:
            self._unavailable(binding.operation_key)
        policy = ActionPolicy(
            operation_key="automation.command.execute",
            permission="automation.command.execute",
            risk_class="consequential_write",
            schema_profile="immutable_command_execution",
            approval_policy="actor_confirmation",
            branch_fields=(),
        )
        expected_preview_hash = _preview_hash_bytes(preview_hash)
        # Execution has no business payload. This is transport metadata only;
        # exact replay is owned by the immutable prepared command.
        if not idempotency_key.strip():
            raise OperatorActionError(
                ActionErrorCode.VALIDATION_FAILED,
                "Execution idempotency metadata is required",
            )
        with self._session_factory() as session:
            with session.begin():
                self._authorize(session, context, policy)
                session.execute(_SET_REQUEST_CONTEXT_SQL, {"request_id": str(uuid4())})
                params = {
                    "org_id": context.organization_id,
                    "command_request_id": command_request_id,
                    "agent_grant_id": context.agent_grant_id,
                    "membership_id": context.membership_id,
                }
                rows = _mapping_rows(session.execute(_EXECUTION_SNAPSHOT_SQL, params))
                if len(rows) != 1:
                    raise OperatorActionError(
                        ActionErrorCode.SCOPE_DENIED,
                        "Canonical command is unavailable in this delegation",
                    )
                before = rows[0]
                if _preview_hash_bytes(_hash_string(before["preview_hash"])) != expected_preview_hash:
                    raise OperatorActionError(
                        ActionErrorCode.PREVIEW_CHANGED,
                        "Prepared command preview changed",
                    )
                replayed = before["status"] == "succeeded"
                session.execute(_SET_COMMAND_CONTEXT_SQL, params)
                session.execute(_EXECUTE_COMMAND_SQL, params)
                after_rows = _mapping_rows(
                    session.execute(_EXECUTION_SNAPSHOT_SQL, params)
                )
                if len(after_rows) != 1 or after_rows[0]["status"] != "succeeded":
                    raise OperatorActionError(
                        ActionErrorCode.POLICY_BLOCKED,
                        "Canonical command did not reach an exact terminal result",
                    )
                after = after_rows[0]
                return CommandExecution(
                    command_request_id=command_request_id,
                    command_type=after["operation"],
                    status=after["status"],
                    preview_hash=_hash_string(after["preview_hash"]),
                    resource_type=after["result_resource_type"],
                    resource_id=after["result_resource_id"],
                    executed_at=after["completed_at"],
                    idempotency_replayed=replayed,
                )

    @staticmethod
    def _authorize(
        session: Session,
        context: ActionContext,
        policy: ActionPolicy,
    ) -> None:
        assert_runtime_principal(session)
        session.execute(
            _ACTIVATE_CONTEXT_SQL,
            {
                "org_id": context.organization_id,
                "auth_user_id": context.auth_user_id,
            },
        )
        rows = _mapping_rows(
            session.execute(
                _AUTHORIZE_SQL,
                {
                    "org_id": context.organization_id,
                    "agent_grant_id": context.agent_grant_id,
                    "membership_id": context.membership_id,
                    "client_id": context.client_id,
                    "user_id": context.user_id,
                    "auth_user_id": context.auth_user_id,
                    "operation_key": policy.operation_key,
                    "operation_mode": "read"
                    if policy.risk_class == "read_only"
                    else "write",
                    "risk_class": policy.risk_class,
                    "approval_policy": policy.approval_policy,
                    "permission_code": policy.permission,
                },
            )
        )
        if len(rows) != 1:
            raise OperatorActionError(
                ActionErrorCode.SCOPE_DENIED,
                "Canonical operator authority is inactive",
            )
        grant_branch = rows[0]["branch_id"]
        if context.organization_scope:
            scope_matches = grant_branch is None
        else:
            scope_matches = (
                grant_branch is not None
                and context.branch_ids == (grant_branch,)
            )
        if not scope_matches:
            raise OperatorActionError(
                ActionErrorCode.BRANCH_DENIED,
                "Canonical operator branch scope changed",
            )

    def get_status(
        self,
        *,
        command_request_id: UUID,
        context: ActionContext,
    ) -> CommandState:
        binding = self._bindings["automation.command.status.get"]
        if not binding.available:
            self._unavailable(binding.operation_key)

        policy = ActionPolicy(
            operation_key="automation.command.status.get",
            permission="automation.command.view",
            risk_class="read_only",
            schema_profile="command_status",
            approval_policy="none",
            branch_fields=(),
        )
        with self._session_factory() as session:
            with session.begin():
                self._authorize(session, context, policy)
                params = {
                    "org_id": context.organization_id,
                    "command_request_id": command_request_id,
                    "agent_grant_id": context.agent_grant_id,
                    "membership_id": context.membership_id,
                }
                rows = _mapping_rows(session.execute(_COMMAND_STATUS_SQL, params))
                if len(rows) != 1:
                    raise OperatorActionError(
                        ActionErrorCode.SCOPE_DENIED,
                        "Canonical command is unavailable in this delegation",
                    )
                row = rows[0]
                audits = _mapping_rows(session.execute(_COMMAND_AUDIT_SQL, params))

                failure = None
                if row["failure_code"] is not None or row["failure_message"] is not None:
                    failure = {
                        "code": row["failure_code"],
                        "message": row["failure_message"],
                    }
                audit_references = tuple(
                    {key: _json_value(value) for key, value in audit.items()}
                    for audit in audits
                )
                return CommandState(
                    command_request_id=row["id"],
                    command_type=row["operation"],
                    status=row["status"],
                    preview_hash=_hash_string(row["preview_hash"]),
                    expires_at=row["expires_at"],
                    approved_at=row["approved_at"],
                    executed_at=row["completed_at"],
                    resource_type=row["result_resource_type"],
                    resource_id=row["result_resource_id"],
                    failure=failure,
                    audit_references=audit_references,
                )


def install_sqlalchemy_operator_action_service() -> None:
    """Wire the adapter without changing any deployment/publication gate."""
    install_operator_action_service(SqlAlchemyOperatorActionService())
