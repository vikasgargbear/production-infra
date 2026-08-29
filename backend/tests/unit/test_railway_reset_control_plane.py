from __future__ import annotations

import ast
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
ORGANIZATION_ID = "10000000-0000-4000-8000-000000000010"


def test_fence_control_does_not_eagerly_import_reset_only_provisioning() -> None:
    source_path = Path(CONTROL.__file__)
    module = ast.parse(source_path.read_text(encoding="utf-8"))
    eager_modules = {
        node.module for node in module.body if isinstance(node, ast.ImportFrom)
    }

    assert "provision_canonical_evidence_storage_identity" not in eager_modules
    assert "app.infrastructure.evidence_storage" not in eager_modules


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
            CONTROL.PURGE_SECRET_KEYS,
            {"SUPABASE_DB_PASSWORD": DB_PASSWORD, "EXTRA": "forbidden"},
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


def test_prepare_boundary_migrates_without_resetting_business_data(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = []

    def prepare(**kwargs):
        calls.append(kwargs)
        return {
            "action": "prepare-reset",
            "write_fence": {"state": "closed"},
            "migration": {"alembic_head": "20260827_0032"},
        }

    monkeypatch.setattr(CONTROL, "prepare_reset_boundary", prepare)
    monkeypatch.setattr(
        CONTROL,
        "purge_staging_organization",
        lambda **_kwargs: (_ for _ in ()).throw(
            AssertionError("migration-only preparation must not reset data")
        ),
    )
    request = _request(secrets={"SUPABASE_DB_PASSWORD": DB_PASSWORD})

    result = CONTROL._prepare_boundary(request)

    assert result["migration"]["alembic_head"] == "20260827_0032"
    assert calls == [
        {
            "expected_sha": EXPECTED_SHA,
            "project_ref": PROJECT_REF,
            "production_project_refs": PRODUCTION_REFS,
            "password": DB_PASSWORD,
            "control_transport": CONTROL.CONTROL_TRANSPORT_RAILWAY_IPV6,
        }
    ]


def test_purge_plan_uses_the_bounded_owner_authority(monkeypatch) -> None:
    calls = []
    monkeypatch.setattr(
        CONTROL,
        "plan_staging_organization_purge",
        lambda **kwargs: calls.append(kwargs)
        or {
            "transport": {"network_family": 6},
            "plan": {
                "organization_id": ORGANIZATION_ID,
                "authority_manifest_sha256": "a" * 64,
                "catalog_fingerprint_sha256": "b" * 64,
                "alembic_head": "head",
                "organization_row_count": 7,
                "evidence_attachment_count": 0,
                "evidence_attachment_manifest_sha256": "d" * 64,
                "evidence_object_paths": [],
            },
        },
    )
    request = _request(secrets={"SUPABASE_DB_PASSWORD": DB_PASSWORD})
    request["organization_id"] = ORGANIZATION_ID

    result = CONTROL._plan_organization(request)

    assert result["plan"]["organization_id"] == ORGANIZATION_ID
    assert result["transport"]["network_family"] == 6
    assert result["requires_separate_execution"] is True
    assert calls == [
        {
            "expected_sha": EXPECTED_SHA,
            "project_ref": PROJECT_REF,
            "production_project_refs": PRODUCTION_REFS,
            "password": DB_PASSWORD,
            "organization_id": ORGANIZATION_ID,
            "control_transport": CONTROL.CONTROL_TRANSPORT_RAILWAY_IPV6,
        }
    ]


def test_signed_purge_plan_requires_delay_exact_boundary_and_separate_execution(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    issued_at = 1_000
    payload = {
        "schema": CONTROL.PURGE_PLAN_SCHEMA,
        "expected_sha": EXPECTED_SHA,
        "project_ref": PROJECT_REF,
        "organization_id": ORGANIZATION_ID,
        "authority_manifest_sha256": "a" * 64,
        "catalog_fingerprint_sha256": "b" * 64,
        "alembic_head": "head",
        "organization_row_count": 7,
        "evidence_attachment_count": 0,
        "evidence_attachment_manifest_sha256": "d" * 64,
        "issued_at": issued_at,
        "not_before": issued_at + 60,
        "expires_at": issued_at + 1800,
        "nonce": "c" * 64,
    }
    token = CONTROL._encode_signed_purge_plan(payload, DB_PASSWORD)
    request = _request(secrets={"SUPABASE_DB_PASSWORD": DB_PASSWORD})
    request.update(
        {
            "organization_id": ORGANIZATION_ID,
            "organization_confirmation": f"DELETE-ORGANIZATION:{ORGANIZATION_ID}",
            "purge_plan_token": token,
        }
    )
    calls: list[dict[str, object]] = []
    monkeypatch.setattr(CONTROL.time, "time", lambda: issued_at + 30)
    with pytest.raises(CONTROL.RailwayResetControlError, match="cooling-off"):
        CONTROL._purge_organization(request)

    monkeypatch.setattr(CONTROL.time, "time", lambda: issued_at + 61)
    monkeypatch.setattr(
        CONTROL,
        "plan_staging_organization_purge",
        lambda **_kwargs: {
            "plan": {
                "evidence_attachment_count": 0,
                "evidence_attachment_manifest_sha256": "d" * 64,
                "evidence_object_paths": [],
            }
        },
    )
    monkeypatch.setattr(
        CONTROL,
        "purge_staging_organization",
        lambda **kwargs: calls.append(kwargs) or {"action": "purge-organization"},
    )
    result = CONTROL._purge_organization(request)

    assert result["action"] == "purge-organization"
    assert result["evidence_storage_object_count"] == 0
    assert calls[0]["organization_id"] == ORGANIZATION_ID
    assert calls[0]["authorized_plan"] == payload
    assert len(str(calls[0]["authorized_plan_sha256"])) == 64
    assert "SUPABASE_ACCESS_TOKEN" not in calls[0]

    tampered = token[:-1] + ("0" if token[-1] != "0" else "1")
    request["purge_plan_token"] = tampered
    with pytest.raises(CONTROL.RailwayResetControlError, match="signature"):
        CONTROL._purge_organization(request)


def test_purge_deletes_only_signed_evidence_object_paths(monkeypatch) -> None:
    issued_at = 2_000
    object_path = f"{ORGANIZATION_ID}/branch/receipt/{'d' * 64}.pdf"
    payload = {
        "schema": CONTROL.PURGE_PLAN_SCHEMA,
        "expected_sha": EXPECTED_SHA,
        "project_ref": PROJECT_REF,
        "organization_id": ORGANIZATION_ID,
        "authority_manifest_sha256": "a" * 64,
        "catalog_fingerprint_sha256": "b" * 64,
        "alembic_head": "head",
        "organization_row_count": 7,
        "evidence_attachment_count": 1,
        "evidence_attachment_manifest_sha256": "d" * 64,
        "issued_at": issued_at,
        "not_before": issued_at + 60,
        "expires_at": issued_at + 1800,
        "nonce": "c" * 64,
    }
    request = _request(secrets={"SUPABASE_DB_PASSWORD": DB_PASSWORD})
    request.update(
        {
            "organization_id": ORGANIZATION_ID,
            "organization_confirmation": f"DELETE-ORGANIZATION:{ORGANIZATION_ID}",
            "purge_plan_token": CONTROL._encode_signed_purge_plan(
                payload, DB_PASSWORD
            ),
        }
    )
    deleted: list[str] = []

    class Storage:
        def delete(self, path: str) -> bool:
            deleted.append(path)
            return True

    monkeypatch.setattr(CONTROL.time, "time", lambda: issued_at + 61)
    monkeypatch.setattr(
        CONTROL,
        "plan_staging_organization_purge",
        lambda **_kwargs: {
            "plan": {
                "evidence_attachment_count": 1,
                "evidence_attachment_manifest_sha256": "d" * 64,
                "evidence_object_paths": [object_path],
            }
        },
    )
    monkeypatch.setattr(CONTROL, "configured_evidence_storage", lambda: Storage())
    monkeypatch.setattr(
        CONTROL,
        "purge_staging_organization",
        lambda **_kwargs: {"action": "purge-organization"},
    )

    result = CONTROL._purge_organization(request)

    assert deleted == [object_path]
    assert result["evidence_storage_cleanup_run"] is True
    assert result["evidence_storage_deleted_object_count"] == 1


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
        "_purge_organization",
        lambda _request: {"purge": True},
    )

    response = CONTROL.execute(request, "purge-organization")

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
    assert CONTROL.main(["purge-organization", "--input", str(request_path)]) == 1
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
        "_purge_organization",
        lambda _request: {"purge": {"organization_boundary_deleted": True}},
    )
    response = CONTROL.execute(request, "purge-organization")

    assert (
        CONTROL.verify_response(response, request, action="purge-organization")
        == response
    )

    tampered_boundary = {**response, "deployment_id": INSTANCE_ID}
    with pytest.raises(CONTROL.RailwayResetControlError, match="deployment_id"):
        CONTROL.verify_response(
            tampered_boundary, request, action="purge-organization"
        )

    tampered_result = {
        **response,
        "result": {"purge": {"organization_boundary_deleted": False}},
    }
    with pytest.raises(CONTROL.RailwayResetControlError, match="hash"):
        CONTROL.verify_response(tampered_result, request, action="purge-organization")


class _Cursor:
    def __init__(self, row: tuple[object, ...], statements: list[str]) -> None:
        self.row = row
        self.statements = statements

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, statement: str) -> None:
        self.statements.append(statement)

    def fetchone(self):
        return self.row


class _Connection:
    def __init__(
        self,
        row: tuple[object, ...],
        *,
        hostaddr: str = "2606:4700:4700::1111",
    ) -> None:
        self.row = row
        self.readonly: bool | None = None
        self.closed = False
        self.statements: list[str] = []
        self.info = type("ConnectionInfo", (), {"ssl_in_use": True})()
        self._parameters = {
            "host": f"db.{PROJECT_REF}.supabase.co",
            "hostaddr": hostaddr,
            "port": "5432",
            "dbname": "postgres",
            "user": "postgres",
            "sslmode": "require",
            "gssencmode": "disable",
            "application_name": "canonical_test",
        }

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def set_session(self, *, readonly: bool) -> None:
        self.readonly = readonly

    def get_dsn_parameters(self) -> dict[str, str]:
        return dict(self._parameters)

    def cursor(self) -> _Cursor:
        return _Cursor(self.row, self.statements)

    def close(self) -> None:
        self.closed = True


@dataclass(frozen=True)
class _Contract:
    project_ref: str = PROJECT_REF
    administrator_role: str = "postgres"
    host: str = f"db.{PROJECT_REF}.supabase.co"
    port: int = 5432
    database: str = "postgres"

    @property
    def roles(self) -> tuple[str, ...]:
        return (self.administrator_role,)


def _attest_safe_owner_paths(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        RESET,
        "verify_post_cleanup_role_state",
        lambda _connection, *, project_ref: {
            "project_ref": project_ref,
            "postgres_migration_owner_set": False,
            "postgres_migration_owner_usage": False,
            "verification_principal_superuser": False,
        },
    )


def test_ipv6_admin_transport_attests_the_connected_server_and_hides_address(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    address = "2606:4700:4700::1111"
    connection = _Connection(
        ("postgres", "postgres", "on", True, True, False, True, True)
    )
    _attest_safe_owner_paths(monkeypatch)
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
    assert evidence["migration_owner_member"] is True
    assert evidence["migration_owner_set"] is False
    assert evidence["migration_owner_usage"] is False
    assert evidence["recovered_direct_owner_delegation"] is False
    assert address not in json.dumps(evidence)
    assert DB_PASSWORD not in json.dumps(evidence)
    assert all("inet_server_addr" not in statement for statement in connection.statements)


def test_ipv6_admin_transport_recovers_only_stale_direct_owner_delegation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    address = "2606:4700:4700::1111"
    connection = _Connection(
        ("postgres", "postgres", "on", True, True, False, True, True)
    )
    calls: list[tuple[str, str]] = []
    observations = iter(
        [
            RESET.ResetAuthorityError(
                "postgres retains temporary migration-owner delegation"
            ),
            {
                "project_ref": PROJECT_REF,
                "postgres_migration_owner_set": False,
                "postgres_migration_owner_usage": False,
                "verification_principal_superuser": False,
            },
        ]
    )

    def verify(_connection, *, project_ref):
        assert project_ref == PROJECT_REF
        observed = next(observations)
        if isinstance(observed, Exception):
            raise observed
        return observed

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
    monkeypatch.setattr(RESET, "verify_post_cleanup_role_state", verify)
    monkeypatch.setattr(
        RESET,
        "_normalize_stale_owner_delegation",
        lambda dsn, *, project_ref: calls.append((dsn, project_ref)),
    )

    dsn, evidence = RESET._admin_database_url(
        password=DB_PASSWORD,
        application_name="canonical_test",
        control_transport=RESET.CONTROL_TRANSPORT_RAILWAY_IPV6,
        recover_stale_owner_delegation=True,
    )

    assert calls == [(dsn, PROJECT_REF)]
    assert evidence["recovered_direct_owner_delegation"] is True
    assert evidence["migration_owner_set"] is False
    assert evidence["migration_owner_usage"] is False


def test_ipv6_admin_transport_fails_closed_when_owner_recovery_stays_effective(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    address = "2606:4700:4700::1111"
    connection = _Connection(
        ("postgres", "postgres", "on", True, True, False, True, True)
    )
    stale = RESET.ResetAuthorityError(
        "postgres retains temporary migration-owner delegation"
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
    monkeypatch.setattr(
        RESET,
        "verify_post_cleanup_role_state",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(stale),
    )
    monkeypatch.setattr(
        RESET,
        "_normalize_stale_owner_delegation",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(stale),
    )

    with pytest.raises(
        RESET.RailwayCanonicalResetError,
        match=(
            "railway_ipv6_role_cleanup_recovery_failed:"
            "migration_owner_delegation_present"
        ),
    ):
        RESET._admin_database_url(
            password=DB_PASSWORD,
            application_name="canonical_test",
            control_transport=RESET.CONTROL_TRANSPORT_RAILWAY_IPV6,
            recover_stale_owner_delegation=True,
        )


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
    _attest_safe_owner_paths(monkeypatch)
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
                True,
                False,
                False,
                True,
                True,
            )
        ),
    )

    with pytest.raises(
        RESET.RailwayCanonicalResetError,
        match="railway_ipv6_database_authority_attestation_mismatch:current_user",
    ):
        RESET._admin_database_url(
            password=DB_PASSWORD,
            application_name="canonical_test",
            control_transport=RESET.CONTROL_TRANSPORT_RAILWAY_IPV6,
        )


def test_ipv6_admin_transport_attests_libpq_destination_not_server_interface(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _attest_safe_owner_paths(monkeypatch)
    address = "2606:4700:4700::1111"
    connection = _Connection(
        ("postgres", "postgres", "on", True, False, False, True, True),
        hostaddr="2606:4700:4700::2222",
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

    with pytest.raises(
        RESET.RailwayCanonicalResetError,
        match="railway_ipv6_database_authority_attestation_mismatch:libpq_hostaddr",
    ):
        RESET._admin_database_url(
            password=DB_PASSWORD,
            application_name="canonical_test",
            control_transport=RESET.CONTROL_TRANSPORT_RAILWAY_IPV6,
        )
    assert all("inet_server_addr" not in statement for statement in connection.statements)


def test_ipv6_admin_transport_rejects_executable_owner_authority(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    address = "2606:4700:4700::1111"
    connection = _Connection(
        ("postgres", "postgres", "on", True, True, False, True, True)
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
    monkeypatch.setattr(
        RESET,
        "verify_post_cleanup_role_state",
        lambda _connection, *, project_ref: {
            "project_ref": project_ref,
            "postgres_migration_owner_set": True,
            "postgres_migration_owner_usage": False,
            "verification_principal_superuser": False,
        },
    )

    with pytest.raises(
        RESET.RailwayCanonicalResetError,
        match="railway_ipv6_migration_owner_authority_unsafe",
    ):
        RESET._admin_database_url(
            password=DB_PASSWORD,
            application_name="canonical_test",
            control_transport=RESET.CONTROL_TRANSPORT_RAILWAY_IPV6,
        )
