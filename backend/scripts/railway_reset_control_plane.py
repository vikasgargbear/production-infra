#!/usr/bin/env python3
"""Execute canonical reset controls inside Railway's IPv6 boundary.

The GitHub runner transports one bounded JSON request over Railway SSH.  This
module performs database work only through Supabase's direct IPv6 endpoint and
returns credential-free receipts.  Before the exact deployment exists, the
workflow uploads a hash-verified archive of the reviewed commit and executes
this module from that archive.  After deployment, it executes the packaged
copy and also verifies Railway's exact-SHA provenance.
"""

from __future__ import annotations

import argparse
import contextlib
from dataclasses import asdict
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
from typing import Any, Iterator, Mapping

import psycopg2

SCRIPT_DIRECTORY = Path(__file__).resolve().parent
BACKEND_DIRECTORY = SCRIPT_DIRECTORY.parent
if str(BACKEND_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIRECTORY))
if str(SCRIPT_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIRECTORY))

from app.infrastructure.evidence_storage_credentials import (  # noqa: E402
    EvidenceCredentialConfig,
    EvidenceServiceTokenProvider,
)
from cleanup_staging_evidence_storage import (  # noqa: E402
    _write_receipt as write_evidence_cleanup_receipt,
    close_writer_authority,
    execute_fenced_cleanup,
    load_inventory,
    open_writer_authority,
    validated_cleanup_keys,
)
from provision_canonical_evidence_storage_identity import (  # noqa: E402
    main as provision_evidence_identity,
)
from railway_canonical_reset import (  # noqa: E402
    CONTROL_TRANSPORT_RAILWAY_IPV6,
    RailwayCanonicalResetError,
    _admin_database_url,
    close_fence_after_failure,
    open_fence_after_deploy,
    prepare_reset_boundary,
    reset_disposable_staging,
)


REQUEST_SCHEMA = "aasopharma.railway-reset-control-request.v1"
RESPONSE_SCHEMA = "aasopharma.railway-reset-control-response.v1"
SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$")
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
NONCE_PATTERN = re.compile(r"^[0-9a-f]{64}$")
UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)
MAX_REQUEST_BYTES = 64 * 1024
DEPLOYED_PROVENANCE = Path("/app/.railway-deployment-provenance")
RESET_SECRET_KEYS = {
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_ANON_KEY",
    "SUPABASE_DB_PASSWORD",
}
FENCE_SECRET_KEYS = {"SUPABASE_DB_PASSWORD"}


class RailwayResetControlError(RuntimeError):
    """The bounded Railway reset control request failed closed."""


def _required_text(mapping: Mapping[str, Any], key: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or not value.strip():
        raise RailwayResetControlError(f"{key} is required")
    normalized = value.strip()
    if normalized != value or "\n" in value or "\r" in value:
        raise RailwayResetControlError(f"{key} is malformed")
    return normalized


def _read_request(path: str) -> dict[str, Any]:
    raw = (
        sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1)
        if path == "-"
        else Path(path).read_bytes()
    )
    if not raw or len(raw) > MAX_REQUEST_BYTES:
        raise RailwayResetControlError("Railway reset request size is invalid")
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RailwayResetControlError("Railway reset request is not JSON") from error
    if not isinstance(value, dict) or value.get("schema") != REQUEST_SCHEMA:
        raise RailwayResetControlError("Railway reset request schema is invalid")
    return value


def _execution_boundary(
    request: Mapping[str, Any], *, attest_execution_host: bool = True
) -> dict[str, str]:
    expected_sha = _required_text(request, "expected_sha")
    request_nonce = _required_text(request, "request_nonce")
    deployment_id = _required_text(request, "deployment_id")
    deployment_instance_id = _required_text(request, "deployment_instance_id")
    host_deployed_sha = _required_text(request, "host_deployed_sha")
    if SHA_PATTERN.fullmatch(expected_sha) is None or SHA_PATTERN.fullmatch(
        host_deployed_sha
    ) is None:
        raise RailwayResetControlError("expected_sha is not an exact commit SHA")
    if NONCE_PATTERN.fullmatch(request_nonce) is None:
        raise RailwayResetControlError("request_nonce is invalid")
    if UUID_PATTERN.fullmatch(deployment_id) is None or UUID_PATTERN.fullmatch(
        deployment_instance_id
    ) is None:
        raise RailwayResetControlError("Railway deployment identity is invalid")

    source = _required_text(request, "execution_source")
    source_archive_sha256 = str(request.get("source_archive_sha256", ""))
    ambient_deployed_sha = os.getenv("RAILWAY_GIT_COMMIT_SHA", "").strip().lower()
    if attest_execution_host and ambient_deployed_sha != host_deployed_sha:
        raise RailwayResetControlError(
            "Railway execution host differs from the pinned deployment SHA"
        )
    if source == "reviewed_source_archive":
        if SHA256_PATTERN.fullmatch(source_archive_sha256) is None:
            raise RailwayResetControlError("reviewed source archive hash is invalid")
        if attest_execution_host:
            source_root = BACKEND_DIRECTORY.parent
            archive_path = source_root.parent / "source.tar.gz"
            try:
                observed_archive_sha256 = hashlib.sha256(
                    archive_path.read_bytes()
                ).hexdigest()
            except OSError as error:
                raise RailwayResetControlError(
                    "reviewed source archive is unavailable beside the extracted source"
                ) from error
            if observed_archive_sha256 != source_archive_sha256:
                raise RailwayResetControlError(
                    "executing source differs from the hash-verified reviewed archive"
                )
    elif source == "exact_railway_deployment":
        if source_archive_sha256:
            raise RailwayResetControlError(
                "exact deployment request must not claim a source archive"
            )
        marker_sha = expected_sha
        if attest_execution_host:
            try:
                marker = DEPLOYED_PROVENANCE.read_text(encoding="utf-8").strip()
            except OSError as error:
                raise RailwayResetControlError(
                    "exact Railway provenance marker is unavailable"
                ) from error
            marker_sha = marker.split(":", 1)[0]
        if host_deployed_sha != expected_sha or marker_sha != expected_sha:
            raise RailwayResetControlError(
                "running Railway deployment differs from the reviewed SHA"
            )
    else:
        raise RailwayResetControlError("execution_source is unsupported")
    return {
        "expected_sha": expected_sha,
        "request_nonce": request_nonce,
        "deployment_id": deployment_id,
        "deployment_instance_id": deployment_instance_id,
        "host_deployed_sha": host_deployed_sha,
        "execution_source": source,
        "source_archive_sha256": source_archive_sha256,
    }


def _secret_environment(
    request: Mapping[str, Any], expected_keys: set[str]
) -> dict[str, str]:
    supplied = request.get("secrets")
    if not isinstance(supplied, dict) or set(supplied) != expected_keys:
        raise RailwayResetControlError("Railway reset secret set is invalid")
    return {name: _required_text(supplied, name) for name in expected_keys}


@contextlib.contextmanager
def _temporary_environment(values: Mapping[str, str]) -> Iterator[None]:
    prior = {name: os.environ.get(name) for name in values}
    try:
        os.environ.update(values)
        yield
    finally:
        for name, value in prior.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value


def _request_arguments(request: Mapping[str, Any]) -> dict[str, str]:
    return {
        "expected_sha": _required_text(request, "expected_sha"),
        "project_ref": _required_text(request, "project_ref"),
        "production_project_refs": _required_text(
            request, "production_project_refs"
        ),
    }


def _parse_environment_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        name, separator, value = line.partition("=")
        if not separator or not name or "\n" in value or "\r" in value:
            raise RailwayResetControlError(
                "evidence identity environment output is malformed"
            )
        values[name] = value
    return values


def _evidence_cleanup(
    request: Mapping[str, Any], secrets: Mapping[str, str]
) -> dict[str, Any]:
    project_ref = _required_text(request, "project_ref")
    database_url, transport = _admin_database_url(
        password=secrets["SUPABASE_DB_PASSWORD"],
        application_name="canonical_railway_evidence_cleanup",
        control_transport=CONTROL_TRANSPORT_RAILWAY_IPV6,
    )
    with contextlib.closing(
        psycopg2.connect(database_url, connect_timeout=20)
    ) as probe_connection:
        inventory = load_inventory(probe_connection)
        cleanup_keys = validated_cleanup_keys(inventory)

    with tempfile.TemporaryDirectory(prefix="canonical-railway-evidence-") as raw:
        directory = Path(raw)
        environment_file = directory / "identity.env"
        environment_file.touch(mode=0o600)
        identity_receipt_path = directory / "identity.json"
        cleanup_receipt_path = directory / "cleanup.json"
        environment = {
            **secrets,
            "CANONICAL_STAGING_PROJECT_REF": project_ref,
            "SUPABASE_URL": f"https://{project_ref}.supabase.co",
            "PSYCOPG_DATABASE_URL": database_url,
            "GITHUB_ACTIONS": "false",
            "GITHUB_RUN_ID": _required_text(request, "run_id"),
            "GITHUB_RUN_ATTEMPT": _required_text(request, "run_attempt"),
        }
        identity_receipt: dict[str, Any] | None = None
        if cleanup_keys:
            with _temporary_environment(environment), contextlib.redirect_stdout(
                sys.stderr
            ):
                result = provision_evidence_identity(
                    [
                        "--phase",
                        "prepare",
                        "--project-ref",
                        project_ref,
                        "--reviewed-sha",
                        _required_text(request, "expected_sha"),
                        "--github-env",
                        str(environment_file),
                        "--receipt",
                        str(identity_receipt_path),
                    ]
                )
            if result != 0:
                raise RailwayResetControlError(
                    "evidence storage identity preparation did not complete"
                )
            identity_receipt = json.loads(
                identity_receipt_path.read_text(encoding="utf-8")
            )
            environment.update(_parse_environment_file(environment_file))

        connection = psycopg2.connect(database_url, connect_timeout=20)
        try:
            def token_provider() -> EvidenceServiceTokenProvider:
                config = EvidenceCredentialConfig.from_environment(
                    base_url=f"https://{project_ref}.supabase.co",
                    project_ref=project_ref,
                )
                return EvidenceServiceTokenProvider(config)

            with _temporary_environment(environment):
                cleanup_receipt = execute_fenced_cleanup(
                    project_ref=project_ref,
                    load_current_inventory=lambda: load_inventory(connection),
                    open_writer=lambda: open_writer_authority(connection),
                    close_writer=lambda: close_writer_authority(connection),
                    token_provider_factory=token_provider,
                )
        finally:
            connection.close()
        write_evidence_cleanup_receipt(cleanup_receipt_path, cleanup_receipt)
        receipt_bytes = cleanup_receipt_path.read_bytes()
        return {
            "transport": dict(transport),
            "identity_prepared": identity_receipt is not None,
            "identity_receipt": identity_receipt,
            "cleanup_receipt": cleanup_receipt,
            "cleanup_receipt_sha256": hashlib.sha256(receipt_bytes).hexdigest(),
            "cleanup_receipt_bytes": receipt_bytes.decode("utf-8"),
        }


def _reset_boundary(request: Mapping[str, Any]) -> dict[str, Any]:
    secrets = _secret_environment(request, RESET_SECRET_KEYS)
    arguments = _request_arguments(request)
    common = {
        **arguments,
        "password": secrets["SUPABASE_DB_PASSWORD"],
        "control_transport": CONTROL_TRANSPORT_RAILWAY_IPV6,
    }
    prepared = prepare_reset_boundary(**common)
    evidence = _evidence_cleanup(request, secrets)
    with tempfile.TemporaryDirectory(prefix="canonical-railway-reset-") as raw:
        receipt_path = Path(raw) / "evidence-cleanup.json"
        receipt_path.write_text(
            evidence.pop("cleanup_receipt_bytes"), encoding="utf-8"
        )
        receipt_path.chmod(0o600)
        reset = reset_disposable_staging(
            **common, evidence_cleanup_receipt_path=receipt_path
        )
    return {"prepared": prepared, "evidence": evidence, "reset": reset}


def _fence(request: Mapping[str, Any], *, action: str) -> dict[str, Any]:
    if action not in {"open-fence", "close-fence"}:
        raise RailwayResetControlError("Railway reset fence action is unsupported")
    secrets = _secret_environment(request, FENCE_SECRET_KEYS)
    common = {
        **_request_arguments(request),
        "password": secrets["SUPABASE_DB_PASSWORD"],
        "control_transport": CONTROL_TRANSPORT_RAILWAY_IPV6,
    }
    # Evidence Storage has its own deliberately short-lived writer grant.
    # Always close and attest it alongside the canonical fence so failure
    # compensation covers the complete database write boundary.
    if action == "open-fence":
        database_url, evidence_transport = _admin_database_url(
            password=secrets["SUPABASE_DB_PASSWORD"],
            application_name="canonical_railway_evidence_fence",
            control_transport=CONTROL_TRANSPORT_RAILWAY_IPV6,
        )
        with contextlib.closing(psycopg2.connect(database_url)) as connection:
            evidence_closure = close_writer_authority(connection)
        # Open the application boundary only after the independent Storage
        # writer is proven closed.
        result = open_fence_after_deploy(**common)
    else:
        # Compensation must attempt both independent closures even if one
        # boundary is already damaged. Return success only after both attest.
        result = None
        evidence_transport = None
        evidence_closure = None
        canonical_error: Exception | None = None
        evidence_error: Exception | None = None
        try:
            result = close_fence_after_failure(**common)
        except Exception as error:
            canonical_error = error
        try:
            database_url, evidence_transport = _admin_database_url(
                password=secrets["SUPABASE_DB_PASSWORD"],
                application_name="canonical_railway_evidence_fence",
                control_transport=CONTROL_TRANSPORT_RAILWAY_IPV6,
            )
            with contextlib.closing(psycopg2.connect(database_url)) as connection:
                evidence_closure = close_writer_authority(connection)
        except Exception as error:
            evidence_error = error
        if canonical_error is not None or evidence_error is not None:
            def safe_reason(error: Exception | None) -> str:
                if error is None:
                    return "closed"
                if isinstance(error, RailwayCanonicalResetError):
                    return str(error)
                return type(error).__name__

            raise RailwayResetControlError(
                "compound write-fence closure failed: "
                f"canonical={safe_reason(canonical_error)} "
                f"evidence={safe_reason(evidence_error)}"
            ) from (canonical_error or evidence_error)
        if result is None or evidence_transport is None or evidence_closure is None:
            raise RailwayResetControlError(
                "compound write-fence closure returned an incomplete receipt"
            )
    return {
        **result,
        "evidence_writer_closure": asdict(evidence_closure),
        "evidence_writer_transport": dict(evidence_transport),
    }


def execute(request: Mapping[str, Any], action: str) -> dict[str, Any]:
    boundary = _execution_boundary(request)
    if action == "reset-boundary":
        payload = _reset_boundary(request)
    elif action in {"open-fence", "close-fence"}:
        payload = _fence(request, action=action)
    else:  # argparse owns this branch; keep the library boundary explicit.
        raise RailwayResetControlError("Railway reset action is unsupported")
    response: dict[str, Any] = {
        "schema": RESPONSE_SCHEMA,
        "action": action,
        **boundary,
        "project_ref": _required_text(request, "project_ref"),
        "result": payload,
    }
    response["content_sha256"] = hashlib.sha256(
        (json.dumps(response, sort_keys=True, separators=(",", ":")) + "\n").encode(
            "utf-8"
        )
    ).hexdigest()
    return response


def verify_response(
    response: Mapping[str, Any], request: Mapping[str, Any], *, action: str
) -> dict[str, Any]:
    """Verify a remote response without trusting any returned boundary field."""

    if not isinstance(response, dict) or response.get("schema") != RESPONSE_SCHEMA:
        raise RailwayResetControlError("Railway reset response schema is invalid")
    expected_boundary = _execution_boundary(request, attest_execution_host=False)
    for key, expected in expected_boundary.items():
        if response.get(key) != expected:
            raise RailwayResetControlError(
                f"Railway reset response boundary differs: {key}"
            )
    if (
        response.get("action") != action
        or response.get("project_ref") != request.get("project_ref")
        or not isinstance(response.get("result"), dict)
    ):
        raise RailwayResetControlError("Railway reset response action is invalid")
    claimed_hash = response.get("content_sha256")
    unsigned = dict(response)
    unsigned.pop("content_sha256", None)
    observed_hash = hashlib.sha256(
        (json.dumps(unsigned, sort_keys=True, separators=(",", ":")) + "\n").encode(
            "utf-8"
        )
    ).hexdigest()
    if claimed_hash != observed_hash:
        raise RailwayResetControlError("Railway reset response hash is invalid")
    return dict(response)


def _write_response(response: Mapping[str, Any], path: str) -> None:
    serialized = json.dumps(response, sort_keys=True, separators=(",", ":")) + "\n"
    if path == "-":
        sys.stdout.write(serialized)
        return
    target = Path(path)
    target.write_text(serialized, encoding="utf-8")
    target.chmod(0o600)


def _safe_error(error: BaseException, request: Mapping[str, Any] | None) -> str:
    detail = str(error)
    secret_values: tuple[str, ...] = ()
    if isinstance(request, Mapping) and isinstance(request.get("secrets"), Mapping):
        secret_values = tuple(
            str(value) for value in request["secrets"].values() if value
        )
    for value in secret_values:
        detail = detail.replace(value, "[REDACTED]")
    detail = re.sub(r"sb_(?:secret|service_role)_[A-Za-z0-9._-]+", "[REDACTED]", detail)
    detail = re.sub(r"eyJ[A-Za-z0-9._-]+", "[REDACTED]", detail)
    detail = re.sub(r"postgres(?:ql)?://[^\s]+", "[REDACTED_DATABASE_URL]", detail)
    return f"{type(error).__name__}: {' '.join(detail.split())[:800]}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "action", choices=("reset-boundary", "open-fence", "close-fence")
    )
    parser.add_argument("--input", default="-")
    parser.add_argument("--output", default="-")
    arguments = parser.parse_args(argv)
    request: dict[str, Any] | None = None
    try:
        request = _read_request(arguments.input)
        _write_response(execute(request, arguments.action), arguments.output)
        return 0
    except Exception as error:
        print(f"Railway reset control failed: {_safe_error(error, request)}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
