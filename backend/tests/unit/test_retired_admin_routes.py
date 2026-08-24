from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_retired_user_and_role_crud_are_not_mounted() -> None:
    main_source = (REPO_ROOT / "backend/app/main.py").read_text()

    assert "api.routes.auth import users" not in main_source
    assert "roles as role_management" not in main_source
    assert "include_router(users.router" not in main_source
    assert "include_router(role_management.router" not in main_source


def test_admin_ui_documents_the_canonical_fail_closed_boundary() -> None:
    user_screen = (
        REPO_ROOT / "frontend/src/components/master/settings/UserManagement.tsx"
    ).read_text()
    role_screen = (
        REPO_ROOT / "frontend/src/components/master/settings/RoleManagement.tsx"
    ).read_text()

    assert "Do not reconnect this screen to the retired /users CRUD routes" in user_screen
    assert "Do not reconnect this screen to the retired /roles CRUD routes" in role_screen
