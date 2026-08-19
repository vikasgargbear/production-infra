"""Static and isolated tests for the read-only Supabase capture command."""

import hashlib
import json
import os
import stat
from pathlib import Path
from types import SimpleNamespace

import pytest

from scripts import capture_supabase_schema as capture


REPO_ROOT = Path(__file__).resolve().parents[3]


def _payload(**overrides):
    value = {
        "capture_format_version": 1,
        "captured_at": "2026-08-19T12:00:00+00:00",
        "transaction_read_only": "on",
        "tables": [],
        "columns": [],
        "constraints": [],
        "indexes": [],
        "policies": [],
        "triggers": [],
        "functions": [],
        "enums": [],
        "table_grants": [],
        "routine_grants": [],
        "migration_history": [],
    }
    value.update(overrides)
    return value


def test_command_is_pinned_to_expected_project_and_ignored_output():
    assert capture.EXPECTED_PROJECT_REF == "jfrairkkzxwkhbtqejnz"
    assert capture.DEFAULT_OUTPUT_ROOT == REPO_ROOT / "artifacts/live-schema-captures"
    assert "artifacts/live-schema-captures/" in (REPO_ROOT / ".gitignore").read_text(
        encoding="utf-8"
    )


def test_connection_url_must_identify_project_and_exclude_credentials():
    project = capture.EXPECTED_PROJECT_REF
    direct = f"postgresql://postgres@db.{project}.supabase.co:5432/postgres"
    pooler = f"postgresql://postgres.{project}@aws-0-region.pooler.supabase.com:6543/postgres"

    assert capture.validate_connection_url(direct, project) == direct
    assert capture.validate_connection_url(pooler, project) == pooler
    with pytest.raises(capture.CaptureError, match="expected project"):
        capture.validate_connection_url(
            "postgresql://postgres@db.wrongref.supabase.co/postgres", project
        )
    with pytest.raises(capture.CaptureError, match="expected project"):
        capture.validate_connection_url(
            f"postgresql://postgres@evil-{project}.example.com/postgres", project
        )
    with pytest.raises(capture.CaptureError, match="postgres database"):
        capture.validate_connection_url(
            f"postgresql://postgres@db.{project}.supabase.co/other", project
        )
    with pytest.raises(capture.CaptureError, match="must not contain a password"):
        capture.validate_connection_url(
            f"postgresql://postgres:secret@db.{project}.supabase.co/postgres", project
        )
    with pytest.raises(capture.CaptureError, match="query options or credentials"):
        capture.validate_connection_url(
            f"postgresql://postgres@db.{project}.supabase.co/postgres?token=secret",
            project,
        )


def test_capture_sql_is_static_read_only_catalog_query(tmp_path: Path):
    sql = capture.validate_capture_sql()

    assert "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;" in sql
    assert "transaction_read_only" in sql
    assert not capture.FORBIDDEN_SQL.search(sql)

    unsafe = tmp_path / "unsafe.sql"
    unsafe.write_text(
        "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"
        "SELECT current_setting('transaction_read_only');\n"
        "UPDATE sales.invoices SET invoice_status = 'paid';\n",
        encoding="utf-8",
    )
    with pytest.raises(capture.CaptureError, match="forbidden statement"):
        capture.validate_capture_sql(unsafe)

    unsafe.write_text(
        "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"
        "SELECT current_setting('transaction_read_only');\n"
        "SET statement_timeout = '1s';\n",
        encoding="utf-8",
    )
    with pytest.raises(capture.CaptureError, match="non-local session setting"):
        capture.validate_capture_sql(unsafe)


def test_psql_invocation_is_read_only_and_does_not_expose_connection(monkeypatch):
    project = capture.EXPECTED_PROJECT_REF
    connection = f"postgresql://postgres@db.{project}.supabase.co/postgres"
    observed = {}

    def fake_run(command, **kwargs):
        observed["command"] = command
        observed["env"] = kwargs["env"]
        return SimpleNamespace(
            returncode=0,
            stdout=json.dumps(_payload()),
            stderr="",
        )

    monkeypatch.setattr(capture.subprocess, "run", fake_run)
    monkeypatch.setenv("SUPABASE_ACCESS_TOKEN", "must-not-propagate")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "must-not-propagate")

    result = capture.run_capture(
        psql="/usr/bin/psql",
        connection_url=connection,
        password="database-password",
    )

    assert result["transaction_read_only"] == "on"
    assert observed["command"][0] == "/usr/bin/psql"
    assert connection not in observed["command"]
    assert "--no-psqlrc" in observed["command"]
    assert "--no-password" in observed["command"]
    assert observed["env"]["PGDATABASE"] == connection
    assert observed["env"]["PGPASSWORD"] == "database-password"
    assert observed["env"]["PGSSLMODE"] == "require"
    assert "default_transaction_read_only=on" in observed["env"]["PGOPTIONS"]
    assert observed["env"]["PGPASSFILE"] == os.devnull
    assert "SUPABASE_ACCESS_TOKEN" not in observed["env"]
    assert "SUPABASE_SERVICE_ROLE_KEY" not in observed["env"]


def test_capture_is_discarded_without_remote_read_only_proof(monkeypatch):
    monkeypatch.setattr(
        capture.subprocess,
        "run",
        lambda *_args, **_kwargs: SimpleNamespace(
            returncode=0,
            stdout=json.dumps(_payload(transaction_read_only="off")),
            stderr="",
        ),
    )

    with pytest.raises(capture.CaptureError, match="did not prove read-only"):
        capture.run_capture(
            psql="psql",
            connection_url=(
                "postgresql://postgres@db."
                f"{capture.EXPECTED_PROJECT_REF}.supabase.co/postgres"
            ),
            password="secret",
        )


def test_psycopg2_fallback_is_read_only_and_executes_only_catalog_select(capsys):
    project = capture.EXPECTED_PROJECT_REF
    connection_url = f"postgresql://postgres@db.{project}.supabase.co/postgres"
    password = "database-password-must-not-be-logged"
    observed = {"queries": []}

    class FakeCursor:
        def execute(self, query):
            observed["queries"].append(query)

        def fetchone(self):
            return (_payload(),)

        def close(self):
            observed["cursor_closed"] = True

    class FakeConnection:
        def set_session(self, **kwargs):
            observed["session"] = kwargs

        def cursor(self):
            return FakeCursor()

        def rollback(self):
            observed["rolled_back"] = True

        def close(self):
            observed["connection_closed"] = True

    def fake_connect(dsn, **kwargs):
        observed["dsn"] = dsn
        observed["connect_kwargs"] = kwargs
        return FakeConnection()

    result = capture.run_psycopg2_capture(
        psycopg2_module=SimpleNamespace(connect=fake_connect),
        connection_url=connection_url,
        password=password,
    )

    expected_query = capture.extract_catalog_query(capture.validate_capture_sql())
    assert result["transaction_read_only"] == "on"
    assert observed["dsn"] == connection_url
    assert password not in observed["dsn"]
    assert observed["connect_kwargs"]["password"] == password
    assert observed["connect_kwargs"]["sslmode"] == "require"
    assert "default_transaction_read_only=on" in observed["connect_kwargs"]["options"]
    assert observed["session"] == {
        "readonly": True,
        "autocommit": False,
        "isolation_level": "REPEATABLE READ",
    }
    assert observed["queries"] == [expected_query]
    assert expected_query.startswith("WITH selected_schemas AS (")
    assert "BEGIN TRANSACTION" not in expected_query
    assert "SET LOCAL" not in expected_query
    assert "COMMIT" not in expected_query
    assert observed["rolled_back"] is True
    assert observed["cursor_closed"] is True
    assert observed["connection_closed"] is True
    captured = capsys.readouterr()
    assert password not in captured.out
    assert password not in captured.err


def test_psycopg2_error_output_is_suppressed():
    password = "database-password-must-not-escape"

    def fail_connect(*_args, **_kwargs):
        raise RuntimeError(f"remote error echoed {password}")

    with pytest.raises(capture.CaptureError) as error:
        capture.run_psycopg2_capture(
            psycopg2_module=SimpleNamespace(connect=fail_connect),
            connection_url=(
                "postgresql://postgres@db."
                f"{capture.EXPECTED_PROJECT_REF}.supabase.co/postgres"
            ),
            password=password,
        )

    assert password not in str(error.value)
    assert "remote error output is suppressed" in str(error.value)


def test_psycopg2_capture_is_discarded_without_remote_read_only_proof():
    class FakeCursor:
        def execute(self, _query):
            pass

        def fetchone(self):
            return (_payload(transaction_read_only="off"),)

        def close(self):
            pass

    connection = SimpleNamespace(
        set_session=lambda **_kwargs: None,
        cursor=lambda: FakeCursor(),
        rollback=lambda: None,
        close=lambda: None,
    )

    with pytest.raises(capture.CaptureError, match="did not prove read-only"):
        capture.run_psycopg2_capture(
            psycopg2_module=SimpleNamespace(connect=lambda *_args, **_kwargs: connection),
            connection_url=(
                "postgresql://postgres@db."
                f"{capture.EXPECTED_PROJECT_REF}.supabase.co/postgres"
            ),
            password="secret",
        )


def test_artifact_checksum_and_metadata_contain_no_credentials(tmp_path: Path):
    payload = _payload(tables=[{"table_schema": "sales", "table_name": "invoices"}])
    artifact, checksum, metadata = capture.write_artifacts(
        payload, capture.EXPECTED_PROJECT_REF, tmp_path
    )

    artifact_bytes = artifact.read_bytes()
    digest = hashlib.sha256(artifact_bytes).hexdigest()
    metadata_value = json.loads(metadata.read_text(encoding="utf-8"))
    assert checksum.read_text(encoding="ascii") == f"{digest}  {artifact.name}\n"
    assert metadata_value["artifact_sha256"] == digest
    assert metadata_value["project_ref"] == capture.EXPECTED_PROJECT_REF
    assert metadata_value["transaction_read_only"] == "on"
    assert metadata_value["counts"]["tables"] == 1
    assert "password" not in metadata.read_text(encoding="utf-8").lower()
    for path in (artifact, checksum, metadata):
        assert stat.S_IMODE(path.stat().st_mode) == 0o600


def test_validate_only_never_opens_a_connection(monkeypatch, capsys):
    project = capture.EXPECTED_PROJECT_REF
    monkeypatch.setenv(
        capture.CONNECTION_ENV,
        f"postgresql://postgres@db.{project}.supabase.co/postgres",
    )
    monkeypatch.setenv(capture.PASSWORD_ENV, "secret")
    monkeypatch.setattr(capture.shutil, "which", lambda _name: "/usr/bin/psql")
    monkeypatch.setattr(
        capture.subprocess,
        "run",
        lambda *_args, **_kwargs: pytest.fail("validate-only must not invoke psql"),
    )

    assert capture.main(["--project-ref", project, "--validate-only"]) == 0
    assert "no connection opened" in capsys.readouterr().out


def test_validate_only_with_psycopg2_fallback_never_opens_connection(monkeypatch, capsys):
    project = capture.EXPECTED_PROJECT_REF
    monkeypatch.setenv(
        capture.CONNECTION_ENV,
        f"postgresql://postgres@db.{project}.supabase.co/postgres",
    )
    monkeypatch.setenv(capture.PASSWORD_ENV, "secret")
    monkeypatch.setattr(capture.shutil, "which", lambda _name: None)

    monkeypatch.setattr(
        capture,
        "_load_psycopg2",
        lambda: pytest.fail("validate-only must not load psycopg2"),
    )

    assert capture.main(["--project-ref", project, "--validate-only"]) == 0
    assert "no connection opened" in capsys.readouterr().out


def test_capture_source_never_invokes_supabase_cli_or_pull_push():
    source = Path(capture.__file__).read_text(encoding="utf-8").lower()

    assert "supabase_access_token" not in source
    assert "supabase_service_role_key" not in source
    assert "supabase db pull" not in source
    assert "supabase db push" not in source
    assert "db pull" not in source
    assert "db push" not in source
