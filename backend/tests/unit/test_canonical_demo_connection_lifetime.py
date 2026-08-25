from __future__ import annotations

import ast
import importlib.util
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT = REPO_ROOT / "backend/scripts/provision_canonical_demo.py"


def _load_module():
    spec = importlib.util.spec_from_file_location(
        "provision_canonical_demo_connection_lifetime", SCRIPT
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _Connection:
    def __init__(self, tracker: "_Tracker") -> None:
        self.tracker = tracker
        self.closed = False

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        self.tracker.transaction_exits += 1
        return False

    def close(self) -> None:
        if self.closed:
            raise AssertionError("connection closed more than once")
        self.closed = True
        self.tracker.active -= 1


class _Tracker:
    def __init__(self, capacity: int = 5) -> None:
        self.capacity = capacity
        self.active = 0
        self.maximum_active = 0
        self.transaction_exits = 0
        self.connections: list[_Connection] = []

    def connect(self, _database_url: str) -> _Connection:
        self.active += 1
        self.maximum_active = max(self.maximum_active, self.active)
        if self.active > self.capacity:
            raise AssertionError("staging session capacity exceeded")
        connection = _Connection(self)
        self.connections.append(connection)
        return connection


def test_database_connection_releases_each_sequential_session(monkeypatch):
    module = _load_module()
    tracker = _Tracker(capacity=5)
    monkeypatch.setenv("ERP_RUNTIME_DATABASE_URL", "postgresql://runtime.invalid/db")
    monkeypatch.setattr(module.psycopg2, "connect", tracker.connect)

    for _ in range(24):
        with module.database_connection("ERP_RUNTIME_DATABASE_URL") as connection:
            assert not connection.closed

    assert tracker.active == 0
    assert tracker.maximum_active == 1
    assert tracker.transaction_exits == 24
    assert all(connection.closed for connection in tracker.connections)


def test_database_connection_releases_session_after_failure(monkeypatch):
    module = _load_module()
    tracker = _Tracker(capacity=5)
    monkeypatch.setenv("PSYCOPG_DATABASE_URL", "postgresql://owner.invalid/db")
    monkeypatch.setattr(module.psycopg2, "connect", tracker.connect)

    with pytest.raises(RuntimeError, match="injected reconciliation failure"):
        with module.database_connection("PSYCOPG_DATABASE_URL"):
            raise RuntimeError("injected reconciliation failure")

    assert tracker.active == 0
    assert tracker.maximum_active == 1
    assert tracker.transaction_exits == 1
    assert tracker.connections[0].closed


def test_provisioner_has_no_implicit_psycopg_contexts_or_retained_preflight_pool():
    source = SCRIPT.read_text(encoding="utf-8")
    tree = ast.parse(source)
    raw_connect_calls = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and isinstance(node.func.value, ast.Name)
        and node.func.value.id == "psycopg2"
        and node.func.attr == "connect"
    ]

    # The sole driver connect is owned by database_connection(), whose finally
    # closes the client. Every call site uses that explicit-closing boundary.
    assert len(raw_connect_calls) == 1
    assert source.count('database_connection("') == 24
    assert "connection.close()" in source

    preflight_action = source.split("def preflight_action", 1)[1].split(
        "\ndef exercise_action", 1
    )[0]
    preflight_sales_order = source.split("def preflight_sales_order", 1)[1].split(
        "\ndef exercise_sales_order", 1
    )[0]
    assert preflight_action.count("poolclass=NullPool") == 2
    assert preflight_sales_order.count("poolclass=NullPool") == 1
    assert "runtime_engine.dispose()" in preflight_action
    assert "calculator_engine.dispose()" in preflight_action
    assert "engine.dispose()" in preflight_sales_order


def test_reviewed_staging_session_budget_stays_below_five_clients():
    # The demo calls its one-worker API sequentially. One request can hold one
    # runtime plus one calculator connection. The provisioner can hold at most
    # two NullPool connections during rollback preflight; direct reconciliation
    # connections are explicitly closed and never overlap those preflights.
    staging_session_capacity = 5
    api_request_peak = 2
    provisioner_preflight_peak = 2

    source = SCRIPT.read_text(encoding="utf-8")
    workflow = (REPO_ROOT / ".github/workflows/canonical-staging.yml").read_text(
        encoding="utf-8"
    )
    assert "requests.request(" in source
    assert "ThreadPoolExecutor" not in source
    assert "asyncio.gather" not in source
    assert "--host 127.0.0.1 --port 8090 --workers 1" in workflow

    assert api_request_peak + provisioner_preflight_peak < staging_session_capacity
