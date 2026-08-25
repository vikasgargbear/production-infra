"""Lock compliance reads to the canonical route owners."""

from pathlib import Path
from uuid import UUID

import pytest
from fastapi import HTTPException

from app.api.routes import canonical_erp_reads
from app.main import app


ROOT = Path(__file__).resolve().parents[3]

RETIRED_PATHS = {
    "/api/gst/calculate",
    "/api/gst/verification",
    "/api/gst/compliance/status",
    "/api/gst/metrics",
    "/api/gst/reports/tax/gstr2a",
    "/api/reports/tax/hsn",
    "/api/gst/gstr2b/status",
    "/api/gst/gstr2b/mismatches",
    "/api/compliance/compliance/drug-licenses",
    "/api/compliance/compliance/drug-licenses/expiring",
    "/api/compliance/compliance/checklist",
    "/api/compliance/compliance/alerts",
    "/api/compliance/compliance/reports/regulatory",
}

CANONICAL_PATH_OWNERS = {
    "/api/gst/dashboard": "gst_dashboard",
    "/api/gst/returns/status": "gst_returns_status",
    "/api/gst/reports/gstr1": "canonical_gstr1_report",
    "/api/gst/reports/gstr3b": "canonical_gstr3b_report",
    "/api/gst/reports/credit-debit-notes": "gst_adjustment_notes",
    "/api/gst/settings": "gst_get_settings_v1",
}


def test_legacy_compliance_routes_and_sources_are_retired() -> None:
    paths = app.openapi()["paths"]
    for path in RETIRED_PATHS:
        assert path not in paths

    for relative in (
        "backend/app/api/routes/compliance/gst.py",
        "backend/app/api/routes/compliance/gstr2b.py",
        "backend/app/api/routes/compliance/compliance.py",
    ):
        assert not (ROOT / relative).exists()


def test_overlapping_gst_reads_have_one_canonical_owner() -> None:
    paths = app.openapi()["paths"]
    for path, owner in CANONICAL_PATH_OWNERS.items():
        assert set(paths[path]) >= {"get"}
        assert paths[path]["get"]["operationId"].startswith(owner)

    main_source = (ROOT / "backend/app/main.py").read_text(encoding="utf-8")
    assert "routes.compliance import" not in main_source
    assert "include_legacy_read_only_router(api, gst.router" not in main_source


def test_canonical_gst_settings_distinguishes_missing_from_ambiguous(monkeypatch) -> None:
    org_id = UUID("00000000-0000-7000-8000-000000000001")
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: org_id)

    monkeypatch.setattr(canonical_erp_reads, "_rows", lambda *_args, **_kwargs: [])
    assert canonical_erp_reads.canonical_gst_settings({}, object()) is None

    rows = [{"id": "first", "gstin": "27AAAAA0000A1Z5"},
            {"id": "second", "gstin": "29AAAAA0000A1Z1"}]
    monkeypatch.setattr(canonical_erp_reads, "_rows", lambda *_args, **_kwargs: rows)
    with pytest.raises(HTTPException) as exc:
        canonical_erp_reads.canonical_gst_settings({}, object())
    assert exc.value.status_code == 409


def test_canonical_gst_settings_returns_the_exact_stored_row(monkeypatch) -> None:
    row = {
        "id": UUID("00000000-0000-7000-8000-000000000002"),
        "gstin": "27AAAAA0000A1Z5",
        "legal_name": "Exact Stored Legal Name",
        "row_version": 7,
    }
    monkeypatch.setattr(
        canonical_erp_reads,
        "_activate",
        lambda _db, _user: UUID("00000000-0000-7000-8000-000000000001"),
    )
    monkeypatch.setattr(canonical_erp_reads, "_rows", lambda *_args, **_kwargs: [row])

    assert canonical_erp_reads.canonical_gst_settings({}, object()) == row
