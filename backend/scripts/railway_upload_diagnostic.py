#!/usr/bin/env python3
"""Classify Railway CLI upload failures without disclosing provider output.

The Railway CLI may return structured JSON containing environment or account
details in fields that are not part of the deployment contract.  This module
therefore emits only allowlisted diagnostic values derived from exact provider
messages.  It never prints the source payload and never marks a scheduled
provider window as retryable.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import datetime, time, timezone
import json
from pathlib import Path
import re
from typing import Any
from zoneinfo import ZoneInfo


MAX_STRUCTURED_OUTPUT_BYTES = 64 * 1024
SAFE_PROVIDER_CODES = frozenset(
    {
        "UPLOAD_FAILED",
        "RATELIMITED",
        "FETCH_ERROR",
        "UNAUTHORIZED",
        "INVALID_TOKEN",
        "GRAPHQL_ERROR",
    }
)
HTTP_UPLOAD_ERROR = re.compile(
    r"^Failed to upload code with status code (?P<status>[0-9]{3})(?: .*)?$",
    flags=re.IGNORECASE,
)
FREE_TIER_PEAK_WINDOW_ERROR = re.compile(
    r"^Free-tier deploys to (?P<region>[a-z0-9-]+) are not available during "
    r"peak hours \(8 AM – 8 PM Asia/Singapore\)\. Please try again later or "
    r"upgrade your plan\.$"
)
SINGAPORE_RAILWAY_REGION = "asia-southeast1-eqsg3a"
SINGAPORE_TIMEZONE = ZoneInfo("Asia/Singapore")
PEAK_START = time(hour=8)
PEAK_END = time(hour=20)


@dataclass(frozen=True)
class UploadDiagnostic:
    code: str
    kind: str
    region: str | None = None
    earliest_retry_utc: str | None = None
    provider_code: str = "NONE"
    http_status: str = "NONE"
    retryable: bool = False

    def as_tsv(self) -> str:
        values = (
            self.code,
            self.kind,
            self.region or "NONE",
            self.earliest_retry_utc or "NONE",
            self.provider_code,
            self.http_status,
        )
        return "\t".join(values)


def _format_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace(
        "+00:00", "Z"
    )


def _next_singapore_free_tier_window_end(observed_at: datetime) -> str:
    if observed_at.tzinfo is None:
        raise ValueError("observed_at must be timezone-aware")
    local = observed_at.astimezone(SINGAPORE_TIMEZONE)
    if PEAK_START <= local.time() < PEAK_END:
        permitted = local.replace(hour=20, minute=0, second=0, microsecond=0)
    else:
        # The provider should only emit this error during the documented window.
        # If a delayed log is classified later, do not invent a future wait.
        permitted = local
    return _format_utc(permitted)


def _single_json_object(raw: str) -> dict[str, Any] | None:
    if len(raw.encode("utf-8")) > MAX_STRUCTURED_OUTPUT_BYTES:
        return None
    try:
        value = json.loads(raw)
    except (json.JSONDecodeError, UnicodeError):
        return None
    return value if isinstance(value, dict) else None


def classify_upload_output(
    raw_stdout: str,
    *,
    stderr_present: bool,
    observed_at: datetime,
) -> UploadDiagnostic:
    """Return an allowlisted diagnosis for one Railway ``up --json`` result."""

    if not raw_stdout and not stderr_present:
        return UploadDiagnostic(code="empty_cli_response", kind="empty_cli_response")

    payload = _single_json_object(raw_stdout)
    if payload is None:
        return UploadDiagnostic(code="non_retryable", kind="non_retryable")

    raw_provider_code = payload.get("code")
    provider_code = (
        raw_provider_code
        if isinstance(raw_provider_code, str)
        and raw_provider_code in SAFE_PROVIDER_CODES
        else "UNCLASSIFIED"
    )
    error = payload.get("error")
    error_text = error if isinstance(error, str) else ""

    if provider_code == "UPLOAD_FAILED":
        peak_match = FREE_TIER_PEAK_WINDOW_ERROR.fullmatch(error_text)
        if peak_match and peak_match.group("region") == SINGAPORE_RAILWAY_REGION:
            return UploadDiagnostic(
                code="free_tier_peak_window",
                kind="scheduled_provider_window",
                region=SINGAPORE_RAILWAY_REGION,
                earliest_retry_utc=_next_singapore_free_tier_window_end(observed_at),
                provider_code=provider_code,
            )

    http_status = "NONE"
    if provider_code == "UPLOAD_FAILED":
        http_match = HTTP_UPLOAD_ERROR.fullmatch(error_text)
        if http_match:
            http_status = http_match.group("status")

    if provider_code == "RATELIMITED" or http_status == "429" or (
        http_status != "NONE" and http_status.startswith("5")
    ):
        return UploadDiagnostic(
            code="transient_transport",
            kind="transient_transport",
            provider_code=provider_code,
            http_status=http_status,
            retryable=True,
        )

    return UploadDiagnostic(
        code="non_retryable",
        kind="non_retryable",
        provider_code=provider_code,
        http_status=http_status,
    )


def classify_upload_files(
    stdout_path: Path,
    stderr_path: Path,
    *,
    observed_at: datetime,
) -> UploadDiagnostic:
    try:
        stdout_size = stdout_path.stat().st_size
        stderr_present = stderr_path.stat().st_size > 0
    except OSError:
        return UploadDiagnostic(code="non_retryable", kind="non_retryable")
    if stdout_size > MAX_STRUCTURED_OUTPUT_BYTES:
        return UploadDiagnostic(code="non_retryable", kind="non_retryable")
    try:
        raw_stdout = stdout_path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return UploadDiagnostic(code="non_retryable", kind="non_retryable")
    return classify_upload_output(
        raw_stdout,
        stderr_present=stderr_present,
        observed_at=observed_at,
    )


def _parse_observed_at(value: str | None) -> datetime:
    if value is None:
        return datetime.now(timezone.utc)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("--observed-at-utc must include a UTC offset")
    return parsed.astimezone(timezone.utc)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stdout-file", required=True, type=Path)
    parser.add_argument("--stderr-file", required=True, type=Path)
    parser.add_argument("--observed-at-utc")
    parser.add_argument("--format", choices=("json", "tsv"), default="json")
    args = parser.parse_args()
    diagnostic = classify_upload_files(
        args.stdout_file,
        args.stderr_file,
        observed_at=_parse_observed_at(args.observed_at_utc),
    )
    if args.format == "tsv":
        print(diagnostic.as_tsv())
    else:
        print(json.dumps(asdict(diagnostic), sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    main()
