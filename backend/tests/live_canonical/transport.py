"""REST and MCP adapters for the same canonical command handlers."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import requests

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
    delegated_tokens: dict[str, str]

    @classmethod
    def build(
        cls, config: CanonicalLiveConfig, delegated_tokens: dict[str, str]
    ) -> "RestActionClient":
        session = requests.Session()
        session.headers.update(
            {
                "Authorization": f"Bearer {config.service_token}",
                "Content-Type": "application/json",
            }
        )
        return cls(config, session, delegated_tokens)

    def _call(
        self,
        method: str,
        path: str,
        operation_key: str,
        payload: dict[str, Any] | None = None,
    ):
        token = self.delegated_tokens.get(operation_key)
        if not token:
            raise TransportContractError(
                f"delegated token bundle lacks operation: {operation_key}"
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
        self, command_request_id: str, preview_hash: str, idempotency_key: str
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
        )

    def status(self, command_request_id: str) -> dict[str, Any]:
        path = self.config.command_path.format(command_request_id=command_request_id)
        return self._call("GET", path, "automation.command.status.get")


@dataclass
class McpActionClient:
    config: CanonicalLiveConfig
    session: requests.Session

    @classmethod
    def build(cls, config: CanonicalLiveConfig) -> "McpActionClient":
        session = requests.Session()
        session.headers.update(
            {
                "Authorization": f"Bearer {config.mcp_access_token}",
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
            }
        )
        return cls(config, session)

    def call(self, tool: str, arguments: dict[str, Any]) -> dict[str, Any]:
        request_id = str(uuid.uuid4())
        response = self.session.post(
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
