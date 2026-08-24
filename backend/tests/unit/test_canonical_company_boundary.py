import asyncio
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.routes.org.company_assets import (
    get_company_logo,
    reject_company_mutation,
)
from app.main import app


REPO_ROOT = Path(__file__).resolve().parents[3]


class _LogoDatabase:
    def __init__(self, value_text=None):
        self.value_text = value_text
        self.statement = ""
        self.params = {}

    def execute(self, statement, params):
        self.statement = str(statement)
        self.params = params
        row = SimpleNamespace(value_text=self.value_text) if self.value_text else None
        return SimpleNamespace(first=lambda: row)


def test_company_logo_read_uses_canonical_tenant_scoped_settings():
    org_id = uuid4()
    database = _LogoDatabase("data:image/png;base64,canonical")

    result = asyncio.run(
        get_company_logo.__wrapped__(
            _={}, db=database, context=SimpleNamespace(org_id=org_id)
        )
    )

    assert result == {"success": True, "logo": "data:image/png;base64,canonical"}
    assert "FROM core.settings" in database.statement
    assert "master." not in database.statement
    assert "org_id = :org_id" in database.statement
    assert database.params == {"org_id": str(org_id)}


def test_company_mutations_fail_closed_without_database_access():
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            reject_company_mutation.__wrapped__(
                _={}, context=SimpleNamespace(org_id=uuid4())
            )
        )

    assert exc_info.value.status_code == 503
    assert "reviewed core command" in str(exc_info.value.detail)


def test_only_canonical_company_surface_is_mounted():
    paths = app.openapi()["paths"]

    assert "/api/company/info" in paths
    assert "/api/company/profile" in paths
    assert "/api/company/logo" in paths
    assert "get" in paths["/api/company/logo"]
    assert "post" in paths["/api/company/logo"]
    assert "/api/company/qr-code" in paths
    assert "/api/company/bank-accounts" not in paths
    assert "/api/company/org-id" not in paths
    assert "/api/company/test-save" not in paths


def test_retired_company_router_is_removed_from_source_tree():
    assert not (REPO_ROOT / "backend/app/api/routes/org/company.py").exists()
