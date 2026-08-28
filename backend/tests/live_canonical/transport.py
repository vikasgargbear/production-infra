"""REST and MCP adapters for the same canonical command handlers."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import jwt
import requests

from app.domain.operator_actions import policy_for

from .config import CanonicalLiveConfig


class TransportContractError(AssertionError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        code: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.metadata = metadata or {}


def _failure_detail(body: Any) -> tuple[str | None, str | None, dict[str, Any]]:
    if not isinstance(body, dict):
        return None, None, {}
    detail = body.get("detail", body)
    if not isinstance(detail, dict):
        return None, str(detail) if detail is not None else None, {}
    code = detail.get("code")
    message = detail.get("message")
    metadata = detail.get("metadata")
    return (
        str(code) if code is not None else None,
        str(message) if message is not None else None,
        dict(metadata) if isinstance(metadata, dict) else {},
    )


def _json(response: requests.Response) -> dict[str, Any]:
    try:
        body = response.json()
    except ValueError as exc:
        raise TransportContractError(
            f"canonical endpoint returned non-JSON status {response.status_code}"
        ) from exc
    if not response.ok:
        code, message, metadata = _failure_detail(body)
        raise TransportContractError(
            f"canonical endpoint failed status={response.status_code} code={code!r}: {message or 'no error message'}",
            status_code=response.status_code,
            code=code,
            metadata=metadata,
        )
    if not isinstance(body, dict):
        raise TransportContractError("canonical endpoint JSON must be an object")
    return body


@dataclass
class RestActionClient:
    config: CanonicalLiveConfig
    session: requests.Session
    oauth_claims: dict[str, dict[str, Any]]

    @classmethod
    def build(
        cls, config: CanonicalLiveConfig
    ) -> "RestActionClient":
        session = requests.Session()
        session.headers.update(
            {
                "Authorization": f"Bearer {config.service_token}",
                "Content-Type": "application/json",
            }
        )
        claims = {
            "requester": jwt.decode(
                config.mcp_access_token, options={"verify_signature": False}
            ),
            "reviewer": jwt.decode(
                config.mcp_reviewer_access_token,
                options={"verify_signature": False},
            ),
        }
        for role, identity in claims.items():
            if not all(
                isinstance(identity.get(name), str) and identity[name]
                for name in ("iss", "sub", "client_id", "organization_id")
            ):
                raise TransportContractError(
                    f"{role} OAuth token omitted the canonical delegation identity"
                )
            if identity["organization_id"] != str(config.test_org_id):
                raise TransportContractError(
                    f"{role} OAuth token is outside the gated organization"
                )
        if claims["requester"]["sub"] != str(config.test_auth_user_id):
            raise TransportContractError(
                "requester OAuth subject differs from the gated Auth user"
            )
        return cls(config, session, claims)

    def _delegated_token(
        self,
        operation_key: str,
        *,
        actor: str,
        payload: dict[str, Any] | None,
        command_request_id: str | None,
    ) -> str:
        identity = self.oauth_claims[actor]
        branch_ids: list[str] = []
        if command_request_id is None and payload:
            policy = policy_for(operation_key)
            if policy is None:
                raise TransportContractError(
                    f"reviewed action policy is missing: {operation_key}"
                )
            seen_branch_ids: set[str] = set()
            for field in policy.branch_fields:
                value = payload.get(field)
                if value is not None:
                    branch_id = str(value)
                    if branch_id not in seen_branch_ids:
                        seen_branch_ids.add(branch_id)
                        branch_ids.append(branch_id)
        operation_mode = (
            "read" if operation_key == "automation.command.status.get" else "write"
        )
        response = self.session.post(
            f"{self.config.api_base_url}/api/internal/mcp/agent-grants/authorize-action",
            json={
                "issuer": identity["iss"],
                "subject": identity["sub"],
                "client_id": identity["client_id"],
                "organization_id": identity["organization_id"],
                "operation_key": operation_key,
                "capability_code": operation_key,
                "operation_mode": operation_mode,
                "branch_ids": branch_ids,
                "command_request_id": command_request_id,
            },
            timeout=self.config.timeout_seconds,
        )
        body = _json(response)
        token = body.get("delegated_access_token")
        if (
            body.get("allowed") is not True
            or body.get("operation_key") != operation_key
            or body.get("subject") != identity["sub"]
            or body.get("client_id") != identity["client_id"]
            or body.get("command_request_id") != command_request_id
            or not isinstance(token, str)
            or len(token) < 32
        ):
            raise TransportContractError(
                "reviewed action-grant issuer returned a drifted delegation"
            )
        return token

    def _call(
        self,
        method: str,
        path: str,
        operation_key: str,
        payload: dict[str, Any] | None = None,
        *,
        actor: str = "requester",
        command_request_id: str | None = None,
    ):
        token = self._delegated_token(
            operation_key,
            actor=actor,
            payload=payload,
            command_request_id=command_request_id,
        )
        return _json(
            self.session.request(
                method,
                f"{self.config.api_base_url}{path}",
                json=payload,
                headers={"X-MCP-Delegated-Authorization": f"Bearer {token}"},
                timeout=self.config.timeout_seconds,
            )
        )

    def ready(self) -> dict[str, Any]:
        try:
            return self._call(
                "GET", self.config.ready_path, "automation.command.status.get"
            )
        except TransportContractError as exc:
            if exc.status_code == 503 and exc.code == "POLICY_BLOCKED":
                return {
                    "status": "blocked",
                    "failure": {
                        "code": exc.code,
                        "message": str(exc),
                        "metadata": exc.metadata,
                    },
                }
            raise

    def prepare(self, command_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        path = self.config.prepare_path.format(command_type=quote(command_type, safe="."))
        return self._call("POST", path, command_type, payload)

    def approve(
        self,
        command_request_id: str,
        preview_hash: str,
        idempotency_key: str,
        *,
        actor: str = "requester",
    ) -> dict[str, Any]:
        root = self.config.command_path.format(command_request_id=command_request_id)
        return self._call(
            "POST",
            f"{root}/approve",
            "automation.command.approve",
            {
                "preview_hash": preview_hash,
                "approval_intent": "approve",
                "idempotency_key": idempotency_key,
            },
            actor=actor,
            command_request_id=command_request_id,
        )

    def execute(
        self, command_request_id: str, preview_hash: str, idempotency_key: str
    ) -> dict[str, Any]:
        root = self.config.command_path.format(command_request_id=command_request_id)
        return self._call(
            "POST",
            f"{root}/execute",
            "automation.command.execute",
            {"preview_hash": preview_hash, "idempotency_key": idempotency_key},
            command_request_id=command_request_id,
        )

    def status(self, command_request_id: str) -> dict[str, Any]:
        path = self.config.command_path.format(command_request_id=command_request_id)
        return self._call(
            "GET",
            path,
            "automation.command.status.get",
            command_request_id=command_request_id,
        )


@dataclass
class McpActionClient:
    config: CanonicalLiveConfig
    sessions: dict[str, requests.Session]

    @classmethod
    def build(cls, config: CanonicalLiveConfig) -> "McpActionClient":
        sessions = {}
        for actor, token in (
            ("requester", config.mcp_access_token),
            ("reviewer", config.mcp_reviewer_access_token),
        ):
            session = requests.Session()
            session.headers.update(
                {
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                }
            )
            sessions[actor] = session
        return cls(config, sessions)

    def call(
        self,
        tool: str,
        arguments: dict[str, Any],
        *,
        actor: str = "requester",
    ) -> dict[str, Any]:
        request_id = str(uuid.uuid4())
        response = self.sessions[actor].post(
            self.config.mcp_url,
            json={
                "jsonrpc": "2.0",
                "id": request_id,
                "method": "tools/call",
                "params": {"name": tool, "arguments": arguments},
            },
            timeout=self.config.timeout_seconds,
        )
        envelope = _json(response)
        if envelope.get("id") != request_id:
            raise TransportContractError("MCP response id does not match request")
        if "error" in envelope:
            error = envelope["error"]
            code = str(error.get("code")) if error.get("code") is not None else None
            message = str(error.get("message") or "MCP tool failed")
            data = error.get("data")
            detail_code, detail_message, metadata = _failure_detail(data)
            raise TransportContractError(
                f"MCP tool failed code={detail_code or code!r}: {detail_message or message}",
                code=detail_code or code,
                metadata=metadata,
            )
        result = envelope.get("result")
        if not isinstance(result, dict):
            raise TransportContractError("MCP tool returned a non-object result")
        if result.get("isError") is True:
            structured = result.get("structuredContent")
            code, message, metadata = _failure_detail(structured)
            if message is None:
                for item in result.get("content", []):
                    if item.get("type") != "text":
                        continue
                    try:
                        decoded = json.loads(item.get("text", ""))
                    except (TypeError, json.JSONDecodeError):
                        message = str(item.get("text") or "MCP tool returned an error")
                    else:
                        item_code, item_message, item_metadata = _failure_detail(decoded)
                        code = code or item_code
                        message = message or item_message
                        metadata = metadata or item_metadata
                    break
            raise TransportContractError(
                f"MCP tool returned an error result code={code!r}: {message or 'no error message'}",
                code=code,
                metadata=metadata,
            )
        structured = result.get("structuredContent")
        if isinstance(structured, dict):
            return structured
        for item in result.get("content", []):
            if item.get("type") == "text":
                try:
                    decoded = json.loads(item["text"])
                except (KeyError, TypeError, json.JSONDecodeError):
                    continue
                if isinstance(decoded, dict):
                    return decoded
        raise TransportContractError("MCP result lacks structured JSON content")


def immutable_preview_projection(body: dict[str, Any]) -> dict[str, Any]:
    """Remove transport-local identifiers while retaining all business evidence."""

    preview = body.get("preview", body)
    if not isinstance(preview, dict):
        raise TransportContractError("prepare response must contain an object preview")
    excluded = {"command_request_id", "expires_at", "preview_hash", "created_at"}
    return {key: value for key, value in preview.items() if key not in excluded}


def required_preview_fields(body: dict[str, Any]) -> tuple[str, str]:
    preview = body.get("preview", body)
    required = {
        "command_request_id",
        "preview_hash",
        "expires_at",
        "resolved_references",
        "source_versions",
        "calculation_ruleset",
        "inventory_impact",
        "financial_impact",
        "tax_impact",
        "policy_warnings",
        "required_approvals",
    }
    missing = sorted(required - set(preview))
    if missing:
        raise TransportContractError(f"prepare preview missing fields: {missing}")
    return str(preview["command_request_id"]), str(preview["preview_hash"])
