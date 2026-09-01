"""Typed calls to the small canonical master/evidence write-function boundary."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session


def update_product_draft(
    db: Session,
    *,
    org_id: UUID,
    product_id: UUID,
    expected_row_version: int,
    fields: set[str],
    product_name: str | None,
    generic_name: str | None,
    product_kind: str | None,
) -> dict[str, Any]:
    return dict(
        db.execute(
            text(
                """
                SELECT product_id,product_code,updated_product_name,new_row_version
                  FROM erp_master_commands.update_product_draft(
                    :org_id,:product_id,:expected_row_version,
                    :set_name,:product_name,:set_generic_name,:generic_name,
                    :set_product_kind,:product_kind
                  )
                """
            ),
            {
                "org_id": org_id,
                "product_id": product_id,
                "expected_row_version": expected_row_version,
                "set_name": "product_name" in fields,
                "product_name": product_name,
                "set_generic_name": "generic_name" in fields,
                "generic_name": generic_name,
                "set_product_kind": "product_kind" in fields,
                "product_kind": product_kind,
            },
        ).mappings().one()
    )


def update_customer_account(db: Session, **parameters: Any) -> dict[str, Any]:
    """Patch one customer aggregate through its canonical command owner."""

    return dict(
        db.execute(
            text(
                """
                SELECT customer_account_id,party_id,customer_code,
                       updated_customer_name,updated_customer_type,
                       updated_primary_phone,updated_primary_email,
                       updated_contact_person_name,updated_pan,
                       updated_credit_limit,updated_credit_days,
                       account_row_version,party_row_version,idempotency_replayed
                  FROM erp_master_commands.update_customer_account(
                    :org_id,:customer_id,:expected_account_row_version,
                    :expected_party_row_version,
                    :set_customer_name,:customer_name,
                    :set_customer_type,:customer_type,
                    :set_primary_phone,:primary_phone,
                    :set_primary_email,:primary_email,
                    :set_contact_person_name,:contact_person_name,
                    :set_pan,:pan,:set_credit_limit,:credit_limit,
                    :set_credit_days,:credit_days,:idempotency_key_hash,
                    transaction_timestamp()+interval '24 hours'
                  )
                """
            ),
            parameters,
        ).mappings().one()
    )


def update_supplier_account(db: Session, **parameters: Any) -> dict[str, Any]:
    """Patch one supplier aggregate through its canonical command owner."""

    return dict(
        db.execute(
            text(
                """
                SELECT supplier_account_id,party_id,supplier_code,
                       updated_supplier_name,updated_primary_phone,
                       updated_primary_email,updated_contact_person_name,
                       updated_pan,updated_payment_days,account_row_version,
                       party_row_version,idempotency_replayed
                  FROM erp_master_commands.update_supplier_account(
                    :org_id,:supplier_id,:expected_account_row_version,
                    :expected_party_row_version,
                    :set_supplier_name,:supplier_name,
                    :set_primary_phone,:primary_phone,
                    :set_primary_email,:primary_email,
                    :set_contact_person_name,:contact_person_name,
                    :set_pan,:pan,:set_payment_days,:payment_days,
                    :idempotency_key_hash,
                    transaction_timestamp()+interval '24 hours'
                  )
                """
            ),
            parameters,
        ).mappings().one()
    )


def delete_product_draft(
    db: Session, *, org_id: UUID, product_id: UUID, expected_row_version: int
) -> dict[str, Any]:
    return dict(
        db.execute(
            text(
                """
                SELECT product_id,product_code,product_name
                  FROM erp_master_commands.delete_product_draft(
                    :org_id,:product_id,:expected_row_version
                  )
                """
            ),
            {
                "org_id": org_id,
                "product_id": product_id,
                "expected_row_version": expected_row_version,
            },
        ).mappings().one()
    )


def configure_product_draft_idempotent(
    db: Session, **parameters: Any
) -> dict[str, Any]:
    """Replace one unused-draft setup with replay-safe command ownership."""

    return dict(
        db.execute(
            text(
                """
                SELECT product_id,product_code,product_name,new_row_version,
                       idempotency_replayed
                  FROM erp_master_commands.configure_product_draft_idempotent(
                    :org_id,:product_id,:expected_row_version,:category_id,
                    :manufacturer_party_id,:base_uom_code,:dosage_form,
                    :strength_display,:hsn_code,:cold_chain_required,
                    :minimum_storage_celsius,:maximum_storage_celsius,
                    :shelf_life_days,:gtin,
                    CAST(:pack_conversions AS jsonb),CAST(:ingredients AS jsonb),
                    :idempotency_key_hash,transaction_timestamp()+interval '24 hours'
                  )
                """
            ),
            parameters,
        ).mappings().one()
    )


def activate_configured_product(db: Session, **parameters: Any) -> dict[str, Any]:
    """Delegate activation to the regulatory command after canonical readiness."""

    return dict(
        db.execute(
            text(
                """
                SELECT product_id,product_code,product_name,new_row_version,
                       idempotency_replayed
                  FROM erp_master_commands.activate_configured_product(
                    :org_id,:product_id,:expected_row_version,
                    :manufacturer_traceability_code,:idempotency_key_hash,
                    transaction_timestamp()+interval '24 hours'
                  )
                """
            ),
            parameters,
        ).mappings().one()
    )


def create_party_address(db: Session, **parameters: Any) -> dict[str, Any]:
    return dict(
        db.execute(
            text(
                """
                SELECT address_id,row_version,idempotency_replayed
                  FROM erp_master_commands.create_party_address(
                    :org_id,:party_id,:address_kind,:line1,:line2,:landmark,
                    :city,:state_code,:postal_code,:make_primary
                  )
                """
            ),
            parameters,
        ).mappings().one()
    )


def update_party_address(db: Session, **parameters: Any) -> dict[str, Any]:
    return dict(
        db.execute(
            text(
                """
                SELECT address_id,row_version
                  FROM erp_master_commands.update_party_address(
                    :org_id,:party_id,:address_id,:expected_row_version,
                    :address_kind,:line1,:line2,:landmark,:city,:state_code,
                    :postal_code,:make_primary
                  )
                """
            ),
            parameters,
        ).mappings().one()
    )


def initiate_expense_receipt_attachment(
    db: Session, **parameters: Any
) -> dict[str, Any]:
    return dict(
        db.execute(
            text(
                """
                SELECT attachment_id,attachment_status,idempotency_replayed
                  FROM erp_core_commands.initiate_expense_receipt_attachment(
                    :org_id,:branch_id,:attachment_id,:storage_bucket,
                    :storage_object_path,:original_filename,:byte_size,
                    :sha256,:document_date,:retention_until
                  )
                """
            ),
            parameters,
        ).mappings().one()
    )


def transition_expense_receipt_attachment(
    db: Session, **parameters: Any
) -> dict[str, Any]:
    return dict(
        db.execute(
            text(
                """
                SELECT attachment_id,attachment_status,idempotency_replayed
                  FROM erp_core_commands.transition_expense_receipt_attachment(
                    :org_id,:branch_id,:attachment_id,:target_status
                  )
                """
            ),
            parameters,
        ).mappings().one()
    )


def initiate_customer_receipt_attachment(
    db: Session, **parameters: Any
) -> dict[str, Any]:
    return dict(
        db.execute(
            text(
                """
                SELECT attachment_id,attachment_status,idempotency_replayed
                  FROM erp_core_commands.initiate_customer_receipt_attachment(
                    :org_id,:branch_id,:attachment_id,:storage_bucket,
                    :storage_object_path,:original_filename,:byte_size,
                    :sha256,:document_date,:retention_until
                  )
                """
            ),
            parameters,
        ).mappings().one()
    )


def transition_customer_receipt_attachment(
    db: Session, **parameters: Any
) -> dict[str, Any]:
    return dict(
        db.execute(
            text(
                """
                SELECT attachment_id,attachment_status,idempotency_replayed
                  FROM erp_core_commands.transition_customer_receipt_attachment(
                    :org_id,:branch_id,:attachment_id,:target_status
                  )
                """
            ),
            parameters,
        ).mappings().one()
    )


def initiate_drug_license_attachment(
    db: Session, **parameters: Any
) -> dict[str, Any]:
    return dict(
        db.execute(
            text(
                """
                SELECT attachment_id,attachment_status,idempotency_replayed
                  FROM erp_core_commands.initiate_drug_license_attachment(
                    :org_id,:branch_id,:attachment_id,:storage_bucket,
                    :storage_object_path,:original_filename,:byte_size,
                    :sha256,:document_date
                  )
                """
            ),
            parameters,
        ).mappings().one()
    )


def transition_drug_license_attachment(db: Session, **parameters: Any) -> None:
    db.execute(
        text(
            """
            SELECT erp_core_commands.transition_drug_license_attachment(
              :org_id,:branch_id,:attachment_id,:target_status
            )
            """
        ),
        parameters,
    )


def record_effective_wholesale_license(
    db: Session, **parameters: Any
) -> dict[str, Any]:
    return dict(
        db.execute(
            text(
                """
                SELECT recorded_license_id,recorded_status,recorded_row_version,
                       idempotency_replayed
                  FROM erp_compliance_commands.record_effective_wholesale_license(
                    :org_id,:license_id,:actor_id,:subject_branch_id,
                    :subject_party_id,:evidence_branch_id,:license_type_code,
                    :license_number,:issuing_authority,:jurisdiction_code,
                    :issued_on,:valid_from,:next_verification_due_on,
                    :evidence_attachment_id,:idempotency_key_hash,
                    transaction_timestamp()+interval '24 hours'
                  )
                """
            ),
            parameters,
        ).mappings().one()
    )


def establish_gst_registration(db: Session, **parameters: Any) -> dict[str, Any]:
    """Create the organization's first active GST registration atomically.

    The caller must already have activated an ERP RLS context.  PostgreSQL RLS
    remains the final authorization boundary for both the registration and its
    branch association.
    """

    existing = db.execute(
        text(
            """
            SELECT registration.id AS registration_id,
                   registration.gstin,
                   registration.status,
                   association.branch_id,
                   registration.row_version
              FROM tax.registrations registration
              JOIN tax.registration_branches association
                ON association.org_id=registration.org_id
               AND association.registration_id=registration.id
               AND association.status='active'
             WHERE registration.org_id=:org_id
               AND registration.status='active'
             ORDER BY registration.effective_from DESC,registration.id
             LIMIT 1
            """
        ),
        parameters,
    ).mappings().first()
    if existing is not None:
        return {**dict(existing), "idempotency_replayed": True}

    organization = db.execute(
        text(
            """
            SELECT legal_name,trade_name,registered_state_code,
                   erp_core_commands.current_organization_business_date()
                     AS business_date
             FROM core.organizations
             WHERE id=:org_id AND status='active'
            """
        ),
        parameters,
    ).mappings().one()
    branch_id = parameters.get("branch_id")
    branch = db.execute(
        text(
            """
            SELECT id,state_code
              FROM core.branches
             WHERE org_id=:org_id AND status='active'
               AND (CAST(:branch_id AS uuid) IS NULL OR id=CAST(:branch_id AS uuid))
             ORDER BY code,id
             LIMIT 1
            """
        ),
        {**parameters, "branch_id": branch_id},
    ).mappings().one()
    normalized_gstin = str(parameters["gstin"]).strip().upper()
    state_code = str(organization["registered_state_code"])
    if normalized_gstin[:2] != state_code or str(branch["state_code"]) != state_code:
        raise ValueError("GSTIN state must match the organization and principal branch")
    effective_from = parameters.get("effective_from") or organization["business_date"]
    if effective_from > organization["business_date"]:
        raise ValueError("GST registration cannot start after the business date")

    registration_id = parameters["registration_id"]
    actor_id = parameters["actor_id"]
    db.execute(
        text(
            """
            INSERT INTO tax.registrations(
              org_id,id,gstin,legal_name,trade_name,state_code,
              registration_type,effective_from,status,
              created_by_membership_id,updated_by_membership_id
            ) VALUES(
              :org_id,:registration_id,:gstin,:legal_name,:trade_name,:state_code,
              'regular',:effective_from,'active',:actor_id,:actor_id
            )
            """
        ),
        {
            **parameters,
            "gstin": normalized_gstin,
            "legal_name": organization["legal_name"],
            "trade_name": organization["trade_name"],
            "state_code": state_code,
            "effective_from": effective_from,
        },
    )
    db.execute(
        text(
            """
            INSERT INTO tax.registration_branches(
              org_id,registration_id,branch_id,place_of_business_kind,
              effective_from,status,created_by_membership_id
            ) VALUES(
              :org_id,:registration_id,:branch_id,'principal',
              :effective_from,'active',:actor_id
            )
            """
        ),
        {
            **parameters,
            "branch_id": branch["id"],
            "effective_from": effective_from,
        },
    )
    return {
        "registration_id": registration_id,
        "gstin": normalized_gstin,
        "status": "active",
        "branch_id": branch["id"],
        "row_version": 1,
        "idempotency_replayed": False,
    }
