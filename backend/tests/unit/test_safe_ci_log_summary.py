from __future__ import annotations

import hashlib
import json

from scripts.safe_ci_log_summary import fingerprint_stream, safe_log_annotation


def test_all_external_log_boundaries_have_fixed_annotation_titles(tmp_path):
    log_path = tmp_path / "external.log"
    log_path.write_bytes(b"provider secret and customer data")

    for label in (
        "evidence-cleanup",
        "evidence-key",
        "fixture",
        "readiness",
        "render",
        "reset",
        "reset-role-cleanup",
        "runtime",
    ):
        annotation = safe_log_annotation(log_path, label=label)
        assert "provider secret" not in annotation
        assert '"byte_count":33' in annotation
        assert '"sha256":' in annotation


def test_api_log_annotation_emits_only_fixed_metadata(tmp_path) -> None:
    secret = (
        b"Bearer sk-live-ABC123\n"
        b"postgresql://user:password@database.example/erp\n"
        b'{"customer":"Private Patient","amount":"999999.99"}\n%0A'
    )
    log_path = tmp_path / "api.log"
    log_path.write_bytes(secret)

    annotation = safe_log_annotation(log_path, label="runtime")
    metadata = json.loads(annotation.split("::", 2)[2])

    assert annotation.startswith("::error title=Canonical CI API runtime diagnostic::")
    assert metadata == {
        "byte_count": len(secret),
        "sha256": hashlib.sha256(secret).hexdigest(),
    }
    for forbidden in ("Bearer", "sk-live", "postgresql", "password", "Patient", "999999"):
        assert forbidden not in annotation


def test_log_fingerprint_streams_large_content_without_echoing_it(tmp_path) -> None:
    content = b"private-token-" * 200_000
    log_path = tmp_path / "large-api.log"
    log_path.write_bytes(content)

    with log_path.open("rb") as stream:
        summary = fingerprint_stream(stream)

    assert summary == {
        "byte_count": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
    }
    assert "private-token" not in json.dumps(summary)


def test_render_annotation_exposes_only_allowlisted_contract_diagnostic(tmp_path) -> None:
    log_path = tmp_path / "render.log"
    log_path.write_text(
        "provisioning blocked: Existing aasopharma-api-pilot has unreviewed "
        "environment keys: OLD_FLAG, UNUSED_KEY\n"
        "Bearer secret-must-not-escape\n",
        encoding="utf-8",
    )

    annotation = safe_log_annotation(log_path, label="evidence-key")
    metadata = json.loads(annotation.split("::", 2)[2])

    assert metadata["diagnostic"] == (
        "unreviewed_environment_keys:aasopharma-api-pilot:OLD_FLAG,UNUSED_KEY"
    )
    assert "secret-must-not-escape" not in annotation


def test_render_annotation_classifies_evidence_key_failure_without_echoing_it(
    tmp_path,
) -> None:
    log_path = tmp_path / "evidence-key.log"
    log_path.write_text(
        "evidence storage key provisioning blocked: Supabase Management API "
        "GET /projects/private/api-keys failed with HTTP 403\n"
        "sb_secret_private-must-not-escape\n",
        encoding="utf-8",
    )

    annotation = safe_log_annotation(log_path, label="render")
    metadata = json.loads(annotation.split("::", 2)[2])

    assert metadata["diagnostic"] == "evidence_storage_management_api_http_403"
    assert "private-must-not-escape" not in annotation
