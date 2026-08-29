import pytest
from fastapi import HTTPException

from app.core.security.permissions import (
    ExactPermissionChecker,
    PermissionChecker,
    canonical_module_access,
    canonical_permission_access,
)


def test_legacy_modules_map_to_canonical_permission_domains():
    codes = {
        "sales.invoice.create",
        "procurement.order.manage",
        "finance.payment.manage",
        "catalog.product.manage",
        "tax.return.compose",
    }

    assert canonical_module_access(codes, "sales")
    assert canonical_module_access(codes, "purchase")
    assert canonical_module_access(codes, "payment")
    assert canonical_module_access(codes, "master")
    assert canonical_module_access(codes, "gst")
    assert not canonical_module_access(codes, "inventory")


def test_actions_are_fail_closed_and_capability_backed():
    codes = {"sales.invoice.create", "finance.account.manage"}

    assert canonical_permission_access(codes, "sales", "view")
    assert canonical_permission_access(codes, "sales", "create")
    assert not canonical_permission_access(codes, "sales", "approve")
    assert canonical_permission_access(codes, "finance", "edit")
    assert not canonical_permission_access(set(), "sales", "view")


@pytest.mark.asyncio
async def test_checker_uses_signed_claims_without_database(monkeypatch):
    monkeypatch.setattr(
        "app.core.security.permissions.require_canonical_session_authority",
        lambda _db: None,
    )
    monkeypatch.setattr(
        "app.core.security.permissions.decode_jwt",
        lambda _: {
            "user_id": "5c3fd8ee-5768-437a-bec4-94a175f224cd",
            "org_id": "01e3fe3d-437d-4d52-a1de-701313b3c08b",
            "email": "operator@example.com",
            "permissions": {"sales.invoice.create": True},
        },
    )

    user = await PermissionChecker("sales", "create")("Bearer signed-token", object())
    assert user["permissions"] == {"sales.invoice.create": True}

    with pytest.raises(HTTPException) as denied:
        await PermissionChecker("inventory", "view")("Bearer signed-token", object())
    assert denied.value.status_code == 403


@pytest.mark.asyncio
async def test_checker_rejects_stale_signed_claims_while_authority_is_closed(monkeypatch):
    monkeypatch.setattr(
        "app.core.security.permissions.decode_jwt",
        lambda _: {
            "user_id": "5c3fd8ee-5768-437a-bec4-94a175f224cd",
            "org_id": "01e3fe3d-437d-4d52-a1de-701313b3c08b",
        },
    )
    monkeypatch.setattr(
        "app.core.security.permissions.require_canonical_session_authority",
        lambda _db: (_ for _ in ()).throw(
            HTTPException(status_code=503, detail={"error": "erp_maintenance"})
        ),
    )

    with pytest.raises(HTTPException) as blocked:
        await PermissionChecker()("Bearer stale-token", object())
    assert blocked.value.status_code == 503
    assert blocked.value.detail["error"] == "erp_maintenance"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("required", "granted", "is_admin", "expected_status"),
    (
        ("catalog.product.manage", "catalog.product.manage", False, None),
        ("parties.customer.manage", "parties.customer.manage", False, None),
        ("parties.supplier.manage", "parties.supplier.manage", False, None),
        ("catalog.product.manage", "parties.customer.manage", False, 403),
        ("parties.customer.manage", "parties.supplier.manage", False, 403),
        ("parties.supplier.manage", "catalog.product.manage", False, 403),
        ("catalog.product.manage", "parties.customer.manage", True, 403),
        ("catalog.product.manage", "catalog.product.manage", True, None),
    ),
)
async def test_exact_checker_requires_signed_capability_even_for_admin(
    monkeypatch, required, granted, is_admin, expected_status
):
    monkeypatch.setattr(
        "app.core.security.permissions.is_test_mode_enabled", lambda: False
    )
    monkeypatch.setattr(
        "app.core.security.permissions.require_canonical_session_authority",
        lambda _db: None,
    )
    monkeypatch.setattr(
        "app.core.security.permissions.decode_jwt",
        lambda _: {
            "user_id": "5c3fd8ee-5768-437a-bec4-94a175f224cd",
            "auth_user_id": "24b5260d-bdb6-40b5-a1c0-e85af2fe2098",
            "org_id": "01e3fe3d-437d-4d52-a1de-701313b3c08b",
            "email": "operator@example.com",
            "is_admin": is_admin,
            "permissions": {granted: True},
        },
    )

    checker = ExactPermissionChecker(required)
    if expected_status is None:
        user = await checker("Bearer signed-token", object())
        assert user["permissions"] == {granted: True}
        return

    with pytest.raises(HTTPException) as denied:
        await checker("Bearer signed-token", object())
    assert denied.value.status_code == expected_status


@pytest.mark.asyncio
async def test_exact_checker_rejects_unauthenticated_before_session_or_database(
    monkeypatch,
):
    calls = []
    monkeypatch.setattr(
        "app.core.security.permissions.is_test_mode_enabled", lambda: False
    )
    monkeypatch.setattr(
        "app.core.security.permissions.require_canonical_session_authority",
        lambda _db: calls.append("session"),
    )

    with pytest.raises(HTTPException) as denied:
        await ExactPermissionChecker("catalog.product.manage")(None, object())

    assert denied.value.status_code == 401
    assert calls == []
