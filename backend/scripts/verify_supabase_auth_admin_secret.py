#!/usr/bin/env python3
"""Read-only hosted proof of the runner-only Supabase Auth Admin secret."""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any
from uuid import UUID

if __package__:
    from .supabase_auth_admin import (
        SupabaseAuthAdminError,
        auth_admin_request,
        mask_auth_admin_secret,
        resolve_auth_admin_authority,
    )
else:
    from supabase_auth_admin import (
        SupabaseAuthAdminError,
        auth_admin_request,
        mask_auth_admin_secret,
        resolve_auth_admin_authority,
    )


def _first_user_id(listing: Any) -> str | None:
    users = listing.get("users") if isinstance(listing, dict) else None
    if not isinstance(users, list):
        raise SupabaseAuthAdminError(
            "AUTH_ADMIN_LIST_INVALID", "Supabase Auth Admin list response is malformed"
        )
    if not users:
        return None
    first = users[0]
    try:
        return str(UUID(str(first.get("id") if isinstance(first, dict) else None)))
    except (TypeError, ValueError) as error:
        raise SupabaseAuthAdminError(
            "AUTH_ADMIN_LIST_INVALID", "Supabase Auth Admin list omitted a UUID"
        ) from error


def verify(project_ref: str, management_token: str) -> dict[str, object]:
    authority = resolve_auth_admin_authority(management_token, project_ref)
    mask_auth_admin_secret(authority)
    listing = auth_admin_request(
        authority, "GET", "users", params={"page": 1, "per_page": 1}
    )
    user_id = _first_user_id(listing)
    readback_verified = False
    if user_id is not None:
        user = auth_admin_request(authority, "GET", f"users/{user_id}")
        if not isinstance(user, dict) or user.get("id") != user_id:
            raise SupabaseAuthAdminError(
                "AUTH_ADMIN_READBACK_INVALID",
                "Supabase Auth Admin user readback did not reconcile",
            )
        readback_verified = True
    return {
        "state": "verified",
        "project_ref": project_ref,
        "modern_secret_shape_verified": True,
        "list_verified": True,
        "readback_verified": readback_verified,
        "mutation_performed": False,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-ref", required=True)
    args = parser.parse_args(argv)
    try:
        result = verify(
            args.project_ref, os.getenv("SUPABASE_ACCESS_TOKEN", "")
        )
    except SupabaseAuthAdminError as error:
        print(
            f"Supabase Auth Admin secret preflight blocked: {error.code}",
            file=sys.stderr,
        )
        return 2
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
