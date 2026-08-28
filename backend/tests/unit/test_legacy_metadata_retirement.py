"""Guard retirement of the unversioned legacy metadata authority."""

from pathlib import Path

from app.main import app


ROOT = Path(__file__).resolve().parents[3]


def test_legacy_metadata_router_is_deleted_and_unmounted() -> None:
    assert not (ROOT / "backend/app/api/routes/metadata.py").exists()

    main_source = (ROOT / "backend/app/main.py").read_text(encoding="utf-8")
    assert "from .api.routes import metadata" not in main_source
    assert "include_router(metadata.router" not in main_source

    metadata_paths = {
        path for path in app.openapi()["paths"] if path.startswith("/api/metadata/")
    }
    assert metadata_paths == set()


def test_no_unreviewed_metadata_facts_survive_in_backend_route_source() -> None:
    route_sources = ROOT / "backend/app/api/routes"
    combined = "\n".join(
        path.read_text(encoding="utf-8")
        for path in route_sources.rglob("*.py")
    )

    for retired_fact in (
        "Standard Plan",
        "A - Excellent",
        "2/10 Net 30",
        '"GST_18"',
        '"payment_terms_days": row.payment_terms_days or 30',
    ):
        assert retired_fact not in combined
