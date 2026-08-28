from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_retired_user_and_role_crud_are_not_mounted() -> None:
    main_source = (REPO_ROOT / "backend/app/main.py").read_text()

    assert "api.routes.auth import users" not in main_source
    assert "roles as role_management" not in main_source
    assert "include_router(users.router" not in main_source
    assert "include_router(role_management.router" not in main_source


def test_retired_user_and_role_crud_implementations_are_deleted() -> None:
    assert not (REPO_ROOT / "backend/app/api/routes/auth/users.py").exists()
    assert not (REPO_ROOT / "backend/app/api/routes/auth/roles.py").exists()
    assert not (REPO_ROOT / "backend/app/core/security/role_management.py").exists()


def test_frontend_has_no_retired_user_or_role_api_client() -> None:
    frontend = REPO_ROOT / "frontend/src"
    production_sources = "\n".join(
        path.read_text()
        for path in frontend.rglob("*.ts*")
        if "__tests__" not in path.parts and not path.name.endswith(".test.tsx")
    )

    assert "usersApi" not in production_sources
    assert "roleManagementApi" not in production_sources
    assert "'/users'" not in production_sources
    assert "'/roles'" not in production_sources


def test_admin_ui_uses_only_the_bounded_canonical_invitation_surface() -> None:
    user_screen = (
        REPO_ROOT / "frontend/src/components/master/settings/UserManagement.tsx"
    ).read_text()
    invitation_client = (
        REPO_ROOT
        / "frontend/src/services/api/modules/org/organizationInvitations.api.ts"
    ).read_text()
    role_screen = (
        REPO_ROOT / "frontend/src/components/master/settings/RoleManagement.tsx"
    ).read_text()

    assert "organizationInvitations.api" in user_screen
    assert "/auth/onboarding/invitations/context" in invitation_client
    assert "/auth/onboarding/invitations" in invitation_client
    assert "'/users'" not in user_screen
    assert "Do not reconnect this screen to the retired /roles CRUD routes" in role_screen
