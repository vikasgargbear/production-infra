import importlib.util
import sys
from pathlib import Path

import pytest


FIXTURES = Path(__file__).resolve().parents[1] / "live_erp" / "conftest.py"
SPEC = importlib.util.spec_from_file_location("live_erp_safety_fixtures", FIXTURES)
fixtures = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = fixtures
SPEC.loader.exec_module(fixtures)


def _config():
    return fixtures.LiveERPConfig(
        api_base_url="https://pilot-api.onrender.com",
        database_url="postgresql://private-user:private-password@db.example.test/db",
        access_token="private-access-token",
        test_org_id="test-org",
        test_branch_id=1,
        database_read_only=True,
    )


def test_live_config_repr_redacts_database_url_and_access_token():
    rendered = repr(_config())

    assert "private-password" not in rendered
    assert "private-access-token" not in rendered
    assert "database_url=" not in rendered
    assert "access_token=" not in rendered


class FakeCursor:
    def __init__(self, transaction_read_only):
        self.transaction_read_only = transaction_read_only

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return None

    def execute(self, sql):
        assert sql == "SHOW transaction_read_only"

    def fetchone(self):
        return (self.transaction_read_only,)


class FakeConnection:
    def __init__(self, transaction_read_only="on"):
        self.transaction_read_only = transaction_read_only
        self.set_session_calls = []
        self.closed = False

    def set_session(self, **kwargs):
        self.set_session_calls.append(kwargs)

    def cursor(self):
        return FakeCursor(self.transaction_read_only)

    def close(self):
        self.closed = True


def test_read_only_db_fixture_sets_and_verifies_session(monkeypatch):
    connection = FakeConnection()
    monkeypatch.setattr(fixtures.psycopg2, "connect", lambda _: connection)
    generator = fixtures.db_conn.__wrapped__(_config())

    assert next(generator) is connection
    assert connection.set_session_calls == [{"readonly": True, "autocommit": True}]
    with pytest.raises(StopIteration):
        next(generator)
    assert connection.closed


def test_read_only_db_fixture_fails_closed_when_pooler_ignores_session(monkeypatch):
    connection = FakeConnection(transaction_read_only="off")
    monkeypatch.setattr(fixtures.psycopg2, "connect", lambda _: connection)
    generator = fixtures.db_conn.__wrapped__(_config())

    with pytest.raises(RuntimeError, match="connection is not read-only"):
        next(generator)
    assert connection.closed
