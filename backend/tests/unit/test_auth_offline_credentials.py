from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def _read(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def test_login_response_never_contains_password_derived_offline_auth_material():
    route = _read("backend/app/api/routes/auth/enterprise.py")
    service = _read("backend/app/api/services/auth/auth_service.py")

    assert "offline_auth_hash" not in route
    assert "create_offline_auth_hash" not in service


def test_frontend_does_not_authenticate_with_cached_passwords():
    context = _read("frontend/src/contexts/AuthContext.tsx")
    session_storage = _read("frontend/src/services/auth/erpSessionStorage.ts")

    assert "loginOffline" not in context
    assert "hashPassword" not in context
    assert "passwordHash" not in context
    assert "offline.${" not in context
    assert "pharma_offline_creds" not in context
    assert "pharma_offline_creds" in session_storage


def test_frontend_has_one_token_store_and_never_supplies_tenant_headers():
    source_root = ROOT / "frontend/src"
    offenders = []

    for path in source_root.rglob("*"):
        if path.suffix not in {".ts", ".tsx", ".js", ".jsx"}:
            continue
        if "__tests__" in path.parts or path.name.endswith(".test.ts"):
            continue
        source = path.read_text(encoding="utf-8")
        if "X-Org-Id" in source or "X-Org-ID" in source:
            offenders.append(str(path.relative_to(ROOT)))
        if path.name != "erpSessionStorage.ts" and any(
            legacy in source
            for legacy in (
                "localStorage.getItem('authToken')",
                "localStorage.getItem('auth_token')",
                "localStorage.getItem('pharma_token')",
                "localStorage.getItem('pharma_org_id')",
                "localStorage.getItem('orgId')",
            )
        ):
            offenders.append(str(path.relative_to(ROOT)))

    assert offenders == []


def test_backend_does_not_allow_tenant_headers_or_default_tenant_config():
    main = _read("backend/app/main.py")

    assert '"X-Org-Id",' not in main
    assert not (ROOT / "backend/app/core/config.py").exists()
