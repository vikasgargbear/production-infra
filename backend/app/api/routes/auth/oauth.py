"""Supabase-backed identity exchange for ERP sessions."""

import logging
from datetime import timedelta
from typing import Any, Dict
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from ....core.auth.jwt_auth import create_access_token
from ....core.auth.supabase_auth import supabase_auth
from ....core.database import get_db
from ....repositories.user_repository import UserRepository
from ...services.auth import build_erp_token_claims


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/oauth", tags=["OAuth Authentication"])
bearer = HTTPBearer(auto_error=False)


@router.post("/supabase/session")
async def exchange_supabase_session(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Exchange a verified Supabase identity for a tenant-scoped ERP token."""
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Supabase bearer token is required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    identity = await supabase_auth.get_user_from_access_token(credentials.credentials)
    if not identity.get("email_confirmed_at"):
        raise HTTPException(status_code=403, detail="Verified email is required")

    try:
        auth_user_id = UUID(str(identity["id"]))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid Supabase identity") from exc

    user_data = UserRepository.find_by_auth_user_id(auth_user_id, db)
    if not user_data:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "erp_membership_required",
                "message": "Your identity is not linked to an ERP organization.",
            },
        )
    if not user_data["is_active"]:
        raise HTTPException(status_code=403, detail="Account is disabled")
    if not user_data["org_active"]:
        raise HTTPException(status_code=403, detail="Organization is disabled")
    if str(user_data["email"]).lower() != str(identity["email"]).lower():
        raise HTTPException(status_code=403, detail="ERP membership email does not match identity")

    token_data = build_erp_token_claims(user_data)
    token_data["auth_user_id"] = str(auth_user_id)
    token_data["auth_provider"] = identity.get("app_metadata", {}).get("provider")
    access_token = create_access_token(token_data, expires_delta=timedelta(hours=1))
    UserRepository.update_last_login(user_data["user_id"], db)

    logger.info("Supabase session exchanged for user_id=%s", user_data["user_id"])
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": 3600,
        "user": {
            "id": user_data["user_id"],
            "email": user_data["email"],
            "full_name": user_data["full_name"],
            "org_id": str(user_data["org_id"]),
            "org_name": user_data["org_name"],
            "role_id": user_data["role_id"],
            "branch_ids": user_data["branch_ids"],
            "permissions": user_data["permissions"],
        },
    }


@router.get("/providers")
async def list_oauth_providers() -> Dict[str, Any]:
    configured = bool(supabase_auth.supabase_url and supabase_auth.supabase_anon_key)
    return {
        "providers": [
            {"name": "email", "enabled": configured},
            {"name": "google", "enabled": configured},
        ],
        "supabase_configured": configured,
    }


@router.get("/status")
async def oauth_status() -> Dict[str, Any]:
    configured = bool(supabase_auth.supabase_url and supabase_auth.supabase_anon_key)
    return {
        "enabled": configured,
        "providers_configured": ["email", "google"] if configured else [],
        "setup_required": not configured,
    }
