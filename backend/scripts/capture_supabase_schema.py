#!/usr/bin/env python3
"""Capture a read-only live Supabase catalog artifact for baseline review."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence
from urllib.parse import unquote, urlparse


EXPECTED_PROJECT_REF = "jfrairkkzxwkhbtqejnz"
CAPTURE_FORMAT_VERSION = 1
REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
CAPTURE_SQL = Path(__file__).resolve().parent / "sql" / "capture_supabase_schema.sql"
DEFAULT_OUTPUT_ROOT = REPOSITORY_ROOT / "artifacts" / "live-schema-captures"
CONNECTION_ENV = "PHARMA_SCHEMA_CAPTURE_DATABASE_URL"
PASSWORD_ENV = "PGPASSWORD"
FORBIDDEN_SQL = re.compile(
    r"(?im)^\s*(?:\\|ALTER|CALL|CLUSTER|COMMENT|COPY|CREATE|DELETE|DO|DROP|"
    r"GRANT|INSERT|LISTEN|LOCK|MERGE|NOTIFY|REFRESH|REINDEX|RESET|REVOKE|"
    r"SECURITY\s+LABEL|TRUNCATE|UPDATE|VACUUM)\b"
)


class CaptureError(RuntimeError):
    """Fail-closed operator error that is safe to print."""


def validate_project_ref(project_ref: str) -> None:
    if project_ref != EXPECTED_PROJECT_REF:
        raise CaptureError(
            f"Refusing project {project_ref!r}; expected {EXPECTED_PROJECT_REF!r}"
        )


def validate_connection_url(raw_url: str, project_ref: str) -> str:
    parsed = urlparse(raw_url)
    if parsed.scheme not in {"postgres", "postgresql"} or not parsed.hostname:
        raise CaptureError(f"{CONNECTION_ENV} must be a PostgreSQL connection URL")
    if parsed.password is not None:
        raise CaptureError(
            f"{CONNECTION_ENV} must not contain a password; provide it only via {PASSWORD_ENV}"
        )
    hostname = parsed.hostname.lower()
    username = unquote(parsed.username or "")
    direct_host = hostname == f"db.{project_ref}.supabase.co"
    pooler_host = hostname.endswith(".pooler.supabase.com")
    pooler_user = username.endswith(f".{project_ref}")
    if not (direct_host or (pooler_host and pooler_user)):
        raise CaptureError(
            f"Connection URL does not identify expected project {project_ref!r}"
        )
    if parsed.path not in {"", "/", "/postgres"}:
        raise CaptureError("Connection URL must target the Supabase postgres database")
    if parsed.query or parsed.fragment:
        raise CaptureError("Connection URL must not contain query options or credentials")
    return raw_url


def _validate_capture_sql_text(sql: str) -> str:
    if "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;" not in sql:
        raise CaptureError("Capture SQL must begin an explicit read-only transaction")
    if "current_setting('transaction_read_only')" not in sql:
        raise CaptureError("Capture SQL must report transaction_read_only")
    for line_number, line in enumerate(sql.splitlines(), 1):
        if re.match(r"(?i)^\s*SET\b", line) and not re.match(
            r"(?i)^\s*SET\s+LOCAL\b", line
        ):
            raise CaptureError(
                f"Capture SQL contains non-local session setting at line {line_number}"
            )
    match = FORBIDDEN_SQL.search(sql)
    if match:
        line = sql.count("\n", 0, match.start()) + 1
        raise CaptureError(f"Capture SQL contains forbidden statement at line {line}")
    return sql


def validate_capture_sql(path: Path = CAPTURE_SQL) -> str:
    return _validate_capture_sql_text(path.read_text(encoding="utf-8"))


def extract_catalog_query(sql: str) -> str:
    """Return the single catalog CTE query, excluding transaction control."""
    validated_sql = _validate_capture_sql_text(sql)
    query_start = validated_sql.find("WITH selected_schemas AS (")
    query_end = validated_sql.rfind("\n\nCOMMIT;")
    if query_start < 0 or query_end < 0 or query_end <= query_start:
        raise CaptureError("Capture SQL must contain one final catalog CTE query")
    query = validated_sql[query_start:query_end].strip()
    if (
        not query.startswith("WITH selected_schemas AS (")
        or not query.endswith(";")
        or query.count(";") != 1
    ):
        raise CaptureError("Capture SQL final catalog query has an unexpected shape")
    return query


def _minimal_psql_environment(
    connection_url: str,
    password: str,
    source: Mapping[str, str],
) -> dict[str, str]:
    environment = {
        "PATH": source.get("PATH", ""),
        "PGDATABASE": connection_url,
        "PGPASSWORD": password,
        "PGSSLMODE": "require",
        "PGPASSFILE": os.devnull,
        "PGOPTIONS": (
            "-c default_transaction_read_only=on "
            "-c statement_timeout=120000 -c lock_timeout=5000"
        ),
        "LC_ALL": "C",
    }
    if source.get("HOME"):
        environment["HOME"] = source["HOME"]
    return environment


def _validate_payload(raw_payload: Any) -> dict:
    if isinstance(raw_payload, dict):
        payload = raw_payload
    else:
        try:
            payload = json.loads(raw_payload)
        except (json.JSONDecodeError, TypeError) as error:
            raise CaptureError("Capture did not return one valid JSON document") from error
    if payload.get("transaction_read_only") != "on":
        raise CaptureError("Remote transaction did not prove read-only mode; artifact discarded")
    if payload.get("capture_format_version") != CAPTURE_FORMAT_VERSION:
        raise CaptureError("Unexpected live capture format version")
    return payload


def run_capture(
    *,
    psql: str,
    connection_url: str,
    password: str,
) -> dict:
    command = [
        psql,
        "--no-psqlrc",
        "--no-password",
        "--quiet",
        "--tuples-only",
        "--no-align",
        "--set=ON_ERROR_STOP=1",
        "--file",
        str(CAPTURE_SQL),
    ]
    result = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        env=_minimal_psql_environment(connection_url, password, os.environ),
    )
    if result.returncode != 0:
        raise CaptureError(
            "Read-only psql capture failed; remote error output is suppressed to protect credentials"
        )
    return _validate_payload(result.stdout.strip())


def _load_psycopg2() -> Any:
    try:
        import psycopg2
    except ImportError:
        raise CaptureError("psql or the pinned psycopg2 driver is required") from None
    return psycopg2


def run_psycopg2_capture(
    *,
    psycopg2_module: Any,
    connection_url: str,
    password: str,
) -> dict:
    """Run the validated catalog query through a read-only psycopg2 session."""
    catalog_query = extract_catalog_query(validate_capture_sql())
    connection = None
    cursor = None
    try:
        connection = psycopg2_module.connect(
            connection_url,
            password=password,
            sslmode="require",
            connect_timeout=15,
            options=(
                "-c default_transaction_read_only=on "
                "-c statement_timeout=120000 -c lock_timeout=5000"
            ),
        )
        connection.set_session(
            readonly=True,
            autocommit=False,
            isolation_level="REPEATABLE READ",
        )
        cursor = connection.cursor()
        cursor.execute(catalog_query)
        row = cursor.fetchone()
        if not row or len(row) != 1:
            raise CaptureError("Capture did not return one valid JSON document")
        return _validate_payload(row[0])
    except CaptureError:
        raise
    except Exception:
        raise CaptureError(
            "Read-only psycopg2 capture failed; remote error output is suppressed to protect credentials"
        ) from None
    finally:
        if cursor is not None:
            try:
                cursor.close()
            except Exception:
                pass
        if connection is not None:
            try:
                connection.rollback()
            except Exception:
                pass
            try:
                connection.close()
            except Exception:
                pass


def write_artifacts(payload: dict, project_ref: str, output_root: Path) -> tuple[Path, Path, Path]:
    output_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    stem = f"supabase-{project_ref}-{timestamp}"
    artifact_path = output_root / f"{stem}.json"
    checksum_path = output_root / f"{stem}.sha256"
    metadata_path = output_root / f"{stem}.metadata.json"
    if any(path.exists() for path in (artifact_path, checksum_path, metadata_path)):
        raise CaptureError("Refusing to overwrite an existing live schema capture")

    artifact_bytes = (json.dumps(payload, indent=2, sort_keys=True) + "\n").encode("utf-8")
    checksum = hashlib.sha256(artifact_bytes).hexdigest()
    sql_checksum = hashlib.sha256(CAPTURE_SQL.read_bytes()).hexdigest()
    counts = {
        key: len(payload.get(key, []))
        for key in (
            "tables", "columns", "constraints", "indexes", "policies",
            "triggers", "functions", "enums", "table_grants",
            "routine_grants", "migration_history",
        )
    }
    metadata = {
        "capture_format_version": CAPTURE_FORMAT_VERSION,
        "project_ref": project_ref,
        "captured_at": payload.get("captured_at"),
        "artifact": artifact_path.name,
        "artifact_sha256": checksum,
        "capture_sql_sha256": sql_checksum,
        "transaction_read_only": payload.get("transaction_read_only"),
        "counts": counts,
    }

    artifact_path.write_bytes(artifact_bytes)
    artifact_path.chmod(0o600)
    checksum_path.write_text(f"{checksum}  {artifact_path.name}\n", encoding="ascii")
    checksum_path.chmod(0o600)
    metadata_path.write_text(
        json.dumps(metadata, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    metadata_path.chmod(0o600)
    return artifact_path, checksum_path, metadata_path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-ref", required=True)
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Validate the command and environment without opening a network connection.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        validate_project_ref(args.project_ref)
        validate_capture_sql()
        raw_url = os.environ.get(CONNECTION_ENV, "")
        if not raw_url:
            raise CaptureError(f"{CONNECTION_ENV} is required")
        connection_url = validate_connection_url(raw_url, args.project_ref)
        if PASSWORD_ENV not in os.environ or not os.environ[PASSWORD_ENV]:
            raise CaptureError(f"{PASSWORD_ENV} is required and must be operator-supplied")
        if args.validate_only:
            print(
                f"Validated read-only capture for project {args.project_ref}; no connection opened"
            )
            return 0

        psql = shutil.which("psql")
        psycopg2_module = None if psql else _load_psycopg2()
        if psql:
            payload = run_capture(
                psql=psql,
                connection_url=connection_url,
                password=os.environ[PASSWORD_ENV],
            )
        else:
            payload = run_psycopg2_capture(
                psycopg2_module=psycopg2_module,
                connection_url=connection_url,
                password=os.environ[PASSWORD_ENV],
            )
        paths = write_artifacts(payload, args.project_ref, DEFAULT_OUTPUT_ROOT)
    except (CaptureError, OSError) as error:
        print(f"Schema capture blocked: {error}", file=sys.stderr)
        return 2

    for path in paths:
        print(path.relative_to(REPOSITORY_ROOT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
