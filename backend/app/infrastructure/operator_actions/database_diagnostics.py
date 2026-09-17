"""Server-only, payload-free diagnostics for reviewed database rejections."""

import hashlib
import logging
import re
from typing import Any


_IDENTIFIER = re.compile(r"[a-z_][a-z0-9_]{0,62}\Z", re.ASCII)
_OPERATION = re.compile(r"[a-z_]+(?:\.[a-z_]+){1,3}\Z", re.ASCII)
_LOGGER = logging.getLogger(__name__)


def log_database_rejection(
    *, sqlstate: str, operation_key: str, diagnostic: Any
) -> None:
    """Never log exception text, SQL, parameters, DETAIL, HINT or CONTEXT.

    Custom RAISE messages can contain business facts. Hash their exact primary
    message instead of printing it; operators can match static source messages
    without exposing dynamic values. Identifiers are independently filtered.
    """
    fields: dict[str, str] = {
        "event_type": "canonical_database_rejection",
        "sqlstate": sqlstate,
    }
    if len(operation_key) <= 100 and _OPERATION.fullmatch(operation_key):
        fields["operation"] = operation_key
    for attribute, field in (
        ("constraint_name", "db_constraint"),
        ("schema_name", "db_schema"),
        ("table_name", "db_table"),
    ):
        value = getattr(diagnostic, attribute, None)
        if isinstance(value, str) and _IDENTIFIER.fullmatch(value):
            fields[field] = value
    primary = getattr(diagnostic, "message_primary", None)
    if isinstance(primary, str) and primary:
        fields["db_reason_fingerprint"] = hashlib.sha256(
            primary.encode("utf-8", errors="replace")
        ).hexdigest()
    _LOGGER.warning("Canonical database command rejected", extra=fields)
