#!/usr/bin/env python3
"""Run Live18 database-only setup and evidence inside the exact Railway API image.

GitHub-hosted runners cannot reach Supabase's IPv6-only direct endpoint.  This
protocol accepts a bounded JSON request over Railway SSH stdin, performs the
database work from the deployed Railway container, and writes a single JSON
response to stdout.  Database/admin credentials are process-local only: they
are never added to Railway variables, command arguments, or the response.
"""

from __future__ import annotations

import argparse
import base64
import contextlib
from decimal import Decimal
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
from typing import Any
from urllib.parse import unquote, urlsplit
from urllib.parse import quote
from uuid import UUID

import psycopg2
from alembic import command as alembic_command
from alembic.config import Config as AlembicConfig
from alembic.script import ScriptDirectory
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag

SCRIPT_DIRECTORY = Path(__file__).resolve().parent
BACKEND_DIRECTORY = SCRIPT_DIRECTORY.parent
if str(BACKEND_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIRECTORY))
if str(SCRIPT_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIRECTORY))

from app.domain.operator_actions.contract import (  # noqa: E402
    PREPARE_PAYLOAD_MODELS,
    validate_prepare_payload_semantics,
)
from canonical_migration_contract import load_contract  # noqa: E402
from live18_evidence_contract import MANDATORY_LINEAGE_PATHS  # noqa: E402
from provision_ephemeral_browser_identities import (  # noqa: E402
    EXPECTED_PROJECT_REF,
    PROFILE_LIVE18,
    cleanup as cleanup_browser_identities,
    provision as provision_browser_identities,
    recover_lost_live18_state,
)
from provision_ephemeral_canonical_live import (  # noqa: E402
    cleanup as cleanup_mcp_identities,
    provision as provision_mcp_identities,
)
from tests.live_canonical.reconciliation import CanonicalReconciler  # noqa: E402


SCHEMA = "aasopharma.live18.railway-database-phase.v1"
RESPONSE_SCHEMA = "aasopharma.live18.railway-database-response.v1"
EXACT_SHA = re.compile(r"^[0-9a-f]{40}$")
EXACT_NONCE = re.compile(r"^[0-9a-f]{64}$")
MAX_REQUEST_BYTES = 8 * 1024 * 1024
OPERATION_MATRIX_PATH = (
    BACKEND_DIRECTORY / "tests" / "live_acceptance" / "operation_matrix.json"
)
DEPLOYMENT_PROVENANCE_PATH = Path("/app/.railway-deployment-provenance")
REMOTE_STATE_ROOT = Path("/tmp")
SECRET_KEYS = {
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_DB_PASSWORD",
    "SUPABASE_ANON_KEY",
}
DEMO_SECRET_KEYS = {
    "SUPABASE_DB_PASSWORD",
    "ERP_REGULATORY_IMPORTER_PASSWORD",
}
IDENTITY_ENVIRONMENT_KEYS = {
    "PLAYWRIGHT_LIVE_REQUESTER_EMAIL",
    "PLAYWRIGHT_LIVE_REQUESTER_PASSWORD",
    "PLAYWRIGHT_LIVE_REVIEWER_EMAIL",
    "PLAYWRIGHT_LIVE_REVIEWER_PASSWORD",
    "LIVE18_REQUESTER_EMAIL",
    "LIVE18_REQUESTER_PASSWORD",
    "LIVE18_REVIEWER_EMAIL",
    "LIVE18_REVIEWER_PASSWORD",
    "LIVE18_DENIAL_ACCESS_TOKEN",
    "LIVE18_DENIAL_AUTH_USER_ID",
    "LIVE18_EXPECTED_ORG_ID",
    "LIVE18_EXPECTED_BRANCH_ID",
    "LIVE18_EXPECTED_DENIAL_ORG_ID",
    "PHARMA_CANONICAL_MCP_ACCESS_TOKEN",
    "PHARMA_CANONICAL_MCP_REVIEWER_ACCESS_TOKEN",
    "PHARMA_CANONICAL_LIVE_TEST_AUTH_USER_ID",
    "PHARMA_CANONICAL_LIVE_TEST_BRANCH_ID",
    "PHARMA_CANONICAL_LIVE_DENIAL_ORG_ID",
    "MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS",
}


class RailwayDatabasePhaseError(RuntimeError):
    """The remote database phase failed closed."""


def _deployed_oauth_client_id() -> str:
    value = os.getenv("MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS", "")
    client_id = value.strip()
    if (
        not client_id
        or client_id != value
        or len(client_id) > 255
        or client_id == "disabled-unissued-canonical-staging"
        or "," in client_id
        or any(character.isspace() for character in client_id)
    ):
        raise RailwayDatabasePhaseError(
            "The exact API deployment does not expose one reviewed OAuth client ID"
        )
    return client_id


def _read_request(path: str) -> dict[str, Any]:
    if path == "-":
        raw = sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1)
    else:
        raw = Path(path).read_bytes()
    if len(raw) > MAX_REQUEST_BYTES:
        raise RailwayDatabasePhaseError("Railway database request exceeds 8 MiB")
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RailwayDatabasePhaseError("Railway database request is not JSON") from exc
    if not isinstance(value, dict) or value.get("schema") != SCHEMA:
        raise RailwayDatabasePhaseError("Railway database request schema is invalid")
    return value


def _ready_operations() -> list[dict[str, Any]]:
    value = json.loads(OPERATION_MATRIX_PATH.read_text(encoding="utf-8"))
    operations = value.get("operations") if isinstance(value, dict) else None
    if not isinstance(operations, list):
        raise RailwayDatabasePhaseError("Packaged Live18 operation matrix is invalid")
    ready = [
        operation
        for operation in operations
        if isinstance(operation, dict) and operation.get("availability") == "published"
    ]
    required_count = value.get("required_operation_count")
    if len(ready) != required_count or len({row.get("id") for row in ready}) != len(ready):
        raise RailwayDatabasePhaseError("Packaged Live18 operation matrix is incomplete")
    return ready


def _write_response(value: dict[str, Any], path: str) -> None:
    serialized = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        default=_json_default,
    ) + "\n"
    if path == "-":
        sys.stdout.write(serialized)
    else:
        destination = Path(path)
        destination.write_text(serialized, encoding="utf-8")
        destination.chmod(0o600)


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, bytes):
        return {"hex": value.hex()}
    if hasattr(value, "isoformat"):
        return value.isoformat()
    raise TypeError(f"Cannot serialize {type(value).__name__}")


def _required_text(mapping: dict[str, Any], key: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or not value.strip():
        raise RailwayDatabasePhaseError(f"{key} is required")
    if "\n" in value or "\r" in value:
        raise RailwayDatabasePhaseError(f"{key} must be one line")
    return value.strip()


def _caller_boundary(request: dict[str, Any]) -> dict[str, str]:
    expected_sha = _required_text(request, "expected_sha").lower()
    if not EXACT_SHA.fullmatch(expected_sha):
        raise RailwayDatabasePhaseError("expected_sha must be an exact commit SHA")
    project_ref = _required_text(request, "project_ref")
    if project_ref != EXPECTED_PROJECT_REF:
        raise RailwayDatabasePhaseError("Refusing an unreviewed Supabase project")
    run_id = _required_text(request, "run_id")
    run_attempt = _required_text(request, "run_attempt")
    request_nonce = _required_text(request, "request_nonce")
    deployment_id = _required_text(request, "deployment_id")
    deployment_instance_id = _required_text(request, "deployment_instance_id")
    if not run_id.isdigit() or not run_attempt.isdigit():
        raise RailwayDatabasePhaseError("Workflow run identity must be numeric")
    if not EXACT_NONCE.fullmatch(request_nonce):
        raise RailwayDatabasePhaseError("Request nonce must be 32 random bytes")
    for value, name in (
        (deployment_id, "deployment_id"),
        (deployment_instance_id, "deployment_instance_id"),
    ):
        try:
            parsed = UUID(value)
        except ValueError as exc:
            raise RailwayDatabasePhaseError(f"{name} must be an exact UUID") from exc
        if str(parsed) != value.lower():
            raise RailwayDatabasePhaseError(f"{name} must use canonical UUID text")
    return {
        "expected_sha": expected_sha,
        "project_ref": project_ref,
        "run_id": run_id,
        "run_attempt": run_attempt,
        "request_nonce": request_nonce,
        "deployment_id": deployment_id,
        "deployment_instance_id": deployment_instance_id,
    }


def _validated_boundary(request: dict[str, Any]) -> tuple[str, str]:
    boundary = _caller_boundary(request)
    expected_sha = boundary["expected_sha"]
    project_ref = boundary["project_ref"]
    deployed_sha = os.getenv("RAILWAY_GIT_COMMIT_SHA", "").strip().lower()
    if deployed_sha != expected_sha:
        raise RailwayDatabasePhaseError(
            "Railway database phase is not running in the reviewed deployment"
        )
    deployment_id = boundary["deployment_id"]
    if os.getenv("RAILWAY_DEPLOYMENT_ID", "").strip() != deployment_id:
        raise RailwayDatabasePhaseError("Railway deployment differs")
    try:
        provenance = DEPLOYMENT_PROVENANCE_PATH.read_text(encoding="utf-8").strip()
    except OSError as exc:
        raise RailwayDatabasePhaseError("Railway deployment provenance is missing") from exc
    prefix = expected_sha + ":"
    if not provenance.startswith(prefix) or not provenance.removeprefix(prefix):
        raise RailwayDatabasePhaseError("Railway deployment provenance differs")
    return expected_sha, project_ref


def _response_boundary(request: dict[str, Any]) -> dict[str, str]:
    return _caller_boundary(request)


@contextlib.contextmanager
def _temporary_environment(values: dict[str, str]):
    prior = {key: os.environ.get(key) for key in values}
    os.environ.update(values)
    try:
        yield
    finally:
        for key, value in prior.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def _secret_environment(request: dict[str, Any]) -> dict[str, str]:
    supplied = request.get("secrets")
    if not isinstance(supplied, dict) or set(supplied) != SECRET_KEYS:
        raise RailwayDatabasePhaseError(
            "Railway identity phase requires the exact reviewed secret set"
        )
    values = {key: _required_text(supplied, key) for key in SECRET_KEYS}
    values["CANONICAL_EPHEMERAL_DATABASE_TRANSPORT"] = "railway_direct_ipv6"
    return values


def _exact_secret_environment(
    request: dict[str, Any], expected_keys: set[str]
) -> dict[str, str]:
    supplied = request.get("secrets")
    if not isinstance(supplied, dict) or set(supplied) != expected_keys:
        raise RailwayDatabasePhaseError(
            "Railway database phase received an unexpected secret set"
        )
    return {key: _required_text(supplied, key) for key in expected_keys}


def _validated_direct_role_url(value: str, project_ref: str, role: str) -> str:
    parsed = urlsplit(value)
    if (
        parsed.scheme not in {"postgres", "postgresql"}
        or parsed.hostname != f"db.{project_ref}.supabase.co"
        or parsed.port != 5432
        or unquote(parsed.username or "") != role
        or not parsed.password
        or parsed.path != "/postgres"
    ):
        raise RailwayDatabasePhaseError(
            f"Deployed {role} connection is not the reviewed direct IPv6 boundary"
        )
    return value


def _admin_direct_url(project_ref: str, password: str, application_name: str) -> str:
    return (
        f"postgresql://postgres:{quote(password, safe='')}@db.{project_ref}.supabase.co:5432/"
        f"postgres?sslmode=require&gssencmode=disable&connect_timeout=15&"
        f"application_name={application_name}"
    )


def _verify_migration_head(admin_url: str) -> dict[str, Any]:
    contract = load_contract()
    configuration = AlembicConfig(str(BACKEND_DIRECTORY / "alembic.ini"))
    configuration.set_main_option("script_location", str(BACKEND_DIRECTORY / "alembic"))
    expected_head = ScriptDirectory.from_config(configuration).get_current_head()
    if not expected_head:
        raise RailwayDatabasePhaseError("Packaged Alembic history has no exact head")
    with psycopg2.connect(admin_url) as connection:
        connection.set_session(readonly=True)
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT revision.version_num,
                       family(inet_server_addr()) AS network_family,
                       (SELECT count(*)::integer
                          FROM information_schema.tables
                         WHERE table_schema IN (
                           'core','parties','catalog','hr','inventory','sales',
                           'procurement','finance','tax','compliance','automation',
                           'calculation'
                         ) AND table_type='BASE TABLE') AS table_count,
                       (SELECT count(*)::integer FROM pg_catalog.pg_roles
                         WHERE rolname IN (
                           'erp_runtime','erp_calculator','erp_tax_provider',
                           'erp_regulatory_importer'
                         )) AS isolated_role_count,
                       (SELECT count(*)::integer FROM pg_catalog.pg_roles
                         WHERE rolname IN (
                           'erp_runtime','erp_calculator','erp_tax_provider',
                           'erp_regulatory_importer'
                         ) AND (rolsuper OR rolcreaterole OR rolbypassrls)
                       ) AS unsafe_role_count
                  FROM public.alembic_version AS revision
                """
            )
            rows = cursor.fetchall()
    if (
        len(rows) != 1
        or rows[0][0] != expected_head
        or expected_head != contract.head
        or rows[0][1] != 6
        or rows[0][2] != contract.canonical_table_count
        or rows[0][3:] != (4, 0)
    ):
        raise RailwayDatabasePhaseError(
            "Canonical staging differs from the exact packaged migration head"
        )
    return {
        "revision": expected_head,
        "network_family": 6,
        "canonical_table_count": contract.canonical_table_count,
        "isolated_role_count": 4,
        "unsafe_role_count": 0,
    }


def _upgrade_exact_migration_head(admin_url: str) -> str:
    configuration = AlembicConfig(str(BACKEND_DIRECTORY / "alembic.ini"))
    configuration.set_main_option("script_location", str(BACKEND_DIRECTORY / "alembic"))
    script = ScriptDirectory.from_config(configuration)
    expected_head = script.get_current_head()
    roots = script.get_bases()
    if not expected_head or len(roots) != 1:
        raise RailwayDatabasePhaseError("Packaged Alembic history is not one exact chain")
    prior = Path.cwd()
    delegated = False
    try:
        os.chdir(BACKEND_DIRECTORY)
        with _temporary_environment({"DATABASE_URL": admin_url}):
            _set_admin_owner_delegation(admin_url, True)
            delegated = True
            alembic_command.upgrade(configuration, expected_head)
            alembic_command.upgrade(configuration, expected_head)
    finally:
        if delegated:
            _set_admin_owner_delegation(admin_url, False)
        os.chdir(prior)
    _verify_admin_owner_delegation_removed(admin_url)
    return expected_head


def _set_admin_owner_delegation(admin_url: str, enabled: bool) -> None:
    with psycopg2.connect(admin_url) as connection:
        connection.autocommit = True
        with connection.cursor() as cursor:
            cursor.execute("SHOW server_version_num")
            supports_membership_options = int(cursor.fetchone()[0]) >= 160000
            if enabled and supports_membership_options:
                cursor.execute(
                    'GRANT "erp_migration_owner" TO CURRENT_USER '
                    'WITH INHERIT FALSE, SET TRUE'
                )
            elif enabled:
                cursor.execute('GRANT "erp_migration_owner" TO CURRENT_USER')
            elif supports_membership_options:
                cursor.execute(
                    'GRANT "erp_migration_owner" TO CURRENT_USER '
                    'WITH INHERIT FALSE, SET FALSE'
                )
            else:
                cursor.execute('REVOKE "erp_migration_owner" FROM CURRENT_USER')


def _verify_admin_owner_delegation_removed(admin_url: str) -> None:
    with psycopg2.connect(admin_url) as connection:
        connection.set_session(readonly=True)
        with connection.cursor() as cursor:
            cursor.execute("SHOW server_version_num")
            supports_membership_options = int(cursor.fetchone()[0]) >= 160000
            if supports_membership_options:
                cursor.execute(
                    """
                    SELECT pg_has_role(current_user,'erp_migration_owner','USAGE'),
                           pg_has_role(current_user,'erp_migration_owner','SET'),
                           COALESCE(membership.inherit_option,false),
                           COALESCE(membership.set_option,false)
                      FROM (SELECT 1) AS singleton
                 LEFT JOIN pg_catalog.pg_auth_members AS membership
                        ON membership.roleid=(
                             SELECT oid FROM pg_catalog.pg_roles
                              WHERE rolname='erp_migration_owner'
                           )
                       AND membership.member=(
                             SELECT oid FROM pg_catalog.pg_roles
                              WHERE rolname=current_user
                           )
                    """
                )
            else:
                cursor.execute(
                    """
                    SELECT pg_has_role(current_user,'erp_migration_owner','USAGE'),
                           pg_has_role(current_user,'erp_migration_owner','SET'),
                           false,
                           false
                    """
                )
            value = cursor.fetchone()
    if value != (False, False, False, False):
        raise RailwayDatabasePhaseError(
            "Temporary migration-owner delegation remained after demo provisioning"
        )


@contextlib.contextmanager
def _temporary_admin_owner_delegation(admin_url: str):
    _set_admin_owner_delegation(admin_url, True)
    try:
        yield
    finally:
        _set_admin_owner_delegation(admin_url, False)
        _verify_admin_owner_delegation_removed(admin_url)


def _demo_provision(request: dict[str, Any]) -> dict[str, Any]:
    expected_sha, project_ref = _validated_boundary(request)
    _deployed_oauth_client_id()
    secrets = _exact_secret_environment(request, DEMO_SECRET_KEYS)
    api_origin = _required_text(request, "api_origin").rstrip("/")
    if api_origin != "https://aasopharma-api-pilot-production.up.railway.app":
        raise RailwayDatabasePhaseError("Demo API origin is not the reviewed Railway API")
    production_refs = _required_text(request, "production_project_refs")
    if project_ref in {item.strip() for item in production_refs.split(",")}:
        raise RailwayDatabasePhaseError("Refusing demo provisioning in production")
    run_id = _required_text(request, "run_id")
    run_attempt = _required_text(request, "run_attempt")
    if not run_id.isdigit() or not run_attempt.isdigit():
        raise RailwayDatabasePhaseError("Workflow run identity must be numeric")
    receipt_sha256 = _required_text(request, "expense_receipt_sha256").lower()
    if not re.fullmatch(r"[0-9a-f]{64}", receipt_sha256):
        raise RailwayDatabasePhaseError("Reviewed expense receipt hash is invalid")
    try:
        receipt = base64.b64decode(
            _required_text(request, "expense_receipt_base64"), validate=True
        )
    except ValueError as exc:
        raise RailwayDatabasePhaseError("Reviewed expense receipt is not base64") from exc
    if (
        not receipt.startswith(b"%PDF-")
        or not 64 <= len(receipt) <= 10 * 1024 * 1024
        or hashlib.sha256(receipt).hexdigest() != receipt_sha256
    ):
        raise RailwayDatabasePhaseError("Reviewed expense receipt bytes differ")

    admin_url = _admin_direct_url(
        project_ref, secrets["SUPABASE_DB_PASSWORD"], "canonical_live18_railway_demo"
    )
    runtime_url = _validated_direct_role_url(
        os.getenv("DATABASE_URL", ""), project_ref, "erp_runtime"
    )
    calculator_url = _validated_direct_role_url(
        os.getenv("ERP_CALCULATOR_DATABASE_URL", ""), project_ref, "erp_calculator"
    )
    importer_url = (
        f"postgresql://erp_regulatory_importer:"
        f"{quote(secrets['ERP_REGULATORY_IMPORTER_PASSWORD'], safe='')}@"
        f"db.{project_ref}.supabase.co:5432/postgres?sslmode=require&"
        "gssencmode=disable&connect_timeout=15&application_name=canonical_live18_importer"
    )
    expected_head = _upgrade_exact_migration_head(admin_url)
    migration = _verify_migration_head(admin_url)
    if migration["revision"] != expected_head:
        raise RailwayDatabasePhaseError("Repeated Alembic upgrade did not reach exact head")
    with tempfile.TemporaryDirectory(prefix="live18-railway-demo-") as raw:
        directory = Path(raw)
        receipt_path = directory / "reviewed-expense-receipt.pdf"
        receipt_path.write_bytes(receipt)
        receipt_path.chmod(0o600)
        evidence_dir = directory / "evidence"
        environment = {
            "CANONICAL_DEMO_WRITE_ACK": "PROVISION_DISPOSABLE_DEMO",
            "CANONICAL_STAGING_PROJECT_REF": project_ref,
            "CANONICAL_PRODUCTION_PROJECT_REFS": production_refs,
            "CANONICAL_DEMO_EVIDENCE_DIR": str(evidence_dir),
            "CANONICAL_DEMO_EXPENSE_RECEIPT_PATH": str(receipt_path),
            "CANONICAL_DEMO_EXPENSE_RECEIPT_SHA256": receipt_sha256,
            "CANONICAL_DEMO_API_URL": api_origin,
            "PSYCOPG_DATABASE_URL": admin_url,
            "ERP_RUNTIME_DATABASE_URL": runtime_url,
            "ERP_CALCULATOR_DATABASE_URL": calculator_url,
            "ERP_REGULATORY_IMPORTER_DATABASE_URL": importer_url,
            "GITHUB_RUN_ID": run_id,
            "GITHUB_RUN_ATTEMPT": run_attempt,
            "PGOPTIONS": (
                "-c statement_timeout=120000 -c lock_timeout=15000 "
                "-c idle_in_transaction_session_timeout=180000"
            ),
        }
        with _temporary_admin_owner_delegation(admin_url):
            with _temporary_environment(environment), contextlib.redirect_stdout(sys.stderr):
                # Import after binding the run-scoped environment because the demo module
                # intentionally derives deterministic IDs at import time.
                import provision_canonical_demo  # noqa: PLC0415

                if provision_canonical_demo.main() != 0:
                    raise RailwayDatabasePhaseError("Canonical demo returned non-zero")
        summary_path = evidence_dir / "canonical-demo-summary.json"
        if not summary_path.is_file():
            raise RailwayDatabasePhaseError("Canonical demo summary was not produced")
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
        evidence_hashes = {
            path.name: hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(evidence_dir.iterdir())
            if path.is_file()
        }
    response = {
        "schema": RESPONSE_SCHEMA,
        "action": "provision-demo",
        **_response_boundary(request),
        "migration": migration,
        "demo_summary": summary,
        "evidence_sha256": evidence_hashes,
        "transport": "supabase_direct_ipv6_from_railway",
        "temporary_owner_delegation_removed": True,
    }
    response["content_sha256"] = _content_hash(response)
    return response


def _parse_environment_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        key, separator, value = line.partition("=")
        if not separator or not key or "\n" in value or "\r" in value:
            raise RailwayDatabasePhaseError("Remote environment output is malformed")
        values[key] = value
    return values


def _transport_key(request: dict[str, Any]) -> bytes:
    encoded = _required_text(request, "transport_key_base64")
    try:
        value = base64.b64decode(encoded, validate=True)
    except ValueError as exc:
        raise RailwayDatabasePhaseError("Identity transport key is not base64") from exc
    if len(value) != 32:
        raise RailwayDatabasePhaseError("Identity transport key must be 32 random bytes")
    return value


def _boundary_aad(request: dict[str, Any]) -> bytes:
    return json.dumps(
        _response_boundary(request), sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def _encrypt_environment(
    request: dict[str, Any], environment: dict[str, str]
) -> dict[str, str]:
    nonce = os.urandom(12)
    plaintext = json.dumps(
        environment, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    ciphertext = AESGCM(_transport_key(request)).encrypt(
        nonce, plaintext, _boundary_aad(request)
    )
    return {
        "algorithm": "AES-256-GCM",
        "nonce_base64": base64.b64encode(nonce).decode("ascii"),
        "ciphertext_base64": base64.b64encode(ciphertext).decode("ascii"),
    }


def _decrypt_environment(
    request: dict[str, Any], encrypted: Any
) -> dict[str, str]:
    if not isinstance(encrypted, dict) or encrypted.get("algorithm") != "AES-256-GCM":
        raise RailwayDatabasePhaseError("Identity environment envelope is invalid")
    try:
        nonce = base64.b64decode(encrypted["nonce_base64"], validate=True)
        ciphertext = base64.b64decode(
            encrypted["ciphertext_base64"], validate=True
        )
        plaintext = AESGCM(_transport_key(request)).decrypt(
            nonce, ciphertext, _boundary_aad(request)
        )
        value = json.loads(plaintext)
    except (KeyError, ValueError, InvalidTag, json.JSONDecodeError) as exc:
        raise RailwayDatabasePhaseError(
            "Identity environment authentication failed"
        ) from exc
    if not isinstance(value, dict) or not all(
        isinstance(key, str) and isinstance(item, str) for key, item in value.items()
    ):
        raise RailwayDatabasePhaseError("Identity environment plaintext is invalid")
    return value


def _identity_provision(request: dict[str, Any]) -> dict[str, Any]:
    expected_sha, project_ref = _validated_boundary(request)
    deployed_client_id = _deployed_oauth_client_id()
    environment = _secret_environment(request)
    environment.update(
        {
            "CANONICAL_STAGING_PROJECT_REF": project_ref,
            "SUPABASE_URL": _required_text(request, "supabase_url"),
            "PHARMA_CANONICAL_MCP_URL": _required_text(request, "mcp_url"),
            "PHARMA_CANONICAL_LIVE_FIXTURE_IDENTITY_EVIDENCE_PATH": "",
        }
    )
    if environment["SUPABASE_URL"] != f"https://{project_ref}.supabase.co":
        raise RailwayDatabasePhaseError("Supabase URL differs from the reviewed project")

    directory = REMOTE_STATE_ROOT / (
        "live18-railway-identities-" + _required_text(request, "request_nonce")
    )
    if directory.exists():
        raise RailwayDatabasePhaseError("Run-scoped remote identity state already exists")
    directory.mkdir(mode=0o700)
    try:
        browser_state = directory / "browser-state.json"
        mcp_state = directory / "mcp-state.json"
        fixture_evidence = directory / "fixture-identities.json"
        github_environment = directory / "github.env"
        github_environment.touch(mode=0o600)
        environment["GITHUB_ENV"] = str(github_environment)
        environment["PHARMA_CANONICAL_LIVE_FIXTURE_IDENTITY_EVIDENCE_PATH"] = str(
            fixture_evidence
        )
        browser_provisioned = False
        mcp_provisioned = False
        try:
            with _temporary_environment(environment), contextlib.redirect_stdout(sys.stderr):
                provision_browser_identities(browser_state, PROFILE_LIVE18)
                browser_provisioned = True
                browser_environment = _parse_environment_file(github_environment)
                with _temporary_environment(browser_environment):
                    provision_mcp_identities(mcp_state, browser_state)
                mcp_provisioned = True
                generated = _parse_environment_file(github_environment)
            browser_payload = json.loads(browser_state.read_text(encoding="utf-8"))
            mcp_payload = json.loads(mcp_state.read_text(encoding="utf-8"))
            fixture_payload = json.loads(fixture_evidence.read_text(encoding="utf-8"))
            observed_client_ids = {
                generated.get("MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS"),
                mcp_payload.get("client_id"),
                fixture_payload.get("oauth_client_id"),
            }
            if observed_client_ids != {deployed_client_id}:
                raise RailwayDatabasePhaseError(
                    "Ephemeral OAuth authority differs from the exact API deployment"
                )
            encrypted_environment = _encrypt_environment(request, generated)
            github_environment.unlink()
            fixture_evidence.unlink()
            response = {
                "schema": RESPONSE_SCHEMA,
                "action": "provision-identities",
                **_response_boundary(request),
                "encrypted_environment": encrypted_environment,
                "browser_state": browser_payload,
                "mcp_state": mcp_payload,
                "fixture_evidence": fixture_payload,
            }
            response["content_sha256"] = _content_hash(response)
            return response
        except BaseException as provision_error:
            cleanup_errors: list[str] = []
            with _temporary_environment(environment), contextlib.redirect_stdout(sys.stderr):
                if mcp_provisioned or mcp_state.exists():
                    try:
                        cleanup_mcp_identities(mcp_state)
                    except BaseException as exc:
                        cleanup_errors.append(f"MCP cleanup failed: {type(exc).__name__}")
                if browser_provisioned or browser_state.exists():
                    try:
                        cleanup_browser_identities(browser_state)
                    except BaseException as exc:
                        cleanup_errors.append(
                            f"browser cleanup failed: {type(exc).__name__}"
                        )
            if not cleanup_errors:
                for path in directory.iterdir():
                    path.unlink(missing_ok=True)
                directory.rmdir()
                raise
            raise RailwayDatabasePhaseError("; ".join(cleanup_errors)) from provision_error
    except BaseException:
        raise


def _restore_state(path: Path, value: Any, name: str) -> None:
    if not isinstance(value, dict):
        raise RailwayDatabasePhaseError(f"{name} state is missing")
    path.write_text(json.dumps(value, sort_keys=True) + "\n", encoding="utf-8")
    path.chmod(0o600)


def _identity_cleanup(request: dict[str, Any]) -> dict[str, Any]:
    expected_sha, project_ref = _validated_boundary(request)
    environment = _secret_environment(request)
    environment["CANONICAL_STAGING_PROJECT_REF"] = project_ref
    environment["SUPABASE_URL"] = _required_text(request, "supabase_url")
    if environment["SUPABASE_URL"] != f"https://{project_ref}.supabase.co":
        raise RailwayDatabasePhaseError("Supabase URL differs from the reviewed project")
    directory = REMOTE_STATE_ROOT / (
        "live18-railway-identities-" + _required_text(request, "request_nonce")
    )
    directory.mkdir(mode=0o700, exist_ok=True)
    browser_state = directory / "browser-state.json"
    mcp_state = directory / "mcp-state.json"
    if not browser_state.exists() and request.get("browser_state") is not None:
        _restore_state(browser_state, request.get("browser_state"), "browser")
    if not mcp_state.exists() and request.get("mcp_state") is not None:
        _restore_state(mcp_state, request.get("mcp_state"), "MCP")
    errors: list[str] = []
    orphan_reconciliation: dict[str, int] | None = None
    try:
        with _temporary_environment(environment), contextlib.redirect_stdout(sys.stderr):
            if mcp_state.exists():
                try:
                    cleanup_mcp_identities(mcp_state)
                except BaseException as exc:  # browser cleanup must still run
                    errors.append(f"MCP cleanup failed: {type(exc).__name__}")
            if browser_state.exists():
                try:
                    cleanup_browser_identities(browser_state)
                except BaseException as exc:
                    errors.append(f"browser cleanup failed: {type(exc).__name__}")
            try:
                orphan_reconciliation = recover_lost_live18_state()
            except BaseException as exc:
                errors.append(
                    f"orphan reconciliation failed: {type(exc).__name__}"
                )
        if errors:
            raise RailwayDatabasePhaseError("; ".join(errors))
    finally:
        if not errors:
            for path in directory.iterdir():
                path.unlink(missing_ok=True)
            directory.rmdir()
    response = {
        "schema": RESPONSE_SCHEMA,
        "action": "cleanup-identities",
        **_response_boundary(request),
        "cleaned": True,
        "orphan_reconciliation": orphan_reconciliation,
    }
    response["content_sha256"] = _content_hash(response)
    return response


def _direct_runtime_connection(project_ref: str):
    parsed = urlsplit(os.getenv("DATABASE_URL", ""))
    if (
        parsed.scheme not in {"postgres", "postgresql"}
        or parsed.hostname != f"db.{project_ref}.supabase.co"
        or parsed.port != 5432
        or unquote(parsed.username or "") != "erp_runtime"
        or not parsed.password
        or parsed.path != "/postgres"
    ):
        raise RailwayDatabasePhaseError(
            "Deployed API DATABASE_URL is not the reviewed direct IPv6 erp_runtime boundary"
        )
    return psycopg2.connect(
        host=f"db.{project_ref}.supabase.co",
        port=5432,
        dbname="postgres",
        user="erp_runtime",
        password=unquote(parsed.password),
        sslmode="require",
        gssencmode="disable",
        connect_timeout=15,
        application_name="canonical_live18_railway_direct_evidence",
    )


def _prepare_request(evidence: dict[str, Any]) -> dict[str, Any]:
    path = f"/api/web/actions/{evidence['command_operation']}/prepare"
    values = [
        row.get("requestBody")
        for row in evidence.get("http_evidence", [])
        if row.get("method") == "POST"
        and row.get("path") == path
        and 200 <= int(row.get("status", 0)) < 300
    ]
    if len(values) != 1 or not isinstance(values[0], dict):
        raise RailwayDatabasePhaseError("Evidence omitted one exact prepare request")
    operation = evidence["command_operation"]
    model = PREPARE_PAYLOAD_MODELS.get(operation)
    if model is None or operation not in MANDATORY_LINEAGE_PATHS:
        raise RailwayDatabasePhaseError(f"{operation} lacks a reviewed lineage model")
    validated = model.model_validate(values[0])
    validate_prepare_payload_semantics(operation, validated)
    canonical = validated.model_dump(mode="json", exclude_none=True)
    for lineage_path in MANDATORY_LINEAGE_PATHS[operation]:
        value: Any = canonical
        try:
            for part in lineage_path.split("."):
                value = value[int(part)] if isinstance(value, list) else value[part]
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise RailwayDatabasePhaseError(
                f"{operation} omitted mandatory canonical lineage at {lineage_path}"
            ) from exc
        if value in (None, "", []):
            raise RailwayDatabasePhaseError(
                f"{operation} omitted mandatory canonical lineage at {lineage_path}"
            )
    branch_id = canonical.get("branch_id", canonical.get("source_branch_id"))
    if str(branch_id) != str(evidence.get("branch_id", "")):
        raise RailwayDatabasePhaseError(
            f"{operation} browser payload branch differs from its evidence envelope"
        )
    return canonical


def _preview(evidence: dict[str, Any]) -> dict[str, Any]:
    path = f"/api/web/actions/{evidence['command_operation']}/prepare"
    values = [
        row.get("responseBody")
        for row in evidence.get("http_evidence", [])
        if row.get("method") == "POST"
        and row.get("path") == path
        and 200 <= int(row.get("status", 0)) < 300
    ]
    if len(values) != 1 or not isinstance(values[0], dict):
        raise RailwayDatabasePhaseError("Evidence omitted one exact prepare preview")
    preview = values[0].get("preview", values[0])
    if not isinstance(preview, dict):
        raise RailwayDatabasePhaseError("Prepare preview is not an object")
    return preview


def _evidence_capture(request: dict[str, Any]) -> dict[str, Any]:
    expected_sha, project_ref = _validated_boundary(request)
    organization_id = str(UUID(_required_text(request, "organization_id")))
    auth_user_id = str(UUID(_required_text(request, "auth_user_id")))
    denial_auth_user_id = str(UUID(_required_text(request, "denial_auth_user_id")))
    denial_organization_id = str(UUID(_required_text(request, "denial_organization_id")))
    if organization_id == denial_organization_id:
        raise RailwayDatabasePhaseError("Denial organization must be distinct")
    evidence_pack = request.get("evidence")
    if not isinstance(evidence_pack, dict):
        raise RailwayDatabasePhaseError("Browser evidence pack is missing")
    contracts = _ready_operations()
    if set(evidence_pack) != {str(contract["id"]) for contract in contracts}:
        raise RailwayDatabasePhaseError("Browser evidence does not cover all ready operations")

    connection = _direct_runtime_connection(project_ref)
    connection.set_session(readonly=True, autocommit=False)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT current_user,role.rolsuper,role.rolbypassrls,
                       pg_has_role(current_user,'erp_migration_owner','MEMBER'),
                       family(inet_server_addr())
                  FROM pg_catalog.pg_roles role WHERE role.rolname=current_user
                """
            )
            role_row = cursor.fetchone()
        connection.rollback()
        if role_row != ("erp_runtime", False, False, False, 6):
            raise RailwayDatabasePhaseError(
                "Direct evidence requires non-owner erp_runtime without RLS bypass"
            )

        def query_as(
            context_auth_user_id: str,
            context_org_id: str,
            sql: str,
            params: tuple[Any, ...] = (),
        ):
            try:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT erp_security.activate_context(%s::uuid,%s::uuid)",
                        (context_auth_user_id, context_org_id),
                    )
                    cursor.execute(sql, params)
                    columns = [item[0] for item in cursor.description] if cursor.description else []
                    rows = [dict(zip(columns, row)) for row in cursor.fetchall()] if columns else []
                connection.rollback()
                return rows
            except BaseException:
                connection.rollback()
                raise

        query = lambda sql, params=(): query_as(
            auth_user_id, organization_id, sql, params
        )
        denial_query = lambda sql, params=(): query_as(
            denial_auth_user_id, denial_organization_id, sql, params
        )
        reconciler = CanonicalReconciler(query, organization_id)
        reconciler.assert_disposable_target()
        resources: dict[str, Any] = {}
        for contract in contracts:
            operation_id = str(contract["id"])
            command_operation = str(contract["command_operation"])
            evidence = evidence_pack[operation_id]
            if evidence.get("tested_sha") != expected_sha:
                raise RailwayDatabasePhaseError(
                    f"{operation_id} evidence differs from the reviewed SHA"
                )
            if evidence.get("organization_id") != organization_id:
                raise RailwayDatabasePhaseError(
                    f"{operation_id} evidence differs from the reviewed organization"
                )
            command_id = str(UUID(str(evidence["command_request_id"])))
            resource_id = str(UUID(str(evidence["resource_id"])))
            operation = command_operation.removesuffix(".prepare")
            database = reconciler.reconcile(
                command_id,
                operation,
                resource_id,
                _preview(evidence),
                _prepare_request(evidence),
            )
            reconciler.assert_cross_tenant_denied(
                operation, resource_id, denial_query
            )
            resources[operation_id] = {
                "command_operation": command_operation,
                "command_request_id": command_id,
                "resource_id": resource_id,
                "database": database,
                "cross_tenant_denied": True,
            }
    finally:
        connection.close()

    response = {
        "schema": RESPONSE_SCHEMA,
        "action": "capture-evidence",
        **_response_boundary(request),
        "organization_id": organization_id,
        "denial_organization_id": denial_organization_id,
        "runtime_role": {
            "current_user": role_row[0],
            "superuser": role_row[1],
            "bypassrls": role_row[2],
            "migration_owner_member": role_row[3],
            "network_family": role_row[4],
            "transport": "supabase_direct_ipv6_from_railway",
        },
        "resources": resources,
    }
    response["content_sha256"] = _content_hash(response)
    return response


def _content_hash(value: dict[str, Any]) -> str:
    unsigned = {key: item for key, item in value.items() if key != "content_sha256"}
    payload = json.dumps(
        unsigned, sort_keys=True, separators=(",", ":"), default=_json_default
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _verify_response(request: dict[str, Any]) -> dict[str, Any]:
    boundary = _caller_boundary(request)
    expected_sha = boundary["expected_sha"]
    project_ref = boundary["project_ref"]
    response = request.get("response")
    if not isinstance(response, dict) or response.get("schema") != RESPONSE_SCHEMA:
        raise RailwayDatabasePhaseError("Railway response schema is invalid")
    if response.get("content_sha256") != _content_hash(response):
        raise RailwayDatabasePhaseError("Railway response content hash differs")
    if response.get("expected_sha") != expected_sha:
        raise RailwayDatabasePhaseError("Railway response SHA differs from the caller")
    if response.get("project_ref") != project_ref:
        raise RailwayDatabasePhaseError("Railway response project differs from the caller")
    for key in (
        "run_id",
        "run_attempt",
        "request_nonce",
        "deployment_id",
        "deployment_instance_id",
    ):
        if response.get(key) != boundary[key]:
            raise RailwayDatabasePhaseError(
                f"Railway response {key} differs from the caller"
            )
    return response


def _apply_identity_response(request: dict[str, Any], output_directory: Path) -> dict[str, Any]:
    response = _verify_response(request)
    if response.get("action") != "provision-identities":
        raise RailwayDatabasePhaseError("Expected an identity-provision response")
    environment = _decrypt_environment(request, response.get("encrypted_environment"))
    if set(environment) != IDENTITY_ENVIRONMENT_KEYS:
        raise RailwayDatabasePhaseError(
            "Identity response contains an unexpected environment contract"
        )
    output_directory.mkdir(parents=True, exist_ok=True)
    for name, key in (
        ("live18-browser-identities.json", "browser_state"),
        ("live18-mcp-identities.json", "mcp_state"),
        ("live18-fixture-identities.json", "fixture_evidence"),
    ):
        target = output_directory / name
        target.write_text(
            json.dumps(response[key], indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        target.chmod(0o600)
    return {str(key): str(value) for key, value in environment.items()}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "action",
        choices=(
            "provision-demo",
            "provision-identities",
            "cleanup-identities",
            "capture-evidence",
        ),
    )
    parser.add_argument("--input", default="-")
    parser.add_argument("--output", default="-")
    arguments = parser.parse_args(argv)
    request = _read_request(arguments.input)
    if arguments.action == "provision-demo":
        response = _demo_provision(request)
    elif arguments.action == "provision-identities":
        response = _identity_provision(request)
    elif arguments.action == "cleanup-identities":
        response = _identity_cleanup(request)
    elif arguments.action == "capture-evidence":
        response = _evidence_capture(request)
    _write_response(response, arguments.output)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RailwayDatabasePhaseError, psycopg2.Error, AssertionError) as exc:
        print(f"Live18 Railway database phase failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
