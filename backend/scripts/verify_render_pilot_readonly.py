#!/usr/bin/env python3
"""Retry-safe, read-only verification for a Render pilot hostname."""

from __future__ import annotations

import argparse
import os
import sys
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Mapping, Optional, Tuple
from urllib.parse import urlparse

import requests


RETRYABLE_STATUS_CODES = frozenset({408, 425, 429, 500, 502, 503, 504})


class ProbeError(RuntimeError):
    pass


@dataclass(frozen=True)
class Check:
    name: str
    path: str
    required_keys: Tuple[str, ...]
    authenticated: bool = False


PUBLIC_CHECKS = (
    Check("health", "/health", ("status", "service", "version")),
    Check("database readiness", "/ready", ("status",)),
    Check(
        "auth status",
        "/api/auth/oauth/status",
        ("enabled", "providers_configured", "setup_required"),
    ),
    Check(
        "auth providers",
        "/api/auth/oauth/providers",
        ("providers", "supabase_configured"),
    ),
)
GST_CHECK = Check(
    "authenticated GST read",
    "/api/gst/dashboard?period=current",
    ("outputTax", "inputCredit", "netPayable", "summary"),
    authenticated=True,
)


def normalize_base_url(value: str) -> str:
    parsed = urlparse(value.strip())
    is_local = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    if parsed.scheme not in ({"http", "https"} if is_local else {"https"}):
        raise ProbeError("Pilot API URL must use HTTPS (HTTP is allowed only locally)")
    if not parsed.hostname or parsed.username or parsed.password:
        raise ProbeError("Pilot API URL must be a hostname without credentials")
    if parsed.path not in {"", "/"} or parsed.params or parsed.query or parsed.fragment:
        raise ProbeError("Pilot API URL must be an origin without a path, query, or fragment")
    return value.strip().rstrip("/")


def _positive_int(value: str, name: str, maximum: int) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise ProbeError(f"{name} must be an integer") from exc
    if not 1 <= parsed <= maximum:
        raise ProbeError(f"{name} must be between 1 and {maximum}")
    return parsed


def get_json_with_retry(
    session: requests.Session,
    url: str,
    *,
    headers: Optional[Mapping[str, str]],
    attempts: int,
    timeout_seconds: int,
    sleep: Callable[[float], None] = time.sleep,
) -> Dict[str, Any]:
    """Issue only GET requests; retries are limited to cold-start/transient failures."""
    last_failure = "request failed"
    for attempt in range(1, attempts + 1):
        try:
            response = session.get(url, headers=headers, timeout=timeout_seconds)
        except requests.RequestException as exc:
            last_failure = type(exc).__name__
        else:
            if response.status_code == 200:
                try:
                    body = response.json()
                except ValueError as exc:
                    raise ProbeError(f"GET {urlparse(url).path} returned invalid JSON") from exc
                if not isinstance(body, dict):
                    raise ProbeError(f"GET {urlparse(url).path} returned a non-object JSON body")
                return body
            last_failure = f"HTTP {response.status_code}"
            if response.status_code not in RETRYABLE_STATUS_CODES:
                break

        if attempt < attempts:
            sleep(min(2 ** (attempt - 1), 8))

    path = urlparse(url).path
    raise ProbeError(f"GET {path} failed after {attempt} attempt(s): {last_failure}")


def run_checks(
    base_url: str,
    *,
    access_token: Optional[str] = None,
    attempts: int = 5,
    timeout_seconds: int = 20,
    session: Optional[requests.Session] = None,
    sleep: Callable[[float], None] = time.sleep,
) -> List[str]:
    base_url = normalize_base_url(base_url)
    checks = list(PUBLIC_CHECKS)
    if access_token:
        checks.append(GST_CHECK)

    client = session or requests.Session()
    passed: List[str] = []
    for check in checks:
        headers = {"Authorization": f"Bearer {access_token}"} if check.authenticated else None
        body = get_json_with_retry(
            client,
            f"{base_url}{check.path}",
            headers=headers,
            attempts=attempts,
            timeout_seconds=timeout_seconds,
            sleep=sleep,
        )
        missing = sorted(set(check.required_keys) - set(body))
        if missing:
            raise ProbeError(f"{check.name} response is missing keys: {', '.join(missing)}")
        if check.name == "health" and body["status"] != "healthy":
            raise ProbeError("health response did not report status=healthy")
        if check.name == "database readiness" and body["status"] != "ready":
            raise ProbeError("readiness response did not report status=ready")
        passed.append(check.name)
    return passed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base-url",
        default=os.getenv("PHARMA_LIVE_API_BASE_URL", ""),
        help="deployed API origin (or set PHARMA_LIVE_API_BASE_URL)",
    )
    parser.add_argument(
        "--attempts",
        default=os.getenv("PHARMA_LIVE_CONNECT_ATTEMPTS", "5"),
        help="bounded GET attempts for Render cold starts (default: 5)",
    )
    parser.add_argument(
        "--timeout-seconds",
        default=os.getenv("PHARMA_LIVE_TIMEOUT_SECONDS", "20"),
        help="timeout per GET request (default: 20)",
    )
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if not args.base_url:
            raise ProbeError("Set PHARMA_LIVE_API_BASE_URL or pass --base-url")
        attempts = _positive_int(args.attempts, "attempts", 10)
        timeout_seconds = _positive_int(args.timeout_seconds, "timeout-seconds", 120)
        token = os.getenv("PHARMA_LIVE_ACCESS_TOKEN")
        passed = run_checks(
            args.base_url,
            access_token=token,
            attempts=attempts,
            timeout_seconds=timeout_seconds,
        )
    except ProbeError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1

    for name in passed:
        print(f"PASS: {name}")
    if not token:
        print("SKIP: authenticated GST read (PHARMA_LIVE_ACCESS_TOKEN is not set)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
