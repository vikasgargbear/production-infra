from datetime import date, datetime
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
    def __init__(self, business_date, account, evidence=(), orders=()):
        self.business_date = business_date
        self.account = account
        self.evidence = evidence
        self.orders = orders
        self.statements = []

    def execute(self, statement, params=None):
        sql = str(statement)
        self.statements.append((sql, params))
        if "current_organization_business_date" in sql:
            return _Result(scalar=self.business_date)
        if "FROM finance.bank_accounts" in sql:
            return _Result(rows=[SimpleNamespace(_mapping=self.account)])
        if "FROM core.attachments attachment" in sql:
            return _Result(rows=[SimpleNamespace(_mapping=row) for row in self.evidence])
        if "WITH active_advances" in sql:
            return _Result(rows=[SimpleNamespace(_mapping=row) for row in self.orders])
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
    assert response["evidence"] == []
    assert response["approved_goods_orders"] == []
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


def test_context_projects_only_verified_branch_evidence_and_customer_goods_orders():
    org_id, customer_id, branch_id = uuid4(), uuid4(), uuid4()
    evidence_id, order_id = uuid4(), uuid4()
    account = {
        "bank_account_id": uuid4(), "settlement_account_id": uuid4(),
        "settlement_account_code": "BANK-001", "settlement_account_name": "Bank",
        "bank_name": "Test Bank", "account_holder_name": "Org", "currency_code": "INR",
    }
    evidence = {
        "attachment_id": evidence_id, "branch_id": branch_id,
        "branch_code": "MAIN", "branch_name": "Main",
        "original_filename": "upi-receipt.pdf", "document_date": date(2026, 8, 25),
        "retention_until": date(2033, 8, 25), "status": "verified",
        "verified_at": datetime(2026, 8, 25, 9, 0),
        "sha256": "a" * 64,
    }
    order = {
        "sales_order_id": order_id, "order_number": "SO-0001",
        "order_date": date(2026, 8, 25), "branch_id": branch_id,
        "branch_code": "MAIN", "branch_name": "Main",
        "grand_total": "1000.00", "prior_active_advance": "250.00",
        "remaining_advance_amount": "750.00",
    }
    database = _Database(date(2026, 8, 25), account, [evidence], [order])
    response = reads.customer_receipt_context(
        customer_account_id=customer_id,
        user={"org_id": str(org_id), "auth_user_id": str(uuid4())}, db=database,
    ).model_dump(mode="json")

    assert response["evidence"][0]["attachment_id"] == str(evidence_id)
    assert response["approved_goods_orders"][0]["sales_order_id"] == str(order_id)
    assert response["approved_goods_orders"][0]["remaining_advance_amount"] == "750.00"
    evidence_sql = next(sql for sql, _ in database.statements if "FROM core.attachments attachment" in sql)
    order_sql = next(sql for sql, _ in database.statements if "WITH active_advances" in sql)
    assert "attachment.evidence_kind='customer_receipt_evidence'" in evidence_sql
    assert "erp_security.can_access_branch(attachment.branch_id)" in evidence_sql
    assert "source.customer_account_id=:customer_account_id" in order_sql
    assert "line.line_kind<>'product'" in order_sql
