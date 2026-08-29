from __future__ import annotations

import hashlib
import importlib.util
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from pydantic import BaseModel, ValidationError

from app.api.routes import canonical_invoice_drafts as drafts
from app.api.routes import canonical_erp_reads
from app.api.routes.internal import mcp_invoice_drafts as mcp_drafts
from app.domain.operator_actions import ActionContext, PreparedCommand


ROOT = Path(__file__).resolve().parents[3]
SQL_PATH = ROOT / "backend/alembic/sql/20260829_0064_shared_invoice_drafts.sql"
REVISION_PATH = (
    ROOT / "backend/alembic/versions/20260829_0064_shared_invoice_drafts.py"
)


def _revision_module():
    spec = importlib.util.spec_from_file_location("invoice_draft_revision", REVISION_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_is_hash_bound_tenant_scoped_and_keeps_drafts_out_of_documents():
    sql = SQL_PATH.read_text(encoding="utf-8")
    revision = _revision_module()
    assert revision.revision == "20260829_0064"
    assert revision.down_revision == "20260829_0063"
    assert hashlib.sha256(sql.encode()).hexdigest() == revision.EXPECTED_SQL_SHA256
    assert "CREATE TABLE automation.invoice_drafts" in sql
    assert "invoice_drafts_org_fk FOREIGN KEY (org_id)" in sql
    assert "REFERENCES core.organizations(id) ON DELETE RESTRICT" in sql
    assert "FORCE ROW LEVEL SECURITY" in sql
    assert "erp_security.current_org_id()" in sql
    assert "erp_security.can_access_branch(branch_id)" in sql
    assert "bind_invoice_draft_prepare" in sql
    assert "expected_row_version" in sql
    assert "prepared_command_request_id" in sql
    assert "command_row.operation<>expected_operation" in sql
    assert "command.result_resource_id" in sql
    assert "draft.branch_id=ANY(branch_ids_filter)" in sql
    assert "INSERT INTO erp_automation_commands.execution_scopes" in sql
    assert "status='cancelled'" in sql
    assert "INSERT INTO sales.invoices" not in sql
    assert "INSERT INTO procurement.supplier_invoices" not in sql
    assert "INSERT INTO finance.open_items" not in sql


def test_public_and_internal_creation_sources_cannot_be_spoofed():
    request = {
        "document_kind": "sales_invoice",
        "branch_id": uuid4(),
        "payload": {
            "schema_version": "invoice-draft.v1",
            "editor_state": {
                "invoice": {},
                "selected_customer": None,
                "current_step": 1,
            },
            "command_payload": None,
        },
    }
    assert drafts.CreateInvoiceDraftRequest(
        **request, created_via="web"
    ).created_via == "web"
    with pytest.raises(ValidationError):
        drafts.CreateInvoiceDraftRequest(**request, created_via="mcp")
    assert mcp_drafts.MCPCreateInvoiceDraftRequest(
        **request, created_via="mcp"
    ).created_via == "mcp"
    with pytest.raises(ValidationError):
        mcp_drafts.MCPCreateInvoiceDraftRequest(**request, created_via="web")


def test_document_kind_rejects_cross_editor_shape_and_response_has_edit_path():
    supplier_editor = {
        "selected_receipt_id": "",
        "invoice_number": "",
        "invoice_date": "",
        "received_date": "",
        "rates": {},
        "allocation_methods": {},
        "charge_allocation_methods": {},
        "itc_attested": False,
    }
    with pytest.raises(ValidationError):
        drafts.CreateInvoiceDraftRequest(
            document_kind="sales_invoice",
            branch_id=uuid4(),
            created_via="web",
            payload={
                "schema_version": "invoice-draft.v1",
                "editor_state": supplier_editor,
                "command_payload": None,
            },
        )
    with pytest.raises(ValidationError):
        mcp_drafts.MCPCreateInvoiceDraftRequest(
            document_kind="supplier_invoice",
            branch_id=uuid4(),
            created_via="mcp",
            payload={
                "schema_version": "invoice-draft.v1",
                "editor_state": {
                    "invoice": {},
                    "selected_customer": None,
                    "current_step": 1,
                },
                "command_payload": None,
            },
        )
    draft_id = uuid4()
    response = drafts._draft_response(
        {
            "id": draft_id,
            "document_kind": "supplier_invoice",
            "branch_id": uuid4(),
            "title": None,
            "payload": {
                "schema_version": "invoice-draft.v1",
                "editor_state": supplier_editor,
                "command_payload": None,
            },
            "payload_sha256": "a" * 64,
            "status": "open",
            "prepared_command_request_id": None,
            "posted_resource_id": None,
            "created_via": "mcp",
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "row_version": 1,
        }
    )
    assert response.edit_path == f"#/purchase/supplier-invoice?draft={draft_id}"


def test_title_only_patch_preserves_payload_at_the_contract_boundary():
    request = drafts.UpdateInvoiceDraftRequest(
        expected_row_version=2,
        title="Corrected invoice",
    )
    assert request.payload is None
    assert request.model_fields_set == {"expected_row_version", "title"}


def test_mcp_delegation_must_match_kind_and_branch():
    branch_id = uuid4()
    context = ActionContext(
        auth_user_id=uuid4(),
        user_id=uuid4(),
        organization_id=uuid4(),
        membership_id=uuid4(),
        agent_grant_id=uuid4(),
        client_id="chatgpt",
        operation_key="sales.invoice.prepare",
        permission="sales.invoice.create",
        branch_ids=(branch_id,),
    )
    assert mcp_drafts._require_kind(context, "sales_invoice", branch_id) == (
        "sales.invoice.prepare"
    )
    with pytest.raises(HTTPException) as mismatch:
        mcp_drafts._require_kind(context, "supplier_invoice", branch_id)
    assert mismatch.value.status_code == 403
    with pytest.raises(HTTPException) as wrong_branch:
        mcp_drafts._require_kind(context, "sales_invoice", uuid4())
    assert wrong_branch.value.status_code == 403


class _PreparePayload(BaseModel):
    idempotency_key: str
    branch_id: UUID
    lines: list[dict]


class _Service:
    def __init__(self):
        self.call = None

    def deployment_readiness(self):
        return True

    def adapter_readiness(self):
        return {"sales.invoice.prepare": True}

    def prepare(self, **kwargs):
        self.call = kwargs
        return PreparedCommand(
            command_request_id=uuid4(),
            command_type="sales.invoice.post",
            preview_hash="sha256:" + "a" * 64,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
            resolved_references=(),
            source_versions=(),
            calculation_ruleset=(),
            inventory_impact=(),
            financial_impact=(),
            tax_impact=(),
            required_approvals=({"policy": "actor_confirmation", "count": 1},),
        )


def test_prepare_passes_exact_revision_binding_to_shared_operator_service(monkeypatch):
    org_id = uuid4()
    branch_id = uuid4()
    draft_id = uuid4()
    context = ActionContext(
        auth_user_id=uuid4(),
        user_id=uuid4(),
        organization_id=org_id,
        membership_id=uuid4(),
        agent_grant_id=uuid4(),
        client_id="aasopharma-erp-web",
        operation_key="sales.invoice.prepare",
        permission="sales.invoice.create",
        branch_ids=(branch_id,),
    )
    row = {
        "id": draft_id,
        "document_kind": "sales_invoice",
        "branch_id": branch_id,
        "payload": {
            "schema_version": "invoice-draft.v1",
            "editor_state": {"step": "review"},
            "command_payload": {"branch_id": str(branch_id), "lines": [{}]},
        },
        "payload_sha256": "b" * 64,
        "status": "open",
        "row_version": 7,
    }
    monkeypatch.setattr(drafts, "_activate", lambda *_: org_id)
    monkeypatch.setattr(drafts, "_load", lambda *_: row)
    monkeypatch.setattr(drafts, "_ready", lambda *_: None)
    monkeypatch.setattr(drafts, "_resolve_context", lambda *_args, **_kwargs: context)
    monkeypatch.setattr(drafts, "validate_prepare_payload_semantics", lambda *_: None)
    monkeypatch.setitem(
        drafts.PREPARE_PAYLOAD_MODELS, "sales.invoice.prepare", _PreparePayload
    )
    service = _Service()
    response = drafts.prepare_draft(
        draft_id,
        drafts.InvoiceDraftVersionRequest(expected_row_version=7),
        user={"org_id": str(org_id), "auth_user_id": str(context.auth_user_id)},
        db=object(),
        service=service,
    )
    assert response.command_type == "sales.invoice.post"
    assert service.call is not None
    binding = service.call["draft_binding"]
    assert binding.draft_id == draft_id
    assert binding.expected_row_version == 7
    assert binding.payload_sha256 == "b" * 64
    assert service.call["idempotency_key"] == f"invoice-draft:{draft_id}:v7"


def test_operator_service_binds_inside_each_invoice_prepare_transaction():
    source = (
        ROOT / "backend/app/infrastructure/operator_actions/service.py"
    ).read_text(encoding="utf-8")
    supplier = source[source.index("def _prepare_supplier_invoice"):source.index("def _prepare_purchase_order")]
    sales = source[source.index("def _prepare_sales_invoice"):source.index("def _prepare_sales_return")]
    assert supplier.index("PERSIST_SUPPLIER_INVOICE_SQL") < supplier.index(
        "_BIND_INVOICE_DRAFT_SQL"
    )
    assert sales.index("PERSIST_SALES_INVOICE_SQL") < sales.index(
        "_BIND_INVOICE_DRAFT_SQL"
    )
    assert "with session.begin():" in supplier
    assert "with session.begin():" in sales


def test_document_history_excludes_unposted_authoring_aggregates():
    source = Path(canonical_erp_reads.__file__).read_text(encoding="utf-8")
    sales_history = source[
        source.index("@router.get(\"/invoices/\")"):
        source.index("class CanonicalInvoiceExecutedBatchAllocation")
    ]
    supplier_history = source[
        source.index("@router.get(\"/supplier-invoices/\")"):
        source.index("@router.get(\"/supplier-invoices/returnable/\")")
    ]
    assert "posted_only=True" in sales_history
    assert "AND invoice.status='posted'" in supplier_history
