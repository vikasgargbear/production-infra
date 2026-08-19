import json
import os
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import psycopg2
import pytest
import requests


MATRIX_PATH = Path(__file__).with_name("action_matrix.json")


def _with_connection_overrides(database_url: str) -> str:
    """
    Allow live test runs to pin a resolved DB IP when DNS is flaky.
    """
    hostaddr = os.getenv("PHARMA_LIVE_DATABASE_HOSTADDR")
    if not hostaddr:
        return database_url

    parsed = urlparse(database_url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.setdefault("hostaddr", hostaddr)
    return urlunparse(parsed._replace(query=urlencode(query)))


@dataclass
class LiveERPConfig:
    api_base_url: str
    database_url: str
    access_token: str
    test_org_id: str
    test_branch_id: int
    timeout_seconds: int = 30


def _env_required(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


@pytest.fixture(scope="session")
def live_config() -> LiveERPConfig:
    return LiveERPConfig(
        api_base_url=_env_required("PHARMA_LIVE_API_BASE_URL"),
        database_url=_with_connection_overrides(_env_required("PHARMA_LIVE_DATABASE_URL")),
        access_token=_env_required("PHARMA_LIVE_ACCESS_TOKEN"),
        test_org_id=_env_required("PHARMA_LIVE_TEST_ORG_ID"),
        test_branch_id=int(_env_required("PHARMA_LIVE_TEST_BRANCH_ID")),
        timeout_seconds=int(os.getenv("PHARMA_LIVE_TIMEOUT_SECONDS", "30")),
    )


@pytest.fixture(scope="session")
def action_matrix() -> Dict[str, Any]:
    return json.loads(MATRIX_PATH.read_text())


@pytest.fixture(scope="session")
def live_session(live_config: LiveERPConfig) -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "Authorization": f"Bearer {live_config.access_token}",
            "Content-Type": "application/json",
        }
    )
    session.timeout = live_config.timeout_seconds
    return session


@pytest.fixture(scope="session")
def db_conn(live_config: LiveERPConfig):
    conn = psycopg2.connect(live_config.database_url)
    conn.autocommit = True
    try:
        yield conn
    finally:
        conn.close()


@pytest.fixture(scope="session")
def db_query(db_conn):
    def _query(sql: str, params=None):
        with db_conn.cursor() as cur:
            cur.execute(sql, params or ())
            columns = [desc[0] for desc in cur.description] if cur.description else []
            rows = cur.fetchall() if cur.description else []
        return [dict(zip(columns, row)) for row in rows]

    return _query


@pytest.fixture
def db_scalar(db_query):
    def _scalar(sql: str, params=None):
        rows = db_query(sql, params)
        assert rows, f"query returned no rows: {sql}"
        first_row = rows[0]
        return next(iter(first_row.values()))

    return _scalar


@pytest.fixture(scope="session")
def api_json(live_config: LiveERPConfig, live_session: requests.Session):
    def _request(method: str, path: str, payload=None, params=None):
        response = live_session.request(
            method=method,
            url=f"{live_config.api_base_url}{path}",
            json=payload,
            params=params,
            timeout=live_config.timeout_seconds,
        )
        body: Any
        try:
            body = response.json()
        except ValueError:
            body = response.text
        return response, body

    return _request


@pytest.fixture
def unique_suffix():
    return uuid.uuid4().hex[:10]


@pytest.fixture
def wait_until():
    def _wait_until(predicate, *, timeout_seconds: int = 20, interval_seconds: float = 0.5, message: str = "condition not met"):
        deadline = time.time() + timeout_seconds
        last_value = None
        while time.time() < deadline:
            last_value = predicate()
            if last_value:
                return last_value
            time.sleep(interval_seconds)
        raise AssertionError(f"{message}; last value={last_value!r}")

    return _wait_until
