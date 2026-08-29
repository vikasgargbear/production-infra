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


def configure_product_draft(db: Session, **parameters: Any) -> dict[str, Any]:
    """Replace the complete unused-draft setup through one database owner."""

    return dict(
        db.execute(
            text(
                """
                SELECT product_id,product_code,product_name,new_row_version
                  FROM erp_master_commands.configure_product_draft(
                    :org_id,:product_id,:expected_row_version,:category_id,
                    :manufacturer_party_id,:base_uom_code,:dosage_form,
                    :strength_display,:hsn_code,:cold_chain_required,
                    :minimum_storage_celsius,:maximum_storage_celsius,
                    :shelf_life_days,:gtin,
                    CAST(:pack_conversions AS jsonb),CAST(:ingredients AS jsonb)
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
