"""Fail-closed configuration for destructive canonical live verification."""

from __future__ import annotations

import os
import re
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping
from urllib.parse import urlparse


PROJECT_REF_RE = re.compile(r"^[a-z0-9]{20}$")
TRUE_VALUES = {"true"}
DEFAULT_PREPARE_PATH = "/api/internal/mcp/actions/{command_type}/prepare"
DEFAULT_COMMAND_PATH = "/api/internal/mcp/commands/{command_request_id}"
DEFAULT_READY_PATH = "/api/internal/mcp/actions/ready"


class LiveGateError(RuntimeError):
    """Raised before network access when the destructive-run gate is incomplete."""


@dataclass(frozen=True)
class CanonicalLiveConfig:
    api_base_url: str
    database_url: str = field(repr=False)
    service_token: str = field(repr=False)
    mcp_url: str
    mcp_access_token: str = field(repr=False)
    mcp_reviewer_access_token: str = field(repr=False)
    project_ref: str
    allowed_project_ref: str
    production_project_refs: frozenset[str]
    test_org_id: uuid.UUID
    test_auth_user_id: uuid.UUID
    test_branch_id: uuid.UUID
    denial_org_id: uuid.UUID
    fixture_input_path: Path
    timeout_seconds: int
    prepare_path: str = DEFAULT_PREPARE_PATH
    command_path: str = DEFAULT_COMMAND_PATH
    ready_path: str = DEFAULT_READY_PATH


def _required(env: Mapping[str, str], name: str) -> str:
    value = env.get(name, "").strip()
    if not value:
        raise LiveGateError(f"missing required live gate variable: {name}")
    return value


def _uuid(value: str, name: str) -> uuid.UUID:
    try:
        parsed = uuid.UUID(value)
    except (ValueError, AttributeError) as exc:
        raise LiveGateError(f"{name} must be an exact UUID") from exc
    if str(parsed) != value.lower():
        raise LiveGateError(f"{name} must use canonical UUID text")
    return parsed


def _http_origin(value: str, name: str) -> str:
    parsed = urlparse(value)
    loopback = parsed.hostname in {"127.0.0.1", "localhost", "::1"}
    if not parsed.hostname or parsed.username or parsed.password:
        raise LiveGateError(f"{name} must be an origin without credentials")
    if parsed.scheme != "https" and not (parsed.scheme == "http" and loopback):
        raise LiveGateError(f"{name} must use HTTPS (HTTP is allowed only on loopback)")
    return value.rstrip("/")


def _assert_database_project(database_url: str, project_ref: str) -> None:
    parsed = urlparse(database_url)
    if parsed.scheme not in {"postgres", "postgresql"} or not parsed.hostname:
        raise LiveGateError("PHARMA_CANONICAL_LIVE_DATABASE_URL must be PostgreSQL")
    username = parsed.username or ""
    direct_role = (
        parsed.hostname == f"db.{project_ref}.supabase.co"
        and username == "erp_runtime"
    )
    pooler_role = (
        parsed.hostname.endswith(".pooler.supabase.com")
        and username == f"erp_runtime.{project_ref}"
    )
    if not (direct_role or pooler_role):
        raise LiveGateError(
            "database URL does not prove the exact gated Supabase project and erp_runtime role"
        )


def _exact_internal_paths(env: Mapping[str, str]) -> tuple[str, str, str]:
    prepare = env.get("PHARMA_CANONICAL_LIVE_PREPARE_PATH", DEFAULT_PREPARE_PATH)
    command = env.get("PHARMA_CANONICAL_LIVE_COMMAND_PATH", DEFAULT_COMMAND_PATH)
    ready = env.get("PHARMA_CANONICAL_LIVE_READY_PATH", DEFAULT_READY_PATH)
    if (prepare, command, ready) != (
        DEFAULT_PREPARE_PATH,
        DEFAULT_COMMAND_PATH,
        DEFAULT_READY_PATH,
    ):
        raise LiveGateError(
            "configured paths differ from the reviewed canonical action API registry"
        )
    return prepare, command, ready


def load_live_config(env: Mapping[str, str] | None = None) -> CanonicalLiveConfig:
    """Validate every destructive-run assertion without performing any I/O."""

    values = os.environ if env is None else env
    if values.get("PHARMA_CANONICAL_LIVE_WRITE_ACK", "").strip().lower() not in TRUE_VALUES:
        raise LiveGateError("PHARMA_CANONICAL_LIVE_WRITE_ACK must be exactly true")
    if _required(values, "PHARMA_CANONICAL_LIVE_TARGET_KIND") != "disposable_test":
        raise LiveGateError("live target kind must be exactly disposable_test")

    project_ref = _required(values, "PHARMA_CANONICAL_LIVE_PROJECT_REF")
    allowed_ref = _required(values, "PHARMA_CANONICAL_LIVE_ALLOWED_PROJECT_REF")
    if not PROJECT_REF_RE.fullmatch(project_ref):
        raise LiveGateError("Supabase project ref must be 20 lowercase letters or digits")
    if project_ref != allowed_ref:
        raise LiveGateError("target project ref does not match the reviewed allowed ref")

    production_refs = frozenset(
        item.strip()
        for item in _required(values, "PHARMA_CANONICAL_PRODUCTION_PROJECT_REFS").split(",")
        if item.strip()
    )
    if project_ref in production_refs:
        raise LiveGateError("refusing to run against a declared production project")

    database_url = _required(values, "PHARMA_CANONICAL_LIVE_DATABASE_URL")
    _assert_database_project(database_url, project_ref)
    prepare_path, command_path, ready_path = _exact_internal_paths(values)
    fixture_path = Path(_required(values, "PHARMA_CANONICAL_LIVE_FIXTURE_INPUT_PATH"))
    timeout = int(values.get("PHARMA_CANONICAL_LIVE_TIMEOUT_SECONDS", "30"))
    if timeout < 1 or timeout > 120:
        raise LiveGateError("live timeout must be between 1 and 120 seconds")

    test_org_id = _uuid(
        _required(values, "PHARMA_CANONICAL_LIVE_TEST_ORG_ID"),
        "PHARMA_CANONICAL_LIVE_TEST_ORG_ID",
    )
    denial_org_id = _uuid(
        _required(values, "PHARMA_CANONICAL_LIVE_DENIAL_ORG_ID"),
        "PHARMA_CANONICAL_LIVE_DENIAL_ORG_ID",
    )
    if denial_org_id == test_org_id:
        raise LiveGateError("tenant-denial organization must differ from the test organization")

    return CanonicalLiveConfig(
        api_base_url=_http_origin(
            _required(values, "PHARMA_CANONICAL_LIVE_API_BASE_URL"),
            "PHARMA_CANONICAL_LIVE_API_BASE_URL",
        ),
        database_url=database_url,
        service_token=_required(values, "PHARMA_CANONICAL_LIVE_SERVICE_TOKEN"),
        mcp_url=_http_origin(
            _required(values, "PHARMA_CANONICAL_MCP_URL"),
            "PHARMA_CANONICAL_MCP_URL",
        ),
        mcp_access_token=_required(values, "PHARMA_CANONICAL_MCP_ACCESS_TOKEN"),
        mcp_reviewer_access_token=_required(
            values, "PHARMA_CANONICAL_MCP_REVIEWER_ACCESS_TOKEN"
        ),
        project_ref=project_ref,
        allowed_project_ref=allowed_ref,
        production_project_refs=production_refs,
        test_org_id=test_org_id,
        test_auth_user_id=_uuid(
            _required(values, "PHARMA_CANONICAL_LIVE_TEST_AUTH_USER_ID"),
            "PHARMA_CANONICAL_LIVE_TEST_AUTH_USER_ID",
        ),
        test_branch_id=_uuid(
            _required(values, "PHARMA_CANONICAL_LIVE_TEST_BRANCH_ID"),
            "PHARMA_CANONICAL_LIVE_TEST_BRANCH_ID",
        ),
        denial_org_id=denial_org_id,
        fixture_input_path=fixture_path,
        timeout_seconds=timeout,
        prepare_path=prepare_path,
        command_path=command_path,
        ready_path=ready_path,
    )
