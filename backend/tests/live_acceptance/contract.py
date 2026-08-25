"""Strict loader for the 18-operation live acceptance registry."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


MATRIX_PATH = Path(__file__).with_name("operation_matrix.json")
READINESS_PATH = Path(__file__).resolve().parents[3] / "docs/testing/live18-ui-template-readiness.json"
OPERATION_RE = re.compile(r"^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+\.prepare$")
TOOL_RE = re.compile(r"^erp_[a-z0-9_]+$")
RELATION_RE = re.compile(
    r"^(?:sales|procurement|finance|inventory|tax|compliance|automation|core)"
    r"\.[a-z][a-z0-9_]*$"
)
APPROVAL_POLICIES = {"actor_confirmation", "separate_approver"}
AVAILABILITY = {"published", "blocked"}


class MatrixContractError(ValueError):
    """The checked-in live-acceptance matrix is incomplete or ambiguous."""


@dataclass(frozen=True)
class OperationContract:
    id: str
    command_operation: str | None
    prepare_tool: str | None
    approval_policy: str
    rest_readback: str | None
    mcp_readback_tool: str | None
    database_relations: tuple[str, ...]
    scenario_steps: tuple[str, ...]
    availability: str
    blocker: str | None = None


def _required_text(row: dict[str, Any], field: str) -> str:
    value = row.get(field)
    if not isinstance(value, str) or not value.strip():
        raise MatrixContractError(f"{row.get('id', '<unknown>')}: {field} must be non-empty text")
    return value


def load_operation_matrix(path: Path = MATRIX_PATH) -> tuple[OperationContract, ...]:
    raw = json.loads(path.read_text())
    rows = raw.get("operations")
    expected_count = raw.get("required_operation_count")
    if not isinstance(rows, list) or expected_count != 18 or len(rows) != expected_count:
        raise MatrixContractError("live acceptance requires exactly 18 business operations")

    contracts: list[OperationContract] = []
    seen: set[str] = set()
    for row in rows:
        if not isinstance(row, dict):
            raise MatrixContractError("every operation entry must be an object")
        operation_id = _required_text(row, "id")
        if operation_id in seen:
            raise MatrixContractError(f"duplicate operation id: {operation_id}")
        seen.add(operation_id)
        availability = _required_text(row, "availability")
        approval = _required_text(row, "approval_policy")
        if availability not in AVAILABILITY or approval not in APPROVAL_POLICIES:
            raise MatrixContractError(f"{operation_id}: invalid availability or approval policy")

        command = row.get("command_operation")
        prepare_tool = row.get("prepare_tool")
        rest_readback = row.get("rest_readback")
        mcp_readback = row.get("mcp_readback_tool")
        blocker = row.get("blocker")
        relations = row.get("database_relations")
        steps = row.get("scenario_steps")
        if not isinstance(relations, list) or not relations or not all(
            isinstance(value, str) and RELATION_RE.fullmatch(value) for value in relations
        ):
            raise MatrixContractError(f"{operation_id}: canonical database relations are required")
        if not isinstance(steps, list) or not all(isinstance(value, str) and value for value in steps):
            raise MatrixContractError(f"{operation_id}: scenario_steps must be a string list")

        if availability == "published":
            if not isinstance(command, str) or not OPERATION_RE.fullmatch(command):
                raise MatrixContractError(f"{operation_id}: published command is invalid")
            if not isinstance(prepare_tool, str) or not TOOL_RE.fullmatch(prepare_tool):
                raise MatrixContractError(f"{operation_id}: published prepare tool is invalid")
            if not isinstance(mcp_readback, str) or not TOOL_RE.fullmatch(mcp_readback):
                raise MatrixContractError(f"{operation_id}: published MCP readback is invalid")
            if not isinstance(rest_readback, str) or not rest_readback.startswith("/api/"):
                raise MatrixContractError(f"{operation_id}: published REST readback is invalid")
            if not steps:
                raise MatrixContractError(f"{operation_id}: published operation lacks a live scenario")
            if blocker is not None:
                raise MatrixContractError(f"{operation_id}: published operation cannot carry a blocker")
        else:
            if any(value is not None for value in (command, prepare_tool, rest_readback, mcp_readback)):
                raise MatrixContractError(f"{operation_id}: blocked operation must not invent contracts")
            if steps:
                raise MatrixContractError(f"{operation_id}: blocked operation cannot claim a scenario")
            if not isinstance(blocker, str) or not blocker.strip():
                raise MatrixContractError(f"{operation_id}: blocked operation requires an exact blocker")

        contracts.append(OperationContract(
            id=operation_id,
            command_operation=command,
            prepare_tool=prepare_tool,
            approval_policy=approval,
            rest_readback=rest_readback,
            mcp_readback_tool=mcp_readback,
            database_relations=tuple(relations),
            scenario_steps=tuple(steps),
            availability=availability,
            blocker=blocker,
        ))
    return tuple(contracts)


def load_ready_operation_matrix(
    matrix_path: Path = MATRIX_PATH,
    readiness_path: Path = READINESS_PATH,
) -> tuple[OperationContract, ...]:
    contracts = load_operation_matrix(matrix_path)
    readiness = json.loads(readiness_path.read_text())
    rows = readiness.get("operations")
    ready_count = readiness.get("ready_count")
    if not isinstance(rows, list) or not isinstance(ready_count, int):
        raise MatrixContractError("live18 UI readiness registry is invalid")
    contract_ids = {item.id for item in contracts}
    readiness_ids = [row.get("id") for row in rows if isinstance(row, dict)]
    if (
        len(readiness_ids) != len(contracts)
        or len(set(readiness_ids)) != len(readiness_ids)
        or set(readiness_ids) != contract_ids
    ):
        raise MatrixContractError(
            "live18 UI readiness registry must cover the exact operation matrix"
        )
    ready_ids = {row["id"] for row in rows if row.get("status") == "ready"}
    if len(ready_ids) != ready_count:
        raise MatrixContractError(
            "live18 UI readiness count does not match its ready operations"
        )
    unknown_status = [
        row.get("id") for row in rows if row.get("status") not in {"ready", "blocked"}
    ]
    if unknown_status:
        raise MatrixContractError(
            f"live18 UI readiness has invalid status: {unknown_status}"
        )
    return tuple(item for item in contracts if item.id in ready_ids)
