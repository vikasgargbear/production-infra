#!/usr/bin/env python3
"""Reconcile one Supabase secret API key restricted to evidence storage.

The key is created with a custom JWT template whose database role is exactly
``erp_evidence_storage``.  The revealed key is written only to GitHub's
run-scoped environment file; receipts never contain credential material.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Optional
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


API_BASE = "https://api.supabase.com/v1"
KEY_NAME = "canonical-evidence-storage"
KEY_ROLE = "erp_evidence_storage"
PROJECT_REF_RE = re.compile(r"[a-z0-9]{20}")
SECRET_KEY_RE = re.compile(r"sb_secret_[A-Za-z0-9_-]{20,}")


class EvidenceKeyError(RuntimeError):
    """Raised when the bucket-restricted API-key contract cannot be proven."""


class SupabaseManagementClient:
    def __init__(self, access_token: str) -> None:
        if not access_token:
            raise EvidenceKeyError("SUPABASE_ACCESS_TOKEN is required")
        self._access_token = access_token

    def request(
        self,
        method: str,
        path: str,
        *,
        payload: Optional[Mapping[str, Any]] = None,
        query: Optional[Mapping[str, str]] = None,
    ) -> Any:
        url = API_BASE + path
        if query:
            url += "?" + urlencode(query)
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = Request(
            url,
            data=body,
            method=method,
            headers={
                "Authorization": f"Bearer {self._access_token}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urlopen(request, timeout=30) as response:
                content = response.read()
        except HTTPError as error:
            raise EvidenceKeyError(
                f"Supabase Management API {method} {path} failed with HTTP {error.code}"
            ) from None
        return json.loads(content) if content else None


def _validate_key_record(record: Mapping[str, Any]) -> None:
    if record.get("name") != KEY_NAME or record.get("type") != "secret":
        raise EvidenceKeyError("canonical evidence API-key identity drifted")
    if record.get("secret_jwt_template") != {"role": KEY_ROLE}:
        raise EvidenceKeyError("canonical evidence API-key role template drifted")
    if not isinstance(record.get("id"), str) or not record["id"]:
        raise EvidenceKeyError("canonical evidence API-key ID is missing")


def reconcile_key(client: SupabaseManagementClient, project_ref: str) -> dict[str, Any]:
    if PROJECT_REF_RE.fullmatch(project_ref) is None:
        raise EvidenceKeyError("canonical evidence project ref is invalid")
    records = client.request("GET", f"/projects/{project_ref}/api-keys")
    if not isinstance(records, list):
        raise EvidenceKeyError("Supabase API-key list response is invalid")
    matches = [record for record in records if record.get("name") == KEY_NAME]
    if len(matches) > 1:
        raise EvidenceKeyError("multiple canonical evidence API keys exist")
    created = not matches
    if created:
        record = client.request(
            "POST",
            f"/projects/{project_ref}/api-keys",
            query={"reveal": "true"},
            payload={
                "type": "secret",
                "name": KEY_NAME,
                "description": "Private canonical ERP evidence storage only",
                "secret_jwt_template": {"role": KEY_ROLE},
            },
        )
    else:
        _validate_key_record(matches[0])
        record = client.request(
            "GET",
            f"/projects/{project_ref}/api-keys/{matches[0]['id']}",
            query={"reveal": "true"},
        )
    if not isinstance(record, dict):
        raise EvidenceKeyError("Supabase API-key reveal response is invalid")
    _validate_key_record(record)
    api_key = record.get("api_key")
    if not isinstance(api_key, str) or SECRET_KEY_RE.fullmatch(api_key) is None:
        raise EvidenceKeyError("canonical evidence secret API key was not revealed")
    return {
        "id": record["id"],
        "name": KEY_NAME,
        "type": "secret",
        "role": KEY_ROLE,
        "prefix": record.get("prefix"),
        "created": created,
        "api_key": api_key,
    }


def _append_github_environment(path: Path, *, project_ref: str, api_key: str) -> None:
    if "\n" in api_key or "\r" in api_key:
        raise EvidenceKeyError("canonical evidence secret API key is malformed")
    descriptor = os.open(path, os.O_WRONLY | os.O_APPEND)
    with os.fdopen(descriptor, "a", encoding="utf-8") as output:
        output.write("EVIDENCE_STORAGE_ENABLED=true\n")
        output.write(f"EVIDENCE_STORAGE_EXPECTED_PROJECT_REF={project_ref}\n")
        output.write(f"EVIDENCE_STORAGE_SERVER_API_KEY={api_key}\n")


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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-ref", required=True)
    parser.add_argument("--github-env", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = reconcile_key(
            SupabaseManagementClient(os.getenv("SUPABASE_ACCESS_TOKEN", "")),
            args.project_ref,
        )
        api_key = result.pop("api_key")
        print(f"::add-mask::{api_key}")
        _append_github_environment(
            args.github_env,
            project_ref=args.project_ref,
            api_key=api_key,
        )
        receipt = {
            "version": 1,
            "state": "ready",
            "project_ref": args.project_ref,
            "verified_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            **result,
        }
        _write_receipt(args.receipt, receipt)
        print(json.dumps({"state": "ready", "project_ref": args.project_ref}))
        return 0
    except EvidenceKeyError as error:
        print(f"evidence storage key provisioning blocked: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
