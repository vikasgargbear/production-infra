"""Canonical operator-command boundary shared by internal transports."""

from .contract import (
    ACTION_POLICIES,
    PREPARE_PAYLOAD_MODELS,
    PUBLISHED_OPERATOR_OPERATION_KEYS,
    RETURN_SOURCE_CAPABILITIES,
    ActionPolicy,
    OperatorCommandType,
    policy_for,
    return_source_failure_detail,
    validate_prepare_payload_capabilities,
    validate_prepare_payload_semantics,
)
from .models import (
    ActionContext,
    ActionErrorCode,
    CommandExecution,
    CommandReview,
    CommandState,
    DraftPrepareBinding,
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
    "RETURN_SOURCE_CAPABILITIES",
    "ActionContext",
    "ActionErrorCode",
    "ActionPolicy",
    "CommandExecution",
    "CommandReview",
    "CommandState",
    "DraftPrepareBinding",
    "OperatorActionError",
    "OperatorActionService",
    "OperatorCommandType",
    "PreparedCommand",
    "get_operator_action_service",
    "policy_for",
    "return_source_failure_detail",
    "validate_prepare_payload_capabilities",
    "validate_prepare_payload_semantics",
]
