#!/usr/bin/env python3
"""Prepare the one hosted Auth identity allowed to access evidence storage.

The management token and current modern Auth Admin secret remain runner-local. A
new random password is installed on every successful reconciliation and exported
only through GitHub's run-scoped environment file.  Receipts contain identity,
hook, and legacy-credential presence facts but never credentials or access
tokens.  This prepare boundary is deliberately non-destructive: the legacy
credential is retired only by the separately proof-gated cutover command.
"""

from __future__ import annotations

import argparse
import base64
from contextlib import contextmanager
from dataclasses import dataclass
import json
import os
import re
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping
from uuid import UUID

import psycopg2
from psycopg2.extras import Json
import requests

SCRIPT_DIRECTORY = Path(__file__).resolve().parent
if str(SCRIPT_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIRECTORY))

if __package__:
    from .supabase_auth_admin import (
        SupabaseAuthAdminAuthority,
        SupabaseAuthAdminError,
        auth_admin_request,
        mask_auth_admin_secret,
        resolve_auth_admin_authority,
    )
else:
    from supabase_auth_admin import (
        SupabaseAuthAdminAuthority,
        SupabaseAuthAdminError,
        auth_admin_request,
        mask_auth_admin_secret,
        resolve_auth_admin_authority,
    )


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
if str(SCRIPT_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIRECTORY))

from supabase_auth_admin import (  # noqa: E402
    SupabaseAuthAdminAuthority,
    SupabaseAuthAdminError,
    auth_admin_request,
    mask_auth_admin_secret,
    resolve_auth_admin_authority,
)
from canonical_staging_database import load_direct_database_contract  # noqa: E402


ROOT = Path(__file__).resolve().parents[2]
IDENTITY_AUTHORITY_PATH = (
    ROOT / "database/canonical/security/evidence-storage-service-identity.json"
)
IDENTITY_AUTHORITY = json.loads(IDENTITY_AUTHORITY_PATH.read_text(encoding="utf-8"))

PROJECT_REF = "rgihahbmkrmhitjdjvev"
SUPABASE_URL = f"https://{PROJECT_REF}.supabase.co"
MANAGEMENT_API = "https://api.supabase.com/v1"
SERVICE_AUTH_USER_ID = IDENTITY_AUTHORITY["auth_user_id"]
SERVICE_EMAIL = IDENTITY_AUTHORITY["email"]
SERVICE_MARKER = IDENTITY_AUTHORITY["app_metadata_marker"]
SERVICE_ROLE = IDENTITY_AUTHORITY["database_role"]
MAX_ACCESS_TOKEN_SECONDS = IDENTITY_AUTHORITY["max_access_token_seconds"]
HOOK_URI = (
    "pg-functions://postgres/erp_security/"
    "canonical_evidence_storage_access_token_hook"
)
RETIRED_KEY_NAME = "canonical-evidence-storage"
SHA_RE = re.compile(r"[0-9a-f]{40}")
HOOK_CONFIG_FIELDS = (
    "hook_custom_access_token_enabled",
    "hook_custom_access_token_uri",
)

if (
    IDENTITY_AUTHORITY.get("contract_version")
    != "canonical-evidence-storage-service-identity-v1"
    or IDENTITY_AUTHORITY.get("scope") != "canonical_platform"
    or MAX_ACCESS_TOKEN_SECONDS != 900
):
    raise RuntimeError("canonical evidence-storage identity authority drifted")


class IdentityProvisioningError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class HookRollout:
    prior: dict[str, Any]
    expected: dict[str, Any]
    hosted_auth_facts: dict[str, Any]
    changed: bool


class Client:
    def __init__(self, management_token: str) -> None:
        if not management_token.strip():
            raise IdentityProvisioningError(
                "MANAGEMENT_TOKEN_MISSING", "SUPABASE_ACCESS_TOKEN is required"
            )
        self._management_token = management_token

    def management(
        self,
        method: str,
        path: str,
        *,
        payload: Mapping[str, Any] | None = None,
    ) -> Any:
        try:
            response = requests.request(
                method,
                MANAGEMENT_API + path,
                headers={"Authorization": f"Bearer {self._management_token}"},
                json=payload,
                timeout=30,
            )
        except requests.RequestException as error:
            raise IdentityProvisioningError(
                "MANAGEMENT_API_UNREACHABLE",
                "Supabase Management API request did not complete",
            ) from error
        if not response.ok:
            raise IdentityProvisioningError(
                "MANAGEMENT_API_REJECTED",
                f"Supabase Management API {method} failed with HTTP {response.status_code}",
            )
        try:
            return response.json() if response.content else None
        except ValueError as error:
            raise IdentityProvisioningError(
                "MANAGEMENT_API_RESPONSE_INVALID",
                "Supabase Management API response is not JSON",
            ) from error

    def password_session(self, anon_key: str, email: str, password: str) -> Any:
        try:
            response = requests.post(
                f"{SUPABASE_URL}/auth/v1/token",
                params={"grant_type": "password"},
                headers={"apikey": anon_key, "Content-Type": "application/json"},
                json={"email": email, "password": password},
                timeout=30,
            )
        except requests.RequestException as error:
            raise IdentityProvisioningError(
                "SERVICE_SIGN_IN_UNREACHABLE",
                "Supabase service sign-in request did not complete",
            ) from error
        if not response.ok:
            raise IdentityProvisioningError(
                "SERVICE_SIGN_IN_REJECTED",
                f"Supabase service sign-in failed with HTTP {response.status_code}",
            )
        try:
            return response.json()
        except ValueError as error:
            raise IdentityProvisioningError(
                "SERVICE_SIGN_IN_RESPONSE_INVALID",
                "Supabase service sign-in response is not JSON",
            ) from error

    def auth_user(self, anon_key: str, access_token: str) -> Any:
        try:
            response = requests.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers={
                    "apikey": anon_key,
                    "Authorization": f"Bearer {access_token}",
                },
                timeout=30,
            )
        except requests.RequestException as error:
            raise IdentityProvisioningError(
                "SERVICE_TOKEN_UNREACHABLE",
                "Supabase service token readback did not complete",
            ) from error
        if not response.ok:
            raise IdentityProvisioningError(
                "SERVICE_TOKEN_REJECTED",
                f"Supabase service token readback failed with HTTP {response.status_code}",
            )
        try:
            return response.json()
        except ValueError as error:
            raise IdentityProvisioningError(
                "SERVICE_TOKEN_RESPONSE_INVALID",
                "Supabase service token response is not JSON",
            ) from error


def _auth_admin_authority(management_token: str) -> SupabaseAuthAdminAuthority:
    try:
        return resolve_auth_admin_authority(management_token, PROJECT_REF)
    except SupabaseAuthAdminError as error:
        raise IdentityProvisioningError(
            "AUTH_ADMIN_AUTHORITY_BLOCKED",
            f"Supabase Auth Admin authority blocked: {error.code}",
        ) from error


def _auth_admin_json(
    authority: SupabaseAuthAdminAuthority,
    method: str,
    path: str,
    *,
    payload: Mapping[str, Any] | None = None,
    params: Mapping[str, Any] | None = None,
) -> Any:
    try:
        return auth_admin_request(
            authority, method, path, payload=payload, params=params
        )
    except SupabaseAuthAdminError as error:
        raise IdentityProvisioningError(
            "AUTH_ADMIN_REQUEST_BLOCKED",
            f"Supabase Auth Admin request blocked: {error.code}",
        ) from error

def _all_auth_users(
    authority: SupabaseAuthAdminAuthority,
) -> list[dict[str, Any]]:
    users: list[dict[str, Any]] = []
    for page in range(1, 11):
        response = _auth_admin_json(
            authority, "GET", "users", params={"page": page, "per_page": 1000}
        )
        page_users = response.get("users") if isinstance(response, dict) else None
        if not isinstance(page_users, list) or not all(
            isinstance(user, dict) for user in page_users
        ):
            raise IdentityProvisioningError(
                "AUTH_USER_LIST_INVALID", "Supabase Auth user list is malformed"
            )
        users.extend(page_users)
        if len(page_users) < 1000:
            return users
    raise IdentityProvisioningError(
        "AUTH_USER_LIST_UNBOUNDED", "Supabase Auth user list exceeded ten pages"
    )


def _marker(user: Mapping[str, Any]) -> str | None:
    metadata = user.get("app_metadata")
    if not isinstance(metadata, dict):
        return None
    value = metadata.get("erp_service_identity")
    return value if isinstance(value, str) else None


def _validate_service_user(user: Mapping[str, Any]) -> None:
    try:
        user_id = str(UUID(str(user.get("id"))))
    except (TypeError, ValueError) as error:
        raise IdentityProvisioningError(
            "SERVICE_USER_ID_INVALID", "service user response omitted a UUID"
        ) from error
    metadata = user.get("app_metadata")
    if (
        user_id != SERVICE_AUTH_USER_ID
        or str(user.get("email", "")).lower() != SERVICE_EMAIL
        or user.get("role") != "authenticated"
        or not isinstance(metadata, dict)
        or metadata.get("erp_service_identity") != SERVICE_MARKER
        or metadata.get("erp_service_role") != SERVICE_ROLE
        or not (user.get("email_confirmed_at") or user.get("confirmed_at"))
    ):
        raise IdentityProvisioningError(
            "SERVICE_USER_CONTRACT_DRIFT", "service user contract drifted"
        )


def reconcile_service_user(
    authority: SupabaseAuthAdminAuthority, password: str
) -> tuple[dict[str, Any], bool]:
    users = _all_auth_users(authority)
    matches = [
        user for user in users
        if str(user.get("id", "")) == SERVICE_AUTH_USER_ID
        or str(user.get("email", "")).lower() == SERVICE_EMAIL
        or _marker(user) == SERVICE_MARKER
    ]
    if len(matches) > 1:
        raise IdentityProvisioningError(
            "SERVICE_USER_AMBIGUOUS", "multiple Auth users match the service identity"
        )
    created = not matches
    if matches:
        _validate_service_user(matches[0])
    create_payload = {
        "id": SERVICE_AUTH_USER_ID,
        "aud": "authenticated",
        "role": "authenticated",
        "email": SERVICE_EMAIL,
        "password": password,
        "email_confirm": True,
        "app_metadata": {
            "erp_service_identity": SERVICE_MARKER,
            "erp_service_role": SERVICE_ROLE,
        },
        "user_metadata": {},
    }
    if created:
        user = _auth_admin_json(authority, "POST", "users", payload=create_payload)
    else:
        # GoTrue's update contract treats the path UUID, audience, role, and
        # confirmed email as existing identity state.  Rotate only the two
        # mutable fields this reconciler owns. Sending create-only fields here
        # is outside the supported hosted Auth update contract.
        update_payload = {
            "password": password,
            "app_metadata": {
                "erp_service_identity": SERVICE_MARKER,
                "erp_service_role": SERVICE_ROLE,
            },
        }
        user = _auth_admin_json(
            authority,
            "PUT",
            f"users/{SERVICE_AUTH_USER_ID}",
            payload=update_payload,
        )
    if not isinstance(user, dict):
        raise IdentityProvisioningError(
            "SERVICE_USER_RESPONSE_INVALID", "service user response is malformed"
        )
    _validate_service_user(user)
    return user, created


def _validated_hosted_auth_config(
    current: Mapping[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    if any(field not in current for field in HOOK_CONFIG_FIELDS):
        raise IdentityProvisioningError(
            "AUTH_CONFIG_INCOMPLETE",
            "Supabase Auth configuration omitted prior hook authority",
        )
    jwt_exp = current.get("jwt_exp")
    refresh_limit = current.get("rate_limit_token_refresh")
    refresh_reuse = current.get("security_refresh_token_reuse_interval")
    if current.get("security_captcha_enabled") is not False:
        raise IdentityProvisioningError(
            "SERVICE_PASSWORD_CAPTCHA_UNSUPPORTED",
            "non-interactive evidence identity requires CAPTCHA to be disabled",
        )
    if current.get("external_email_enabled") is not True:
        raise IdentityProvisioningError(
            "SERVICE_PASSWORD_PROVIDER_DISABLED",
            "Supabase email/password authentication is disabled",
        )
    if type(jwt_exp) is not int or jwt_exp < MAX_ACCESS_TOKEN_SECONDS:
        raise IdentityProvisioningError(
            "AUTH_JWT_LIFETIME_INVALID",
            "Supabase JWT lifetime cannot support the reviewed token bound",
        )
    if type(refresh_limit) is not int or refresh_limit <= 0:
        raise IdentityProvisioningError(
            "AUTH_REFRESH_RATE_LIMIT_INVALID",
            "Supabase token refresh rate limit is unavailable",
        )
    if current.get("refresh_token_rotation_enabled") is not True:
        raise IdentityProvisioningError(
            "AUTH_REFRESH_ROTATION_DISABLED",
            "Supabase refresh-token rotation must remain enabled",
        )
    if type(refresh_reuse) is not int or refresh_reuse < 0:
        raise IdentityProvisioningError(
            "AUTH_REFRESH_REUSE_INVALID",
            "Supabase refresh-token reuse interval is malformed",
        )
    prior = {field: current[field] for field in HOOK_CONFIG_FIELDS}
    facts = {
        "security_captcha_enabled": False,
        "external_email_enabled": True,
        "jwt_exp": jwt_exp,
        "rate_limit_token_refresh": refresh_limit,
        "refresh_token_rotation_enabled": True,
        "security_refresh_token_reuse_interval": refresh_reuse,
    }
    return prior, facts


def _restore_hook_config(
    client: Client, prior: Mapping[str, Any]
) -> None:
    path = f"/projects/{PROJECT_REF}/config/auth"
    try:
        client.management("PATCH", path, payload=dict(prior))
        restored = client.management("GET", path)
    except Exception as error:
        raise IdentityProvisioningError(
            "AUTH_HOOK_ROLLBACK_FAILED",
            "Supabase Auth hook rollback did not complete",
        ) from error
    if not isinstance(restored, dict) or any(
        restored.get(field) != prior[field] for field in HOOK_CONFIG_FIELDS
    ):
        raise IdentityProvisioningError(
            "AUTH_HOOK_ROLLBACK_FAILED",
            "Supabase Auth hook rollback did not reconcile",
        )


def reconcile_hook_config(client: Client) -> HookRollout:
    path = f"/projects/{PROJECT_REF}/config/auth"
    current = client.management("GET", path)
    if not isinstance(current, dict):
        raise IdentityProvisioningError(
            "AUTH_CONFIG_INVALID", "Supabase Auth configuration is malformed"
        )
    prior, hosted_auth_facts = _validated_hosted_auth_config(current)
    expected = {
        "hook_custom_access_token_enabled": True,
        "hook_custom_access_token_uri": HOOK_URI,
    }
    changed = any(current.get(key) != value for key, value in expected.items())
    if not changed:
        return HookRollout(prior, expected, hosted_auth_facts, False)
    try:
        client.management("PATCH", path, payload=expected)
        updated = client.management("GET", path)
        if not isinstance(updated, dict) or any(
            updated.get(key) != value for key, value in expected.items()
        ):
            raise IdentityProvisioningError(
                "AUTH_HOOK_CONFIG_DRIFT",
                "Supabase did not persist the exact Auth hook",
            )
    except BaseException:
        _restore_hook_config(client, prior)
        raise
    return HookRollout(prior, expected, hosted_auth_facts, True)


@contextmanager
def _restore_hook_on_failure(client: Client, rollout: HookRollout):
    try:
        yield
    except BaseException as original_error:
        if rollout.changed:
            try:
                _restore_hook_config(client, rollout.prior)
            except IdentityProvisioningError as rollback_error:
                raise rollback_error from original_error
        raise


def _service_hook_event(authentication_method: str, issued_at: int) -> dict[str, Any]:
    return {
        "user_id": SERVICE_AUTH_USER_ID,
        "authentication_method": authentication_method,
        "claims": {
            "sub": SERVICE_AUTH_USER_ID,
            "email": SERVICE_EMAIL,
            "role": "authenticated",
            "aud": "authenticated",
            "iat": issued_at,
            "exp": issued_at + 3600,
            "app_metadata": {
                "erp_service_identity": SERVICE_MARKER,
                "erp_service_role": SERVICE_ROLE,
            },
        },
    }


def _assert_service_probe_claims(
    claims: Any, issued_at: int, observed_at: int
) -> None:
    if not isinstance(claims, dict):
        raise IdentityProvisioningError(
            "AUTH_HOOK_SERVICE_PROBE_INVALID",
            "hosted Auth hook service probe returned malformed claims",
        )
    expected = _service_hook_event("password", issued_at)["claims"]
    expiration = claims.get("exp")
    immutable_fields = set(expected) - {"role", "exp"}
    if (
        any(claims.get(field) != expected[field] for field in immutable_fields)
        or claims.get("role") != SERVICE_ROLE
        or claims.get("erp_service_identity") != SERVICE_MARKER
        or type(expiration) is not int
        or not issued_at < expiration <= issued_at + MAX_ACCESS_TOKEN_SECONDS
        or expiration > observed_at + MAX_ACCESS_TOKEN_SECONDS
    ):
        raise IdentityProvisioningError(
            "AUTH_HOOK_SERVICE_PROBE_INVALID",
            "hosted Auth hook service claims drifted",
        )


def _ordinary_hook_event(issued_at: int) -> dict[str, Any]:
    claims = {
        "sub": "00000000-0000-4000-8000-000000000002",
        "email": "hosted-hook-probe@example.invalid",
        "role": "authenticated",
        "aud": "authenticated",
        "iat": issued_at,
        "exp": issued_at + 3600,
        "app_metadata": {"provider": "google", "providers": ["google"]},
    }
    return {
        "user_id": claims["sub"],
        "authentication_method": "oauth",
        "claims": claims,
    }


def _spoof_hook_events(issued_at: int) -> tuple[dict[str, Any], ...]:
    role_spoof = _ordinary_hook_event(issued_at)
    role_spoof["authentication_method"] = "password"
    role_spoof["claims"]["role"] = SERVICE_ROLE
    marker_spoof = _ordinary_hook_event(issued_at)
    marker_spoof["authentication_method"] = "password"
    marker_spoof["claims"]["app_metadata"] = {
        "erp_service_identity": SERVICE_MARKER,
        "erp_service_role": SERVICE_ROLE,
    }
    return role_spoof, marker_spoof


def probe_hosted_hook(database_url: str) -> dict[str, Any]:
    """Execute only read-only hosted ACL and event probes before hook enablement."""

    if not database_url.strip():
        raise IdentityProvisioningError(
            "HOSTED_HOOK_DATABASE_URL_MISSING",
            "PSYCOPG_DATABASE_URL is required for hosted Auth hook preflight",
        )
    try:
        dsn = psycopg2.extensions.parse_dsn(database_url)
    except psycopg2.ProgrammingError as error:
        raise IdentityProvisioningError(
            "HOSTED_HOOK_DATABASE_URL_INVALID",
            "hosted Auth hook database URL is malformed",
        ) from error
    contract = load_direct_database_contract()
    if contract.project_ref != PROJECT_REF:
        raise IdentityProvisioningError(
            "HOSTED_HOOK_DATABASE_AUTHORITY_DENIED",
            "hosted Auth hook project does not match database authority",
        )
    if (
        dsn.get("host") != contract.host
        or dsn.get("port") != str(contract.port)
        or dsn.get("dbname") != "postgres"
        or dsn.get("user") != "postgres"
        or dsn.get("sslmode") != "require"
        or dsn.get("gssencmode") != "disable"
        or dsn.get("application_name") != "canonical_staging_ci"
        or dsn.get("hostaddr")
    ):
        raise IdentityProvisioningError(
            "HOSTED_HOOK_DATABASE_TARGET_DENIED",
            "hosted Auth hook preflight requires reviewed direct IPv4 staging",
        )
    function_name = "erp_security.canonical_evidence_storage_access_token_hook"
    function_signature = function_name + "(jsonb)"
    try:
        with psycopg2.connect(database_url) as connection:
            connection.set_session(readonly=True, autocommit=False)
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT procedure.prosecdef, procedure.provolatile, "
                    "pg_catalog.has_schema_privilege("
                    "'supabase_auth_admin','erp_security','USAGE'), "
                    "pg_catalog.has_function_privilege("
                    "'supabase_auth_admin',%s,'EXECUTE'), "
                    "EXISTS (SELECT 1 FROM pg_catalog.aclexplode("
                    "COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))) "
                    "AS grant_row WHERE grant_row.grantee=0 "
                    "AND grant_row.privilege_type='EXECUTE'), "
                    "NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode("
                    "COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))) "
                    "AS grant_row WHERE grant_row.privilege_type='EXECUTE' "
                    "AND grant_row.grantee NOT IN (procedure.proowner, "
                    "'supabase_auth_admin'::pg_catalog.regrole::pg_catalog.oid)) "
                    "FROM pg_catalog.pg_proc AS procedure "
                    "WHERE procedure.oid=%s::pg_catalog.regprocedure",
                    (function_signature, function_signature),
                )
                if cursor.fetchone() != (False, "s", True, True, False, True):
                    raise IdentityProvisioningError(
                        "AUTH_HOOK_HOSTED_ACL_INVALID",
                        "hosted Auth hook ACL or execution posture drifted",
                    )
                cursor.execute("SET LOCAL ROLE supabase_auth_admin")
                issued_at = int(datetime.now(timezone.utc).timestamp())
                for method in ("password", "token_refresh"):
                    cursor.execute(
                        f"SELECT {function_name}(%s)->'claims'",
                        (Json(_service_hook_event(method, issued_at)),),
                    )
                    _assert_service_probe_claims(
                        cursor.fetchone()[0],
                        issued_at,
                        int(datetime.now(timezone.utc).timestamp()),
                    )
                ordinary_event = _ordinary_hook_event(issued_at)
                cursor.execute(
                    f"SELECT {function_name}(%s)->'claims'",
                    (Json(ordinary_event),),
                )
                if cursor.fetchone()[0] != ordinary_event["claims"]:
                    raise IdentityProvisioningError(
                        "AUTH_HOOK_ORDINARY_PROBE_INVALID",
                        "hosted Auth hook changed ordinary user claims",
                    )
                for index, event in enumerate(_spoof_hook_events(issued_at), start=1):
                    savepoint = f"auth_hook_spoof_{index}"
                    cursor.execute(f"SAVEPOINT {savepoint}")
                    try:
                        cursor.execute(
                            f"SELECT {function_name}(%s)", (Json(event),)
                        )
                    except psycopg2.Error as error:
                        cursor.execute(f"ROLLBACK TO SAVEPOINT {savepoint}")
                        if error.pgcode != "42501":
                            raise IdentityProvisioningError(
                                "AUTH_HOOK_SPOOF_PROBE_INVALID",
                                "hosted Auth hook spoof probe failed unexpectedly",
                            ) from error
                    else:
                        raise IdentityProvisioningError(
                            "AUTH_HOOK_SPOOF_ACCEPTED",
                            "hosted Auth hook accepted a spoofed service claim",
                        )
                    finally:
                        cursor.execute(f"RELEASE SAVEPOINT {savepoint}")
            connection.rollback()
    except IdentityProvisioningError:
        raise
    except (psycopg2.Error, OSError) as error:
        raise IdentityProvisioningError(
            "AUTH_HOOK_HOSTED_PROBE_FAILED",
            "hosted Auth hook read-only preflight did not complete",
        ) from error
    return {
        "acl_verified": True,
        "ordinary_claims_unchanged": True,
        "service_methods_verified": ["password", "token_refresh"],
        "spoof_denials_verified": 2,
        "mutation_performed": False,
    }


def _jwt_claims(access_token: str) -> dict[str, Any]:
    parts = access_token.split(".")
    if len(parts) != 3:
        raise IdentityProvisioningError(
            "SERVICE_TOKEN_INVALID", "service access token is not a JWT"
        )
    try:
        padded = parts[1] + "=" * (-len(parts[1]) % 4)
        claims = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise IdentityProvisioningError(
            "SERVICE_TOKEN_INVALID", "service access token claims are malformed"
        ) from error
    if not isinstance(claims, dict):
        raise IdentityProvisioningError(
            "SERVICE_TOKEN_INVALID", "service access token claims are malformed"
        )
    return claims


def verify_password_session(
    client: Client, anon_key: str, password: str
) -> dict[str, Any]:
    session = client.password_session(anon_key, SERVICE_EMAIL, password)
    access_token = session.get("access_token") if isinstance(session, dict) else None
    if not isinstance(access_token, str) or not access_token:
        raise IdentityProvisioningError(
            "SERVICE_TOKEN_MISSING", "service session omitted its access token"
        )
    user = client.auth_user(anon_key, access_token)
    if not isinstance(user, dict):
        raise IdentityProvisioningError(
            "SERVICE_TOKEN_USER_INVALID", "service token user readback is malformed"
        )
    _validate_service_user(user)
    claims = _jwt_claims(access_token)
    app_metadata = claims.get("app_metadata")
    issued_at = claims.get("iat")
    expires_at = claims.get("exp")
    if (
        claims.get("sub") != SERVICE_AUTH_USER_ID
        or str(claims.get("email", "")).lower() != SERVICE_EMAIL
        or claims.get("role") != SERVICE_ROLE
        or claims.get("iss") != f"{SUPABASE_URL}/auth/v1"
        or claims.get("aud") != "authenticated"
        or not isinstance(issued_at, int)
        or isinstance(issued_at, bool)
        or not isinstance(expires_at, int)
        or isinstance(expires_at, bool)
        or not 0 < expires_at - issued_at <= MAX_ACCESS_TOKEN_SECONDS
        or claims.get("erp_service_identity") != SERVICE_MARKER
        or not isinstance(app_metadata, dict)
        or app_metadata.get("erp_service_identity") != SERVICE_MARKER
        or app_metadata.get("erp_service_role") != SERVICE_ROLE
    ):
        raise IdentityProvisioningError(
            "SERVICE_TOKEN_CONTRACT_DRIFT", "service token claim contract drifted"
        )
    return claims


def inspect_retired_custom_api_key(client: Client) -> str | None:
    records = client.management("GET", f"/projects/{PROJECT_REF}/api-keys")
    matches = [
        row for row in records if isinstance(row, dict)
        and row.get("name") == RETIRED_KEY_NAME
    ] if isinstance(records, list) else []
    if len(matches) > 1:
        raise IdentityProvisioningError(
            "RETIRED_KEY_AMBIGUOUS", "multiple retired evidence API keys exist"
        )
    if not matches:
        return None
    record = matches[0]
    if (
        record.get("type") != "secret"
        or record.get("secret_jwt_template") != {"role": SERVICE_ROLE}
        or not isinstance(record.get("id"), str)
        or not record["id"]
    ):
        raise IdentityProvisioningError(
            "RETIRED_KEY_CONTRACT_DRIFT", "retired evidence API key drifted"
        )
    return str(record["id"])


def _append_environment(path: Path, password: str) -> None:
    values = {
        "EVIDENCE_STORAGE_ENABLED": "true",
        "EVIDENCE_STORAGE_EXPECTED_PROJECT_REF": PROJECT_REF,
        "EVIDENCE_STORAGE_SERVICE_AUTH_USER_ID": SERVICE_AUTH_USER_ID,
        "EVIDENCE_STORAGE_SERVICE_EMAIL": SERVICE_EMAIL,
        "EVIDENCE_STORAGE_SERVICE_PASSWORD": password,
    }
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_APPEND)
        with os.fdopen(descriptor, "a", encoding="utf-8") as output:
            for key, value in values.items():
                if "\n" in value or "\r" in value:
                    raise IdentityProvisioningError(
                        "ENVIRONMENT_VALUE_INVALID",
                        "service environment value is malformed",
                    )
                output.write(f"{key}={value}\n")
    except OSError as error:
        raise IdentityProvisioningError(
            "ENVIRONMENT_TARGET_INVALID",
            "GitHub run environment file cannot be updated",
        ) from error


def _mask_runner_value(value: str) -> None:
    if os.getenv("GITHUB_ACTIONS", "").lower() == "true":
        print(f"::add-mask::{value}")


def _validate_environment_target(path: Path) -> None:
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_APPEND)
        os.close(descriptor)
    except OSError as error:
        raise IdentityProvisioningError(
            "ENVIRONMENT_TARGET_INVALID",
            "GitHub run environment file cannot be updated",
        ) from error


def _write_receipt(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(payload, output, indent=2, sort_keys=True)
            output.write("\n")
        os.replace(temporary, path)
        path.chmod(0o600)
    finally:
        temporary.unlink(missing_ok=True)


def _receipt_base(reviewed_sha: str) -> dict[str, Any]:
    return {
        "version": 1,
        "phase": "prepare",
        "project_ref": PROJECT_REF,
        "reviewed_sha": reviewed_sha,
        "run": {
            "id": os.getenv("GITHUB_RUN_ID", "local"),
            "attempt": os.getenv("GITHUB_RUN_ATTEMPT", "local"),
        },
        "service_auth_user_id": SERVICE_AUTH_USER_ID,
        "service_email": SERVICE_EMAIL,
        "service_marker": SERVICE_MARKER,
        "database_role": SERVICE_ROLE,
        "hook_uri": HOOK_URI,
        "verified_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase", required=True, choices=("prepare",))
    parser.add_argument("--project-ref", required=True)
    parser.add_argument("--reviewed-sha", required=True)
    parser.add_argument("--github-env", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args(argv)
    reviewed_sha = args.reviewed_sha.strip()
    base = _receipt_base(reviewed_sha)
    try:
        if args.project_ref != PROJECT_REF:
            raise IdentityProvisioningError(
                "PROJECT_REF_DENIED", "refusing service identity outside reviewed staging"
            )
        if SHA_RE.fullmatch(reviewed_sha) is None:
            raise IdentityProvisioningError(
                "REVIEWED_SHA_INVALID", "reviewed SHA must be exact lowercase hexadecimal"
            )
        _validate_environment_target(args.github_env)
        if os.getenv("SUPABASE_URL", "").rstrip("/") != SUPABASE_URL:
            raise IdentityProvisioningError(
                "SUPABASE_URL_DENIED", "SUPABASE_URL does not match reviewed staging"
            )
        anon_key = os.getenv("SUPABASE_ANON_KEY", "").strip()
        if not anon_key:
            raise IdentityProvisioningError(
                "ANON_KEY_MISSING", "SUPABASE_ANON_KEY is required"
            )
        management_token = os.getenv("SUPABASE_ACCESS_TOKEN", "")
        client = Client(management_token)
        auth_admin = _auth_admin_authority(management_token)
        mask_auth_admin_secret(auth_admin)
        password = secrets.token_urlsafe(48)
        _mask_runner_value(password)
        _, created = reconcile_service_user(auth_admin, password)
        hosted_probe = probe_hosted_hook(os.getenv("PSYCOPG_DATABASE_URL", ""))
        rollout = reconcile_hook_config(client)
        with _restore_hook_on_failure(client, rollout):
            verify_password_session(client, anon_key, password)
            retained_key_id = inspect_retired_custom_api_key(client)
            _append_environment(args.github_env, password)
            _write_receipt(
                args.receipt,
                {
                    **base,
                    "state": "prepared",
                    "identity_created": created,
                    "password_rotated": True,
                    "password_session_verified": True,
                    "hosted_hook_probe": hosted_probe,
                    "hosted_auth_invariants": rollout.hosted_auth_facts,
                    "hook_enabled": rollout.expected[
                        "hook_custom_access_token_enabled"
                    ],
                    "hook_config_changed": rollout.changed,
                    "legacy_secret_api_key_retained": retained_key_id is not None,
                    "legacy_secret_api_key_id": retained_key_id,
                },
            )
            print(json.dumps({"state": "prepared", "project_ref": PROJECT_REF}))
        return 0
    except (IdentityProvisioningError, SupabaseAuthAdminError) as error:
        _write_receipt(
            args.receipt,
            {**base, "state": "blocked", "error_code": error.code},
        )
        print(
            f"evidence storage service identity blocked: {error.code}",
            file=sys.stderr,
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
