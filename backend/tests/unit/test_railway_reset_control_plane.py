from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import socket

import pytest

import scripts.railway_canonical_reset as RESET
import scripts.railway_reset_control_plane as CONTROL
from scripts.cleanup_staging_evidence_storage import WriterClosure


EXPECTED_SHA = "a" * 40
HOST_SHA = "b" * 40
PROJECT_REF = "rgihahbmkrmhitjdjvev"
PRODUCTION_REFS = "not-the-staging-project"
DEPLOYMENT_ID = "11111111-1111-4111-8111-111111111111"
INSTANCE_ID = "22222222-2222-4222-8222-222222222222"
NONCE = "c" * 64
DB_PASSWORD = "database-secret-value"
ACCESS_TOKEN = "sb_secret_access-token-value"
ANON_KEY = "eyJanonymous-token-value"


def _request(
    *,
    execution_source: str = "reviewed_source_archive",
    source_archive_sha256: str = "d" * 64,
    host_sha: str = HOST_SHA,
    secrets: dict[str, str] | None = None,
) -> dict[str, object]:
    return {
        "schema": CONTROL.REQUEST_SCHEMA,
        "expected_sha": EXPECTED_SHA,
        "host_deployed_sha": host_sha,
        "execution_source": execution_source,
        "source_archive_sha256": source_archive_sha256,
        "request_nonce": NONCE,
        "deployment_id": DEPLOYMENT_ID,
        "deployment_instance_id": INSTANCE_ID,
        "project_ref": PROJECT_REF,
        "production_project_refs": PRODUCTION_REFS,
        "run_id": "12345",
        "run_attempt": "2",
        "secrets": secrets
        or {
            "SUPABASE_ACCESS_TOKEN": ACCESS_TOKEN,
            "SUPABASE_ANON_KEY": ANON_KEY,
            "SUPABASE_DB_PASSWORD": DB_PASSWORD,
        },
    }


def _archive_boundary(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, content: bytes = b"archive"
) -> tuple[dict[str, object], str]:
    backend = tmp_path / "source" / "backend"
    backend.mkdir(parents=True, exist_ok=True)
    archive = tmp_path / "source.tar.gz"
    archive.write_bytes(content)
    digest = hashlib.sha256(content).hexdigest()
    monkeypatch.setattr(CONTROL, "BACKEND_DIRECTORY", backend)
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", HOST_SHA)
    return _request(source_archive_sha256=digest), digest


def test_reviewed_archive_binds_hash_while_allowing_an_older_execution_host(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    request, digest = _archive_boundary(monkeypatch, tmp_path)

    boundary = CONTROL._execution_boundary(request)

    assert boundary == {
        "expected_sha": EXPECTED_SHA,
        "request_nonce": NONCE,
        "deployment_id": DEPLOYMENT_ID,
        "deployment_instance_id": INSTANCE_ID,
        "host_deployed_sha": HOST_SHA,
        "execution_source": "reviewed_source_archive",
        "source_archive_sha256": digest,
    }
    assert boundary["host_deployed_sha"] != boundary["expected_sha"]


def test_reviewed_archive_rejects_hash_or_host_sha_drift(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    request, _digest = _archive_boundary(monkeypatch, tmp_path)
    request["source_archive_sha256"] = "e" * 64
    with pytest.raises(CONTROL.RailwayResetControlError, match="hash-verified"):
        CONTROL._execution_boundary(request)

    request, _digest = _archive_boundary(monkeypatch, tmp_path)
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "f" * 40)
    with pytest.raises(CONTROL.RailwayResetControlError, match="pinned deployment"):
        CONTROL._execution_boundary(request)


def test_exact_deployment_requires_sha_and_packaged_provenance(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    marker = tmp_path / "railway-deployment-provenance"
    marker.write_text(f"{EXPECTED_SHA}:12345:2\n", encoding="utf-8")
    monkeypatch.setattr(CONTROL, "DEPLOYED_PROVENANCE", marker)
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", EXPECTED_SHA)
    request = _request(
        execution_source="exact_railway_deployment",
        source_archive_sha256="",
        host_sha=EXPECTED_SHA,
        secrets={"SUPABASE_DB_PASSWORD": DB_PASSWORD},
    )

    boundary = CONTROL._execution_boundary(request)

    assert boundary["execution_source"] == "exact_railway_deployment"
    assert boundary["expected_sha"] == EXPECTED_SHA
    assert boundary["host_deployed_sha"] == EXPECTED_SHA
    assert boundary["source_archive_sha256"] == ""

    marker.write_text(f"{'f' * 40}:12345:2\n", encoding="utf-8")
    with pytest.raises(CONTROL.RailwayResetControlError, match="reviewed SHA"):
        CONTROL._execution_boundary(request)


@pytest.mark.parametrize(
    ("expected", "provided"),
    (
        (
            CONTROL.RESET_SECRET_KEYS,
            {"SUPABASE_DB_PASSWORD": DB_PASSWORD},
        ),
        (
            CONTROL.FENCE_SECRET_KEYS,
            {
                "SUPABASE_DB_PASSWORD": DB_PASSWORD,
                "SUPABASE_ACCESS_TOKEN": ACCESS_TOKEN,
            },
        ),
    ),
)
def test_secret_contract_rejects_missing_or_extra_authority(
    expected: set[str], provided: dict[str, str]
) -> None:
    request = _request(secrets=provided)

    with pytest.raises(CONTROL.RailwayResetControlError, match="secret set"):
        CONTROL._secret_environment(request, expected)


def test_reset_boundary_orders_prepare_cleanup_and_reset_over_ipv6(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, object]] = []

    def prepare(**kwargs):
        calls.append(("prepare", kwargs))
        return {"action": "prepare-reset", "write_fence": {"state": "closed"}}

    cleanup_receipt = {
        "contract_version": "canonical-evidence-reset-cleanup-v2",
        "state": "empty",
    }

    def cleanup(request, secrets):
        calls.append(("cleanup", (request, dict(secrets))))
        return {
            "transport": {"network_family": 6},
            "identity_prepared": False,
            "identity_receipt": None,
            "cleanup_receipt": cleanup_receipt,
            "cleanup_receipt_sha256": "e" * 64,
            "cleanup_receipt_bytes": json.dumps(cleanup_receipt),
        }

    def reset(**kwargs):
        receipt_path = kwargs.pop("evidence_cleanup_receipt_path")
        calls.append(("reset", kwargs))
        assert json.loads(receipt_path.read_text(encoding="utf-8")) == cleanup_receipt
        assert receipt_path.stat().st_mode & 0o777 == 0o600
        return {"action": "reset", "post_reset_fence_state": "closed"}

    monkeypatch.setattr(CONTROL, "prepare_reset_boundary", prepare)
    monkeypatch.setattr(CONTROL, "_evidence_cleanup", cleanup)
    monkeypatch.setattr(CONTROL, "reset_disposable_staging", reset)
    request = _request()

    result = CONTROL._reset_boundary(request)

    assert [name for name, _value in calls] == ["prepare", "cleanup", "reset"]
    for name, value in (calls[0], calls[2]):
        assert name in {"prepare", "reset"}
        assert value == {
            "expected_sha": EXPECTED_SHA,
            "project_ref": PROJECT_REF,
            "production_project_refs": PRODUCTION_REFS,
            "password": DB_PASSWORD,
            "control_transport": RESET.CONTROL_TRANSPORT_RAILWAY_IPV6,
        }
    assert "cleanup_receipt_bytes" not in result["evidence"]
    serialized = json.dumps(result)
    assert DB_PASSWORD not in serialized
    assert ACCESS_TOKEN not in serialized
    assert ANON_KEY not in serialized


class _EvidenceConnection:
    def __init__(self) -> None:
        self.closed = False

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def close(self) -> None:
        self.closed = True


def _closed_writer() -> WriterClosure:
    return WriterClosure(
        membership_open=False,
        role_posture_safe=True,
        unexpected_member_count=0,
        inherited_role_count=0,
        observed_authenticator_session_count=0,
        terminated_authenticator_session_count=0,
        remaining_preclosure_authenticator_session_count=0,
        verified_at="2026-08-27T00:00:00Z",
    )


def test_empty_evidence_cleanup_skips_service_identity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        CONTROL,
        "_admin_database_url",
        lambda **_kwargs: ("postgresql://redacted", {"network_family": 6}),
    )
    connections: list[_EvidenceConnection] = []

    def connect(*_args, **_kwargs):
        connection = _EvidenceConnection()
        connections.append(connection)
        return connection

    monkeypatch.setattr(CONTROL.psycopg2, "connect", connect)
    monkeypatch.setattr(CONTROL, "load_inventory", lambda _connection: "inventory")
    monkeypatch.setattr(CONTROL, "validated_cleanup_keys", lambda _inventory: ())
    monkeypatch.setattr(
        CONTROL,
        "provision_evidence_identity",
        lambda _arguments: pytest.fail("empty evidence must not provision identity"),
    )
    cleanup_receipt = {
        "contract_version": "canonical-evidence-reset-cleanup-v2",
        "state": "empty",
        "remaining_object_count": 0,
    }
    monkeypatch.setattr(
        CONTROL,
        "execute_fenced_cleanup",
        lambda **_kwargs: cleanup_receipt,
    )
    monkeypatch.setattr(
        CONTROL,
        "write_evidence_cleanup_receipt",
        lambda path, payload: path.write_text(json.dumps(payload), encoding="utf-8"),
    )

    result = CONTROL._evidence_cleanup(
        _request(),
        {
            "SUPABASE_ACCESS_TOKEN": ACCESS_TOKEN,
            "SUPABASE_ANON_KEY": ANON_KEY,
            "SUPABASE_DB_PASSWORD": DB_PASSWORD,
        },
    )

    assert result["identity_prepared"] is False
    assert result["identity_receipt"] is None
    assert result["cleanup_receipt"] == cleanup_receipt
    assert DB_PASSWORD not in json.dumps(result)
    assert len(connections) == 2
    assert all(connection.closed for connection in connections)


def test_nonempty_evidence_cleanup_prepares_identity_once_without_exporting_secrets(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        CONTROL,
        "_admin_database_url",
        lambda **_kwargs: ("postgresql://redacted", {"network_family": 6}),
    )
    connections: list[_EvidenceConnection] = []

    def connect(*_args, **_kwargs):
        connection = _EvidenceConnection()
        connections.append(connection)
        return connection

    monkeypatch.setattr(CONTROL.psycopg2, "connect", connect)
    monkeypatch.setattr(CONTROL, "load_inventory", lambda _connection: "inventory")
    monkeypatch.setattr(
        CONTROL, "validated_cleanup_keys", lambda _inventory: ("one-reviewed-key",)
    )
    provision_calls: list[list[str]] = []

    def provision(arguments: list[str]) -> int:
        provision_calls.append(arguments)
        environment_path = Path(arguments[arguments.index("--github-env") + 1])
        receipt_path = Path(arguments[arguments.index("--receipt") + 1])
        environment_path.write_text(
            "EVIDENCE_STORAGE_ENABLED=true\n"
            "EVIDENCE_STORAGE_SERVICE_PASSWORD=ephemeral-password\n",
            encoding="utf-8",
        )
        receipt_path.write_text(
            json.dumps({"state": "prepared", "password_rotated": True}),
            encoding="utf-8",
        )
        return 0

    monkeypatch.setattr(CONTROL, "provision_evidence_identity", provision)
    cleanup_receipt = {
        "contract_version": "canonical-evidence-reset-cleanup-v2",
        "state": "empty",
        "remaining_object_count": 0,
    }
    monkeypatch.setattr(
        CONTROL,
        "execute_fenced_cleanup",
        lambda **_kwargs: cleanup_receipt,
    )
    monkeypatch.setattr(
        CONTROL,
        "write_evidence_cleanup_receipt",
        lambda path, payload: path.write_text(json.dumps(payload), encoding="utf-8"),
    )

    result = CONTROL._evidence_cleanup(
        _request(),
        {
            "SUPABASE_ACCESS_TOKEN": ACCESS_TOKEN,
            "SUPABASE_ANON_KEY": ANON_KEY,
            "SUPABASE_DB_PASSWORD": DB_PASSWORD,
        },
    )

    assert len(provision_calls) == 1
    assert result["identity_prepared"] is True
    serialized = json.dumps(result)
    assert "ephemeral-password" not in serialized
    assert DB_PASSWORD not in serialized
    assert ACCESS_TOKEN not in serialized
    assert len(connections) == 2
    assert all(connection.closed for connection in connections)


@pytest.mark.parametrize(
    ("action", "target_name"),
    (("open-fence", "open_fence_after_deploy"), ("close-fence", "close_fence_after_failure")),
)
def test_fence_actions_use_only_the_password_and_direct_ipv6(
    monkeypatch: pytest.MonkeyPatch, action: str, target_name: str
) -> None:
    observed: dict[str, object] = {}

    def target(**kwargs):
        observed.update(kwargs)
        return {"write_fence": {"state": action.removesuffix("-fence")}}

    monkeypatch.setattr(CONTROL, target_name, target)
    evidence_connection = _EvidenceConnection()
    monkeypatch.setattr(
        CONTROL,
        "_admin_database_url",
        lambda **_kwargs: ("postgresql://redacted", {"network_family": 6}),
    )
    monkeypatch.setattr(
        CONTROL.psycopg2, "connect", lambda _dsn: evidence_connection
    )
    monkeypatch.setattr(
        CONTROL,
        "close_writer_authority",
        lambda _connection: _closed_writer(),
    )
    request = _request(secrets={"SUPABASE_DB_PASSWORD": DB_PASSWORD})

    result = CONTROL._fence(request, action=action)

    assert observed == {
        "expected_sha": EXPECTED_SHA,
        "project_ref": PROJECT_REF,
        "production_project_refs": PRODUCTION_REFS,
        "password": DB_PASSWORD,
        "control_transport": RESET.CONTROL_TRANSPORT_RAILWAY_IPV6,
    }
    assert result["write_fence"]["state"] in {"open", "close"}
    assert result["evidence_writer_closure"]["membership_open"] is False
    assert evidence_connection.closed is True


def test_close_fence_attempts_canonical_closure_when_evidence_closure_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []
    monkeypatch.setattr(
        CONTROL,
        "close_fence_after_failure",
        lambda **_kwargs: calls.append("canonical")
        or {"write_fence": {"state": "closed"}},
    )
    monkeypatch.setattr(
        CONTROL,
        "_admin_database_url",
        lambda **_kwargs: ("postgresql://redacted", {"network_family": 6}),
    )
    monkeypatch.setattr(
        CONTROL.psycopg2, "connect", lambda _dsn: _EvidenceConnection()
    )

    def fail_evidence(_connection):
        calls.append("evidence")
        raise RuntimeError("injected evidence closure failure")

    monkeypatch.setattr(CONTROL, "close_writer_authority", fail_evidence)

    with pytest.raises(CONTROL.RailwayResetControlError, match="evidence=RuntimeError"):
        CONTROL._fence(
            _request(secrets={"SUPABASE_DB_PASSWORD": DB_PASSWORD}),
            action="close-fence",
        )

    assert calls == ["canonical", "evidence"]


def test_close_fence_attempts_evidence_closure_when_canonical_closure_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []

    def fail_canonical(**_kwargs):
        calls.append("canonical")
        raise RuntimeError("injected canonical closure failure")

    monkeypatch.setattr(CONTROL, "close_fence_after_failure", fail_canonical)
    monkeypatch.setattr(
        CONTROL,
        "_admin_database_url",
        lambda **_kwargs: ("postgresql://redacted", {"network_family": 6}),
    )
    monkeypatch.setattr(
        CONTROL.psycopg2, "connect", lambda _dsn: _EvidenceConnection()
    )
    monkeypatch.setattr(
        CONTROL,
        "close_writer_authority",
        lambda _connection: calls.append("evidence") or _closed_writer(),
    )

    with pytest.raises(CONTROL.RailwayResetControlError, match="canonical=RuntimeError"):
        CONTROL._fence(
            _request(secrets={"SUPABASE_DB_PASSWORD": DB_PASSWORD}),
            action="close-fence",
        )

    assert calls == ["canonical", "evidence"]


def test_response_and_error_paths_do_not_disclose_transported_secrets(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    request, digest = _archive_boundary(monkeypatch, tmp_path)
    monkeypatch.setattr(
        CONTROL,
        "_reset_boundary",
        lambda _request: {"prepared": True, "evidence": True, "reset": True},
    )

    response = CONTROL.execute(request, "reset-boundary")

    serialized = json.dumps(response)
    assert DB_PASSWORD not in serialized
    assert ACCESS_TOKEN not in serialized
    assert ANON_KEY not in serialized
    assert response["source_archive_sha256"] == digest
    assert len(response["content_sha256"]) == 64

    request_path = tmp_path / "request.json"
    request_path.write_text(json.dumps(request), encoding="utf-8")

    def fail(_request, _action):
        raise RuntimeError(
            f"failed with {DB_PASSWORD} {ACCESS_TOKEN} {ANON_KEY} "
            f"postgresql://postgres:{DB_PASSWORD}@database.example/postgres"
        )

    monkeypatch.setattr(CONTROL, "execute", fail)
    assert CONTROL.main(["reset-boundary", "--input", str(request_path)]) == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert DB_PASSWORD not in captured.err
    assert ACCESS_TOKEN not in captured.err
    assert ANON_KEY not in captured.err
    assert "[REDACTED]" in captured.err
    assert "[REDACTED_DATABASE_URL]" in captured.err


def test_response_verifier_recomputes_hash_and_does_not_trust_remote_boundary(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    request, _digest = _archive_boundary(monkeypatch, tmp_path)
    monkeypatch.setattr(
        CONTROL,
        "_reset_boundary",
        lambda _request: {"reset": {"post_reset_fence_state": "closed"}},
    )
    response = CONTROL.execute(request, "reset-boundary")

    assert (
        CONTROL.verify_response(response, request, action="reset-boundary")
        == response
    )

    tampered_boundary = {**response, "deployment_id": INSTANCE_ID}
    with pytest.raises(CONTROL.RailwayResetControlError, match="deployment_id"):
        CONTROL.verify_response(
            tampered_boundary, request, action="reset-boundary"
        )

    tampered_result = {
        **response,
        "result": {"reset": {"post_reset_fence_state": "open"}},
    }
    with pytest.raises(CONTROL.RailwayResetControlError, match="hash"):
        CONTROL.verify_response(tampered_result, request, action="reset-boundary")


class _Cursor:
    def __init__(self, row: tuple[object, ...]) -> None:
        self.row = row

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, _statement: str) -> None:
        return None

    def fetchone(self):
        return self.row


class _Connection:
    def __init__(self, row: tuple[object, ...]) -> None:
        self.row = row
        self.readonly: bool | None = None
        self.closed = False

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def set_session(self, *, readonly: bool) -> None:
        self.readonly = readonly

    def cursor(self) -> _Cursor:
        return _Cursor(self.row)

    def close(self) -> None:
        self.closed = True


@dataclass(frozen=True)
class _Contract:
    administrator_role: str = "postgres"
    host: str = f"db.{PROJECT_REF}.supabase.co"
    port: int = 5432
    database: str = "postgres"

    @property
    def roles(self) -> tuple[str, ...]:
        return (self.administrator_role,)


def test_ipv6_admin_transport_attests_the_connected_server_and_hides_address(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    address = "2606:4700:4700::1111"
    connection = _Connection(
        ("postgres", "postgres", "on", 6, address, True, False, False, True, True)
    )
    monkeypatch.setattr(RESET, "load_direct_database_contract", lambda: _Contract())
    monkeypatch.setattr(RESET, "build_direct_dsn", lambda **_kwargs: "postgresql://redacted")
    monkeypatch.setattr(
        RESET.socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [
            (socket.AF_INET6, socket.SOCK_STREAM, 6, "", (address, 5432, 0, 0))
        ],
    )
    monkeypatch.setattr(RESET.psycopg2, "connect", lambda _dsn: connection)

    dsn, evidence = RESET._admin_database_url(
        password=DB_PASSWORD,
        application_name="canonical_test",
        control_transport=RESET.CONTROL_TRANSPORT_RAILWAY_IPV6,
    )

    assert dsn == "postgresql://redacted&hostaddr=2606%3A4700%3A4700%3A%3A1111"
    assert connection.readonly is True
    assert connection.closed is True
    assert evidence["mode"] == RESET.CONTROL_TRANSPORT_RAILWAY_IPV6
    assert evidence["network_family"] == 6
    assert evidence["ipv6_answer_count"] == 1
    assert evidence["selected_ipv6_address"] == "verified-not-persisted"
    assert address not in json.dumps(evidence)
    assert DB_PASSWORD not in json.dumps(evidence)


def test_ipv6_admin_transport_fails_before_connect_without_ipv6(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(RESET, "load_direct_database_contract", lambda: _Contract())
    monkeypatch.setattr(RESET, "build_direct_dsn", lambda **_kwargs: "postgresql://redacted")
    monkeypatch.setattr(
        RESET.socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("203.0.113.1", 5432))
        ],
    )
    monkeypatch.setattr(
        RESET.psycopg2,
        "connect",
        lambda *_args, **_kwargs: pytest.fail("database must not be opened"),
    )

    with pytest.raises(
        RESET.RailwayCanonicalResetError, match=r"IPv6.*resolution"
    ):
        RESET._admin_database_url(
            password=DB_PASSWORD,
            application_name="canonical_test",
            control_transport=RESET.CONTROL_TRANSPORT_RAILWAY_IPV6,
        )


def test_ipv6_admin_transport_rejects_wrong_role_or_network_family(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(RESET, "load_direct_database_contract", lambda: _Contract())
    monkeypatch.setattr(RESET, "build_direct_dsn", lambda **_kwargs: "postgresql://redacted")
    monkeypatch.setattr(
        RESET.socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [
            (
                socket.AF_INET6,
                socket.SOCK_STREAM,
                6,
                "",
                ("2606:4700:4700::1111", 5432, 0, 0),
            )
        ],
    )
    monkeypatch.setattr(
        RESET.psycopg2,
        "connect",
        lambda _dsn: _Connection(
            (
                "wrong-role",
                "postgres",
                "on",
                4,
                "2606:4700:4700::1111",
                True,
                False,
                False,
                True,
                True,
            )
        ),
    )

    with pytest.raises(RESET.RailwayCanonicalResetError, match="authority attestation"):
        RESET._admin_database_url(
            password=DB_PASSWORD,
            application_name="canonical_test",
            control_transport=RESET.CONTROL_TRANSPORT_RAILWAY_IPV6,
        )
