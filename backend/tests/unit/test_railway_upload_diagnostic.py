import json
from datetime import datetime, timezone
from pathlib import Path
import subprocess
import sys

from scripts.railway_upload_diagnostic import (
    MAX_STRUCTURED_OUTPUT_BYTES,
    SINGAPORE_RAILWAY_REGION,
    classify_upload_files,
    classify_upload_output,
)


OBSERVED_DURING_WINDOW = datetime(2026, 8, 27, 3, 42, 58, tzinfo=timezone.utc)
PEAK_ERROR = (
    "Free-tier deploys to asia-southeast1-eqsg3a are not available during "
    "peak hours (8 AM – 8 PM Asia/Singapore). Please try again later or "
    "upgrade your plan."
)


def _payload(error: str, *, code: str = "UPLOAD_FAILED") -> str:
    return json.dumps(
        {"code": code, "error": error, "hint": "SECRET_HINT_MUST_NOT_APPEAR"}
    )


def test_exact_free_tier_window_is_sanitized_and_never_retryable() -> None:
    diagnostic = classify_upload_output(
        _payload(PEAK_ERROR),
        stderr_present=False,
        observed_at=OBSERVED_DURING_WINDOW,
    )

    assert diagnostic.code == "free_tier_peak_window"
    assert diagnostic.kind == "scheduled_provider_window"
    assert diagnostic.region == SINGAPORE_RAILWAY_REGION
    assert diagnostic.earliest_retry_utc == "2026-08-27T12:00:00Z"
    assert diagnostic.provider_code == "UPLOAD_FAILED"
    assert diagnostic.http_status == "NONE"
    assert diagnostic.retryable is False
    assert "SECRET" not in diagnostic.as_tsv()


def test_window_end_uses_zoneinfo_for_singapore_local_time() -> None:
    diagnostic = classify_upload_output(
        _payload(PEAK_ERROR),
        stderr_present=False,
        observed_at=datetime(2026, 8, 27, 0, 0, 0, tzinfo=timezone.utc),
    )

    assert diagnostic.earliest_retry_utc == "2026-08-27T12:00:00Z"


def test_free_tier_message_requires_exact_region_and_punctuation() -> None:
    variants = (
        PEAK_ERROR.replace("asia-southeast1-eqsg3a", "us-west2"),
        PEAK_ERROR.replace("8 AM – 8 PM", "8 AM - 8 PM"),
        PEAK_ERROR.removesuffix("."),
    )

    for error in variants:
        diagnostic = classify_upload_output(
            _payload(error),
            stderr_present=False,
            observed_at=OBSERVED_DURING_WINDOW,
        )
        assert diagnostic.code == "non_retryable"
        assert diagnostic.kind == "non_retryable"
        assert diagnostic.region is None
        assert diagnostic.earliest_retry_utc is None
        assert diagnostic.retryable is False


def test_existing_allowlisted_transport_classification_is_preserved() -> None:
    transient = classify_upload_output(
        _payload("Failed to upload code with status code 502 Bad Gateway"),
        stderr_present=False,
        observed_at=OBSERVED_DURING_WINDOW,
    )
    forbidden = classify_upload_output(
        _payload("Failed to upload code with status code 403 Forbidden"),
        stderr_present=False,
        observed_at=OBSERVED_DURING_WINDOW,
    )

    assert transient.kind == "transient_transport"
    assert transient.http_status == "502"
    assert transient.retryable is True
    assert forbidden.kind == "non_retryable"
    assert forbidden.http_status == "403"
    assert forbidden.retryable is False


def test_unmatched_provider_content_cannot_reach_diagnostic_output() -> None:
    raw = _payload(
        "ERROR_SECRET_SHOULD_NOT_APPEAR",
        code="SECRET_CODE_SHOULD_NOT_APPEAR",
    )
    diagnostic = classify_upload_output(
        raw,
        stderr_present=True,
        observed_at=OBSERVED_DURING_WINDOW,
    )

    rendered = json.dumps(diagnostic.__dict__, sort_keys=True)
    assert diagnostic.code == "non_retryable"
    assert diagnostic.kind == "non_retryable"
    assert diagnostic.provider_code == "UNCLASSIFIED"
    assert "SECRET" not in rendered


def test_empty_invalid_multiple_and_oversized_outputs_fail_closed(tmp_path: Path) -> None:
    empty = classify_upload_output(
        "",
        stderr_present=False,
        observed_at=OBSERVED_DURING_WINDOW,
    )
    invalid = classify_upload_output(
        "not-json SECRET",
        stderr_present=True,
        observed_at=OBSERVED_DURING_WINDOW,
    )
    multiple = classify_upload_output(
        '{}\n{"code":"UPLOAD_FAILED"}',
        stderr_present=False,
        observed_at=OBSERVED_DURING_WINDOW,
    )
    stdout_path = tmp_path / "stdout"
    stderr_path = tmp_path / "stderr"
    stdout_path.write_text("X" * (MAX_STRUCTURED_OUTPUT_BYTES + 1), encoding="utf-8")
    stderr_path.write_text("SECRET_STDERR", encoding="utf-8")
    oversized = classify_upload_files(
        stdout_path,
        stderr_path,
        observed_at=OBSERVED_DURING_WINDOW,
    )

    assert empty.kind == "empty_cli_response"
    assert invalid.kind == "non_retryable"
    assert multiple.kind == "non_retryable"
    assert oversized.kind == "non_retryable"
    assert oversized.retryable is False


def test_cli_tsv_contains_only_sanitized_contract_fields(tmp_path: Path) -> None:
    root = Path(__file__).resolve().parents[3]
    stdout_path = tmp_path / "stdout.json"
    stderr_path = tmp_path / "stderr.log"
    stdout_path.write_text(_payload(PEAK_ERROR), encoding="utf-8")
    stderr_path.write_text("SECRET_STDERR_MUST_NOT_APPEAR", encoding="utf-8")

    result = subprocess.run(
        [
            sys.executable,
            str(root / "backend/scripts/railway_upload_diagnostic.py"),
            "--stdout-file",
            str(stdout_path),
            "--stderr-file",
            str(stderr_path),
            "--observed-at-utc",
            "2026-08-27T03:42:58Z",
            "--format",
            "tsv",
        ],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout == (
        "free_tier_peak_window\tscheduled_provider_window\t"
        "asia-southeast1-eqsg3a\t2026-08-27T12:00:00Z\t"
        "UPLOAD_FAILED\tNONE\n"
    )
    assert "SECRET" not in result.stdout
    assert "SECRET" not in result.stderr
