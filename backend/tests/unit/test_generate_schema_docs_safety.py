from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/generate_schema_docs.py"


def _module():
    spec = importlib.util.spec_from_file_location("generate_schema_docs", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_database_url_is_required_without_a_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(RuntimeError, match="DATABASE_URL is required"):
        _module().configured_database_url()


def test_main_redacts_password_and_requests_read_only_session(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    module = _module()
    secret = "do-not-print-this-password"
    monkeypatch.setenv(
        "DATABASE_URL",
        f"postgresql://schema_reader:{secret}@db.example.test:5432/erp",
    )
    observed = {}

    class FakeEngine:
        pass

    def fake_create_engine(url, **kwargs):
        observed["url"] = url
        observed["kwargs"] = kwargs
        return FakeEngine()

    monkeypatch.setattr(module, "create_engine", fake_create_engine)
    monkeypatch.setattr(module, "get_all_schemas_and_tables", lambda _engine: [])

    module.main()

    output = capsys.readouterr().out
    assert secret not in output
    assert "schema_reader:***@db.example.test:5432/erp" in output
    assert observed["url"].endswith(f":{secret}@db.example.test:5432/erp")
    assert observed["kwargs"]["connect_args"] == {
        "options": "-c default_transaction_read_only=on"
    }
