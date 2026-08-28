import socket

import pytest

from app.core.database import (
    DATABASE_POOL_TIMEOUT_SECONDS,
    _bounded_pool_setting,
    attest_database_transport,
    classify_database_connection,
    required_database_ip_version,
    validate_direct_database_connection_budget,
    validate_database_transport_requirement,
    validate_direct_database_peer,
)


def test_pool_wait_fails_before_browser_session_deadline():
    assert 1 <= DATABASE_POOL_TIMEOUT_SECONDS <= 8


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
    database_url = (
        "postgresql://erp_runtime:secret@db.project.supabase.co:5432/postgres"
        "?sslmode=require"
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


def test_direct_transport_requires_reviewed_main_connection_budget():
    validate_direct_database_connection_budget("supabase_direct_ipv4", 3, 1)
    validate_direct_database_connection_budget("", 20, 40)

    with pytest.raises(RuntimeError, match="DATABASE_POOL_SIZE=3"):
        validate_direct_database_connection_budget("supabase_direct_ipv4", 4, 1)
    with pytest.raises(RuntimeError, match="DATABASE_MAX_OVERFLOW=1"):
        validate_direct_database_connection_budget("supabase_direct_ipv4", 3, 2)


@pytest.mark.parametrize(
    ("database_url", "message"),
    [
        (
            "postgresql://erp_runtime:secret@db.project.supabase.co/postgres"
            "?sslmode=require",
            "endpoint is not exact",
        ),
        (
            "postgresql://erp_runtime:secret@db.project.supabase.co:5432/postgres",
            "TLS mode is not configured",
        ),
        (
            "postgresql://erp_runtime:secret@db.project.supabase.co:5432/postgres"
            "?sslmode=require&hostaddr=13.248.118.66",
            "endpoint has an override",
        ),
        (
            "postgresql://erp_runtime:secret@db.project.supabase.co:5432/postgres"
            "?sslmode=require&host=pooler.example",
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


def test_direct_ipv4_transport_requires_public_a_and_no_aaaa():
    database_url = (
        "postgresql://erp_runtime:secret@db.project.supabase.co:5432/postgres"
        "?sslmode=require"
    )

    def resolve(host, port, family, socket_type):
        assert (host, port) == ("db.project.supabase.co", 5432)
        if family == socket.AF_INET:
            return [(family, socket_type, 6, "", ("13.248.118.66", port))]
        return []

    assert attest_database_transport(
        database_url,
        "supabase_direct_ipv4",
        resolver=resolve,
    ) == {
        "requirement": "supabase_direct_ipv4",
        "transport": "supabase_direct",
        "ip_version": 4,
    }


def test_direct_ipv4_transport_rejects_missing_a_without_fallback():
    database_url = (
        "postgresql://erp_runtime:secret@db.project.supabase.co:5432/postgres"
        "?sslmode=require"
    )

    with pytest.raises(RuntimeError, match="has no public address"):
        attest_database_transport(
            database_url,
            "supabase_direct_ipv4",
            resolver=lambda *_args: [],
        )


def test_direct_ipv4_transport_rejects_remaining_public_aaaa():
    database_url = (
        "postgresql://erp_runtime:secret@db.project.supabase.co:5432/postgres"
        "?sslmode=require"
    )

    def resolve(_host, port, family, socket_type):
        address = (
            "13.248.118.66"
            if family == socket.AF_INET
            else "2606:4700::6810:85e5"
        )
        return [(family, socket_type, 6, "", (address, port))]

    with pytest.raises(RuntimeError, match="still exposes public IPv6"):
        attest_database_transport(
            database_url,
            "supabase_direct_ipv4",
            resolver=resolve,
        )


def test_direct_peer_requires_plain_role_and_same_direct_authority():
    primary = (
        "postgresql://erp_runtime:secret@db.project.supabase.co:5432/postgres"
        "?sslmode=require"
    )
    validate_direct_database_peer(
        primary.replace("erp_runtime", "erp_calculator"),
        primary,
        "erp_calculator",
        "supabase_direct_ipv4",
    )

    with pytest.raises(RuntimeError, match="authenticate as erp_calculator"):
        validate_direct_database_peer(
            primary.replace("erp_runtime", "erp_runtime.other"),
            primary,
            "erp_calculator",
            "supabase_direct_ipv4",
        )
    with pytest.raises(RuntimeError, match="primary direct database authority"):
        validate_direct_database_peer(
            primary.replace("erp_runtime", "erp_calculator").replace(
                "db.project.supabase.co", "db.other.supabase.co"
            ),
            primary,
            "erp_calculator",
            "supabase_direct_ipv4",
        )
