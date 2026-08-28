from __future__ import annotations

import json
import ast
from pathlib import Path
import re

from scripts.provision_canonical_demo import (
    _SAFE_FAILURE_ERROR_CODES,
    _SAFE_FAILURE_OPERATIONS,
    _SAFE_FAILURE_REASONS,
    _SAFE_FAILURE_SQLSTATES,
    safe_failure_summary,
)


ROOT = Path(__file__).resolve().parents[3]
WORKFLOW = ROOT / ".github/workflows/canonical-staging.yml"


def test_failure_summary_keeps_only_bounded_allowlisted_facts() -> None:
    secret = "Bearer secret-token postgresql://user:password@database.example/erp"
    payload = {
        "status_code": 422,
        "detail": {
            "error_code": "VALIDATION_FAILED",
            "operation": "automation.command.execute",
            "reason": "CANONICAL_DATABASE_POLICY_REJECTED",
            "sqlstate": "23514",
            "authorization": secret,
            "request": {"customer_name": "must-not-leak"},
        },
    }

    summary = safe_failure_summary(RuntimeError(json.dumps(payload) + " " + secret))

    assert summary["status_code"] == "422"
    assert summary["error_code"] == "VALIDATION_FAILED"
    assert summary["operation"] == "automation.command.execute"
    assert summary["reason"] == "CANONICAL_DATABASE_POLICY_REJECTED"
    assert summary["sqlstate"] == "23514"
    rendered = json.dumps(summary, sort_keys=True)
    assert "secret-token" not in rendered
    assert "password" not in rendered
    assert "customer_name" not in rendered
    assert len(summary["fingerprint_sha256"]) == 64


def test_failure_summary_does_not_echo_unstructured_exception_text() -> None:
    summary = safe_failure_summary(ValueError("private free-form business payload"))

    assert summary["exception_type"] == "ValueError"
    assert set(summary) == {"exception_type", "fingerprint_sha256"}
    assert "private" not in json.dumps(summary)


def test_failure_summary_rejects_secret_shaped_values_in_every_diagnostic_field() -> None:
    token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWNyZXQifQ.signature"
    for field in ("error_code", "operation", "reason", "sqlstate", "status_code"):
        summary = safe_failure_summary(RuntimeError(json.dumps({field: token})))
        assert field not in summary
        assert token not in json.dumps(summary)


def test_failure_summary_bounds_deep_json_and_brace_storms() -> None:
    deep = '{"nested":' * 1500 + '{"reason":"sk-live-ABC123"}' + "}" * 1500
    braces = "{" * 65536

    for payload in (deep, braces):
        summary = safe_failure_summary(RuntimeError(payload))
        assert set(summary) == {"exception_type", "fingerprint_sha256"}
        assert "sk-live" not in json.dumps(summary)


def _workflow_set(source: str, name: str) -> frozenset[str]:
    match = re.search(rf"(?m)^\s*{name}\s*=\s*", source)
    assert match is not None
    value = source[match.end():]
    start = value.index("{")
    depth = 0
    end = None
    for index, character in enumerate(value[start:], start=start):
        if character == "{":
            depth += 1
        elif character == "}":
            depth -= 1
            if depth == 0:
                end = index + 1
                break
    assert end is not None
    return frozenset(ast.literal_eval(value[start:end]))


def test_workflow_consumer_uses_the_same_failure_allowlists() -> None:
    workflow = WORKFLOW.read_text(encoding="utf-8")

    assert _workflow_set(workflow, "allowed_error_codes") == _SAFE_FAILURE_ERROR_CODES
    assert _workflow_set(workflow, "allowed_operations") == _SAFE_FAILURE_OPERATIONS
    assert _workflow_set(workflow, "allowed_reasons") == _SAFE_FAILURE_REASONS
    assert _workflow_set(workflow, "allowed_sqlstates") == _SAFE_FAILURE_SQLSTATES
    assert _workflow_set(workflow, "allowed_status_codes") == frozenset({
        "400", "401", "403", "404", "409", "422", "429", "500", "503",
    })
    assert "except (json.JSONDecodeError, RecursionError, TypeError, ValueError)" in workflow
