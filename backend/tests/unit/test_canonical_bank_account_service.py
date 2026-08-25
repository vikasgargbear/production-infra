from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.routes import canonical_erp_reads
from app.main import app


REPO_ROOT = Path(__file__).resolve().parents[3]


def _bank_row() -> dict:
    return {
        "bank_account_id": uuid4(),
        "settlement_account_id": uuid4(),
        "settlement_account_code": "BANK-DEMO",
        "settlement_account_name": "Demo settlement",
        "bank_name": "Demo Bank",
        "account_holder_name": "Demo Company",
        "ifsc": "HDFC0000001",
        "currency_code": "INR",
        "allows_bank_reconciliation": True,
        "status": "active",
    }


def test_bank_account_read_uses_one_exact_canonical_projection(monkeypatch):
    org_id = uuid4()
    row = _bank_row()
    captured: dict[str, object] = {}
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: org_id)

    def fake_rows(_db, sql, params):
        captured["sql"] = sql
        captured["params"] = params
        return [row]

    monkeypatch.setattr(canonical_erp_reads, "_rows", fake_rows)
    result = canonical_erp_reads.canonical_bank_accounts(user={}, db=object())

    assert result.total == 1
    assert result.bank_accounts[0].bank_account_id == row["bank_account_id"]
    assert result.bank_accounts[0].settlement_account_id == row["settlement_account_id"]
    sql = str(captured["sql"])
    assert "FROM finance.bank_accounts bank" in sql
    assert "JOIN finance.accounts settlement" in sql
    assert "bank.org_id=:org_id" in sql
    assert "bank.status='active'" in sql
    assert "settlement.status='active'" in sql
    assert "settlement.account_type='asset'" in sql
    assert "bank.currency_code='INR'" in sql
    assert "account_number_ciphertext" not in sql
    assert "balance" not in sql
    assert captured["params"] == {"org_id": org_id}


def test_bank_account_projection_rejects_missing_required_identity(monkeypatch):
    row = _bank_row()
    row["bank_name"] = None
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: uuid4())
    monkeypatch.setattr(canonical_erp_reads, "_rows", lambda *_args, **_kwargs: [row])

    with pytest.raises(ValidationError, match="bank_name"):
        canonical_erp_reads.canonical_bank_accounts(user={}, db=object())


def test_retired_bank_mutations_are_not_mounted():
    paths = app.openapi()["paths"]
    for path in (
        "/api/bank-accounts/",
        "/api/bank-accounts/{account_id}",
        "/api/bank-accounts/{account_id}/set-default",
    ):
        methods = paths.get(path, {})
        assert not ({"post", "put", "patch", "delete"} & set(methods))


def test_retired_bank_route_and_service_are_not_imported_by_runtime():
    main_source = (REPO_ROOT / "backend/app/main.py").read_text(encoding="utf-8")
    assert "from .api.routes.master import bank_accounts" not in main_source
    assert "bank_accounts.router" not in main_source


def test_bank_read_requires_authentication_without_leaking_data():
    response = TestClient(app, raise_server_exceptions=False).get("/api/bank-accounts")
    assert response.status_code == 401
