"""Load and validate the checked canonical baseline migration package."""

from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any


BACKEND_ROOT = Path(__file__).resolve().parents[1]
BASELINE_SQL_PATH = (
    BACKEND_ROOT / "alembic" / "sql" / "20260820_0001_canonical_v1.sql"
)
BASELINE_MANIFEST_PATH = BASELINE_SQL_PATH.with_suffix(".manifest.json")
REVISION = "20260820_0001"
APPROVAL_ENVIRONMENT_VARIABLE = "CANONICAL_BASELINE_APPROVED_SHA256"
GENERATOR_COMMAND = (
    "python3 backend/scripts/generate_canonical_baseline.py "
    "--enforcement-root database/canonical"
)
SHA256 = re.compile(r"^[0-9a-f]{64}$")
TRANSACTION_CONTROL = re.compile(r"^(?:BEGIN|COMMIT|ROLLBACK);$", re.IGNORECASE)


class CanonicalBaselineError(RuntimeError):
    """The reviewed package or migration preflight is invalid."""


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def unwrap_generator_transaction(sql: str) -> str:
    """Remove only the generator-owned outer transaction wrapper.

    The baseline generator deliberately emits a directly executable transaction.
    Alembic owns the migration transaction, so its revision runner must remove
    exactly that outer pair. Any additional standalone transaction control is a
    packaging error rather than something to guess around.
    """
    if "-- DEPLOYABLE DDL:" not in sql:
        raise CanonicalBaselineError("canonical baseline is not marked deployable")
    if re.search(r"\bIF\s+NOT\s+EXISTS\b", sql, re.IGNORECASE):
        raise CanonicalBaselineError("canonical baseline contains IF NOT EXISTS")

    lines = sql.splitlines()
    executable = [
        index
        for index, line in enumerate(lines)
        if line.strip() and not line.lstrip().startswith("--")
    ]
    if not executable:
        raise CanonicalBaselineError("canonical baseline is empty")
    first, last = executable[0], executable[-1]
    if lines[first].strip() != "BEGIN;" or lines[last].strip() != "COMMIT;":
        raise CanonicalBaselineError(
            "canonical baseline must have one generator-owned outer BEGIN/COMMIT pair"
        )
    nested = [
        index + 1
        for index in executable[1:-1]
        if TRANSACTION_CONTROL.fullmatch(lines[index].strip())
    ]
    if nested:
        raise CanonicalBaselineError(
            f"canonical baseline has nested standalone transaction control at lines {nested}"
        )

    body = "\n".join((*lines[:first], *lines[first + 1 : last], *lines[last + 1 :]))
    return body.rstrip() + "\n"


def load_manifest() -> dict[str, Any]:
    try:
        value = json.loads(BASELINE_MANIFEST_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CanonicalBaselineError(f"cannot read canonical baseline manifest: {exc}") from exc
    if not isinstance(value, dict):
        raise CanonicalBaselineError("canonical baseline manifest must be a JSON object")
    required = {
        "format_version",
        "revision",
        "generator_command",
        "source_sql_sha256",
        "alembic_body_sha256",
        "transaction_wrapper",
    }
    if set(value) != required:
        raise CanonicalBaselineError("canonical baseline manifest keys do not match contract")
    if value["format_version"] != 1 or value["revision"] != REVISION:
        raise CanonicalBaselineError("canonical baseline manifest revision contract drift")
    if value["generator_command"] != GENERATOR_COMMAND:
        raise CanonicalBaselineError("canonical baseline generator command contract drift")
    if value["transaction_wrapper"] != "generator_outer_pair_removed_by_alembic_runner_v1":
        raise CanonicalBaselineError("canonical baseline transaction contract drift")
    for key in ("source_sql_sha256", "alembic_body_sha256"):
        if not isinstance(value[key], str) or not SHA256.fullmatch(value[key]):
            raise CanonicalBaselineError(f"canonical baseline manifest has invalid {key}")
    return value


def load_packaged_baseline() -> tuple[str, dict[str, Any]]:
    """Return verified Alembic-owned SQL and its static manifest."""
    try:
        source = BASELINE_SQL_PATH.read_text(encoding="utf-8")
    except OSError as exc:
        raise CanonicalBaselineError(f"cannot read packaged canonical baseline: {exc}") from exc
    manifest = load_manifest()
    if _digest(source) != manifest["source_sql_sha256"]:
        raise CanonicalBaselineError("packaged canonical baseline source hash mismatch")
    body = unwrap_generator_transaction(source)
    if _digest(body) != manifest["alembic_body_sha256"]:
        raise CanonicalBaselineError("packaged canonical Alembic body hash mismatch")
    return body, manifest


def require_approved_hash(manifest: dict[str, Any]) -> None:
    approved = os.environ.get(APPROVAL_ENVIRONMENT_VARIABLE, "")
    if approved != manifest["source_sql_sha256"]:
        raise CanonicalBaselineError(
            f"{APPROVAL_ENVIRONMENT_VARIABLE} must equal the reviewed source SQL SHA-256"
        )


def require_bootstrap_migration_principal(connection: Any) -> str:
    """Reject runtime or insufficiently privileged first-baseline principals."""
    result = connection.exec_driver_sql(
        """
        SELECT role.rolname, role.rolsuper, role.rolcreaterole
        FROM pg_catalog.pg_roles AS role
        WHERE role.rolname = CURRENT_USER
        """
    ).one()
    role_name, is_superuser, can_create_role = result
    if role_name in {"erp_app", "erp_runtime", "erp_calculator"}:
        raise CanonicalBaselineError("runtime principals cannot apply canonical migrations")
    if not (is_superuser or can_create_role):
        raise CanonicalBaselineError(
            "first canonical baseline requires a reviewed bootstrap principal with CREATEROLE"
        )
    return str(role_name)


def execute_packaged_sql(cursor: Any, sql: str) -> None:
    """Execute the static package and identify a failed generated statement."""
    try:
        cursor.execute(sql)
    except Exception as exc:
        position_text = getattr(getattr(exc, "diag", None), "statement_position", None)
        try:
            position = int(position_text)
        except (TypeError, ValueError):
            raise
        offset = max(position - 1, 0)
        line_number = sql.count("\n", 0, offset) + 1
        statement_start = sql.rfind(";", 0, offset) + 1
        statement_end = sql.find(";", offset)
        if statement_end < 0:
            statement_end = min(len(sql), offset + 700)
        statement = " ".join(sql[statement_start:statement_end].split())[:700]
        raise CanonicalBaselineError(
            f"canonical baseline SQL failed at generated line {line_number}: {statement}"
        ) from exc
