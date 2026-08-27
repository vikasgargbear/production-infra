import asyncio
import inspect
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.routes.org.company_assets import (
    get_company_logo,
    reject_company_mutation,
)
from app.api.routes.org import company_assets
from app.main import app


REPO_ROOT = Path(__file__).resolve().parents[3]


class _LogoDatabase:
    def __init__(self, value_text=None):
        self.value_text = value_text
        self.calls = []

    def execute(self, statement, params):
        self.calls.append((str(statement), params))
        row = SimpleNamespace(value_text=self.value_text) if self.value_text else None
        return SimpleNamespace(first=lambda: row)


def test_company_logo_read_uses_canonical_tenant_scoped_settings():
    org_id = uuid4()
    auth_user_id = uuid4()
    database = _LogoDatabase("data:image/png;base64,canonical")

    result = asyncio.run(
        get_company_logo(
            user={"org_id": str(org_id), "auth_user_id": str(auth_user_id)},
            db=database,
        )
    )

    assert result == {"success": True, "logo": "data:image/png;base64,canonical"}
    assert len(database.calls) == 2
    activation_sql, activation_params = database.calls[0]
    assert "erp_security.activate_context(:auth_user_id, :org_id)" in activation_sql
    assert activation_params["auth_user_id"] == auth_user_id
    assert activation_params["org_id"] == org_id
    assert activation_params["request_id"]
    query_sql, query_params = database.calls[1]
    assert "FROM core.settings" in query_sql
    assert "master." not in query_sql
    assert "org_id = :org_id" in query_sql
    assert query_params == {"org_id": org_id}


def test_company_mutations_fail_closed_without_database_access():
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(reject_company_mutation(_={}))

    assert exc_info.value.status_code == 503
    assert "reviewed core command" in str(exc_info.value.detail)


def test_company_asset_routes_do_not_restore_the_retired_tenant_session():
    source = inspect.getsource(company_assets)
    assert "TenantAwareSession" not in source
    assert "get_tenant_aware_db" not in source
    assert "with_tenant_context" not in source
    assert "set_config('app.org_id'" not in source


def test_only_canonical_company_surface_is_mounted():
    paths = app.openapi()["paths"]

    for path, method in (
        ("/api/company/logo", "get"),
        ("/api/company/logo", "post"),
        ("/api/company/logo", "delete"),
        ("/api/company/info", "put"),
        ("/api/company/settings", "put"),
        ("/api/company/qr-code", "post"),
    ):
        assert paths[path][method]["security"] == [{"HTTPBearer": []}]

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
