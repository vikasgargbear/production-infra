from __future__ import annotations

from pathlib import Path

from app.core import env


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_app_env_is_the_only_runtime_mode_authority(monkeypatch) -> None:
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.setenv("ENV", "production")

    assert env.get_app_env() == "development"
    assert env.is_production() is False


def test_app_env_normalizes_reviewed_production_values(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "PROD")

    assert env.get_app_env() == "prod"
    assert env.is_production() is True


def test_deployment_guides_use_the_canonical_runtime_mode_variable() -> None:
    deployment_guides = (
        REPO_ROOT / "docs/deployment/docker.md",
        REPO_ROOT / "docs/deployment/production.md",
        REPO_ROOT / "docs/deployment/monitoring.md",
    )

    for guide in deployment_guides:
        content = guide.read_text(encoding="utf-8")
        assert "ENVIRONMENT=" not in content, guide
        assert 'os.environ.get("ENVIRONMENT"' not in content, guide
