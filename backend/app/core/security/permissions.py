"""Authorization helpers for canonical ERP access-token claims.

The Supabase session exchange resolves the active membership, role and grants
once, then signs the resulting canonical permission codes into the ERP JWT.
Request authorization must use those signed claims instead of querying the
retired ``master.org_users`` / ``master.roles`` compatibility tables.
"""

from functools import wraps
import logging
from typing import Any, Dict, Iterable, Mapping, Optional, Set

from fastapi import Depends, Header, HTTPException, status
from jwt import InvalidTokenError as JWTError
from sqlalchemy.orm import Session

from ..auth.jwt_auth import decode_jwt
from ..auth.session_authority import require_canonical_session_authority
from ..database import get_db
from ..env import is_production, is_test_mode_enabled

logger = logging.getLogger(__name__)

MODULES = {
    "SALES": "sales", "PURCHASE": "purchase", "INVENTORY": "inventory",
    "PAYMENT": "payment", "REPORTS": "reports", "MASTER": "master",
    "GST": "gst", "RETURNS": "returns", "LEDGER": "ledger", "NOTES": "notes",
}

PERMISSIONS = {
    "VIEW": "view", "CREATE": "create", "EDIT": "edit", "DELETE": "delete",
    "APPROVE": "approve", "EXPORT": "export",
}

# Translate old navigation groups to canonical capability domains. This keeps
# canonical codes as the only authorization truth while legacy routes retire.
MODULE_DOMAINS: Dict[str, Set[str]] = {
    "sales": {"sales"}, "invoices": {"sales"}, "challans": {"sales"},
    "purchase": {"procurement"}, "purchase_returns": {"procurement"},
    "inventory": {"inventory"}, "payment": {"finance"}, "finance": {"finance"},
    "ledger": {"finance"}, "notes": {"finance"}, "gst": {"tax"},
    "returns": {"sales", "procurement"},
    "reports": {"sales", "procurement", "inventory", "finance", "tax"},
    "dashboard": {"sales", "procurement", "inventory", "finance", "tax"},
    "master": {"catalog", "parties", "hr", "core"}, "settings": {"core"},
}

ACTION_SUFFIXES: Dict[str, Set[str]] = {
    "view": set(), "create": {"create", "manage"},
    "edit": {"edit", "manage"}, "delete": {"manage"},
    "approve": {"approve", "post", "file", "execute"}, "export": set(),
}

# Exact application capabilities whose operators legitimately need bounded
# foundation lookups while preparing canonical transactions. Administration,
# setup and mutations are intentionally not covered by these any-of policies.
FOUNDATION_PRODUCT_LOOKUP_PERMISSIONS = (
    "catalog.product.manage",
    "sales.order.create",
    "sales.order.manage",
    "sales.invoice.create",
    "sales.dispatch.create",
    "sales.dispatch.post",
    "sales.return.create",
    "sales.return.post",
    "procurement.order.manage",
    "procurement.receipt.post",
    "procurement.invoice.post",
    "procurement.supplier_invoice.create",
    "procurement.purchase_return.create",
    "procurement.return.post",
    "inventory.adjustment.create",
    "inventory.transfer.create",
    "inventory.destruction.create",
    "inventory.batch.manage",
    "inventory.reservation.manage",
    "inventory.document.post",
)
FOUNDATION_CUSTOMER_LOOKUP_PERMISSIONS = (
    "parties.customer.manage",
    "sales.order.create",
    "sales.order.manage",
    "sales.invoice.create",
    "sales.dispatch.create",
    "sales.dispatch.post",
    "sales.return.create",
    "sales.return.post",
    "finance.customer_receipt.create",
    "finance.payment.manage",
    "finance.account.manage",
    "finance.adjustment_note.edit",
    "finance.adjustment_note.manage",
)
FOUNDATION_SUPPLIER_LOOKUP_PERMISSIONS = (
    "parties.supplier.manage",
    "procurement.order.manage",
    "procurement.receipt.post",
    "procurement.invoice.post",
    "procurement.supplier_invoice.create",
    "procurement.purchase_return.create",
    "procurement.return.post",
    "finance.supplier_payment.create",
    "finance.supplier_advance.create",
    "finance.payment.manage",
    "finance.account.manage",
    "finance.adjustment_note.edit",
    "finance.adjustment_note.manage",
)


def _active_permission_codes(raw_permissions: Any) -> Set[str]:
    """Normalize the supported signed-claim representations."""
    if isinstance(raw_permissions, Mapping):
        return {str(code).lower() for code, enabled in raw_permissions.items() if enabled is True}
    if isinstance(raw_permissions, Iterable) and not isinstance(raw_permissions, (str, bytes)):
        return {str(code).lower() for code in raw_permissions}
    return set()


def has_exact_permission(user: Mapping[str, Any], permission_code: str) -> bool:
    """Check one signed canonical capability without an administrator bypass."""
    raw = user.get("permissions") or user.get("role_permissions")
    return permission_code.strip().lower() in _active_permission_codes(raw)


def canonical_module_access(permission_codes: Set[str], module: Optional[str]) -> bool:
    if not module:
        return True
    domains = MODULE_DOMAINS.get(module.lower(), {module.lower()})
    return any(code.split(".", 1)[0] in domains for code in permission_codes)


def canonical_permission_access(
    permission_codes: Set[str], module: Optional[str], permission: Optional[str]
) -> bool:
    if not canonical_module_access(permission_codes, module):
        return False
    if not permission or permission.lower() in {"view", "export"}:
        return True
    domains = MODULE_DOMAINS.get((module or "").lower(), {(module or "").lower()})
    suffixes = ACTION_SUFFIXES.get(permission.lower(), {permission.lower()})
    return any(
        code.split(".", 1)[0] in domains
        and any(code.endswith(f".{suffix}") for suffix in suffixes)
        for code in permission_codes
    )


def _user_from_claims(payload: Dict[str, Any]) -> Dict[str, Any]:
    codes = _active_permission_codes(payload.get("permissions"))
    return {
        "user_id": payload.get("user_id"), "auth_user_id": payload.get("auth_user_id"),
        "username": payload.get("email"),
        "email": payload.get("email"), "org_id": payload.get("org_id"),
        "is_admin": payload.get("is_admin") is True,
        "permissions": payload.get("permissions") or {}, "role_id": payload.get("role_id"),
        "role_code": payload.get("role"), "role_name": payload.get("role"),
        "role_permissions": payload.get("permissions") or {},
        "allowed_modules": sorted(
            module for module in MODULE_DOMAINS if canonical_module_access(codes, module)
        ),
        "data_access_level": payload.get("data_access_level", "branch"),
        "branch_ids": payload.get("branch_ids") or [],
        "branch_scope": payload.get("branch_scope", "single"),
        "full_name": payload.get("full_name"),
    }


class PermissionChecker:
    """FastAPI dependency that authorizes from the verified ERP JWT."""

    def __init__(self, module: str = None, permission: str = None, require_admin: bool = False):
        self.module = module
        self.permission = permission
        self.require_admin = require_admin

    async def __call__(
        self,
        authorization: str = Header(None),
        db: Session = Depends(get_db),
    ) -> Dict[str, Any]:
        if is_test_mode_enabled():
            if is_production():
                logger.critical("SECURITY: TEST_MODE=true blocked in production environment")
                raise HTTPException(status_code=503, detail="Service configuration error")
            return {
                "user_id": "00000000-0000-0000-0000-000000000008",
                "auth_user_id": "00000000-0000-0000-0000-000000000008",
                "username": "test_mode_user", "email": "test@example.com",
                "org_id": "e78d6777-35f6-4b19-994f-caaede2f021a", "is_admin": True,
                "permissions": {"all": True}, "role_permissions": {"all": True},
                "allowed_modules": sorted(MODULE_DOMAINS), "data_access_level": "organization",
            }

        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authentication token")

        try:
            payload = decode_jwt(authorization.removeprefix("Bearer "))
            if not payload.get("user_id") or not payload.get("org_id"):
                raise HTTPException(status_code=401, detail="Invalid token payload")
            require_canonical_session_authority(db)
            user = _user_from_claims(payload)
            if self.require_admin and not user["is_admin"]:
                raise HTTPException(status_code=403, detail="Admin access required")
            if user["is_admin"]:
                return user

            codes = _active_permission_codes(user["permissions"])
            if self.module and not canonical_module_access(codes, self.module):
                raise HTTPException(status_code=403, detail=f"Access denied to {self.module} module")
            if self.permission and not canonical_permission_access(codes, self.module, self.permission):
                raise HTTPException(
                    status_code=403, detail=f"Permission denied: {self.permission} on {self.module}"
                )
            return user
        except JWTError:
            logger.warning("Permission denied: invalid/expired token")
            raise HTTPException(status_code=401, detail="Token expired or invalid")
        except HTTPException:
            raise
        except Exception:
            logger.exception("Permission check failed")
            raise HTTPException(status_code=500, detail="Permission check failed")

    def _check_permission(self, user: Dict[str, Any], module: str, permission: str) -> bool:
        if user.get("is_admin"):
            return True
        raw = user.get("permissions") or user.get("role_permissions")
        return canonical_permission_access(_active_permission_codes(raw), module, permission)


class ExactAnyPermissionChecker:
    """Require one of an explicit set of canonical signed capabilities.

    Foundation master routes cross several capability domains, so the legacy
    ``master`` navigation grouping is too broad for authorization.  This
    dependency deliberately does not grant an administrator bypass: privileged
    sessions must carry one of the route's reviewed canonical capabilities.
    """

    def __init__(self, *permission_codes: str):
        normalized = tuple(dict.fromkeys(
            permission_code.strip().lower()
            for permission_code in permission_codes
        ))
        if not normalized or any(
            not permission_code or "." not in permission_code
            for permission_code in normalized
        ):
            raise ValueError("At least one exact canonical permission code is required")
        self.permission_codes = normalized

    async def __call__(
        self,
        authorization: str = Header(None),
        db: Session = Depends(get_db),
    ) -> Dict[str, Any]:
        user = await PermissionChecker()(authorization, db)
        if is_test_mode_enabled():
            return user
        codes = _active_permission_codes(user["permissions"])
        if not codes.intersection(self.permission_codes):
            raise HTTPException(
                status_code=403,
                detail="Permission denied: one of " + ", ".join(self.permission_codes),
            )
        return user


class ExactPermissionChecker(ExactAnyPermissionChecker):
    """Require one exact canonical capability from the signed ERP claims."""

    def __init__(self, permission_code: str):
        super().__init__(permission_code)
        self.permission_code = self.permission_codes[0]


def require_permission(module: str = None, permission: str = None, require_admin: bool = False):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            return await func(*args, **kwargs)
        wrapper.__annotations__["current_user"] = Depends(
            PermissionChecker(module, permission, require_admin)
        )
        return wrapper
    return decorator


async def get_current_user(
    authorization: str = Header(None),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return await PermissionChecker()(authorization, db)


def check_module_access(user: Dict[str, Any], module: str) -> bool:
    if user.get("is_admin"):
        return True
    raw = user.get("permissions") or user.get("role_permissions")
    return canonical_module_access(_active_permission_codes(raw), module)


def check_permission(user: Dict[str, Any], module: str, permission: str) -> bool:
    return PermissionChecker()._check_permission(user, module, permission)


def require_sales_permission(permission: str = "view"):
    return require_permission(MODULES["SALES"], permission)


def require_purchase_permission(permission: str = "view"):
    return require_permission(MODULES["PURCHASE"], permission)


def require_inventory_permission(permission: str = "view"):
    return require_permission(MODULES["INVENTORY"], permission)


def require_payment_permission(permission: str = "view"):
    return require_permission(MODULES["PAYMENT"], permission)


def require_reports_permission(permission: str = "view"):
    return require_permission(MODULES["REPORTS"], permission)


def require_master_permission(permission: str = "view"):
    return require_permission(MODULES["MASTER"], permission)


def require_returns_permission(permission: str = "view"):
    return require_permission(MODULES["RETURNS"], permission)


def require_admin():
    return require_permission(require_admin=True)
