"""Injectable canonical command service; no legacy or persistence dependency."""

from __future__ import annotations

from typing import Any, Mapping, Protocol
from uuid import UUID

from .contract import ACTION_POLICIES, ActionPolicy
from .models import (
    ActionContext,
    ActionErrorCode,
    CommandExecution,
    CommandReview,
    CommandState,
    OperatorActionError,
    PreparedCommand,
)


class OperatorActionService(Protocol):
    def deployment_readiness(self) -> bool: ...

    def adapter_readiness(self) -> Mapping[str, bool]: ...

    def prepare(
        self,
        *,
        policy: ActionPolicy,
        payload: Mapping[str, Any],
        idempotency_key: str,
        context: ActionContext,
    ) -> PreparedCommand: ...

    def approve(
        self,
        *,
        command_request_id: UUID,
        preview_hash: str,
        idempotency_key: str,
        context: ActionContext,
    ) -> CommandExecution: ...

    def review(
        self,
        *,
        command_request_id: UUID,
        context: ActionContext,
    ) -> CommandReview: ...

    def execute(
        self,
        *,
        command_request_id: UUID,
        preview_hash: str,
        idempotency_key: str,
        context: ActionContext,
    ) -> CommandExecution: ...

    def get_status(
        self,
        *,
        command_request_id: UUID,
        context: ActionContext,
    ) -> CommandState: ...

    def get_bank_reconciliation_readback(
        self, *, command_request_id: UUID, context: ActionContext
    ) -> Mapping[str, Any]: ...

    def get_expense_claim_readback(
        self, *, command_request_id: UUID, context: ActionContext
    ) -> Mapping[str, Any]: ...


class UnavailableOperatorActionService:
    """Production default until reviewed canonical command adapters are wired."""

    def deployment_readiness(self) -> bool:
        return False

    def adapter_readiness(self) -> Mapping[str, bool]:
        return {operation_key: False for operation_key in ACTION_POLICIES}

    @staticmethod
    def _unavailable(operation_key: str):
        raise OperatorActionError(
            ActionErrorCode.POLICY_BLOCKED,
            "Canonical command adapter is not registered",
            metadata={"operation_key": operation_key, "reason": "COMMAND_ADAPTER_UNAVAILABLE"},
        )

    def prepare(self, *, policy, payload, idempotency_key, context):
        return self._unavailable(policy.operation_key)

    def approve(self, *, command_request_id, preview_hash, idempotency_key, context):
        return self._unavailable("automation.command.approve")

    def review(self, *, command_request_id, context):
        return self._unavailable("automation.command.approve")

    def execute(self, *, command_request_id, preview_hash, idempotency_key, context):
        return self._unavailable("automation.command.execute")

    def get_status(self, *, command_request_id, context):
        return self._unavailable("automation.command.status.get")

    def get_bank_reconciliation_readback(self, *, command_request_id, context):
        return self._unavailable("automation.command.status.get")

    def get_expense_claim_readback(self, *, command_request_id, context):
        return self._unavailable("automation.command.status.get")


_service: OperatorActionService = UnavailableOperatorActionService()


def install_operator_action_service(service: OperatorActionService) -> None:
    """Install an infrastructure adapter; release gates remain transport-owned."""
    global _service
    _service = service


def get_operator_action_service() -> OperatorActionService:
    return _service
