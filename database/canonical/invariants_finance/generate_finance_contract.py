#!/usr/bin/env python3
"""Generate reviewed finance, tax, and compliance invariant mappings."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
DOMAINS_ROOT = ROOT.parent / "domains"
MAPPING_PATH = ROOT / "baseline-finance-enforcements.json"
MANIFEST_PATH = ROOT / "finance-invariants-manifest.json"
DOMAINS = ("finance", "tax", "compliance")
FUNCTION_SCHEMA = "erp_finance_invariants"


class ContractError(RuntimeError):
    """The reviewed mapping no longer matches the canonical catalog."""


def _load_invariants() -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {}
    for domain in DOMAINS:
        document = json.loads((DOMAINS_ROOT / f"{domain}.json").read_text(encoding="utf-8"))
        for table in document["tables"]:
            for invariant in table.get("cross_row_invariants", []):
                key = f"{table['name']}:{invariant['name']}"
                if key in result:
                    raise ContractError(f"duplicate invariant key: {key}")
                result[key] = {
                    "table": table["name"],
                    "invariant": invariant["name"],
                    "enforcement": invariant["enforcement"],
                    "rule": invariant["rule"],
                }
    return result


def _function(name: str, body: str) -> list[str]:
    signature = f'"{FUNCTION_SCHEMA}"."{name}"()'
    return [
        f"""CREATE FUNCTION {signature}
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
{body.strip()}
$function$""",
        f'ALTER FUNCTION {signature} OWNER TO "erp_migration_owner"',
        f'REVOKE ALL ON FUNCTION {signature} FROM PUBLIC, "erp_app", "erp_runtime"',
    ]


def _trigger(name: str, events: str, table: str, function: str) -> str:
    schema, relation = table.split(".")
    return (
        f'CREATE CONSTRAINT TRIGGER "{name}" AFTER {events} ON "{schema}"."{relation}" '
        f'DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION '
        f'"{FUNCTION_SCHEMA}"."{function}"()'
    )


def _definitions() -> dict[str, list[str]]:
    definitions: dict[str, list[str]] = {}

    definitions["finance.accounts:accounts_cross_row_guard"] = [
        f'CREATE SCHEMA "{FUNCTION_SCHEMA}" AUTHORIZATION "erp_migration_owner"',
        f'REVOKE ALL ON SCHEMA "{FUNCTION_SCHEMA}" FROM PUBLIC, "erp_app", "erp_runtime"',
        *_function(
            "guard_account_tree",
            """
DECLARE cycle_found boolean;
BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.org_id::text, 671001));
    IF NEW.parent_account_id IS NOT NULL THEN
        WITH RECURSIVE ancestors(id) AS (
            SELECT NEW.parent_account_id
            UNION
            SELECT account.parent_account_id
              FROM finance.accounts AS account
              JOIN ancestors ON account.org_id = NEW.org_id AND account.id = ancestors.id
             WHERE account.parent_account_id IS NOT NULL
        )
        SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = NEW.id) INTO cycle_found;
        IF cycle_found THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'account parent creates a cycle';
        END IF;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.account_type IS DISTINCT FROM OLD.account_type
       AND EXISTS (SELECT 1 FROM finance.accounts AS child
                    WHERE child.org_id = OLD.org_id AND child.parent_account_id = OLD.id) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'account type cannot change after descendants exist';
    END IF;
    RETURN NEW;
END
""",
        ),
        _trigger("accounts_tree_guard_ct", "INSERT OR UPDATE", "finance.accounts", "guard_account_tree"),
    ]

    definitions["finance.bank_accounts:bank_accounts_cross_row_guard"] = [
        *_function(
            "guard_bank_account",
            """
DECLARE ledger finance.accounts%ROWTYPE;
BEGIN
    SELECT * INTO ledger FROM finance.accounts AS account
     WHERE account.org_id = NEW.org_id AND account.id = NEW.account_id FOR SHARE;
    IF NOT FOUND OR ledger.status <> 'active' OR ledger.account_type <> 'asset'
       OR NOT ledger.allows_bank_reconciliation THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'bank account requires an active reconcilable asset ledger';
    END IF;
    RETURN NEW;
END
""",
        ),
        _trigger("bank_accounts_ledger_guard_ct", "INSERT OR UPDATE", "finance.bank_accounts", "guard_bank_account"),
        *_function(
            "guard_bank_ledger_change",
            """
BEGIN
    IF EXISTS (SELECT 1 FROM finance.bank_accounts AS bank
                WHERE bank.org_id = NEW.org_id AND bank.account_id = NEW.id)
       AND (NEW.status <> 'active' OR NEW.account_type <> 'asset'
            OR NOT NEW.allows_bank_reconciliation) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ledger is bound to a bank account';
    END IF;
    RETURN NEW;
END
""",
        ),
        _trigger("accounts_bank_binding_guard_ct", "UPDATE", "finance.accounts", "guard_bank_ledger_change"),
    ]

    definitions["finance.journal_entries:journal_entries_cross_row_guard"] = [
        *_function(
            "guard_journal_entry",
            """
DECLARE line_count bigint; td numeric(20,2); tc numeric(20,2); fd numeric(20,2); fc numeric(20,2); original finance.journal_entries%ROWTYPE;
BEGIN
    IF TG_OP='INSERT' AND NEW.status<>'draft' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='journal must be composed from draft';
    END IF;
    IF TG_OP = 'DELETE' AND OLD.status <> 'draft' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'non-draft journal is immutable';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IN ('posted','reversed','cancelled') AND ROW(
       NEW.journal_number,NEW.posting_date,NEW.transaction_currency,NEW.functional_currency,NEW.fx_rate,
       NEW.transaction_debit_total,NEW.transaction_credit_total,NEW.functional_debit_total,
       NEW.functional_credit_total,NEW.reversal_of_journal_entry_id,NEW.posted_at,NEW.posted_by_membership_id
    ) IS DISTINCT FROM ROW(
       OLD.journal_number,OLD.posting_date,OLD.transaction_currency,OLD.functional_currency,OLD.fx_rate,
       OLD.transaction_debit_total,OLD.transaction_credit_total,OLD.functional_debit_total,
       OLD.functional_credit_total,OLD.reversal_of_journal_entry_id,OLD.posted_at,OLD.posted_by_membership_id
    ) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted journal financial fields are immutable'; END IF;
    IF TG_OP='UPDATE' AND ((OLD.status='draft' AND NEW.status NOT IN ('draft','posted','cancelled'))
       OR (OLD.status='posted' AND NEW.status NOT IN ('posted','reversed'))
       OR (OLD.status IN ('reversed','cancelled') AND NEW.status<>OLD.status)) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invalid journal lifecycle transition';
    END IF;
    IF NEW.status = 'posted' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'posted') THEN
        SELECT count(*),coalesce(sum(transaction_debit),0),coalesce(sum(transaction_credit),0),
               coalesce(sum(functional_debit),0),coalesce(sum(functional_credit),0)
          INTO line_count,td,tc,fd,fc FROM finance.journal_lines
         WHERE org_id=NEW.org_id AND journal_entry_id=NEW.id;
        IF line_count < 2 OR ROW(td,tc,fd,fc) IS DISTINCT FROM ROW(NEW.transaction_debit_total,
           NEW.transaction_credit_total,NEW.functional_debit_total,NEW.functional_credit_total)
           OR td<>tc OR fd<>fc OR EXISTS (
             SELECT 1 FROM finance.journal_lines WHERE org_id=NEW.org_id AND journal_entry_id=NEW.id
              AND (functional_debit<>round(transaction_debit*NEW.fx_rate,2)
                   OR functional_credit<>round(transaction_credit*NEW.fx_rate,2))) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='journal lines do not exactly balance and reconcile to header/fx';
        END IF;
        IF NEW.reversal_of_journal_entry_id IS NOT NULL THEN
            SELECT * INTO original FROM finance.journal_entries WHERE org_id=NEW.org_id AND id=NEW.reversal_of_journal_entry_id FOR UPDATE;
            IF NOT FOUND OR original.status<>'posted' OR original.transaction_currency<>NEW.transaction_currency
               OR original.functional_currency<>NEW.functional_currency OR original.fx_rate<>NEW.fx_rate
               OR EXISTS (SELECT 1 FROM finance.journal_lines AS old_line FULL JOIN finance.journal_lines AS new_line
                    ON new_line.org_id=NEW.org_id AND new_line.journal_entry_id=NEW.id AND new_line.line_number=old_line.line_number
                   WHERE old_line.org_id=NEW.org_id AND old_line.journal_entry_id=original.id
                     AND (new_line.id IS NULL OR ROW(new_line.account_id,new_line.branch_id,new_line.party_id,new_line.transaction_debit,new_line.transaction_credit,new_line.functional_debit,new_line.functional_credit)
                       IS DISTINCT FROM ROW(old_line.account_id,old_line.branch_id,old_line.party_id,old_line.transaction_credit,old_line.transaction_debit,old_line.functional_credit,old_line.functional_debit)))
               OR (SELECT count(*) FROM finance.journal_lines WHERE org_id=NEW.org_id AND journal_entry_id=NEW.id)
                  <> (SELECT count(*) FROM finance.journal_lines WHERE org_id=NEW.org_id AND journal_entry_id=original.id) THEN
                RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='journal reversal is not an exact sign inversion';
            END IF;
            UPDATE finance.journal_entries SET status='reversed' WHERE org_id=original.org_id AND id=original.id;
        END IF;
    END IF;
    IF TG_OP='UPDATE' AND NEW.status='reversed' AND OLD.status<>'reversed'
       AND NOT EXISTS (SELECT 1 FROM finance.journal_entries AS reversal WHERE reversal.org_id=NEW.org_id
                        AND reversal.reversal_of_journal_entry_id=NEW.id AND reversal.status='posted') THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='journal can be reversed only by a posted compensating journal';
    END IF;
    RETURN NEW;
END
""",
        ),
        _trigger("journal_entries_guard_ct", "INSERT OR UPDATE OR DELETE", "finance.journal_entries", "guard_journal_entry"),
    ]

    definitions["finance.journal_lines:journal_lines_cross_row_guard"] = [
        *_function(
            "guard_journal_line",
            """
DECLARE parent_status text;
BEGIN
    SELECT status INTO parent_status FROM finance.journal_entries
     WHERE org_id=COALESCE(NEW.org_id,OLD.org_id) AND id=COALESCE(NEW.journal_entry_id,OLD.journal_entry_id) FOR UPDATE;
    IF NOT FOUND AND TG_OP='DELETE' THEN RETURN OLD; END IF;
    IF parent_status IS DISTINCT FROM 'draft' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='journal lines may change only while parent is draft';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END
""",
        ),
        _trigger("journal_lines_guard_ct", "INSERT OR UPDATE OR DELETE", "finance.journal_lines", "guard_journal_line"),
    ]

    definitions["finance.open_items:open_items_cross_row_guard"] = [
        *_function(
            "guard_open_item",
            """
DECLARE allocated numeric(20,2); event_journal_status text;
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='open items are retained'; END IF;
    IF TG_OP='INSERT' AND (NEW.status<>'open' OR NEW.settled_at IS NOT NULL OR NEW.reversed_at IS NOT NULL) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='new open item must start open';
    END IF;
    IF TG_OP='UPDATE' AND ROW(NEW.accounting_event_id,NEW.party_id,NEW.item_side,NEW.currency_code,
       NEW.principal_amount,NEW.functional_principal_amount) IS DISTINCT FROM ROW(OLD.accounting_event_id,
       OLD.party_id,OLD.item_side,OLD.currency_code,OLD.principal_amount,OLD.functional_principal_amount) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='open item financial facts are immutable';
    END IF;
    SELECT coalesce(sum(a.amount),0) INTO allocated FROM finance.allocations AS a
     WHERE a.org_id=NEW.org_id AND a.open_item_id=NEW.id AND a.status='posted'
       AND NOT EXISTS (SELECT 1 FROM finance.allocations AS r WHERE r.org_id=a.org_id AND r.reversal_of_allocation_id=a.id);
    IF allocated>NEW.principal_amount OR (NEW.status='settled') IS DISTINCT FROM (allocated=NEW.principal_amount) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='open item status does not match active allocation total';
    END IF;
    IF NEW.status='reversed' THEN
        SELECT journal.status INTO event_journal_status FROM finance.accounting_events AS event
        JOIN finance.journal_entries AS journal ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id
        WHERE event.org_id=NEW.org_id AND event.id=NEW.accounting_event_id;
        IF event_journal_status IS DISTINCT FROM 'reversed' THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='open item reversal requires a reversed source journal';
        END IF;
    END IF;
    RETURN NEW;
END
""",
        ),
        _trigger("open_items_guard_ct", "INSERT OR UPDATE OR DELETE", "finance.open_items", "guard_open_item"),
    ]

    definitions["finance.allocations:allocations_cross_row_guard"] = [
        *_function(
            "guard_allocation",
            """
DECLARE item finance.open_items%ROWTYPE; payment finance.payments%ROWTYPE; withholding tax.withholdings%ROWTYPE;
        adjustment finance.adjustment_notes%ROWTYPE; advance procurement.purchase_order_advance_allocations%ROWTYPE;
        original finance.allocations%ROWTYPE; allocated numeric(20,2); source_allocated numeric(20,2);
BEGIN
    IF TG_OP<>'INSERT' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='allocations are append-only'; END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.org_id::text||NEW.open_item_id::text,671002));
    SELECT * INTO item FROM finance.open_items WHERE org_id=NEW.org_id AND id=NEW.open_item_id FOR UPDATE;
    IF NOT FOUND OR item.status='reversed' OR item.currency_code<>NEW.currency_code THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='allocation requires a compatible live open item';
    END IF;
    IF NEW.reversal_of_allocation_id IS NOT NULL THEN
        SELECT * INTO original FROM finance.allocations WHERE org_id=NEW.org_id AND id=NEW.reversal_of_allocation_id FOR UPDATE;
        IF NOT FOUND OR original.status<>'posted' OR ROW(NEW.payment_id,NEW.withholding_id,NEW.adjustment_note_id,NEW.purchase_order_advance_allocation_id,NEW.open_item_id,
           NEW.currency_code,NEW.amount,NEW.functional_amount,NEW.fx_rate) IS DISTINCT FROM ROW(original.payment_id,
           original.withholding_id,original.adjustment_note_id,original.purchase_order_advance_allocation_id,original.open_item_id,original.currency_code,original.amount,original.functional_amount,original.fx_rate) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='allocation reversal must copy the original settlement facts';
        END IF;
        IF original.adjustment_note_id IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment allocation reversal requires the reviewed compensating-note command';
        END IF;
    ELSIF NEW.payment_id IS NOT NULL THEN
        SELECT * INTO payment FROM finance.payments WHERE org_id=NEW.org_id AND id=NEW.payment_id FOR UPDATE;
        IF NOT FOUND OR payment.status<>'posted' OR payment.party_id<>item.party_id OR payment.currency_code<>item.currency_code
           OR (payment.direction='receipt') IS DISTINCT FROM (item.item_side='receivable') THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='payment is incompatible with open item';
        END IF;
        SELECT coalesce(sum(a.amount),0) INTO source_allocated FROM finance.allocations AS a
         WHERE a.org_id=NEW.org_id AND a.payment_id=NEW.payment_id AND a.status='posted'
           AND NOT EXISTS (SELECT 1 FROM finance.allocations r WHERE r.org_id=a.org_id AND r.reversal_of_allocation_id=a.id);
        IF source_allocated>payment.amount THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='payment over-allocation'; END IF;
    ELSIF NEW.adjustment_note_id IS NOT NULL THEN
        SELECT * INTO adjustment FROM finance.adjustment_notes WHERE org_id=NEW.org_id AND id=NEW.adjustment_note_id FOR UPDATE;
        IF NOT FOUND OR adjustment.status<>'posted' OR adjustment.adjusts_open_item_id<>item.id
           OR adjustment.party_id<>item.party_id OR adjustment.currency_code<>item.currency_code THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment note is incompatible with open item';
        END IF;
        SELECT coalesce(sum(a.amount),0) INTO source_allocated FROM finance.allocations AS a
         WHERE a.org_id=NEW.org_id AND a.adjustment_note_id=NEW.adjustment_note_id AND a.status='posted'
           AND NOT EXISTS (SELECT 1 FROM finance.allocations r WHERE r.org_id=a.org_id AND r.reversal_of_allocation_id=a.id);
        IF source_allocated>adjustment.counterparty_payable_amount THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment note over-allocation';
        END IF;
    ELSIF NEW.purchase_order_advance_allocation_id IS NOT NULL THEN
        SELECT * INTO advance FROM procurement.purchase_order_advance_allocations
         WHERE org_id=NEW.org_id AND id=NEW.purchase_order_advance_allocation_id FOR UPDATE;
        IF NOT FOUND OR advance.status<>'posted' OR item.item_side<>'payable' OR item.currency_code<>'INR'
           OR NOT EXISTS(SELECT 1 FROM parties.supplier_accounts supplier WHERE supplier.org_id=NEW.org_id
                         AND supplier.id=advance.supplier_account_id AND supplier.party_id=item.party_id) THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier advance is incompatible with payable';
        END IF;
        SELECT coalesce(sum(a.amount),0) INTO source_allocated FROM finance.allocations a
         WHERE a.org_id=NEW.org_id AND a.purchase_order_advance_allocation_id=advance.id AND a.status='posted'
           AND NOT EXISTS(SELECT 1 FROM finance.allocations r WHERE r.org_id=a.org_id AND r.reversal_of_allocation_id=a.id);
        IF source_allocated>advance.gross_advance_amount THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier advance over-application'; END IF;
    ELSE
        SELECT * INTO withholding FROM tax.withholdings WHERE org_id=NEW.org_id AND id=NEW.withholding_id FOR UPDATE;
        IF NOT FOUND OR withholding.status<>'deducted' OR withholding.open_item_id<>item.id
           OR withholding.counterparty_party_id<>item.party_id OR withholding.currency_code<>item.currency_code
           OR NEW.amount<>withholding.withheld_amount THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='withholding is incompatible with open item';
        END IF;
    END IF;
    SELECT coalesce(sum(a.amount),0) INTO allocated FROM finance.allocations AS a
     WHERE a.org_id=NEW.org_id AND a.open_item_id=NEW.open_item_id AND a.status='posted'
       AND NOT EXISTS (SELECT 1 FROM finance.allocations r WHERE r.org_id=a.org_id AND r.reversal_of_allocation_id=a.id);
    IF NEW.reversal_of_allocation_id IS NULL AND allocated>item.principal_amount THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='open item over-allocation';
    END IF;
    RETURN NEW;
END
""",
        ),
        'CREATE CONSTRAINT TRIGGER "allocations_guard_ct" AFTER INSERT OR UPDATE OR DELETE ON '
        '"finance"."allocations" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION '
        '"erp_finance_invariants"."guard_allocation"()',
    ]

    definitions["finance.bank_statements:bank_statements_cross_row_guard"] = [
        *_function(
            "guard_bank_statement",
            """
DECLARE calculated numeric(20,2);
BEGIN
    IF TG_OP='DELETE' AND OLD.status IN ('reconciled','closed') THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='closed bank statement is immutable'; END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    IF TG_OP='UPDATE' AND OLD.status IN ('reconciled','closed') AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='reconciled bank statement is immutable';
    END IF;
    IF NEW.status IN ('reconciled','closed') THEN
        SELECT NEW.opening_balance+coalesce(sum(CASE direction WHEN 'credit' THEN amount ELSE -amount END),0)
          INTO calculated FROM finance.bank_statement_lines WHERE org_id=NEW.org_id AND bank_statement_id=NEW.id;
        IF calculated<>NEW.closing_balance THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='bank statement balance does not reconcile'; END IF;
    END IF;
    RETURN NEW;
END
""",
        ),
        _trigger("bank_statements_guard_ct", "UPDATE OR DELETE", "finance.bank_statements", "guard_bank_statement"),
    ]

    definitions["finance.reconciliation_matches:reconciliation_matches_cross_row_guard"] = [
        *_function(
            "guard_reconciliation_match",
            """
DECLARE statement_line_amount numeric(20,2); bank_ledger_id uuid; statement_currency char(3);
        journal finance.journal_entries%ROWTYPE; journal_bank_amount numeric(20,2); journal_bank_line_count bigint;
        line_matched numeric(20,2); journal_matched numeric(20,2); original finance.reconciliation_matches%ROWTYPE;
BEGIN
    IF TG_OP<>'INSERT' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='reconciliation matches are append-only'; END IF;
    SELECT line.amount,bank.account_id,statement.currency_code INTO statement_line_amount,bank_ledger_id,statement_currency
      FROM finance.bank_statement_lines line JOIN finance.bank_statements statement ON statement.org_id=line.org_id AND statement.id=line.bank_statement_id
      JOIN finance.bank_accounts bank ON bank.org_id=statement.org_id AND bank.id=statement.bank_account_id
     WHERE line.org_id=NEW.org_id AND line.id=NEW.bank_statement_line_id FOR UPDATE OF line,statement;
    SELECT * INTO journal FROM finance.journal_entries WHERE org_id=NEW.org_id AND id=NEW.journal_entry_id FOR UPDATE;
    SELECT count(*),coalesce(sum(transaction_debit+transaction_credit),0) INTO journal_bank_line_count,journal_bank_amount FROM finance.journal_lines
     WHERE org_id=NEW.org_id AND journal_entry_id=NEW.journal_entry_id AND account_id=bank_ledger_id;
    IF journal.status IS DISTINCT FROM 'posted' OR NEW.currency_code<>statement_currency OR NEW.currency_code<>journal.transaction_currency
       OR journal_bank_line_count<>1 OR journal_bank_amount=0 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='match requires the posted bank ledger in the statement currency';
    END IF;
    IF NEW.reversal_of_match_id IS NOT NULL THEN
        SELECT * INTO original FROM finance.reconciliation_matches WHERE org_id=NEW.org_id AND id=NEW.reversal_of_match_id FOR UPDATE;
        IF NOT FOUND OR original.status<>'matched' OR ROW(NEW.bank_statement_line_id,NEW.journal_entry_id,NEW.matched_amount,NEW.currency_code)
           IS DISTINCT FROM ROW(original.bank_statement_line_id,original.journal_entry_id,original.matched_amount,original.currency_code) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='match reversal must copy original facts';
        END IF;
    ELSE
        SELECT coalesce(sum(m.matched_amount),0) INTO line_matched FROM finance.reconciliation_matches m WHERE m.org_id=NEW.org_id AND m.bank_statement_line_id=NEW.bank_statement_line_id AND m.status='matched' AND NOT EXISTS (SELECT 1 FROM finance.reconciliation_matches r WHERE r.org_id=m.org_id AND r.reversal_of_match_id=m.id);
        SELECT coalesce(sum(m.matched_amount),0) INTO journal_matched FROM finance.reconciliation_matches m WHERE m.org_id=NEW.org_id AND m.journal_entry_id=NEW.journal_entry_id AND m.status='matched' AND NOT EXISTS (SELECT 1 FROM finance.reconciliation_matches r WHERE r.org_id=m.org_id AND r.reversal_of_match_id=m.id);
        IF line_matched>statement_line_amount OR journal_matched>journal_bank_amount THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='reconciliation match exceeds an owner amount';
        END IF;
    END IF;
    RETURN NEW;
END
""",
        ),
        _trigger("reconciliation_matches_guard_ct", "INSERT OR UPDATE OR DELETE", "finance.reconciliation_matches", "guard_reconciliation_match"),
    ]

    definitions["tax.registrations:registrations_cross_row_guard"] = [
        """ALTER TABLE "tax"."registrations"
ADD CONSTRAINT "registrations_gstin_period_excl"
EXCLUDE USING gist (
    org_id WITH =,
    gstin WITH =,
    daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
) WHERE (status = 'active')""",
        *_function(
            "guard_tax_registration_identity",
            """
BEGIN
    IF TG_OP='DELETE' AND EXISTS (SELECT 1 FROM tax.documents WHERE org_id=OLD.org_id AND registration_id=OLD.id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='referenced tax registration cannot be deleted';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    IF TG_OP='UPDATE' AND EXISTS (SELECT 1 FROM tax.documents WHERE org_id=OLD.org_id AND registration_id=OLD.id)
       AND ROW(NEW.gstin,NEW.legal_name,NEW.state_code,NEW.registration_type,
               NEW.business_vertical_code,NEW.effective_from,NEW.effective_to)
       IS DISTINCT FROM ROW(OLD.gstin,OLD.legal_name,OLD.state_code,OLD.registration_type,
               OLD.business_vertical_code,OLD.effective_from,OLD.effective_to) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted tax registration identity is immutable';
    END IF;
    RETURN NEW;
END
""",
        ),
        _trigger("tax_registrations_identity_ct", "UPDATE OR DELETE", "tax.registrations", "guard_tax_registration_identity"),
    ]

    definitions["tax.tax_code_versions:tax_code_versions_cross_row_guard"] = [
        """ALTER TABLE "tax"."tax_code_versions"
ADD CONSTRAINT "tax_code_versions_period_excl"
EXCLUDE USING gist (
    code WITH =,
    daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
) WHERE (status = 'active')""",
        *_function(
            "guard_tax_code_version",
            """
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='deployed tax code versions are retained'; END IF;
    IF ROW(NEW.code,NEW.code_kind,NEW.version,NEW.description,NEW.effective_from,NEW.effective_to,
           NEW.taxability,NEW.default_supply_type,NEW.cgst_rate,NEW.sgst_rate,NEW.igst_rate,NEW.cess_rate,
           NEW.ruleset_version,NEW.created_at)
       IS DISTINCT FROM ROW(OLD.code,OLD.code_kind,OLD.version,OLD.description,OLD.effective_from,OLD.effective_to,
           OLD.taxability,OLD.default_supply_type,OLD.cgst_rate,OLD.sgst_rate,OLD.igst_rate,OLD.cess_rate,
           OLD.ruleset_version,OLD.created_at)
       OR OLD.status='retired' OR NEW.status NOT IN ('active','retired') THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='deployed tax code version is immutable except active-to-retired transition';
    END IF;
    RETURN NEW;
END
""",
        ),
        _trigger("tax_code_versions_immutable_ct", "UPDATE OR DELETE", "tax.tax_code_versions", "guard_tax_code_version"),
    ]

    definitions["tax.return_periods:return_periods_cross_row_guard"] = [
        """ALTER TABLE "tax"."return_periods"
ADD CONSTRAINT "return_periods_period_excl"
EXCLUDE USING gist (
    org_id WITH =,
    registration_id WITH =,
    daterange(period_start, period_end, '[]') WITH &&
)""",
        *_function(
            "guard_return_period",
            """
BEGIN
    IF TG_OP='DELETE' AND OLD.status<>'open' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='locked return period is retained'; END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    IF TG_OP='UPDATE' AND OLD.status='filed' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='filed return period is immutable';
    END IF;
    IF NEW.status='filed' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'filed')
       AND NOT EXISTS (SELECT 1 FROM tax.returns WHERE org_id=NEW.org_id AND return_period_id=NEW.id AND status='filed') THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='period can be filed only by a filed return';
    END IF;
    RETURN NEW;
END
""",
        ),
        _trigger("return_periods_guard_ct", "UPDATE OR DELETE", "tax.return_periods", "guard_return_period"),
    ]

    definitions["tax.returns:returns_cross_row_guard"] = [
        *_function(
            "guard_tax_return",
            """
DECLARE totals record; attachment_hash bytea; attachment_verified timestamptz; previous tax.returns%ROWTYPE;
BEGIN
    IF TG_OP='DELETE' AND OLD.status<>'draft' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='non-draft return is retained'; END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    IF TG_OP='UPDATE' AND OLD.status IN ('filed','superseded') THEN
        IF NOT (OLD.status='filed' AND NEW.status='superseded'
           AND EXISTS (SELECT 1 FROM tax.returns r WHERE r.org_id=OLD.org_id AND r.previous_return_id=OLD.id AND r.status='filed'))
           OR ROW(NEW.return_period_id,NEW.return_type,NEW.revision,NEW.previous_return_id,NEW.taxable_amount,
                  NEW.cgst_amount,NEW.sgst_amount,NEW.igst_amount,NEW.cess_amount,NEW.liability_amount,
                  NEW.payload_attachment_id,NEW.payload_sha256,NEW.arn,NEW.filed_at,NEW.filed_by_membership_id)
              IS DISTINCT FROM ROW(OLD.return_period_id,OLD.return_type,OLD.revision,OLD.previous_return_id,OLD.taxable_amount,
                  OLD.cgst_amount,OLD.sgst_amount,OLD.igst_amount,OLD.cess_amount,OLD.liability_amount,
                  OLD.payload_attachment_id,OLD.payload_sha256,OLD.arn,OLD.filed_at,OLD.filed_by_membership_id) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='filed return and membership snapshot are immutable';
        END IF;
    END IF;
    IF NEW.status IN ('validated','filed') THEN
        SELECT coalesce(sum(CASE document.document_effect WHEN 'decrease' THEN -document.gst_taxable_value ELSE document.gst_taxable_value END),0) taxable,
               coalesce(sum(CASE document.document_effect WHEN 'decrease' THEN -document.cgst_amount ELSE document.cgst_amount END),0) cgst,
               coalesce(sum(CASE document.document_effect WHEN 'decrease' THEN -document.sgst_amount ELSE document.sgst_amount END),0) sgst,
               coalesce(sum(CASE document.document_effect WHEN 'decrease' THEN -document.igst_amount ELSE document.igst_amount END),0) igst,
               coalesce(sum(CASE document.document_effect WHEN 'decrease' THEN -document.cess_amount ELSE document.cess_amount END),0) cess
          INTO totals FROM tax.return_documents membership JOIN tax.documents document
            ON document.org_id=membership.org_id AND document.id=membership.tax_document_id
         WHERE membership.org_id=NEW.org_id AND membership.return_id=NEW.id;
        IF ROW(NEW.taxable_amount,NEW.cgst_amount,NEW.sgst_amount,NEW.igst_amount,NEW.cess_amount,NEW.liability_amount)
           IS DISTINCT FROM ROW(totals.taxable,totals.cgst,totals.sgst,totals.igst,totals.cess,
                                totals.cgst+totals.sgst+totals.igst+totals.cess) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return totals do not match exact member documents';
        END IF;
    END IF;
    IF NEW.previous_return_id IS NOT NULL THEN
        SELECT * INTO previous FROM tax.returns WHERE org_id=NEW.org_id AND id=NEW.previous_return_id FOR UPDATE;
        IF NOT FOUND OR previous.return_period_id<>NEW.return_period_id OR previous.return_type<>NEW.return_type
           OR NEW.revision<>previous.revision+1 THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return revision lineage is invalid';
        END IF;
    END IF;
    IF NEW.status='filed' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'filed') THEN
        SELECT sha256,verified_at INTO attachment_hash,attachment_verified FROM core.attachments
         WHERE org_id=NEW.org_id AND id=NEW.payload_attachment_id FOR SHARE;
        IF attachment_verified IS NULL OR attachment_hash IS DISTINCT FROM NEW.payload_sha256 THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='filed return payload hash is not verified evidence';
        END IF;
        UPDATE tax.return_periods SET status='filed',locked_at=COALESCE(locked_at,NEW.filed_at),
               locked_by_membership_id=COALESCE(locked_by_membership_id,NEW.filed_by_membership_id)
         WHERE org_id=NEW.org_id AND id=NEW.return_period_id;
        IF NEW.previous_return_id IS NOT NULL THEN
            UPDATE tax.returns SET status='superseded' WHERE org_id=NEW.org_id AND id=NEW.previous_return_id;
        END IF;
    END IF;
    RETURN NEW;
END
""",
        ),
        _trigger("returns_guard_ct", "INSERT OR UPDATE OR DELETE", "tax.returns", "guard_tax_return"),
        *_function(
            "guard_frozen_return_membership",
            """
DECLARE parent_status text;
BEGIN
    SELECT status INTO parent_status FROM tax.returns
     WHERE org_id=COALESCE(NEW.org_id,OLD.org_id) AND id=COALESCE(NEW.return_id,OLD.return_id) FOR UPDATE;
    IF parent_status IS DISTINCT FROM 'draft' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return membership may change only while return is draft';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END
""",
        ),
        _trigger("returns_membership_freeze_ct", "INSERT OR UPDATE OR DELETE", "tax.return_documents", "guard_frozen_return_membership"),
    ]

    definitions["compliance.licenses:licenses_cross_row_guard"] = [
        """ALTER TABLE "compliance"."licenses"
ADD CONSTRAINT "licenses_active_period_excl"
EXCLUDE USING gist (
    org_id WITH =,
    license_type_code WITH =,
    issuing_authority WITH =,
    (CASE WHEN organization_subject_id IS NOT NULL THEN 'organization'
          WHEN branch_id IS NOT NULL THEN 'branch'
          WHEN membership_id IS NOT NULL THEN 'membership'
          WHEN employee_id IS NOT NULL THEN 'employee'
          ELSE 'party' END) WITH =,
    COALESCE(organization_subject_id,branch_id,membership_id,employee_id,party_id) WITH =,
    daterange(valid_from, COALESCE(valid_until, 'infinity'::date), '[]') WITH &&
) WHERE (status = 'active')""",
        *_function(
            "guard_license",
            """
DECLARE attachment_verified timestamptz;
BEGIN
    IF TG_OP='DELETE' AND OLD.status<>'pending' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='verified license evidence is retained'; END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    IF TG_OP='UPDATE' AND OLD.status IN ('active','suspended','expired','revoked') AND ROW(
       NEW.organization_subject_id,NEW.branch_id,NEW.membership_id,NEW.employee_id,NEW.party_id,
       NEW.license_type_code,NEW.license_number,NEW.issuing_authority,NEW.jurisdiction_code,
       NEW.issued_on,NEW.valid_from,NEW.valid_until,NEW.evidence_attachment_id,NEW.verified_at,NEW.verified_by_membership_id
    ) IS DISTINCT FROM ROW(
       OLD.organization_subject_id,OLD.branch_id,OLD.membership_id,OLD.employee_id,OLD.party_id,
       OLD.license_type_code,OLD.license_number,OLD.issuing_authority,OLD.jurisdiction_code,
       OLD.issued_on,OLD.valid_from,OLD.valid_until,OLD.evidence_attachment_id,OLD.verified_at,OLD.verified_by_membership_id
    ) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='activated license subject and evidence are immutable'; END IF;
    IF TG_OP='UPDATE' AND ((OLD.status='pending' AND NEW.status NOT IN ('pending','active','revoked'))
       OR (OLD.status='active' AND NEW.status NOT IN ('active','suspended','expired','revoked'))
       OR (OLD.status='suspended' AND NEW.status NOT IN ('suspended','active','expired','revoked'))
       OR (OLD.status IN ('expired','revoked') AND NEW.status<>OLD.status)) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invalid license lifecycle transition';
    END IF;
    IF NEW.status='active' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
        SELECT verified_at INTO attachment_verified FROM core.attachments
         WHERE org_id=NEW.org_id AND id=NEW.evidence_attachment_id FOR SHARE;
        IF attachment_verified IS NULL THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='active license requires verified evidence';
        END IF;
    END IF;
    RETURN NEW;
END
""",
        ),
        _trigger("licenses_guard_ct", "INSERT OR UPDATE OR DELETE", "compliance.licenses", "guard_license"),
    ]

    definitions["compliance.recalls:recalls_cross_row_guard"] = [
        *_function(
            "guard_recall",
            """
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='recall evidence is retained'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IN ('closed','cancelled') AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='terminal recall is immutable';
    END IF;
    IF NEW.status='closed' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'closed') AND (
       NOT EXISTS (SELECT 1 FROM compliance.recall_batches WHERE org_id=NEW.org_id AND recall_id=NEW.id)
       OR EXISTS (SELECT 1 FROM compliance.recall_batches WHERE org_id=NEW.org_id AND recall_id=NEW.id
            AND (status NOT IN ('recovered','destroyed','released')
                 OR recovered_quantity+destroyed_quantity+released_quantity<>affected_quantity))) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='recall cannot close before every batch is terminal and quantity-reconciled';
    END IF;
    IF NEW.status='cancelled' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'cancelled')
       AND EXISTS (SELECT 1 FROM compliance.recall_batches WHERE org_id=NEW.org_id AND recall_id=NEW.id
          AND (quarantined_quantity>0 OR recovered_quantity>0 OR destroyed_quantity>0)) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='acted-on recall cannot be cancelled';
    END IF;
    RETURN NEW;
END
""",
        ),
        _trigger("recalls_guard_ct", "UPDATE OR DELETE", "compliance.recalls", "guard_recall"),
    ]

    return definitions


BLOCKED_REASONS = {
    "compliance.controlled_movement_rule_versions:controlled_movement_rule_versions_release_authority": "Exact reviewed official rule releases require the isolated regulatory importer.",
    "compliance.storage_rule_versions:storage_rule_versions_effective_guard": "Effective non-overlap and evidence-bound activation require the compliance command boundary.",
    "tax.tax_code_versions:tax_code_versions_release_authority": "Tax-code release import and supersession belong to the reference-data release authority; this finance invariant fragment must not create a second writer.",
    "finance.accounting_events:accounting_events_cross_row_guard": "Several typed sources remain mutable until their reviewed posting/reversal commands exist, so a trigger could verify current posted status but could not prove the source is immutable after event insertion.",
    "finance.adjustment_note_lines:adjustment_note_lines_cross_row_guard": "The canonical Decimal calculator is application code; no reviewed SQL calculator or posting command persists proof that the exact ruleset was executed.",
    "finance.adjustment_notes:adjustment_notes_cross_row_guard": "No reviewed posting/reversal command atomically invokes the Decimal authority and creates the tax document, journal, accounting event, and bounded compensating note.",
    "finance.bank_statement_lines:bank_statement_lines_cross_row_guard": "The schema has no verified-import command or transaction marker proving that every line was inserted by the same authenticated parser transaction.",
    "finance.expense_claim_lines:expense_claim_lines_cross_row_guard": "The schema has no effective-dated evidence policy identifying which expense lines require receipts.",
    "finance.expense_claims:expense_claims_cross_row_guard": "The schema has no reviewed approver authorization predicate or account-mapping command for atomic journal creation.",
    "finance.payments:payments_cross_row_guard": "No reviewed payment posting/reversal command supplies ledger account mappings and atomically creates the journal, event, and allocation reversals.",
    "tax.documents:documents_cross_row_guard": "There is no reviewed tax-document posting command that binds source line snapshots, registration context, cumulative adjustments, and the canonical Decimal result atomically.",
    "tax.einvoices:einvoices_cross_row_guard": "PostgreSQL cryptographic byte hashing is not provisioned by the canonical platform contract, and no provider-command boundary exists to prove exact request/response/QR envelopes and append-only cancellation evidence.",
    "tax.einvoice_rule_versions:einvoice_rule_versions_release_authority": "Exact reviewed official rule releases require the isolated regulatory importer.",
    "tax.eway_bills:eway_bills_cross_row_guard": "PostgreSQL cryptographic byte hashing is not provisioned by the canonical platform contract, and no provider-command boundary exists to prove exact request/response envelopes and append-only cancellation evidence.",
    "tax.gst_adjustment_rule_versions:gst_adjustment_rule_versions_release_authority": "Exact reviewed official rule releases require the isolated regulatory importer.",
    "tax.registration_branches:registration_branches_effective_guard": "Effective branch associations and immutable statutory use require a reviewed registration command and posting lookup.",
    "tax.portal_document_lines:portal_document_lines_cross_row_guard": "The schema has no parser command or transaction marker proving every line is inserted exactly once inside the parent parse transaction.",
    "tax.portal_documents:portal_documents_cross_row_guard": "Attachment equality and terminal immutability are enforceable, but no parser command can prove all parsed lines were inserted atomically before publishing the terminal state.",
    "tax.reconciliation_items:reconciliation_items_cross_row_guard": "The schema has no reviewed resolution authorization predicate or canonical audit-event command binding a one-time resolution.",
    "tax.reconciliation_runs:reconciliation_runs_cross_row_guard": "A row trigger cannot prove repeatable-read isolation, complete population coverage, or one atomic reconciliation algorithm execution without a reviewed stored command.",
    "tax.return_documents:return_documents_cross_row_guard": "Return-type eligibility is a versioned statutory rule but no effective-dated eligibility ruleset is stored; inventing a timeless mapping would be unsafe.",
    "tax.tax_code_versions:tax_code_versions_release_authority": "A row constraint cannot verify official source and canonical dataset artifacts, typed review, exact-set insertion, or atomic whole-release supersession; the isolated regulatory import command owns this authority.",
    "tax.withholdings:withholdings_cross_row_guard": "The typed rule and basis model exists, but no reviewed command yet proves exact imported-rule selection, earlier-event timing, cumulative threshold basis, journal/allocation creation, and corrective reversal.",
    "tax.withholding_rule_versions:withholding_rule_versions_release_authority": "The typed rule table exists, but the regulated importer does not yet parse and atomically activate exact withholding_rules releases.",
    "tax.organization_fiscal_tax_facts:organization_fiscal_tax_facts_evidence_guard": "A reviewed verification command is required to bind immutable turnover, TAN and notified-deductor facts to verified evidence.",
    "tax.withholding_basis_lines:withholding_basis_lines_source_guard": "Exact source basis and cumulative threshold rows must be inserted atomically by the withholding deduction command.",
    "tax.withholding_deposits:withholding_deposits_cross_row_guard": "A reviewed command must bind one exact posted government payment and verified challan to immutable deduction allocations and compensating reversal.",
    "tax.withholding_deposit_lines:withholding_deposit_lines_cross_row_guard": "Deposit allocation components and cumulative deduction residuals require one locked deposit command.",
    "tax.withholding_statements:withholding_statements_cross_row_guard": "A reviewed filing command must freeze one exact statement population, acknowledgement and append-only revision lineage.",
    "tax.withholding_statement_lines:withholding_statement_lines_cross_row_guard": "Statement membership and deposit coverage require locked authority verification.",
    "tax.withholding_certificates:withholding_certificates_cross_row_guard": "A reviewed certificate importer must verify and retain one immutable per-deductee authority artifact and correction lineage.",
    "tax.withholding_certificate_lines:withholding_certificate_lines_cross_row_guard": "Certificate M:N coverage requires exact statement-line, party, regime, period and amount verification.",
    "compliance.controlled_substance_entries:controlled_substance_entries_cross_row_guard": "The license vocabulary does not represent all NDPS/controlled-substance authorities or effective applicability rules, so counterparty authorization cannot be proved for every controlled batch.",
    "compliance.destructions:destructions_cross_row_guard": "The approval record stores no approved batch/quantity snapshot, so posted destruction lines cannot be compared with the authorization.",
    "compliance.recall_batches:recall_batches_cross_row_guard": "Recall-tagged inventory documents are typed, but exact exposure snapshots and posted-ledger action totals require the reviewed compliance command boundary.",
    "compliance.temperature_readings:temperature_readings_cross_row_guard": "A reading without batch_id has no product/storage-rule reference, and no effective-dated location storage rule exists; permitted range resolution cannot be proved for every row.",
}


def generated_artifacts() -> tuple[str, str]:
    invariants = _load_invariants()
    definitions = _definitions()
    unknown = sorted(set(definitions) - set(invariants))
    missing = sorted(set(invariants) - set(definitions) - set(BLOCKED_REASONS))
    stale = sorted(set(BLOCKED_REASONS) - set(invariants))
    if unknown or missing or stale:
        raise ContractError(f"finance invariant disposition mismatch: unknown={unknown}, missing={missing}, stale={stale}")
    entries: list[dict[str, Any]] = []
    for key in sorted(definitions):
        invariant = invariants[key]
        entries.append({
            "table": invariant["table"], "invariant": invariant["invariant"],
            "enforcement": invariant["enforcement"],
            "requirement_sha256": hashlib.sha256(invariant["rule"].encode()).hexdigest(),
            "reviewed": True, "statements": definitions[key],
        })
    mapping = {"mapping_version": "1.0.0", "enforcements": entries, "platform_enforcements": []}
    mapping_text = json.dumps(mapping, indent=2, sort_keys=True) + "\n"
    catalog_payload = {key: {"enforcement": value["enforcement"], "rule": value["rule"]} for key, value in sorted(invariants.items())}
    manifest = {
        "manifest_version": "1.0.0", "postgresql": "15+", "domains": list(DOMAINS),
        "catalog_invariant_sha256": hashlib.sha256(json.dumps(catalog_payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
        "mapping_file": MAPPING_PATH.name, "mapping_sha256": hashlib.sha256(mapping_text.encode()).hexdigest(),
        "resolved_count": len(definitions), "resolved_invariants": sorted(definitions),
        "blocked_count": len(BLOCKED_REASONS),
        "blocked_invariants": {key: {"reason": BLOCKED_REASONS[key]} for key in sorted(BLOCKED_REASONS)},
        "security": {"function_schema": FUNCTION_SCHEMA, "dynamic_sql": False, "fixed_empty_search_path": True,
                     "trigger_functions_public_execute": False, "runtime_callable_functions": []},
    }
    return mapping_text, json.dumps(manifest, indent=2, sort_keys=True) + "\n"


def main() -> int:
    mapping_text, manifest_text = generated_artifacts()
    MAPPING_PATH.write_text(mapping_text, encoding="utf-8")
    MANIFEST_PATH.write_text(manifest_text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
