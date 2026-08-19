"""The unsafe legacy onboarding route must not be deployable."""

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_legacy_initial_setup_route_is_retired():
    assert not (
        REPO_ROOT / "backend/app/api/routes/org/initial_setup.py"
    ).exists()

    main_source = (REPO_ROOT / "backend/app/main.py").read_text()
    assert 'prefix="/setup"' not in main_source
    assert "initial_setup" not in main_source


def test_openapi_has_no_unauthenticated_setup_mutation(monkeypatch):
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("TEST_MODE", "false")

    from app.main import app

    setup_paths = [path for path in app.openapi()["paths"] if path.startswith("/api/setup")]
    assert setup_paths == []
