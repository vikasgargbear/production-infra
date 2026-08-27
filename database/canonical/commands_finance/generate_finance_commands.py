#!/usr/bin/env python3
"""Generate reviewed command-boundary mappings for finance, tax, and compliance."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
DOMAINS_ROOT = ROOT.parent / "domains"
MAPPING_PATH = ROOT / "baseline-finance-command-enforcements.json"
MANIFEST_PATH = ROOT / "finance-command-manifest.json"
FUNCTION_SCHEMA = "erp_finance_commands"
DOMAINS = ("finance", "tax", "compliance")


class ContractError(RuntimeError):
    """The reviewed command mapping no longer matches the canonical catalog."""


def _load_invariants() -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {}
    for domain in DOMAINS:
        document = json.loads((DOMAINS_ROOT / f"{domain}.json").read_text(encoding="utf-8"))
        for table in document["tables"]:
            for invariant in table.get("cross_row_invariants", []):
                key = f"{table['name']}:{invariant['name']}"
                result[key] = {
                    "table": table["name"],
                    "invariant": invariant["name"],
                    "enforcement": invariant["enforcement"],
                    "rule": invariant["rule"],
                }
    return result


def _function(
    signature: str,
    returns: str,
    body: str,
    *,
    security_definer: bool = True,
    runtime_callable: bool = False,
) -> list[str]:
    security = "DEFINER" if security_definer else "INVOKER"
    statements = [
        f"""CREATE FUNCTION \"{FUNCTION_SCHEMA}\".{signature}
RETURNS {returns}
LANGUAGE plpgsql
SECURITY {security}
SET search_path = ''
AS $function$
#variable_conflict use_variable
{body.strip()}
$function$""",
        f'ALTER FUNCTION "{FUNCTION_SCHEMA}".{signature} OWNER TO "erp_migration_owner"',
        f'REVOKE ALL ON FUNCTION "{FUNCTION_SCHEMA}".{signature} FROM PUBLIC, "erp_app", "erp_runtime"',
    ]
    if runtime_callable:
        statements.append(f'GRANT EXECUTE ON FUNCTION "{FUNCTION_SCHEMA}".{signature} TO "erp_app"')
    return statements


def _trigger(name: str, events: str, table: str, function: str) -> str:
    schema, relation = table.split(".")
    return (
        f'CREATE CONSTRAINT TRIGGER "{name}" AFTER {events} ON "{schema}"."{relation}" '
        f'DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION '
        f'"{FUNCTION_SCHEMA}"."{function}"()'
    )


def _setup() -> list[str]:
    return [
        f'CREATE SCHEMA "{FUNCTION_SCHEMA}" AUTHORIZATION "erp_migration_owner"',
        f'REVOKE ALL ON SCHEMA "{FUNCTION_SCHEMA}" FROM PUBLIC, "erp_app", "erp_runtime"',
        f'GRANT USAGE ON SCHEMA "{FUNCTION_SCHEMA}" TO "erp_app"',
        f"""CREATE TABLE "{FUNCTION_SCHEMA}"."command_scopes" (
    backend_pid integer NOT NULL,
    transaction_id bigint NOT NULL,
    scope text NOT NULL,
    org_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    PRIMARY KEY (backend_pid, transaction_id, scope, org_id, entity_id)
)""",
        f'ALTER TABLE "{FUNCTION_SCHEMA}"."command_scopes" OWNER TO "erp_migration_owner"',
        f'REVOKE ALL ON TABLE "{FUNCTION_SCHEMA}"."command_scopes" FROM PUBLIC, "erp_app", "erp_runtime"',
        *_function(
            '"scope_active"(requested_scope text, organization_id uuid, target_id uuid)',
            "boolean",
            f"""
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM "{FUNCTION_SCHEMA}"."command_scopes" AS token
         WHERE token.backend_pid=pg_catalog.pg_backend_pid()
           AND token.transaction_id=pg_catalog.txid_current()
           AND token.scope=requested_scope
           AND token.org_id=organization_id
           AND token.entity_id=target_id
    );
END
""",
        ),
        *_function(
            '"synchronize_open_item_status"(organization_id uuid, open_item_id uuid)',
            "void",
            """
DECLARE item finance.open_items%ROWTYPE; active_total numeric(20,2);
BEGIN
    SELECT * INTO STRICT item FROM finance.open_items
     WHERE org_id=organization_id AND id=open_item_id FOR UPDATE;
    IF item.status='reversed' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='reversed open item cannot be settled or reopened';
    END IF;
    SELECT coalesce(sum(allocation.amount),0) INTO active_total
      FROM finance.allocations allocation
     WHERE allocation.org_id=organization_id
       AND (allocation.open_item_id=open_item_id OR allocation.source_open_item_id=open_item_id)
       AND allocation.status='posted'
       AND NOT EXISTS (SELECT 1 FROM finance.allocations reversal
         WHERE reversal.org_id=allocation.org_id
           AND reversal.reversal_of_allocation_id=allocation.id);
    IF active_total>item.principal_amount THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='open item is overallocated';
    END IF;
    UPDATE finance.open_items
       SET status=CASE WHEN active_total=item.principal_amount THEN 'settled' ELSE 'open' END,
           settled_at=CASE WHEN active_total=item.principal_amount
             THEN coalesce(item.settled_at,pg_catalog.transaction_timestamp()) ELSE NULL END
     WHERE org_id=organization_id AND id=open_item_id;
END
""",
        ),
        *_function(
            '"mark_journal_reversed"(organization_id uuid, original_journal_id uuid, reversal_journal_id uuid)',
            "void",
            """
DECLARE original finance.journal_entries%ROWTYPE; reversal finance.journal_entries%ROWTYPE;
BEGIN
    SELECT * INTO STRICT original FROM finance.journal_entries
     WHERE org_id=organization_id AND id=original_journal_id FOR UPDATE;
    SELECT * INTO STRICT reversal FROM finance.journal_entries
     WHERE org_id=organization_id AND id=reversal_journal_id FOR SHARE;
    IF original.status='reversed' THEN
      IF reversal.status='posted' AND reversal.reversal_of_journal_entry_id=original.id THEN RETURN; END IF;
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='journal reversal replay differs from posted evidence';
    END IF;
    IF original.status<>'posted' OR reversal.status<>'posted'
       OR reversal.reversal_of_journal_entry_id IS DISTINCT FROM original.id
       OR ROW(reversal.transaction_currency,reversal.functional_currency,reversal.fx_rate,
              reversal.transaction_debit_total,reversal.transaction_credit_total,
              reversal.functional_debit_total,reversal.functional_credit_total)
          IS DISTINCT FROM ROW(original.transaction_currency,original.functional_currency,original.fx_rate,
              original.transaction_credit_total,original.transaction_debit_total,
              original.functional_credit_total,original.functional_debit_total)
       OR EXISTS (SELECT 1 FROM finance.journal_lines old_line
          FULL JOIN finance.journal_lines new_line
            ON new_line.org_id=organization_id AND new_line.journal_entry_id=reversal.id
           AND new_line.line_number=old_line.line_number
         WHERE old_line.org_id=organization_id AND old_line.journal_entry_id=original.id
           AND (new_line.id IS NULL OR ROW(new_line.account_id,new_line.branch_id,new_line.party_id,
                  new_line.transaction_debit,new_line.transaction_credit,new_line.functional_debit,new_line.functional_credit)
             IS DISTINCT FROM ROW(old_line.account_id,old_line.branch_id,old_line.party_id,
                  old_line.transaction_credit,old_line.transaction_debit,old_line.functional_credit,old_line.functional_debit)))
       OR (SELECT count(*) FROM finance.journal_lines
            WHERE org_id=organization_id AND journal_entry_id=reversal.id)
          <> (SELECT count(*) FROM finance.journal_lines
            WHERE org_id=organization_id AND journal_entry_id=original.id) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='journal reversal command requires an exact posted sign inversion';
    END IF;
    UPDATE finance.journal_entries SET status='reversed',updated_at=pg_catalog.transaction_timestamp(),
      row_version=row_version+1 WHERE org_id=organization_id AND id=original.id AND status='posted';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='original journal changed before reversal transition'; END IF;
END
""",
        ),
    ]


def _accounting_event_definition() -> list[str]:
    return [
        *_setup(),
        *_function(
            '"guard_accounting_event"()',
            "trigger",
            """
DECLARE source_status text; source_time timestamptz; journal_status text;
BEGIN
    IF TG_OP<>'INSERT' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='accounting events are immutable';
    END IF;
    SELECT status INTO journal_status FROM finance.journal_entries
     WHERE org_id=NEW.org_id AND id=NEW.journal_entry_id FOR SHARE;
    IF journal_status IS DISTINCT FROM 'posted' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='accounting event requires a posted same-tenant journal';
    END IF;
    CASE NEW.event_type
      WHEN 'sales_invoice' THEN SELECT status,posted_at INTO source_status,source_time FROM sales.invoices WHERE org_id=NEW.org_id AND id=NEW.sales_invoice_id FOR SHARE;
      WHEN 'supplier_invoice' THEN SELECT status,posted_at INTO source_status,source_time FROM procurement.supplier_invoices WHERE org_id=NEW.org_id AND id=NEW.supplier_invoice_id FOR SHARE;
      WHEN 'adjustment_note' THEN SELECT status,posted_at INTO source_status,source_time FROM finance.adjustment_notes WHERE org_id=NEW.org_id AND id=NEW.adjustment_note_id FOR SHARE;
      WHEN 'payment' THEN SELECT status,posted_at INTO source_status,source_time FROM finance.payments WHERE org_id=NEW.org_id AND id=NEW.payment_id FOR SHARE;
      WHEN 'expense_claim' THEN SELECT status,posted_at INTO source_status,source_time FROM finance.expense_claims WHERE org_id=NEW.org_id AND id=NEW.expense_claim_id FOR SHARE;
      WHEN 'inventory_valuation' THEN SELECT status,posted_at INTO source_status,source_time FROM inventory.inventory_documents WHERE org_id=NEW.org_id AND id=NEW.inventory_document_id FOR SHARE;
      WHEN 'withholding' THEN SELECT status,created_at INTO source_status,source_time FROM tax.withholdings WHERE org_id=NEW.org_id AND id=NEW.withholding_id FOR SHARE;
      ELSE RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='unsupported accounting event source type';
    END CASE;
    IF source_status IS NULL OR
       (NEW.event_type='withholding' AND source_status NOT IN ('deducted','reversed')) OR
       (NEW.event_type<>'withholding' AND source_status<>'posted') OR
       source_time IS DISTINCT FROM NEW.source_posted_at THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='accounting event source is not the exact posted immutable source';
    END IF;
    RETURN NEW;
END
""",
        ),
        _trigger(
            "accounting_events_command_guard_ct",
            "INSERT OR UPDATE OR DELETE",
            "finance.accounting_events",
            "guard_accounting_event",
        ),
        *_function(
            '"guard_accounting_source"()',
            "trigger",
            """
DECLARE referenced boolean:=false; relation_name text:=TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME;
        old_payload jsonb; new_payload jsonb;
BEGIN
    CASE relation_name
      WHEN 'sales.invoices' THEN SELECT EXISTS (SELECT 1 FROM finance.accounting_events WHERE org_id=OLD.org_id AND sales_invoice_id=OLD.id) INTO referenced;
      WHEN 'procurement.supplier_invoices' THEN SELECT EXISTS (SELECT 1 FROM finance.accounting_events WHERE org_id=OLD.org_id AND supplier_invoice_id=OLD.id) INTO referenced;
      WHEN 'finance.adjustment_notes' THEN SELECT EXISTS (SELECT 1 FROM finance.accounting_events WHERE org_id=OLD.org_id AND adjustment_note_id=OLD.id) INTO referenced;
      WHEN 'finance.payments' THEN SELECT EXISTS (SELECT 1 FROM finance.accounting_events WHERE org_id=OLD.org_id AND payment_id=OLD.id) INTO referenced;
      WHEN 'finance.expense_claims' THEN SELECT EXISTS (SELECT 1 FROM finance.accounting_events WHERE org_id=OLD.org_id AND expense_claim_id=OLD.id) INTO referenced;
      WHEN 'inventory.inventory_documents' THEN SELECT EXISTS (SELECT 1 FROM finance.accounting_events WHERE org_id=OLD.org_id AND inventory_document_id=OLD.id) INTO referenced;
      WHEN 'tax.withholdings' THEN SELECT EXISTS (SELECT 1 FROM finance.accounting_events WHERE org_id=OLD.org_id AND withholding_id=OLD.id) INTO referenced;
      ELSE RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='unsupported accounting source trigger binding';
    END CASE;
    IF NOT referenced THEN
      IF TG_OP='DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END IF;
    IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='accounting event source is retained'; END IF;
    old_payload:=pg_catalog.to_jsonb(OLD);
    new_payload:=pg_catalog.to_jsonb(NEW);
    IF relation_name='tax.withholdings' THEN
      IF new_payload IS DISTINCT FROM old_payload THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='accounted withholding financial and law snapshot is immutable';
      END IF;
    ELSE
      old_payload:=old_payload-ARRAY['status','updated_at','updated_by_membership_id','row_version'];
      new_payload:=new_payload-ARRAY['status','updated_at','updated_by_membership_id','row_version'];
      IF new_payload IS DISTINCT FROM old_payload
         OR NOT (NEW.status=OLD.status OR (OLD.status='posted' AND NEW.status='reversed')) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='accounting event source financial snapshot is immutable';
      END IF;
    END IF;
    RETURN NEW;
END
""",
        ),
        _trigger("sales_invoices_accounted_source_ct", "UPDATE OR DELETE", "sales.invoices", "guard_accounting_source"),
        _trigger("supplier_invoices_accounted_source_ct", "UPDATE OR DELETE", "procurement.supplier_invoices", "guard_accounting_source"),
        _trigger("adjustment_notes_accounted_source_ct", "UPDATE OR DELETE", "finance.adjustment_notes", "guard_accounting_source"),
        _trigger("payments_accounted_source_ct", "UPDATE OR DELETE", "finance.payments", "guard_accounting_source"),
        _trigger("expense_claims_accounted_source_ct", "UPDATE OR DELETE", "finance.expense_claims", "guard_accounting_source"),
        _trigger("inventory_documents_accounted_source_ct", "UPDATE OR DELETE", "inventory.inventory_documents", "guard_accounting_source"),
        _trigger("withholdings_accounted_source_ct", "UPDATE OR DELETE", "tax.withholdings", "guard_accounting_source"),
    ]


def _payment_definition() -> list[str]:
    return [
        *_function(
            '"guard_payment_command"()',
            "trigger",
            f"""
BEGIN
    IF TG_OP='DELETE' AND OLD.status<>'draft' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='non-draft payment evidence is retained';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    IF TG_OP='UPDATE' AND OLD.status IN ('posted','reversed') AND ROW(
       NEW.payment_number,NEW.payment_date,NEW.direction,NEW.party_id,NEW.branch_id,
       NEW.bank_account_id,NEW.settlement_account_id,
       NEW.payment_method,NEW.currency_code,NEW.amount,NEW.functional_amount,NEW.fx_rate,
       NEW.external_reference,NEW.reversal_of_payment_id,NEW.reversal_reason,
       NEW.approved_at,NEW.approved_by_membership_id,NEW.posted_at,NEW.posted_by_membership_id
    ) IS DISTINCT FROM ROW(
       OLD.payment_number,OLD.payment_date,OLD.direction,OLD.party_id,OLD.branch_id,
       OLD.bank_account_id,OLD.settlement_account_id,
       OLD.payment_method,OLD.currency_code,OLD.amount,OLD.functional_amount,OLD.fx_rate,
       OLD.external_reference,OLD.reversal_of_payment_id,OLD.reversal_reason,
       OLD.approved_at,OLD.approved_by_membership_id,OLD.posted_at,OLD.posted_by_membership_id
    ) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted payment facts are immutable'; END IF;
    IF TG_OP='UPDATE' AND NEW.status IN ('posted','reversed') AND NEW.status IS DISTINCT FROM OLD.status
       AND NOT "{FUNCTION_SCHEMA}"."scope_active"('payment',NEW.org_id,NEW.id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='payment posting and reversal require the reviewed command';
    END IF;
    RETURN NEW;
END
""",
        ),
        _trigger("payments_command_guard_ct", "UPDATE OR DELETE", "finance.payments", "guard_payment_command"),
        *_function(
            '"post_payment"(organization_id uuid, payment_id uuid, journal_id uuid, event_id uuid)',
            "uuid",
            f"""
DECLARE payment finance.payments%ROWTYPE; journal finance.journal_entries%ROWTYPE;
        settlement finance.accounts%ROWTYPE; bank finance.bank_accounts%ROWTYPE;
        actor uuid; posted_time timestamptz; existing_event uuid; settlement_line_count integer;
BEGIN
    IF organization_id IS DISTINCT FROM erp_security.current_org_id() THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='payment posting permission denied';
    END IF;
    actor:=erp_security.current_membership_id();
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(organization_id::text||payment_id::text,672001));
    SELECT * INTO payment FROM finance.payments WHERE org_id=organization_id AND id=payment_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='payment not found'; END IF;
    SELECT id INTO existing_event FROM finance.accounting_events WHERE org_id=organization_id AND payment_id=payment_id;
    IF payment.status='posted' AND existing_event=event_id THEN RETURN payment_id; END IF;
    IF payment.status<>'approved' OR payment.reversal_of_payment_id IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='only an approved original payment may be posted';
    END IF;
    IF NOT erp_security.can_access_branch(payment.branch_id)
       OR NOT erp_security.has_permission('finance.payment.manage',payment.branch_id)
       OR NOT erp_security.has_permission('finance.journal.post',payment.branch_id) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='payment branch permission denied';
    END IF;
    SELECT * INTO settlement FROM finance.accounts
     WHERE org_id=organization_id AND id=payment.settlement_account_id FOR SHARE;
    IF settlement.id IS NULL OR settlement.status<>'active' OR settlement.account_type<>'asset'
       OR settlement.currency_code<>payment.currency_code THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='payment settlement account must be an active matching-currency asset';
    END IF;
    IF payment.payment_method='cash' THEN
      IF payment.bank_account_id IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='cash payment cannot reference a bank account';
      END IF;
    ELSE
      SELECT * INTO bank FROM finance.bank_accounts
       WHERE org_id=organization_id AND id=payment.bank_account_id FOR SHARE;
      IF bank.id IS NULL OR bank.status<>'active' OR bank.account_id<>settlement.id
         OR bank.currency_code<>payment.currency_code THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='non-cash payment bank identity must own the settlement account';
      END IF;
    END IF;
    IF payment.payment_purpose='supplier_advance'
       AND NOT "{FUNCTION_SCHEMA}"."scope_active"('supplier_advance_payment',organization_id,payment_id) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='supplier advance must use the typed gross-advance posting command';
    END IF;
    SELECT * INTO journal FROM finance.journal_entries WHERE org_id=organization_id AND id=journal_id FOR UPDATE;
    IF NOT FOUND OR journal.status<>'draft' OR journal.reversal_of_journal_entry_id IS NOT NULL
       OR journal.transaction_currency<>payment.currency_code
       OR journal.transaction_debit_total<>payment.amount
       OR journal.functional_debit_total<>payment.functional_amount THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='payment journal does not exactly match payment amounts';
    END IF;
    SELECT count(*) INTO settlement_line_count FROM finance.journal_lines line
     WHERE line.org_id=organization_id AND line.journal_entry_id=journal_id
       AND line.branch_id=payment.branch_id AND line.account_id=payment.settlement_account_id
       AND ((payment.direction='receipt' AND line.transaction_debit=payment.amount
             AND line.transaction_credit=0 AND line.functional_debit=payment.functional_amount
             AND line.functional_credit=0)
         OR (payment.direction='disbursement' AND line.transaction_credit=payment.amount
             AND line.transaction_debit=0 AND line.functional_credit=payment.functional_amount
             AND line.functional_debit=0));
    IF settlement_line_count<>1 OR EXISTS(
      SELECT 1 FROM finance.journal_lines line
       WHERE line.org_id=organization_id AND line.journal_entry_id=journal_id
         AND line.branch_id<>payment.branch_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='payment journal settlement line or branch does not match payment';
    END IF;
    posted_time:=pg_catalog.transaction_timestamp();
    INSERT INTO "{FUNCTION_SCHEMA}"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'payment',organization_id,payment_id);
    UPDATE finance.journal_entries SET status='posted',posted_at=posted_time,posted_by_membership_id=actor,
           updated_at=posted_time,updated_by_membership_id=actor,row_version=row_version+1
     WHERE org_id=organization_id AND id=journal_id;
    UPDATE finance.payments SET status='posted',posted_at=posted_time,posted_by_membership_id=actor,
           updated_at=posted_time,updated_by_membership_id=actor,row_version=row_version+1
     WHERE org_id=organization_id AND id=payment_id;
    INSERT INTO finance.accounting_events(org_id,id,event_type,payment_id,journal_entry_id,
        occurred_at,source_posted_at,created_by_membership_id)
      VALUES(organization_id,event_id,'payment',payment_id,journal_id,posted_time,posted_time,actor);
    DELETE FROM "{FUNCTION_SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
      AND transaction_id=pg_catalog.txid_current() AND scope='payment' AND org_id=organization_id AND entity_id=payment_id;
    RETURN payment_id;
END
""",
            runtime_callable=True,
        ),
        *_function(
            '"post_supplier_advance_payment"(organization_id uuid, payment_id uuid, journal_id uuid, event_id uuid, advance_allocations jsonb)',
            "uuid",
            f"""
DECLARE payment finance.payments%ROWTYPE; item jsonb; actor uuid; allocated numeric(20,2):=0;
        line_payload_gross numeric(20,2); existing_line_gross numeric(20,2);
        line procurement.purchase_order_lines%ROWTYPE; purchase_order procurement.purchase_orders%ROWTYPE;
        supplier parties.supplier_accounts%ROWTYPE;
BEGIN
    IF pg_catalog.jsonb_typeof(advance_allocations)<>'array' OR pg_catalog.jsonb_array_length(advance_allocations)=0 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='typed supplier advance allocations are required';
    END IF;
    actor:=erp_security.current_membership_id();
    SELECT * INTO payment FROM finance.payments WHERE org_id=organization_id AND id=payment_id FOR UPDATE;
    IF payment.status<>'approved' OR payment.direction<>'disbursement' OR payment.currency_code<>'INR'
       OR payment.payment_purpose<>'supplier_advance' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier advance requires approved INR disbursement';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      organization_id::text||':supplier-advance-line:'||ordered.line_id::text,672004))
      FROM (SELECT DISTINCT (payload.value->>'purchase_order_line_id')::uuid AS line_id
              FROM pg_catalog.jsonb_array_elements(advance_allocations) payload(value)
             ORDER BY line_id) ordered;
    FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(advance_allocations) LOOP
      SELECT * INTO line FROM procurement.purchase_order_lines WHERE org_id=organization_id AND id=(item->>'purchase_order_line_id')::uuid FOR SHARE;
      SELECT * INTO purchase_order FROM procurement.purchase_orders WHERE org_id=organization_id AND id=line.purchase_order_id FOR SHARE;
      SELECT * INTO supplier FROM parties.supplier_accounts WHERE org_id=organization_id AND id=purchase_order.supplier_account_id FOR SHARE;
      SELECT coalesce(sum((payload.value->>'gross_advance_amount')::numeric),0) INTO line_payload_gross
       FROM pg_catalog.jsonb_array_elements(advance_allocations) payload(value)
       WHERE (payload.value->>'purchase_order_line_id')::uuid=line.id;
      SELECT coalesce(sum(prior.gross_advance_amount),0) INTO existing_line_gross
       FROM procurement.purchase_order_advance_allocations prior
       WHERE prior.org_id=organization_id AND prior.purchase_order_line_id=line.id AND prior.status='posted'
         AND NOT EXISTS(SELECT 1 FROM procurement.purchase_order_advance_allocations reversal
           WHERE reversal.org_id=prior.org_id AND reversal.reversal_of_allocation_id=prior.id);
      IF line.line_kind<>'product' OR purchase_order.status NOT IN ('approved','partially_received','received')
        OR purchase_order.branch_id<>payment.branch_id
        OR supplier.party_id<>payment.party_id OR (item->>'cash_disbursed_amount')::numeric<=0
        OR (item->>'gross_advance_amount')::numeric<(item->>'cash_disbursed_amount')::numeric
        OR existing_line_gross+line_payload_gross>line.net_value_amount THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='advance allocation must reference approved pharma-goods PO line for payment supplier';
      END IF;
      allocated:=allocated+(item->>'cash_disbursed_amount')::numeric;
    END LOOP;
    IF allocated<>payment.amount THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='advance allocations must equal payment'; END IF;
    INSERT INTO "{FUNCTION_SCHEMA}"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'supplier_advance_payment',organization_id,payment_id);
    PERFORM "{FUNCTION_SCHEMA}"."post_payment"(organization_id,payment_id,journal_id,event_id);
    FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(advance_allocations) LOOP
      SELECT * INTO line FROM procurement.purchase_order_lines WHERE org_id=organization_id AND id=(item->>'purchase_order_line_id')::uuid;
      SELECT * INTO purchase_order FROM procurement.purchase_orders WHERE org_id=organization_id AND id=line.purchase_order_id;
      INSERT INTO finance.open_items(org_id,id,accounting_event_id,party_id,item_side,document_number,
        document_date,due_date,currency_code,principal_amount,functional_principal_amount,created_by_membership_id)
      VALUES(organization_id,(item->>'prepayment_open_item_id')::uuid,event_id,payment.party_id,'receivable',
        payment.payment_number,payment.payment_date,payment.payment_date,'INR',(item->>'gross_advance_amount')::numeric,
        (item->>'gross_advance_amount')::numeric,actor);
      INSERT INTO procurement.purchase_order_advance_allocations(org_id,id,payment_id,purchase_order_line_id,
        supplier_account_id,branch_id,cash_disbursed_amount,withheld_amount,gross_advance_amount,
        functional_gross_advance_amount,allocation_date,prepayment_open_item_id,withholding_id,created_by_membership_id)
      VALUES(organization_id,(item->>'id')::uuid,payment_id,line.id,purchase_order.supplier_account_id,
        purchase_order.branch_id,(item->>'cash_disbursed_amount')::numeric,
        coalesce((item->>'withheld_amount')::numeric,0),(item->>'gross_advance_amount')::numeric,
        (item->>'gross_advance_amount')::numeric,payment.payment_date,
        (item->>'prepayment_open_item_id')::uuid,(item->>'withholding_id')::uuid,actor);
      IF coalesce((item->>'withheld_amount')::numeric,0)>0 THEN
        PERFORM erp_compliance_commands.post_withholding(
          organization_id,(item->>'withholding_id')::uuid,actor,NULL::uuid,(item->>'id')::uuid,
          (item->>'withholding_journal_id')::uuid,(item->>'withholding_event_id')::uuid,NULL::uuid,
          pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'id',item->>'withholding_basis_line_id','purchase_order_advance_allocation_id',item->>'id')),
          pg_catalog.decode(item->>'withholding_key_hash','hex'),
          pg_catalog.decode(item->>'withholding_request_hash','hex'),
          (item->>'withholding_expires_at')::timestamptz);
      ELSE
        PERFORM erp_compliance_commands.assert_no_advance_withholding_required(
          organization_id,(item->>'id')::uuid);
      END IF;
    END LOOP;
    DELETE FROM "{FUNCTION_SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
      AND transaction_id=pg_catalog.txid_current() AND scope='supplier_advance_payment'
      AND org_id=organization_id AND entity_id=payment_id;
    RETURN payment_id;
END
""",
            runtime_callable=True,
        ),
        *_function(
            '"reverse_payment"(organization_id uuid, original_payment_id uuid, reversal_payment_id uuid, reversal_payment_number varchar, reversal_journal_id uuid, reversal_journal_number varchar, reversal_event_id uuid, reason text)',
            "uuid",
            f"""
DECLARE original finance.payments%ROWTYPE; original_journal finance.journal_entries%ROWTYPE;
        actor uuid; reversed_time timestamptz; existing uuid; advance record; allocation_item record;
        reversal_withholding_id uuid; reversal_open_item_id uuid;
BEGIN
    IF organization_id IS DISTINCT FROM erp_security.current_org_id()
       OR reason IS NULL OR pg_catalog.btrim(reason)='' THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='payment reversal permission or reason missing';
    END IF;
    actor:=erp_security.current_membership_id();
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(organization_id::text||original_payment_id::text,672002));
    SELECT * INTO original FROM finance.payments WHERE org_id=organization_id AND id=original_payment_id FOR UPDATE;
    SELECT id INTO existing FROM finance.payments WHERE org_id=organization_id AND reversal_of_payment_id=original_payment_id;
    IF existing=reversal_payment_id AND original.status='reversed' THEN RETURN reversal_payment_id; END IF;
    IF original.status<>'posted' OR original.reversal_of_payment_id IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='only an unreversed posted payment may be reversed';
    END IF;
    IF NOT erp_security.can_access_branch(original.branch_id)
       OR NOT erp_security.has_permission('finance.payment.manage',original.branch_id)
       OR NOT erp_security.has_permission('finance.journal.post',original.branch_id) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='payment reversal branch permission denied';
    END IF;
    IF original.payment_purpose='withholding_deposit' AND EXISTS(
      SELECT 1 FROM tax.withholding_deposits deposit
       WHERE deposit.org_id=organization_id AND deposit.payment_id=original_payment_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='statutory deposit payment is retained after challan allocation; use a typed refund deposit correction';
    END IF;
    SELECT journal.* INTO original_journal FROM finance.accounting_events event
      JOIN finance.journal_entries journal ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id
     WHERE event.org_id=organization_id AND event.payment_id=original_payment_id FOR UPDATE OF journal;
    IF original_journal.status<>'posted' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='original payment journal is not posted'; END IF;
    reversed_time:=pg_catalog.transaction_timestamp();
    INSERT INTO "{FUNCTION_SCHEMA}"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'payment',organization_id,original_payment_id),
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'payment',organization_id,reversal_payment_id);
    INSERT INTO finance.payments(org_id,id,payment_number,payment_date,direction,party_id,branch_id,
      bank_account_id,settlement_account_id,
      payment_method,payment_purpose,currency_code,amount,functional_amount,fx_rate,external_reference,memo,
      reversal_of_payment_id,reversal_reason,status,approved_at,approved_by_membership_id,
      created_by_membership_id,updated_by_membership_id)
    VALUES(organization_id,reversal_payment_id,reversal_payment_number,original.payment_date,
      CASE original.direction WHEN 'receipt' THEN 'disbursement' ELSE 'receipt' END,
      original.party_id,original.branch_id,original.bank_account_id,original.settlement_account_id,
      original.payment_method,original.payment_purpose,original.currency_code,
      original.amount,original.functional_amount,original.fx_rate,original.external_reference,
      original.memo,original_payment_id,reason,'approved',reversed_time,actor,actor,actor);
    INSERT INTO finance.journal_entries(org_id,id,journal_number,posting_date,description,
      transaction_currency,functional_currency,fx_rate,transaction_debit_total,transaction_credit_total,
      functional_debit_total,functional_credit_total,reversal_of_journal_entry_id,reversal_reason,status,
      created_by_membership_id,updated_by_membership_id)
    VALUES(organization_id,reversal_journal_id,reversal_journal_number,original_journal.posting_date,
      'Payment reversal: '||reason,original_journal.transaction_currency,original_journal.functional_currency,
      original_journal.fx_rate,original_journal.transaction_credit_total,original_journal.transaction_debit_total,
      original_journal.functional_credit_total,original_journal.functional_debit_total,
      original_journal.id,reason,'draft',actor,actor);
    INSERT INTO finance.journal_lines(org_id,id,journal_entry_id,line_number,account_id,branch_id,party_id,
      description,transaction_debit,transaction_credit,functional_debit,functional_credit,created_by_membership_id)
    SELECT organization_id,gen_random_uuid(),reversal_journal_id,line_number,account_id,branch_id,party_id,
      description,transaction_credit,transaction_debit,functional_credit,functional_debit,actor
      FROM finance.journal_lines WHERE org_id=organization_id AND journal_entry_id=original_journal.id ORDER BY line_number;
    UPDATE finance.journal_entries SET status='posted',posted_at=reversed_time,posted_by_membership_id=actor,
      updated_at=reversed_time,updated_by_membership_id=actor,row_version=row_version+1
      WHERE org_id=organization_id AND id=reversal_journal_id;
    PERFORM "{FUNCTION_SCHEMA}"."mark_journal_reversed"(
      organization_id,original_journal.id,reversal_journal_id);
    UPDATE finance.payments SET status='posted',posted_at=reversed_time,posted_by_membership_id=actor,
      updated_at=reversed_time,updated_by_membership_id=actor,row_version=row_version+1
      WHERE org_id=organization_id AND id=reversal_payment_id;
    INSERT INTO finance.accounting_events(org_id,id,event_type,payment_id,journal_entry_id,
      occurred_at,source_posted_at,created_by_membership_id)
    VALUES(organization_id,reversal_event_id,'payment',reversal_payment_id,reversal_journal_id,
      reversed_time,reversed_time,actor);
    INSERT INTO finance.allocations(org_id,id,payment_id,open_item_id,allocation_date,currency_code,
      amount,functional_amount,fx_rate,reversal_of_allocation_id,reversal_reason,status,reversed_at,
      reversed_by_membership_id,created_by_membership_id)
    SELECT organization_id,gen_random_uuid(),allocation.payment_id,allocation.open_item_id,
      original.payment_date,allocation.currency_code,allocation.amount,allocation.functional_amount,
      allocation.fx_rate,allocation.id,reason,'reversed',reversed_time,actor,actor
      FROM finance.allocations allocation
     WHERE allocation.org_id=organization_id AND allocation.payment_id=original_payment_id
       AND allocation.status='posted'
       AND NOT EXISTS (SELECT 1 FROM finance.allocations reversal
                        WHERE reversal.org_id=allocation.org_id AND reversal.reversal_of_allocation_id=allocation.id);
    FOR allocation_item IN SELECT DISTINCT allocation.open_item_id
      FROM finance.allocations allocation
     WHERE allocation.org_id=organization_id AND allocation.payment_id=original_payment_id LOOP
      PERFORM erp_finance_commands.synchronize_open_item_status(
        organization_id,allocation_item.open_item_id);
    END LOOP;
    FOR advance IN SELECT * FROM procurement.purchase_order_advance_allocations a
      WHERE a.org_id=organization_id AND a.payment_id=original_payment_id AND a.status='posted' FOR UPDATE LOOP
      PERFORM erp_compliance_commands.assert_advance_withholding_reversible(organization_id,advance.id);
      reversal_withholding_id:=NULL;
      IF advance.withholding_id IS NOT NULL THEN
        reversal_withholding_id:=gen_random_uuid();
        PERFORM erp_compliance_commands.reverse_withholding(
          organization_id,advance.withholding_id,reversal_withholding_id,actor,gen_random_uuid(),gen_random_uuid(),NULL::uuid,
          reason,extensions.digest(pg_catalog.convert_to('advance-reversal:'||advance.id::text,'UTF8'),'sha256'),
          extensions.digest(pg_catalog.convert_to(reason||':'||advance.id::text,'UTF8'),'sha256'),reversed_time+interval '1 hour');
      END IF;
      reversal_open_item_id:=gen_random_uuid();
      INSERT INTO finance.open_items(org_id,id,accounting_event_id,party_id,item_side,document_number,document_date,due_date,
        currency_code,principal_amount,functional_principal_amount,status,reversed_at,created_by_membership_id)
      VALUES(organization_id,reversal_open_item_id,reversal_event_id,original.party_id,'receivable',reversal_payment_number,
        original.payment_date,original.payment_date,'INR',advance.gross_advance_amount,advance.gross_advance_amount,'reversed',reversed_time,actor);
      INSERT INTO procurement.purchase_order_advance_allocations(org_id,id,payment_id,purchase_order_line_id,supplier_account_id,
        branch_id,cash_disbursed_amount,withheld_amount,gross_advance_amount,functional_gross_advance_amount,allocation_date,
        prepayment_open_item_id,withholding_id,reversal_of_allocation_id,reversal_reason,status,created_by_membership_id)
      VALUES(organization_id,gen_random_uuid(),reversal_payment_id,advance.purchase_order_line_id,advance.supplier_account_id,
        advance.branch_id,advance.cash_disbursed_amount,advance.withheld_amount,advance.gross_advance_amount,
        advance.functional_gross_advance_amount,original.payment_date,reversal_open_item_id,reversal_withholding_id,
        advance.id,reason,'reversed',actor);
      UPDATE finance.open_items SET status='reversed',reversed_at=reversed_time
       WHERE org_id=organization_id AND id=advance.prepayment_open_item_id AND status='open';
    END LOOP;
    UPDATE finance.payments SET status='reversed',updated_at=reversed_time,
      updated_by_membership_id=actor,row_version=row_version+1
      WHERE org_id=organization_id AND id=original_payment_id;
    DELETE FROM "{FUNCTION_SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
      AND transaction_id=pg_catalog.txid_current() AND scope='payment' AND org_id=organization_id
      AND entity_id IN (original_payment_id,reversal_payment_id);
    RETURN reversal_payment_id;
END
""",
            runtime_callable=True,
        ),
        *_function(
            '"apply_supplier_advance"(organization_id uuid, advance_allocation_id uuid, supplier_invoice_line_id uuid, invoice_open_item_id uuid, allocation_id uuid, journal_id uuid, journal_number varchar, event_id uuid)',
            "uuid",
            f"""
DECLARE advance procurement.purchase_order_advance_allocations%ROWTYPE;
        invoice_line procurement.supplier_invoice_lines%ROWTYPE;
        invoice procurement.supplier_invoices%ROWTYPE; advance_item finance.open_items%ROWTYPE;
        invoice_item finance.open_items%ROWTYPE; actor uuid; payable_account uuid; prepayment_account uuid;
        posted_time timestamptz:=pg_catalog.transaction_timestamp(); existing_event uuid;
BEGIN
    IF organization_id IS DISTINCT FROM erp_security.current_org_id()
       OR NOT erp_security.has_permission('finance.payment.manage',NULL::uuid)
       OR NOT erp_security.has_permission('finance.journal.post',NULL::uuid) THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='supplier advance application permission denied';
    END IF;
    actor:=erp_security.current_membership_id();
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(organization_id::text||advance_allocation_id::text,672003));
    SELECT id INTO existing_event FROM finance.accounting_events
     WHERE org_id=organization_id AND purchase_order_advance_allocation_id=advance_allocation_id;
    IF existing_event=event_id THEN RETURN advance_allocation_id; END IF;
    IF existing_event IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='supplier advance was already applied'; END IF;
    SELECT * INTO STRICT advance FROM procurement.purchase_order_advance_allocations
     WHERE org_id=organization_id AND id=advance_allocation_id FOR UPDATE;
    SELECT * INTO STRICT advance_item FROM finance.open_items
     WHERE org_id=organization_id AND id=advance.prepayment_open_item_id FOR UPDATE;
    SELECT * INTO STRICT invoice_line FROM procurement.supplier_invoice_lines
     WHERE org_id=organization_id AND id=supplier_invoice_line_id FOR SHARE;
    SELECT * INTO STRICT invoice FROM procurement.supplier_invoices
     WHERE org_id=organization_id AND id=invoice_line.supplier_invoice_id FOR SHARE;
    SELECT * INTO STRICT invoice_item FROM finance.open_items
     WHERE org_id=organization_id AND id=invoice_open_item_id FOR UPDATE;
    IF advance.status<>'posted' OR advance.reversal_of_allocation_id IS NOT NULL
       OR advance_item.status<>'open' OR advance_item.item_side<>'receivable'
       OR advance_item.principal_amount<>advance.gross_advance_amount
       OR invoice.status<>'posted' OR invoice_line.line_kind<>'product'
       OR invoice_line.purchase_order_line_id IS DISTINCT FROM advance.purchase_order_line_id
       OR invoice.supplier_account_id IS DISTINCT FROM advance.supplier_account_id
       OR invoice.branch_id IS DISTINCT FROM advance.branch_id
       OR invoice_item.status<>'open' OR invoice_item.item_side<>'payable'
       OR invoice_item.party_id IS DISTINCT FROM advance_item.party_id
       OR invoice_item.currency_code<>'INR' OR invoice_item.principal_amount<advance.gross_advance_amount
       OR invoice_line.net_value_amount<advance.gross_advance_amount THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier advance and posted invoice provenance do not match';
    END IF;
    IF EXISTS (SELECT 1 FROM tax.withholding_basis_lines invoice_basis
                WHERE invoice_basis.org_id=organization_id
                  AND invoice_basis.supplier_invoice_line_id=supplier_invoice_line_id)
       AND advance.withholding_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invoice line already has withholding basis for an earlier paid advance';
    END IF;
    payable_account:=erp_commercial_commands.resolve_role_account(
      organization_id,advance.branch_id,'accounts_payable','liability','INR',true);
    prepayment_account:=erp_commercial_commands.resolve_role_account(
      organization_id,advance.branch_id,'supplier_prepayment','asset','INR',true);
    INSERT INTO finance.journal_entries(org_id,id,journal_number,posting_date,description,
      transaction_currency,functional_currency,fx_rate,transaction_debit_total,transaction_credit_total,
      functional_debit_total,functional_credit_total,status,created_by_membership_id,updated_by_membership_id)
    VALUES(organization_id,journal_id,journal_number,invoice.invoice_date,'Supplier advance application','INR','INR',1,
      advance.gross_advance_amount,advance.gross_advance_amount,advance.functional_gross_advance_amount,
      advance.functional_gross_advance_amount,'draft',actor,actor);
    INSERT INTO finance.journal_lines(org_id,id,journal_entry_id,line_number,account_id,branch_id,party_id,
      description,transaction_debit,transaction_credit,functional_debit,functional_credit,created_by_membership_id)
    VALUES
      (organization_id,gen_random_uuid(),journal_id,1,payable_account,advance.branch_id,advance_item.party_id,
       'Apply supplier prepayment',advance.gross_advance_amount,0,advance.functional_gross_advance_amount,0,actor),
      (organization_id,gen_random_uuid(),journal_id,2,prepayment_account,advance.branch_id,advance_item.party_id,
       'Clear supplier prepayment',0,advance.gross_advance_amount,0,advance.functional_gross_advance_amount,actor);
    UPDATE finance.journal_entries SET status='posted',posted_at=posted_time,posted_by_membership_id=actor,
      updated_at=posted_time,updated_by_membership_id=actor,row_version=row_version+1
     WHERE org_id=organization_id AND id=journal_id;
    INSERT INTO finance.accounting_events(org_id,id,event_type,purchase_order_advance_allocation_id,journal_entry_id,
      occurred_at,source_posted_at,created_by_membership_id)
    VALUES(organization_id,event_id,'supplier_advance_application',advance.id,journal_id,posted_time,invoice.posted_at,actor);
    INSERT INTO finance.allocations(org_id,id,purchase_order_advance_allocation_id,open_item_id,allocation_date,
      currency_code,amount,functional_amount,fx_rate,status,created_by_membership_id)
    VALUES(organization_id,allocation_id,advance.id,invoice_item.id,invoice.invoice_date,'INR',advance.gross_advance_amount,
      advance.functional_gross_advance_amount,1,'posted',actor);
    PERFORM erp_finance_commands.synchronize_open_item_status(organization_id,invoice_item.id);
    UPDATE finance.open_items SET status='settled',settled_at=posted_time
     WHERE org_id=organization_id AND id=advance_item.id AND status='open';
    RETURN advance_allocation_id;
END
""",
            runtime_callable=True,
        ),
    ]


def _bank_line_definition() -> list[str]:
    return [
        *_function(
            '"guard_bank_statement_line"()',
            "trigger",
            f"""
BEGIN
    IF TG_OP<>'INSERT' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='imported bank statement lines are immutable'; END IF;
    IF NOT "{FUNCTION_SCHEMA}"."scope_active"('bank_parse',NEW.org_id,NEW.bank_statement_id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='bank statement lines require verified parser command provenance';
    END IF;
    RETURN NEW;
END
""",
        ),
        _trigger("bank_statement_lines_command_guard_ct", "INSERT OR UPDATE OR DELETE", "finance.bank_statement_lines", "guard_bank_statement_line"),
        *_function(
            '"import_bank_statement_lines"(organization_id uuid, statement_id uuid, parsed_lines jsonb)',
            "uuid",
            f"""
DECLARE statement finance.bank_statements%ROWTYPE; attachment core.attachments%ROWTYPE;
        actor uuid; item jsonb; expected numeric(20,2); supplied_count integer; existing_count integer;
BEGIN
    IF organization_id IS DISTINCT FROM erp_security.current_org_id()
       OR NOT erp_security.has_permission('finance.bank_statement.import',NULL::uuid) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='bank statement import permission denied';
    END IF;
    IF pg_catalog.jsonb_typeof(parsed_lines)<>'array' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='parsed_lines must be an array'; END IF;
    actor:=erp_security.current_membership_id();
    SELECT * INTO statement FROM finance.bank_statements WHERE org_id=organization_id AND id=statement_id FOR UPDATE;
    IF NOT FOUND OR statement.status<>'imported' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='bank statement is not importable'; END IF;
    SELECT * INTO attachment FROM core.attachments WHERE org_id=organization_id AND id=statement.source_attachment_id FOR SHARE;
    IF attachment.status NOT IN ('verified','retained') OR attachment.sha256 IS DISTINCT FROM statement.source_sha256 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='bank statement source attachment is not verified';
    END IF;
    supplied_count:=pg_catalog.jsonb_array_length(parsed_lines);
    SELECT count(*) INTO existing_count FROM finance.bank_statement_lines WHERE org_id=organization_id AND bank_statement_id=statement_id;
    IF existing_count>0 THEN
        IF existing_count<>supplied_count THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='bank parser idempotency mismatch'; END IF;
        IF EXISTS (
          SELECT 1 FROM pg_catalog.jsonb_array_elements(parsed_lines) payload
          LEFT JOIN finance.bank_statement_lines line
            ON line.org_id=organization_id AND line.bank_statement_id=statement_id
           AND line.line_number=(payload.value->>'line_number')::integer
          WHERE line.id IS NULL
             OR line.transaction_date IS DISTINCT FROM (payload.value->>'transaction_date')::date
             OR line.value_date IS DISTINCT FROM (payload.value->>'value_date')::date
             OR line.direction IS DISTINCT FROM payload.value->>'direction'
             OR line.amount IS DISTINCT FROM (payload.value->>'amount')::numeric
             OR line.running_balance IS DISTINCT FROM (payload.value->>'running_balance')::numeric
             OR line.bank_reference IS DISTINCT FROM payload.value->>'bank_reference'
             OR line.description IS DISTINCT FROM payload.value->>'description'
             OR line.counterparty_name IS DISTINCT FROM payload.value->>'counterparty_name'
             OR line.counterparty_account_hash IS DISTINCT FROM CASE
                  WHEN payload.value->>'counterparty_account_hash' IS NULL THEN NULL
                  ELSE pg_catalog.decode(payload.value->>'counterparty_account_hash','hex') END
        ) THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='bank parser idempotency payload mismatch'; END IF;
        RETURN statement_id;
    END IF;
    IF supplied_count>0 AND EXISTS (
      SELECT 1 FROM (
        SELECT (value->>'line_number')::integer n FROM pg_catalog.jsonb_array_elements(parsed_lines)
      ) numbers GROUP BY n HAVING count(*)<>1
    ) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='duplicate bank source line number'; END IF;
    IF supplied_count>0 AND ((SELECT min((value->>'line_number')::integer) FROM pg_catalog.jsonb_array_elements(parsed_lines))<>1
       OR (SELECT max((value->>'line_number')::integer) FROM pg_catalog.jsonb_array_elements(parsed_lines))<>supplied_count) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='bank source line numbers must be contiguous';
    END IF;
    expected:=statement.opening_balance;
    INSERT INTO "{FUNCTION_SCHEMA}"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'bank_parse',organization_id,statement_id);
    FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(parsed_lines) ORDER BY (value->>'line_number')::integer LOOP
        expected:=expected + CASE item->>'direction' WHEN 'credit' THEN (item->>'amount')::numeric ELSE -(item->>'amount')::numeric END;
        IF item ? 'running_balance' AND item->>'running_balance' IS NOT NULL
           AND (item->>'running_balance')::numeric IS DISTINCT FROM expected THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='bank running balance sequence mismatch';
        END IF;
        INSERT INTO finance.bank_statement_lines(org_id,id,bank_statement_id,line_number,transaction_date,
          value_date,direction,amount,running_balance,bank_reference,description,counterparty_name,
          counterparty_account_hash,created_by_membership_id)
        VALUES(organization_id,COALESCE((item->>'id')::uuid,gen_random_uuid()),statement_id,
          (item->>'line_number')::integer,(item->>'transaction_date')::date,
          (item->>'value_date')::date,item->>'direction',(item->>'amount')::numeric,
          (item->>'running_balance')::numeric,item->>'bank_reference',item->>'description',
          item->>'counterparty_name',CASE WHEN item->>'counterparty_account_hash' IS NULL THEN NULL
            ELSE pg_catalog.decode(item->>'counterparty_account_hash','hex') END,actor);
    END LOOP;
    IF expected<>statement.closing_balance THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='bank statement lines do not reconcile closing balance'; END IF;
    DELETE FROM "{FUNCTION_SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
      AND transaction_id=pg_catalog.txid_current() AND scope='bank_parse' AND org_id=organization_id AND entity_id=statement_id;
    RETURN statement_id;
END
""",
            runtime_callable=True,
        ),
    ]


def _portal_document_definition() -> list[str]:
    return [
        *_function(
            '"guard_portal_document"()',
            "trigger",
            f"""
BEGIN
    IF TG_OP='DELETE' AND OLD.status<>'imported' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='parsed portal evidence is retained'; END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    IF TG_OP='UPDATE' AND OLD.status IN ('parsed','rejected','superseded') AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='terminal portal import is immutable';
    END IF;
    IF TG_OP='UPDATE' AND NEW.status IN ('parsed','rejected') AND NEW.status IS DISTINCT FROM OLD.status
       AND NOT "{FUNCTION_SCHEMA}"."scope_active"('portal_parse',NEW.org_id,NEW.id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='portal terminal transition requires parser command provenance';
    END IF;
    RETURN NEW;
END
""",
        ),
        _trigger("portal_documents_command_guard_ct", "UPDATE OR DELETE", "tax.portal_documents", "guard_portal_document"),
        *_function(
            '"parse_portal_document"(organization_id uuid, portal_document_id uuid, parsed_lines jsonb)',
            "uuid",
            f"""
DECLARE document tax.portal_documents%ROWTYPE; attachment core.attachments%ROWTYPE;
        actor uuid; item jsonb; supplied_count integer; existing_count integer; parsed_time timestamptz;
        target_document_id uuid:=portal_document_id;
BEGIN
    IF organization_id IS DISTINCT FROM erp_security.current_org_id()
       OR NOT erp_security.has_permission('tax.portal.import',NULL::uuid) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='portal import permission denied';
    END IF;
    IF pg_catalog.jsonb_typeof(parsed_lines)<>'array' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='parsed_lines must be an array'; END IF;
    actor:=erp_security.current_membership_id(); parsed_time:=pg_catalog.transaction_timestamp();
    SELECT * INTO document FROM tax.portal_documents WHERE org_id=organization_id AND id=target_document_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='portal document not found'; END IF;
    supplied_count:=pg_catalog.jsonb_array_length(parsed_lines);
    SELECT count(*) INTO existing_count
     FROM tax.portal_document_lines AS existing_line
     WHERE existing_line.org_id=organization_id
       AND existing_line.portal_document_id=target_document_id;
    IF document.status='parsed' THEN
        IF existing_count<>supplied_count THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='portal parser idempotency mismatch'; END IF;
        IF EXISTS (
          SELECT 1 FROM pg_catalog.jsonb_array_elements(parsed_lines) payload
          LEFT JOIN tax.portal_document_lines line
            ON line.org_id=organization_id AND line.portal_document_id=target_document_id
           AND line.line_number=(payload.value->>'line_number')::integer
          WHERE line.id IS NULL OR line.source_row_hash IS DISTINCT FROM
            pg_catalog.decode(payload.value->>'source_row_hash','hex')
        ) THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='portal parser idempotency payload mismatch'; END IF;
        RETURN target_document_id;
    END IF;
    IF document.status<>'imported' OR existing_count<>0 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE=pg_catalog.format(
          'portal document is not parseable (status=%s, existing_lines=%s)',document.status,existing_count); END IF;
    SELECT * INTO attachment FROM core.attachments WHERE org_id=organization_id AND id=document.source_attachment_id FOR SHARE;
    IF attachment.status NOT IN ('verified','retained') OR attachment.sha256 IS DISTINCT FROM document.source_sha256 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='portal source attachment is not verified';
    END IF;
    IF supplied_count>0 AND ((SELECT count(DISTINCT (value->>'line_number')::integer) FROM pg_catalog.jsonb_array_elements(parsed_lines))<>supplied_count
      OR (SELECT min((value->>'line_number')::integer) FROM pg_catalog.jsonb_array_elements(parsed_lines))<>1
      OR (SELECT max((value->>'line_number')::integer) FROM pg_catalog.jsonb_array_elements(parsed_lines))<>supplied_count
      OR (SELECT count(DISTINCT value->>'source_row_hash') FROM pg_catalog.jsonb_array_elements(parsed_lines))<>supplied_count) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='portal parser line number or source hash duplication';
    END IF;
    INSERT INTO "{FUNCTION_SCHEMA}"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'portal_parse',organization_id,target_document_id);
    FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(parsed_lines) ORDER BY (value->>'line_number')::integer LOOP
      INSERT INTO tax.portal_document_lines(org_id,id,portal_document_id,line_number,supplier_gstin,
        counterparty_name,invoice_number,invoice_date,document_type,place_of_supply_state_code,
        taxable_amount,cgst_amount,sgst_amount,igst_amount,cess_amount,total_amount,portal_reference,
        source_row_hash,created_by_membership_id)
      VALUES(organization_id,COALESCE((item->>'id')::uuid,gen_random_uuid()),target_document_id,
        (item->>'line_number')::integer,item->>'supplier_gstin',item->>'counterparty_name',
        item->>'invoice_number',(item->>'invoice_date')::date,item->>'document_type',
        item->>'place_of_supply_state_code',(item->>'taxable_amount')::numeric,(item->>'cgst_amount')::numeric,
        (item->>'sgst_amount')::numeric,(item->>'igst_amount')::numeric,(item->>'cess_amount')::numeric,
        (item->>'total_amount')::numeric,item->>'portal_reference',pg_catalog.decode(item->>'source_row_hash','hex'),actor);
    END LOOP;
    UPDATE tax.portal_documents SET status='parsed',parsed_at=parsed_time,parse_error_code=NULL,parse_error_message=NULL
      WHERE org_id=organization_id AND id=target_document_id;
    DELETE FROM "{FUNCTION_SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
      AND transaction_id=pg_catalog.txid_current() AND scope='portal_parse' AND org_id=organization_id AND entity_id=target_document_id;
    RETURN target_document_id;
END
""",
            runtime_callable=True,
        ),
    ]


def _portal_line_definition() -> list[str]:
    return [
        *_function(
            '"guard_portal_document_line"()',
            "trigger",
            f"""
BEGIN
    IF TG_OP<>'INSERT' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='portal source rows are immutable'; END IF;
    IF NOT "{FUNCTION_SCHEMA}"."scope_active"('portal_parse',NEW.org_id,NEW.portal_document_id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='portal lines require parser command provenance';
    END IF;
    RETURN NEW;
END
""",
        ),
        _trigger("portal_document_lines_command_guard_ct", "INSERT OR UPDATE OR DELETE", "tax.portal_document_lines", "guard_portal_document_line"),
        'CREATE UNIQUE INDEX "portal_document_lines_source_hash_uq" ON "tax"."portal_document_lines" ("org_id","portal_document_id","source_row_hash")',
    ]


def _reconciliation_run_definition() -> list[str]:
    return [
        *_function(
            '"guard_reconciliation_run"()',
            "trigger",
            f"""
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='reconciliation runs are retained'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IN ('completed','failed','superseded') AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='terminal reconciliation run is immutable';
    END IF;
    IF (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status)
       AND NOT "{FUNCTION_SCHEMA}"."scope_active"('tax_reconciliation',NEW.org_id,NEW.id) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='reconciliation lifecycle requires reviewed command provenance';
    END IF;
    RETURN NEW;
END
""",
        ),
        _trigger("reconciliation_runs_command_guard_ct", "INSERT OR UPDATE OR DELETE", "tax.reconciliation_runs", "guard_reconciliation_run"),
        *_function(
            '"run_tax_reconciliation"(organization_id uuid, run_id uuid, registration_id uuid, return_period_id uuid, portal_document_id uuid, policy_version varchar, date_tolerance_days smallint, amount_tolerance numeric)',
            "uuid",
            f"""
DECLARE actor uuid; run tax.reconciliation_runs%ROWTYPE; period tax.return_periods%ROWTYPE;
        portal tax.portal_documents%ROWTYPE; isolation text;
BEGIN
    isolation:=pg_catalog.current_setting('transaction_isolation');
    IF isolation NOT IN ('repeatable read','serializable') THEN
      RAISE EXCEPTION USING ERRCODE='25001', MESSAGE='tax reconciliation requires REPEATABLE READ or SERIALIZABLE transaction';
    END IF;
    IF organization_id IS DISTINCT FROM erp_security.current_org_id()
       OR NOT erp_security.has_permission('tax.reconciliation.run',NULL::uuid) THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='tax reconciliation permission denied';
    END IF;
    actor:=erp_security.current_membership_id();
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(organization_id::text||registration_id::text||return_period_id::text||portal_document_id::text,672003));
    SELECT * INTO run FROM tax.reconciliation_runs WHERE org_id=organization_id AND id=run_id FOR UPDATE;
    IF FOUND THEN
      IF run.status='completed' AND ROW(run.registration_id,run.return_period_id,run.portal_document_id,
         run.policy_version,run.date_tolerance_days,run.amount_tolerance)
         IS NOT DISTINCT FROM ROW(registration_id,return_period_id,portal_document_id,
         policy_version,date_tolerance_days,amount_tolerance) THEN RETURN run_id; END IF;
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='reconciliation idempotency key reused with different state';
    END IF;
    SELECT * INTO period FROM tax.return_periods WHERE org_id=organization_id AND id=return_period_id AND registration_id=registration_id FOR SHARE;
    SELECT * INTO portal FROM tax.portal_documents WHERE org_id=organization_id AND id=portal_document_id
      AND registration_id=registration_id AND return_period_id=return_period_id FOR SHARE;
    IF period.id IS NULL OR portal.status<>'parsed' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='reconciliation populations are not compatible and parsed'; END IF;
    INSERT INTO "{FUNCTION_SCHEMA}"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'tax_reconciliation',organization_id,run_id);
    INSERT INTO tax.reconciliation_runs(org_id,id,registration_id,return_period_id,portal_document_id,
      policy_version,date_tolerance_days,amount_tolerance,started_by_membership_id,created_by_membership_id)
    VALUES(organization_id,run_id,registration_id,return_period_id,portal_document_id,policy_version,
      date_tolerance_days,amount_tolerance,actor,actor);
    WITH internal_population AS (
      SELECT document.*,
        pg_catalog.row_number() OVER (PARTITION BY pg_catalog.upper(pg_catalog.btrim(document.counterparty_gstin)),
          pg_catalog.upper(pg_catalog.btrim(document.document_number)) ORDER BY document.document_date,document.id) AS rn
      FROM tax.documents document
      WHERE document.org_id=organization_id AND document.registration_id=registration_id
        AND document.direction='inward' AND document.document_date BETWEEN period.period_start AND period.period_end
    ), portal_population AS (
      SELECT line.*,
        pg_catalog.row_number() OVER (PARTITION BY pg_catalog.upper(pg_catalog.btrim(line.supplier_gstin)),
          pg_catalog.upper(pg_catalog.btrim(line.invoice_number)) ORDER BY line.invoice_date,line.id) AS rn
      FROM tax.portal_document_lines line WHERE line.org_id=organization_id AND line.portal_document_id=portal_document_id
    ), paired AS (
      SELECT internal.id tax_id, portal_line.id portal_id,
        (portal_line.invoice_date-internal.document_date) date_difference,
        portal_line.taxable_amount-internal.gst_taxable_value taxable_difference,
        portal_line.cgst_amount-internal.cgst_amount cgst_difference,
        portal_line.sgst_amount-internal.sgst_amount sgst_difference,
        portal_line.igst_amount-internal.igst_amount igst_difference,
        portal_line.cess_amount-internal.cess_amount cess_difference
      FROM internal_population internal JOIN portal_population portal_line
        ON pg_catalog.upper(pg_catalog.btrim(internal.counterparty_gstin))=pg_catalog.upper(pg_catalog.btrim(portal_line.supplier_gstin))
       AND pg_catalog.upper(pg_catalog.btrim(internal.document_number))=pg_catalog.upper(pg_catalog.btrim(portal_line.invoice_number))
       AND internal.rn=portal_line.rn
    )
    INSERT INTO tax.reconciliation_items(org_id,id,reconciliation_run_id,tax_document_id,portal_document_line_id,
      match_status,match_method,confidence_score,document_number_match,document_date_difference_days,
      taxable_difference,cgst_difference,sgst_difference,igst_difference,cess_difference,created_by_membership_id)
    SELECT organization_id,gen_random_uuid(),run_id,tax_id,portal_id,
      CASE WHEN abs(date_difference)<=date_tolerance_days AND abs(taxable_difference)<=amount_tolerance
        AND abs(cgst_difference)<=amount_tolerance AND abs(sgst_difference)<=amount_tolerance
        AND abs(igst_difference)<=amount_tolerance AND abs(cess_difference)<=amount_tolerance THEN 'matched' ELSE 'mismatch' END,
      'gstin_invoice_date',1.000000,true,date_difference,taxable_difference,cgst_difference,
      sgst_difference,igst_difference,cess_difference,actor FROM paired;
    INSERT INTO tax.reconciliation_items(org_id,id,reconciliation_run_id,tax_document_id,match_status,
      match_method,document_number_match,taxable_difference,cgst_difference,sgst_difference,igst_difference,
      cess_difference,created_by_membership_id)
    SELECT organization_id,gen_random_uuid(),run_id,document.id,'internal_only','unmatched',false,
      -document.gst_taxable_value,-document.cgst_amount,-document.sgst_amount,-document.igst_amount,-document.cess_amount,actor
      FROM tax.documents document WHERE document.org_id=organization_id AND document.registration_id=registration_id
       AND document.direction='inward' AND document.document_date BETWEEN period.period_start AND period.period_end
       AND NOT EXISTS (SELECT 1 FROM tax.reconciliation_items item WHERE item.org_id=organization_id
                       AND item.reconciliation_run_id=run_id AND item.tax_document_id=document.id);
    INSERT INTO tax.reconciliation_items(org_id,id,reconciliation_run_id,portal_document_line_id,match_status,
      match_method,document_number_match,taxable_difference,cgst_difference,sgst_difference,igst_difference,
      cess_difference,created_by_membership_id)
    SELECT organization_id,gen_random_uuid(),run_id,line.id,'portal_only','unmatched',false,line.taxable_amount,
      line.cgst_amount,line.sgst_amount,line.igst_amount,line.cess_amount,actor
      FROM tax.portal_document_lines line WHERE line.org_id=organization_id AND line.portal_document_id=portal_document_id
       AND NOT EXISTS (SELECT 1 FROM tax.reconciliation_items item WHERE item.org_id=organization_id
                       AND item.reconciliation_run_id=run_id AND item.portal_document_line_id=line.id);
    UPDATE tax.reconciliation_runs SET status='completed',completed_at=pg_catalog.transaction_timestamp()
      WHERE org_id=organization_id AND id=run_id;
    DELETE FROM "{FUNCTION_SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
      AND transaction_id=pg_catalog.txid_current() AND scope='tax_reconciliation' AND org_id=organization_id AND entity_id=run_id;
    RETURN run_id;
END
""",
            runtime_callable=True,
        ),
    ]


def _reconciliation_item_definition() -> list[str]:
    return [
        *_function(
            '"guard_reconciliation_item"()',
            "trigger",
            f"""
DECLARE run_status text;
BEGIN
    SELECT status INTO run_status FROM tax.reconciliation_runs
     WHERE org_id=COALESCE(NEW.org_id,OLD.org_id) AND id=COALESCE(NEW.reconciliation_run_id,OLD.reconciliation_run_id) FOR SHARE;
    IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='reconciliation items are retained'; END IF;
    IF TG_OP='INSERT' THEN
      IF run_status<>'running' OR NOT "{FUNCTION_SCHEMA}"."scope_active"('tax_reconciliation',NEW.org_id,NEW.reconciliation_run_id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='reconciliation items require the running command transaction';
      END IF;
    ELSE
      IF ROW(NEW.reconciliation_run_id,NEW.tax_document_id,NEW.portal_document_line_id,NEW.match_status,
        NEW.match_method,NEW.confidence_score,NEW.document_number_match,NEW.document_date_difference_days,
        NEW.taxable_difference,NEW.cgst_difference,NEW.sgst_difference,NEW.igst_difference,NEW.cess_difference)
        IS DISTINCT FROM ROW(OLD.reconciliation_run_id,OLD.tax_document_id,OLD.portal_document_line_id,OLD.match_status,
        OLD.match_method,OLD.confidence_score,OLD.document_number_match,OLD.document_date_difference_days,
        OLD.taxable_difference,OLD.cgst_difference,OLD.sgst_difference,OLD.igst_difference,OLD.cess_difference) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='reconciliation match evidence is immutable';
      END IF;
      IF NOT (OLD.resolution_status='unresolved' AND NEW.resolution_status IN ('accepted','corrected','ignored')
         AND "{FUNCTION_SCHEMA}"."scope_active"('tax_resolution',NEW.org_id,NEW.id)) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='resolution is one-time and command-authorized';
      END IF;
    END IF;
    RETURN NEW;
END
""",
        ),
        _trigger("reconciliation_items_command_guard_ct", "INSERT OR UPDATE OR DELETE", "tax.reconciliation_items", "guard_reconciliation_item"),
        *_function(
            '"resolve_reconciliation_item"(organization_id uuid, item_id uuid, resolution_status text, reason text)',
            "uuid",
            f"""
DECLARE item tax.reconciliation_items%ROWTYPE; actor uuid;
BEGIN
    IF organization_id IS DISTINCT FROM erp_security.current_org_id()
       OR NOT erp_security.has_permission('tax.reconciliation.run',NULL::uuid)
       OR resolution_status NOT IN ('accepted','corrected','ignored')
       OR reason IS NULL OR pg_catalog.btrim(reason)='' THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='reconciliation resolution permission or evidence missing';
    END IF;
    actor:=erp_security.current_membership_id();
    SELECT * INTO item FROM tax.reconciliation_items WHERE org_id=organization_id AND id=item_id FOR UPDATE;
    IF item.resolution_status=resolution_status AND item.resolution_reason=reason THEN RETURN item_id; END IF;
    IF item.resolution_status<>'unresolved' OR NOT EXISTS (SELECT 1 FROM tax.reconciliation_runs run
       WHERE run.org_id=organization_id AND run.id=item.reconciliation_run_id AND run.status='completed') THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='only an unresolved completed-run item may be resolved';
    END IF;
    INSERT INTO "{FUNCTION_SCHEMA}"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'tax_resolution',organization_id,item_id);
    UPDATE tax.reconciliation_items SET resolution_status=resolve_reconciliation_item.resolution_status,
      resolution_reason=reason,resolved_at=pg_catalog.transaction_timestamp(),resolved_by_membership_id=actor
      WHERE org_id=organization_id AND id=item_id;
    DELETE FROM "{FUNCTION_SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
      AND transaction_id=pg_catalog.txid_current() AND scope='tax_resolution' AND org_id=organization_id AND entity_id=item_id;
    RETURN item_id;
END
""",
            runtime_callable=True,
        ),
    ]


def _return_document_definition() -> list[str]:
    return [
        *_function(
            '"guard_return_document"()',
            "trigger",
            """
DECLARE tax_return tax.returns%ROWTYPE; period tax.return_periods%ROWTYPE;
        document tax.documents%ROWTYPE; registration tax.registrations%ROWTYPE;
        organization_id uuid; target_return_id uuid; actor_id uuid;
BEGIN
    organization_id:=CASE WHEN TG_OP='DELETE' THEN OLD.org_id ELSE NEW.org_id END;
    target_return_id:=CASE WHEN TG_OP='DELETE' THEN OLD.return_id ELSE NEW.return_id END;
    actor_id:=erp_security.current_membership_id();
    IF organization_id IS DISTINCT FROM erp_security.current_org_id()
       OR actor_id IS NULL
       OR NOT erp_security.has_permission('tax.return.compose',NULL::uuid)
       OR NOT EXISTS (SELECT 1 FROM core.memberships membership
          WHERE membership.org_id=organization_id AND membership.id=actor_id
            AND membership.status='active')
       OR (TG_OP='INSERT' AND NEW.included_by_membership_id IS DISTINCT FROM actor_id) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='return membership actor or permission is invalid';
    END IF;
    IF TG_OP='UPDATE' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return membership rows are immutable; remove and re-add while draft';
    END IF;
    SELECT * INTO tax_return FROM tax.returns
     WHERE org_id=organization_id AND id=target_return_id FOR UPDATE;
    IF tax_return.id IS NULL OR tax_return.status<>'draft' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return membership may change only while its return is draft';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    SELECT * INTO period FROM tax.return_periods
     WHERE org_id=organization_id AND id=tax_return.return_period_id FOR SHARE;
    SELECT * INTO document FROM tax.documents
     WHERE org_id=organization_id AND id=NEW.tax_document_id FOR SHARE;
    SELECT * INTO registration FROM tax.registrations
     WHERE org_id=organization_id AND id=period.registration_id FOR SHARE;
    IF period.id IS NULL OR document.id IS NULL OR registration.id IS NULL
       OR period.status<>'open' OR registration.status<>'active'
       OR document.registration_id IS DISTINCT FROM period.registration_id
       OR document.posted_at IS NULL
       OR document.document_date NOT BETWEEN period.period_start AND period.period_end
       OR document.document_date<registration.effective_from
       OR (registration.effective_to IS NOT NULL AND document.document_date>registration.effective_to) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return member requires an eligible posted document for the same active registration and period';
    END IF;
    IF (tax_return.return_type IN ('gstr1','gstr3b') AND period.period_kind NOT IN ('monthly','quarterly'))
       OR (tax_return.return_type IN ('gstr9','gstr9c') AND period.period_kind<>'annual')
       OR (tax_return.return_type='gstr1' AND document.direction<>'outward') THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='document direction or period kind is ineligible for the typed return';
    END IF;
    IF (document.document_effect='original' AND NEW.population_role<>'original')
       OR (document.document_effect='increase' AND NEW.population_role<>'debit_adjustment')
       OR (document.document_effect='decrease' AND NEW.population_role<>'credit_adjustment')
       OR NEW.population_role='amendment' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='population role must be derived from immutable document effect';
    END IF;
    RETURN NEW;
END
""",
        ),
        _trigger(
            "return_documents_command_guard_ct",
            "INSERT OR UPDATE OR DELETE",
            "tax.return_documents",
            "guard_return_document",
        ),
    ]


def _definitions() -> dict[str, list[str]]:
    return {
        "finance.accounting_events:accounting_events_cross_row_guard": _accounting_event_definition(),
        "finance.bank_statement_lines:bank_statement_lines_cross_row_guard": _bank_line_definition(),
        "finance.payments:payments_cross_row_guard": _payment_definition(),
        "tax.portal_documents:portal_documents_cross_row_guard": _portal_document_definition(),
        "tax.portal_document_lines:portal_document_lines_cross_row_guard": _portal_line_definition(),
        "tax.reconciliation_items:reconciliation_items_cross_row_guard": _reconciliation_item_definition(),
        "tax.reconciliation_runs:reconciliation_runs_cross_row_guard": _reconciliation_run_definition(),
        "tax.return_documents:return_documents_cross_row_guard": _return_document_definition(),
    }


BLOCKED_REASONS = {
    "compliance.controlled_movement_rule_versions:controlled_movement_rule_versions_release_authority": "The isolated regulatory importer owns exact official controlled-movement rule releases.",
    "compliance.storage_rule_versions:storage_rule_versions_effective_guard": "Reviewed storage-rule activation and non-overlap belong to the compliance command boundary.",
    "finance.adjustment_note_lines:adjustment_note_lines_cross_row_guard": "The canonical Decimal engine is not a PostgreSQL function and the catalog stores no independently verifiable calculation proof; a command cannot certify caller-supplied totals.",
    "finance.adjustment_notes:adjustment_notes_cross_row_guard": "Atomic orchestration cannot prove exact note/tax totals until the canonical Decimal authority is exposed through a reviewed database-verifiable calculation proof.",
    "finance.expense_claim_lines:expense_claim_lines_cross_row_guard": "No immutable effective-dated receipt-evidence policy exists in the canonical model.",
    "finance.expense_claims:expense_claims_cross_row_guard": "No immutable approver authorization and expense-account mapping policy exists for a posting command to apply.",
    "tax.documents:documents_cross_row_guard": "No database-verifiable canonical Decimal proof binds immutable source-line snapshots and calculation rules to the tax document.",
    "tax.einvoices:einvoices_cross_row_guard": "IRP response authenticity, signed QR verification, cancellation, and regeneration require a configured external provider and cryptographic verification boundary.",
    "tax.einvoice_rule_versions:einvoice_rule_versions_release_authority": "The isolated regulatory importer owns exact official e-invoice rule releases.",
    "tax.eway_bills:eway_bills_cross_row_guard": "E-way authority response authenticity, cancellation, and regeneration require a configured external provider and cryptographic verification boundary.",
    "tax.gst_adjustment_rule_versions:gst_adjustment_rule_versions_release_authority": "The isolated regulatory importer owns exact official GST adjustment rule releases.",
    "tax.registration_branches:registration_branches_effective_guard": "A reviewed tax registration association command and posting lookup own this boundary.",
    "tax.withholdings:withholdings_cross_row_guard": "The typed rule and basis model exists, but no reviewed command yet selects the exact imported rule, derives cumulative thresholds, posts accounting/allocation effects, and reverses them atomically.",
    "tax.withholding_rule_versions:withholding_rule_versions_release_authority": "The typed rule table requires an exact-set regulated withholding_rules importer before it can be trusted by posting commands.",
    "tax.organization_fiscal_tax_facts:organization_fiscal_tax_facts_evidence_guard": "Organization turnover, TAN and notified-deductor facts require a reviewed evidence-verification command.",
    "tax.withholding_basis_lines:withholding_basis_lines_source_guard": "Basis rows and cumulative thresholds must be derived by the blocked withholding deduction command, never inserted directly.",
    "tax.withholding_deposits:withholding_deposits_cross_row_guard": "Deposit posting requires an exact government payment, verified challan, component allocations and compensating reversal command.",
    "tax.withholding_deposit_lines:withholding_deposit_lines_cross_row_guard": "Deposit lines must be inserted only while locked residuals and component sums are proven.",
    "tax.withholding_statements:withholding_statements_cross_row_guard": "Statement filing requires an immutable authority acknowledgement and exact append-only revision population command.",
    "tax.withholding_statement_lines:withholding_statement_lines_cross_row_guard": "Statement membership must prove matching deposits and periods.",
    "tax.withholding_certificates:withholding_certificates_cross_row_guard": "Certificate import requires a verified immutable authority artifact and correction lineage.",
    "tax.withholding_certificate_lines:withholding_certificate_lines_cross_row_guard": "Certificate coverage must prove exact filed statement-line, deductee, regime, period and amount facts.",
    "compliance.controlled_substance_entries:controlled_substance_entries_cross_row_guard": "The model has no complete effective-dated controlled-substance applicability and counterparty-license authority rules.",
    "compliance.destructions:destructions_cross_row_guard": "The approval row stores no immutable approved batch and quantity snapshot to compare with posted destruction movements.",
    "compliance.recall_batches:recall_batches_cross_row_guard": "Recall inventory context is typed, but exact exposure snapshots and action-total refresh belong to the later reviewed compliance command boundary.",
    "compliance.temperature_readings:temperature_readings_cross_row_guard": "No effective-dated product/location storage-rule authority exists for resolving the permitted range, especially for readings without batch_id.",
}


def generated_artifacts() -> tuple[str, str]:
    invariants = _load_invariants()
    definitions = _definitions()
    owned = set(definitions) | set(BLOCKED_REASONS)
    finance_blockers = {
        key for key in invariants
        if key in owned
    }
    unknown = sorted(owned - set(invariants))
    overlap = sorted(set(definitions) & set(BLOCKED_REASONS))
    if unknown or overlap or finance_blockers != owned:
        raise ContractError(f"command disposition mismatch: unknown={unknown}, overlap={overlap}")
    entries: list[dict[str, Any]] = []
    for key in sorted(definitions):
        invariant = invariants[key]
        entries.append({
            "table": invariant["table"],
            "invariant": invariant["invariant"],
            "enforcement": invariant["enforcement"],
            "requirement_sha256": hashlib.sha256(invariant["rule"].encode()).hexdigest(),
            "reviewed": True,
            "statements": definitions[key],
        })
    mapping = {"mapping_version": "1.0.0", "enforcements": entries, "platform_enforcements": []}
    mapping_text = json.dumps(mapping, indent=2, sort_keys=True) + "\n"
    manifest = {
        "manifest_version": "1.0.0",
        "postgresql": "15+",
        "source_manifest": "../invariants_finance/finance-invariants-manifest.json",
        "mapping_file": MAPPING_PATH.name,
        "mapping_sha256": hashlib.sha256(mapping_text.encode()).hexdigest(),
        "resolved_count": len(definitions),
        "resolved_invariants": sorted(definitions),
        "blocked_count": len(BLOCKED_REASONS),
        "blocked_invariants": {key: {"reason": BLOCKED_REASONS[key]} for key in sorted(BLOCKED_REASONS)},
        "security": {
            "function_schema": FUNCTION_SCHEMA,
            "dynamic_sql": False,
            "fixed_empty_search_path": True,
            "transaction_scoped_provenance": True,
            "runtime_callable_functions": [
                "import_bank_statement_lines(uuid,uuid,jsonb)",
                "apply_supplier_advance(uuid,uuid,uuid,uuid,uuid,uuid,varchar,uuid)",
                "parse_portal_document(uuid,uuid,jsonb)",
                "post_payment(uuid,uuid,uuid,uuid)",
                "post_supplier_advance_payment(uuid,uuid,uuid,uuid,jsonb)",
                "resolve_reconciliation_item(uuid,uuid,text,text)",
                "reverse_payment(uuid,uuid,uuid,varchar,uuid,varchar,uuid,text)",
                "run_tax_reconciliation(uuid,uuid,uuid,uuid,uuid,varchar,smallint,numeric)",
            ],
        },
    }
    return mapping_text, json.dumps(manifest, indent=2, sort_keys=True) + "\n"


def main() -> int:
    mapping_text, manifest_text = generated_artifacts()
    MAPPING_PATH.write_text(mapping_text, encoding="utf-8")
    MANIFEST_PATH.write_text(manifest_text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
