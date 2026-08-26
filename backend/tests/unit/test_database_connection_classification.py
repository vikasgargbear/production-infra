import pytest

from app.core.database import (
    _bounded_pool_setting,
    attest_database_transport,
    classify_database_connection,
    required_database_ip_version,
    validate_database_transport_requirement,
)


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


@pytest.mark.parametrize(
    ("requirement", "expected_ip_version"),
    [
        ("", None),
        ("supabase_direct_ipv4", 4),
        ("supabase_direct_ipv6", 6),
    ],
)
def test_direct_transport_requirements_are_typed(requirement, expected_ip_version):
    assert required_database_ip_version(requirement) == expected_ip_version
    hostaddr = "13.248.118.66" if expected_ip_version != 6 else "2606:4700::6810:85e5"
    database_url = (
        "postgresql://erp_runtime:secret@db.project.supabase.co:5432/postgres"
        f"?sslmode=require&hostaddr={hostaddr}"
    )
    assert (
        validate_database_transport_requirement(
            requirement,
            "supabase_direct",
            database_url,
        )
        == expected_ip_version
    )


def test_direct_transport_requirement_rejects_pooler_and_unknown_modes():
    with pytest.raises(RuntimeError, match="direct IPv4 database endpoint"):
        validate_database_transport_requirement(
            "supabase_direct_ipv4",
            "supabase_session_pooler",
            "postgresql://erp_runtime:secret@pooler.supabase.com:5432/postgres",
        )

    with pytest.raises(RuntimeError, match="must be empty"):
        required_database_ip_version("supavisor_fallback")


@pytest.mark.parametrize(
    ("database_url", "message"),
    [
        (
            "postgresql://erp_runtime:secret@db.project.supabase.co/postgres"
            "?sslmode=require&hostaddr=13.248.118.66",
            "endpoint is not exact",
        ),
        (
            "postgresql://erp_runtime:secret@db.project.supabase.co:5432/postgres"
            "?hostaddr=13.248.118.66",
            "TLS mode is not configured",
        ),
        (
            "postgresql://erp_runtime:secret@db.project.supabase.co:5432/postgres"
            "?sslmode=require&hostaddr=127.0.0.1",
            "hostaddr is not public",
        ),
        (
            "postgresql://erp_runtime:secret@db.project.supabase.co:5432/postgres"
            "?sslmode=require&hostaddr=13.248.118.66&host=pooler.example",
            "endpoint has an override",
        ),
    ],
)
def test_direct_ipv4_transport_requires_exact_public_tls_endpoint(
    database_url,
    message,
):
    with pytest.raises(RuntimeError, match=message):
        validate_database_transport_requirement(
            "supabase_direct_ipv4",
            classify_database_connection(database_url),
            database_url,
        )


def test_direct_ipv4_transport_requires_pinned_current_dns_address():
    database_url = (
        "postgresql://erp_runtime:secret@db.project.supabase.co:5432/postgres"
        "?sslmode=require&hostaddr=13.248.118.66"
    )

    def resolve(host, port, family, socket_type):
        assert (host, port) == ("db.project.supabase.co", 5432)
        return [(family, socket_type, 6, "", ("13.248.118.66", port))]

    assert attest_database_transport(
        database_url,
        "supabase_direct_ipv4",
        resolver=resolve,
    ) == {
        "requirement": "supabase_direct_ipv4",
        "transport": "supabase_direct",
        "ip_version": 4,
    }


def test_direct_ipv4_transport_rejects_dns_drift_without_fallback():
    database_url = (
        "postgresql://erp_runtime:secret@db.project.supabase.co:5432/postgres"
        "?sslmode=require&hostaddr=13.248.118.66"
    )

    with pytest.raises(RuntimeError, match="not a current DNS path"):
        attest_database_transport(
            database_url,
            "supabase_direct_ipv4",
            resolver=lambda *_args: [
                (2, 1, 6, "", ("13.248.118.67", 5432))
            ],
        )
