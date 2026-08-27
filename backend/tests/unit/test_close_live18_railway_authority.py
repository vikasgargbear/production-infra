from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from scripts import close_live18_railway_authority as close


def _environment(marker: Path) -> dict[str, str]:
    return {
        "CANONICAL_STAGING_PROJECT_REF": "canonicalcanonical12",
        "GITHUB_RUN_ATTEMPT": "2",
        "GITHUB_RUN_ID": "12345",
        "LIVE18_RAILWAY_AUTHORITY_OPEN_ATTEMPTED_PATH": str(marker),
        "LIVE18_RAILWAY_REQUEST_NONCE": "a" * 64,
        "LIVE18_RAILWAY_SSH_PRIVATE_KEY": "/runner/live18-key",
        "RAILWAY_API_DEPLOYMENT_ID": "deployment-id",
        "RAILWAY_API_DEPLOYMENT_INSTANCE_ID": "deployment-instance-id",
        "RAILWAY_API_SERVICE": "aasopharma-api-pilot",
        "RAILWAY_ENVIRONMENT_ID": "environment-id",
        "RAILWAY_PROJECT_ID": "project-id",
        "REVIEWED_DEPLOY_SHA": "b" * 40,
        "SUPABASE_DB_PASSWORD": "database-secret",
    }


def test_close_is_idempotent_when_open_was_never_attempted(tmp_path, monkeypatch):
    monkeypatch.setattr(
        close.subprocess,
        "run",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("Railway must not run without the authority marker")
        ),
    )

    assert close.close_authority(_environment(tmp_path / "absent")) is False
    assert close.close_authority({}) is False


def test_close_attests_exact_instance_and_removes_marker(tmp_path, monkeypatch):
    marker = tmp_path / "authority-open-attempted"
    marker.touch()
    inspected = []
    monkeypatch.setattr(close, "_verify_response", inspected.append)
    calls = []

    def run(command, **kwargs):
        calls.append((command, kwargs))
        return SimpleNamespace(
            returncode=0,
            stdout=json.dumps(
                {
                    "action": "close-authority",
                    "temporary_owner_delegation_removed": True,
                    "write_fence": {
                        "state": "closed",
                        "commit_sha": "b" * 40,
                    },
                }
            ),
            stderr="",
        )

    monkeypatch.setattr(close.subprocess, "run", run)

    assert close.close_authority(_environment(marker)) is True
    assert not marker.exists()
    command, call = calls[0]
    assert command[:2] == ("railway", "ssh")
    assert command[command.index("--deployment-instance") + 1] == (
        "deployment-instance-id"
    )
    assert command[-6:] == (
        "scripts/live18_railway_database_phase.py",
        "close-authority",
        "--input",
        "-",
        "--output",
        "-",
    )
    assert "database-secret" not in command
    request = json.loads(call["input"])
    assert request["expected_sha"] == "b" * 40
    assert request["secrets"]["SUPABASE_DB_PASSWORD"] == "database-secret"
    assert call["timeout"] == 90
    assert inspected[0]["response"]["write_fence"]["state"] == "closed"


def test_close_failure_keeps_marker_and_does_not_disclose_stderr(
    tmp_path, monkeypatch
):
    marker = tmp_path / "authority-open-attempted"
    marker.touch()
    monkeypatch.setattr(
        close.subprocess,
        "run",
        lambda *_args, **_kwargs: SimpleNamespace(
            returncode=17,
            stdout="",
            stderr="database-secret and transport diagnostics",
        ),
    )

    with pytest.raises(close.AuthorityCloseError) as raised:
        close.close_authority(_environment(marker))

    assert marker.exists()
    assert "database-secret" not in str(raised.value)
    assert "exit 17" in str(raised.value)


def test_close_timeout_keeps_marker_and_discloses_no_request(tmp_path, monkeypatch):
    marker = tmp_path / "authority-open-attempted"
    marker.touch()
    monkeypatch.setattr(
        close.subprocess,
        "run",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            close.subprocess.TimeoutExpired(
                cmd="railway ssh", timeout=90, output="database-secret"
            )
        ),
    )

    with pytest.raises(close.AuthorityCloseError) as raised:
        close.close_authority(_environment(marker))

    assert marker.exists()
    assert "database-secret" not in str(raised.value)
    assert "exceeded 90 seconds" in str(raised.value)
