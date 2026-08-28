#!/usr/bin/env python3
"""Fail-closed direct database connection helpers for canonical staging.

The checked-in deployment manifest owns every non-secret connection fact.
Passwords are accepted only at the call boundary, never retained in evidence,
and never included in an error.  This module does not mutate provider state,
retry through another transport, or fall back to Supavisor.
"""

from __future__ import annotations

from dataclasses import dataclass
import ipaddress
import json
from pathlib import Path
import re
import socket
from typing import Any, Callable, Mapping, Sequence
from urllib.parse import parse_qsl, quote, urlencode, unquote, urlsplit, urlunsplit

import psycopg2


def _resolve_repository_root(script_path: Path = Path(__file__)) -> Path:
    """Resolve source-checkout and flattened API-image layouts."""

    resolved = script_path.resolve()
    candidates = (resolved.parents[2], resolved.parents[1])
    for candidate in candidates:
        if (candidate / "deploy/control-plane/canonical-staging.json").is_file():
            return candidate
    return candidates[0]


REPO_ROOT = _resolve_repository_root()
DEFAULT_MANIFEST = REPO_ROOT / "deploy/control-plane/canonical-staging.json"
ROLE_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,62}$")
APPLICATION_NAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,62}$")
SAFE_DSN_QUERY_KEYS = frozenset(
    {"sslmode", "gssencmode", "connect_timeout", "application_name"}
)


class CanonicalStagingDatabaseError(RuntimeError):
    """A secret-free canonical database contract or attestation failure."""


@dataclass(frozen=True)
class DirectDatabaseContract:
    project_ref: str
    host: str
    port: int
    database: str
    connect_timeout_seconds: int
    administrator_role: str
    isolated_roles: tuple[str, ...]

    @property
    def roles(self) -> tuple[str, ...]:
        return (self.administrator_role, *self.isolated_roles)


@dataclass(frozen=True)
class DirectDatabaseEvidence:
    role: str
    host: str
    port: int
    database: str
    ipv4_answer_count: int
    selected_ipv4_address: str
    row_security: bool
    migration_owner_member: bool


def _database_document(path: Path) -> tuple[str, Mapping[str, Any]]:
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
        supabase = document["supabase"]
        project_ref = supabase["project_ref"]
        database = supabase["database"]
        if not isinstance(project_ref, str) or not isinstance(database, dict):
            raise TypeError
        return project_ref, database
    except (OSError, json.JSONDecodeError, KeyError, TypeError) as error:
        raise CanonicalStagingDatabaseError(
            "canonical database authority is missing or malformed"
        ) from None


def load_direct_database_contract(
    path: Path = DEFAULT_MANIFEST,
) -> DirectDatabaseContract:
    project_ref, database = _database_document(path)
    expected_host = f"db.{project_ref}.supabase.co"
    required = {
        "control_transport": "direct_ipv4",
        "host": expected_host,
        "port": 5432,
        "database": "postgres",
        "username_mode": "plain_role",
        "sslmode": "require",
        "gssencmode": "disable",
        "shared_supavisor_fallback": False,
        "administrator_role": "postgres",
    }
    if any(database.get(name) != value for name, value in required.items()):
        raise CanonicalStagingDatabaseError(
            "canonical database authority is not the reviewed direct IPv4 contract"
        )
    if "pooler.supabase.com" in str(database.get("host", "")):
        raise CanonicalStagingDatabaseError(
            "shared Supavisor is prohibited for canonical certification"
        )
    timeout = database.get("connect_timeout_seconds")
    isolated_roles = database.get("isolated_roles")
    if (
        not isinstance(timeout, int)
        or isinstance(timeout, bool)
        or not 1 <= timeout <= 30
    ):
        raise CanonicalStagingDatabaseError(
            "canonical database connect timeout is invalid"
        )
    if (
        not isinstance(isolated_roles, list)
        or not isolated_roles
        or len(isolated_roles) != len(set(isolated_roles))
        or any(
            not isinstance(role, str) or not ROLE_PATTERN.fullmatch(role)
            for role in isolated_roles
        )
    ):
        raise CanonicalStagingDatabaseError(
            "canonical isolated database roles are invalid"
        )
    return DirectDatabaseContract(
        project_ref=project_ref,
        host=expected_host,
        port=5432,
        database="postgres",
        connect_timeout_seconds=timeout,
        administrator_role="postgres",
        isolated_roles=tuple(isolated_roles),
    )


def build_direct_dsn(
    *,
    contract: DirectDatabaseContract,
    role: str,
    password: str,
    application_name: str,
) -> str:
    if role not in contract.roles or not ROLE_PATTERN.fullmatch(role):
        raise CanonicalStagingDatabaseError(
            "database role is not declared by the authority"
        )
    if not isinstance(password, str) or not password:
        raise CanonicalStagingDatabaseError("database password is empty")
    if not APPLICATION_NAME_PATTERN.fullmatch(application_name):
        raise CanonicalStagingDatabaseError("database application name is invalid")
    query = urlencode(
        {
            "sslmode": "require",
            "gssencmode": "disable",
            "connect_timeout": str(contract.connect_timeout_seconds),
            "application_name": application_name,
        }
    )
    return (
        f"postgresql://{quote(role, safe='')}:{quote(password, safe='')}"
        f"@{contract.host}:{contract.port}/{contract.database}?{query}"
    )


def redact_dsn(dsn: str) -> str:
    try:
        parsed = urlsplit(dsn)
        if (
            parsed.scheme not in {"postgres", "postgresql"}
            or not parsed.username
            or parsed.password is None
            or parsed.fragment
        ):
            raise ValueError
        hostname = parsed.hostname
        if hostname is None:
            raise ValueError
        username_value = unquote(parsed.username)
        if not ROLE_PATTERN.fullmatch(username_value):
            raise ValueError
        query_pairs = parse_qsl(
            parsed.query,
            keep_blank_values=True,
            strict_parsing=True,
        )
        if (
            len(query_pairs) != len(SAFE_DSN_QUERY_KEYS)
            or {name for name, _value in query_pairs} != SAFE_DSN_QUERY_KEYS
        ):
            raise ValueError
        query_values = dict(query_pairs)
        timeout = int(query_values["connect_timeout"])
        if (
            query_values["sslmode"] != "require"
            or query_values["gssencmode"] != "disable"
            or not 1 <= timeout <= 30
            or not APPLICATION_NAME_PATTERN.fullmatch(
                query_values["application_name"]
            )
        ):
            raise ValueError
        port = f":{parsed.port}" if parsed.port is not None else ""
        username = quote(username_value, safe="")
        return urlunsplit(
            (
                parsed.scheme,
                f"{username}:***@{hostname}{port}",
                parsed.path,
                urlencode(query_values),
                "",
            )
        )
    except (KeyError, TypeError, ValueError):
        raise CanonicalStagingDatabaseError(
            "database DSN cannot be safely redacted"
        ) from None


def _direct_ipv4_answers(
    contract: DirectDatabaseContract,
    resolver: Callable[..., Sequence[tuple[Any, ...]]],
) -> tuple[str, ...]:
    try:
        ipv4_answers = resolver(
            contract.host,
            contract.port,
            family=socket.AF_INET,
            type=socket.SOCK_STREAM,
        )
    except Exception:
        raise CanonicalStagingDatabaseError(
            "direct database host has no caller-visible IPv4 resolution"
        ) from None
    public_ipv4: set[str] = set()
    for answer in ipv4_answers:
        try:
            if answer[0] != socket.AF_INET:
                continue
            address = ipaddress.ip_address(answer[4][0])
        except (IndexError, TypeError, ValueError):
            continue
        if isinstance(address, ipaddress.IPv4Address) and address.is_global:
            public_ipv4.add(str(address))
    if not public_ipv4:
        raise CanonicalStagingDatabaseError(
            "direct database host has no caller-visible public IPv4 resolution"
        )
    try:
        ipv6_answers = resolver(
            contract.host,
            contract.port,
            family=socket.AF_INET6,
            type=socket.SOCK_STREAM,
        )
    except socket.gaierror as error:
        no_address_codes = {
            code
            for code in (
                getattr(socket, "EAI_NONAME", None),
                getattr(socket, "EAI_NODATA", None),
                getattr(socket, "EAI_ADDRFAMILY", None),
            )
            if code is not None
        }
        if error.errno not in no_address_codes:
            raise CanonicalStagingDatabaseError(
                "direct database IPv6 absence could not be established"
            ) from None
        ipv6_answers = ()
    except Exception:
        raise CanonicalStagingDatabaseError(
            "direct database IPv6 absence could not be established"
        ) from None
    if any(answer and answer[0] == socket.AF_INET6 for answer in ipv6_answers):
        raise CanonicalStagingDatabaseError(
            "direct IPv4 contract forbids caller-visible IPv6 resolution"
        )
    return tuple(sorted(public_ipv4, key=ipaddress.ip_address))


def verify_direct_database(
    *,
    contract: DirectDatabaseContract,
    role: str,
    password: str,
    application_name: str,
    resolver: Callable[..., Sequence[tuple[Any, ...]]] = socket.getaddrinfo,
    connect: Callable[..., Any] = psycopg2.connect,
) -> DirectDatabaseEvidence:
    """Verify direct IPv4 reachability and connected role/RLS posture once."""

    dsn = build_direct_dsn(
        contract=contract,
        role=role,
        password=password,
        application_name=application_name,
    )
    ipv4_answers = _direct_ipv4_answers(contract, resolver)
    selected_ipv4_address = ipv4_answers[0]
    try:
        with connect(dsn, hostaddr=selected_ipv4_address) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT current_user, role.rolsuper, role.rolcreaterole, "
                    "role.rolbypassrls, current_setting('row_security') = 'on', "
                    "current_database(), pg_has_role(current_user, "
                    "'erp_migration_owner', 'MEMBER') "
                    "FROM pg_catalog.pg_roles AS role "
                    "WHERE role.rolname = current_user"
                )
                posture = cursor.fetchone()
    except Exception as error:
        raise CanonicalStagingDatabaseError(
            f"direct database verification failed for {role}: {type(error).__name__}"
        ) from None

    expected_flags = (
        (False, True, True)
        if role == contract.administrator_role
        else (False, False, False)
    )
    if (
        not isinstance(posture, tuple)
        or len(posture) != 7
        or posture[0] != role
        or posture[1:4] != expected_flags
        or posture[4] is not True
        or posture[5] != contract.database
        or (
            role in contract.isolated_roles
            and posture[6] is not False
        )
    ):
        raise CanonicalStagingDatabaseError(
            f"direct database role or RLS posture mismatch for {role}"
        )
    return DirectDatabaseEvidence(
        role=role,
        host=contract.host,
        port=contract.port,
        database=contract.database,
        ipv4_answer_count=len(ipv4_answers),
        selected_ipv4_address=selected_ipv4_address,
        row_security=True,
        migration_owner_member=bool(posture[6]),
    )
