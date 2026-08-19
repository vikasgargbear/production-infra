"""Durable idempotency markers for high-impact database writes."""

from __future__ import annotations

import base64
import hashlib
import json
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Dict
from uuid import UUID


MARKER_VERSION = "erp-idempotency:v1"
DEDICATED_PAYMENT_STORE_OPERATIONS = frozenset({
    "payment.cancel",
    "payment.reconcile",
    "payment.allocate",
})


class IdempotencyConflictError(ValueError):
    """The same scoped key was reused for a different request body."""


class IdempotencyStateError(RuntimeError):
    """A persisted idempotency marker is incomplete or malformed."""


def require_dedicated_payment_idempotency_store(
    *, operation: str, key: str
) -> None:
    """Fail closed until the reviewed payment replay store is available."""
    if operation not in DEDICATED_PAYMENT_STORE_OPERATIONS:
        raise ValueError("Unsupported dedicated payment idempotency operation")
    if not isinstance(key, str) or key != key.strip() or not 8 <= len(key) <= 255:
        raise ValueError("Idempotency key must be 8-255 characters without edge whitespace")
    raise IdempotencyStateError(
        f"{operation} requires the dedicated payment idempotency store; "
        "this mutation is disabled until the live schema is baselined"
    )


def _json_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Enum):
        return _json_value(value.value)
    if isinstance(value, dict):
        return {str(key): _json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    return value


def _canonical_json(value: Any) -> str:
    return json.dumps(
        _json_value(value),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        allow_nan=False,
    )


@dataclass(frozen=True)
class IdempotencyClaim:
    """A tenant, actor, operation, key, and request-body identity."""

    scope_hash: str
    request_hash: str

    @property
    def lock_key(self) -> str:
        return f"{MARKER_VERSION}:{self.scope_hash}"

    @property
    def marker_prefix(self) -> str:
        return f"{self.lock_key}:"

    @property
    def pending_marker(self) -> str:
        return f"{self.marker_prefix}{self.request_hash}:pending"

    def completed_marker(self, response: Dict[str, Any]) -> str:
        encoded = base64.urlsafe_b64encode(
            _canonical_json(response).encode("utf-8")
        ).decode("ascii")
        return f"{self.marker_prefix}{self.request_hash}:complete:{encoded}"


def build_idempotency_claim(
    *,
    org_id: Any,
    actor_id: Any,
    operation: str,
    key: str,
    request_payload: Dict[str, Any],
) -> IdempotencyClaim:
    """Build a non-reversible marker without persisting request contents."""
    if not isinstance(key, str) or key != key.strip() or not 8 <= len(key) <= 255:
        raise ValueError("Idempotency key must be 8-255 characters without edge whitespace")
    if not operation or ":" in operation:
        raise ValueError("Invalid idempotency operation scope")

    scope = "\0".join((str(org_id), str(actor_id), operation, key))
    scope_hash = hashlib.sha256(scope.encode("utf-8")).hexdigest()
    request_hash = hashlib.sha256(
        _canonical_json(request_payload).encode("utf-8")
    ).hexdigest()
    return IdempotencyClaim(scope_hash=scope_hash, request_hash=request_hash)


def replay_response(marker: str, claim: IdempotencyClaim) -> Dict[str, Any]:
    """Validate a persisted marker and return its original response body."""
    if not marker.startswith(claim.marker_prefix):
        raise IdempotencyStateError("Persisted idempotency scope is invalid")

    remainder = marker[len(claim.marker_prefix):]
    persisted_hash, separator, state = remainder.partition(":")
    if not separator:
        raise IdempotencyStateError("Persisted idempotency marker is malformed")
    if persisted_hash != claim.request_hash:
        raise IdempotencyConflictError(
            "Idempotency key was already used with a different payment request"
        )
    if state == "pending":
        raise IdempotencyStateError("Idempotent payment is still pending")
    if not state.startswith("complete:"):
        raise IdempotencyStateError("Persisted idempotency state is invalid")

    try:
        encoded = state.removeprefix("complete:")
        decoded = base64.urlsafe_b64decode(encoded.encode("ascii")).decode("utf-8")
        response = json.loads(decoded)
    except (ValueError, UnicodeError, json.JSONDecodeError) as exc:
        raise IdempotencyStateError("Persisted idempotency response is invalid") from exc
    if not isinstance(response, dict):
        raise IdempotencyStateError("Persisted idempotency response must be an object")
    return response
