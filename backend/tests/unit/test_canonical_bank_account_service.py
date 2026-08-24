import asyncio
from pathlib import Path
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api.services.master.bank_account_service import BankAccountService
from app.api.routes.master.bank_accounts.routes import (
    create_bank_account,
    delete_bank_account,
    get_bank_accounts,
    set_default_account,
    update_bank_account,
)
from app.main import app


REPO_ROOT = Path(__file__).resolve().parents[3]


class _Database:
    def __init__(self):
        self.statement = ""
        self.params = {}

    def execute(self, statement, params):
        self.statement = str(statement)
        self.params = params
        return [SimpleNamespace(_mapping={
            "bank_account_id": uuid4(),
            "settlement_account_id": uuid4(),
            "org_id": uuid4(),
            "code": "BANK-DEMO",
            "name": "Demo settlement",
            "account_name": "Demo settlement",
            "account_number": "••••",
            "account_type": "asset",
            "bank_name": "Demo Bank",
            "branch_name": None,
            "ifsc_code": "HDFC0000001",
            "swift_code": None,
            "bank_address": None,
            "is_default_account": False,
            "is_payment_account": True,
            "allows_bank_reconciliation": False,
            "is_active": True,
            "currency_code": "INR",
            "balance": Decimal("125.50"),
            "created_at": None,
            "updated_at": None,
        })]


def test_bank_account_read_uses_canonical_tenant_scoped_tables():
    database = _Database()
    rows = BankAccountService.list_bank_accounts(database, "org-1")

    assert "FROM finance.bank_accounts bank" in database.statement
    assert "JOIN finance.accounts account" in database.statement
    assert "bank.org_id=:org_id" in database.statement
    assert "bank.status='active'" in database.statement
    assert "account.status='active'" in database.statement
    assert "account.allows_bank_reconciliation=true" not in database.statement
    assert "master.org_bank_accounts" not in database.statement
    assert "account_number_ciphertext" not in database.statement
    assert database.params == {"org_id": "org-1"}
    assert rows[0]["account_number"] == "••••"
    assert rows[0]["allows_bank_reconciliation"] is False
    assert rows[0]["balance"] == Decimal("125.50")


def test_bank_account_route_serializes_balance_as_exact_money(monkeypatch):
    account_id = uuid4()
    settlement_account_id = uuid4()
    org_id = uuid4()
    monkeypatch.setattr(BankAccountService, "list_bank_accounts", lambda *_: [{
        "bank_account_id": account_id,
        "settlement_account_id": settlement_account_id,
        "org_id": org_id,
        "account_name": "Demo settlement",
        "allows_bank_reconciliation": False,
        "balance": Decimal("125.50"),
    }])

    result = asyncio.run(get_bank_accounts.__wrapped__(
        _={}, db=SimpleNamespace(), context=SimpleNamespace(org_id=org_id)
    ))

    assert result[0]["id"] == account_id
    assert result[0]["bank_account_id"] == account_id
    assert result[0]["settlement_account_id"] == settlement_account_id
    assert result[0]["allows_bank_reconciliation"] is False
    assert result[0]["balance"] == "125.50"


@pytest.mark.parametrize(
    ("handler", "kwargs"),
    [
        (create_bank_account, {}),
        (update_bank_account, {"account_id": "bank-from-another-org"}),
        (delete_bank_account, {"account_id": "bank-from-another-org"}),
        (set_default_account, {"account_id": "bank-from-another-org"}),
    ],
)
def test_bank_account_mutations_fail_closed_without_database_access(handler, kwargs):
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            handler.__wrapped__(
                _={}, context=SimpleNamespace(org_id=uuid4()), **kwargs
            )
        )

    assert exc_info.value.status_code == 503
    assert "reviewed finance command" in str(exc_info.value.detail)


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/api/bank-accounts/"),
        ("put", "/api/bank-accounts/not-our-bank"),
        ("delete", "/api/bank-accounts/not-our-bank"),
        ("put", "/api/bank-accounts/not-our-bank/set-default"),
    ],
)
def test_bank_account_mutations_are_not_mounted_until_a_canonical_command_exists(method, path):
    response = TestClient(app, raise_server_exceptions=False).request(
        method.upper(), path, json={"unexpected": "legacy payload"}
    )

    assert response.status_code in {404, 405}


def test_bank_account_write_surface_contains_no_legacy_table_mutations():
    route_source = (
        REPO_ROOT / "backend/app/api/routes/master/bank_accounts/routes.py"
    ).read_text()
    service_source = (
        REPO_ROOT / "backend/app/api/services/master/bank_account_service.py"
    ).read_text()

    assert 'PermissionChecker("master", "create")' in route_source
    assert route_source.count('PermissionChecker("master", "edit")') >= 2
    assert 'PermissionChecker("master", "delete")' in route_source
    assert "master.org_bank_accounts" not in route_source
    assert "master.org_bank_accounts" not in service_source
