from __future__ import annotations

import hashlib
import json

from scripts.safe_ci_log_summary import fingerprint_stream, safe_log_annotation


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
