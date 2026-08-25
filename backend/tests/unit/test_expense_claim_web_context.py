from datetime import date, datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from app.api.routes import web_operator_actions as web


class _Result:
    def __init__(self, rows):
        self._rows = [SimpleNamespace(_mapping=row) for row in rows]

    def fetchall(self):
        return self._rows

    def first(self):
        return self._rows[0] if self._rows else None


class _Db:
    def __init__(self, result_sets):
        self._result_sets = iter(result_sets)
        self.calls = []

    def execute(self, statement, params):
        self.calls.append((str(statement), params))
        return _Result(next(self._result_sets))


def test_expense_context_returns_only_authoritative_eligible_facts(monkeypatch):
    org_id, branch_id, membership_id = (uuid4() for _ in range(3))
    expense_account_id, reimbursement_account_id, receipt_id = (
        uuid4() for _ in range(3)
    )
    business_date = date(2026, 8, 25)
    monkeypatch.setattr(
        web,
        "_resolve_context",
        lambda *_args, **_kwargs: SimpleNamespace(
            organization_id=org_id,
            membership_id=membership_id,
        ),
    )
    db = _Db(
        [
            [
                {
                    "organization_id": org_id,
                    "branch_id": branch_id,
                    "branch_code": "MAIN",
                    "branch_name": "Main Branch",
                    "claimant_membership_id": membership_id,
                    "claimant_display_name": "Canonical Claimant",
                    "business_date": business_date,
                }
            ],
            [
                {
                    "account_id": expense_account_id,
                    "account_code": "TRAVEL",
                    "account_name": "Business travel",
                    "account_type": "expense",
                    "currency_code": "INR",
                },
                {
                    "account_id": reimbursement_account_id,
                    "account_code": "MEMBER-PAYABLE",
                    "account_name": "Member reimbursement payable",
                    "account_type": "liability",
                    "currency_code": "INR",
                },
            ],
            [
                {
                    "receipt_attachment_id": receipt_id,
                    "original_filename": "receipt-168.pdf",
                    "media_type": "application/pdf",
                    "byte_size": 512,
                    "document_date": business_date,
                    "status": "verified",
                    "verified_at": datetime(2026, 8, 25, tzinfo=timezone.utc),
                    "retention_until": date(2034, 8, 25),
                    "sha256": "a" * 64,
                }
            ],
        ]
    )

    response = web.expense_claim_context(branch_id=branch_id, user={}, db=db)

    assert response.organization_id == org_id
    assert response.claimant_membership_id == membership_id
    assert response.business_date == business_date
    assert response.tax_treatment == "non_creditable_gross_expense"
    assert [row.account_id for row in response.expense_accounts] == [
        expense_account_id
    ]
    assert [row.account_id for row in response.reimbursement_accounts] == [
        reimbursement_account_id
    ]
    assert [row.receipt_attachment_id for row in response.receipts] == [receipt_id]
    assert "erp_security.has_permission('finance.expense.manage',branch.id)" in db.calls[0][0]
    assert "account.account_type IN ('expense','liability')" in db.calls[1][0]
    assert "prior_claim.status NOT IN ('rejected','cancelled')" in db.calls[2][0]
    assert "financial." not in "\n".join(sql for sql, _ in db.calls)


def test_expense_context_keeps_unsupported_modes_explicit(monkeypatch):
    org_id, branch_id, membership_id = (uuid4() for _ in range(3))
    monkeypatch.setattr(
        web,
        "_resolve_context",
        lambda *_args, **_kwargs: SimpleNamespace(
            organization_id=org_id,
            membership_id=membership_id,
        ),
    )
    header = {
        "organization_id": org_id,
        "branch_id": branch_id,
        "branch_code": "MAIN",
        "branch_name": "Main Branch",
        "claimant_membership_id": membership_id,
        "claimant_display_name": "Canonical Claimant",
        "business_date": date(2026, 8, 25),
    }
    response = web.expense_claim_context(
        branch_id=branch_id,
        user={},
        db=_Db([[header], [], []]),
    )
    assert {
        "gst_input_tax_credit",
        "withholding",
        "foreign_currency",
        "mileage_or_per_diem",
        "cash_advance",
        "partial_approval",
    }.issubset(response.unsupported_modes)
