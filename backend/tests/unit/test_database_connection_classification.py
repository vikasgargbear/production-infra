import pytest

from app.core.database import _bounded_pool_setting, classify_database_connection


def test_supabase_direct_connection_uses_project_host_and_5432():
    assert (
        classify_database_connection(
            "postgresql://postgres:secret@db.jfrairkkzxwkhbtqejnz.supabase.co:5432/postgres"
        )
        == "supabase_direct"
    )


def test_supabase_shared_pooler_5432_is_session_mode():
    assert (
        classify_database_connection(
            "postgresql://postgres.project:secret@aws-0-region.pooler.supabase.com:5432/postgres"
        )
        == "supabase_session_pooler"
    )


def test_supabase_pooler_6543_is_transaction_mode():
    assert (
        classify_database_connection(
            "postgresql://postgres.project:secret@aws-0-region.pooler.supabase.com:6543/postgres"
        )
        == "supabase_transaction_pooler"
    )
    assert (
        classify_database_connection(
            "postgresql://postgres:secret@db.jfrairkkzxwkhbtqejnz.supabase.co:6543/postgres"
        )
        == "supabase_transaction_pooler"
    )


def test_non_supabase_and_lookalike_hosts_are_not_classified_as_supabase():
    assert classify_database_connection("postgresql://localhost:5432/postgres") == "other"
    assert (
        classify_database_connection(
            "postgresql://postgres:secret@db.project.supabase.co.attacker.test:5432/postgres"
        )
        == "other"
    )


def test_unrecognized_supabase_ports_fail_to_an_explicit_unknown_mode():
    assert (
        classify_database_connection(
            "postgresql://postgres:secret@db.jfrairkkzxwkhbtqejnz.supabase.co:9999/postgres"
        )
        == "supabase_direct_unknown"
    )


def test_pool_budget_uses_explicit_bounded_environment_values(monkeypatch):
    monkeypatch.setenv("TEST_DATABASE_POOL_SIZE", "3")
    assert _bounded_pool_setting(
        "TEST_DATABASE_POOL_SIZE", default=10, minimum=1, maximum=20
    ) == 3

    monkeypatch.setenv("TEST_DATABASE_POOL_SIZE", "0")
    with pytest.raises(RuntimeError, match="between 1 and 20"):
        _bounded_pool_setting(
            "TEST_DATABASE_POOL_SIZE", default=10, minimum=1, maximum=20
        )

    monkeypatch.setenv("TEST_DATABASE_POOL_SIZE", "many")
    with pytest.raises(RuntimeError, match="must be an integer"):
        _bounded_pool_setting(
            "TEST_DATABASE_POOL_SIZE", default=10, minimum=1, maximum=20
        )
