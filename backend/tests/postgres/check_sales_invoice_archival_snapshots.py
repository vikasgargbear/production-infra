"""Exercise immutable sales-invoice display evidence on PostgreSQL 15."""

from __future__ import annotations

import json
import os
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.api.routes.canonical_erp_reads import (
    CanonicalInvoiceDetailResponse,
    _canonical_invoice_detail,
)


ORG = UUID("f0500000-0000-7000-8000-000000000001")
MEMBER = UUID("f0500000-0000-7000-8000-000000000002")
BRANCH = UUID("f0500000-0000-7000-8000-000000000003")
PARTY = UUID("f0500000-0000-7000-8000-000000000004")
CUSTOMER = UUID("f0500000-0000-7000-8000-000000000005")
BILLING = UUID("f0500000-0000-7000-8000-000000000006")
SHIPPING = UUID("f0500000-0000-7000-8000-000000000007")
SELLER_GST = UUID("f0500000-0000-7000-8000-000000000008")
BUYER_GST = UUID("f0500000-0000-7000-8000-000000000009")
ATTACHMENT = UUID("f0500000-0000-7000-8000-000000000010")
SELLER_LICENCE = UUID("f0500000-0000-7000-8000-000000000011")
BUYER_LICENCE = UUID("f0500000-0000-7000-8000-000000000012")
INVOICE = UUID("f0500000-0000-7000-8000-000000000013")
LEDGER = UUID("f0500000-0000-7000-8000-000000000014")


def _seed(session: Session) -> None:
    session.execute(text("SET LOCAL session_replication_role=replica"))
    session.execute(text("SELECT set_config('app.membership_id',:member,true)"), {"member": str(MEMBER)})
    session.execute(text('SET LOCAL ROLE "erp_migration_owner"'))
    session.execute(text("SET CONSTRAINTS ALL DEFERRED"))
    session.execute(
        text(
            """
            INSERT INTO core.organizations(
              id,legal_name,registered_address_line1,registered_city,
              registered_state_code,registered_postal_code,status,
              created_by_membership_id,updated_by_membership_id)
            VALUES(:org,'Archival Seller','1 Seller Road','Mumbai','27','400001',
                   'active',:member,:member);
            INSERT INTO core.branches(
              org_id,id,code,name,address_line1,city,state_code,postal_code,status,
              created_by_membership_id,updated_by_membership_id)
            VALUES(:org,:branch,'MAIN','Main','1 Seller Road','Mumbai','27','400001',
                   'active',:member,:member);
            INSERT INTO parties.parties(
              org_id,id,party_kind,legal_name,status,
              created_by_membership_id,updated_by_membership_id)
            VALUES(:org,:party,'organization','Snapshot Customer','active',:member,:member);
            INSERT INTO parties.customer_accounts(
              org_id,id,party_id,customer_code,default_receivable_account_id,status,
              created_by_membership_id,updated_by_membership_id)
            VALUES(:org,:customer,:party,'CUST-SNAPSHOT',:ledger,'active',:member,:member);
            INSERT INTO parties.addresses(
              org_id,id,party_id,address_kind,line1,city,state_code,postal_code,
              is_primary,valid_from,status,created_by_membership_id,updated_by_membership_id)
            VALUES
              (:org,:billing,:party,'billing','10 Billing Lane','Mumbai','27','400010',
               true,CURRENT_DATE-1,'active',:member,:member),
              (:org,:shipping,:party,'shipping','20 Ship-To Lane','Pune','27','411020',
               true,CURRENT_DATE-1,'active',:member,:member);
            INSERT INTO tax.registrations(
              org_id,id,gstin,legal_name,state_code,registration_type,effective_from,status,
              created_by_membership_id,updated_by_membership_id)
            VALUES(:org,:seller_gst,'27ABCDE1234F1Z5','Archival Seller','27','regular',
                   CURRENT_DATE-1,'active',:member,:member);
            INSERT INTO tax.registration_branches(
              org_id,registration_id,branch_id,place_of_business_kind,effective_from,status,
              created_by_membership_id)
            VALUES(:org,:seller_gst,:branch,'principal',CURRENT_DATE-1,'active',:member);
            INSERT INTO parties.tax_registrations(
              org_id,id,party_id,registration_type,registration_number,
              registered_legal_name,state_code,taxpayer_type,valid_from,verified_at,status,
              created_by_membership_id,updated_by_membership_id)
            VALUES(:org,:buyer_gst,:party,'GSTIN','27ABCDE1234F1Z5','Snapshot Customer',
                   '27','regular',CURRENT_DATE-1,transaction_timestamp(),'active',:member,:member);
            INSERT INTO core.attachments(
              org_id,id,storage_bucket,storage_object_path,original_filename,media_type,
              byte_size,sha256,evidence_kind,status,verified_at,created_by_membership_id)
            VALUES(:org,:attachment,'evidence','licence.pdf','licence.pdf','application/pdf',
                   1,decode(repeat('50',32),'hex'),'regulatory_license','verified',
                   transaction_timestamp(),:member);
            INSERT INTO compliance.licenses(
              org_id,id,branch_id,party_id,license_type_code,license_number,
              issuing_authority,jurisdiction_code,issued_on,valid_from,
              next_verification_due_on,evidence_attachment_id,status,verified_at,
              verified_by_membership_id,created_by_membership_id,updated_by_membership_id)
            VALUES
              (:org,:seller_licence,:branch,NULL,'drug_wholesale_form_20b','SELLER-20B',
               'FDA','MH',CURRENT_DATE-2,CURRENT_DATE-1,CURRENT_DATE+30,:attachment,
               'active',transaction_timestamp(),:member,:member,:member),
              (:org,:buyer_licence,NULL,:party,'drug_wholesale_form_20b','BUYER-20B',
               'FDA','MH',CURRENT_DATE-2,CURRENT_DATE-1,CURRENT_DATE+30,:attachment,
               'active',transaction_timestamp(),:member,:member,:member);
            """
        ),
        {
            "org": ORG, "member": MEMBER, "branch": BRANCH, "party": PARTY,
            "customer": CUSTOMER, "billing": BILLING, "shipping": SHIPPING,
            "seller_gst": SELLER_GST, "buyer_gst": BUYER_GST,
            "attachment": ATTACHMENT, "seller_licence": SELLER_LICENCE,
            "buyer_licence": BUYER_LICENCE, "ledger": LEDGER,
        },
    )


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with Session(engine) as session:
            _seed(session)
            resolution = {
                "invoice_date": str(session.scalar(text("SELECT CURRENT_DATE"))),
                "branch_id": str(BRANCH),
                "customer_account_id": str(CUSTOMER),
                "billing_address_id": str(BILLING),
                "shipping_address_id": str(SHIPPING),
                "seller_tax_registration_id": str(SELLER_GST),
                "customer_tax_registration_id": str(BUYER_GST),
            }
            snapshot = session.scalar(
                text(
                    "SELECT erp_automation_commands.sales_invoice_archival_snapshot("
                    ":org,CAST(:resolution AS jsonb))"
                ),
                {"org": ORG, "resolution": json.dumps(resolution)},
            )
            assert snapshot["billing_address"]["display"].startswith("10 Billing Lane")
            assert snapshot["shipping_address"]["display"].startswith("20 Ship-To Lane")
            assert snapshot["billing_address"]["id"] != snapshot["shipping_address"]["id"]
            assert snapshot["seller_gst"]["availability"] == "available"
            assert snapshot["buyer_gst"]["availability"] == "available"
            assert snapshot["seller_drug_licences"]["licences"][0]["license_number"] == "SELLER-20B"
            assert snapshot["buyer_drug_licences"]["licences"][0]["license_number"] == "BUYER-20B"

            session.execute(
                text(
                    """
                    INSERT INTO sales.invoices(
                      org_id,id,branch_id,customer_account_id,seller_tax_registration_id,
                      customer_tax_registration_id,invoice_number,fiscal_year,invoice_date,
                      invoice_type,status,supply_type,zero_rated_payment_mode,tax_charge_mechanism,
                      place_of_supply_state_code,calculation_ruleset_version,
                      document_discount_kind,document_discount_basis,document_discount_value,
                      seller_legal_name_snapshot,seller_gstin_snapshot,seller_address_snapshot,
                      buyer_legal_name_snapshot,buyer_gstin_snapshot,buyer_address_snapshot,
                      archival_snapshot_state,billing_address_snapshot,shipping_address_snapshot,
                      seller_gst_evidence_snapshot,buyer_gst_evidence_snapshot,
                      seller_drug_licence_evidence_snapshot,buyer_drug_licence_evidence_snapshot,
                      currency_code,rounding_policy)
                    VALUES(
                      :org,:invoice,:branch,:customer,:seller_gst,:buyer_gst,'INV-SNAPSHOT',2026,
                      CURRENT_DATE,'tax_invoice','draft','intra_state','not_applicable','normal','27',
                      'test-v1','none','price_value',0,'Archival Seller','27ABCDE1234F1Z5',
                      '1 Seller Road','Snapshot Customer','27ABCDE1234F1Z5','legacy value',
                      'captured',:billing,:shipping,CAST(:seller_gst_evidence AS jsonb),
                      CAST(:buyer_gst_evidence AS jsonb),CAST(:seller_licences AS jsonb),
                      CAST(:buyer_licences AS jsonb),'INR','none')
                    """
                ),
                {
                    "org": ORG, "invoice": INVOICE, "branch": BRANCH,
                    "customer": CUSTOMER, "seller_gst": SELLER_GST,
                    "buyer_gst": BUYER_GST,
                    "billing": snapshot["billing_address"]["display"],
                    "shipping": snapshot["shipping_address"]["display"],
                    "seller_gst_evidence": json.dumps(snapshot["seller_gst"]),
                    "buyer_gst_evidence": json.dumps(snapshot["buyer_gst"]),
                    "seller_licences": json.dumps(snapshot["seller_drug_licences"]),
                    "buyer_licences": json.dumps(snapshot["buyer_drug_licences"]),
                },
            )
            detail = CanonicalInvoiceDetailResponse.model_validate(
                _canonical_invoice_detail(session, ORG, INVOICE)
            )
            assert detail.billing_address.startswith("10 Billing Lane")
            assert detail.shipping_address.startswith("20 Ship-To Lane")
            assert detail.customer_name == "Snapshot Customer"
            assert detail.archival_snapshot_state == "captured"
            assert detail.seller_drug_license_numbers == ["SELLER-20B"]
            assert detail.customer_drug_license_numbers == ["BUYER-20B"]
            assert detail.customer_phone is None
            assert detail.seller_drug_licence_evidence["availability"] == "available"

            session.execute(text("RESET ROLE"))
            session.execute(text("SET LOCAL session_replication_role=origin"))
            session.execute(text('SET LOCAL ROLE "erp_migration_owner"'))
            try:
                with session.begin_nested():
                    session.execute(
                        text(
                            "UPDATE sales.invoices SET shipping_address_snapshot='tampered' "
                            "WHERE org_id=:org AND id=:invoice"
                        ),
                        {"org": ORG, "invoice": INVOICE},
                    )
            except DBAPIError as exc:
                assert getattr(exc.orig, "pgcode", None) == "23514"
            else:
                raise AssertionError("captured invoice evidence was mutable")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
