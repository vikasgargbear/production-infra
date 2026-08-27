"""Execute a compensating adjustment-note reversal on disposable PostgreSQL 15."""

from __future__ import annotations

import importlib.util
import os
from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "_count_lifecycle_fixture",
    HERE / "check_canonical_inventory_adjustment_lifecycle_runtime_role.py",
)
assert SPEC and SPEC.loader
COUNT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(COUNT)

ORG, BRANCH, ACTOR, AUTH = COUNT.ORG, COUNT.BRANCH, COUNT.REQUESTER, COUNT.REQUESTER_AUTH
SOURCE_INVOICE = UUID("e3000000-0000-7000-8000-000000000090")
SOURCE_NOTE = UUID("e3000000-0000-7000-8000-000000000091")
SOURCE_NOTE_LINE = UUID("e3000000-0000-7000-8000-000000000092")
SOURCE_JOURNAL = UUID("e3000000-0000-7000-8000-000000000093")
SOURCE_EVENT = UUID("e3000000-0000-7000-8000-000000000094")
REVERSAL_NOTE = UUID("e3000000-0000-7000-8000-000000000095")
REVERSAL_JOURNAL = UUID("e3000000-0000-7000-8000-000000000096")
REVERSAL_EVENT = UUID("e3000000-0000-7000-8000-000000000097")
CUSTOMER_PARTY = UUID("e3000000-0000-7000-8000-0000000000a0")
CUSTOMER_ACCOUNT = UUID("e3000000-0000-7000-8000-0000000000a1")
RECEIVABLE_ACCOUNT = UUID("e3000000-0000-7000-8000-0000000000a2")
SELLER_REGISTRATION = UUID("e3000000-0000-7000-8000-0000000000a3")
ADJUSTMENT_RULE = UUID("e3000000-0000-7000-8000-0000000000a4")
SOURCE_OPEN_ITEM = UUID("e3000000-0000-7000-8000-0000000000a5")
REFERENCE_RELEASE = UUID("e3000000-0000-7000-8000-000000000018")


def _seed_source(session, business_date) -> None:
    # The source note, its accounting event, and its open item form a valid
    # circular retained lineage.  The disposable superuser fixture loads the
    # complete cycle atomically, then restores normal trigger enforcement.
    session.execute(text("SET LOCAL session_replication_role='replica'"))
    session.execute(text('SET LOCAL ROLE "erp_migration_owner"'))
    session.execute(text("SELECT set_config('app.org_id',:org,true),set_config('app.membership_id',:actor,true)"),
                    {"org": str(ORG), "actor": str(ACTOR)})
    tables = (
        "sales.invoices", "finance.adjustment_notes", "finance.adjustment_note_lines",
        "finance.journal_entries", "finance.journal_lines", "finance.accounting_events",
        "finance.open_items",
        "finance.accounts", "parties.parties", "parties.customer_accounts",
        "tax.registrations", "tax.gst_adjustment_rule_versions",
    )
    for table_name in tables:
        session.execute(text(f"ALTER TABLE {table_name} DISABLE TRIGGER USER"))
    session.execute(text("SET CONSTRAINTS ALL DEFERRED"))
    session.execute(text("""
      INSERT INTO finance.accounts(org_id,id,code,name,account_type,currency_code,allows_party_posting,status,created_by_membership_id,updated_by_membership_id)
      VALUES (:org,:receivable,'1200','Trade Receivables','asset','INR',true,'active',:actor,:actor);
      INSERT INTO parties.parties(org_id,id,party_kind,legal_name,status,created_by_membership_id,updated_by_membership_id)
      VALUES (:org,:party,'organization','Reversal Fixture Customer','active',:actor,:actor);
      INSERT INTO parties.customer_accounts(org_id,id,party_id,customer_code,default_receivable_account_id,status,created_by_membership_id,updated_by_membership_id)
      VALUES (:org,:customer,:party,'REV-CUSTOMER',:receivable,'active',:actor,:actor);
      INSERT INTO tax.registrations(org_id,id,gstin,legal_name,state_code,registration_type,effective_from,status,created_by_membership_id,updated_by_membership_id)
      VALUES (:org,:registration,'27ABCDE1234F1Z5','Fixture Seller','27','regular',:day,'active',:actor,:actor);
      INSERT INTO tax.gst_adjustment_rule_versions(id,release_id,rule_code,rule_version,side,direction,document_effect,
        reason_code,deadline_policy,portal_evidence_required,tax_effect,effective_from,status)
      VALUES (:rule,:release,'REV-COMMERCIAL-CREDIT','fixture-v1','sales','credit','decrease',
        'pricing_error','none',false,'commercial_only',:day,'active');
      INSERT INTO sales.invoices(
        org_id,id,branch_id,customer_account_id,seller_tax_registration_id,invoice_number,fiscal_year,
        invoice_date,invoice_type,status,supply_type,zero_rated_payment_mode,tax_charge_mechanism,
        place_of_supply_state_code,calculation_ruleset_version,document_discount_kind,document_discount_basis,
        document_discount_value,seller_legal_name_snapshot,seller_gstin_snapshot,seller_address_snapshot,
        buyer_legal_name_snapshot,buyer_address_snapshot,currency_code,subtotal,discount_total,charges_total,
        net_value_total,gst_taxable_total,cgst_total,sgst_total,igst_total,cess_total,recipient_assessed_tax_total,
        rounding_policy,rounding_adjustment,grand_total,posted_at,posted_by_membership_id,
        created_by_membership_id,updated_by_membership_id)
      VALUES (:org,:invoice,:branch,:customer,:registration,'REV-SOURCE-INVOICE',extract(year from CAST(:day AS date))::smallint,
        :day,'bill_of_supply','posted','intra_state','not_applicable','normal','27','reversal-fixture-v1',
        'none','price_value',0,'Fixture Seller','27ABCDE1234F1Z5','Mumbai','Fixture Buyer','Pune','INR',
        10,0,0,10,0,0,0,0,0,0,'none',0,10,transaction_timestamp(),:actor,:actor,:actor);
      INSERT INTO finance.adjustment_notes(
        org_id,id,note_number,note_date,side,direction,party_id,gst_adjustment_rule_version_id,
        gst_tax_treatment,zero_rated_payment_mode,tax_charge_mechanism,currency_code,document_effect,
        rounding_policy,document_discount_kind,document_discount_basis,document_discount_value,
        calculation_ruleset_version,gross_price_amount,discount_amount,net_value_amount,gst_taxable_value,
        cgst_amount,sgst_amount,igst_amount,cess_amount,recipient_assessed_tax_amount,rounding_adjustment,
        counterparty_payable_amount,reason_code,reason,status,sales_invoice_id,adjusts_open_item_id,
        approved_at,approved_by_membership_id,posted_at,posted_by_membership_id,
        created_by_membership_id,updated_by_membership_id)
      VALUES (:org,:note,'REV-SOURCE-NOTE',:day,'sales','credit',:party,:rule,
        'commercial_only','not_applicable','normal','INR','decrease','none','none','price_value',0,
        'reversal-fixture-v1',10,0,10,0,0,0,0,0,0,0,10,'pricing_error','Erroneous duplicate credit',
        'posted',:invoice,:open_item,transaction_timestamp(),:actor,transaction_timestamp(),:actor,:actor,:actor);
      INSERT INTO finance.adjustment_note_lines(
        org_id,id,adjustment_note_id,line_number,line_kind,description,account_id,charge_code,quoted_amount,
        price_basis,gross_amount,line_discount_kind,line_discount_basis,line_discount_value,
        document_discount_eligible,line_discount_amount,line_taxable_discount_amount,document_discount_amount,
        document_taxable_discount_amount,final_residual,gst_tax_treatment,discount_amount,net_value_amount,
        gst_taxable_value,taxability_snapshot,tax_charge_mechanism,cgst_rate,sgst_rate,igst_rate,cess_rate,
        cgst_amount,sgst_amount,igst_amount,cess_amount,recipient_assessed_tax_amount,line_total,tax_ruleset_version,
        created_by_membership_id)
      VALUES (:org,:note_line,:note,1,'charge','Fixture commercial adjustment',:loss,'other',10,'tax_exclusive',10,
        'none','price_value',0,false,0,0,0,0,true,'commercial_only',0,10,0,'non_gst','normal',0,0,0,0,
        0,0,0,0,0,10,'reversal-fixture-v1',:actor);
      INSERT INTO finance.journal_entries(
        org_id,id,journal_number,posting_date,description,transaction_currency,functional_currency,fx_rate,
        transaction_debit_total,transaction_credit_total,functional_debit_total,functional_credit_total,status,
        posted_at,posted_by_membership_id,created_by_membership_id,updated_by_membership_id)
      VALUES (:org,:journal,'REV-SOURCE-JRN',:day,'Source adjustment','INR','INR',1,10,10,10,10,'posted',
        transaction_timestamp(),:actor,:actor,:actor);
      INSERT INTO finance.journal_lines(org_id,journal_entry_id,line_number,account_id,transaction_debit,
        transaction_credit,functional_debit,functional_credit,created_by_membership_id)
      VALUES (:org,:journal,1,:loss,10,0,10,0,:actor),(:org,:journal,2,:asset,0,10,0,10,:actor);
      INSERT INTO finance.accounting_events(org_id,id,event_type,adjustment_note_id,journal_entry_id,
        occurred_at,source_posted_at,created_by_membership_id)
      VALUES (:org,:event,'adjustment_note',:note,:journal,transaction_timestamp(),transaction_timestamp(),:actor);
      INSERT INTO finance.open_items(org_id,id,accounting_event_id,party_id,item_side,document_number,
        document_date,due_date,currency_code,principal_amount,functional_principal_amount,status,created_by_membership_id)
      VALUES (:org,:open_item,:event,:party,'receivable','REV-SOURCE-NOTE',:day,:day,'INR',10,10,'open',:actor);
    """), {"org": ORG, "branch": BRANCH, "actor": ACTOR, "day": business_date,
             "invoice": SOURCE_INVOICE, "note": SOURCE_NOTE, "note_line": SOURCE_NOTE_LINE,
             "journal": SOURCE_JOURNAL, "event": SOURCE_EVENT,
             "loss": COUNT.LOSS_ACCOUNT, "asset": COUNT.ASSET_ACCOUNT,
             "party": CUSTOMER_PARTY, "customer": CUSTOMER_ACCOUNT,
             "receivable": RECEIVABLE_ACCOUNT, "registration": SELLER_REGISTRATION,
             "rule": ADJUSTMENT_RULE, "release": REFERENCE_RELEASE,
             "open_item": SOURCE_OPEN_ITEM})
    for table_name in tables:
        session.execute(text(f"ALTER TABLE {table_name} ENABLE TRIGGER USER"))
    session.execute(text("RESET ROLE"))
    session.execute(text("SET LOCAL session_replication_role='origin'"))
    session.execute(text("SET CONSTRAINTS ALL DEFERRED"))


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with engine.connect() as connection:
            outer = connection.begin()
            try:
                sessions = sessionmaker(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint")
                with sessions.begin() as session:
                    COUNT.TRANSFER._seed(session)
                    business_date = session.scalar(text("SELECT current_date"))
                    COUNT._extend_fixture(session, business_date)
                    _seed_source(session, business_date)
                connection.exec_driver_sql('SET SESSION AUTHORIZATION "erp_runtime"')
                assert int(connection.scalar(text("SHOW server_version_num"))) // 10000 == 15
                with sessions.begin() as session:
                    session.execute(text("SELECT erp_security.activate_context(:auth,:org)"), {"auth": AUTH, "org": ORG})
                    resolved = session.scalar(text("""
                      SELECT erp_commercial_commands.prepare_adjustment_note_reversal(
                        :org,:source,1,:day,'Erroneous duplicate adjustment note',NULL)
                    """), {"org": ORG, "source": SOURCE_NOTE, "day": business_date})
                    assert resolved["reported_return_membership_count"] == 0
                    result = session.scalar(text("""
                      SELECT erp_commercial_commands.post_adjustment_note_reversal(
                        :org,:source,1,:reversal_note,'REV-COUNTER-NOTE',NULL,NULL,
                        :reversal_journal,'REV-COUNTER-JRN',:reversal_event,NULL,:day,
                        'Erroneous duplicate adjustment note',NULL,decode(repeat('81',32),'hex'),
                        decode(repeat('82',32),'hex'),transaction_timestamp()+interval '10 minutes')
                    """), {"org": ORG, "source": SOURCE_NOTE, "reversal_note": REVERSAL_NOTE,
                           "reversal_journal": REVERSAL_JOURNAL, "reversal_event": REVERSAL_EVENT,
                           "day": business_date})
                    assert result == REVERSAL_NOTE
                    evidence = session.execute(text("""
                      SELECT original.status,reversal.status,reversal.direction,reversal.document_effect,
                             original_journal.status,reversal_journal.status,
                             reversal_journal.reversal_of_journal_entry_id,
                             reversal_journal.transaction_debit_total,reversal_journal.transaction_credit_total,
                             count(reversal_line.id)
                        FROM finance.adjustment_notes original
                        JOIN finance.adjustment_notes reversal ON reversal.org_id=original.org_id
                         AND reversal.reversal_of_adjustment_note_id=original.id
                        JOIN finance.accounting_events original_event ON original_event.org_id=original.org_id
                         AND original_event.adjustment_note_id=original.id
                        JOIN finance.accounting_events reversal_event ON reversal_event.org_id=reversal.org_id
                         AND reversal_event.adjustment_note_id=reversal.id
                        JOIN finance.journal_entries original_journal ON original_journal.org_id=original_event.org_id
                         AND original_journal.id=original_event.journal_entry_id
                        JOIN finance.journal_entries reversal_journal ON reversal_journal.org_id=reversal_event.org_id
                         AND reversal_journal.id=reversal_event.journal_entry_id
                        JOIN finance.journal_lines reversal_line ON reversal_line.org_id=reversal_journal.org_id
                         AND reversal_line.journal_entry_id=reversal_journal.id
                       WHERE original.org_id=:org AND original.id=:source
                       GROUP BY original.status,reversal.status,reversal.direction,reversal.document_effect,
                         original_journal.status,reversal_journal.status,reversal_journal.reversal_of_journal_entry_id,
                         reversal_journal.transaction_debit_total,reversal_journal.transaction_credit_total
                    """), {"org": ORG, "source": SOURCE_NOTE}).one()
                    assert tuple(evidence) == (
                        "reversed", "posted", "debit", "increase", "reversed", "posted",
                        SOURCE_JOURNAL, Decimal("10.00"), Decimal("10.00"), 2,
                    )
                    replay = session.scalar(text("""
                      SELECT erp_commercial_commands.post_adjustment_note_reversal(
                        :org,:source,1,:reversal_note,'REV-COUNTER-NOTE',NULL,NULL,
                        :reversal_journal,'REV-COUNTER-JRN',:reversal_event,NULL,:day,
                        'Erroneous duplicate adjustment note',NULL,decode(repeat('81',32),'hex'),
                        decode(repeat('82',32),'hex'),transaction_timestamp()+interval '10 minutes')
                    """), {"org": ORG, "source": SOURCE_NOTE, "reversal_note": REVERSAL_NOTE,
                           "reversal_journal": REVERSAL_JOURNAL, "reversal_event": REVERSAL_EVENT,
                           "day": business_date})
                    assert replay == REVERSAL_NOTE
                    print(
                        "commercial-reversal PostgreSQL 15 lifecycle passed: "
                        f"source={SOURCE_NOTE} counter={REVERSAL_NOTE} "
                        "journal_total=10.00 replay_safe=true"
                    )
            finally:
                if outer.is_active:
                    outer.rollback()
                connection.exec_driver_sql("RESET SESSION AUTHORIZATION")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
