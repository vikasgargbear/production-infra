from __future__ import annotations

import importlib.util
from pathlib import Path
import sys

import pytest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "backend/scripts/verify_staging_direct_roles.py"


def _load():
    scripts = str(ROOT / "backend/scripts")
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    spec = importlib.util.spec_from_file_location("staging_direct_roles", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _environment(tmp_path: Path) -> dict[str, str]:
    verifier = _load()
    environment = {
        variable: "A" * 48 for variable in verifier.ROLE_PASSWORD_ENV.values()
    }
    environment.update(
        {
            "SUPABASE_DB_PASSWORD": "administrator-secret",
            "CANONICAL_STAGING_PROJECT_REF": "rgihahbmkrmhitjdjvev",
            "GITHUB_ENV": str(tmp_path / "github.env"),
        }
    )
    return environment


def test_bootstrap_verifies_only_manifest_administrator(monkeypatch, tmp_path) -> None:
    verifier = _load()
    environment = _environment(tmp_path)
    roles: list[str] = []
    monkeypatch.setattr(
        verifier,
        "verify_direct_database",
        lambda **kwargs: roles.append(kwargs["role"]),
    )

    verifier.verify(environment, bootstrap_only=True)

    assert roles == ["postgres"]
    output = Path(environment["GITHUB_ENV"]).read_text(encoding="utf-8")
    assert "SUPABASE_DIRECT_DATABASE_HOST=db.rgihahbmkrmhitjdjvev.supabase.co" in output
    assert "SUPABASE_DIRECT_DATABASE_PORT=5432" in output
    assert "CANONICAL_DATABASE_TRANSPORT=direct_ipv4" in output
    assert "POOLER" not in output


def test_complete_verification_uses_exact_manifest_role_order(
    monkeypatch, tmp_path
) -> None:
    verifier = _load()
    environment = _environment(tmp_path)
    roles: list[str] = []
    monkeypatch.setattr(
        verifier,
        "verify_direct_database",
        lambda **kwargs: roles.append(kwargs["role"]),
    )

    verifier.verify(environment, bootstrap_only=False)

    assert roles == [
        "postgres",
        "erp_runtime",
        "erp_calculator",
        "erp_tax_provider",
        "erp_regulatory_importer",
    ]


def test_project_and_role_secret_drift_fail_closed(monkeypatch, tmp_path) -> None:
    verifier = _load()
    environment = _environment(tmp_path)
    with pytest.raises(
        verifier.CanonicalStagingDatabaseError,
        match="workflow project",
    ):
        verifier.verify(
            dict(environment, CANONICAL_STAGING_PROJECT_REF="a" * 20),
            bootstrap_only=True,
        )

    monkeypatch.setattr(verifier, "verify_direct_database", lambda **_kwargs: None)
    with pytest.raises(
        verifier.CanonicalStagingDatabaseError,
        match="malformed: ERP_RUNTIME_PASSWORD",
    ):
        verifier.verify(
            dict(environment, ERP_RUNTIME_PASSWORD="short"),
            bootstrap_only=False,
        )


def test_failed_verification_never_writes_environment(monkeypatch, tmp_path) -> None:
    verifier = _load()
    environment = _environment(tmp_path)

    def fail(**_kwargs) -> None:
        raise verifier.CanonicalStagingDatabaseError(
            "direct database verification failed for postgres: OperationalError"
        )

    monkeypatch.setattr(verifier, "verify_direct_database", fail)
    with pytest.raises(verifier.CanonicalStagingDatabaseError):
        verifier.verify(environment, bootstrap_only=True)
    assert not Path(environment["GITHUB_ENV"]).exists()


def test_main_rejects_unsupported_arguments() -> None:
    verifier = _load()
    assert verifier.main(["--fallback"]) == 2
