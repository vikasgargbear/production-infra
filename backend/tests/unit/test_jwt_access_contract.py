"""Regression tests for the ERP access-token boundary."""

import ast
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from jose import JWTError, jwt

from app.core.auth import jwt_auth


def _claims(**overrides):
    claims = {
        "user_id": 41,
        "auth_user_id": "7bc58d7a-6b37-453e-a185-ce0ad0f16f97",
        "org_id": "b7476a4f-e365-4e6d-a55f-e432fc0b15a6",
        "email": "operator@example.com",
    }
    claims.update(overrides)
    return claims


def _encode_raw(**overrides):
    now = datetime.utcnow()
    claims = {
        **_claims(),
        "sub": "7bc58d7a-6b37-453e-a185-ce0ad0f16f97",
        "iat": now,
        "exp": now + timedelta(minutes=5),
        "jti": "contract-test",
        "iss": jwt_auth.TOKEN_ISSUER,
        "aud": jwt_auth.TOKEN_AUDIENCE,
        "token_use": "access",
    }
    claims.update(overrides)
    return jwt.encode(claims, jwt_auth.SECRET_KEY, algorithm=jwt_auth.ALGORITHM)


def test_access_token_has_required_identity_and_validation_claims(monkeypatch):
    monkeypatch.setattr(jwt_auth, "is_token_blacklisted", lambda _jti: False)

    token = jwt_auth.create_access_token(_claims())
    decoded = jwt_auth.decode_jwt(token)

    assert decoded["token_use"] == "access"
    assert decoded["iss"] == jwt_auth.TOKEN_ISSUER
    assert decoded["aud"] == jwt_auth.TOKEN_AUDIENCE
    assert decoded["sub"] == _claims()["auth_user_id"]
    assert decoded["jti"]


@pytest.mark.parametrize(
    "claim_overrides",
    [
        {"token_use": "refresh"},
        {"iss": "untrusted-issuer"},
        {"aud": "another-service"},
    ],
)
def test_non_access_or_wrongly_scoped_tokens_are_rejected(claim_overrides):
    with pytest.raises(JWTError):
        jwt_auth.decode_jwt(_encode_raw(**claim_overrides), check_blacklist=False)


def test_only_central_auth_module_decodes_jwts():
    app_root = Path(__file__).parents[2] / "app"
    offenders = []

    for path in app_root.rglob("*.py"):
        if path == app_root / "core" / "auth" / "jwt_auth.py":
            continue
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
                continue
            if node.func.attr == "decode" and isinstance(node.func.value, ast.Name):
                if node.func.value.id == "jwt":
                    offenders.append(str(path.relative_to(app_root)))

    assert offenders == []


def test_removed_fail_open_auth_and_rls_helpers_stay_removed():
    app_root = Path(__file__).parents[2] / "app"

    assert not (app_root / "core" / "auth" / "dependencies.py").exists()
    assert not (app_root / "middleware" / "rls_middleware.py").exists()
