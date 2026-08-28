from datetime import date
from decimal import Decimal
from uuid import UUID

from app.api.routes import web_operator_actions as web
from app.domain.operator_actions import ActionContext


ORG = UUID("11111111-1111-4111-8111-111111111111")
AUTH = UUID("22222222-2222-4222-8222-222222222222")
USER = UUID("33333333-3333-4333-8333-333333333333")
MEMBER = UUID("44444444-4444-4444-8444-444444444444")
GRANT = UUID("55555555-5555-4555-8555-555555555555")
BRANCH = UUID("66666666-6666-4666-8666-666666666666")
SOURCE = UUID("77777777-7777-4777-8777-777777777777")
NOTE = UUID("88888888-8888-4888-8888-888888888888")
COMMAND = UUID("99999999-9999-4999-8999-999999999999")


class _Result:
    def __init__(self, *, mapping=None, scalar=None):
        self.mapping = mapping
        self.scalar = scalar

    def mappings(self): return self
    def one_or_none(self): return self.mapping
    def scalar_one(self): return self.scalar


class _Db:
    def __init__(self, results): self.results = iter(results)
    def execute(self, *_args, **_kwargs): return next(self.results)


def _context() -> ActionContext:
    return ActionContext(
        auth_user_id=AUTH, user_id=USER, organization_id=ORG,
        membership_id=MEMBER, agent_grant_id=GRANT, client_id="aasopharma-erp-web",
        operation_key="sales.return.reversal.prepare",
        permission="finance.adjustment_note.manage", branch_ids=(BRANCH,),
        organization_scope=True,
    )


def test_source_resolution_returns_server_row_version_and_reporting_scope(monkeypatch):
    monkeypatch.setattr(web, "_resolve_context", lambda *_args, **_kwargs: _context())
    db = _Db([
        _Result(),
        _Result(mapping={
            "original_resource_id": SOURCE, "expected_row_version": 7,
            "branch_id": BRANCH, "original_adjustment_note_id": NOTE,
            "original_note_date": date(2026, 8, 25),
            "inventory_document_id": UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
        }),
        _Result(scalar=True),
    ])
    result = web.commercial_reversal_source(
        reversal_kind="sales_return", original_resource_id=SOURCE,
        user={"org_id": str(ORG), "auth_user_id": str(AUTH), "user_id": str(USER)}, db=db,
    )
    assert result.expected_row_version == 7
    assert result.reported is True and result.amendment_evidence_required is True


def test_exact_readback_requires_balanced_counter_journal_and_stock_inversion():
    ledger = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
    original_ledger = UUID("cccccccc-cccc-4ccc-8ccc-cccccccccccc")
    row = {
        "command_request_id": COMMAND, "operation": "sales.return.reversal.post",
        "reversal_adjustment_note_id": UUID("dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
        "reversal_note_status": "posted", "original_adjustment_note_id": NOTE,
        "original_note_status": "reversed", "original_return_status": "reversed",
        "reversal_journal_id": UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"),
        "reversal_journal_status": "posted", "original_journal_id": UUID("ffffffff-ffff-4fff-8fff-ffffffffffff"),
        "original_journal_status": "reversed", "journal_debit_total": Decimal("10.00"),
        "journal_credit_total": Decimal("10.00"), "reversal_tax_document_id": None,
        "original_tax_document_id": None,
        "reversal_inventory_document_id": UUID("12121212-1212-4212-8212-121212121212"),
        "original_inventory_document_id": UUID("13131313-1313-4313-8313-131313131313"),
        "reversed_allocation_count": 1,
        "stock_entries": [{
            "ledger_entry_id": ledger, "reverses_entry_id": original_ledger,
            "product_id": UUID("14141414-1414-4414-8414-141414141414"),
            "batch_id": UUID("15151515-1515-4515-8515-151515151515"),
            "location_id": UUID("16161616-1616-4616-8616-161616161616"),
            "quantity_delta": Decimal("-1.000000"), "value_delta": Decimal("-10.00"),
        }],
    }
    result = web.load_commercial_reversal_readback(
        command_request_id=COMMAND, context=_context(), db=_Db([_Result(mapping=row)]),
    )
    assert result.stock_entries[0].reverses_entry_id == original_ledger
    assert result.original_journal_status == "reversed"
