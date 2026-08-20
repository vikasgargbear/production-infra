#!/usr/bin/env python3
"""Generate atomic invoice, return, and adjustment-note posting authority."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
CANONICAL_ROOT = ROOT.parent
REPO_ROOT = CANONICAL_ROOT.parents[1]
DOMAIN_ROOT = CANONICAL_ROOT / "domains"
BASELINE_GENERATOR = REPO_ROOT / "backend" / "scripts" / "generate_canonical_baseline.py"
SOURCE_MANIFEST = CANONICAL_ROOT / "commands_trade_v2" / "trade-posting-manifest.json"
MAPPING_PATH = ROOT / "baseline-commercial-command-enforcements.json"
MANIFEST_PATH = ROOT / "commercial-command-manifest.json"
TRADE_V2_GENERATOR = CANONICAL_ROOT / "commands_trade_v2" / "generate_trade_posting_contract.py"
SCHEMA = "erp_commercial_commands"


class ContractError(RuntimeError):
    """The readiness contract no longer matches its source or catalog."""


TARGETS = (
    "procurement.purchase_return_lines:procurement_purchase_return_lines_invariant_1",
    "procurement.purchase_returns:procurement_purchase_returns_invariant_1",
    "procurement.supplier_invoice_lines:procurement_supplier_invoice_lines_invariant_1",
    "procurement.supplier_invoices:procurement_supplier_invoices_invariant_1",
    "sales.invoice_lines:sales_invoice_lines_invariant_1",
    "sales.invoices:sales_invoices_invariant_1",
    "sales.return_lines:sales_return_lines_invariant_1",
    "sales.returns:sales_returns_invariant_1",
)

GENERIC_TARGETS = (
    "finance.adjustment_note_lines:adjustment_note_lines_cross_row_guard",
    "finance.adjustment_notes:adjustment_notes_cross_row_guard",
    "tax.documents:documents_cross_row_guard",
)

GENERIC_CATALOG_CHANGES = [
    {
        "table": "calculation.artifacts",
        "add_columns": [["adjustment_note_id", "uuid", True]],
        "foreign_keys": ["(org_id,adjustment_note_id) -> finance.adjustment_notes(org_id,id) RESTRICT"],
        "checks": ["typed aggregate XOR includes adjustment_note_id"],
        "authority_change": "Issue and consume adjustment_note artifacts only for the reviewed note operation and exact approved row_version.",
    },
    {
        "table": "finance.adjustment_notes",
        "add_columns": [
            ["document_effect", "text", False],
            ["rounding_policy", "text", False],
            ["document_discount_kind", "text", False],
            ["document_discount_basis", "text", False],
            ["document_discount_value", "numeric(20,6)", False],
            ["calculation_ruleset_version", "varchar(64)", False],
            ["gst_adjustment_rule_version_id", "uuid", False],
            ["gst_tax_treatment", "text", False],
            ["counterparty_portal_document_line_id", "uuid", True],
            ["recipient_itc_reversal_evidence_attachment_id", "uuid", True],
            ["recipient_itc_reversal_confirmed_at", "timestamptz", True],
        ],
        "checks": ["rounding and discount policy use the same fixed calculation vocabulary as invoices"],
    },
    {
        "table": "finance.adjustment_note_lines",
        "add_columns": [
            ["sales_invoice_line_id", "uuid", True],
            ["supplier_invoice_line_id", "uuid", True],
            ["charge_code", "text", True],
            ["quoted_amount", "numeric(20,2)", True],
            ["free_quantity", "numeric(20,6)", True],
            ["uom_conversion_factor", "numeric(20,6)", True],
            ["base_billed_quantity", "numeric(20,6)", True],
            ["base_free_quantity", "numeric(20,6)", True],
            ["free_supply_tax_treatment", "text", True],
            ["line_discount_kind", "text", False],
            ["line_discount_basis", "text", False],
            ["line_discount_value", "numeric(20,6)", False],
            ["document_discount_eligible", "boolean", False],
            ["line_discount_amount", "numeric(20,2)", False],
            ["line_taxable_discount_amount", "numeric(20,2)", False],
            ["document_discount_amount", "numeric(20,2)", False],
            ["document_taxable_discount_amount", "numeric(20,2)", False],
            ["final_residual", "boolean", False],
            ["gst_tax_treatment", "text", False],
            ["inventory_cost_treatment", "text", True],
            ["itc_eligibility", "text", True],
        ],
        "foreign_keys": [
            "(org_id,sales_invoice_line_id) -> sales.invoice_lines(org_id,id) RESTRICT",
            "(org_id,supplier_invoice_line_id) -> procurement.supplier_invoice_lines(org_id,id) RESTRICT",
        ],
        "checks": ["decrease lines require exactly the side-compatible typed original line"],
    },
    {
        "table": "tax.documents",
        "remove_columns": [["taxable_advance_payment_id", "uuid"]],
        "remove_source_classes": ["taxable_advance"],
        "deferred_scope": "Multi-rate service advances require a future reviewed typed taxable-advance aggregate; finance.payments is not tax evidence.",
    },
]


REQUIRED_CATALOG_CHANGES: list[dict[str, Any]] = [
    {
        "table": "finance.adjustment_notes",
        "add_columns": [
            ["sales_return_id", "uuid", True],
            ["purchase_return_id", "uuid", True],
            ["adjusts_open_item_id", "uuid", True],
            ["gst_adjustment_rule_version_id", "uuid", False],
            ["gst_tax_treatment", "text", False],
            ["counterparty_portal_document_line_id", "uuid", True],
            ["recipient_itc_reversal_evidence_attachment_id", "uuid", True],
            ["recipient_itc_reversal_confirmed_at", "timestamptz", True],
        ],
        "foreign_keys": [
            {
                "columns": ["org_id", "sales_return_id"],
                "references": "sales.returns(org_id,id)",
                "on_delete": "RESTRICT",
                "deferrable": "INITIALLY_DEFERRED",
            },
            {
                "columns": ["org_id", "purchase_return_id"],
                "references": "procurement.purchase_returns(org_id,id)",
                "on_delete": "RESTRICT",
                "deferrable": "INITIALLY_DEFERRED",
            },
        ],
        "partial_unique_indexes": [
            "(org_id,sales_return_id) WHERE sales_return_id IS NOT NULL",
            "(org_id,purchase_return_id) WHERE purchase_return_id IS NOT NULL",
        ],
        "checks": [
            "num_nonnulls(sales_return_id,purchase_return_id)<=1",
            "side='sales' requires sales_invoice_id, forbids supplier_invoice_id/purchase_return_id",
            "invoiced purchase adjustments require supplier_invoice_id and adjusts_open_item_id; uninvoiced purchase returns require neither",
        ],
        "invariant_change": (
            "A return-owned adjustment copies the locked original invoice, calculation artifact and return; "
            "its typed return link is immutable and owns exactly one tax document and accounting event."
        ),
    },
    {
        "table": "procurement.purchase_returns",
        "add_columns": [
            ["return_source_kind", "text", False],
            ["supplier_invoice_id", "uuid", True],
            ["supplier_credit_note_portal_line_id", "uuid", True],
            ["gst_adjustment_rule_version_id", "uuid", False],
            ["gst_tax_treatment", "text", False],
        ],
        "foreign_keys": [
            {
                "columns": ["org_id", "supplier_invoice_id"],
                "references": "procurement.supplier_invoices(org_id,id)",
                "on_delete": "RESTRICT",
                "deferrable": False,
            }
        ],
        "checks": [
            "return_source_kind IN ('invoiced','uninvoiced')",
            "(return_source_kind='invoiced')=(supplier_invoice_id IS NOT NULL)",
        ],
        "invariant_change": (
            "Invoiced lines require allocations from the one supplier invoice. Uninvoiced lines forbid those "
            "allocations, reverse exact goods-receipt cost only, and cannot create a GST adjustment."
        ),
    },
    {
        "table": "sales.return_lines",
        "add_columns": [["final_residual", "boolean", False], ["gst_tax_treatment", "text", False]],
        "checks": [],
        "invariant_change": "The immutable flag must equal the consumed reversal artifact for this line.",
    },
    {
        "table": "procurement.purchase_return_lines",
        "add_columns": [["final_residual", "boolean", False], ["gst_tax_treatment", "text", False]],
        "checks": [],
        "invariant_change": "The immutable flag must equal the consumed reversal artifact for this line.",
    },
    {
        "table": "sales.returns",
        "add_columns": [
            ["gst_adjustment_rule_version_id", "uuid", False],
            ["gst_tax_treatment", "text", False],
            ["recipient_itc_reversal_evidence_attachment_id", "uuid", True],
            ["recipient_itc_reversal_confirmed_at", "timestamptz", True],
        ],
        "checks": ["statutory sales decreases require retained recipient ITC-reversal evidence; commercial_only has zero GST"],
        "invariant_change": "The effective reviewed GST rule chooses statutory tax reduction or a financial-only credit.",
    },
    {
        "table": "sales.invoice_lines",
        "add_columns": [["revenue_account_id", "uuid", False]],
        "foreign_keys": [
            {
                "columns": ["org_id", "revenue_account_id"],
                "references": "finance.accounts(org_id,id)",
                "on_delete": "RESTRICT",
                "deferrable": False,
            }
        ],
        "invariant_change": "Posting locks an active income account in the invoice currency for every line.",
    },
    {
        "table": "procurement.supplier_invoice_lines",
        "add_columns": [
            ["net_value_account_id", "uuid", False],
            ["itc_eligibility", "text", False],
        ],
        "foreign_keys": [
            {
                "columns": ["org_id", "net_value_account_id"],
                "references": "finance.accounts(org_id,id)",
                "on_delete": "RESTRICT",
                "deferrable": False,
            }
        ],
        "checks": [
            "itc_eligibility IN ('eligible','ineligible','blocked','deferred')",
            "inventory_cost_treatment='capitalize' requires an asset net-value account",
            "inventory_cost_treatment='expense' requires an expense net-value account",
        ],
        "invariant_change": (
            "Eligible GST posts to configured ITC assets; noncreditable GST is routed using "
            "inventory_cost_treatment and the explicit account. RCM posts the configured liability and "
            "the eligibility-directed debit."
        ),
    },
    {
        "table": "sales.invoices",
        "replace_check": "invoice_type IN ('tax_invoice','bill_of_supply')",
        "invariant_change": "Credit and debit notes are exclusively finance.adjustment_notes.",
    },
]


ACCOUNT_ROLE_SETTINGS = {
    "namespace": "finance.account_roles",
    "resolution": "active branch setting first, then active organization setting; value_type='text' UUID",
    "required_roles": {
        "accounts_receivable": "active asset account with allows_party_posting",
        "accounts_payable": "active liability account with allows_party_posting",
        "sales_revenue": "active income account without party posting",
        "supplier_prepayment": "active asset account with allows_party_posting",
        "income_tax_tds_payable": "active liability account",
        "gst_tds_payable": "active liability account",
        "input_cgst": "active asset account",
        "input_sgst": "active asset account",
        "input_igst": "active asset account",
        "input_cess": "active asset account",
        "output_cgst": "active liability account",
        "output_sgst": "active liability account",
        "output_igst": "active liability account",
        "output_cess": "active liability account",
        "rcm_cgst_payable": "active liability account",
        "rcm_sgst_payable": "active liability account",
        "rcm_igst_payable": "active liability account",
        "rcm_cess_payable": "active liability account",
        "goods_received_not_invoiced": "active liability account",
        "purchase_return_inventory_variance": "active expense account",
        "inventory_asset": "active asset account",
        "inventory_count_gain": "active income account without party posting",
        "cost_of_goods_sold": "active expense account",
        "rounding_gain": "active income account",
        "rounding_loss": "active expense account",
    },
}


ATOMIC_POSTING_ORDER = [
    "assert tenant, active actor, exact branch permissions and request context",
    "claim the operation/idempotency key and lock the typed aggregate plus originals in UUID order",
    "parse fixed calculation input/output bytes and compare every persisted calculation field",
    "validate effective tax-code versions, registrations, account mappings and line accounts",
    "post required typed inventory command and lock its ledger entries",
    "derive COGS/inventory value only from the posted ledger, never from request payloads",
    "consume the calculation artifact exactly once",
    "freeze the source and lines, then insert tax document, balanced journal and accounting event",
    "insert receivable/payable open item or typed compensating adjustment",
    "verify one-to-one companion ownership and finish the idempotency claim",
]


def _load_baseline():
    spec = importlib.util.spec_from_file_location("commercial_baseline", BASELINE_GENERATOR)
    if spec is None or spec.loader is None:
        raise ContractError("cannot import canonical baseline generator")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"), sort_keys=True)


def _catalog_hash() -> str:
    catalog = _load_baseline().load_and_validate_catalog(DOMAIN_ROOT)
    payload = {"contract": catalog.contract, "tables": sorted(catalog.tables, key=lambda row: row["name"])}
    return hashlib.sha256(_canonical_json(payload).encode()).hexdigest()


def _catalog_and_hash():
    catalog = _load_baseline().load_and_validate_catalog(DOMAIN_ROOT)
    payload = {"contract": catalog.contract, "tables": sorted(catalog.tables, key=lambda row: row["name"])}
    return catalog, hashlib.sha256(_canonical_json(payload).encode()).hexdigest()


def _invariants(catalog: Any) -> dict[str, dict[str, str]]:
    result = {}
    for table in catalog.tables:
        for invariant in table.get("cross_row_invariants", []):
            result[f"{table['name']}:{invariant['name']}"] = {
                "table": table["name"],
                "invariant": invariant["name"],
                "enforcement": invariant["enforcement"],
                "rule": invariant["rule"],
            }
    return result


def _load_trade_v2():
    spec = importlib.util.spec_from_file_location("commercial_trade_v2", TRADE_V2_GENERATOR)
    if spec is None or spec.loader is None:
        raise ContractError("cannot import trade-v2 generator")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    module.SCHEMA = SCHEMA
    return module


def _function(signature: str, returns: str, body: str, *, runtime: bool = False) -> list[str]:
    name, arguments = signature.split("(", 1)
    qualified = f'"{SCHEMA}"."{name}"({arguments}'
    identity = ",".join(
        argument.strip().split()[-1]
        for argument in arguments[:-1].split(",")
        if argument.strip()
    )
    identity_signature = f'"{SCHEMA}"."{name}"({identity})'
    statements = [
        f'''CREATE FUNCTION {qualified}
RETURNS {returns}
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
{body.strip()}
$function$''',
        f'ALTER FUNCTION {identity_signature} OWNER TO "erp_migration_owner"',
        f'REVOKE ALL ON FUNCTION {identity_signature} FROM PUBLIC, "erp_app", "erp_runtime"',
    ]
    if runtime:
        statements.append(f'GRANT EXECUTE ON FUNCTION {identity_signature} TO "erp_app", "erp_runtime"')
    return statements


def _common_definitions() -> list[str]:
    return [
        f'CREATE SCHEMA "{SCHEMA}" AUTHORIZATION "erp_migration_owner"',
        f'REVOKE ALL ON SCHEMA "{SCHEMA}" FROM PUBLIC, "erp_app", "erp_runtime"',
        f'GRANT USAGE ON SCHEMA "{SCHEMA}" TO "erp_app", "erp_runtime"',
        *_function(
            "resolve_role_account(organization_id uuid, target_branch_id uuid, role_key varchar, expected_type text, currency char, require_party boolean)",
            "uuid",
            '''
DECLARE setting_value text; account_id uuid; account finance.accounts%ROWTYPE;
BEGIN
    SELECT value_text INTO setting_value FROM core.settings
     WHERE org_id=organization_id AND status='active' AND namespace='finance.account_roles'
       AND key=role_key AND value_type='text' AND core.settings.branch_id=target_branch_id
     FOR SHARE;
    IF setting_value IS NULL THEN
        SELECT value_text INTO setting_value FROM core.settings
         WHERE org_id=organization_id AND status='active' AND namespace='finance.account_roles'
           AND key=role_key AND value_type='text' AND core.settings.branch_id IS NULL FOR SHARE;
    END IF;
    IF setting_value IS NULL OR setting_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='active finance account-role UUID setting is missing';
    END IF;
    account_id:=setting_value::uuid;
    SELECT * INTO account FROM finance.accounts
     WHERE org_id=organization_id AND id=account_id FOR SHARE;
    IF account.id IS NULL OR account.status<>'active' OR account.account_type<>expected_type
       OR account.currency_code<>currency OR (require_party AND NOT account.allows_party_posting) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='finance account-role target is inactive or incompatible';
    END IF;
    RETURN account_id;
END
''',
        ),
        *_function(
            "assert_line_account(organization_id uuid, account_id uuid, expected_type text, currency char)",
            "void",
            '''
BEGIN
    PERFORM 1 FROM finance.accounts account
     WHERE account.org_id=organization_id AND account.id=account_id AND account.status='active'
       AND account.account_type=expected_type AND account.currency_code=currency FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='commercial line posting account is inactive or incompatible';
    END IF;
END
''',
        ),
        *_function(
            "add_journal_line(organization_id uuid, journal_id uuid, line_number integer, account_id uuid, branch_id uuid, party_id uuid, description text, debit numeric, credit numeric, actor_id uuid)",
            "void",
            '''
BEGIN
    IF (debit>0)=(credit>0) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='journal line must have exactly one positive side';
    END IF;
    INSERT INTO finance.journal_lines(org_id,id,journal_entry_id,line_number,account_id,branch_id,party_id,
      description,transaction_debit,transaction_credit,functional_debit,functional_credit,created_by_membership_id)
    VALUES(organization_id,gen_random_uuid(),journal_id,line_number,account_id,branch_id,party_id,
      description,debit,credit,debit,credit,actor_id);
END
''',
        ),
        *_function(
            "post_owned_inventory_document(organization_id uuid, inventory_document_id uuid, actor_id uuid, source_kind text, source_id uuid, expected_branch_id uuid)",
            "void",
            '''
DECLARE document inventory.inventory_documents%ROWTYPE; expected_type text;
BEGIN
    IF source_kind NOT IN ('sales_invoice','sales_return','purchase_return') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='unsupported commercial inventory source kind'; END IF;
    expected_type:=CASE source_kind WHEN 'sales_invoice' THEN 'sales_issue'
      WHEN 'sales_return' THEN 'sales_return_receipt' ELSE 'purchase_return_issue' END;
    SELECT * INTO STRICT document FROM inventory.inventory_documents
     WHERE org_id=organization_id AND id=inventory_document_id FOR UPDATE;
    IF document.status<>'approved' OR document.document_type<>expected_type
       OR document.branch_id<>expected_branch_id
       OR num_nonnulls(document.sales_dispatch_id,document.sales_invoice_id,document.sales_return_id,
            document.goods_receipt_id,document.supplier_invoice_id,document.purchase_return_id,
            document.destruction_id)<>1
       OR (source_kind='sales_invoice' AND document.sales_invoice_id IS DISTINCT FROM source_id)
       OR (source_kind='sales_return' AND document.sales_return_id IS DISTINCT FROM source_id)
       OR (source_kind='purchase_return' AND document.purchase_return_id IS DISTINCT FROM source_id)
       OR document.recall_id IS NOT NULL OR document.reverses_document_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='commercial inventory document type, source, branch, or state differs'; END IF;
    PERFORM erp_trade_commands.assert_permission('inventory.document.post',expected_branch_id);
    PERFORM erp_trade_commands.post_locked_document(organization_id,inventory_document_id,actor_id);
END
''',
        ),
        *_function(
            "post_dispatch_inventory_valuation(organization_id uuid, inventory_document_id uuid, actor_id uuid, journal_id uuid, journal_number varchar, event_id uuid, key_hash bytea, request_hash bytea, expires_at timestamptz)",
            "uuid",
            '''
DECLARE document inventory.inventory_documents%ROWTYPE; claim_id uuid; replay_id uuid;
        ledger_value numeric(20,2); ledger_entries bigint; cogs_account uuid; inventory_account uuid;
        posted_time timestamptz:=pg_catalog.transaction_timestamp();
BEGIN
    PERFORM erp_trade_commands.assert_context(organization_id,actor_id);
    SELECT * INTO STRICT document FROM inventory.inventory_documents
     WHERE org_id=organization_id AND id=inventory_document_id FOR UPDATE;
    PERFORM erp_trade_commands.assert_permission('sales.dispatch.post',document.branch_id);
    IF NOT erp_security.has_permission('finance.journal.post',NULL::uuid) THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='finance journal permission denied'; END IF;
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM erp_trade_commands.claim(
      organization_id,actor_id,'sales.dispatch.inventory_valuation',key_hash,request_hash,expires_at);
    IF replay_id IS NOT NULL THEN
      IF replay_id<>inventory_document_id THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='dispatch valuation replay mismatch'; END IF;
      RETURN replay_id;
    END IF;
    IF document.status<>'posted' OR document.document_type<>'sales_issue' OR document.sales_dispatch_id IS NULL
       OR document.sales_invoice_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='dispatch valuation requires an already-posted typed dispatch issue';
    END IF;
    IF EXISTS(SELECT 1 FROM finance.accounting_events event WHERE event.org_id=organization_id AND event.inventory_document_id=inventory_document_id) THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='dispatch inventory valuation already exists'; END IF;
    SELECT coalesce(sum(-entry.value_delta),0),count(*) INTO ledger_value,ledger_entries
      FROM inventory.stock_ledger_entries entry WHERE entry.org_id=organization_id
       AND entry.inventory_document_id=inventory_document_id AND entry.entry_kind='issue';
    IF ledger_entries=0 OR ledger_value<=0 THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='dispatch issue has no authoritative stock-ledger value'; END IF;
    cogs_account:=erp_commercial_commands.resolve_role_account(organization_id,document.branch_id,'cost_of_goods_sold','expense',document.currency_code,false);
    inventory_account:=erp_commercial_commands.resolve_role_account(organization_id,document.branch_id,'inventory_asset','asset',document.currency_code,false);
    INSERT INTO finance.journal_entries(org_id,id,journal_number,posting_date,description,transaction_currency,functional_currency,fx_rate,
      transaction_debit_total,transaction_credit_total,functional_debit_total,functional_credit_total,status,
      created_by_membership_id,updated_by_membership_id)
    VALUES(organization_id,journal_id,journal_number,document.document_date,'Dispatch inventory valuation',document.currency_code,'INR',1,
      ledger_value,ledger_value,ledger_value,ledger_value,'draft',actor_id,actor_id);
    PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,1,cogs_account,document.branch_id,NULL,'Dispatch COGS from posted stock ledger',ledger_value,0,actor_id);
    PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,2,inventory_account,document.branch_id,NULL,'Dispatch inventory issue from posted stock ledger',0,ledger_value,actor_id);
    UPDATE finance.journal_entries SET status='posted',posted_at=posted_time,posted_by_membership_id=actor_id,
      updated_at=posted_time,updated_by_membership_id=actor_id,row_version=row_version+1
     WHERE org_id=organization_id AND id=journal_id;
    INSERT INTO finance.accounting_events(org_id,id,event_type,inventory_document_id,journal_entry_id,occurred_at,source_posted_at,created_by_membership_id)
    VALUES(organization_id,event_id,'inventory_valuation',inventory_document_id,journal_id,posted_time,document.posted_at,actor_id);
    PERFORM erp_trade_commands.finish_claim(organization_id,claim_id,'inventory.inventory_documents',inventory_document_id);
    RETURN inventory_document_id;
END
''',
            runtime=True,
        ),
    ]


def _artifact_assertion(
    name: str, header: str, lines: str, parent: str, resource: str, operation: str, date_column: str,
    expected_status: str,
) -> list[str]:
    statements = _load_trade_v2()._artifact_assertion(
        name, header, lines, parent, resource, operation, date_column
    )
    return [
        statement.replace("header.status<>'submitted'", f"header.status NOT IN ('{expected_status}','posted')")
        .replace("calculated order is no longer submitted", "calculated invoice is not in its postable or posted state")
        .replace("persisted order", "persisted invoice")
        .replace(
            "PERFORM erp_calculation_authority.assert_output_schema(output_doc);",
            "PERFORM erp_calculation_authority.assert_output_schema(output_doc);\n"
            "    IF input_doc#>>'{document,gst_tax_treatment}'<>'statutory' OR output_doc->>'gst_tax_treatment'<>'statutory' THEN "
            "RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invoice calculation must use statutory GST treatment'; END IF;",
        )
        for statement in statements
    ]


def _line_guard(name: str, line_table: str, header_table: str, parent_column: str) -> list[str]:
    return _load_trade_v2()._approval_line_guard(
        name, line_table, header_table, parent_column, "'posted','reversed'"
    )


def _invoice_companion_guard(*, sales: bool) -> list[str]:
    name = "guard_sales_invoice_companions" if sales else "guard_supplier_invoice_companions"
    table = "sales.invoices" if sales else "procurement.supplier_invoices"
    artifact_column = "sales_invoice_id" if sales else "supplier_invoice_id"
    source_column = artifact_column
    operation = "sales.invoice.post" if sales else "procurement.supplier_invoice.post"
    resource = "sales_invoice" if sales else "supplier_invoice"
    assertion = "assert_sales_invoice_artifact" if sales else "assert_supplier_invoice_artifact"
    statements = _function(
        f"{name}()",
        "trigger",
        f'''
DECLARE artifact calculation.artifacts%ROWTYPE; companion_count bigint; event_id uuid;
        input_doc jsonb; output_doc jsonb;
BEGIN
    IF TG_OP='DELETE' THEN
      IF OLD.status IN ('posted','reversed') THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted invoice is retained'; END IF;
      RETURN OLD;
    END IF;
    IF NEW.status='posted' THEN
      SELECT count(*),(pg_catalog.array_agg(id))[1] INTO companion_count,artifact.id FROM calculation.artifacts
       WHERE org_id=NEW.org_id AND {artifact_column}=NEW.id AND operation='{operation}' AND status='consumed';
      IF companion_count<>1 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted invoice requires exactly one consumed typed calculation artifact'; END IF;
      SELECT * INTO STRICT artifact FROM calculation.artifacts stored WHERE stored.org_id=NEW.org_id AND stored.id=artifact.id;
      input_doc:=pg_catalog.convert_from(artifact.input_bytes,'UTF8')::jsonb;
      output_doc:=pg_catalog.convert_from(artifact.output_bytes,'UTF8')::jsonb;
      PERFORM erp_commercial_commands.{assertion}(NEW.org_id,NEW.id,input_doc,output_doc);
      SELECT count(*) INTO companion_count FROM tax.documents WHERE org_id=NEW.org_id AND {source_column}=NEW.id AND document_class='{resource}';
      IF companion_count<>1 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted invoice requires exactly one typed tax document'; END IF;
      SELECT count(*),(pg_catalog.array_agg(event.id))[1] INTO companion_count,event_id FROM finance.accounting_events event
       JOIN finance.journal_entries journal ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id AND journal.status='posted'
       WHERE event.org_id=NEW.org_id AND event.{source_column}=NEW.id AND event.event_type='{resource}';
      IF companion_count<>1 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted invoice requires exactly one posted accounting event'; END IF;
      SELECT count(*) INTO companion_count FROM finance.open_items WHERE org_id=NEW.org_id AND accounting_event_id=event_id;
      IF companion_count<>1 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted invoice requires exactly one open item'; END IF;
    END IF;
    RETURN NEW;
END
''',
    )
    schema, relation = table.split(".")
    statements.append(
        f'CREATE CONSTRAINT TRIGGER "{name}_ct" AFTER INSERT OR UPDATE OR DELETE ON "{schema}"."{relation}" '
        f'DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "{SCHEMA}"."{name}"()'
    )
    return statements


def _return_companion_guard(*, sales: bool) -> list[str]:
    name = "guard_sales_return_companions" if sales else "guard_purchase_return_companions"
    table = "sales.returns" if sales else "procurement.purchase_returns"
    artifact_column = "sales_return_id" if sales else "purchase_return_id"
    note_column = artifact_column
    operation = "sales.return.post" if sales else "procurement.purchase_return.post"
    assertion = "assert_sales_return_artifact" if sales else "assert_purchase_return_artifact"
    tax_expected = "CASE WHEN NEW.gst_tax_treatment='statutory' THEN 1 ELSE 0 END"
    inventory_expected = (
        "CASE WHEN EXISTS (SELECT 1 FROM sales.return_lines line WHERE line.org_id=NEW.org_id AND line.return_id=NEW.id AND line.disposition='return_to_stock') THEN 1 ELSE 0 END"
        if sales
        else "1"
    )
    inventory_source = "sales_return_id" if sales else "purchase_return_id"
    inventory_type = "sales_return_receipt" if sales else "purchase_return_issue"
    statements = _function(
        f"{name}()",
        "trigger",
        f'''
DECLARE artifact calculation.artifacts%ROWTYPE; note finance.adjustment_notes%ROWTYPE;
        companion_count bigint; event_id uuid; input_doc jsonb; output_doc jsonb; expected_tax bigint;
BEGIN
    IF TG_OP='DELETE' THEN
      IF OLD.status IN ('posted','reversed') THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted return is retained'; END IF;
      RETURN OLD;
    END IF;
    IF NEW.status='posted' THEN
      SELECT count(*),(pg_catalog.array_agg(id))[1] INTO companion_count,artifact.id FROM calculation.artifacts
       WHERE org_id=NEW.org_id AND {artifact_column}=NEW.id AND operation='{operation}' AND status='consumed';
      IF companion_count<>1 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted return requires exactly one consumed typed calculation artifact'; END IF;
      SELECT * INTO STRICT artifact FROM calculation.artifacts stored WHERE stored.org_id=NEW.org_id AND stored.id=artifact.id;
      input_doc:=pg_catalog.convert_from(artifact.input_bytes,'UTF8')::jsonb; output_doc:=pg_catalog.convert_from(artifact.output_bytes,'UTF8')::jsonb;
      PERFORM erp_commercial_commands.{assertion}(NEW.org_id,NEW.id,input_doc,output_doc);
      SELECT count(*),(pg_catalog.array_agg(id))[1] INTO companion_count,note.id FROM finance.adjustment_notes
       WHERE org_id=NEW.org_id AND {note_column}=NEW.id AND status='posted';
      IF companion_count<>1 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted return requires exactly one typed posted adjustment note'; END IF;
      SELECT * INTO STRICT note FROM finance.adjustment_notes stored WHERE stored.org_id=NEW.org_id AND stored.id=note.id;
      IF ROW(note.net_value_amount,note.gst_taxable_value,note.cgst_amount,note.sgst_amount,note.igst_amount,note.cess_amount,
             note.recipient_assessed_tax_amount,note.rounding_adjustment,note.counterparty_payable_amount)
         IS DISTINCT FROM ROW(NEW.net_value_total,NEW.gst_taxable_total,NEW.cgst_total,NEW.sgst_total,NEW.igst_total,NEW.cess_total,
             NEW.recipient_assessed_tax_total,NEW.rounding_adjustment,NEW.grand_total) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return adjustment note totals differ'; END IF;
      IF ROW(note.gst_adjustment_rule_version_id,note.gst_tax_treatment,note.recipient_itc_reversal_evidence_attachment_id,
             note.recipient_itc_reversal_confirmed_at)
         IS DISTINCT FROM ROW(NEW.gst_adjustment_rule_version_id,NEW.gst_tax_treatment,
             {('NEW.recipient_itc_reversal_evidence_attachment_id,NEW.recipient_itc_reversal_confirmed_at' if sales else 'NULL::uuid,NULL::timestamptz')}) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return adjustment note GST rule or evidence differs'; END IF;
      IF note.counterparty_portal_document_line_id IS DISTINCT FROM {('NULL::uuid' if sales else 'NEW.supplier_credit_note_portal_line_id')} THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return adjustment note portal lineage differs'; END IF;
      SELECT count(*) INTO companion_count FROM inventory.inventory_documents document
       WHERE document.org_id=NEW.org_id AND document.{inventory_source}=NEW.id
         AND document.document_type='{inventory_type}' AND document.status='posted';
      IF companion_count<>{inventory_expected} THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return inventory-document ownership differs'; END IF;
      expected_tax:={tax_expected};
      SELECT count(*) INTO companion_count FROM tax.documents WHERE org_id=NEW.org_id AND adjustment_note_id=note.id AND document_class='adjustment_note';
      IF companion_count<>expected_tax THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return adjustment tax-document ownership differs'; END IF;
      SELECT count(*),(pg_catalog.array_agg(event.id))[1] INTO companion_count,event_id FROM finance.accounting_events event
       JOIN finance.journal_entries journal ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id AND journal.status='posted'
       WHERE event.org_id=NEW.org_id AND event.adjustment_note_id=note.id AND event.event_type='adjustment_note';
      IF companion_count<>1 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return requires exactly one posted adjustment accounting event'; END IF;
    END IF;
    RETURN NEW;
END
''',
    )
    schema, relation = table.split(".")
    statements.append(
        f'CREATE CONSTRAINT TRIGGER "{name}_ct" AFTER INSERT OR UPDATE OR DELETE ON "{schema}"."{relation}" '
        f'DEFERRABLE INITIALLY_DEFERRED FOR EACH ROW EXECUTE FUNCTION "{SCHEMA}"."{name}"()'.replace("INITIALLY_DEFERRED", "INITIALLY DEFERRED")
    )
    return statements


def _return_state_guard(*, sales: bool) -> list[str]:
    name = "guard_sales_return_state" if sales else "guard_purchase_return_state"
    table = "sales.returns" if sales else "procurement.purchase_returns"
    allowed = (
        "(OLD.status='draft' AND NEW.status IN ('posted','cancelled'))"
        if sales
        else "(OLD.status='draft' AND NEW.status IN ('submitted','cancelled')) OR "
        "(OLD.status='submitted' AND NEW.status IN ('approved','cancelled')) OR "
        "(OLD.status='approved' AND NEW.status IN ('posted','cancelled'))"
    )
    statements = _function(
        f"{name}()",
        "trigger",
        f'''
BEGIN
    IF TG_OP='DELETE' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return evidence is retained';
    END IF;
    IF TG_OP='INSERT' THEN
      IF NEW.status<>'draft' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='new return must start in draft'; END IF;
      RETURN NEW;
    END IF;
    IF OLD.status='posted' AND NEW.status='reversed' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return reversal requires a reviewed compensating command for tax, finance, allocation, and inventory effects';
    END IF;
    IF OLD.status IN ('posted','reversed','cancelled') AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted or terminal return evidence is immutable';
    END IF;
    IF OLD.status<>NEW.status AND NOT ({allowed}) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invalid return lifecycle transition';
    END IF;
    RETURN NEW;
END
''',
    )
    schema, relation = table.split(".")
    statements.append(
        f'CREATE TRIGGER "{name}_tr" BEFORE INSERT OR UPDATE OR DELETE ON "{schema}"."{relation}" '
        f'FOR EACH ROW EXECUTE FUNCTION "{SCHEMA}"."{name}"()'
    )
    return statements


def _invoice_command(*, sales: bool) -> list[str]:
    if sales:
        function_name = "post_sales_invoice"
        header_table = "sales.invoices"
        line_table = "sales.invoice_lines"
        parent = "invoice_id"
        resource = "sales_invoice"
        operation = "sales.invoice.post"
        permission = "sales.invoice.post"
        typed_artifact = "sales_invoice_id"
        document_date = "invoice_date"
        number = "invoice_number"
        party_join = "parties.customer_accounts"
        party_key = "customer_account_id"
        party_default_account = "default_receivable_account_id"
        side = "receivable"
        tax_direction = "outward"
        event_type = "sales_invoice"
        event_column = "sales_invoice_id"
        tax_source_column = "sales_invoice_id"
        registration = "seller_tax_registration_id"
        counterparty_gstin = "buyer_gstin_snapshot"
        account_line = "revenue_account_id"
        line_type = "'income'"
        postable_status = "draft"
    else:
        function_name = "post_supplier_invoice"
        header_table = "procurement.supplier_invoices"
        line_table = "procurement.supplier_invoice_lines"
        parent = "supplier_invoice_id"
        resource = "supplier_invoice"
        operation = "procurement.supplier_invoice.post"
        permission = "procurement.invoice.post"
        typed_artifact = "supplier_invoice_id"
        document_date = "supplier_invoice_date"
        number = "supplier_invoice_number"
        party_join = "parties.supplier_accounts"
        party_key = "supplier_account_id"
        party_default_account = "default_payable_account_id"
        side = "payable"
        tax_direction = "inward"
        event_type = "supplier_invoice"
        event_column = "supplier_invoice_id"
        tax_source_column = "supplier_invoice_id"
        registration = "buyer_tax_registration_id"
        counterparty_gstin = "supplier_gstin_snapshot"
        account_line = "net_value_account_id"
        line_type = "CASE WHEN line.inventory_cost_treatment='capitalize' THEN 'asset' ELSE 'expense' END"
        postable_status = "approved"

    inventory_claim_arguments = (
        "inventory_key_hash bytea, inventory_request_hash bytea, " if not sales else ""
    )
    signature = (
        f"{function_name}(organization_id uuid, resource_id uuid, artifact_id uuid, actor_id uuid, "
        "request_id uuid, command_request_id uuid, tax_document_id uuid, journal_id uuid, "
        "journal_number varchar, event_id uuid, open_item_id uuid, inventory_document_id uuid, "
        f"{inventory_claim_arguments}key_hash bytea, request_hash bytea, expires_at timestamptz)"
    )
    line_posting = (
        f'''FOR line IN SELECT * FROM {line_table} WHERE org_id=organization_id AND {parent}=resource_id ORDER BY line_number,id LOOP
        PERFORM "{SCHEMA}".assert_line_account(organization_id,line.{account_line},{line_type},header.currency_code);
        PERFORM "{SCHEMA}".add_journal_line(organization_id,journal_id,line_no,line.{account_line},header.branch_id,NULL,
          'Invoice net value',0,line.net_value_amount,actor_id); line_no:=line_no+1;
    END LOOP;'''
        if sales
        else f'''FOR line IN SELECT * FROM {line_table} WHERE org_id=organization_id AND {parent}=resource_id ORDER BY line_number,id LOOP
        PERFORM "{SCHEMA}".assert_line_account(organization_id,line.{account_line},{line_type},header.currency_code);
        noncreditable_tax:=CASE WHEN line.itc_eligibility='eligible' THEN 0 ELSE line.cgst_amount+line.sgst_amount+line.igst_amount+line.cess_amount END;
        IF line.itc_eligibility='eligible' THEN
          eligible_cgst:=eligible_cgst+line.cgst_amount; eligible_sgst:=eligible_sgst+line.sgst_amount;
          eligible_igst:=eligible_igst+line.igst_amount; eligible_cess:=eligible_cess+line.cess_amount;
        END IF;
        PERFORM "{SCHEMA}".add_journal_line(organization_id,journal_id,line_no,line.{account_line},header.branch_id,NULL,
          'Supplier invoice net value and noncreditable tax',line.net_value_amount+noncreditable_tax,0,actor_id); line_no:=line_no+1;
    END LOOP;'''
    )
    party_line = (
        '''PERFORM "erp_commercial_commands".add_journal_line(organization_id,journal_id,1,party_account,header.branch_id,party_id,
      'Customer receivable',header.grand_total,0,actor_id);'''
        if sales
        else '''PERFORM "erp_commercial_commands".add_journal_line(organization_id,journal_id,1,party_account,header.branch_id,party_id,
      'Supplier payable',0,header.grand_total,actor_id);'''
    )
    tax_lines = (
        "PERFORM \"erp_commercial_commands\".add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Output tax',0,component_amount,actor_id);"
        if sales
        else "PERFORM \"erp_commercial_commands\".add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Eligible input tax',component_amount,0,actor_id);"
    )
    tax_condition = (
        "AND header.tax_charge_mechanism='normal'"
        if sales
        else "AND component_amount>0"
    )
    component_values = (
        "header.cgst_total,header.sgst_total,header.igst_total,header.cess_total"
        if sales
        else "eligible_cgst,eligible_sgst,eligible_igst,eligible_cess"
    )
    inventory_before = (
        '''SELECT EXISTS(SELECT 1 FROM sales.invoice_lines line WHERE line.org_id=organization_id AND line.invoice_id=resource_id
                           AND line.line_kind='product' AND NOT EXISTS (
                             SELECT 1 FROM sales.invoice_dispatch_allocations allocation
                              WHERE allocation.org_id=line.org_id AND allocation.invoice_line_id=line.id)),
                 EXISTS(SELECT 1 FROM sales.invoice_dispatch_allocations allocation JOIN sales.invoice_lines invoice_line ON invoice_line.org_id=allocation.org_id AND invoice_line.id=allocation.invoice_line_id WHERE invoice_line.org_id=organization_id AND invoice_line.invoice_id=resource_id)
            INTO product_lines,allocated_lines;
        IF product_lines<>(inventory_document_id IS NOT NULL) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='direct sales invoice inventory ownership mismatch'; END IF;
        IF allocated_lines AND EXISTS (
          SELECT 1 FROM sales.invoice_dispatch_allocations allocation
          JOIN sales.invoice_lines invoice_line ON invoice_line.org_id=allocation.org_id AND invoice_line.id=allocation.invoice_line_id
          WHERE invoice_line.org_id=organization_id AND invoice_line.invoice_id=resource_id
            AND (SELECT count(*) FROM inventory.inventory_document_lines inventory_line
                 JOIN inventory.inventory_documents inventory_document ON inventory_document.org_id=inventory_line.org_id AND inventory_document.id=inventory_line.inventory_document_id AND inventory_document.status='posted'
                 JOIN finance.accounting_events event ON event.org_id=inventory_document.org_id AND event.inventory_document_id=inventory_document.id AND event.event_type='inventory_valuation'
                 WHERE inventory_line.org_id=allocation.org_id AND inventory_line.sales_dispatch_line_id=allocation.dispatch_line_id)<>1
        ) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='allocated dispatch lacks exactly one posted inventory-valuation accounting event'; END IF;
        IF inventory_document_id IS NOT NULL THEN
          PERFORM erp_commercial_commands.post_owned_inventory_document(
            organization_id,inventory_document_id,actor_id,'sales_invoice',resource_id,header.branch_id);
          SELECT coalesce(sum(-entry.value_delta),0),count(*) INTO inventory_value,inventory_entries FROM inventory.stock_ledger_entries entry WHERE entry.org_id=organization_id AND entry.inventory_document_id=inventory_document_id AND entry.entry_kind='issue';
          IF inventory_entries=0 OR inventory_value<=0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted sales issue has no authoritative ledger value'; END IF;
        END IF;'''
        if sales
        else "NULL;"
    )
    inventory_after = (
        "NULL;"
        if sales
        else '''IF inventory_document_id IS NOT NULL THEN
          PERFORM erp_trade_commands_v2.post_landed_cost_adjustment(organization_id,inventory_document_id,actor_id,inventory_key_hash,inventory_request_hash,expires_at);
        END IF;'''
    )
    inventory_journal = (
        '''IF inventory_value>0 THEN
      role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,'cost_of_goods_sold','expense',header.currency_code,false);
      PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'COGS from posted stock ledger',inventory_value,0,actor_id); line_no:=line_no+1;
      role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,'inventory_asset','asset',header.currency_code,false);
      PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Inventory issue from posted stock ledger',0,inventory_value,actor_id); line_no:=line_no+1;
    END IF;'''
        if sales
        else "NULL;"
    )
    rcm_journal = ""
    if not sales:
        rcm_journal = '''
    IF header.tax_charge_mechanism='reverse_charge' THEN
      FOR role_key,component_amount IN SELECT * FROM (VALUES
        ('rcm_cgst_payable'::varchar,header.cgst_total),('rcm_sgst_payable'::varchar,header.sgst_total),
        ('rcm_igst_payable'::varchar,header.igst_total),('rcm_cess_payable'::varchar,header.cess_total)) AS component(role_key,amount)
      LOOP
        IF component_amount>0 THEN role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,role_key,'liability',header.currency_code,false);
          PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Self-assessed reverse-charge liability',0,component_amount,actor_id); line_no:=line_no+1;
        END IF;
      END LOOP;
    END IF;'''
    rounding_journal = f'''
    IF header.rounding_adjustment<>0 THEN
      role_key:=CASE WHEN header.rounding_adjustment>0 THEN '{'rounding_gain' if sales else 'rounding_loss'}' ELSE '{'rounding_loss' if sales else 'rounding_gain'}' END;
      role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,role_key,CASE WHEN role_key='rounding_gain' THEN 'income' ELSE 'expense' END,header.currency_code,false);
      PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Signed rounding adjustment',
        CASE WHEN {'header.rounding_adjustment<0' if sales else 'header.rounding_adjustment>0'} THEN abs(header.rounding_adjustment) ELSE 0 END,
        CASE WHEN {'header.rounding_adjustment>0' if sales else 'header.rounding_adjustment<0'} THEN abs(header.rounding_adjustment) ELSE 0 END,actor_id); line_no:=line_no+1;
    END IF;'''
    return _function(
        signature,
        "uuid",
        f'''
DECLARE header {header_table}%ROWTYPE; artifact calculation.artifacts%ROWTYPE; line record;
        claim_id uuid; replay_id uuid; input_doc jsonb; output_doc jsonb; consumed bytea;
        party_id uuid; party_account uuid; party_default_account uuid; posted_time timestamptz:=pg_catalog.transaction_timestamp();
        line_no integer:=2; component_amount numeric(20,2); role_account uuid; role_key varchar;
        total_debit numeric(20,2); total_credit numeric(20,2); tax_effective date; source_hash bytea; noncreditable_tax numeric(20,2);
        eligible_cgst numeric(20,2):=0; eligible_sgst numeric(20,2):=0; eligible_igst numeric(20,2):=0; eligible_cess numeric(20,2):=0;
        inventory_value numeric(20,2):=0; inventory_entries bigint:=0; product_lines boolean:=false; allocated_lines boolean:=false;
        line_snapshot jsonb; registration_scope_count bigint;
BEGIN
    PERFORM erp_trade_commands.assert_context(organization_id,actor_id);
    IF NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid IS DISTINCT FROM request_id THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='commercial request context mismatch'; END IF;
    SELECT * INTO STRICT header FROM {header_table} WHERE org_id=organization_id AND id=resource_id FOR UPDATE;
    PERFORM erp_trade_commands.assert_permission('{permission}',header.branch_id);
    IF NOT erp_security.has_permission('finance.journal.post',NULL::uuid) THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='finance journal permission denied'; END IF;
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM erp_trade_commands.claim(
      organization_id,actor_id,'{operation}',key_hash,request_hash,expires_at);
    IF replay_id IS NOT NULL THEN IF replay_id<>resource_id THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='commercial replay mismatch'; END IF; RETURN replay_id; END IF;
    SELECT * INTO STRICT artifact FROM calculation.artifacts WHERE org_id=organization_id AND id=artifact_id FOR UPDATE;
    input_doc:=pg_catalog.convert_from(artifact.input_bytes,'UTF8')::jsonb;
    output_doc:=pg_catalog.convert_from(artifact.output_bytes,'UTF8')::jsonb;
    IF artifact.{typed_artifact} IS DISTINCT FROM resource_id OR artifact.engine_version IS DISTINCT FROM output_doc->>'engine_version'
       OR artifact.ruleset_version IS DISTINCT FROM output_doc->>'ruleset_version' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='typed calculation artifact metadata mismatch'; END IF;
    PERFORM "{SCHEMA}".assert_{resource}_artifact(organization_id,resource_id,input_doc,output_doc);

    SELECT account.party_id,account.{party_default_account} INTO party_id,party_default_account
      FROM {party_join} account WHERE account.org_id=organization_id AND account.id=header.{party_key} AND account.status='active' FOR SHARE;
    IF party_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='commercial party account is inactive'; END IF;
    party_account:="{SCHEMA}".resolve_role_account(organization_id,header.branch_id,'{'accounts_receivable' if sales else 'accounts_payable'}','{'asset' if sales else 'liability'}',header.currency_code,true);
    IF party_default_account IS DISTINCT FROM party_account THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='party default ledger differs from active branch account-role mapping'; END IF;
    PERFORM 1 FROM tax.registrations registration WHERE registration.org_id=organization_id AND registration.id=header.{registration}
      AND registration.status='active' AND registration.effective_from<=header.{document_date}
      AND (registration.effective_to IS NULL OR registration.effective_to>=header.{document_date}) FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='document tax registration is not active on document date'; END IF;
    SELECT count(*) INTO registration_scope_count FROM tax.registration_branches association
     WHERE association.org_id=organization_id AND association.registration_id=header.{registration}
       AND association.branch_id=header.branch_id AND association.status='active'
       AND association.effective_from<=header.{document_date}
       AND (association.effective_to IS NULL OR association.effective_to>=header.{document_date});
    IF registration_scope_count<>1 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='document requires exactly one effective branch registration association'; END IF;
    PERFORM 1 FROM tax.registration_branches association
     WHERE association.org_id=organization_id AND association.registration_id=header.{registration}
       AND association.branch_id=header.branch_id AND association.status='active'
       AND association.effective_from<=header.{document_date}
       AND (association.effective_to IS NULL OR association.effective_to>=header.{document_date}) FOR SHARE;
    SELECT min(version.effective_from) INTO tax_effective FROM {line_table} line JOIN tax.tax_code_versions version ON version.id=line.tax_code_version_id
      WHERE line.org_id=organization_id AND line.{parent}=resource_id AND version.status='active'
        AND version.effective_from<=header.{document_date} AND (version.effective_to IS NULL OR version.effective_to>=header.{document_date})
      HAVING count(DISTINCT version.ruleset_version)=1 AND min(version.ruleset_version)=header.calculation_ruleset_version
        AND count(*)=(SELECT count(*) FROM {line_table} expected WHERE expected.org_id=organization_id AND expected.{parent}=resource_id);
    IF tax_effective IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invoice tax ruleset is not uniform'; END IF;

    {inventory_before}
    consumed:=erp_calculation_authority.consume_artifact(organization_id,artifact_id,'{operation}','{resource}',resource_id,
      header.row_version,request_id,command_request_id,claim_id);
    IF pg_catalog.convert_from(consumed,'UTF8')::jsonb IS DISTINCT FROM output_doc THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='consumed calculation changed'; END IF;

    INSERT INTO finance.journal_entries(org_id,id,journal_number,posting_date,description,transaction_currency,functional_currency,fx_rate,
      transaction_debit_total,transaction_credit_total,functional_debit_total,functional_credit_total,status,created_by_membership_id,updated_by_membership_id)
    VALUES(organization_id,journal_id,journal_number,header.{document_date},'{event_type}',header.currency_code,'INR',1,
      header.grand_total,header.grand_total,header.grand_total,header.grand_total,'draft',actor_id,actor_id);
    {party_line}
    {line_posting}
    {inventory_journal}
    FOR role_key,component_amount IN SELECT * FROM (VALUES
      ('{'output_cgst' if sales else 'input_cgst'}'::varchar,{component_values.split(',')[0]}),
      ('{'output_sgst' if sales else 'input_sgst'}'::varchar,{component_values.split(',')[1]}),
      ('{'output_igst' if sales else 'input_igst'}'::varchar,{component_values.split(',')[2]}),
      ('{'output_cess' if sales else 'input_cess'}'::varchar,{component_values.split(',')[3]})) AS component(role_key,amount)
    LOOP
      IF component_amount>0 {tax_condition} THEN
        role_account:="{SCHEMA}".resolve_role_account(organization_id,header.branch_id,role_key,'{'liability' if sales else 'asset'}',header.currency_code,false);
        {tax_lines} line_no:=line_no+1;
      END IF;
    END LOOP;
    {rcm_journal}
    {rounding_journal}
    SELECT coalesce(sum(transaction_debit),0),coalesce(sum(transaction_credit),0) INTO total_debit,total_credit
      FROM finance.journal_lines WHERE org_id=organization_id AND journal_entry_id=journal_id;
    IF total_debit<>total_credit OR total_debit=0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='commercial journal does not exactly balance'; END IF;
    UPDATE finance.journal_entries SET transaction_debit_total=total_debit,transaction_credit_total=total_credit,
      functional_debit_total=total_debit,functional_credit_total=total_credit,status='posted',posted_at=posted_time,posted_by_membership_id=actor_id,
      updated_at=posted_time,updated_by_membership_id=actor_id,row_version=row_version+1 WHERE org_id=organization_id AND id=journal_id;
    UPDATE {header_table} SET status='posted',posted_at=posted_time,posted_by_membership_id=actor_id,
      updated_at=posted_time,updated_by_membership_id=actor_id,row_version=row_version+1 WHERE org_id=organization_id AND id=resource_id AND status='{postable_status}';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='invoice posting state changed'; END IF;
    {inventory_after}
    SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(source_line) ORDER BY source_line.line_number,source_line.id) INTO line_snapshot
      FROM {line_table} source_line WHERE source_line.org_id=organization_id AND source_line.{parent}=resource_id;
    source_hash:=extensions.digest(pg_catalog.convert_to((pg_catalog.to_jsonb(header)||pg_catalog.jsonb_build_object('lines',line_snapshot,'artifact',pg_catalog.encode(artifact.output_sha256,'hex')))::text,'UTF8'),'sha256');
    INSERT INTO tax.documents(org_id,id,registration_id,{tax_source_column},document_class,document_number,document_date,direction,
      counterparty_party_id,counterparty_gstin,place_of_supply_state_code,supply_type,zero_rated_payment_mode,tax_charge_mechanism,
      tax_liability_party,document_effect,currency_code,net_value_amount,gst_taxable_value,cgst_amount,sgst_amount,igst_amount,cess_amount,
      self_assessed_tax_amount,rounding_adjustment,counterparty_payable_amount,tax_ruleset_version,tax_ruleset_effective_date,source_hash,posted_at,created_by_membership_id)
    VALUES(organization_id,tax_document_id,header.{registration},resource_id,'{resource}',header.{number},header.{document_date},'{tax_direction}',
      party_id,header.{counterparty_gstin},header.place_of_supply_state_code,header.supply_type,header.zero_rated_payment_mode,header.tax_charge_mechanism,
      CASE WHEN header.tax_charge_mechanism='normal' THEN 'supplier' ELSE 'recipient' END,'original',header.currency_code,
      header.net_value_total,header.gst_taxable_total,header.cgst_total,header.sgst_total,header.igst_total,header.cess_total,
      CASE WHEN '{tax_direction}'='inward' AND header.tax_charge_mechanism='reverse_charge' THEN header.recipient_assessed_tax_total ELSE 0 END,
      header.rounding_adjustment,header.grand_total,header.calculation_ruleset_version,tax_effective,source_hash,posted_time,actor_id);
    INSERT INTO finance.accounting_events(org_id,id,event_type,{event_column},journal_entry_id,occurred_at,source_posted_at,created_by_membership_id)
    VALUES(organization_id,event_id,'{event_type}',resource_id,journal_id,posted_time,posted_time,actor_id);
    INSERT INTO finance.open_items(org_id,id,accounting_event_id,party_id,item_side,document_number,document_date,due_date,currency_code,
      principal_amount,functional_principal_amount,status,created_by_membership_id)
    VALUES(organization_id,open_item_id,event_id,party_id,'{side}',header.{number},header.{document_date},
      {'coalesce(header.due_date,header.'+document_date+')' if sales else 'header.due_date'},header.currency_code,header.grand_total,header.grand_total,'open',actor_id);
    PERFORM erp_trade_commands.finish_claim(organization_id,claim_id,'{header_table}',resource_id);
    RETURN resource_id;
END
''',
        runtime=True,
    )


def _invoice_header_definitions(*, sales: bool) -> list[str]:
    if sales:
        return [
            *_artifact_assertion("assert_sales_invoice_artifact", "sales.invoices", "sales.invoice_lines", "invoice_id", "sales_invoice", "sales.invoice.post", "invoice_date", "draft"),
            *_invoice_command(sales=True),
            *_invoice_companion_guard(sales=True),
        ]
    return [
        *_artifact_assertion("assert_supplier_invoice_artifact", "procurement.supplier_invoices", "procurement.supplier_invoice_lines", "supplier_invoice_id", "supplier_invoice", "procurement.supplier_invoice.post", "supplier_invoice_date", "approved"),
        *_invoice_command(sales=False),
        *_invoice_companion_guard(sales=False),
    ]


def _invoice_line_definitions(*, sales: bool) -> list[str]:
    if sales:
        return _line_guard("guard_posted_sales_invoice_lines", "sales.invoice_lines", "sales.invoices", "invoice_id")
    return _line_guard("guard_posted_supplier_invoice_lines", "procurement.supplier_invoice_lines", "procurement.supplier_invoices", "supplier_invoice_id")


def _return_artifact_assertion(*, sales: bool) -> list[str]:
    if sales:
        name = "assert_sales_return_artifact"
        header_table = "sales.returns"
        line_table = "sales.return_lines"
        parent = "return_id"
        operation = "sales.return.post"
        resource = "sales_return"
        original_header = "sales.invoices"
        original_lines = "sales.invoice_lines"
        original_id = "header.invoice_id"
        source_join = "source.id=line.invoice_line_id"
        source_date = "original.invoice_date"
        source_kind_check = "true"
        original_line_id = "line.invoice_line_id"
        original_quantity = "source.base_billed_quantity"
        original_free = "source.base_free_quantity"
    else:
        name = "assert_purchase_return_artifact"
        header_table = "procurement.purchase_returns"
        line_table = "procurement.purchase_return_lines"
        parent = "purchase_return_id"
        operation = "procurement.purchase_return.post"
        resource = "purchase_return"
        original_header = "procurement.supplier_invoices"
        original_lines = "procurement.supplier_invoice_lines"
        original_id = "header.supplier_invoice_id"
        source_join = (
            "allocation.id=line.supplier_invoice_receipt_allocation_id "
            "AND source.id=allocation.supplier_invoice_line_id"
        )
        source_date = "original.supplier_invoice_date"
        source_kind_check = "header.return_source_kind='invoiced'"
        original_line_id = "source.id"
        original_quantity = "allocation.allocated_base_billed_quantity"
        original_free = "allocation.allocated_base_free_quantity"

    allocation_join = (
        "LEFT JOIN procurement.supplier_invoice_receipt_allocations allocation "
        "ON allocation.org_id=line.org_id AND allocation.id=line.supplier_invoice_receipt_allocation_id "
        "LEFT JOIN procurement.goods_receipt_lines receipt "
        "ON receipt.org_id=line.org_id AND receipt.id=line.goods_receipt_line_id "
        "LEFT JOIN inventory.locations return_location "
        "ON return_location.org_id=line.org_id AND return_location.id=line.from_location_id"
        if not sales
        else "LEFT JOIN sales.invoice_dispatch_allocations allocation "
        "ON allocation.org_id=line.org_id AND allocation.id=line.invoice_dispatch_allocation_id "
        "LEFT JOIN sales.dispatch_lines dispatch_line "
        "ON dispatch_line.org_id=allocation.org_id AND dispatch_line.id=allocation.dispatch_line_id "
        "LEFT JOIN inventory.locations return_location "
        "ON return_location.org_id=line.org_id AND return_location.id=line.disposition_location_id"
    )
    lineage_checks = (
        '''
         OR return_location.id IS NULL OR return_location.branch_id IS DISTINCT FROM header.branch_id OR return_location.status<>'active'
         OR (line.invoice_dispatch_allocation_id IS NOT NULL AND
             (allocation.invoice_line_id IS DISTINCT FROM line.invoice_line_id
              OR ROW(dispatch_line.product_id,dispatch_line.batch_id,dispatch_line.uom_code)
                 IS DISTINCT FROM ROW(line.product_id,line.batch_id,source.uom_code)
              OR NOT EXISTS (
                SELECT 1 FROM inventory.inventory_document_lines issued_line
                JOIN inventory.inventory_documents issued_document
                  ON issued_document.org_id=issued_line.org_id AND issued_document.id=issued_line.inventory_document_id
               WHERE issued_line.org_id=line.org_id AND issued_line.sales_dispatch_line_id=dispatch_line.id
                 AND issued_document.sales_dispatch_id=dispatch_line.dispatch_id
                 AND issued_document.document_type='sales_issue' AND issued_document.status='posted'
                 AND ROW(issued_line.product_id,issued_line.batch_id,issued_line.uom_code)
                   IS NOT DISTINCT FROM ROW(line.product_id,line.batch_id,source.uom_code))))
         OR (line.invoice_dispatch_allocation_id IS NULL AND
             (EXISTS (SELECT 1 FROM sales.invoice_dispatch_allocations allocated
                       WHERE allocated.org_id=line.org_id AND allocated.invoice_line_id=line.invoice_line_id)
              OR NOT EXISTS (
                SELECT 1 FROM inventory.inventory_document_lines issued_line
                JOIN inventory.inventory_documents issued_document
                  ON issued_document.org_id=issued_line.org_id AND issued_document.id=issued_line.inventory_document_id
               WHERE issued_line.org_id=line.org_id AND issued_line.sales_invoice_line_id=line.invoice_line_id
                 AND issued_document.sales_invoice_id=header.invoice_id
                 AND issued_document.document_type='sales_issue' AND issued_document.status='posted'
                 AND ROW(issued_line.product_id,issued_line.batch_id,issued_line.uom_code)
                   IS NOT DISTINCT FROM ROW(line.product_id,line.batch_id,source.uom_code))))'''
        if sales
        else '''
         OR allocation.goods_receipt_line_id IS DISTINCT FROM line.goods_receipt_line_id
         OR receipt.id IS NULL OR return_location.id IS NULL
         OR return_location.branch_id IS DISTINCT FROM header.branch_id OR return_location.status<>'active'
         OR ROW(receipt.product_id,receipt.batch_id,receipt.location_id)
            IS DISTINCT FROM ROW(line.product_id,line.batch_id,line.from_location_id)'''
    )
    source_extra = "AND source.invoice_id=header.invoice_id" if sales else "AND source.supplier_invoice_id=header.supplier_invoice_id"
    original_lock = (
        f"SELECT * INTO STRICT original FROM {original_header} WHERE org_id=organization_id AND id={original_id} FOR UPDATE;"
        if sales
        else f'''IF header.return_source_kind='invoiced' THEN
      SELECT * INTO STRICT original FROM {original_header} WHERE org_id=organization_id AND id={original_id} FOR UPDATE;
    END IF;'''
    )
    header_original_checks = (
        "header.customer_account_id IS DISTINCT FROM original.customer_account_id OR"
        if sales
        else "header.supplier_account_id IS DISTINCT FROM original.supplier_account_id OR"
    )
    source_tax_checks = f'''
         OR source.id IS NULL
         OR source.product_id IS DISTINCT FROM line.product_id
         OR source.uom_conversion_factor IS DISTINCT FROM line.uom_conversion_factor
         OR source.quoted_unit_rate IS DISTINCT FROM line.quoted_unit_rate
         OR source.price_basis IS DISTINCT FROM line.price_basis
         OR source.free_supply_tax_treatment IS DISTINCT FROM line.free_supply_tax_treatment
         OR source.tax_classification_code_snapshot IS DISTINCT FROM line.hsn_code_snapshot
         OR source.tax_charge_mechanism IS DISTINCT FROM line.tax_charge_mechanism
         OR source.tax_code_version_id IS DISTINCT FROM line.tax_code_version_id
         OR source.taxability_snapshot IS DISTINCT FROM line.taxability_snapshot
         OR tax_version.id IS NULL OR tax_version.ruleset_version IS DISTINCT FROM header.calculation_ruleset_version
         OR {source_date}<tax_version.effective_from
         OR (tax_version.effective_to IS NOT NULL AND {source_date}>tax_version.effective_to)'''
    purchase_uninvoiced = ""
    if not sales:
        purchase_uninvoiced = '''
    IF header.return_source_kind='uninvoiced' THEN
      WITH reversal_input AS (SELECT value item FROM pg_catalog.jsonb_array_elements(input_doc#>'{reversal,products}')),
           reversal_output AS (SELECT value item FROM pg_catalog.jsonb_array_elements(output_doc->'lines')),
           original_output AS (SELECT value item FROM pg_catalog.jsonb_array_elements(input_doc#>'{original,lines}'))
      SELECT count(*) INTO bad_count
        FROM procurement.purchase_return_lines line
        JOIN procurement.goods_receipt_lines receipt
          ON receipt.org_id=line.org_id AND receipt.id=line.goods_receipt_line_id
        JOIN procurement.goods_receipts receipt_header
          ON receipt_header.org_id=receipt.org_id AND receipt_header.id=receipt.goods_receipt_id
        JOIN inventory.locations receipt_location
          ON receipt_location.org_id=receipt.org_id AND receipt_location.id=receipt.location_id
        LEFT JOIN procurement.supplier_invoice_receipt_allocations forbidden
          ON forbidden.org_id=line.org_id AND forbidden.id=line.supplier_invoice_receipt_allocation_id
        LEFT JOIN reversal_input requested ON requested.item->>'line_id'=line.goods_receipt_line_id::text
        LEFT JOIN reversal_output calculated ON calculated.item->>'line_id'=line.goods_receipt_line_id::text
        LEFT JOIN original_output original_line ON original_line.item->>'line_id'=line.goods_receipt_line_id::text
       WHERE line.org_id=organization_id AND line.purchase_return_id=resource_id
         AND (line.gst_tax_treatment IS DISTINCT FROM header.gst_tax_treatment
           OR forbidden.id IS NOT NULL OR requested.item IS NULL OR calculated.item IS NULL OR original_line.item IS NULL
           OR receipt_header.status<>'posted' OR receipt_header.branch_id IS DISTINCT FROM header.branch_id
           OR receipt_header.supplier_account_id IS DISTINCT FROM header.supplier_account_id
           OR receipt_location.status<>'active' OR receipt_location.branch_id IS DISTINCT FROM header.branch_id
           OR requested.item->>'value_basis' IS DISTINCT FROM line.reversal_value_basis
           OR (requested.item->>'final_residual')::boolean IS DISTINCT FROM line.final_residual
           OR (requested.item->>'reversed_billed_quantity')::numeric IS DISTINCT FROM line.billed_quantity
           OR (requested.item->>'reversed_free_quantity')::numeric IS DISTINCT FROM line.free_quantity
           OR (requested.item->>'reversed_base_billed_quantity')::numeric IS DISTINCT FROM line.base_billed_quantity
           OR (requested.item->>'reversed_base_free_quantity')::numeric IS DISTINCT FROM line.base_free_quantity
           OR ROW((calculated.item->>'net_value_amount')::numeric,(calculated.item->>'gst_taxable_value')::numeric,
                  (calculated.item->>'cgst_amount')::numeric,(calculated.item->>'sgst_amount')::numeric,
                  (calculated.item->>'igst_amount')::numeric,(calculated.item->>'cess_amount')::numeric,
                  (calculated.item->>'line_total')::numeric,(calculated.item->>'final_residual')::boolean)
              IS DISTINCT FROM ROW(line.net_value_amount,line.gst_taxable_value,line.cgst_amount,line.sgst_amount,line.igst_amount,line.cess_amount,line.line_total,line.final_residual)
           OR (original_line.item->>'net_value_amount')::numeric IS DISTINCT FROM receipt.extended_cost
           OR (original_line.item->>'gst_taxable_value')::numeric<>0 OR (original_line.item->>'cgst_amount')::numeric<>0
           OR (original_line.item->>'sgst_amount')::numeric<>0 OR (original_line.item->>'igst_amount')::numeric<>0
           OR (original_line.item->>'cess_amount')::numeric<>0 OR (original_line.item->>'line_total')::numeric IS DISTINCT FROM receipt.extended_cost
           OR line.product_id IS DISTINCT FROM receipt.product_id
           OR line.batch_id IS DISTINCT FROM receipt.batch_id OR line.from_location_id IS DISTINCT FROM receipt.location_id
           OR line.quoted_unit_rate IS DISTINCT FROM receipt.unit_cost
           OR (receipt.accepted_quantity>0 AND pg_catalog.round(receipt.accepted_quantity*line.uom_conversion_factor,6) IS DISTINCT FROM receipt.base_accepted_quantity)
           OR (receipt.free_quantity>0 AND pg_catalog.round(receipt.free_quantity*line.uom_conversion_factor,6) IS DISTINCT FROM receipt.base_free_quantity)
           OR line.gst_taxable_value<>0 OR line.cgst_amount<>0 OR line.sgst_amount<>0 OR line.igst_amount<>0 OR line.cess_amount<>0
           OR line.net_value_amount<>pg_catalog.round((line.base_billed_quantity+line.base_free_quantity)*receipt.unit_cost,2)
           OR line.line_total<>line.net_value_amount);
      IF bad_count<>0 OR header.gst_taxable_total<>0 OR header.cgst_total<>0 OR header.sgst_total<>0
         OR header.igst_total<>0 OR header.cess_total<>0 OR header.recipient_assessed_tax_total<>0
         OR header.rounding_adjustment<>0 OR header.grand_total<>header.net_value_total THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='uninvoiced purchase return differs from locked goods-receipt cost or carries GST';
      END IF;
    END IF;'''
    cumulative_guard = (
        '''SELECT count(*) INTO bad_count FROM (
          SELECT current.invoice_line_id source_id,max(source.base_billed_quantity) source_billed,max(source.base_free_quantity) source_free,
                 sum(all_returns.base_billed_quantity) reversed_billed,sum(all_returns.base_free_quantity) reversed_free,
                 sum(all_returns.net_value_amount) reversed_net,sum(all_returns.gst_taxable_value) reversed_taxable,
                 sum(all_returns.cgst_amount) reversed_cgst,sum(all_returns.sgst_amount) reversed_sgst,
                 sum(all_returns.igst_amount) reversed_igst,sum(all_returns.cess_amount) reversed_cess,sum(all_returns.line_total) reversed_total,
                 max(source.net_value_amount) source_net,max(source.gst_taxable_value) source_taxable,max(source.cgst_amount) source_cgst,
                 max(source.sgst_amount) source_sgst,max(source.igst_amount) source_igst,max(source.cess_amount) source_cess,max(source.line_total) source_total,
                 bool_or(current.final_residual) final_residual
            FROM sales.return_lines current
            JOIN sales.invoice_lines source ON source.org_id=current.org_id AND source.id=current.invoice_line_id
            JOIN sales.return_lines all_returns ON all_returns.org_id=current.org_id AND all_returns.invoice_line_id=current.invoice_line_id
            JOIN sales.returns prior_header ON prior_header.org_id=all_returns.org_id AND prior_header.id=all_returns.return_id
           WHERE current.org_id=organization_id AND current.return_id=resource_id
             AND (prior_header.status='posted' OR prior_header.id=resource_id)
           GROUP BY current.invoice_line_id
        ) cumulative WHERE reversed_billed>source_billed OR reversed_free>source_free
           OR reversed_taxable>source_taxable OR reversed_cgst>source_cgst OR reversed_sgst>source_sgst
           OR reversed_igst>source_igst OR reversed_cess>source_cess OR reversed_total>source_total
           OR (final_residual AND (reversed_billed<>source_billed OR reversed_free<>source_free OR reversed_total<>source_total));
        IF bad_count=0 THEN
          SELECT count(*) INTO bad_count FROM (
            SELECT current.invoice_dispatch_allocation_id allocation_id,max(allocation.allocated_base_billed_quantity) source_billed,
                   max(allocation.allocated_base_free_quantity) source_free,sum(all_returns.base_billed_quantity) reversed_billed,sum(all_returns.base_free_quantity) reversed_free
              FROM sales.return_lines current
              JOIN sales.invoice_dispatch_allocations allocation ON allocation.org_id=current.org_id AND allocation.id=current.invoice_dispatch_allocation_id
              JOIN sales.return_lines all_returns ON all_returns.org_id=allocation.org_id AND all_returns.invoice_dispatch_allocation_id=allocation.id
              JOIN sales.returns prior_header ON prior_header.org_id=all_returns.org_id AND prior_header.id=all_returns.return_id
             WHERE current.org_id=organization_id AND current.return_id=resource_id AND (prior_header.status='posted' OR prior_header.id=resource_id)
             GROUP BY current.invoice_dispatch_allocation_id
          ) allocation_total WHERE reversed_billed>source_billed OR reversed_free>source_free;
        END IF;
        IF bad_count=0 THEN
          SELECT count(*) INTO bad_count FROM (
            SELECT current.invoice_line_id,current.batch_id,
                   max(issued.issued_base_quantity) issued_base_quantity,
                   sum(all_returns.base_billed_quantity+all_returns.base_free_quantity) returned_base_quantity
              FROM sales.return_lines current
              JOIN LATERAL (
                SELECT sum(issue_line.base_quantity) issued_base_quantity
                  FROM inventory.inventory_document_lines issue_line
                  JOIN inventory.inventory_documents issue_document
                    ON issue_document.org_id=issue_line.org_id AND issue_document.id=issue_line.inventory_document_id
                 WHERE issue_line.org_id=current.org_id AND issue_line.sales_invoice_line_id=current.invoice_line_id
                   AND issue_line.batch_id=current.batch_id AND issue_document.sales_invoice_id=header.invoice_id
                   AND issue_document.document_type='sales_issue' AND issue_document.status='posted'
              ) issued ON true
              JOIN sales.return_lines all_returns ON all_returns.org_id=current.org_id
                AND all_returns.invoice_line_id=current.invoice_line_id AND all_returns.batch_id=current.batch_id
                AND all_returns.invoice_dispatch_allocation_id IS NULL
              JOIN sales.returns prior_header ON prior_header.org_id=all_returns.org_id AND prior_header.id=all_returns.return_id
             WHERE current.org_id=organization_id AND current.return_id=resource_id
               AND current.invoice_dispatch_allocation_id IS NULL
               AND (prior_header.status='posted' OR prior_header.id=resource_id)
             GROUP BY current.invoice_line_id,current.batch_id
          ) direct_batch WHERE issued_base_quantity IS NULL OR returned_base_quantity>issued_base_quantity;
        END IF;
        IF bad_count<>0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='cumulative sales return exceeds original or final residual is incomplete'; END IF;'''
        if sales
        else '''IF header.return_source_kind='invoiced' THEN
          SELECT count(*) INTO bad_count FROM (
            SELECT source.id source_id,max(source.base_billed_quantity) source_billed,max(source.base_free_quantity) source_free,
                   sum(all_returns.base_billed_quantity) reversed_billed,sum(all_returns.base_free_quantity) reversed_free,bool_or(current.final_residual) final_residual
                   ,sum(all_returns.net_value_amount) reversed_net,sum(all_returns.gst_taxable_value) reversed_taxable,
                   sum(all_returns.cgst_amount) reversed_cgst,sum(all_returns.sgst_amount) reversed_sgst,sum(all_returns.igst_amount) reversed_igst,sum(all_returns.cess_amount) reversed_cess,sum(all_returns.line_total) reversed_total,
                   max(source.net_value_amount) source_net,max(source.gst_taxable_value) source_taxable,max(source.cgst_amount) source_cgst,max(source.sgst_amount) source_sgst,max(source.igst_amount) source_igst,max(source.cess_amount) source_cess,max(source.line_total) source_total
              FROM procurement.purchase_return_lines current
              JOIN procurement.supplier_invoice_receipt_allocations allocation ON allocation.org_id=current.org_id AND allocation.id=current.supplier_invoice_receipt_allocation_id
              JOIN procurement.supplier_invoice_lines source ON source.org_id=allocation.org_id AND source.id=allocation.supplier_invoice_line_id
              JOIN procurement.supplier_invoice_receipt_allocations all_source_allocations ON all_source_allocations.org_id=source.org_id AND all_source_allocations.supplier_invoice_line_id=source.id
              JOIN procurement.purchase_return_lines all_returns ON all_returns.org_id=all_source_allocations.org_id AND all_returns.supplier_invoice_receipt_allocation_id=all_source_allocations.id
              JOIN procurement.purchase_returns prior_header ON prior_header.org_id=all_returns.org_id AND prior_header.id=all_returns.purchase_return_id
             WHERE current.org_id=organization_id AND current.purchase_return_id=resource_id AND (prior_header.status='posted' OR prior_header.id=resource_id)
             GROUP BY source.id
          ) cumulative WHERE reversed_billed>source_billed OR reversed_free>source_free
             OR reversed_taxable>source_taxable OR reversed_cgst>source_cgst OR reversed_sgst>source_sgst OR reversed_igst>source_igst OR reversed_cess>source_cess OR reversed_total>source_total
             OR (final_residual AND (reversed_billed<>source_billed OR reversed_free<>source_free OR reversed_total<>source_total));
          IF bad_count=0 THEN
            SELECT count(*) INTO bad_count FROM (
              SELECT current.supplier_invoice_receipt_allocation_id allocation_id,
                     max(allocation.allocated_base_billed_quantity) source_billed,max(allocation.allocated_base_free_quantity) source_free,
                     sum(all_returns.base_billed_quantity) reversed_billed,sum(all_returns.base_free_quantity) reversed_free
                FROM procurement.purchase_return_lines current
                JOIN procurement.supplier_invoice_receipt_allocations allocation ON allocation.org_id=current.org_id AND allocation.id=current.supplier_invoice_receipt_allocation_id
                JOIN procurement.purchase_return_lines all_returns ON all_returns.org_id=allocation.org_id AND all_returns.supplier_invoice_receipt_allocation_id=allocation.id
                JOIN procurement.purchase_returns prior_header ON prior_header.org_id=all_returns.org_id AND prior_header.id=all_returns.purchase_return_id
               WHERE current.org_id=organization_id AND current.purchase_return_id=resource_id AND (prior_header.status='posted' OR prior_header.id=resource_id)
               GROUP BY current.supplier_invoice_receipt_allocation_id
            ) allocation_total WHERE reversed_billed>source_billed OR reversed_free>source_free;
          END IF;
        ELSE
          SELECT count(*) INTO bad_count FROM (
            SELECT current.goods_receipt_line_id source_id,max(receipt.base_accepted_quantity) source_billed,max(receipt.base_free_quantity) source_free,
                   sum(all_returns.base_billed_quantity) reversed_billed,sum(all_returns.base_free_quantity) reversed_free,bool_or(current.final_residual) final_residual,
                   max(receipt.extended_cost) source_net,sum(all_returns.net_value_amount) reversed_net
              FROM procurement.purchase_return_lines current
              JOIN procurement.goods_receipt_lines receipt ON receipt.org_id=current.org_id AND receipt.id=current.goods_receipt_line_id
              JOIN procurement.purchase_return_lines all_returns ON all_returns.org_id=current.org_id AND all_returns.goods_receipt_line_id=current.goods_receipt_line_id
              JOIN procurement.purchase_returns prior_header ON prior_header.org_id=all_returns.org_id AND prior_header.id=all_returns.purchase_return_id
             WHERE current.org_id=organization_id AND current.purchase_return_id=resource_id AND (prior_header.status='posted' OR prior_header.id=resource_id)
             GROUP BY current.goods_receipt_line_id
          ) cumulative WHERE reversed_billed>source_billed OR reversed_free>source_free OR reversed_net>source_net
             OR (final_residual AND (reversed_billed<>source_billed OR reversed_free<>source_free OR reversed_net<>source_net));
        END IF;
        IF bad_count<>0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='cumulative purchase return exceeds source or final residual is incomplete'; END IF;'''
    )
    header_cumulative_guard = (
        '''SELECT coalesce(sum(prior.grand_total),0),coalesce(sum(prior.rounding_adjustment),0) INTO cumulative_grand,cumulative_rounding
             FROM sales.returns prior WHERE prior.org_id=organization_id AND prior.invoice_id=header.invoice_id
               AND (prior.status='posted' OR prior.id=resource_id);
           IF cumulative_grand>original.grand_total OR (original.rounding_adjustment>=0 AND (cumulative_rounding<0 OR cumulative_rounding>original.rounding_adjustment))
              OR (original.rounding_adjustment<0 AND (cumulative_rounding>0 OR cumulative_rounding<original.rounding_adjustment)) THEN
             RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='cumulative sales return header exceeds original invoice'; END IF;'''
        if sales
        else '''IF header.return_source_kind='invoiced' THEN
          SELECT coalesce(sum(prior.grand_total),0),coalesce(sum(prior.rounding_adjustment),0) INTO cumulative_grand,cumulative_rounding
            FROM procurement.purchase_returns prior WHERE prior.org_id=organization_id AND prior.supplier_invoice_id=header.supplier_invoice_id
              AND (prior.status='posted' OR prior.id=resource_id);
          IF cumulative_grand>original.grand_total OR (original.rounding_adjustment>=0 AND (cumulative_rounding<0 OR cumulative_rounding>original.rounding_adjustment))
             OR (original.rounding_adjustment<0 AND (cumulative_rounding>0 OR cumulative_rounding<original.rounding_adjustment)) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='cumulative purchase return header exceeds original invoice'; END IF;
        END IF;'''
    )
    prior_state_guard = (
        '''SELECT count(*) INTO bad_count FROM finance.adjustment_note_lines adjustment_line
             JOIN finance.adjustment_notes adjustment ON adjustment.org_id=adjustment_line.org_id AND adjustment.id=adjustment_line.adjustment_note_id
             JOIN sales.return_lines current ON current.org_id=adjustment_line.org_id AND current.invoice_line_id=adjustment_line.sales_invoice_line_id
            WHERE current.org_id=organization_id AND current.return_id=resource_id AND adjustment.status='posted'
              AND adjustment.sales_return_id IS NULL AND adjustment.purchase_return_id IS NULL;
           IF bad_count<>0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return after a generic adjustment is blocked because the reversal artifact cannot encode an adjusted original basis'; END IF;
           WITH current_sources AS (
             SELECT DISTINCT line.invoice_line_id source_id FROM sales.return_lines line
              WHERE line.org_id=organization_id AND line.return_id=resource_id
           ), prior_rows AS (
             SELECT line.invoice_line_id source_id,line.reversal_value_basis,line.billed_quantity,line.free_quantity,
                    line.base_billed_quantity,line.base_free_quantity,calculated.item
               FROM sales.return_lines line
               JOIN current_sources current ON current.source_id=line.invoice_line_id
               JOIN sales.returns prior ON prior.org_id=line.org_id AND prior.id=line.return_id AND prior.status='posted' AND prior.id<>resource_id
               JOIN calculation.artifacts artifact ON artifact.org_id=prior.org_id AND artifact.sales_return_id=prior.id AND artifact.status='consumed'
               JOIN LATERAL pg_catalog.jsonb_array_elements(pg_catalog.convert_from(artifact.output_bytes,'UTF8')::jsonb->'lines') calculated(item)
                 ON calculated.item->>'line_id'=line.invoice_line_id::text
              WHERE line.org_id=organization_id AND prior.invoice_id=header.invoice_id
           ), expected AS (
             SELECT source_id,min(reversal_value_basis) value_basis,count(DISTINCT reversal_value_basis) basis_count,
                    sum(billed_quantity) billed_quantity,sum(free_quantity) free_quantity,sum(base_billed_quantity) base_billed_quantity,
                    sum(base_free_quantity) base_free_quantity,sum((item->>'gross_amount')::numeric) gross_amount,
                    sum((item->>'line_discount_amount')::numeric) line_discount_amount,
                    sum((item->>'document_discount_amount')::numeric) document_discount_amount,
                    sum((item->>'net_value_amount')::numeric) net_value_amount,sum((item->>'gst_taxable_value')::numeric) gst_taxable_value,
                    sum((item->>'cgst_amount')::numeric) cgst_amount,sum((item->>'sgst_amount')::numeric) sgst_amount,
                    sum((item->>'igst_amount')::numeric) igst_amount,sum((item->>'cess_amount')::numeric) cess_amount
               FROM prior_rows GROUP BY source_id
           ), provided AS (SELECT value item FROM pg_catalog.jsonb_array_elements(input_doc#>'{reversal,prior_state,products}'))
           SELECT count(*) INTO bad_count FROM expected FULL JOIN provided ON provided.item->>'line_id'=expected.source_id::text
            WHERE expected.source_id IS NULL OR provided.item IS NULL OR expected.basis_count<>1
               OR provided.item->>'value_basis' IS DISTINCT FROM expected.value_basis
               OR ROW((provided.item->>'reversed_billed_quantity')::numeric,(provided.item->>'reversed_free_quantity')::numeric,
                      (provided.item->>'reversed_base_billed_quantity')::numeric,(provided.item->>'reversed_base_free_quantity')::numeric,
                      (provided.item->>'gross_price_amount')::numeric,(provided.item->>'line_discount_amount')::numeric,
                      (provided.item->>'document_discount_amount')::numeric,(provided.item->>'net_value_amount')::numeric,
                      (provided.item->>'gst_taxable_value')::numeric,(provided.item->>'cgst_amount')::numeric,
                      (provided.item->>'sgst_amount')::numeric,(provided.item->>'igst_amount')::numeric,(provided.item->>'cess_amount')::numeric)
                  IS DISTINCT FROM ROW(expected.billed_quantity,expected.free_quantity,expected.base_billed_quantity,expected.base_free_quantity,
                      expected.gross_amount,expected.line_discount_amount,expected.document_discount_amount,expected.net_value_amount,
                      expected.gst_taxable_value,expected.cgst_amount,expected.sgst_amount,expected.igst_amount,expected.cess_amount);
           IF bad_count<>0 OR (input_doc#>>'{reversal,prior_state,rounding_adjustment}')::numeric IS DISTINCT FROM
              (SELECT coalesce(sum(prior.rounding_adjustment),0) FROM sales.returns prior WHERE prior.org_id=organization_id AND prior.invoice_id=header.invoice_id AND prior.status='posted' AND prior.id<>resource_id) THEN
             RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='artifact prior state differs from locked posted sales returns'; END IF;'''
        if sales
        else '''WITH current_sources AS (
             SELECT DISTINCT CASE WHEN header.return_source_kind='invoiced' THEN allocation.supplier_invoice_line_id ELSE line.goods_receipt_line_id END source_id
               FROM procurement.purchase_return_lines line
               LEFT JOIN procurement.supplier_invoice_receipt_allocations allocation ON allocation.org_id=line.org_id AND allocation.id=line.supplier_invoice_receipt_allocation_id
              WHERE line.org_id=organization_id AND line.purchase_return_id=resource_id
           ), prior_rows AS (
             SELECT CASE WHEN prior.return_source_kind='invoiced' THEN allocation.supplier_invoice_line_id ELSE line.goods_receipt_line_id END source_id,
                    line.reversal_value_basis,line.billed_quantity,line.free_quantity,line.base_billed_quantity,line.base_free_quantity,calculated.item
               FROM procurement.purchase_return_lines line
               JOIN procurement.purchase_returns prior ON prior.org_id=line.org_id AND prior.id=line.purchase_return_id AND prior.status='posted' AND prior.id<>resource_id
               LEFT JOIN procurement.supplier_invoice_receipt_allocations allocation ON allocation.org_id=line.org_id AND allocation.id=line.supplier_invoice_receipt_allocation_id
               JOIN current_sources current ON current.source_id=CASE WHEN prior.return_source_kind='invoiced' THEN allocation.supplier_invoice_line_id ELSE line.goods_receipt_line_id END
               JOIN calculation.artifacts artifact ON artifact.org_id=prior.org_id AND artifact.purchase_return_id=prior.id AND artifact.status='consumed'
               JOIN LATERAL pg_catalog.jsonb_array_elements(pg_catalog.convert_from(artifact.output_bytes,'UTF8')::jsonb->'lines') calculated(item)
                 ON calculated.item->>'line_id'=current.source_id::text
              WHERE line.org_id=organization_id AND prior.return_source_kind=header.return_source_kind
                AND (header.return_source_kind='uninvoiced' OR prior.supplier_invoice_id=header.supplier_invoice_id)
           ), expected AS (
             SELECT source_id,min(reversal_value_basis) value_basis,count(DISTINCT reversal_value_basis) basis_count,
                    sum(billed_quantity) billed_quantity,sum(free_quantity) free_quantity,sum(base_billed_quantity) base_billed_quantity,sum(base_free_quantity) base_free_quantity,
                    sum((item->>'gross_amount')::numeric) gross_amount,sum((item->>'line_discount_amount')::numeric) line_discount_amount,
                    sum((item->>'document_discount_amount')::numeric) document_discount_amount,sum((item->>'net_value_amount')::numeric) net_value_amount,
                    sum((item->>'gst_taxable_value')::numeric) gst_taxable_value,sum((item->>'cgst_amount')::numeric) cgst_amount,
                    sum((item->>'sgst_amount')::numeric) sgst_amount,sum((item->>'igst_amount')::numeric) igst_amount,sum((item->>'cess_amount')::numeric) cess_amount
               FROM prior_rows GROUP BY source_id
           ), provided AS (SELECT value item FROM pg_catalog.jsonb_array_elements(input_doc#>'{reversal,prior_state,products}'))
           SELECT count(*) INTO bad_count FROM expected FULL JOIN provided ON provided.item->>'line_id'=expected.source_id::text
            WHERE expected.source_id IS NULL OR provided.item IS NULL OR expected.basis_count<>1 OR provided.item->>'value_basis' IS DISTINCT FROM expected.value_basis
               OR ROW((provided.item->>'reversed_billed_quantity')::numeric,(provided.item->>'reversed_free_quantity')::numeric,(provided.item->>'reversed_base_billed_quantity')::numeric,
                      (provided.item->>'reversed_base_free_quantity')::numeric,(provided.item->>'gross_price_amount')::numeric,(provided.item->>'line_discount_amount')::numeric,
                      (provided.item->>'document_discount_amount')::numeric,(provided.item->>'net_value_amount')::numeric,(provided.item->>'gst_taxable_value')::numeric,
                      (provided.item->>'cgst_amount')::numeric,(provided.item->>'sgst_amount')::numeric,(provided.item->>'igst_amount')::numeric,(provided.item->>'cess_amount')::numeric)
                  IS DISTINCT FROM ROW(expected.billed_quantity,expected.free_quantity,expected.base_billed_quantity,expected.base_free_quantity,expected.gross_amount,
                      expected.line_discount_amount,expected.document_discount_amount,expected.net_value_amount,expected.gst_taxable_value,
                      expected.cgst_amount,expected.sgst_amount,expected.igst_amount,expected.cess_amount);
           IF bad_count<>0 OR (input_doc#>>'{reversal,prior_state,rounding_adjustment}')::numeric IS DISTINCT FROM
              (SELECT coalesce(sum(prior.rounding_adjustment),0) FROM procurement.purchase_returns prior WHERE prior.org_id=organization_id
                AND prior.status='posted' AND prior.id<>resource_id AND prior.return_source_kind=header.return_source_kind
                AND (header.return_source_kind='uninvoiced' OR prior.supplier_invoice_id=header.supplier_invoice_id)) THEN
             RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='artifact prior state differs from locked posted purchase returns'; END IF;'''
    )
    cross_adjustment_guard = (
        '''WITH current_sources AS (
             SELECT DISTINCT invoice_line_id source_id FROM sales.return_lines
              WHERE org_id=organization_id AND return_id=resource_id
           ), returned AS (
             SELECT line.invoice_line_id source_id,sum(line.base_billed_quantity) billed,sum(line.base_free_quantity) free,
                    sum(line.net_value_amount) net,sum(line.gst_taxable_value) taxable,sum(line.cgst_amount) cgst,
                    sum(line.sgst_amount) sgst,sum(line.igst_amount) igst,sum(line.cess_amount) cess,sum(line.line_total) total
               FROM sales.return_lines line JOIN sales.returns parent ON parent.org_id=line.org_id AND parent.id=line.return_id
               JOIN current_sources current ON current.source_id=line.invoice_line_id
              WHERE line.org_id=organization_id AND (parent.status='posted' OR parent.id=resource_id) GROUP BY line.invoice_line_id
           ), adjusted AS (
             SELECT line.sales_invoice_line_id source_id,
                    sum((CASE WHEN note.document_effect='increase' THEN 1 ELSE -1 END)*line.base_billed_quantity) billed,
                    sum((CASE WHEN note.document_effect='increase' THEN 1 ELSE -1 END)*line.base_free_quantity) free,
                    sum((CASE WHEN note.document_effect='increase' THEN 1 ELSE -1 END)*line.net_value_amount) net,
                    sum((CASE WHEN note.document_effect='increase' THEN 1 ELSE -1 END)*line.gst_taxable_value) taxable,
                    sum((CASE WHEN note.document_effect='increase' THEN 1 ELSE -1 END)*line.cgst_amount) cgst,
                    sum((CASE WHEN note.document_effect='increase' THEN 1 ELSE -1 END)*line.sgst_amount) sgst,
                    sum((CASE WHEN note.document_effect='increase' THEN 1 ELSE -1 END)*line.igst_amount) igst,
                    sum((CASE WHEN note.document_effect='increase' THEN 1 ELSE -1 END)*line.cess_amount) cess,
                    sum((CASE WHEN note.document_effect='increase' THEN 1 ELSE -1 END)*line.line_total) total
               FROM finance.adjustment_note_lines line JOIN finance.adjustment_notes note ON note.org_id=line.org_id AND note.id=line.adjustment_note_id
               JOIN current_sources current ON current.source_id=line.sales_invoice_line_id
              WHERE line.org_id=organization_id AND note.status='posted' AND note.sales_return_id IS NULL AND note.purchase_return_id IS NULL
              GROUP BY line.sales_invoice_line_id
           )
           SELECT count(*) INTO bad_count FROM current_sources current JOIN sales.invoice_lines source ON source.org_id=organization_id AND source.id=current.source_id
             JOIN returned ON returned.source_id=current.source_id LEFT JOIN adjusted ON adjusted.source_id=current.source_id
            WHERE coalesce(adjusted.billed,0)-returned.billed < -source.base_billed_quantity
               OR coalesce(adjusted.free,0)-returned.free < -source.base_free_quantity
               OR coalesce(adjusted.net,0)-returned.net < -source.net_value_amount
               OR coalesce(adjusted.taxable,0)-returned.taxable < -source.gst_taxable_value
               OR coalesce(adjusted.cgst,0)-returned.cgst < -source.cgst_amount OR coalesce(adjusted.sgst,0)-returned.sgst < -source.sgst_amount
               OR coalesce(adjusted.igst,0)-returned.igst < -source.igst_amount OR coalesce(adjusted.cess,0)-returned.cess < -source.cess_amount
               OR coalesce(adjusted.total,0)-returned.total < -source.line_total;
           IF bad_count<>0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='combined sales returns and generic adjustments exceed the original invoice'; END IF;'''
        if sales
        else '''IF header.return_source_kind='invoiced' THEN
          SELECT count(*) INTO bad_count FROM finance.adjustment_note_lines adjustment_line
            JOIN finance.adjustment_notes adjustment ON adjustment.org_id=adjustment_line.org_id AND adjustment.id=adjustment_line.adjustment_note_id
            JOIN procurement.supplier_invoice_receipt_allocations allocation ON allocation.org_id=adjustment_line.org_id AND allocation.supplier_invoice_line_id=adjustment_line.supplier_invoice_line_id
            JOIN procurement.purchase_return_lines current ON current.org_id=allocation.org_id AND current.supplier_invoice_receipt_allocation_id=allocation.id
           WHERE current.org_id=organization_id AND current.purchase_return_id=resource_id AND adjustment.status='posted'
             AND adjustment.sales_return_id IS NULL AND adjustment.purchase_return_id IS NULL;
          IF bad_count<>0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return after a generic adjustment is blocked because the reversal artifact cannot encode an adjusted original basis'; END IF;
          WITH current_sources AS (
            SELECT DISTINCT allocation.supplier_invoice_line_id source_id FROM procurement.purchase_return_lines line
             JOIN procurement.supplier_invoice_receipt_allocations allocation ON allocation.org_id=line.org_id AND allocation.id=line.supplier_invoice_receipt_allocation_id
            WHERE line.org_id=organization_id AND line.purchase_return_id=resource_id
          ), returned AS (
            SELECT allocation.supplier_invoice_line_id source_id,sum(line.base_billed_quantity) billed,sum(line.base_free_quantity) free,
                   sum(line.net_value_amount) net,sum(line.gst_taxable_value) taxable,sum(line.cgst_amount) cgst,sum(line.sgst_amount) sgst,
                   sum(line.igst_amount) igst,sum(line.cess_amount) cess,sum(line.line_total) total
              FROM procurement.purchase_return_lines line JOIN procurement.purchase_returns parent ON parent.org_id=line.org_id AND parent.id=line.purchase_return_id
              JOIN procurement.supplier_invoice_receipt_allocations allocation ON allocation.org_id=line.org_id AND allocation.id=line.supplier_invoice_receipt_allocation_id
              JOIN current_sources current ON current.source_id=allocation.supplier_invoice_line_id
             WHERE line.org_id=organization_id AND (parent.status='posted' OR parent.id=resource_id) GROUP BY allocation.supplier_invoice_line_id
          ), adjusted AS (
            SELECT line.supplier_invoice_line_id source_id,
                   sum((CASE WHEN note.document_effect='increase' THEN 1 ELSE -1 END)*line.base_billed_quantity) billed,
                   sum((CASE WHEN note.document_effect='increase' THEN 1 ELSE -1 END)*line.base_free_quantity) free,
                   sum((CASE WHEN note.document_effect='increase' THEN 1 ELSE -1 END)*line.net_value_amount) net,
                   sum((CASE WHEN note.document_effect='increase' THEN 1 ELSE -1 END)*line.gst_taxable_value) taxable,
                   sum((CASE WHEN note.document_effect='increase' THEN 1 ELSE -1 END)*line.cgst_amount) cgst,
                   sum((CASE WHEN note.document_effect='increase' THEN 1 ELSE -1 END)*line.sgst_amount) sgst,
                   sum((CASE WHEN note.document_effect='increase' THEN 1 ELSE -1 END)*line.igst_amount) igst,
                   sum((CASE WHEN note.document_effect='increase' THEN 1 ELSE -1 END)*line.cess_amount) cess,
                   sum((CASE WHEN note.document_effect='increase' THEN 1 ELSE -1 END)*line.line_total) total
              FROM finance.adjustment_note_lines line JOIN finance.adjustment_notes note ON note.org_id=line.org_id AND note.id=line.adjustment_note_id
              JOIN current_sources current ON current.source_id=line.supplier_invoice_line_id
             WHERE line.org_id=organization_id AND note.status='posted' AND note.sales_return_id IS NULL AND note.purchase_return_id IS NULL
             GROUP BY line.supplier_invoice_line_id
          )
          SELECT count(*) INTO bad_count FROM current_sources current JOIN procurement.supplier_invoice_lines source ON source.org_id=organization_id AND source.id=current.source_id
            JOIN returned ON returned.source_id=current.source_id LEFT JOIN adjusted ON adjusted.source_id=current.source_id
           WHERE coalesce(adjusted.billed,0)-returned.billed < -source.base_billed_quantity
              OR coalesce(adjusted.free,0)-returned.free < -source.base_free_quantity OR coalesce(adjusted.net,0)-returned.net < -source.net_value_amount
              OR coalesce(adjusted.taxable,0)-returned.taxable < -source.gst_taxable_value OR coalesce(adjusted.cgst,0)-returned.cgst < -source.cgst_amount
              OR coalesce(adjusted.sgst,0)-returned.sgst < -source.sgst_amount OR coalesce(adjusted.igst,0)-returned.igst < -source.igst_amount
              OR coalesce(adjusted.cess,0)-returned.cess < -source.cess_amount OR coalesce(adjusted.total,0)-returned.total < -source.line_total;
          IF bad_count<>0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='combined purchase returns and generic adjustments exceed the original invoice'; END IF;
        END IF;'''
    )
    cross_adjustment_lock = (
        "PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(organization_id::text||original.id::text,734821));"
        if sales
        else "IF header.return_source_kind='invoiced' THEN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(organization_id::text||original.id::text,734821)); END IF;"
    )

    return _function(
        f"{name}(organization_id uuid, resource_id uuid, input_doc jsonb, output_doc jsonb)",
        "void",
        f'''
DECLARE header {header_table}%ROWTYPE; original {original_header}%ROWTYPE;
        expected_lines bigint; bad_count bigint; cumulative_grand numeric(20,2); cumulative_rounding numeric(20,2);
BEGIN
    SELECT * INTO STRICT header FROM {header_table} WHERE org_id=organization_id AND id=resource_id FOR UPDATE;
    IF header.status NOT IN ('draft','approved','posted') THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return is not postable or posted'; END IF;
    {original_lock}
    {cross_adjustment_lock}
    PERFORM erp_calculation_authority.assert_input_schema(input_doc);
    PERFORM erp_calculation_authority.assert_output_schema(output_doc);
    IF input_doc->>'calculation_kind'<>'reversal' OR input_doc->>'operation'<>'{operation}'
       OR input_doc#>>'{{reversal,gst_tax_treatment}}' IS DISTINCT FROM header.gst_tax_treatment
       OR output_doc->>'gst_tax_treatment' IS DISTINCT FROM header.gst_tax_treatment
       OR input_doc->>'resource_type'<>'{resource}' OR input_doc->>'resource_id'<>resource_id::text
       OR (input_doc->>'aggregate_version')::bigint IS DISTINCT FROM header.row_version
       OR output_doc->>'operation'<>'{operation}' OR output_doc->>'resource_type'<>'{resource}'
       OR output_doc->>'resource_id'<>resource_id::text
       OR (output_doc->>'aggregate_version')::bigint IS DISTINCT FROM header.row_version
       OR output_doc->>'ruleset_version' IS DISTINCT FROM header.calculation_ruleset_version
       OR ROW((output_doc#>>'{{totals,net_value_total}}')::numeric,(output_doc#>>'{{totals,gst_taxable_total}}')::numeric,
              (output_doc#>>'{{totals,cgst_total}}')::numeric,(output_doc#>>'{{totals,sgst_total}}')::numeric,
              (output_doc#>>'{{totals,igst_total}}')::numeric,(output_doc#>>'{{totals,cess_total}}')::numeric,
              (output_doc#>>'{{totals,recipient_assessed_tax_total}}')::numeric,(output_doc#>>'{{totals,rounding_adjustment}}')::numeric,
              (output_doc#>>'{{totals,grand_total}}')::numeric)
          IS DISTINCT FROM ROW(header.net_value_total,header.gst_taxable_total,header.cgst_total,header.sgst_total,
              header.igst_total,header.cess_total,header.recipient_assessed_tax_total,header.rounding_adjustment,header.grand_total)
       OR ({source_kind_check} AND ({header_original_checks}
           header.zero_rated_payment_mode IS DISTINCT FROM original.zero_rated_payment_mode
           OR header.tax_charge_mechanism IS DISTINCT FROM original.tax_charge_mechanism
           OR header.rounding_policy IS DISTINCT FROM original.rounding_policy
           OR header.calculation_ruleset_version IS DISTINCT FROM original.calculation_ruleset_version
           OR input_doc#>>'{{original,resource_id}}' IS DISTINCT FROM original.id::text
           OR ROW((input_doc#>>'{{original,totals,net_value_total}}')::numeric,(input_doc#>>'{{original,totals,gst_taxable_total}}')::numeric,
                  (input_doc#>>'{{original,totals,cgst_total}}')::numeric,(input_doc#>>'{{original,totals,sgst_total}}')::numeric,
                  (input_doc#>>'{{original,totals,igst_total}}')::numeric,(input_doc#>>'{{original,totals,cess_total}}')::numeric,
                  (input_doc#>>'{{original,totals,rounding_adjustment}}')::numeric,(input_doc#>>'{{original,totals,grand_total}}')::numeric)
              IS DISTINCT FROM ROW(original.net_value_total,original.gst_taxable_total,original.cgst_total,original.sgst_total,
                  original.igst_total,original.cess_total,original.rounding_adjustment,original.grand_total))) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return artifact header or original snapshot differs';
    END IF;
    SELECT count(*) INTO expected_lines FROM {line_table} WHERE org_id=organization_id AND {parent}=resource_id;
    IF expected_lines=0 OR pg_catalog.jsonb_array_length(input_doc#>'{{reversal,products}}')<>expected_lines
       OR pg_catalog.jsonb_array_length(input_doc#>'{{reversal,charges}}')<>0
       OR pg_catalog.jsonb_array_length(output_doc->'lines')<>expected_lines THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return artifact line cardinality differs';
    END IF;
    WITH reversal_input AS (SELECT value item FROM pg_catalog.jsonb_array_elements(input_doc#>'{{reversal,products}}')),
         reversal_output AS (SELECT value item FROM pg_catalog.jsonb_array_elements(output_doc->'lines')),
         original_output AS (SELECT value item FROM pg_catalog.jsonb_array_elements(input_doc#>'{{original,lines}}'))
    SELECT count(*) INTO bad_count
      FROM {line_table} line
      {allocation_join}
      LEFT JOIN {original_lines} source ON source.org_id=line.org_id AND {source_join} {source_extra}
      LEFT JOIN tax.tax_code_versions tax_version ON tax_version.id=line.tax_code_version_id
      LEFT JOIN reversal_input requested ON requested.item->>'line_id'=({original_line_id})::text
      LEFT JOIN reversal_output calculated ON calculated.item->>'line_id'=({original_line_id})::text
      LEFT JOIN original_output original_line ON original_line.item->>'line_id'=({original_line_id})::text
     WHERE line.org_id=organization_id AND line.{parent}=resource_id
       AND ({source_kind_check}) AND (requested.item IS NULL OR calculated.item IS NULL OR original_line.item IS NULL
         OR line.gst_tax_treatment IS DISTINCT FROM header.gst_tax_treatment
         OR requested.item->>'value_basis' IS DISTINCT FROM line.reversal_value_basis
         OR (requested.item->>'final_residual')::boolean IS DISTINCT FROM line.final_residual
         OR (requested.item->>'reversed_billed_quantity')::numeric IS DISTINCT FROM line.billed_quantity
         OR (requested.item->>'reversed_free_quantity')::numeric IS DISTINCT FROM line.free_quantity
         OR (requested.item->>'reversed_base_billed_quantity')::numeric IS DISTINCT FROM line.base_billed_quantity
         OR (requested.item->>'reversed_base_free_quantity')::numeric IS DISTINCT FROM line.base_free_quantity
         OR ROW((calculated.item->>'net_value_amount')::numeric,(calculated.item->>'gst_taxable_value')::numeric,
                (calculated.item->>'cgst_rate')::numeric,(calculated.item->>'sgst_rate')::numeric,
                (calculated.item->>'igst_rate')::numeric,(calculated.item->>'cess_rate')::numeric,
                (calculated.item->>'cgst_amount')::numeric,(calculated.item->>'sgst_amount')::numeric,
                (calculated.item->>'igst_amount')::numeric,(calculated.item->>'cess_amount')::numeric,
                (calculated.item->>'line_total')::numeric,(calculated.item->>'final_residual')::boolean)
           IS DISTINCT FROM ROW(line.net_value_amount,line.gst_taxable_value,line.cgst_rate,line.sgst_rate,line.igst_rate,
                line.cess_rate,line.cgst_amount,line.sgst_amount,line.igst_amount,line.cess_amount,line.line_total,line.final_residual)
         OR ROW((original_line.item->>'net_value_amount')::numeric,(original_line.item->>'gst_taxable_value')::numeric,
                (original_line.item->>'cgst_rate')::numeric,(original_line.item->>'sgst_rate')::numeric,
                (original_line.item->>'igst_rate')::numeric,(original_line.item->>'cess_rate')::numeric,
                (original_line.item->>'cgst_amount')::numeric,(original_line.item->>'sgst_amount')::numeric,
                (original_line.item->>'igst_amount')::numeric,(original_line.item->>'cess_amount')::numeric,
                (original_line.item->>'line_total')::numeric)
           IS DISTINCT FROM ROW(source.net_value_amount,source.gst_taxable_value,source.cgst_rate,source.sgst_rate,source.igst_rate,
                source.cess_rate,source.cgst_amount,source.sgst_amount,source.igst_amount,source.cess_amount,source.line_total)
         {source_tax_checks}
         {lineage_checks}
         OR line.base_billed_quantity>{original_quantity} OR line.base_free_quantity>{original_free});
    IF bad_count<>0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return artifact line differs from locked original'; END IF;
    {purchase_uninvoiced}
    {cumulative_guard}
    {cross_adjustment_guard}
    {header_cumulative_guard}
    {prior_state_guard}
END
''',
    )


def _return_command(*, sales: bool) -> list[str]:
    if sales:
        function_name, header_table, line_table, parent = "post_sales_return", "sales.returns", "sales.return_lines", "return_id"
        operation, resource, permission, typed_artifact = "sales.return.post", "sales_return", "sales.return.post", "sales_return_id"
        original_table, original_key = "sales.invoices", "invoice_id"
        party_table, party_key, party_account_col = "parties.customer_accounts", "customer_account_id", "default_receivable_account_id"
        note_side, note_direction, event_side = "sales", "credit", "receivable"
        event_column, return_date, return_number = "sales_return_id", "return_date", "return_number"
        postable_status = "draft"
    else:
        function_name, header_table, line_table, parent = "post_purchase_return", "procurement.purchase_returns", "procurement.purchase_return_lines", "purchase_return_id"
        operation, resource, permission, typed_artifact = "procurement.purchase_return.post", "purchase_return", "procurement.return.post", "purchase_return_id"
        original_table, original_key = "procurement.supplier_invoices", "supplier_invoice_id"
        party_table, party_key, party_account_col = "parties.supplier_accounts", "supplier_account_id", "default_payable_account_id"
        note_side, note_direction, event_side = "purchase", "debit", "payable"
        event_column, return_date, return_number = "purchase_return_id", "return_date", "purchase_return_number"
        postable_status = "approved"

    original_lookup = (
        f'''SELECT * INTO STRICT original FROM {original_table} WHERE org_id=organization_id AND id=header.{original_key} FOR UPDATE; invoiced:=true;
    SELECT * INTO STRICT original_tax FROM tax.documents WHERE org_id=organization_id AND sales_invoice_id=header.{original_key} FOR SHARE;'''
        if sales
        else f'''invoiced:=header.return_source_kind='invoiced';
    IF invoiced THEN
      SELECT * INTO STRICT original FROM {original_table} WHERE org_id=organization_id AND id=header.{original_key} FOR UPDATE;
      SELECT * INTO STRICT original_tax FROM tax.documents WHERE org_id=organization_id AND supplier_invoice_id=header.{original_key} FOR SHARE;
    END IF;'''
    )
    original_date = "original.invoice_date" if sales else "original.supplier_invoice_date"
    evidence_assertion = (
        '''IF tax_required THEN
      PERFORM 1 FROM core.attachments evidence
       WHERE evidence.org_id=organization_id AND evidence.id=header.recipient_itc_reversal_evidence_attachment_id
         AND evidence.status IN ('verified','retained') AND evidence.verified_at IS NOT NULL
         AND evidence.verified_at<=header.recipient_itc_reversal_confirmed_at FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='statutory sales credit requires verified recipient ITC-reversal evidence'; END IF;
    END IF;'''
        if sales
        else '''IF tax_required THEN
      SELECT portal_line.* INTO STRICT supplier_portal_line
        FROM tax.portal_document_lines portal_line
        JOIN tax.portal_documents portal_document ON portal_document.org_id=portal_line.org_id
          AND portal_document.id=portal_line.portal_document_id AND portal_document.status='parsed'
          AND portal_document.portal_document_type IN ('gstr2a','gstr2b')
       WHERE portal_line.org_id=organization_id AND portal_line.id=header.supplier_credit_note_portal_line_id
         AND portal_line.document_type='credit_note' FOR SHARE OF portal_line,portal_document;
      IF supplier_portal_line.supplier_gstin IS DISTINCT FROM original_tax.counterparty_gstin
         OR supplier_portal_line.place_of_supply_state_code IS DISTINCT FROM original_tax.place_of_supply_state_code
         OR ROW(supplier_portal_line.taxable_amount,supplier_portal_line.cgst_amount,supplier_portal_line.sgst_amount,
                supplier_portal_line.igst_amount,supplier_portal_line.cess_amount,supplier_portal_line.total_amount)
            IS DISTINCT FROM ROW(header.gst_taxable_total,header.cgst_total,header.sgst_total,header.igst_total,
                header.cess_total,header.gst_taxable_total+header.cgst_total+header.sgst_total+header.igst_total+header.cess_total) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier GST credit-note portal evidence differs from purchase return'; END IF;
    END IF;'''
    )
    rule_assertion = f'''SELECT * INTO STRICT adjustment_rule FROM tax.gst_adjustment_rule_versions rule
     WHERE rule.id=header.gst_adjustment_rule_version_id AND rule.status='active'
       AND rule.side='{'sales' if sales else 'purchase'}' AND rule.direction='{'credit' if sales else 'debit'}'
       AND rule.document_effect='decrease' AND rule.reason_code=header.reason_code
       AND rule.effective_from<=header.{return_date}
       AND (rule.effective_to IS NULL OR rule.effective_to>=header.{return_date}) FOR SHARE;
    IF adjustment_rule.tax_effect IS DISTINCT FROM header.gst_tax_treatment THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return GST treatment differs from effective reviewed adjustment rule'; END IF;
    tax_required:=adjustment_rule.tax_effect='statutory';
    IF tax_required AND NOT invoiced THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='uninvoiced return cannot be a statutory GST adjustment'; END IF;
    IF NOT tax_required AND (header.gst_taxable_total<>0 OR header.cgst_total<>0 OR header.sgst_total<>0 OR header.igst_total<>0 OR header.cess_total<>0 OR header.recipient_assessed_tax_total<>0) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='commercial-only return cannot alter GST'; END IF;
    IF invoiced AND adjustment_rule.deadline_policy='days_after_original' THEN
      adjustment_deadline:={original_date}+adjustment_rule.deadline_days;
    ELSIF invoiced AND adjustment_rule.deadline_policy='november_30_following_fy' THEN
      adjustment_deadline:=pg_catalog.make_date((pg_catalog.date_part('year',{original_date})::integer+
        CASE WHEN pg_catalog.date_part('month',{original_date})>=4 THEN 1 ELSE 0 END),11,30);
      SELECT least(adjustment_deadline,min(filing.filed_at::date)) INTO adjustment_deadline
        FROM tax.returns filing JOIN tax.return_periods period ON period.org_id=filing.org_id AND period.id=filing.return_period_id
       WHERE filing.org_id=organization_id AND period.registration_id=original_tax.registration_id
         AND filing.return_type='gstr9' AND filing.status='filed'
         AND period.period_start<={original_date} AND period.period_end>={original_date};
    END IF;
    IF tax_required AND adjustment_deadline IS NOT NULL AND header.{return_date}>adjustment_deadline THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='statutory GST adjustment is after the effective-rule deadline'; END IF;
    {evidence_assertion}'''
    inventory_rule = (
        f'''SELECT EXISTS(SELECT 1 FROM {line_table} WHERE org_id=organization_id AND {parent}=resource_id AND disposition='return_to_stock') INTO inventory_required;
    IF inventory_required<>(inventory_document_id IS NOT NULL) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='sales return inventory receipt ownership mismatch'; END IF;'''
        if sales
        else "inventory_required:=true; IF inventory_document_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='purchase return inventory issue is required'; END IF;"
    )
    note_original_values = (
        "header.invoice_id,NULL,resource_id,NULL"
        if sales
        else "NULL,header.supplier_invoice_id,NULL,resource_id"
    )
    tax_insert = f'''
    IF tax_required THEN
      INSERT INTO tax.documents(org_id,id,registration_id,adjustment_note_id,document_class,document_number,document_date,direction,
        counterparty_party_id,counterparty_gstin,place_of_supply_state_code,supply_type,zero_rated_payment_mode,tax_charge_mechanism,
        tax_liability_party,document_effect,adjusts_tax_document_id,currency_code,net_value_amount,gst_taxable_value,cgst_amount,sgst_amount,
        igst_amount,cess_amount,self_assessed_tax_amount,rounding_adjustment,counterparty_payable_amount,tax_ruleset_version,tax_ruleset_effective_date,
        source_hash,posted_at,created_by_membership_id)
      VALUES(organization_id,tax_document_id,original_tax.registration_id,adjustment_note_id,'adjustment_note',{'header.' + return_number if sales else 'supplier_portal_line.invoice_number'},{'header.' + return_date if sales else 'supplier_portal_line.invoice_date'},
        original_tax.direction,party_id,original_tax.counterparty_gstin,original_tax.place_of_supply_state_code,original_tax.supply_type,
        header.zero_rated_payment_mode,header.tax_charge_mechanism,original_tax.tax_liability_party,'decrease',original_tax.id,original_tax.currency_code,
        header.net_value_total,header.gst_taxable_total,header.cgst_total,header.sgst_total,header.igst_total,header.cess_total,
        CASE WHEN original_tax.direction='inward' AND header.tax_charge_mechanism='reverse_charge' THEN header.recipient_assessed_tax_total ELSE 0 END,
        header.rounding_adjustment,header.grand_total,header.calculation_ruleset_version,original_tax.tax_ruleset_effective_date,
        extensions.digest(pg_catalog.convert_to((output_doc||pg_catalog.jsonb_build_object('return_id',resource_id))::text,'UTF8'),'sha256'),posted_time,actor_id);
    ELSIF tax_document_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='commercial-only return cannot create tax document'; END IF;'''

    journal_body = (
        '''party_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,'accounts_receivable','asset',original.currency_code,true);
    PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,party_account,header.branch_id,party_id,'Receivable credit',0,header.grand_total,actor_id); line_no:=line_no+1;
    FOR line IN SELECT return_line.net_value_amount,invoice_line.revenue_account_id FROM sales.return_lines return_line JOIN sales.invoice_lines invoice_line ON invoice_line.org_id=return_line.org_id AND invoice_line.id=return_line.invoice_line_id WHERE return_line.org_id=organization_id AND return_line.return_id=resource_id ORDER BY return_line.line_number LOOP
      PERFORM erp_commercial_commands.assert_line_account(organization_id,line.revenue_account_id,'income',original.currency_code);
      PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,line.revenue_account_id,header.branch_id,NULL,'Revenue reversal',line.net_value_amount,0,actor_id); line_no:=line_no+1;
    END LOOP;
    IF inventory_value>0 THEN
      role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,'inventory_asset','asset',original.currency_code,false);
      PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Returned inventory from posted ledger',inventory_value,0,actor_id); line_no:=line_no+1;
      role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,'cost_of_goods_sold','expense',original.currency_code,false);
      PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'COGS reversal from posted ledger',0,inventory_value,actor_id); line_no:=line_no+1;
    END IF;'''
        if sales
        else '''IF invoiced THEN
      party_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,'accounts_payable','liability',original.currency_code,true);
      PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,party_account,header.branch_id,party_id,'Payable debit',header.grand_total,0,actor_id); line_no:=line_no+1;
      FOR line IN SELECT return_line.net_value_amount,return_line.cgst_amount,return_line.sgst_amount,return_line.igst_amount,return_line.cess_amount,invoice_line.net_value_account_id,invoice_line.itc_eligibility,invoice_line.inventory_cost_treatment FROM procurement.purchase_return_lines return_line JOIN procurement.supplier_invoice_receipt_allocations allocation ON allocation.org_id=return_line.org_id AND allocation.id=return_line.supplier_invoice_receipt_allocation_id JOIN procurement.supplier_invoice_lines invoice_line ON invoice_line.org_id=allocation.org_id AND invoice_line.id=allocation.supplier_invoice_line_id WHERE return_line.org_id=organization_id AND return_line.purchase_return_id=resource_id ORDER BY return_line.line_number LOOP
        PERFORM erp_commercial_commands.assert_line_account(organization_id,line.net_value_account_id,CASE WHEN line.inventory_cost_treatment='capitalize' THEN 'asset' ELSE 'expense' END,original.currency_code);
        component_amount:=line.net_value_amount+CASE WHEN line.itc_eligibility='eligible' THEN 0 ELSE line.cgst_amount+line.sgst_amount+line.igst_amount+line.cess_amount END;
        IF line.itc_eligibility='eligible' THEN eligible_cgst:=eligible_cgst+line.cgst_amount; eligible_sgst:=eligible_sgst+line.sgst_amount; eligible_igst:=eligible_igst+line.igst_amount; eligible_cess:=eligible_cess+line.cess_amount; END IF;
        IF line.inventory_cost_treatment='capitalize' THEN
          role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,'inventory_asset','asset',original.currency_code,false);
          IF line.net_value_account_id<>role_account THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='capitalized supplier line is not mapped to inventory asset role'; END IF;
          expected_inventory_value:=expected_inventory_value+component_amount;
        ELSE
          PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,line.net_value_account_id,header.branch_id,NULL,'Supplier expense reversal',0,component_amount,actor_id); line_no:=line_no+1;
        END IF;
      END LOOP;
      IF expected_inventory_value>0 THEN
        role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,'inventory_asset','asset',original.currency_code,false);
        PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Returned inventory at posted MWA ledger value',0,inventory_value,actor_id); line_no:=line_no+1;
        variance_value:=expected_inventory_value-inventory_value;
        IF variance_value<>0 THEN role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,'purchase_return_inventory_variance','expense',original.currency_code,false);
          PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Purchase return inventory variance',CASE WHEN variance_value<0 THEN abs(variance_value) ELSE 0 END,CASE WHEN variance_value>0 THEN variance_value ELSE 0 END,actor_id); line_no:=line_no+1;
        END IF;
      ELSIF inventory_value<>0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='expensed supplier return cannot silently move valued inventory'; END IF;
    ELSE
      role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,'goods_received_not_invoiced','liability','INR',false);
      PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,party_id,'Uninvoiced receipt liability reversal',header.grand_total,0,actor_id); line_no:=line_no+1;
      role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,'inventory_asset','asset','INR',false);
      PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Inventory returned at posted MWA ledger value',0,inventory_value,actor_id); line_no:=line_no+1;
      variance_value:=header.grand_total-inventory_value;
      IF variance_value<>0 THEN role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,'purchase_return_inventory_variance','expense','INR',false);
        PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Uninvoiced purchase return inventory variance',CASE WHEN variance_value<0 THEN abs(variance_value) ELSE 0 END,CASE WHEN variance_value>0 THEN variance_value ELSE 0 END,actor_id); line_no:=line_no+1;
      END IF;
    END IF;'''
    )
    tax_journal = (
        "IF invoiced AND component_amount>0 AND header.tax_charge_mechanism='normal' THEN"
        if sales
        else "IF invoiced AND component_amount>0 THEN"
    )
    return_component_values = (
        "header.cgst_total,header.sgst_total,header.igst_total,header.cess_total"
        if sales
        else "eligible_cgst,eligible_sgst,eligible_igst,eligible_cess"
    )
    return_rcm = ""
    if not sales:
        return_rcm = '''IF invoiced AND header.tax_charge_mechanism='reverse_charge' THEN
      FOR role_key,component_amount IN SELECT * FROM (VALUES ('rcm_cgst_payable'::varchar,header.cgst_total),('rcm_sgst_payable'::varchar,header.sgst_total),('rcm_igst_payable'::varchar,header.igst_total),('rcm_cess_payable'::varchar,header.cess_total)) component(role_key,amount) LOOP
        IF component_amount>0 THEN role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,role_key,'liability',original.currency_code,false);
          PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Reverse-charge liability reversal',component_amount,0,actor_id); line_no:=line_no+1;
        END IF;
      END LOOP;
    END IF;'''
    return_rounding = f'''IF invoiced AND header.rounding_adjustment<>0 THEN
      role_key:=CASE WHEN header.rounding_adjustment>0 THEN '{'rounding_gain' if sales else 'rounding_loss'}' ELSE '{'rounding_loss' if sales else 'rounding_gain'}' END;
      role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,role_key,CASE WHEN role_key='rounding_gain' THEN 'income' ELSE 'expense' END,original.currency_code,false);
      PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Rounding reversal',
        CASE WHEN {'header.rounding_adjustment>0' if sales else 'header.rounding_adjustment<0'} THEN abs(header.rounding_adjustment) ELSE 0 END,
        CASE WHEN {'header.rounding_adjustment<0' if sales else 'header.rounding_adjustment>0'} THEN abs(header.rounding_adjustment) ELSE 0 END,actor_id); line_no:=line_no+1;
    END IF;'''
    return _function(
        f"{function_name}(organization_id uuid, resource_id uuid, artifact_id uuid, actor_id uuid, request_id uuid, command_request_id uuid, adjustment_note_id uuid, adjustment_note_number varchar, tax_document_id uuid, journal_id uuid, journal_number varchar, event_id uuid, allocation_id uuid, residual_open_item_id uuid, inventory_document_id uuid, key_hash bytea, request_hash bytea, expires_at timestamptz)",
        "uuid",
        f'''
DECLARE header {header_table}%ROWTYPE; original {original_table}%ROWTYPE; artifact calculation.artifacts%ROWTYPE;
        original_tax tax.documents%ROWTYPE; original_open finance.open_items%ROWTYPE; line record;
        adjustment_rule tax.gst_adjustment_rule_versions%ROWTYPE; supplier_portal_line tax.portal_document_lines%ROWTYPE;
        claim_id uuid; replay_id uuid; input_doc jsonb; output_doc jsonb; consumed bytea; party_id uuid; party_account uuid;
        posted_time timestamptz:=pg_catalog.transaction_timestamp(); invoiced boolean; inventory_required boolean; tax_required boolean;
        line_no integer:=1; component_amount numeric(20,2); role_account uuid; role_key varchar; debit_total numeric(20,2); credit_total numeric(20,2);
        eligible_cgst numeric(20,2):=0; eligible_sgst numeric(20,2):=0; eligible_igst numeric(20,2):=0; eligible_cess numeric(20,2):=0;
        inventory_value numeric(20,2):=0; inventory_entries bigint:=0; expected_inventory_value numeric(20,2):=0; variance_value numeric(20,2):=0;
        outstanding numeric(20,2); applied numeric(20,2); residual numeric(20,2); original_event_id uuid; adjustment_deadline date;
BEGIN
    PERFORM erp_trade_commands.assert_context(organization_id,actor_id);
    IF NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid IS DISTINCT FROM request_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='commercial request context mismatch'; END IF;
    SELECT * INTO STRICT header FROM {header_table} WHERE org_id=organization_id AND id=resource_id FOR UPDATE;
    IF header.status<>'{postable_status}' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return is not in the required posting state'; END IF;
    PERFORM erp_trade_commands.assert_permission('{permission}',header.branch_id);
    IF NOT erp_security.has_permission('finance.journal.post',NULL::uuid) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='finance journal permission denied'; END IF;
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM erp_trade_commands.claim(organization_id,actor_id,'{operation}',key_hash,request_hash,expires_at);
    IF replay_id IS NOT NULL THEN IF replay_id<>resource_id THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='commercial replay mismatch'; END IF; RETURN replay_id; END IF;
    {original_lookup}
    {rule_assertion}
    SELECT account.party_id INTO STRICT party_id FROM {party_table} account WHERE account.org_id=organization_id AND account.id=header.{party_key} AND account.status='active' FOR SHARE;
    SELECT * INTO STRICT artifact FROM calculation.artifacts WHERE org_id=organization_id AND id=artifact_id FOR UPDATE;
    input_doc:=pg_catalog.convert_from(artifact.input_bytes,'UTF8')::jsonb; output_doc:=pg_catalog.convert_from(artifact.output_bytes,'UTF8')::jsonb;
    IF artifact.{typed_artifact} IS DISTINCT FROM resource_id OR artifact.operation<>'{operation}' OR artifact.aggregate_version<>header.row_version THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='typed return artifact metadata mismatch'; END IF;
    PERFORM erp_commercial_commands.assert_{resource}_artifact(organization_id,resource_id,input_doc,output_doc);
    {inventory_rule}
    IF tax_required<>(tax_document_id IS NOT NULL) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return tax-document identity does not match statutory GST treatment'; END IF;
    IF inventory_document_id IS NOT NULL THEN
      PERFORM erp_commercial_commands.post_owned_inventory_document(
        organization_id,inventory_document_id,actor_id,'{'sales_return' if sales else 'purchase_return'}',resource_id,header.branch_id);
      SELECT coalesce(sum(CASE WHEN entry.entry_kind='issue' THEN -entry.value_delta ELSE entry.value_delta END),0),count(*)
        INTO inventory_value,inventory_entries FROM inventory.stock_ledger_entries entry
       WHERE entry.org_id=organization_id AND entry.inventory_document_id=inventory_document_id
         AND entry.entry_kind IN ({"'receipt'" if sales else "'issue'"});
      IF inventory_entries=0 OR inventory_value<=0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return inventory document has no authoritative posted ledger value'; END IF;
    END IF;
    consumed:=erp_calculation_authority.consume_artifact(organization_id,artifact_id,'{operation}','{resource}',resource_id,header.row_version,request_id,command_request_id,claim_id);
    IF pg_catalog.convert_from(consumed,'UTF8')::jsonb IS DISTINCT FROM output_doc THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='consumed return calculation changed'; END IF;
    IF invoiced THEN
      SELECT event.id,open_item.* INTO STRICT original_event_id,original_open FROM finance.accounting_events event JOIN finance.open_items open_item ON open_item.org_id=event.org_id AND open_item.accounting_event_id=event.id WHERE event.org_id=organization_id AND event.{('sales_invoice_id' if sales else 'supplier_invoice_id')}=header.{original_key} FOR UPDATE OF open_item;
      SELECT original_open.principal_amount-coalesce(sum(allocation.amount) FILTER (WHERE allocation.status='posted'
        AND NOT EXISTS (SELECT 1 FROM finance.allocations reversal WHERE reversal.org_id=allocation.org_id
          AND reversal.reversal_of_allocation_id=allocation.id)),0)
        INTO outstanding FROM finance.allocations allocation
       WHERE allocation.org_id=organization_id AND allocation.open_item_id=original_open.id;
      IF outstanding<0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='original open item is overallocated'; END IF;
    ELSE outstanding:=0; END IF;
    INSERT INTO finance.adjustment_notes(org_id,id,note_number,note_date,side,direction,party_id,sales_invoice_id,supplier_invoice_id,sales_return_id,purchase_return_id,adjusts_open_item_id,counterparty_portal_document_line_id,gst_adjustment_rule_version_id,gst_tax_treatment,recipient_itc_reversal_evidence_attachment_id,recipient_itc_reversal_confirmed_at,zero_rated_payment_mode,tax_charge_mechanism,currency_code,document_effect,rounding_policy,document_discount_kind,document_discount_basis,document_discount_value,calculation_ruleset_version,gross_price_amount,discount_amount,net_value_amount,gst_taxable_value,cgst_amount,sgst_amount,igst_amount,cess_amount,recipient_assessed_tax_amount,rounding_adjustment,counterparty_payable_amount,reason_code,reason,status,approved_at,approved_by_membership_id,created_by_membership_id,updated_by_membership_id)
    VALUES(organization_id,adjustment_note_id,adjustment_note_number,header.{return_date},'{note_side}','{note_direction}',party_id,{note_original_values},CASE WHEN invoiced THEN original_open.id ELSE NULL END,{('NULL' if sales else 'header.supplier_credit_note_portal_line_id')},header.gst_adjustment_rule_version_id,header.gst_tax_treatment,{('header.recipient_itc_reversal_evidence_attachment_id,header.recipient_itc_reversal_confirmed_at' if sales else 'NULL,NULL')},header.zero_rated_payment_mode,header.tax_charge_mechanism,coalesce(original.currency_code,'INR'),'decrease',header.rounding_policy,'none','price_value',0,header.calculation_ruleset_version,(output_doc#>>'{{totals,subtotal}}')::numeric,(output_doc#>>'{{totals,discount_total}}')::numeric,header.net_value_total,header.gst_taxable_total,header.cgst_total,header.sgst_total,header.igst_total,header.cess_total,header.recipient_assessed_tax_total,header.rounding_adjustment,header.grand_total,header.reason_code,'Posted return','approved',posted_time,actor_id,actor_id,actor_id);
    INSERT INTO finance.adjustment_note_lines(org_id,id,adjustment_note_id,line_number,line_kind,product_id,account_id,sales_invoice_line_id,supplier_invoice_line_id,charge_code,quoted_amount,description,uom_code,billed_quantity,free_quantity,uom_conversion_factor,base_billed_quantity,base_free_quantity,free_supply_tax_treatment,quoted_unit_rate,price_basis,gross_amount,line_discount_kind,line_discount_basis,line_discount_value,document_discount_eligible,line_discount_amount,line_taxable_discount_amount,document_discount_amount,document_taxable_discount_amount,final_residual,gst_tax_treatment,discount_amount,net_value_amount,gst_taxable_value,hsn_sac_code,tax_code_version_id,taxability_snapshot,inventory_cost_treatment,itc_eligibility,tax_charge_mechanism,cgst_rate,sgst_rate,igst_rate,cess_rate,cgst_amount,sgst_amount,igst_amount,cess_amount,recipient_assessed_tax_amount,line_total,tax_ruleset_version,created_by_membership_id)
    SELECT organization_id,gen_random_uuid(),adjustment_note_id,line.line_number,'product',line.product_id,NULL,{('line.invoice_line_id' if sales else 'NULL')},{('NULL' if sales else 'invoice_source.id')},NULL,NULL,'Return adjustment',{('source.uom_code' if sales else 'CASE WHEN invoiced THEN invoice_source.uom_code ELSE source.uom_code END')},line.billed_quantity,line.free_quantity,line.uom_conversion_factor,line.base_billed_quantity,line.base_free_quantity,line.free_supply_tax_treatment,line.quoted_unit_rate,line.price_basis,(calculated.item->>'gross_amount')::numeric,'none','price_value',0,false,(calculated.item->>'line_discount_amount')::numeric,(calculated.item->>'line_taxable_discount_amount')::numeric,(calculated.item->>'document_discount_amount')::numeric,(calculated.item->>'document_taxable_discount_amount')::numeric,line.final_residual,header.gst_tax_treatment,(calculated.item->>'line_discount_amount')::numeric+(calculated.item->>'document_discount_amount')::numeric,line.net_value_amount,line.gst_taxable_value,line.hsn_code_snapshot,line.tax_code_version_id,line.taxability_snapshot,{('NULL' if sales else 'invoice_source.inventory_cost_treatment')},{('NULL' if sales else 'invoice_source.itc_eligibility')},line.tax_charge_mechanism,line.cgst_rate,line.sgst_rate,line.igst_rate,line.cess_rate,line.cgst_amount,line.sgst_amount,line.igst_amount,line.cess_amount,CASE WHEN line.tax_charge_mechanism='reverse_charge' THEN line.cgst_amount+line.sgst_amount+line.igst_amount+line.cess_amount ELSE 0 END,line.line_total,header.calculation_ruleset_version,actor_id
      FROM {line_table} line
      JOIN pg_catalog.jsonb_array_elements(output_doc->'lines') calculated(item) ON calculated.item->>'line_id'={('line.invoice_line_id::text' if sales else "coalesce((SELECT allocation.supplier_invoice_line_id::text FROM procurement.supplier_invoice_receipt_allocations allocation WHERE allocation.org_id=line.org_id AND allocation.id=line.supplier_invoice_receipt_allocation_id),line.goods_receipt_line_id::text)")}
      JOIN {('sales.invoice_lines' if sales else 'procurement.goods_receipt_lines')} source ON source.org_id=line.org_id AND source.id={('line.invoice_line_id' if sales else 'line.goods_receipt_line_id')}
      {('' if sales else 'LEFT JOIN procurement.supplier_invoice_receipt_allocations invoice_allocation ON invoice_allocation.org_id=line.org_id AND invoice_allocation.id=line.supplier_invoice_receipt_allocation_id LEFT JOIN procurement.supplier_invoice_lines invoice_source ON invoice_source.org_id=invoice_allocation.org_id AND invoice_source.id=invoice_allocation.supplier_invoice_line_id')}
     WHERE line.org_id=organization_id AND line.{parent}=resource_id;
    INSERT INTO finance.journal_entries(org_id,id,journal_number,posting_date,description,transaction_currency,functional_currency,fx_rate,transaction_debit_total,transaction_credit_total,functional_debit_total,functional_credit_total,status,created_by_membership_id,updated_by_membership_id)
    VALUES(organization_id,journal_id,journal_number,header.{return_date},'{resource}',coalesce(original.currency_code,'INR'),'INR',1,header.grand_total,header.grand_total,header.grand_total,header.grand_total,'draft',actor_id,actor_id);
    {journal_body}
    FOR role_key,component_amount IN SELECT * FROM (VALUES ('{'output_cgst' if sales else 'input_cgst'}'::varchar,{return_component_values.split(',')[0]}),('{'output_sgst' if sales else 'input_sgst'}'::varchar,{return_component_values.split(',')[1]}),('{'output_igst' if sales else 'input_igst'}'::varchar,{return_component_values.split(',')[2]}),('{'output_cess' if sales else 'input_cess'}'::varchar,{return_component_values.split(',')[3]})) x(role_key,amount) LOOP
      {tax_journal}
        role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,role_key,'{'liability' if sales else 'asset'}',coalesce(original.currency_code,'INR'),false);
        PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Tax reversal',{'component_amount,0' if sales else '0,component_amount'},actor_id); line_no:=line_no+1;
      END IF;
    END LOOP;
    {return_rcm}
    {return_rounding}
    SELECT coalesce(sum(transaction_debit),0),coalesce(sum(transaction_credit),0) INTO debit_total,credit_total FROM finance.journal_lines WHERE org_id=organization_id AND journal_entry_id=journal_id;
    IF debit_total<>credit_total OR debit_total=0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return journal is not balanced'; END IF;
    UPDATE finance.journal_entries SET transaction_debit_total=debit_total,transaction_credit_total=credit_total,functional_debit_total=debit_total,functional_credit_total=credit_total,status='posted',posted_at=posted_time,posted_by_membership_id=actor_id,updated_at=posted_time,updated_by_membership_id=actor_id,row_version=row_version+1 WHERE org_id=organization_id AND id=journal_id;
    UPDATE {header_table} SET status='posted',posted_at=posted_time,posted_by_membership_id=actor_id,updated_at=posted_time,updated_by_membership_id=actor_id,row_version=row_version+1 WHERE org_id=organization_id AND id=resource_id AND status='{postable_status}';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='return posting state changed'; END IF;
    UPDATE finance.adjustment_notes SET status='posted',posted_at=posted_time,posted_by_membership_id=actor_id,updated_at=posted_time,updated_by_membership_id=actor_id,row_version=row_version+1 WHERE org_id=organization_id AND id=adjustment_note_id;
    {tax_insert}
    INSERT INTO finance.accounting_events(org_id,id,event_type,adjustment_note_id,journal_entry_id,occurred_at,source_posted_at,created_by_membership_id) VALUES(organization_id,event_id,'adjustment_note',adjustment_note_id,journal_id,posted_time,posted_time,actor_id);
    IF invoiced THEN
      applied:=least(header.grand_total,outstanding); residual:=header.grand_total-applied;
      IF applied>0 THEN INSERT INTO finance.allocations(org_id,id,adjustment_note_id,open_item_id,allocation_date,currency_code,amount,functional_amount,status,created_by_membership_id) VALUES(organization_id,allocation_id,adjustment_note_id,original_open.id,header.{return_date},original_open.currency_code,applied,applied,'posted',actor_id); END IF;
      IF applied=outstanding AND outstanding>0 THEN UPDATE finance.open_items SET status='settled',settled_at=posted_time WHERE org_id=organization_id AND id=original_open.id; END IF;
      IF residual>0 THEN INSERT INTO finance.open_items(org_id,id,accounting_event_id,party_id,item_side,document_number,document_date,due_date,currency_code,principal_amount,functional_principal_amount,status,created_by_membership_id) VALUES(organization_id,residual_open_item_id,event_id,party_id,'{'payable' if sales else 'receivable'}',adjustment_note_number,header.{return_date},header.{return_date},original_open.currency_code,residual,residual,'open',actor_id); END IF;
    END IF;
    PERFORM erp_trade_commands.finish_claim(organization_id,claim_id,'{header_table}',resource_id);
    RETURN resource_id;
END
''',
        runtime=True,
    )


def _return_header_definitions(*, sales: bool) -> list[str]:
    return [
        *_return_artifact_assertion(sales=sales),
        *_return_command(sales=sales),
        *_return_state_guard(sales=sales),
        *_return_companion_guard(sales=sales),
    ]


def _return_line_definitions(*, sales: bool) -> list[str]:
    definitions = _line_guard(
        "guard_posted_sales_return_lines" if sales else "guard_posted_purchase_return_lines",
        "sales.return_lines" if sales else "procurement.purchase_return_lines",
        "sales.returns" if sales else "procurement.purchase_returns",
        "return_id" if sales else "purchase_return_id",
    )
    return definitions


def _adjustment_artifact_assertion() -> list[str]:
    return _function(
        "assert_adjustment_note_artifact(organization_id uuid, resource_id uuid, input_doc jsonb, output_doc jsonb)",
        "void",
        r'''
DECLARE note finance.adjustment_notes%ROWTYPE; original_tax tax.documents%ROWTYPE;
        original_input jsonb; expected_lines bigint; bad_count bigint; calculation_version bigint;
BEGIN
    SELECT * INTO STRICT note FROM finance.adjustment_notes
     WHERE org_id=organization_id AND id=resource_id FOR UPDATE;
    IF note.status NOT IN ('approved','posted') OR note.sales_return_id IS NOT NULL OR note.purchase_return_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='generic calculation requires an approved non-return adjustment note'; END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      organization_id::text||coalesce(note.sales_invoice_id,note.supplier_invoice_id)::text,734821));
    calculation_version:=CASE WHEN note.status='posted' THEN note.row_version-1 ELSE note.row_version END;
    SELECT document.* INTO STRICT original_tax FROM tax.documents document
     WHERE document.org_id=organization_id
       AND ((note.side='sales' AND document.sales_invoice_id=note.sales_invoice_id)
         OR (note.side='purchase' AND document.supplier_invoice_id=note.supplier_invoice_id))
       AND document.document_effect='original' FOR SHARE;
    SELECT pg_catalog.convert_from(artifact.input_bytes,'UTF8')::jsonb INTO STRICT original_input
      FROM calculation.artifacts artifact
     WHERE artifact.org_id=organization_id AND artifact.status='consumed'
       AND ((note.side='sales' AND artifact.sales_invoice_id=note.sales_invoice_id AND artifact.operation='sales.invoice.post')
         OR (note.side='purchase' AND artifact.supplier_invoice_id=note.supplier_invoice_id AND artifact.operation='procurement.supplier_invoice.post'))
     FOR SHARE;
    IF note.party_id IS DISTINCT FROM original_tax.counterparty_party_id OR note.currency_code IS DISTINCT FROM original_tax.currency_code
       OR note.zero_rated_payment_mode IS DISTINCT FROM original_tax.zero_rated_payment_mode
       OR note.tax_charge_mechanism IS DISTINCT FROM original_tax.tax_charge_mechanism THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment header differs from immutable original tax context'; END IF;
    PERFORM erp_calculation_authority.assert_input_schema(input_doc);
    PERFORM erp_calculation_authority.assert_output_schema(output_doc);
    IF input_doc->>'calculation_kind'<>'document' OR input_doc->'original'<>'null'::jsonb OR input_doc->'reversal'<>'null'::jsonb
       OR input_doc#>>'{document,gst_tax_treatment}' IS DISTINCT FROM note.gst_tax_treatment
       OR output_doc->>'gst_tax_treatment' IS DISTINCT FROM note.gst_tax_treatment
       OR input_doc->>'operation'<>'finance.adjustment_note.post' OR input_doc->>'resource_type'<>'adjustment_note'
       OR input_doc->>'resource_id'<>resource_id::text OR (input_doc->>'aggregate_version')::bigint<>calculation_version
       OR output_doc->>'operation'<>'finance.adjustment_note.post' OR output_doc->>'resource_type'<>'adjustment_note'
       OR output_doc->>'resource_id'<>resource_id::text OR (output_doc->>'aggregate_version')::bigint<>calculation_version
       OR output_doc->>'ruleset_version' IS DISTINCT FROM note.calculation_ruleset_version
       OR input_doc#>>'{document,gst_type}' IS DISTINCT FROM original_input#>>'{document,gst_type}'
       OR input_doc#>>'{document,zero_rated_mode}' IS DISTINCT FROM note.zero_rated_payment_mode
       OR input_doc#>>'{document,tax_charge_mechanism}' IS DISTINCT FROM note.tax_charge_mechanism
       OR input_doc#>>'{document,rounding_policy}' IS DISTINCT FROM note.rounding_policy
       OR ROW(input_doc#>>'{document,document_discount,kind}',input_doc#>>'{document,document_discount,basis}',
              (input_doc#>>'{document,document_discount,value}')::numeric)
          IS DISTINCT FROM ROW(note.document_discount_kind,note.document_discount_basis,note.document_discount_value)
       OR ROW((output_doc#>>'{totals,subtotal}')::numeric,(output_doc#>>'{totals,discount_total}')::numeric,
              (output_doc#>>'{totals,net_value_total}')::numeric,(output_doc#>>'{totals,gst_taxable_total}')::numeric,
              (output_doc#>>'{totals,cgst_total}')::numeric,(output_doc#>>'{totals,sgst_total}')::numeric,
              (output_doc#>>'{totals,igst_total}')::numeric,(output_doc#>>'{totals,cess_total}')::numeric,
              (output_doc#>>'{totals,recipient_assessed_tax_total}')::numeric,
              (output_doc#>>'{totals,rounding_adjustment}')::numeric,(output_doc#>>'{totals,grand_total}')::numeric)
          IS DISTINCT FROM ROW(note.gross_price_amount,note.discount_amount,note.net_value_amount,note.gst_taxable_value,
              note.cgst_amount,note.sgst_amount,note.igst_amount,note.cess_amount,note.recipient_assessed_tax_amount,
              note.rounding_adjustment,note.counterparty_payable_amount) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment calculation envelope or header differs'; END IF;
    SELECT count(*) INTO expected_lines FROM finance.adjustment_note_lines line
     WHERE line.org_id=organization_id AND line.adjustment_note_id=resource_id;
    IF expected_lines=0 OR expected_lines<>(SELECT count(*) FROM pg_catalog.jsonb_array_elements(output_doc->'lines'))
       OR expected_lines<>(SELECT pg_catalog.jsonb_array_length(input_doc#>'{document,products}')+pg_catalog.jsonb_array_length(input_doc#>'{document,charges}')) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment calculation line population differs'; END IF;
    WITH inputs AS (
      SELECT value item,'product' kind FROM pg_catalog.jsonb_array_elements(input_doc#>'{document,products}')
      UNION ALL SELECT value,'charge' FROM pg_catalog.jsonb_array_elements(input_doc#>'{document,charges}')
    ), outputs AS (SELECT value item FROM pg_catalog.jsonb_array_elements(output_doc->'lines'))
    SELECT count(*) INTO bad_count FROM finance.adjustment_note_lines line
      LEFT JOIN inputs ON inputs.item->>'line_id'=line.id::text
      LEFT JOIN outputs ON outputs.item->>'line_id'=line.id::text
     WHERE line.org_id=organization_id AND line.adjustment_note_id=resource_id AND
       (line.line_kind NOT IN ('product','charge') OR inputs.item IS NULL OR outputs.item IS NULL OR inputs.kind<>line.line_kind
        OR line.gst_tax_treatment IS DISTINCT FROM note.gst_tax_treatment
        OR inputs.item->>'tax_charge_mechanism' IS DISTINCT FROM line.tax_charge_mechanism
        OR inputs.item->>'taxability_snapshot' IS DISTINCT FROM line.taxability_snapshot
        OR inputs.item->>'price_basis' IS DISTINCT FROM line.price_basis
        OR (inputs.item->>'gst_rate')::numeric IS DISTINCT FROM CASE WHEN original_tax.supply_type='intra_state' THEN line.cgst_rate+line.sgst_rate ELSE line.igst_rate END
        OR (inputs.item->>'cess_rate')::numeric IS DISTINCT FROM line.cess_rate
        OR (line.line_kind='product' AND (ROW((inputs.item->>'billed_quantity')::numeric,(inputs.item->>'free_quantity')::numeric,
              (inputs.item->>'uom_conversion_factor')::numeric,(inputs.item->>'base_billed_quantity')::numeric,
              (inputs.item->>'base_free_quantity')::numeric,inputs.item->>'free_supply_tax_treatment',
              (inputs.item->>'quoted_unit_rate')::numeric,inputs.item#>>'{line_discount,kind}',
              inputs.item#>>'{line_discount,basis}',(inputs.item#>>'{line_discount,value}')::numeric,
              (inputs.item->>'document_discount_eligible')::boolean)
            IS DISTINCT FROM ROW(line.billed_quantity,line.free_quantity,line.uom_conversion_factor,line.base_billed_quantity,
              line.base_free_quantity,line.free_supply_tax_treatment,line.quoted_unit_rate,
              line.line_discount_kind,line.line_discount_basis,line.line_discount_value,
              line.document_discount_eligible)))
        OR (line.line_kind='charge' AND ROW(inputs.item->>'charge_code',(inputs.item->>'quoted_amount')::numeric,
              (inputs.item->>'document_discount_eligible')::boolean) IS DISTINCT FROM
              ROW(line.charge_code,line.quoted_amount,line.document_discount_eligible))
        OR ROW((outputs.item->>'gross_amount')::numeric,(outputs.item->>'line_discount_amount')::numeric,
              (outputs.item->>'line_taxable_discount_amount')::numeric,(outputs.item->>'document_discount_amount')::numeric,
              (outputs.item->>'document_taxable_discount_amount')::numeric,(outputs.item->>'net_value_amount')::numeric,
              (outputs.item->>'gst_taxable_value')::numeric,(outputs.item->>'cgst_amount')::numeric,
              (outputs.item->>'sgst_amount')::numeric,(outputs.item->>'igst_amount')::numeric,(outputs.item->>'cess_amount')::numeric,
              (outputs.item->>'recipient_assessed_tax_amount')::numeric,(outputs.item->>'line_total')::numeric,
              (outputs.item->>'final_residual')::boolean)
          IS DISTINCT FROM ROW(line.gross_amount,line.line_discount_amount,line.line_taxable_discount_amount,
              line.document_discount_amount,line.document_taxable_discount_amount,line.net_value_amount,line.gst_taxable_value,
              line.cgst_amount,line.sgst_amount,line.igst_amount,line.cess_amount,line.recipient_assessed_tax_amount,
              line.line_total,line.final_residual));
    IF bad_count<>0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment calculation line input or output differs'; END IF;
    SELECT count(*) INTO bad_count FROM finance.adjustment_note_lines line
      LEFT JOIN sales.invoice_lines sales_line ON sales_line.org_id=line.org_id AND sales_line.id=line.sales_invoice_line_id
      LEFT JOIN procurement.supplier_invoice_lines supplier_line ON supplier_line.org_id=line.org_id AND supplier_line.id=line.supplier_invoice_line_id
     WHERE line.org_id=organization_id AND line.adjustment_note_id=resource_id AND
       (line.tax_ruleset_version IS DISTINCT FROM note.calculation_ruleset_version
        OR (note.side='sales' AND (sales_line.id IS NULL OR sales_line.invoice_id<>note.sales_invoice_id
          OR line.supplier_invoice_line_id IS NOT NULL OR line.product_id IS DISTINCT FROM sales_line.product_id
          OR coalesce(line.account_id,sales_line.revenue_account_id)<>sales_line.revenue_account_id
          OR line.line_kind IS DISTINCT FROM sales_line.line_kind OR line.uom_code IS DISTINCT FROM sales_line.uom_code
          OR line.uom_conversion_factor IS DISTINCT FROM sales_line.uom_conversion_factor
          OR line.free_supply_tax_treatment IS DISTINCT FROM sales_line.free_supply_tax_treatment
          OR line.price_basis IS DISTINCT FROM sales_line.price_basis OR line.tax_charge_mechanism IS DISTINCT FROM sales_line.tax_charge_mechanism
          OR line.taxability_snapshot IS DISTINCT FROM sales_line.taxability_snapshot
          OR ROW(line.cgst_rate,line.sgst_rate,line.igst_rate,line.cess_rate) IS DISTINCT FROM ROW(sales_line.cgst_rate,sales_line.sgst_rate,sales_line.igst_rate,sales_line.cess_rate)
          OR line.tax_code_version_id IS DISTINCT FROM sales_line.tax_code_version_id OR line.hsn_sac_code IS DISTINCT FROM sales_line.tax_classification_code_snapshot))
        OR (note.side='purchase' AND (supplier_line.id IS NULL OR supplier_line.supplier_invoice_id<>note.supplier_invoice_id
          OR line.sales_invoice_line_id IS NOT NULL OR line.product_id IS DISTINCT FROM supplier_line.product_id
          OR coalesce(line.account_id,supplier_line.net_value_account_id)<>supplier_line.net_value_account_id
          OR line.inventory_cost_treatment<>supplier_line.inventory_cost_treatment OR line.itc_eligibility<>supplier_line.itc_eligibility
          OR line.line_kind IS DISTINCT FROM supplier_line.line_kind OR line.uom_code IS DISTINCT FROM supplier_line.uom_code
          OR line.uom_conversion_factor IS DISTINCT FROM supplier_line.uom_conversion_factor
          OR line.free_supply_tax_treatment IS DISTINCT FROM supplier_line.free_supply_tax_treatment
          OR line.price_basis IS DISTINCT FROM supplier_line.price_basis OR line.tax_charge_mechanism IS DISTINCT FROM supplier_line.tax_charge_mechanism
          OR line.taxability_snapshot IS DISTINCT FROM supplier_line.taxability_snapshot
          OR ROW(line.cgst_rate,line.sgst_rate,line.igst_rate,line.cess_rate) IS DISTINCT FROM ROW(supplier_line.cgst_rate,supplier_line.sgst_rate,supplier_line.igst_rate,supplier_line.cess_rate)
          OR line.tax_code_version_id IS DISTINCT FROM supplier_line.tax_code_version_id OR line.hsn_sac_code IS DISTINCT FROM supplier_line.tax_classification_code_snapshot)));
    IF bad_count<>0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment original-line lineage or tax/account snapshot differs'; END IF;
    WITH current_sources AS (
      SELECT DISTINCT sales_invoice_line_id,supplier_invoice_line_id FROM finance.adjustment_note_lines
       WHERE org_id=organization_id AND adjustment_note_id=resource_id
    ), signed AS (
      SELECT line.sales_invoice_line_id,line.supplier_invoice_line_id,
             CASE WHEN header.document_effect='increase' THEN 1 ELSE -1 END sign,
             line.billed_quantity,line.free_quantity,line.base_billed_quantity,line.base_free_quantity,line.gross_amount,
             line.line_discount_amount,line.document_discount_amount,line.net_value_amount,line.gst_taxable_value,
             line.cgst_amount,line.sgst_amount,line.igst_amount,line.cess_amount,line.line_total,line.final_residual
        FROM finance.adjustment_note_lines line JOIN finance.adjustment_notes header
          ON header.org_id=line.org_id AND header.id=line.adjustment_note_id
        JOIN current_sources current
          ON current.sales_invoice_line_id IS NOT DISTINCT FROM line.sales_invoice_line_id
         AND current.supplier_invoice_line_id IS NOT DISTINCT FROM line.supplier_invoice_line_id
       WHERE line.org_id=organization_id AND (header.status='posted' OR header.id=resource_id)
    ), ceilings AS (
      SELECT sales_invoice_line_id,supplier_invoice_line_id,
             sum(sign*billed_quantity) billed,sum(sign*free_quantity) free,
             sum(sign*base_billed_quantity) base_billed,sum(sign*base_free_quantity) base_free,
             sum(sign*gross_amount) gross,sum(sign*line_discount_amount) line_discount,
             sum(sign*document_discount_amount) document_discount,sum(sign*net_value_amount) net,sum(sign*gst_taxable_value) taxable,
             sum(sign*cgst_amount) cgst,sum(sign*sgst_amount) sgst,sum(sign*igst_amount) igst,
             sum(sign*cess_amount) cess,sum(sign*line_total) total,bool_or(final_residual AND sign=-1) residual
        FROM signed GROUP BY sales_invoice_line_id,supplier_invoice_line_id
    )
    SELECT count(*) INTO bad_count FROM ceilings ceiling
      LEFT JOIN sales.invoice_lines sales_line
        ON sales_line.org_id=organization_id AND sales_line.id=ceiling.sales_invoice_line_id
      LEFT JOIN procurement.supplier_invoice_lines supplier_line
        ON supplier_line.org_id=organization_id AND supplier_line.id=ceiling.supplier_invoice_line_id
     WHERE ceiling.billed < -coalesce(sales_line.billed_quantity,supplier_line.billed_quantity)
        OR ceiling.free < -coalesce(sales_line.free_quantity,supplier_line.free_quantity)
        OR ceiling.base_billed < -coalesce(sales_line.base_billed_quantity,supplier_line.base_billed_quantity)
        OR ceiling.base_free < -coalesce(sales_line.base_free_quantity,supplier_line.base_free_quantity)
        OR ceiling.taxable < -coalesce(sales_line.gst_taxable_value,supplier_line.gst_taxable_value)
        OR ceiling.cgst < -coalesce(sales_line.cgst_amount,supplier_line.cgst_amount)
        OR ceiling.sgst < -coalesce(sales_line.sgst_amount,supplier_line.sgst_amount)
        OR ceiling.igst < -coalesce(sales_line.igst_amount,supplier_line.igst_amount)
        OR ceiling.cess < -coalesce(sales_line.cess_amount,supplier_line.cess_amount)
        OR ceiling.total < -coalesce(sales_line.line_total,supplier_line.line_total)
        OR (ceiling.residual AND ROW(ceiling.billed,ceiling.free,ceiling.base_billed,ceiling.base_free,ceiling.total) IS DISTINCT FROM
             ROW(-coalesce(sales_line.billed_quantity,supplier_line.billed_quantity),
                 -coalesce(sales_line.free_quantity,supplier_line.free_quantity),
                 -coalesce(sales_line.base_billed_quantity,supplier_line.base_billed_quantity),
                 -coalesce(sales_line.base_free_quantity,supplier_line.base_free_quantity),
                 -coalesce(sales_line.line_total,supplier_line.line_total)));
    IF bad_count<>0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='cumulative adjustment exceeds original plus increases or residual is inexact'; END IF;
    SELECT count(*) INTO bad_count FROM (
      SELECT sum((CASE WHEN prior.document_effect='increase' THEN 1 ELSE -1 END)*prior.net_value_amount) net,
             sum((CASE WHEN prior.document_effect='increase' THEN 1 ELSE -1 END)*prior.gst_taxable_value) taxable,
             sum((CASE WHEN prior.document_effect='increase' THEN 1 ELSE -1 END)*prior.cgst_amount) cgst,
             sum((CASE WHEN prior.document_effect='increase' THEN 1 ELSE -1 END)*prior.sgst_amount) sgst,
             sum((CASE WHEN prior.document_effect='increase' THEN 1 ELSE -1 END)*prior.igst_amount) igst,
             sum((CASE WHEN prior.document_effect='increase' THEN 1 ELSE -1 END)*prior.cess_amount) cess,
             sum((CASE WHEN prior.document_effect='increase' THEN 1 ELSE -1 END)*greatest(prior.rounding_adjustment,0)) positive_rounding,
             sum((CASE WHEN prior.document_effect='increase' THEN 1 ELSE -1 END)*greatest(-prior.rounding_adjustment,0)) negative_rounding,
             sum((CASE WHEN prior.document_effect='increase' THEN 1 ELSE -1 END)*prior.counterparty_payable_amount) payable
        FROM finance.adjustment_notes prior
       WHERE prior.org_id=organization_id AND (prior.status='posted' OR prior.id=resource_id)
         AND ((note.side='sales' AND prior.sales_invoice_id=note.sales_invoice_id)
           OR (note.side='purchase' AND prior.supplier_invoice_id=note.supplier_invoice_id))
    ) signed_header WHERE signed_header.taxable < -original_tax.gst_taxable_value OR signed_header.cgst < -original_tax.cgst_amount
       OR signed_header.sgst < -original_tax.sgst_amount OR signed_header.igst < -original_tax.igst_amount
       OR signed_header.cess < -original_tax.cess_amount
       OR signed_header.positive_rounding < -greatest(original_tax.rounding_adjustment,0)
       OR signed_header.negative_rounding < -greatest(-original_tax.rounding_adjustment,0)
       OR signed_header.payable < -original_tax.counterparty_payable_amount;
    IF bad_count<>0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='cumulative adjustment header or payable exceeds original plus increases'; END IF;
END
''',
    )


def _generic_adjustment_command() -> list[str]:
    return _function(
        "post_adjustment_note(organization_id uuid, resource_id uuid, artifact_id uuid, actor_id uuid, request_id uuid, command_request_id uuid, tax_document_id uuid, journal_id uuid, journal_number varchar, event_id uuid, allocation_id uuid, new_open_item_id uuid, key_hash bytea, request_hash bytea, expires_at timestamptz)",
        "uuid",
        r'''
DECLARE note finance.adjustment_notes%ROWTYPE; artifact calculation.artifacts%ROWTYPE; original_tax tax.documents%ROWTYPE;
        adjustment_rule tax.gst_adjustment_rule_versions%ROWTYPE; portal_line tax.portal_document_lines%ROWTYPE;
        original_open finance.open_items%ROWTYPE; line record; input_doc jsonb; output_doc jsonb; consumed bytea;
        claim_id uuid; replay_id uuid; branch_id uuid; party_account uuid; posting_account uuid; role_account uuid; role_key varchar;
        posted_time timestamptz:=pg_catalog.transaction_timestamp(); line_no integer:=2; component_amount numeric(20,2);
        debit_total numeric(20,2); credit_total numeric(20,2); outstanding numeric(20,2); applied numeric(20,2); residual numeric(20,2);
        noncreditable numeric(20,2); eligible_cgst numeric(20,2):=0; eligible_sgst numeric(20,2):=0;
        eligible_igst numeric(20,2):=0; eligible_cess numeric(20,2):=0; tax_required boolean;
        original_document_date date; adjustment_deadline date; tax_number varchar(64); tax_date date;
BEGIN
    PERFORM erp_trade_commands.assert_context(organization_id,actor_id);
    IF NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid IS DISTINCT FROM request_id THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='commercial request context mismatch'; END IF;
    SELECT * INTO STRICT note FROM finance.adjustment_notes WHERE org_id=organization_id AND id=resource_id FOR UPDATE;
    IF note.status<>'approved' OR note.sales_return_id IS NOT NULL OR note.purchase_return_id IS NOT NULL
       OR note.reversal_of_adjustment_note_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='generic posting requires an approved non-return adjustment note'; END IF;
    IF note.side='sales' THEN
      SELECT invoice.branch_id,invoice.invoice_date INTO STRICT branch_id,original_document_date FROM sales.invoices invoice
       WHERE invoice.org_id=organization_id AND invoice.id=note.sales_invoice_id AND invoice.status='posted' FOR SHARE;
    ELSE
      SELECT invoice.branch_id,invoice.supplier_invoice_date INTO STRICT branch_id,original_document_date FROM procurement.supplier_invoices invoice
       WHERE invoice.org_id=organization_id AND invoice.id=note.supplier_invoice_id AND invoice.status='posted' FOR SHARE;
    END IF;
    PERFORM erp_trade_commands.assert_permission('finance.adjustment_note.manage',branch_id);
    IF NOT erp_security.has_permission('finance.journal.post',NULL::uuid) THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='finance journal permission denied'; END IF;
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM erp_trade_commands.claim(
      organization_id,actor_id,'finance.adjustment_note.post',key_hash,request_hash,expires_at);
    IF replay_id IS NOT NULL THEN IF replay_id<>resource_id THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='adjustment replay mismatch'; END IF; RETURN replay_id; END IF;
    SELECT * INTO STRICT artifact FROM calculation.artifacts WHERE org_id=organization_id AND id=artifact_id FOR UPDATE;
    input_doc:=pg_catalog.convert_from(artifact.input_bytes,'UTF8')::jsonb; output_doc:=pg_catalog.convert_from(artifact.output_bytes,'UTF8')::jsonb;
    IF artifact.adjustment_note_id<>resource_id OR artifact.operation<>'finance.adjustment_note.post' OR artifact.aggregate_version<>note.row_version THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='typed adjustment artifact metadata differs'; END IF;
    PERFORM erp_commercial_commands.assert_adjustment_note_artifact(organization_id,resource_id,input_doc,output_doc);
    consumed:=erp_calculation_authority.consume_artifact(organization_id,artifact_id,'finance.adjustment_note.post','adjustment_note',resource_id,note.row_version,request_id,command_request_id,claim_id);
    IF pg_catalog.convert_from(consumed,'UTF8')::jsonb IS DISTINCT FROM output_doc THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='consumed adjustment calculation changed'; END IF;
    SELECT document.* INTO STRICT original_tax FROM tax.documents document WHERE document.org_id=organization_id
      AND ((note.side='sales' AND document.sales_invoice_id=note.sales_invoice_id) OR (note.side='purchase' AND document.supplier_invoice_id=note.supplier_invoice_id))
      AND document.document_effect='original' FOR SHARE;
    SELECT * INTO STRICT adjustment_rule FROM tax.gst_adjustment_rule_versions rule
     WHERE rule.id=note.gst_adjustment_rule_version_id AND rule.status='active'
       AND rule.side=note.side AND rule.direction=note.direction AND rule.document_effect=note.document_effect
       AND rule.reason_code=note.reason_code AND rule.effective_from<=note.note_date
       AND (rule.effective_to IS NULL OR rule.effective_to>=note.note_date) FOR SHARE;
    IF adjustment_rule.tax_effect IS DISTINCT FROM note.gst_tax_treatment THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment GST treatment differs from effective reviewed rule'; END IF;
    tax_required:=adjustment_rule.tax_effect='statutory';
    IF tax_required<>(tax_document_id IS NOT NULL) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment tax-document identity differs from statutory treatment'; END IF;
    IF NOT tax_required AND (note.gst_taxable_value<>0 OR note.cgst_amount<>0 OR note.sgst_amount<>0 OR note.igst_amount<>0 OR note.cess_amount<>0 OR note.recipient_assessed_tax_amount<>0) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='commercial-only adjustment cannot alter GST'; END IF;
    IF adjustment_rule.deadline_policy='days_after_original' THEN
      adjustment_deadline:=original_document_date+adjustment_rule.deadline_days;
    ELSIF adjustment_rule.deadline_policy='november_30_following_fy' THEN
      adjustment_deadline:=pg_catalog.make_date((pg_catalog.date_part('year',original_document_date)::integer+
        CASE WHEN pg_catalog.date_part('month',original_document_date)>=4 THEN 1 ELSE 0 END),11,30);
      SELECT least(adjustment_deadline,min(filing.filed_at::date)) INTO adjustment_deadline
        FROM tax.returns filing JOIN tax.return_periods period ON period.org_id=filing.org_id AND period.id=filing.return_period_id
       WHERE filing.org_id=organization_id AND period.registration_id=original_tax.registration_id
         AND filing.return_type='gstr9' AND filing.status='filed'
         AND period.period_start<=original_document_date AND period.period_end>=original_document_date;
    END IF;
    IF tax_required AND adjustment_deadline IS NOT NULL AND note.note_date>adjustment_deadline THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='statutory adjustment is after the effective-rule deadline'; END IF;
    IF tax_required AND note.side='sales' AND note.document_effect='decrease' THEN
      PERFORM 1 FROM core.attachments evidence
       WHERE evidence.org_id=organization_id AND evidence.id=note.recipient_itc_reversal_evidence_attachment_id
         AND evidence.status IN ('verified','retained') AND evidence.verified_at IS NOT NULL
         AND evidence.verified_at<=note.recipient_itc_reversal_confirmed_at FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='statutory sales credit requires verified recipient ITC-reversal evidence'; END IF;
    END IF;
    IF tax_required AND note.side='purchase' AND (note.document_effect='decrease' OR adjustment_rule.portal_evidence_required) THEN
      SELECT source.* INTO STRICT portal_line FROM tax.portal_document_lines source
        JOIN tax.portal_documents document ON document.org_id=source.org_id AND document.id=source.portal_document_id
          AND document.status='parsed' AND document.portal_document_type IN ('gstr2a','gstr2b')
       WHERE source.org_id=organization_id AND source.id=note.counterparty_portal_document_line_id
         AND source.document_type=CASE WHEN note.document_effect='decrease' THEN 'credit_note' ELSE 'debit_note' END
       FOR SHARE OF source,document;
      IF portal_line.supplier_gstin IS DISTINCT FROM original_tax.counterparty_gstin
         OR portal_line.place_of_supply_state_code IS DISTINCT FROM original_tax.place_of_supply_state_code
         OR ROW(portal_line.taxable_amount,portal_line.cgst_amount,portal_line.sgst_amount,portal_line.igst_amount,portal_line.cess_amount,portal_line.total_amount)
            IS DISTINCT FROM ROW(note.gst_taxable_value,note.cgst_amount,note.sgst_amount,note.igst_amount,note.cess_amount,
              note.gst_taxable_value+note.cgst_amount+note.sgst_amount+note.igst_amount+note.cess_amount) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier portal adjustment evidence differs from accounting note'; END IF;
    END IF;
    tax_number:=CASE WHEN portal_line.id IS NOT NULL THEN portal_line.invoice_number ELSE note.note_number END;
    tax_date:=CASE WHEN portal_line.id IS NOT NULL THEN portal_line.invoice_date ELSE note.note_date END;
    SELECT item.* INTO STRICT original_open FROM finance.open_items item WHERE item.org_id=organization_id AND item.id=note.adjusts_open_item_id
      AND item.party_id=note.party_id AND item.currency_code=note.currency_code FOR UPDATE;
    PERFORM 1 FROM finance.accounting_events source_event WHERE source_event.org_id=organization_id
      AND source_event.id=original_open.accounting_event_id
      AND ((note.side='sales' AND source_event.sales_invoice_id=note.sales_invoice_id)
        OR (note.side='purchase' AND source_event.supplier_invoice_id=note.supplier_invoice_id)) FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment open item does not belong to the original invoice event'; END IF;
    SELECT original_open.principal_amount-coalesce(sum(allocation.amount) FILTER (WHERE allocation.status='posted'
      AND NOT EXISTS (SELECT 1 FROM finance.allocations reversal WHERE reversal.org_id=allocation.org_id AND reversal.reversal_of_allocation_id=allocation.id)),0)
      INTO outstanding FROM finance.allocations allocation WHERE allocation.org_id=organization_id AND allocation.open_item_id=original_open.id;
    IF outstanding<0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='original open item is overallocated'; END IF;
    INSERT INTO finance.journal_entries(org_id,id,journal_number,posting_date,description,transaction_currency,functional_currency,fx_rate,
      transaction_debit_total,transaction_credit_total,functional_debit_total,functional_credit_total,status,created_by_membership_id,updated_by_membership_id)
    VALUES(organization_id,journal_id,journal_number,note.note_date,'Adjustment note',note.currency_code,'INR',1,0,0,0,0,'draft',actor_id,actor_id);
    party_account:=erp_commercial_commands.resolve_role_account(organization_id,branch_id,CASE WHEN note.side='sales' THEN 'accounts_receivable' ELSE 'accounts_payable' END,
      CASE WHEN note.side='sales' THEN 'asset' ELSE 'liability' END,note.currency_code,true);
    PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,1,party_account,branch_id,note.party_id,'Adjustment counterparty',
      CASE WHEN (note.side='sales')=(note.document_effect='increase') THEN note.counterparty_payable_amount ELSE 0 END,
      CASE WHEN (note.side='sales')<>(note.document_effect='increase') THEN note.counterparty_payable_amount ELSE 0 END,actor_id);
    FOR line IN SELECT adjustment_line.*,sales_line.revenue_account_id,supplier_line.net_value_account_id
      FROM finance.adjustment_note_lines adjustment_line
      LEFT JOIN sales.invoice_lines sales_line ON sales_line.org_id=adjustment_line.org_id AND sales_line.id=adjustment_line.sales_invoice_line_id
      LEFT JOIN procurement.supplier_invoice_lines supplier_line ON supplier_line.org_id=adjustment_line.org_id AND supplier_line.id=adjustment_line.supplier_invoice_line_id
     WHERE adjustment_line.org_id=organization_id AND adjustment_line.adjustment_note_id=resource_id ORDER BY adjustment_line.line_number LOOP
      posting_account:=coalesce(line.account_id,line.revenue_account_id,line.net_value_account_id);
      PERFORM erp_commercial_commands.assert_line_account(organization_id,posting_account,
        CASE WHEN note.side='sales' THEN 'income' WHEN line.inventory_cost_treatment='capitalize' THEN 'asset' ELSE 'expense' END,note.currency_code);
      noncreditable:=CASE WHEN note.side='purchase' AND line.itc_eligibility<>'eligible' THEN line.cgst_amount+line.sgst_amount+line.igst_amount+line.cess_amount ELSE 0 END;
      IF note.side='purchase' AND line.itc_eligibility='eligible' THEN eligible_cgst:=eligible_cgst+line.cgst_amount; eligible_sgst:=eligible_sgst+line.sgst_amount; eligible_igst:=eligible_igst+line.igst_amount; eligible_cess:=eligible_cess+line.cess_amount; END IF;
      PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,posting_account,branch_id,NULL,'Adjustment net value',
        CASE WHEN (note.side='purchase')=(note.document_effect='increase') THEN line.net_value_amount+noncreditable ELSE 0 END,
        CASE WHEN (note.side='purchase')<>(note.document_effect='increase') THEN line.net_value_amount+noncreditable ELSE 0 END,actor_id); line_no:=line_no+1;
    END LOOP;
    FOR role_key,component_amount IN SELECT * FROM (VALUES
      (CASE WHEN note.side='sales' THEN 'output_cgst' ELSE 'input_cgst' END,CASE WHEN note.side='sales' THEN note.cgst_amount ELSE eligible_cgst END),
      (CASE WHEN note.side='sales' THEN 'output_sgst' ELSE 'input_sgst' END,CASE WHEN note.side='sales' THEN note.sgst_amount ELSE eligible_sgst END),
      (CASE WHEN note.side='sales' THEN 'output_igst' ELSE 'input_igst' END,CASE WHEN note.side='sales' THEN note.igst_amount ELSE eligible_igst END),
      (CASE WHEN note.side='sales' THEN 'output_cess' ELSE 'input_cess' END,CASE WHEN note.side='sales' THEN note.cess_amount ELSE eligible_cess END)) x(role,amount) LOOP
      IF component_amount>0 AND (note.side='purchase' OR note.tax_charge_mechanism='normal') THEN
        role_account:=erp_commercial_commands.resolve_role_account(organization_id,branch_id,role_key,CASE WHEN note.side='sales' THEN 'liability' ELSE 'asset' END,note.currency_code,false);
        PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,branch_id,NULL,'Adjustment tax',
          CASE WHEN (note.side='purchase')=(note.document_effect='increase') THEN component_amount ELSE 0 END,
          CASE WHEN (note.side='purchase')<>(note.document_effect='increase') THEN component_amount ELSE 0 END,actor_id); line_no:=line_no+1;
      END IF;
    END LOOP;
    IF note.side='purchase' AND note.tax_charge_mechanism='reverse_charge' THEN
      FOR role_key,component_amount IN SELECT * FROM (VALUES ('rcm_cgst_payable',note.cgst_amount),('rcm_sgst_payable',note.sgst_amount),('rcm_igst_payable',note.igst_amount),('rcm_cess_payable',note.cess_amount)) x(role,amount) LOOP
        IF component_amount>0 THEN role_account:=erp_commercial_commands.resolve_role_account(organization_id,branch_id,role_key,'liability',note.currency_code,false);
          PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,branch_id,NULL,'Adjustment RCM liability',
            CASE WHEN note.document_effect='decrease' THEN component_amount ELSE 0 END,CASE WHEN note.document_effect='increase' THEN component_amount ELSE 0 END,actor_id); line_no:=line_no+1; END IF;
      END LOOP;
    END IF;
    IF note.rounding_adjustment<>0 THEN
      role_key:=CASE WHEN (note.side='sales')=(note.rounding_adjustment>0) THEN 'rounding_gain' ELSE 'rounding_loss' END;
      role_account:=erp_commercial_commands.resolve_role_account(organization_id,branch_id,role_key,CASE WHEN role_key='rounding_gain' THEN 'income' ELSE 'expense' END,note.currency_code,false);
      PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,branch_id,NULL,'Adjustment rounding',
        CASE WHEN (role_key='rounding_loss')=(note.document_effect='increase') THEN abs(note.rounding_adjustment) ELSE 0 END,
        CASE WHEN (role_key='rounding_gain')=(note.document_effect='increase') THEN abs(note.rounding_adjustment) ELSE 0 END,actor_id);
    END IF;
    SELECT coalesce(sum(transaction_debit),0),coalesce(sum(transaction_credit),0) INTO debit_total,credit_total FROM finance.journal_lines WHERE org_id=organization_id AND journal_entry_id=journal_id;
    IF debit_total<>credit_total OR debit_total=0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment journal is not balanced'; END IF;
    UPDATE finance.journal_entries SET transaction_debit_total=debit_total,transaction_credit_total=credit_total,functional_debit_total=debit_total,functional_credit_total=credit_total,
      status='posted',posted_at=posted_time,posted_by_membership_id=actor_id,updated_at=posted_time,updated_by_membership_id=actor_id,row_version=row_version+1 WHERE org_id=organization_id AND id=journal_id;
    UPDATE finance.adjustment_notes SET status='posted',posted_at=posted_time,posted_by_membership_id=actor_id,updated_at=posted_time,updated_by_membership_id=actor_id,row_version=row_version+1
     WHERE org_id=organization_id AND id=resource_id AND status='approved';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='adjustment posting state changed'; END IF;
    IF tax_required THEN
    INSERT INTO tax.documents(org_id,id,registration_id,adjustment_note_id,document_class,document_number,document_date,direction,counterparty_party_id,counterparty_gstin,
      place_of_supply_state_code,supply_type,zero_rated_payment_mode,tax_charge_mechanism,tax_liability_party,document_effect,adjusts_tax_document_id,currency_code,
      net_value_amount,gst_taxable_value,cgst_amount,sgst_amount,igst_amount,cess_amount,self_assessed_tax_amount,rounding_adjustment,counterparty_payable_amount,
      tax_ruleset_version,tax_ruleset_effective_date,source_hash,posted_at,created_by_membership_id)
    VALUES(organization_id,tax_document_id,original_tax.registration_id,resource_id,'adjustment_note',tax_number,tax_date,original_tax.direction,note.party_id,
      original_tax.counterparty_gstin,original_tax.place_of_supply_state_code,original_tax.supply_type,note.zero_rated_payment_mode,note.tax_charge_mechanism,
      original_tax.tax_liability_party,note.document_effect,original_tax.id,note.currency_code,note.net_value_amount,note.gst_taxable_value,note.cgst_amount,note.sgst_amount,
      note.igst_amount,note.cess_amount,CASE WHEN note.side='purchase' AND note.tax_charge_mechanism='reverse_charge' THEN note.recipient_assessed_tax_amount ELSE 0 END,
      note.rounding_adjustment,note.counterparty_payable_amount,note.calculation_ruleset_version,original_tax.tax_ruleset_effective_date,
      extensions.digest(pg_catalog.convert_to((output_doc||pg_catalog.jsonb_build_object('adjustment_note_id',resource_id))::text,'UTF8'),'sha256'),posted_time,actor_id);
    END IF;
    INSERT INTO finance.accounting_events(org_id,id,event_type,adjustment_note_id,journal_entry_id,occurred_at,source_posted_at,created_by_membership_id)
    VALUES(organization_id,event_id,'adjustment_note',resource_id,journal_id,posted_time,posted_time,actor_id);
    IF note.document_effect='decrease' THEN
      applied:=least(note.counterparty_payable_amount,outstanding); residual:=note.counterparty_payable_amount-applied;
      IF applied>0 THEN
        IF allocation_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='decrease allocation identity is required'; END IF;
        INSERT INTO finance.allocations(org_id,id,adjustment_note_id,open_item_id,allocation_date,currency_code,amount,functional_amount,status,created_by_membership_id)
        VALUES(organization_id,allocation_id,resource_id,original_open.id,note.note_date,note.currency_code,applied,applied,'posted',actor_id);
      END IF;
      IF residual>0 THEN INSERT INTO finance.open_items(org_id,id,accounting_event_id,party_id,item_side,document_number,document_date,due_date,currency_code,principal_amount,functional_principal_amount,status,created_by_membership_id)
        VALUES(organization_id,new_open_item_id,event_id,note.party_id,CASE WHEN note.side='sales' THEN 'payable' ELSE 'receivable' END,note.note_number,note.note_date,note.note_date,note.currency_code,residual,residual,'open',actor_id); END IF;
    ELSE
      IF allocation_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='increase adjustment cannot allocate the original open item'; END IF;
      INSERT INTO finance.open_items(org_id,id,accounting_event_id,party_id,item_side,document_number,document_date,due_date,currency_code,principal_amount,functional_principal_amount,status,created_by_membership_id)
      VALUES(organization_id,new_open_item_id,event_id,note.party_id,CASE WHEN note.side='sales' THEN 'receivable' ELSE 'payable' END,note.note_number,note.note_date,note.note_date,note.currency_code,note.counterparty_payable_amount,note.counterparty_payable_amount,'open',actor_id);
    END IF;
    PERFORM erp_trade_commands.finish_claim(organization_id,claim_id,'finance.adjustment_notes',resource_id);
    RETURN resource_id;
END
''',
        runtime=True,
    )


def _adjustment_companion_guards() -> list[str]:
    statements = _function(
        "guard_adjustment_note_companions()",
        "trigger",
        r'''
DECLARE artifact calculation.artifacts%ROWTYPE; event_id uuid; companion_count bigint;
        allocation_total numeric(20,2); residual_total numeric(20,2); input_doc jsonb; output_doc jsonb;
BEGIN
    IF TG_OP='DELETE' THEN
      IF OLD.status IN ('posted','reversed') THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted adjustment note is retained'; END IF;
      RETURN OLD;
    END IF;
    IF NEW.status='reversed' AND OLD.status IS DISTINCT FROM 'reversed' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment reversal requires a separate reviewed compensating-note command';
    END IF;
    IF TG_OP='UPDATE' AND OLD.status IN ('posted','reversed','cancelled') AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted or terminal adjustment evidence is immutable';
    END IF;
    IF NEW.status='posted' THEN
      IF NEW.sales_return_id IS NULL AND NEW.purchase_return_id IS NULL THEN
        IF NEW.reversal_of_adjustment_note_id IS NOT NULL THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='linked adjustment reversal requires the reviewed compensating-note command'; END IF;
        SELECT count(*),(pg_catalog.array_agg(id))[1] INTO companion_count,artifact.id FROM calculation.artifacts
         WHERE org_id=NEW.org_id AND adjustment_note_id=NEW.id AND operation='finance.adjustment_note.post' AND status='consumed';
        IF companion_count<>1 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='generic adjustment requires exactly one consumed typed calculation artifact'; END IF;
        SELECT * INTO STRICT artifact FROM calculation.artifacts stored WHERE stored.org_id=NEW.org_id AND stored.id=artifact.id;
        input_doc:=pg_catalog.convert_from(artifact.input_bytes,'UTF8')::jsonb; output_doc:=pg_catalog.convert_from(artifact.output_bytes,'UTF8')::jsonb;
        PERFORM erp_commercial_commands.assert_adjustment_note_artifact(NEW.org_id,NEW.id,input_doc,output_doc);
      END IF;
      SELECT count(*) INTO companion_count FROM tax.documents WHERE org_id=NEW.org_id AND adjustment_note_id=NEW.id AND document_class='adjustment_note';
      IF companion_count<>CASE WHEN NEW.gst_tax_treatment='statutory' THEN 1 ELSE 0 END THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted adjustment tax-document ownership differs'; END IF;
      SELECT count(*),(pg_catalog.array_agg(event.id))[1] INTO companion_count,event_id FROM finance.accounting_events event
       JOIN finance.journal_entries journal ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id AND journal.status='posted'
       WHERE event.org_id=NEW.org_id AND event.adjustment_note_id=NEW.id AND event.event_type='adjustment_note';
      IF companion_count<>1 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted adjustment requires exactly one accounting event and journal'; END IF;
      IF NEW.sales_return_id IS NULL AND NEW.purchase_return_id IS NULL THEN
        SELECT coalesce(sum(amount),0) INTO allocation_total FROM finance.allocations
         WHERE org_id=NEW.org_id AND adjustment_note_id=NEW.id AND status='posted';
        SELECT coalesce(sum(principal_amount),0) INTO residual_total FROM finance.open_items
         WHERE org_id=NEW.org_id AND accounting_event_id=event_id AND status<>'reversed';
        IF (NEW.document_effect='increase' AND (allocation_total<>0 OR residual_total<>NEW.counterparty_payable_amount))
           OR (NEW.document_effect='decrease' AND allocation_total+residual_total<>NEW.counterparty_payable_amount) THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment allocation and residual open-item effects differ'; END IF;
      END IF;
    END IF;
    RETURN NEW;
END
''',
    )
    statements.append(
        'CREATE CONSTRAINT TRIGGER "guard_adjustment_note_companions_ct" AFTER INSERT OR UPDATE OR DELETE ON "finance"."adjustment_notes" '
        'DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "erp_commercial_commands"."guard_adjustment_note_companions"()'
    )
    statements.extend(
        _function(
            "guard_adjustment_note_lines()",
            "trigger",
            r'''
DECLARE note_status text;
BEGIN
    SELECT status INTO note_status FROM finance.adjustment_notes
     WHERE org_id=coalesce(NEW.org_id,OLD.org_id) AND id=coalesce(NEW.adjustment_note_id,OLD.adjustment_note_id) FOR SHARE;
    IF note_status IN ('posted','reversed') THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted adjustment lines are immutable'; END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END
''',
        )
    )
    statements.append(
        'CREATE TRIGGER "guard_adjustment_note_lines_tr" BEFORE INSERT OR UPDATE OR DELETE ON "finance"."adjustment_note_lines" '
        'FOR EACH ROW EXECUTE FUNCTION "erp_commercial_commands"."guard_adjustment_note_lines"()'
    )
    return statements


def _tax_document_guard() -> list[str]:
    statements = _function(
        "guard_tax_document_source()",
        "trigger",
        r'''
DECLARE sales_header sales.invoices%ROWTYPE; supplier_header procurement.supplier_invoices%ROWTYPE;
        note finance.adjustment_notes%ROWTYPE; original tax.documents%ROWTYPE; portal_line tax.portal_document_lines%ROWTYPE;
        expected_party uuid; expected_effective date; expected_number varchar(64); expected_date date;
BEGIN
    IF TG_OP<>'INSERT' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted tax documents are immutable'; END IF;
    IF NEW.sales_invoice_id IS NOT NULL THEN
      SELECT * INTO sales_header FROM sales.invoices WHERE org_id=NEW.org_id AND id=NEW.sales_invoice_id FOR SHARE;
      SELECT party_id INTO expected_party FROM parties.customer_accounts WHERE org_id=NEW.org_id AND id=sales_header.customer_account_id FOR SHARE;
      SELECT min(version.effective_from) INTO expected_effective FROM sales.invoice_lines line
       JOIN tax.tax_code_versions version ON version.id=line.tax_code_version_id
       WHERE line.org_id=NEW.org_id AND line.invoice_id=sales_header.id;
      IF sales_header.status<>'posted' OR NEW.document_class<>'sales_invoice' OR NEW.document_effect<>'original'
         OR ROW(NEW.registration_id,NEW.document_number,NEW.document_date,NEW.direction,NEW.counterparty_party_id,NEW.counterparty_gstin,
                NEW.place_of_supply_state_code,NEW.supply_type,NEW.zero_rated_payment_mode,NEW.tax_charge_mechanism,NEW.tax_liability_party,NEW.currency_code,
                NEW.net_value_amount,NEW.gst_taxable_value,NEW.cgst_amount,NEW.sgst_amount,NEW.igst_amount,NEW.cess_amount,
                NEW.self_assessed_tax_amount,NEW.rounding_adjustment,NEW.counterparty_payable_amount,NEW.tax_ruleset_version,NEW.tax_ruleset_effective_date)
            IS DISTINCT FROM ROW(sales_header.seller_tax_registration_id,sales_header.invoice_number,sales_header.invoice_date,'outward',expected_party,
                sales_header.buyer_gstin_snapshot,sales_header.place_of_supply_state_code,sales_header.supply_type,sales_header.zero_rated_payment_mode,
                sales_header.tax_charge_mechanism,CASE WHEN sales_header.tax_charge_mechanism='normal' THEN 'supplier' ELSE 'recipient' END,sales_header.currency_code,sales_header.net_value_total,sales_header.gst_taxable_total,
                sales_header.cgst_total,sales_header.sgst_total,sales_header.igst_total,sales_header.cess_total,0::numeric,
                sales_header.rounding_adjustment,sales_header.grand_total,sales_header.calculation_ruleset_version,expected_effective) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='sales tax document differs from posted invoice'; END IF;
    ELSIF NEW.supplier_invoice_id IS NOT NULL THEN
      SELECT * INTO supplier_header FROM procurement.supplier_invoices WHERE org_id=NEW.org_id AND id=NEW.supplier_invoice_id FOR SHARE;
      SELECT party_id INTO expected_party FROM parties.supplier_accounts WHERE org_id=NEW.org_id AND id=supplier_header.supplier_account_id FOR SHARE;
      SELECT min(version.effective_from) INTO expected_effective FROM procurement.supplier_invoice_lines line
       JOIN tax.tax_code_versions version ON version.id=line.tax_code_version_id
       WHERE line.org_id=NEW.org_id AND line.supplier_invoice_id=supplier_header.id;
      IF supplier_header.status<>'posted' OR NEW.document_class<>'supplier_invoice' OR NEW.document_effect<>'original'
         OR ROW(NEW.registration_id,NEW.document_number,NEW.document_date,NEW.direction,NEW.counterparty_party_id,NEW.counterparty_gstin,
                NEW.place_of_supply_state_code,NEW.supply_type,NEW.zero_rated_payment_mode,NEW.tax_charge_mechanism,NEW.tax_liability_party,NEW.currency_code,
                NEW.net_value_amount,NEW.gst_taxable_value,NEW.cgst_amount,NEW.sgst_amount,NEW.igst_amount,NEW.cess_amount,
                NEW.self_assessed_tax_amount,NEW.rounding_adjustment,NEW.counterparty_payable_amount,NEW.tax_ruleset_version,NEW.tax_ruleset_effective_date)
            IS DISTINCT FROM ROW(supplier_header.buyer_tax_registration_id,supplier_header.supplier_invoice_number,supplier_header.supplier_invoice_date,'inward',expected_party,
                supplier_header.supplier_gstin_snapshot,supplier_header.place_of_supply_state_code,supplier_header.supply_type,supplier_header.zero_rated_payment_mode,
                supplier_header.tax_charge_mechanism,CASE WHEN supplier_header.tax_charge_mechanism='normal' THEN 'supplier' ELSE 'recipient' END,supplier_header.currency_code,supplier_header.net_value_total,supplier_header.gst_taxable_total,
                supplier_header.cgst_total,supplier_header.sgst_total,supplier_header.igst_total,supplier_header.cess_total,
                supplier_header.recipient_assessed_tax_total,supplier_header.rounding_adjustment,supplier_header.grand_total,
                supplier_header.calculation_ruleset_version,expected_effective) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier tax document differs from posted invoice'; END IF;
    ELSE
      SELECT * INTO note FROM finance.adjustment_notes WHERE org_id=NEW.org_id AND id=NEW.adjustment_note_id FOR SHARE;
      SELECT * INTO original FROM tax.documents WHERE org_id=NEW.org_id AND id=NEW.adjusts_tax_document_id FOR SHARE;
      IF note.counterparty_portal_document_line_id IS NOT NULL THEN
        SELECT * INTO STRICT portal_line FROM tax.portal_document_lines source
         WHERE source.org_id=NEW.org_id AND source.id=note.counterparty_portal_document_line_id FOR SHARE;
      END IF;
      expected_number:=CASE WHEN portal_line.id IS NOT NULL THEN portal_line.invoice_number ELSE note.note_number END;
      expected_date:=CASE WHEN portal_line.id IS NOT NULL THEN portal_line.invoice_date ELSE note.note_date END;
      IF note.status<>'posted' OR note.gst_tax_treatment<>'statutory' OR NEW.document_class<>'adjustment_note' OR NEW.document_effect<>note.document_effect
         OR original.id IS NULL OR original.document_effect<>'original'
         OR (note.side='sales' AND original.sales_invoice_id IS DISTINCT FROM note.sales_invoice_id)
         OR (note.side='purchase' AND original.supplier_invoice_id IS DISTINCT FROM note.supplier_invoice_id)
         OR ROW(NEW.registration_id,NEW.document_number,NEW.document_date,NEW.direction,NEW.counterparty_party_id,NEW.counterparty_gstin,
                NEW.place_of_supply_state_code,NEW.supply_type,NEW.zero_rated_payment_mode,NEW.tax_charge_mechanism,NEW.tax_liability_party,
                NEW.currency_code,NEW.net_value_amount,NEW.gst_taxable_value,NEW.cgst_amount,NEW.sgst_amount,NEW.igst_amount,NEW.cess_amount,
                NEW.self_assessed_tax_amount,NEW.rounding_adjustment,NEW.counterparty_payable_amount,NEW.tax_ruleset_version,NEW.tax_ruleset_effective_date)
            IS DISTINCT FROM ROW(original.registration_id,expected_number,expected_date,original.direction,note.party_id,original.counterparty_gstin,
                original.place_of_supply_state_code,original.supply_type,note.zero_rated_payment_mode,note.tax_charge_mechanism,original.tax_liability_party,
                note.currency_code,note.net_value_amount,note.gst_taxable_value,note.cgst_amount,note.sgst_amount,note.igst_amount,note.cess_amount,
                CASE WHEN note.side='purchase' AND note.tax_charge_mechanism='reverse_charge' THEN note.recipient_assessed_tax_amount ELSE 0 END,
                note.rounding_adjustment,note.counterparty_payable_amount,note.calculation_ruleset_version,original.tax_ruleset_effective_date) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment tax document differs from posted note or original context'; END IF;
    END IF;
    RETURN NEW;
END
''',
    )
    statements.append(
        'CREATE TRIGGER "guard_tax_document_source_tr" BEFORE INSERT OR UPDATE OR DELETE ON "tax"."documents" '
        'FOR EACH ROW EXECUTE FUNCTION "erp_commercial_commands"."guard_tax_document_source"()'
    )
    return statements


def _generic_header_definitions() -> list[str]:
    return [*_adjustment_artifact_assertion(), *_generic_adjustment_command(), *_adjustment_companion_guards()[:4]]


def _generic_line_definitions() -> list[str]:
    return [*_common_definitions(), *_adjustment_companion_guards()[4:]]


def _generic_tax_definitions() -> list[str]:
    return _tax_document_guard()


RESOLVED_DEFINITIONS = {
    "finance.adjustment_note_lines:adjustment_note_lines_cross_row_guard": _generic_line_definitions,
    "finance.adjustment_notes:adjustment_notes_cross_row_guard": _generic_header_definitions,
    "tax.documents:documents_cross_row_guard": _generic_tax_definitions,
    "sales.invoices:sales_invoices_invariant_1": lambda: _invoice_header_definitions(sales=True),
    "sales.invoice_lines:sales_invoice_lines_invariant_1": lambda: _invoice_line_definitions(sales=True),
    "procurement.supplier_invoices:procurement_supplier_invoices_invariant_1": lambda: _invoice_header_definitions(sales=False),
    "procurement.supplier_invoice_lines:procurement_supplier_invoice_lines_invariant_1": lambda: _invoice_line_definitions(sales=False),
    "sales.returns:sales_returns_invariant_1": lambda: _return_header_definitions(sales=True),
    "sales.return_lines:sales_return_lines_invariant_1": lambda: _return_line_definitions(sales=True),
    "procurement.purchase_returns:procurement_purchase_returns_invariant_1": lambda: _return_header_definitions(sales=False),
    "procurement.purchase_return_lines:procurement_purchase_return_lines_invariant_1": lambda: _return_line_definitions(sales=False),
}


def generated_artifacts() -> tuple[str, str]:
    source_text = SOURCE_MANIFEST.read_text(encoding="utf-8")
    source = json.loads(source_text)
    source_blocked = set(source["blocked_invariants"])
    if source_blocked != set(TARGETS):
        raise ContractError(
            "commercial targets must exactly equal commands_trade_v2 blockers: "
            f"missing={sorted(source_blocked-set(TARGETS))}, extra={sorted(set(TARGETS)-source_blocked)}"
        )

    catalog, catalog_hash = _catalog_and_hash()
    invariants = _invariants(catalog)
    missing_generic = sorted(set(GENERIC_TARGETS) - set(invariants))
    if missing_generic:
        raise ContractError(f"generic adjustment/tax blockers no longer match catalog: {missing_generic}")
    resolved = set(RESOLVED_DEFINITIONS)
    blocked = set(TARGETS) - resolved
    if (resolved - set(GENERIC_TARGETS)) | blocked != set(TARGETS) or resolved & blocked:
        raise ContractError("commercial disposition does not partition all targets")
    entries = []
    for key in sorted(resolved):
        invariant = invariants[key]
        entries.append(
            {
                "table": invariant["table"],
                "invariant": invariant["invariant"],
                "enforcement": invariant["enforcement"],
                "requirement_sha256": hashlib.sha256(invariant["rule"].encode()).hexdigest(),
                "reviewed": True,
                "statements": RESOLVED_DEFINITIONS[key](),
            }
        )
    mapping = {"mapping_version": "1.0.0", "enforcements": entries, "platform_enforcements": []}
    mapping_text = json.dumps(mapping, indent=2, sort_keys=True) + "\n"
    manifest = {
        "manifest_version": "1.0.0",
        "postgresql": "15+",
        "catalog_sha256": catalog_hash,
        "source_manifest": str(SOURCE_MANIFEST.relative_to(CANONICAL_ROOT)),
        "source_manifest_sha256": hashlib.sha256(source_text.encode()).hexdigest(),
        "mapping_file": MAPPING_PATH.name,
        "mapping_sha256": hashlib.sha256(mapping_text.encode()).hexdigest(),
        "implementation_status": "implemented",
        "resolved_count": len(resolved),
        "target_resolved_count_after_catalog_correction": 11,
        "resolved_invariants": sorted(resolved),
        "blocked_count": len(blocked),
        "blocked_invariants": {},
        "generic_adjustment_tax_boundary": {
            "implementation_status": "implemented",
            "resolved_count": len(GENERIC_TARGETS),
            "resolved_invariants": sorted(GENERIC_TARGETS),
            "blocked_count": 0,
            "blocked_invariants": {},
            "catalog_changes": GENERIC_CATALOG_CHANGES,
            "workflow_limitations": [
                "A return after a posted generic adjustment is rejected until the reversal artifact can encode the adjusted original monetary basis.",
                "Adjustment-note and adjustment-allocation reversal are rejected until a reviewed compensating-note command owns those effects.",
                "Multi-rate service-advance tax is deferred until a typed taxable-advance aggregate exists; finance.payments is not tax evidence.",
            ],
        },
        "required_catalog_changes": REQUIRED_CATALOG_CHANGES,
        "account_role_settings": ACCOUNT_ROLE_SETTINGS,
        "atomic_posting_order": ATOMIC_POSTING_ORDER,
        "inventory_value_authority": {
            "source": "inventory.stock_ledger_entries",
            "cogs_formula": "sum(-value_delta) for locked posted issue entries",
            "prohibition": "request, invoice price and mutable stock-balance values are not COGS evidence",
        },
        "prohibitions": [
            "No dynamic SQL.",
            "No invented account IDs or fallback suspense account.",
            "No inferred ITC eligibility.",
            "No UUID-equality convention in place of a foreign key.",
            "No enforcement entry while any allowed catalog path is unprovable.",
        ],
    }
    return mapping_text, json.dumps(manifest, indent=2, sort_keys=True) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    mapping, manifest = generated_artifacts()
    outputs = ((MAPPING_PATH, mapping), (MANIFEST_PATH, manifest))
    if args.check:
        drift = [str(path) for path, value in outputs if not path.exists() or path.read_text() != value]
        if drift:
            print("commercial-command-contract: drift: " + ", ".join(drift), file=sys.stderr)
            return 1
        print("commercial-command-contract: OK")
        return 0
    ROOT.mkdir(parents=True, exist_ok=True)
    for path, value in outputs:
        path.write_text(value, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
