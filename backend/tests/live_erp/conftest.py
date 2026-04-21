import json
import os
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import psycopg2
import pytest
import requests
from jose import jwt


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
    jwt_secret_key: str
    test_org_id: str
    test_user_id: int
    test_branch_id: int
    test_email: str
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
        jwt_secret_key=_env_required("PHARMA_LIVE_JWT_SECRET_KEY"),
        test_org_id=os.getenv("PHARMA_LIVE_TEST_ORG_ID", "e78d6777-35f6-4b19-994f-caaede2f021a"),
        test_user_id=int(os.getenv("PHARMA_LIVE_TEST_USER_ID", "8")),
        test_branch_id=int(os.getenv("PHARMA_LIVE_TEST_BRANCH_ID", "5")),
        test_email=os.getenv("PHARMA_LIVE_TEST_EMAIL", "aasopharmaceuticals@gmail.com"),
        timeout_seconds=int(os.getenv("PHARMA_LIVE_TIMEOUT_SECONDS", "30")),
    )


@pytest.fixture(scope="session")
def action_matrix() -> Dict[str, Any]:
    return json.loads(MATRIX_PATH.read_text())


@pytest.fixture(scope="session")
def live_token(live_config: LiveERPConfig) -> str:
    payload = {
        "user_id": live_config.test_user_id,
        "email": live_config.test_email,
        "org_id": live_config.test_org_id,
        "role_id": 6,
        "branch_ids": [str(live_config.test_branch_id)],
        "branch_scope": "all",
        "data_access_level": "organization",
        "is_admin": True,
        "full_name": "Live ERP Test User",
        "exp": datetime.utcnow() + timedelta(hours=4),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, live_config.jwt_secret_key, algorithm="HS256")


@pytest.fixture(scope="session")
def live_session(live_config: LiveERPConfig, live_token: str) -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "Authorization": f"Bearer {live_token}",
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
