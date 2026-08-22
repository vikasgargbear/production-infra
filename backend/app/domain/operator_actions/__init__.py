"""Canonical operator-command boundary shared by internal transports."""

from .contract import (
    ACTION_POLICIES,
    PREPARE_PAYLOAD_MODELS,
    PUBLISHED_OPERATOR_OPERATION_KEYS,
    ActionPolicy,
    OperatorCommandType,
    policy_for,
    validate_prepare_payload_semantics,
)
from .models import (
    ActionContext,
    ActionErrorCode,
    CommandExecution,
    CommandState,
    OperatorActionError,
    PreparedCommand,
)
from .service import (
    OperatorActionService,
    get_operator_action_service,
)

__all__ = [
    "ACTION_POLICIES",
    "PREPARE_PAYLOAD_MODELS",
    "PUBLISHED_OPERATOR_OPERATION_KEYS",
    "ActionContext",
    "ActionErrorCode",
    "ActionPolicy",
    "CommandExecution",
    "CommandState",
    "OperatorActionError",
    "OperatorActionService",
    "OperatorCommandType",
    "PreparedCommand",
    "get_operator_action_service",
    "policy_for",
    "validate_prepare_payload_semantics",
]
