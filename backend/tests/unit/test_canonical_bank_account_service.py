import asyncio
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

from app.api.services.master.bank_account_service import BankAccountService
from app.api.routes.master.bank_accounts.routes import get_bank_accounts


class _Database:
    def __init__(self):
        self.statement = ""
        self.params = {}

    def execute(self, statement, params):
        self.statement = str(statement)
        self.params = params
        return [SimpleNamespace(_mapping={
            "bank_account_id": uuid4(),
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
    assert "master.org_bank_accounts" not in database.statement
    assert "account_number_ciphertext" not in database.statement
    assert database.params == {"org_id": "org-1"}
    assert rows[0]["account_number"] == "••••"
    assert rows[0]["balance"] == Decimal("125.50")


def test_bank_account_route_serializes_balance_as_exact_money(monkeypatch):
    account_id = uuid4()
    org_id = uuid4()
    monkeypatch.setattr(BankAccountService, "list_bank_accounts", lambda *_: [{
        "bank_account_id": account_id,
        "org_id": org_id,
        "account_name": "Demo settlement",
        "balance": Decimal("125.50"),
    }])

    result = asyncio.run(get_bank_accounts.__wrapped__(
        _={}, db=SimpleNamespace(), context=SimpleNamespace(org_id=org_id)
    ))

    assert result[0]["id"] == account_id
    assert result[0]["balance"] == "125.50"
