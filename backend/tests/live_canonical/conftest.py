from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import psycopg2
import pytest

from .config import CanonicalLiveConfig, load_live_config
from .reconciliation import CanonicalReconciler
from .transport import McpActionClient, RestActionClient


MATRIX_PATH = Path(__file__).with_name("scenario_matrix.json")
FORBIDDEN_CLIENT_TAX_FIELDS = {
    "gst_rate",
    "cess_rate",
    "cgst_rate",
    "sgst_rate",
    "igst_rate",
    "cgst_amount",
    "sgst_amount",
    "igst_amount",
    "cess_amount",
    "tax_amount",
    "tax_rule_id",
    "withholding_rate",
    "withheld_amount",
}


def _scan_forbidden(value: Any, path: str = "payload") -> None:
    if isinstance(value, dict):
        forbidden = FORBIDDEN_CLIENT_TAX_FIELDS.intersection(value)
        if forbidden:
            raise AssertionError(f"{path} supplies backend-owned tax fields: {sorted(forbidden)}")
        for key, child in value.items():
            _scan_forbidden(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _scan_forbidden(child, f"{path}[{index}]")


def _success_steps(matrix: dict[str, Any]) -> list[dict[str, Any]]:
    return [step for journey in matrix["journeys"] for step in journey["steps"]]


def _prepare_rejections(matrix: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        probe
        for probe in matrix["expected_rejections"]
        if probe["phase"] == "prepare"
    ]


@pytest.fixture(scope="session")
def canonical_live_config() -> CanonicalLiveConfig:
    # The entire environment gate is evaluated before sessions or DB connections exist.
    return load_live_config()


@pytest.fixture(scope="session")
def scenario_matrix() -> dict[str, Any]:
    return json.loads(MATRIX_PATH.read_text())


@pytest.fixture(scope="session")
def fixture_inputs(canonical_live_config: CanonicalLiveConfig, scenario_matrix):
    path = canonical_live_config.fixture_input_path
    if not path.is_file():
        raise AssertionError(f"canonical fixture input pack does not exist: {path}")
    pack = json.loads(path.read_text())
    if pack.get("schema_version") != scenario_matrix["schema_version"]:
        raise AssertionError(
            "fixture input pack schema_version does not match scenario matrix"
        )
    expected_steps = {
        entry["id"]
        for entry in [
            *_success_steps(scenario_matrix),
            *_prepare_rejections(scenario_matrix),
        ]
    }
    actual_steps = set(pack.get("steps", {}))
    missing = sorted(expected_steps - actual_steps)
    extra = sorted(actual_steps - expected_steps)
    if missing or extra:
        raise AssertionError(
            f"fixture input pack step set drifted; missing={missing}, extra={extra}"
        )
    for step_id, entry in pack["steps"].items():
        if not isinstance(entry, dict) or not isinstance(entry.get("payload"), dict):
            raise AssertionError(f"fixture step {step_id} must contain an object payload")
        _scan_forbidden(entry["payload"], f"steps.{step_id}.payload")
    return pack


@pytest.fixture(scope="session")
def db_connection(canonical_live_config: CanonicalLiveConfig):
    if canonical_live_config.database_url is None:
        raise AssertionError(
            "direct database fixtures are unavailable when captured database evidence is selected"
        )
    connection = psycopg2.connect(canonical_live_config.database_url)
    connection.set_session(readonly=True, autocommit=False)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT current_user, role.rolsuper, role.rolbypassrls
                  FROM pg_catalog.pg_roles role
                 WHERE role.rolname=current_user
                """
            )
            current_user, is_superuser, bypasses_rls = cursor.fetchone()
        connection.rollback()
        if current_user != "erp_runtime" or is_superuser or bypasses_rls:
            raise AssertionError(
                "canonical reconciliation requires exact non-owner erp_runtime without RLS bypass"
            )
        yield connection
    finally:
        connection.close()


@pytest.fixture(scope="session")
def db_query_as_context(db_connection):
    def query_as(auth_user_id, organization_id, sql: str, params: tuple[Any, ...] = ()):
        try:
            with db_connection.cursor() as cursor:
                cursor.execute(
                    "SELECT erp_security.activate_context(%s::uuid, %s::uuid)",
                    (str(auth_user_id), str(organization_id)),
                )
                cursor.execute(sql, params)
                columns = (
                    [item[0] for item in cursor.description]
                    if cursor.description
                    else []
                )
                rows = (
                    [dict(zip(columns, row)) for row in cursor.fetchall()]
                    if columns
                    else []
                )
            db_connection.rollback()
            return rows
        except Exception:
            db_connection.rollback()
            raise

    return query_as


@pytest.fixture(scope="session")
def db_query(db_query_as_context, canonical_live_config):
    def query(sql: str, params: tuple[Any, ...] = ()):
        return db_query_as_context(
            canonical_live_config.test_auth_user_id,
            canonical_live_config.test_org_id,
            sql,
            params,
        )

    return query


@pytest.fixture(scope="session")
def denial_db_query(db_query_as_context, canonical_live_config):
    def query(sql: str, params: tuple[Any, ...] = ()):
        return db_query_as_context(
            canonical_live_config.test_auth_user_id,
            canonical_live_config.denial_org_id,
            sql,
            params,
        )

    return query


@pytest.fixture(scope="session")
def rest_client(canonical_live_config):
    return RestActionClient.build(canonical_live_config)


@pytest.fixture(scope="session")
def mcp_client(canonical_live_config):
    return McpActionClient.build(canonical_live_config)


@pytest.fixture(scope="session")
def live_preflight(rest_client, db_query, canonical_live_config, scenario_matrix):
    readiness = rest_client.ready()
    unavailable = set(
        scenario_matrix["readiness_contract"]["unavailable_prepare_operations"]
    )
    if unavailable:
        assert readiness.get("status") == "blocked"
        failure = readiness.get("failure", {})
        assert failure.get("code") == "POLICY_BLOCKED"
        assert "baseline deployment is not verified" not in failure.get("message", "")
        missing = failure.get("metadata", {}).get("missing_adapters")
        assert set(missing or ()) == unavailable
    else:
        assert readiness.get("status") == "ready", "canonical action boundary is not ready"
        registered = readiness.get("registered_operations")
        assert isinstance(registered, list) and registered, "readiness omitted operations"
    reconciler = CanonicalReconciler(db_query, str(canonical_live_config.test_org_id))
    reconciler.assert_disposable_target()
    return readiness


@pytest.fixture(scope="session")
def reconciler(db_query, canonical_live_config, live_preflight):
    return CanonicalReconciler(db_query, str(canonical_live_config.test_org_id))
