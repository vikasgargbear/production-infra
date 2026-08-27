"""Safe structured diagnostics for canonical operator-command transports.

The command payload, preview, authentication material, and idempotency key are
deliberately absent from this API.  Callers can correlate an outcome using the
request context installed by ``RequestLoggerMiddleware`` plus canonical IDs.
"""

from __future__ import annotations

import logging
from typing import Literal
from uuid import UUID


_logger = logging.getLogger("app.operator_actions")


def record_operator_action(
    *,
    operation: str,
    outcome: Literal["accepted", "rejected"],
    organization_id: UUID | None = None,
    command_request_id: UUID | None = None,
    command_status: str | None = None,
    error_code: str | None = None,
    sqlstate: str | None = None,
    idempotency_replayed: bool | None = None,
) -> None:
    """Record only allowlisted command metadata, never business payloads."""

    extra: dict[str, object] = {
        "event_type": "canonical_operator_action",
        "operation": operation,
        "outcome": outcome,
    }
    optional_fields = {
        "org_id": organization_id,
        "command_request_id": command_request_id,
        "command_status": command_status,
        "error_code": error_code,
        "sqlstate": sqlstate,
        "idempotency_replayed": idempotency_replayed,
    }
    extra.update(
        {
            name: str(value) if isinstance(value, UUID) else value
            for name, value in optional_fields.items()
            if value is not None
        }
    )
    log = _logger.info if outcome == "accepted" else _logger.warning
    log("Canonical operator action outcome", extra=extra)
