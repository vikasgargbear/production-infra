#!/usr/bin/env python3
"""Bind hosted Supabase Auth redirects to one reviewed application origin."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from collections.abc import Mapping
from urllib.parse import urlsplit


MANAGEMENT_API = "https://api.supabase.com"


def normalize_https_origin(value: str) -> str:
    candidate = value.strip().rstrip("/")
    if any(character in candidate for character in "*?[]{}"):
        raise ValueError("frontend origin must be an exact HTTPS origin")
    parsed = urlsplit(candidate)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.port is not None
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("frontend origin must be an exact HTTPS origin")
    return f"https://{parsed.hostname.lower()}"


def parse_allow_list(value: object) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, str):
        raise ValueError("Supabase uri_allow_list must be a string")
    return [entry.strip() for entry in value.split(",") if entry.strip()]


def build_update(current: Mapping[str, object], frontend_origin: str) -> dict[str, object]:
    origin = normalize_https_origin(frontend_origin)
    parse_allow_list(current.get("uri_allow_list"))
    return {
        "site_url": origin,
        "uri_allow_list": origin,
        "oauth_server_enabled": True,
        "oauth_server_allow_dynamic_registration": False,
        "oauth_server_authorization_path": "/oauth/consent",
    }


def request_json(
    method: str,
    url: str,
    token: str,
    payload: Mapping[str, object] | None = None,
) -> dict[str, object]:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            value = json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read(2048).decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Supabase Auth configuration request failed ({error.code}): {detail}"
        ) from error
    if not isinstance(value, dict):
        raise RuntimeError("Supabase Auth configuration response must be an object")
    return value


def reconcile(
    project_ref: str,
    frontend_origin: str,
    token: str,
    reviewed_sha: str,
) -> dict[str, object]:
    if not project_ref or any(
        character not in "abcdefghijklmnopqrstuvwxyz0123456789"
        for character in project_ref
    ):
        raise ValueError("invalid Supabase project ref")
    if not token.strip():
        raise ValueError("SUPABASE_ACCESS_TOKEN is required")
    if len(reviewed_sha) != 40 or any(
        character not in "0123456789abcdef" for character in reviewed_sha
    ):
        raise ValueError("reviewed SHA must be an exact lowercase commit SHA")
    endpoint = f"{MANAGEMENT_API}/v1/projects/{project_ref}/config/auth"
    current = request_json("GET", endpoint, token)
    update = build_update(current, frontend_origin)
    if all(current.get(key) == expected for key, expected in update.items()):
        updated = current
    else:
        updated = request_json("PATCH", endpoint, token, update)
    for key, expected in update.items():
        if updated.get(key) != expected:
            raise RuntimeError(f"Supabase did not persist exact reviewed field: {key}")
    return {
        "project_ref": project_ref,
        "site_url": update["site_url"],
        "uri_allow_list": update["uri_allow_list"],
        "oauth_server_enabled": True,
        "oauth_server_allow_dynamic_registration": False,
        "oauth_server_authorization_path": "/oauth/consent",
        "git_commit": reviewed_sha,
        "redirect_origin_allowlisted": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-ref", required=True)
    parser.add_argument("--frontend-origin", required=True)
    parser.add_argument("--reviewed-sha", required=True)
    arguments = parser.parse_args()
    evidence = reconcile(
        arguments.project_ref,
        arguments.frontend_origin,
        os.environ.get("SUPABASE_ACCESS_TOKEN", ""),
        arguments.reviewed_sha,
    )
    json.dump(evidence, sys.stdout, sort_keys=True)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
