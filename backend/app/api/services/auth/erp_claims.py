"""Build tenant-scoped ERP claims after external identity verification."""

from typing import Any, Dict


def build_erp_token_claims(user_data: Dict[str, Any]) -> Dict[str, Any]:
    """Map a verified ERP membership to the internal access-token contract."""
    branch_ids = user_data.get("branch_ids") or []
    data_access_to_scope = {
        "organization": "all",
        "region": "multi",
        "branch": "single",
        "own": "single",
    }
    data_access_level = user_data.get("data_access_level", "branch")
    branch_scope = data_access_to_scope.get(data_access_level, "single")
    if user_data.get("is_admin"):
        branch_scope = "all"

    role_id = user_data.get("role_id")

    return {
        "user_id": str(user_data["user_id"]),
        "email": user_data["email"],
        "org_id": str(user_data["org_id"]),
        "role_id": str(role_id) if role_id is not None else None,
        "branch_ids": [str(branch_id) for branch_id in branch_ids],
        "branch_scope": branch_scope,
        "data_access_level": data_access_level,
        "is_admin": user_data.get("is_admin", False),
        "full_name": user_data.get("full_name"),
        "permissions": user_data.get("permissions") or {},
    }
