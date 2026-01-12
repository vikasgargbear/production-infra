"""
Test endpoint to verify TEST_MODE is working
"""
from fastapi import APIRouter
import os

router = APIRouter(prefix="/test", tags=["Testing"])

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
