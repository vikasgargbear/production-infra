from __future__ import annotations

from app.core.auth.supabase_auth import SupabaseAuthService


def test_runtime_auth_surface_has_no_supabase_admin_capabilities(monkeypatch) -> None:
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "must-not-be-loaded")
    service = SupabaseAuthService()

    assert not hasattr(service, "supabase_service_key")
    assert not hasattr(service, "create_auth_user")
    assert not hasattr(service, "update_user_metadata")
    assert not hasattr(service, "delete_auth_user")
