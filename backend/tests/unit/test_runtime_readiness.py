import asyncio
import json

from fastapi.responses import JSONResponse

from app import main


def test_database_readiness_probe_attests_transport_and_principal(monkeypatch):
    executed = []
    peer_checks = []
    readiness_row = {
        "principal": "erp_runtime",
        "rolsuper": False,
        "rolbypassrls": False,
        "migration_owner_member": False,
        "command_authority": True,
        "session_role_exists": True,
        "session_authority": True,
        "row_security": True,
    }

    class Result:
        def mappings(self):
            return self

        @staticmethod
        def one():
            return readiness_row

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return None

        def execute(self, statement):
            executed.append(str(statement))
            return Result()

    class Engine:
        @staticmethod
        def connect():
            return Connection()

    monkeypatch.setattr(main, "engine", Engine())
    monkeypatch.setattr(
        main,
        "validate_required_database_peers",
        lambda: peer_checks.append(True),
    )
    monkeypatch.setattr(main, "DATABASE_CONNECTION_MODE", "supabase_direct")
    monkeypatch.setattr(
        main, "DATABASE_TRANSPORT_REQUIREMENT", "supabase_direct_ipv6"
    )
    monkeypatch.setattr(
        main,
        "attest_database_transport",
        lambda *_args: {
            "requirement": "supabase_direct_ipv6",
            "transport": "supabase_direct",
            "ip_version": 6,
        },
    )

    assert main._database_readiness() == {
        "transport": "supabase_direct",
        "principal": "erp_runtime",
        "principal_isolated": True,
        "migration_owner_member": False,
        "command_authority": True,
        "session_role_exists": True,
        "session_authority": True,
        "row_security": True,
        "ip_version": 6,
    }
    assert "current_user AS principal" in executed[0]
    assert "pg_has_role" in executed[0]
    assert "erp_migration_owner" in executed[0]
    assert "inet_server_addr" not in executed[0]
    assert peer_checks == [True]

    readiness_row["migration_owner_member"] = True
    try:
        main._database_readiness()
    except RuntimeError as error:
        assert str(error) == "required direct IPv6 database transport is not ready"
    else:
        raise AssertionError("migration-owner membership passed the isolation gate")


def test_database_readiness_fails_closed_on_unattested_direct_transport(monkeypatch):
    class Result:
        def mappings(self):
            return self

        @staticmethod
        def one():
            return {
                "principal": "erp_runtime",
                "rolsuper": False,
                "rolbypassrls": False,
                "migration_owner_member": False,
                "command_authority": True,
                "session_role_exists": True,
                "session_authority": True,
                "row_security": True,
            }

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return None

        @staticmethod
        def execute(_statement):
            return Result()

    class Engine:
        @staticmethod
        def connect():
            return Connection()

    monkeypatch.setattr(main, "engine", Engine())
    monkeypatch.setattr(main, "DATABASE_CONNECTION_MODE", "supabase_direct")
    monkeypatch.setattr(
        main, "DATABASE_TRANSPORT_REQUIREMENT", "supabase_direct_ipv6"
    )

    def reject_transport(*_args):
        raise RuntimeError("required direct IPv6 database DNS path is unavailable")

    monkeypatch.setattr(main, "attest_database_transport", reject_transport)

    try:
        main._database_readiness()
    except RuntimeError as error:
        assert str(error) == "required direct IPv6 database DNS path is unavailable"
    else:
        raise AssertionError("unattested transport unexpectedly passed readiness")


def test_database_readiness_accepts_attested_direct_ipv4(monkeypatch):
    readiness_row = {
        "principal": "erp_runtime",
        "rolsuper": False,
        "rolbypassrls": False,
        "migration_owner_member": False,
        "command_authority": True,
        "session_role_exists": True,
        "session_authority": True,
        "row_security": True,
    }

    class Result:
        def mappings(self):
            return self

        def one(self):
            return readiness_row

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return None

        def execute(self, _statement):
            return Result()

    class Engine:
        def connect(self):
            return Connection()

    monkeypatch.setattr(main, "engine", Engine())
    monkeypatch.setattr(main, "DATABASE_CONNECTION_MODE", "supabase_direct")
    monkeypatch.setattr(
        main, "DATABASE_TRANSPORT_REQUIREMENT", "supabase_direct_ipv4"
    )
    monkeypatch.setattr(
        main,
        "attest_database_transport",
        lambda *_args: {
            "requirement": "supabase_direct_ipv4",
            "transport": "supabase_direct",
            "ip_version": 4,
        },
    )

    assert main._database_readiness()["ip_version"] == 4


def test_ready_returns_success_only_after_database_probe(monkeypatch):
    database = {
        "transport": "supabase_direct",
        "principal": "erp_runtime",
        "principal_isolated": True,
        "migration_owner_member": False,
        "command_authority": True,
        "session_role_exists": True,
        "session_authority": True,
        "row_security": True,
        "ip_version": 6,
    }
    monkeypatch.setattr(main, "_database_readiness", lambda: database)

    assert asyncio.run(main.readiness_check()) == {
        "status": "ready",
        "database": database,
    }


def test_ready_reports_maintenance_until_public_session_authority_opens(monkeypatch):
    database = {
        "transport": "supabase_direct",
        "principal": "erp_runtime",
        "principal_isolated": True,
        "migration_owner_member": False,
        "command_authority": True,
        "session_role_exists": True,
        "session_authority": False,
        "row_security": True,
        "ip_version": 6,
    }
    monkeypatch.setattr(main, "_database_readiness", lambda: database)

    response = asyncio.run(main.readiness_check())

    assert isinstance(response, JSONResponse)
    assert response.status_code == 503
    assert json.loads(response.body) == {
        "status": "maintenance",
        "database": database,
    }


def test_ready_fails_closed_on_partial_authority_drift(monkeypatch):
    open_state = {
        "transport": "supabase_direct",
        "principal": "erp_runtime",
        "principal_isolated": True,
        "migration_owner_member": False,
        "command_authority": True,
        "session_role_exists": True,
        "session_authority": True,
        "row_security": True,
        "ip_version": 6,
    }

    for field in (
        "principal_isolated",
        "command_authority",
        "session_role_exists",
        "session_authority",
    ):
        database = {**open_state, field: False}
        monkeypatch.setattr(main, "_database_readiness", lambda: database)

        response = asyncio.run(main.readiness_check())

        assert isinstance(response, JSONResponse)
        assert response.status_code == 503
        assert json.loads(response.body) == {
            "status": "maintenance",
            "database": database,
        }


def test_ready_returns_generic_503_without_exception_details(monkeypatch):
    secret = "postgresql://user:password@private-host/database"

    def fail():
        raise RuntimeError(secret)

    monkeypatch.setattr(main, "_database_readiness", fail)
    response = asyncio.run(main.readiness_check())

    assert isinstance(response, JSONResponse)
    assert response.status_code == 503
    assert json.loads(response.body) == {"status": "not_ready"}
    assert secret.encode() not in response.body


def test_ready_timeout_is_bounded_and_returns_generic_503(monkeypatch):
    async def never_finishes(*_args, **_kwargs):
        await asyncio.sleep(1)

    monkeypatch.setattr(main, "run_in_threadpool", never_finishes)
    monkeypatch.setattr(main, "READINESS_TIMEOUT_SECONDS", 0.001)

    response = asyncio.run(main.readiness_check())

    assert isinstance(response, JSONResponse)
    assert response.status_code == 503
    assert json.loads(response.body) == {"status": "not_ready"}
