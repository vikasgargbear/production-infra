from datetime import date
from types import SimpleNamespace
from uuid import uuid4

from app.api.routes import canonical_customer_receipt_reads as reads
from app.main import app


class _Result:
    def __init__(self, *, scalar=None, rows=()):
        self._scalar = scalar
        self._rows = rows

    def scalar_one(self):
        return self._scalar

    def fetchall(self):
        return self._rows


class _Database:
    def __init__(self, business_date, account):
        self.business_date = business_date
        self.account = account
        self.statements = []

    def execute(self, statement, params=None):
        sql = str(statement)
        self.statements.append((sql, params))
        if "current_organization_business_date" in sql:
            return _Result(scalar=self.business_date)
        if "FROM finance.bank_accounts" in sql:
            return _Result(rows=[SimpleNamespace(_mapping=self.account)])
        return _Result()


def test_context_uses_command_schema_business_date_and_settlement_uuid():
    org_id = uuid4()
    account = {
        "bank_account_id": uuid4(),
        "settlement_account_id": uuid4(),
        "settlement_account_code": "BANK-001",
        "settlement_account_name": "Operating Bank",
        "bank_name": "Test Bank",
        "account_holder_name": "Test Organization",
        "currency_code": "INR",
    }
    database = _Database(date(2026, 8, 25), account)
    response = reads.customer_receipt_context(
        user={"org_id": str(org_id), "auth_user_id": str(uuid4())},
        db=database,
    ).model_dump(mode="json")

    assert response["business_date"] == "2026-08-25"
    assert response["payment_methods"] == [
        "cash", "cheque", "bank_transfer", "card", "upi"
    ]
    assert response["settlement_accounts"][0]["bank_account_id"] == str(
        account["bank_account_id"]
    )
    assert "erp_security.activate_context" in database.statements[0][0]
    assert "current_organization_business_date" in database.statements[1][0]
    assert "CURRENT_DATE" not in database.statements[1][0]
    assert "finance.bank_accounts" in database.statements[2][0]
    assert "master." not in database.statements[2][0]


def test_context_openapi_is_typed_and_legacy_ledger_is_absent():
    paths = app.openapi()["paths"]
    response = paths["/api/canonical/customer-receipts/context"]["get"]["responses"][
        "200"
    ]["content"]["application/json"]["schema"]
    assert response == {"$ref": "#/components/schemas/CustomerReceiptContext"}
    assert "/api/ledger/statement/{party_id}" not in paths
    assert "/api/ledger/summary" not in paths
    assert "/api/canonical/party-ledger/{party_account_id}" in paths
