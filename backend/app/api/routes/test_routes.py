"""
Test endpoint to verify TEST_MODE is working
"""
from fastapi import APIRouter, Depends
import os

from ...core.auth.org_context import get_org_context, OrgContext

router = APIRouter(prefix="/test", tags=["Testing"], include_in_schema=False)

@router.get("/env-check")
async def check_test_mode():
    """Check if TEST_MODE is enabled - FOR TESTING ONLY"""
    test_mode = os.getenv("TEST_MODE", "not set")
    test_org_id = os.getenv("TEST_ORG_ID", "not set")
    
    return {
        "TEST_MODE": test_mode,
        "TEST_MODE_enabled": test_mode.lower() in ("true", "1", "yes"),
        "TEST_ORG_ID": test_org_id,
        "message": "⚠️ This endpoint should be disabled in production!"
    }

@router.get("/auth-bypass-check")
async def check_auth_bypass(context: OrgContext = Depends(get_org_context)):
    """Test if auth bypass actually works - should not require token when TEST_MODE=true"""
    return {
        "success": True,
        "message": "✅ Auth bypass working!",
        "org_id": str(context.org_id),
        "user_id": context.user_id,
        "branch_scope": context.branch_scope.value
    }
