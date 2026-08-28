import ast
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.exc import SQLAlchemyError

from app.api.routes.internal import mcp_agent_grants, mcp_canonical_reads
from app.api.routes.internal.mcp_agent_grants import GrantRequest, OperatorGrantRequest
from app.api.routes.internal.mcp_contract import (
    ALL_CANONICAL_READ_POLICIES,
    CANONICAL_READ_POLICIES,
)


ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture(autouse=True)
def _open_session_authority(monkeypatch):
    monkeypatch.setattr(
        mcp_agent_grants, "require_canonical_session_authority", lambda _db: None
    )
    monkeypatch.setattr(
        mcp_canonical_reads, "require_canonical_session_authority", lambda _db: None
    )


def test_internal_auth_is_constant_time_and_requires_a_real_secret(monkeypatch):
    monkeypatch.setenv("MCP_INTERNAL_SERVICE_TOKEN", "s" * 48)
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="s" * 48)
    assert mcp_agent_grants._internal_auth(credentials) is None

    with pytest.raises(HTTPException) as denied:
        mcp_agent_grants._internal_auth(
            HTTPAuthorizationCredentials(scheme="Bearer", credentials="wrong")
        )
    assert denied.value.status_code == 401


def test_release_gates_require_a_reviewed_live_client(monkeypatch):
    assert mcp_agent_grants.HOSTED_OAUTH_CONSENT_UI_IMPLEMENTED is True
    assert mcp_agent_grants.HOSTED_OAUTH_CONSENT_SDK_TARGET == "2.112.3"
    assert mcp_agent_grants.HOSTED_OAUTH_CONSENT_SDK_VERIFIED is True
    assert mcp_agent_grants.HOSTED_OAUTH_CONSENT_IMPLEMENTED is True
    assert mcp_agent_grants.CANONICAL_MCP_READ_API_IMPLEMENTED is True
    assert mcp_agent_grants.CANONICAL_SCHEMA_DEPLOYMENT_VERIFIED is True
    assert mcp_agent_grants.MCP_STAGING_VERIFIED is True
    monkeypatch.delenv("MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS", raising=False)
    with pytest.raises(HTTPException) as blocked:
        mcp_agent_grants._require_readiness_gates()
    assert blocked.value.status_code == 503
    assert "no client is pre-registered" in blocked.value.detail


def test_mcp_issuance_readiness_and_consumption_all_fail_during_maintenance(
    monkeypatch,
):
    monkeypatch.setenv("MCP_INTERNAL_SERVICE_TOKEN", "s" * 48)
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="s" * 48)

    def maintenance(_db):
        raise HTTPException(
            status_code=503,
            detail={"error": "erp_maintenance", "message": "maintenance"},
        )

    monkeypatch.setattr(
        mcp_agent_grants, "require_canonical_session_authority", maintenance
    )
    monkeypatch.setattr(
        mcp_canonical_reads, "require_canonical_session_authority", maintenance
    )
    database = object()
    read_request = GrantRequest(
        issuer="https://example.supabase.co/auth/v1",
        subject=uuid4(),
        organization_id=uuid4(),
        client_id="client-1",
        operation_key="master.products.search",
        capability_code="master.products.search",
        operation_mode="read",
    )
    action_request = OperatorGrantRequest(
        issuer="https://example.supabase.co/auth/v1",
        subject=uuid4(),
        organization_id=uuid4(),
        client_id="client-1",
        operation_key="sales.order.prepare",
        capability_code="sales.order.prepare",
        operation_mode="write",
        branch_ids=[uuid4()],
    )

    calls = (
        lambda: mcp_agent_grants.authorize_agent_grant(
            read_request, credentials, database
        ),
        lambda: mcp_agent_grants.authorize_operator_action(
            action_request, credentials, database
        ),
        lambda: mcp_agent_grants.agent_grant_readiness(credentials, database),
        lambda: mcp_canonical_reads.get_canonical_delegation(
            "Bearer stale-token", credentials, database
        ),
    )
    for call in calls:
        with pytest.raises(HTTPException) as blocked:
            call()
        assert blocked.value.status_code == 503
        assert blocked.value.detail["error"] == "erp_maintenance"


def test_internal_authority_is_canonical_and_never_uses_service_role():
    sources = "\n".join(
        (ROOT / relative).read_text(encoding="utf-8")
        for relative in (
            "backend/app/api/routes/internal/mcp_agent_grants.py",
            "backend/app/api/routes/internal/mcp_canonical_reads.py",
        )
    )
    for relation in (
        "automation.agent_grants",
        "automation.agent_grant_capabilities",
        "core.memberships",
        "core.access_grants",
        "core.role_permissions",
        "core.permissions",
    ):
        assert relation in sources
    for forbidden in (
        "SUPABASE_SERVICE_ROLE_KEY",
        "UserRepository",
        "master.org_users",
        "build_erp_token_claims",
        "/api/products/search",
        "/api/suppliers/search",
        "/api/gst/settings",
    ):
        assert forbidden not in sources
    assert "operation_mode='read'" in sources
    assert "risk_class='read_only'" in sources
    assert "expires_at>transaction_timestamp()" in sources
    assert "erp_security.activate_context" in sources


def test_exact_canonical_read_allowlist_has_no_write_or_generic_route():
    assert set(CANONICAL_READ_POLICIES) == {
        "finance.party_aging.get",
        "finance.party_statement.get",
        "finance.trial_balance.get",
        "finance.profit_loss.get",
        "finance.customer_activity.get",
        "master.products.search",
        "master.product_setup_options.get",
        "master.product_ingredients.search",
        "master.product_hsn.search",
        "master.product_setup.get",
        "master.suppliers.search",
        "gst.settings.get",
    }
    assert all(policy.path.startswith("/internal/mcp/reads/") for policy in CANONICAL_READ_POLICIES.values())
    assert all(policy.capability_code == policy.operation_key for policy in CANONICAL_READ_POLICIES.values())
    assert CANONICAL_READ_POLICIES["master.products.search"].permission_code == "catalog.product.manage"
    assert CANONICAL_READ_POLICIES["master.suppliers.search"].sensitive_read is True
    route_paths = {route.path for route in mcp_canonical_reads.router.routes}
    assert route_paths == {
        "/internal/mcp/reads/party-aging",
        "/internal/mcp/reads/party-statement",
        "/internal/mcp/reads/trial-balance",
        "/internal/mcp/reads/profit-loss",
        "/internal/mcp/reads/customer-activity",
        "/internal/mcp/reads/products",
        "/internal/mcp/reads/product-setup-options",
        "/internal/mcp/reads/product-ingredients",
        "/internal/mcp/reads/product-hsn",
        "/internal/mcp/reads/product-setup",
        "/internal/mcp/reads/suppliers",
        "/internal/mcp/reads/gst-settings",
    }
    assert all(route.include_in_schema is False for route in mcp_canonical_reads.router.routes)
    assert all(route.methods == {"GET"} for route in mcp_canonical_reads.router.routes)


def test_every_mcp_read_permission_exists_in_the_canonical_catalog() -> None:
    seed = (
        ROOT / "database/canonical/platform/baseline-platform-enforcements.json"
    ).read_text(encoding="utf-8")
    permissions = {
        policy.permission_code for policy in ALL_CANONICAL_READ_POLICIES.values()
    }
    assert permissions
    for permission in permissions:
        assert f"('{permission}'," in seed


def test_supplier_read_returns_typed_account_selection_not_generic_ids() -> None:
    source = (ROOT / "backend/app/api/routes/internal/mcp_canonical_reads.py").read_text(
        encoding="utf-8"
    )
    assert "supplier.id AS supplier_account_id" in source
    assert "class SupplierSearchResponse" in source
    assert '"no_match"' in source
    assert '"single_match"' in source
    assert '"multiple_matches"' in source
    assert "requires_selection=len(suppliers) != 1" in source


def test_isolated_gateway_registry_matches_canonical_backend_contract():
    path = ROOT / "backend/mcp_runtime/aasopharma_mcp/operations.py"
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    assignment = next(
        node
        for node in tree.body
        if isinstance(node, ast.Assign)
        and any(isinstance(target, ast.Name) and target.id == "OPERATIONS" for target in node.targets)
    )
    assert isinstance(assignment.value, ast.Dict)
    gateway = {}
    for tool_node, operation_node in zip(assignment.value.keys, assignment.value.values):
        assert isinstance(tool_node, ast.Constant) and isinstance(operation_node, ast.Call)
        gateway[tool_node.value] = tuple(ast.literal_eval(argument) for argument in operation_node.args)

    assert len(gateway) == 24
    assert {values[0] for values in gateway.values()} == set(
        ALL_CANONICAL_READ_POLICIES
    )
    for values in gateway.values():
        operation_key, _tool, path_value, permission, maximum = values[:5]
        policy = ALL_CANONICAL_READ_POLICIES[operation_key]
        assert path_value == f"/api{policy.path}"
        assert permission == policy.permission_code
        assert maximum == policy.maximum_records


def test_grant_issues_only_canonical_uuid_claims(monkeypatch):
    ids = {name: uuid4() for name in ("org", "grant", "membership", "user", "auth")}
    row = SimpleNamespace(
        _mapping={
            "org_id": ids["org"],
            "agent_grant_id": ids["grant"],
            "membership_id": ids["membership"],
            "grant_branch_id": None,
            "delegated_branch_id": None,
            "canonical_user_id": ids["user"],
            "auth_user_id": ids["auth"],
            "allow_sensitive_read": False,
        }
    )
    captured = {}
    database_calls = []
    monkeypatch.setattr(mcp_agent_grants, "HOSTED_OAUTH_CONSENT_IMPLEMENTED", True)
    monkeypatch.setattr(mcp_agent_grants, "CANONICAL_SCHEMA_DEPLOYMENT_VERIFIED", True)
    monkeypatch.setattr(mcp_agent_grants, "MCP_STAGING_VERIFIED", True)
    monkeypatch.setattr(
        mcp_agent_grants, "_grant_rows", lambda _db, _request, _permission: [row]
    )
    monkeypatch.setattr(
        mcp_agent_grants,
        "create_access_token",
        lambda claims, expires_delta: captured.update(claims) or "d" * 48,
    )
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS", "client-1")
    monkeypatch.setenv("MCP_INTERNAL_SERVICE_TOKEN", "s" * 48)

    response = mcp_agent_grants.authorize_agent_grant(
        GrantRequest(
            issuer="https://example.supabase.co/auth/v1",
            subject=ids["auth"],
            organization_id=ids["org"],
            client_id="client-1",
            operation_key="master.products.search",
            capability_code="master.products.search",
            operation_mode="read",
        ),
        HTTPAuthorizationCredentials(scheme="Bearer", credentials="s" * 48),
        SimpleNamespace(
            execute=lambda statement, params=None: database_calls.append(
                (str(statement), params)
            )
        ),
    )

    assert response.organization_id == str(ids["org"])
    assert "erp_security.activate_context" in database_calls[0][0]
    assert database_calls[0][1] == {
        "auth_user_id": ids["auth"],
        "org_id": ids["org"],
    }
    assert captured["token_profile"] == "canonical_mcp_delegation_v1"
    assert captured["user_id"] == str(ids["user"])
    assert captured["membership_id"] == str(ids["membership"])
    assert captured["agent_grant_id"] == str(ids["grant"])
    assert "role" not in captured and "email" not in captured


def test_grant_readiness_checks_authority_without_cross_tenant_enumeration(monkeypatch):
    calls = []

    def execute(statement, params=None):
        calls.append((str(statement), params))
        return SimpleNamespace(scalar=lambda: True)

    monkeypatch.setenv("MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS", "client-1")
    monkeypatch.setenv("MCP_INTERNAL_SERVICE_TOKEN", "s" * 48)
    response = mcp_agent_grants.agent_grant_readiness(
        HTTPAuthorizationCredentials(scheme="Bearer", credentials="s" * 48),
        SimpleNamespace(execute=execute),
    )

    assert response == {
        "status": "ready",
        "grant_authority": "automation.agent_grants",
    }
    assert len(calls) == 1
    assert "to_regclass('automation.agent_grants')" in calls[0][0]
    assert "SELECT count(*)" not in calls[0][0]


def test_grant_readiness_reports_database_authority_failure_as_not_ready(monkeypatch):
    rolled_back = []

    def execute(_statement, _params=None):
        raise SQLAlchemyError("database authority unavailable")

    monkeypatch.setenv("MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS", "client-1")
    monkeypatch.setenv("MCP_INTERNAL_SERVICE_TOKEN", "s" * 48)
    database = SimpleNamespace(
        execute=execute,
        rollback=lambda: rolled_back.append(True),
    )

    with pytest.raises(HTTPException) as unavailable:
        mcp_agent_grants.agent_grant_readiness(
            HTTPAuthorizationCredentials(scheme="Bearer", credentials="s" * 48),
            database,
        )

    assert unavailable.value.status_code == 503
    assert unavailable.value.detail == "Canonical agent-grant authority is unavailable"
    assert rolled_back == [True]


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return self._rows


class _Database:
    def __init__(self, results):
        self.results = list(results)
        self.calls = []

    def execute(self, statement, params=None):
        self.calls.append((str(statement), params or {}))
        return _Result(self.results.pop(0))


def _delegation_claims(branch_id=None):
    return {
        "auth_user_id": str(uuid4()),
        "user_id": str(uuid4()),
        "org_id": str(uuid4()),
        "membership_id": str(uuid4()),
        "agent_grant_id": str(uuid4()),
        "branch_ids": [str(branch_id)] if branch_id else [],
        "mcp_client_id": "client-1",
        "mcp_operation": "master.products.search",
        "mcp_capability": "master.products.search",
        "mcp_allow_sensitive_read": False,
        "mcp_delegated": True,
        "token_profile": "canonical_mcp_delegation_v1",
    }


def test_delegated_token_parser_requires_bearer_and_canonical_profile(monkeypatch):
    claims = _delegation_claims()
    monkeypatch.setattr(mcp_canonical_reads, "decode_jwt", lambda token, check_blacklist: claims)
    assert mcp_canonical_reads._parse_delegated_token("Bearer signed-token") is claims

    with pytest.raises(HTTPException) as missing:
        mcp_canonical_reads._parse_delegated_token("Basic signed-token")
    assert missing.value.status_code == 401

    claims["token_profile"] = "legacy"
    with pytest.raises(HTTPException) as wrong_profile:
        mcp_canonical_reads._parse_delegated_token("Bearer signed-token")
    assert wrong_profile.value.status_code == 401


def test_read_dependency_revalidates_live_canonical_authority(monkeypatch):
    claims = _delegation_claims()
    database = _Database([[], [SimpleNamespace(_mapping={"grant_branch_id": None, "allow_sensitive_read": False})]])
    monkeypatch.setattr(mcp_canonical_reads, "_parse_delegated_token", lambda _header: claims)
    monkeypatch.setenv("MCP_INTERNAL_SERVICE_TOKEN", "s" * 48)

    context = mcp_canonical_reads.get_canonical_delegation(
        "Bearer delegated",
        HTTPAuthorizationCredentials(scheme="Bearer", credentials="s" * 48),
        database,
    )

    assert context.organization_id == UUID(claims["org_id"])
    assert context.policy.operation_key == "master.products.search"
    assert "erp_security.activate_context" in database.calls[0][0]
    assert "activate_context(:auth_user_id, :org_id)" in database.calls[0][0]
    assert ":membership_id" not in database.calls[0][0]
    assert database.calls[0][1] == {
        "auth_user_id": UUID(claims["auth_user_id"]),
        "org_id": UUID(claims["org_id"]),
    }
    authority_sql = database.calls[1][0]
    for fragment in (
        "automation.agent_grants",
        "automation.agent_grant_capabilities",
        "core.access_grants",
        "core.role_permissions",
        "transaction_timestamp()",
    ):
        assert fragment in authority_sql


def test_read_dependency_rejects_revoked_or_expired_authority(monkeypatch):
    claims = _delegation_claims()
    database = _Database([[], []])
    monkeypatch.setattr(mcp_canonical_reads, "_parse_delegated_token", lambda _header: claims)
    monkeypatch.setenv("MCP_INTERNAL_SERVICE_TOKEN", "s" * 48)
    with pytest.raises(HTTPException) as denied:
        mcp_canonical_reads.get_canonical_delegation(
            "Bearer delegated",
            HTTPAuthorizationCredentials(scheme="Bearer", credentials="s" * 48),
            database,
        )
    assert denied.value.status_code == 403


def test_read_dependency_rejects_sensitive_or_branch_scope_drift(monkeypatch):
    monkeypatch.setenv("MCP_INTERNAL_SERVICE_TOKEN", "s" * 48)
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="s" * 48)

    supplier_claims = _delegation_claims()
    supplier_claims.update(
        {
            "mcp_operation": "master.suppliers.search",
            "mcp_capability": "master.suppliers.search",
        }
    )
    monkeypatch.setattr(
        mcp_canonical_reads, "_parse_delegated_token", lambda _header: supplier_claims
    )
    supplier_db = _Database(
        [[], [SimpleNamespace(_mapping={"grant_branch_id": None, "allow_sensitive_read": False})]]
    )
    with pytest.raises(HTTPException) as sensitive:
        mcp_canonical_reads.get_canonical_delegation(
            "Bearer delegated", credentials, supplier_db
        )
    assert sensitive.value.status_code == 403

    delegated_branch_id = uuid4()
    branch_claims = _delegation_claims(branch_id=delegated_branch_id)
    monkeypatch.setattr(
        mcp_canonical_reads, "_parse_delegated_token", lambda _header: branch_claims
    )
    branch_db = _Database([[], [SimpleNamespace(
        _mapping={"grant_branch_id": None, "allow_sensitive_read": False}
    )]])
    context = mcp_canonical_reads.get_canonical_delegation(
        "Bearer delegated", credentials, branch_db
    )
    assert context.branch_id == delegated_branch_id

    wrong_branch_db = _Database([[], [SimpleNamespace(
        _mapping={"grant_branch_id": uuid4(), "allow_sensitive_read": False}
    )]])
    with pytest.raises(HTTPException) as branch:
        mcp_canonical_reads.get_canonical_delegation(
            "Bearer delegated", credentials, wrong_branch_db
        )
    assert branch.value.status_code == 403


def _context(operation_key, branch_id=None, sensitive=False):
    policy = CANONICAL_READ_POLICIES[operation_key]
    return mcp_canonical_reads.CanonicalDelegation(
        auth_user_id=uuid4(),
        user_id=uuid4(),
        organization_id=uuid4(),
        membership_id=uuid4(),
        agent_grant_id=uuid4(),
        client_id="client-1",
        policy=policy,
        branch_id=branch_id,
        allow_sensitive_read=sensitive,
    )


def test_three_hidden_reads_query_only_canonical_tables_with_bounds():
    product_db = _Database(
        [[SimpleNamespace(_mapping={"id": uuid4(), "sku": "SKU-1", "name": "Paracetamol"})]]
    )
    product = mcp_canonical_reads.canonical_product_search(
        "para", 20, 0, _context("master.products.search"), product_db
    )
    assert product[0]["sku"] == "SKU-1"
    assert "FROM catalog.products" in product_db.calls[0][0]
    assert product_db.calls[0][1]["limit"] == 20

    supplier_account_id = uuid4()
    supplier_db = _Database(
        [[
            SimpleNamespace(
                _mapping={
                    "supplier_account_id": supplier_account_id,
                    "supplier_code": "SUP-1",
                    "party_id": uuid4(),
                    "legal_name": "Med Supplier",
                    "trade_name": None,
                    "payment_days": 30,
                    "status": "active",
                    "gstin": "27ABCDE1234F1Z5",
                    "phone": None,
                    "email": None,
                    "row_version": 1,
                }
            )
        ]]
    )
    supplier = mcp_canonical_reads.canonical_supplier_search(
        "med", 50, 0, _context("master.suppliers.search", sensitive=True), supplier_db
    )
    assert supplier.match_state == "single_match"
    assert supplier.requires_selection is False
    assert supplier.suppliers[0].supplier_account_id == supplier_account_id
    assert supplier.suppliers[0].supplier_code == "SUP-1"
    supplier_sql = supplier_db.calls[0][0]
    assert "status IN ('active','pending_verification')" in supplier_sql
    assert "CASE WHEN status='active' THEN 0 ELSE 1 END" in supplier_sql
    for relation in (
        "parties.supplier_accounts",
        "parties.parties",
        "parties.tax_registrations",
        "parties.contacts",
    ):
        assert relation in supplier_sql

    branch_id = uuid4()
    gst_db = _Database(
        [[SimpleNamespace(_mapping={"id": uuid4(), "branch_id": branch_id, "gstin": "27ABCDE1234F1Z5"})]]
    )
    gst = mcp_canonical_reads.canonical_gst_settings(
        _context("gst.settings.get", branch_id=branch_id), gst_db
    )
    assert gst["gstin"] == "27ABCDE1234F1Z5"
    assert "FROM tax.registrations" in gst_db.calls[0][0]
    assert gst_db.calls[0][1]["branch_id"] == branch_id


def test_product_setup_reads_reuse_the_browser_canonical_contract(monkeypatch):
    product_id = uuid4()
    captured = []

    monkeypatch.setattr(
        mcp_canonical_reads.canonical_erp_reads,
        "product_setup_options",
        lambda manufacturer_search, user, db: captured.append(
            ("options", manufacturer_search, user["org_id"], db)
        ) or {"units": [], "manufacturers": []},
    )
    monkeypatch.setattr(
        mcp_canonical_reads.canonical_erp_reads,
        "product_setup_ingredients",
        lambda search, limit, user, db: captured.append(
            ("ingredients", search, limit, user["org_id"], db)
        ) or [],
    )
    monkeypatch.setattr(
        mcp_canonical_reads.canonical_erp_reads,
        "product_setup_hsn_codes",
        lambda search, limit, user, db: captured.append(
            ("hsn", search, limit, user["org_id"], db)
        ) or [],
    )
    monkeypatch.setattr(
        mcp_canonical_reads.canonical_erp_reads,
        "product_setup",
        lambda selected_product_id, user, db: captured.append(
            ("setup", selected_product_id, user["org_id"], db)
        ) or {"product_id": str(selected_product_id)},
    )
    db = object()

    options = mcp_canonical_reads.canonical_product_setup_options(
        "micro", _context("master.product_setup_options.get"), db
    )
    ingredients = mcp_canonical_reads.canonical_product_ingredient_search(
        "para", 20, _context("master.product_ingredients.search"), db
    )
    hsn = mcp_canonical_reads.canonical_product_hsn_search(
        "3004", 20, _context("master.product_hsn.search"), db
    )
    setup = mcp_canonical_reads.canonical_product_setup_get(
        product_id, _context("master.product_setup.get"), db
    )

    assert options == {"units": [], "manufacturers": []}
    assert ingredients == {"ingredients": []}
    assert hsn == {"hsn_codes": []}
    assert setup == {"product_id": str(product_id)}
    assert [row[0] for row in captured] == ["options", "ingredients", "hsn", "setup"]


def test_hidden_read_rejects_cross_operation_delegation_and_ambiguous_gst():
    with pytest.raises(HTTPException) as crossed:
        mcp_canonical_reads.canonical_product_search(
            "", 20, 0, _context("gst.settings.get"), _Database([])
        )
    assert crossed.value.status_code == 403

    rows = [
        SimpleNamespace(_mapping={"id": uuid4()}),
        SimpleNamespace(_mapping={"id": uuid4()}),
    ]
    with pytest.raises(HTTPException) as ambiguous:
        mcp_canonical_reads.canonical_gst_settings(
            _context("gst.settings.get"), _Database([rows])
        )
    assert ambiguous.value.status_code == 409
