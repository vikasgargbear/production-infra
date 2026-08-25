"""Fail-closed configuration for the production live18 certification run."""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping
from urllib.parse import urlparse


SHA_RE = re.compile(r"^[0-9a-f]{40}$")
UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)
REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


class Live18GateError(RuntimeError):
    """Raised before I/O when a live certification gate is incomplete."""


def _required(env: Mapping[str, str], name: str) -> str:
    value = env.get(name, "").strip()
    if not value:
        raise Live18GateError(f"missing required live18 variable: {name}")
    return value


def _https_origin(value: str, name: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise Live18GateError(f"{name} must be an HTTPS origin without embedded credentials")
    if parsed.hostname in {"localhost", "127.0.0.1", "::1"}:
        raise Live18GateError(f"{name} must not use localhost")
    return value.rstrip("/")


@dataclass(frozen=True)
class Live18Config:
    expected_deployed_sha: str
    app_origin: str
    api_origin: str
    mcp_origin: str
    metadata_urls: tuple[str, ...]
    requester_email: str
    requester_password: str = field(repr=False)
    reviewer_email: str = ""
    reviewer_password: str = field(default="", repr=False)
    expected_org_id: str = ""
    expected_branch_id: str = ""
    fixture_path: Path = Path()


def load_live18_config(env: Mapping[str, str] | None = None) -> Live18Config:
    values = os.environ if env is None else env
    if _required(values, "LIVE18_WRITE_ACK") != "canonical-disposable-only":
        raise Live18GateError("LIVE18_WRITE_ACK must be exactly canonical-disposable-only")
    expected_sha = _required(values, "LIVE18_EXPECTED_DEPLOYED_SHA").lower()
    if not SHA_RE.fullmatch(expected_sha):
        raise Live18GateError("LIVE18_EXPECTED_DEPLOYED_SHA must be a full lowercase git SHA")

    metadata_value = _required(values, "LIVE18_METADATA_URLS_JSON")
    try:
        metadata_items = json.loads(metadata_value)
    except json.JSONDecodeError as exc:
        raise Live18GateError("LIVE18_METADATA_URLS_JSON must be valid JSON") from exc
    if not isinstance(metadata_items, list) or len(metadata_items) < 2:
        raise Live18GateError("at least app and API metadata URLs are required")
    metadata_urls = tuple(_https_origin(str(item), "metadata URL") for item in metadata_items)
    if len(set(metadata_urls)) != len(metadata_urls):
        raise Live18GateError("metadata URLs must be distinct")

    requester_email = _required(values, "LIVE18_REQUESTER_EMAIL").lower()
    reviewer_email = _required(values, "LIVE18_REVIEWER_EMAIL").lower()
    if requester_email == reviewer_email:
        raise Live18GateError("requester and reviewer must be distinct users")
    org_id = _required(values, "LIVE18_EXPECTED_ORG_ID").lower()
    branch_id = _required(values, "LIVE18_EXPECTED_BRANCH_ID").lower()
    if not UUID_RE.fullmatch(org_id) or not UUID_RE.fullmatch(branch_id):
        raise Live18GateError("organization and branch identities must be canonical UUIDs")

    fixture_path = Path(_required(values, "LIVE18_FIXTURE_PATH"))
    if not fixture_path.is_absolute() or not fixture_path.is_file():
        raise Live18GateError("LIVE18_FIXTURE_PATH must name an absolute reviewed fixture file")
    if REPOSITORY_ROOT == fixture_path.resolve() or REPOSITORY_ROOT in fixture_path.resolve().parents:
        raise Live18GateError("LIVE18_FIXTURE_PATH must remain outside the repository")

    return Live18Config(
        expected_deployed_sha=expected_sha,
        app_origin=_https_origin(_required(values, "LIVE18_APP_ORIGIN"), "LIVE18_APP_ORIGIN"),
        api_origin=_https_origin(_required(values, "LIVE18_API_ORIGIN"), "LIVE18_API_ORIGIN"),
        mcp_origin=_https_origin(_required(values, "LIVE18_MCP_ORIGIN"), "LIVE18_MCP_ORIGIN"),
        metadata_urls=metadata_urls,
        requester_email=requester_email,
        requester_password=_required(values, "LIVE18_REQUESTER_PASSWORD"),
        reviewer_email=reviewer_email,
        reviewer_password=_required(values, "LIVE18_REVIEWER_PASSWORD"),
        expected_org_id=org_id,
        expected_branch_id=branch_id,
        fixture_path=fixture_path,
    )
