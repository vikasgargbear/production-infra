from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import socket
import sys
from urllib.parse import parse_qs, quote, unquote, urlsplit

import pytest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "backend/scripts/canonical_staging_database.py"
SPEC = importlib.util.spec_from_file_location("canonical_staging_database", SCRIPT)
assert SPEC and SPEC.loader
DATABASE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = DATABASE
SPEC.loader.exec_module(DATABASE)
MANIFEST_PATH = ROOT / "deploy/control-plane/canonical-staging.json"


def contract():
    return DATABASE.load_direct_database_contract(MANIFEST_PATH)


class FakeCursor:
    def __init__(self, posture: tuple[object, ...]) -> None:
        self.posture = posture
        self.query = ""

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def execute(self, query: str) -> None:
        self.query = query

    def fetchone(self):
        return self.posture


class FakeConnection:
    def __init__(self, posture: tuple[object, ...]) -> None:
        self.cursor_instance = FakeCursor(posture)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def cursor(self):
        return self.cursor_instance


def direct_ipv4_resolver(host: str, port: int, *, family: int, type: int):
    assert host == "db.rgihahbmkrmhitjdjvev.supabase.co"
    assert port == 5432
    assert type == socket.SOCK_STREAM
    if family == socket.AF_INET:
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.1.1.1", port))]
    assert family == socket.AF_INET6
    return []


def test_manifest_loads_exact_direct_ipv4_contract() -> None:
    value = contract()

    assert value.host == "db.rgihahbmkrmhitjdjvev.supabase.co"
    assert value.port == 5432
    assert value.database == "postgres"
    assert value.administrator_role == "postgres"
    assert value.isolated_roles == (
        "erp_runtime",
        "erp_calculator",
        "erp_tax_provider",
        "erp_regulatory_importer",
    )


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("control_transport", "session_pooler"),
        ("host", "aws-0-ap-south-1.pooler.supabase.com"),
        ("port", 6543),
        ("username_mode", "project_qualified_role"),
        ("shared_supavisor_fallback", True),
    ],
)
def test_contract_rejects_transport_drift(
    tmp_path: Path, field: str, value: object
) -> None:
    document = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    document["supabase"]["database"][field] = value
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(document), encoding="utf-8")

    with pytest.raises(
        DATABASE.CanonicalStagingDatabaseError,
        match="reviewed direct IPv4 contract|Supavisor",
    ):
        DATABASE.load_direct_database_contract(path)


def test_dsn_uses_plain_role_exact_host_and_secret_safe_redaction() -> None:
    secret = "p@ss/word?with#delimiters"
    dsn = DATABASE.build_direct_dsn(
        contract=contract(),
        role="erp_runtime",
        password=secret,
        application_name="canonical.direct.verify",
    )
    parsed = urlsplit(dsn)
    query = parse_qs(parsed.query)

    assert unquote(parsed.username or "") == "erp_runtime"
    assert ".rgihahbmkrmhitjdjvev" not in unquote(parsed.username or "")
    assert parsed.hostname == "db.rgihahbmkrmhitjdjvev.supabase.co"
    assert parsed.port == 5432
    assert parsed.path == "/postgres"
    assert query == {
        "sslmode": ["require"],
        "gssencmode": ["disable"],
        "connect_timeout": ["15"],
        "application_name": ["canonical.direct.verify"],
    }
    redacted = DATABASE.redact_dsn(dsn)
    assert secret not in redacted
    assert "p%40ss" not in redacted
    assert "erp_runtime:***@db.rgihahbmkrmhitjdjvev.supabase.co:5432" in redacted


@pytest.mark.parametrize("unsafe_key", ["password", "passfile", "sslpassword", "x"])
def test_redaction_rejects_query_keys_outside_builder_allowlist(
    unsafe_key: str,
) -> None:
    secret = "query-secret-must-not-escape"
    dsn = DATABASE.build_direct_dsn(
        contract=contract(),
        role="erp_runtime",
        password="connection-secret",
        application_name="canonical_direct_verify",
    )
    malicious_dsn = f"{dsn}&{unsafe_key}={secret}"

    with pytest.raises(DATABASE.CanonicalStagingDatabaseError) as raised:
        DATABASE.redact_dsn(malicious_dsn)

    assert secret not in str(raised.value)


def test_redaction_rejects_secret_disguised_as_safe_query_value() -> None:
    dsn = DATABASE.build_direct_dsn(
        contract=contract(),
        role="erp_runtime",
        password="connection-secret",
        application_name="canonical_direct_verify",
    )
    malicious_dsn = dsn.replace("sslmode=require", "sslmode=not-a-safe-mode")

    with pytest.raises(DATABASE.CanonicalStagingDatabaseError):
        DATABASE.redact_dsn(malicious_dsn)


def test_verifier_proves_caller_ipv4_role_and_rls_without_fallback() -> None:
    connections: list[tuple[str, str]] = []
    connection = FakeConnection(
        ("erp_runtime", False, False, False, True, "postgres", False)
    )

    def connect(dsn: str, *, hostaddr: str):
        connections.append((dsn, hostaddr))
        return connection

    evidence = DATABASE.verify_direct_database(
        contract=contract(),
        role="erp_runtime",
        password="secret-value",
        application_name="canonical_direct_verify",
        resolver=direct_ipv4_resolver,
        connect=connect,
    )

    assert len(connections) == 1
    assert "pooler.supabase.com" not in connections[0][0]
    assert "1.1.1.1" not in connections[0][0]
    assert connections[0][1] == "1.1.1.1"
    assert evidence == DATABASE.DirectDatabaseEvidence(
        role="erp_runtime",
        host="db.rgihahbmkrmhitjdjvev.supabase.co",
        port=5432,
        database="postgres",
        ipv4_answer_count=1,
        selected_ipv4_address="1.1.1.1",
        row_security=True,
        migration_owner_member=False,
    )
    assert "inet_server_addr" not in connection.cursor_instance.query
    assert "current_setting('row_security')" in connection.cursor_instance.query


@pytest.mark.parametrize(
    "posture",
    [
        ("wrong_role", False, False, False, True, "postgres", False),
        ("erp_runtime", True, False, False, True, "postgres", False),
        ("erp_runtime", False, True, False, True, "postgres", False),
        ("erp_runtime", False, False, True, True, "postgres", False),
        ("erp_runtime", False, False, False, False, "postgres", False),
        ("erp_runtime", False, False, False, True, "wrong_database", False),
        ("erp_runtime", False, False, False, True, "postgres", True),
    ],
)
def test_verifier_rejects_role_or_rls_posture(posture: tuple[object, ...]) -> None:
    with pytest.raises(
        DATABASE.CanonicalStagingDatabaseError,
        match="role or RLS posture mismatch",
    ):
        DATABASE.verify_direct_database(
            contract=contract(),
            role="erp_runtime",
            password="secret-value",
            application_name="canonical_direct_verify",
            resolver=direct_ipv4_resolver,
            connect=lambda _dsn, **_kwargs: FakeConnection(posture),
        )


def test_verifier_rejects_missing_ipv4_before_connecting() -> None:
    connected = False

    def connect(_dsn: str, **_kwargs):
        nonlocal connected
        connected = True
        raise AssertionError

    with pytest.raises(
        DATABASE.CanonicalStagingDatabaseError,
        match="no caller-visible public IPv4 resolution",
    ):
        DATABASE.verify_direct_database(
            contract=contract(),
            role="erp_runtime",
            password="secret-value",
            application_name="canonical_direct_verify",
            resolver=lambda *_args, **_kwargs: [],
            connect=connect,
        )
    assert connected is False


def test_verifier_rejects_caller_visible_ipv6_before_connecting() -> None:
    connected = False

    def dual_stack_resolver(
        _host: str, port: int, *, family: int, type: int
    ):
        if family == socket.AF_INET:
            return [(family, type, 6, "", ("1.1.1.1", port))]
        return [(family, type, 6, "", ("2606:4700:4700::1111", port, 0, 0))]

    def connect(_dsn: str, **_kwargs):
        nonlocal connected
        connected = True
        raise AssertionError

    with pytest.raises(
        DATABASE.CanonicalStagingDatabaseError,
        match="forbids caller-visible IPv6",
    ):
        DATABASE.verify_direct_database(
            contract=contract(),
            role="erp_runtime",
            password="secret-value",
            application_name="canonical_direct_verify",
            resolver=dual_stack_resolver,
            connect=connect,
        )
    assert connected is False


def test_verifier_rejects_non_public_ipv4_before_connecting() -> None:
    with pytest.raises(
        DATABASE.CanonicalStagingDatabaseError,
        match="no caller-visible public IPv4 resolution",
    ):
        DATABASE.verify_direct_database(
            contract=contract(),
            role="erp_runtime",
            password="secret-value",
            application_name="canonical_direct_verify",
            resolver=lambda *_args, **_kwargs: [
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 5432))
            ],
            connect=lambda *_args, **_kwargs: FakeConnection(()),
        )


def test_connection_failure_never_exposes_password() -> None:
    secret = "this-must-never-appear"

    def fail(dsn: str, **_kwargs):
        raise RuntimeError(f"provider echoed {dsn}")

    with pytest.raises(DATABASE.CanonicalStagingDatabaseError) as raised:
        DATABASE.verify_direct_database(
            contract=contract(),
            role="erp_runtime",
            password=secret,
            application_name="canonical_direct_verify",
            resolver=direct_ipv4_resolver,
            connect=fail,
        )

    assert secret not in str(raised.value)
    assert quote(secret, safe="") not in str(raised.value)
