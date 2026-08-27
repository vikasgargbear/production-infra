import asyncio

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.api.routes.auth import enterprise


def _run(awaitable):
    return asyncio.run(awaitable)


def test_verify_token_revalidates_live_session_authority(monkeypatch):
    monkeypatch.setattr(
        "app.core.auth.jwt_auth.decode_jwt",
        lambda *_args, **_kwargs: {
            "user_id": "5c3fd8ee-5768-437a-bec4-94a175f224cd",
            "org_id": "01e3fe3d-437d-4d52-a1de-701313b3c08b",
        },
    )
    inspected = []
    monkeypatch.setattr(
        enterprise,
        "require_canonical_session_authority",
        lambda db: inspected.append(db),
    )
    database = object()

    response = _run(
        enterprise.verify_token(
            HTTPAuthorizationCredentials(scheme="Bearer", credentials="signed-token"),
            database,
        )
    )

    assert response["valid"] is True
    assert inspected == [database]


def test_verify_token_rejects_a_stale_token_during_maintenance(monkeypatch):
    monkeypatch.setattr(
        "app.core.auth.jwt_auth.decode_jwt",
        lambda *_args, **_kwargs: {
            "user_id": "5c3fd8ee-5768-437a-bec4-94a175f224cd",
            "org_id": "01e3fe3d-437d-4d52-a1de-701313b3c08b",
        },
    )
    monkeypatch.setattr(
        enterprise,
        "require_canonical_session_authority",
        lambda _db: (_ for _ in ()).throw(
            HTTPException(
                status_code=503,
                detail={"error": "erp_maintenance", "message": "maintenance"},
            )
        ),
    )

    with pytest.raises(HTTPException) as blocked:
        _run(
            enterprise.verify_token(
                HTTPAuthorizationCredentials(
                    scheme="Bearer", credentials="stale-signed-token"
                ),
                object(),
            )
        )

    assert blocked.value.status_code == 503
    assert blocked.value.detail["error"] == "erp_maintenance"
