from app.core.database import classify_database_connection


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
