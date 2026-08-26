"""Exercise the evidence-storage Auth hook on disposable PostgreSQL 15."""

from __future__ import annotations

import os
import time

import psycopg2
from psycopg2.errors import InsufficientPrivilege
from psycopg2.extras import Json


SERVICE_USER_ID = "d3000000-0000-4000-8000-0000000000e1"
SERVICE_EMAIL = "canonical-evidence-storage@service.aasopharma.invalid"
SERVICE_MARKER = "canonical-evidence-storage-service-v1"
SERVICE_ROLE = "erp_evidence_storage"
HOOK_NAME = "erp_security.canonical_evidence_storage_access_token_hook"
HOOK = f"{HOOK_NAME}(jsonb)"


def _event(authentication_method: str, issued_at: int) -> dict:
    return {
        "user_id": SERVICE_USER_ID,
        "authentication_method": authentication_method,
        "claims": {
            "sub": SERVICE_USER_ID,
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


def main() -> None:
    database_url = os.environ["DATABASE_URL"].replace(
        "postgresql+psycopg2://", "postgresql://", 1
    )
    with psycopg2.connect(database_url) as connection:
        connection.autocommit = False
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT has_function_privilege('erp_runtime', %s, 'EXECUTE'), "
                "has_function_privilege('supabase_auth_admin', %s, 'EXECUTE')",
                (HOOK, HOOK),
            )
            assert cursor.fetchone() == (False, True)
            cursor.execute("SET LOCAL ROLE supabase_auth_admin")
            issued_at = int(time.time())
            for method in ("password", "token_refresh"):
                cursor.execute(
                    f"SELECT {HOOK_NAME}(%s)->'claims'",
                    (Json(_event(method, issued_at)),),
                )
                claims = cursor.fetchone()[0]
                assert claims["role"] == SERVICE_ROLE
                assert claims["erp_service_identity"] == SERVICE_MARKER
                assert issued_at < claims["exp"] <= issued_at + 900

            ordinary_claims = {
                "sub": "00000000-0000-4000-8000-000000000002",
                "email": "human@example.invalid",
                "role": "authenticated",
                "aud": "authenticated",
                "iat": issued_at,
                "exp": issued_at + 3600,
                "app_metadata": {"provider": "google", "providers": ["google"]},
            }
            ordinary_event = {
                "user_id": ordinary_claims["sub"],
                "authentication_method": "oauth",
                "claims": ordinary_claims,
            }
            cursor.execute(
                f"SELECT {HOOK_NAME}(%s)->'claims'",
                (Json(ordinary_event),),
            )
            assert cursor.fetchone()[0] == ordinary_claims

            role_escalation = {
                "user_id": "00000000-0000-4000-8000-000000000001",
                "authentication_method": "password",
                "claims": {
                    "sub": "00000000-0000-4000-8000-000000000001",
                    "email": "ordinary@example.invalid",
                    "role": SERVICE_ROLE,
                    "aud": "authenticated",
                    "iat": issued_at,
                    "exp": issued_at + 3600,
                    "app_metadata": {},
                },
            }
            denied_events = (
                (_event("magic_link", issued_at), "non-password service token"),
                (role_escalation, "ordinary user with evidence role"),
            )
            for denied, label in denied_events:
                try:
                    cursor.execute(f"SELECT {HOOK_NAME}(%s)", (Json(denied),))
                except InsufficientPrivilege:
                    connection.rollback()
                    cursor.execute("SET LOCAL ROLE supabase_auth_admin")
                else:
                    raise AssertionError(f"{label} was accepted")
            connection.rollback()


if __name__ == "__main__":
    main()
