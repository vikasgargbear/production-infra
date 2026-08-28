from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT = REPO_ROOT / "backend/tests/postgres/check_canonical_demo_replay_hardening.py"


def _load_module():
    spec = importlib.util.spec_from_file_location(
        "canonical_demo_replay_hardening_boundary", SCRIPT
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _Connection:
    def __init__(self, server_version: int = 150019) -> None:
        self.server_version = server_version
        self.closed = False

    def close(self) -> None:
        self.closed = True


def test_replay_connection_requires_explicit_disposable_opt_in(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = _load_module()
    monkeypatch.delenv("CANONICAL_CI_ALLOW_DISPOSABLE", raising=False)
    monkeypatch.setenv(
        "DATABASE_URL", "postgresql://postgres@127.0.0.1/canonical_alembic_ci"
    )
    monkeypatch.setattr(
        module.psycopg2,
        "connect",
        lambda **_kwargs: pytest.fail("missing opt-in must fail before connecting"),
    )

    with pytest.raises(RuntimeError, match="explicit opt-in"):
        module._connect()


@pytest.mark.parametrize(
    ("database_url", "message"),
    (
        (
            "postgresql://postgres@db.example.invalid/canonical_alembic_ci",
            "exact loopback host",
        ),
        ("postgresql://postgres@127.0.0.1/postgres", "canonical_alembic_ci"),
    ),
)
def test_replay_connection_rejects_unreviewed_database_targets_before_connect(
    monkeypatch: pytest.MonkeyPatch, database_url: str, message: str
) -> None:
    module = _load_module()
    monkeypatch.setenv("CANONICAL_CI_ALLOW_DISPOSABLE", "1")
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setattr(
        module.psycopg2,
        "connect",
        lambda **_kwargs: pytest.fail("invalid target must fail before connecting"),
    )

    with pytest.raises(RuntimeError, match=message):
        module._connect()


def test_replay_connection_accepts_only_local_postgresql_15(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = _load_module()
    observed: dict[str, object] = {}
    connection = _Connection()
    monkeypatch.setenv("CANONICAL_CI_ALLOW_DISPOSABLE", "1")
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql://fixture:secret@localhost:55432/canonical_alembic_ci",
    )
    monkeypatch.setattr(
        module.psycopg2,
        "connect",
        lambda **kwargs: observed.update(kwargs) or connection,
    )

    assert module._connect() is connection
    assert observed == {
        "host": "localhost",
        "port": 55432,
        "dbname": "canonical_alembic_ci",
        "user": "fixture",
        "password": "secret",
    }
    assert connection.closed is False


def test_replay_connection_closes_non_postgresql_15_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = _load_module()
    connection = _Connection(server_version=170004)
    monkeypatch.setenv("CANONICAL_CI_ALLOW_DISPOSABLE", "1")
    monkeypatch.setenv(
        "DATABASE_URL", "postgresql://postgres@127.0.0.1/canonical_alembic_ci"
    )
    monkeypatch.setattr(module.psycopg2, "connect", lambda **_kwargs: connection)

    with pytest.raises(RuntimeError, match="PostgreSQL 15"):
        module._connect()

    assert connection.closed is True
