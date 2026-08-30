"""Delegated MCP adapters for canonical master-data write commands."""

from __future__ import annotations

import hashlib
import json
from datetime import date
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ....core.database import get_db
from ....core.money import money_json
from ....domain.operator_actions import ActionContext
from ...schemas.master.customer import CanonicalCustomerCreate, CanonicalCustomerUpdate
from ...schemas.master.supplier import CanonicalSupplierCreate, CanonicalSupplierUpdate
from ....infrastructure import canonical_write_commands
from ..canonical_erp_reads import (
    CanonicalProductActivationWrite,
    CanonicalProductCategoryCreate,
    CanonicalProductDraftCreate,
    CanonicalProductManufacturerCreate,
    CanonicalProductSetupWrite,
    _execute_canonical_customer_create,
    _execute_canonical_product_activation,
    _execute_canonical_product_create,
    _execute_product_reference_create,
    _execute_canonical_supplier_create,
    _raise_master_create_database_error,
)
from ..canonical_drug_licenses import (
    DrugLicenseRecordRequest,
    _license_rows,
    execute_drug_license_record,
)
from .mcp_actions import get_action_context
from .mcp_master_contract import (
    CUSTOMER_UPDATE_OPERATION,
    PRODUCT_ACTIVATION_OPERATION,
    PRODUCT_CATEGORY_CREATE_OPERATION,
    PRODUCT_MANUFACTURER_CREATE_OPERATION,
    SUPPLIER_UPDATE_OPERATION,
    DRUG_LICENSE_RECORD_OPERATION,
    master_write_policy_for,
)


router = APIRouter(
    prefix="/internal/mcp/master", tags=["Internal MCP"], include_in_schema=False
)


class MCPProductDraftCreate(CanonicalProductDraftCreate):
    idempotency_key: str = Field(
        min_length=8, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"
    )
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MCPProductSetup(CanonicalProductSetupWrite):
    product_id: UUID
    idempotency_key: str = Field(
        min_length=8, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"
    )
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MCPProductActivation(CanonicalProductActivationWrite):
    product_id: UUID
    idempotency_key: str = Field(
        min_length=8, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"
    )
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MCPProductCategoryCreate(CanonicalProductCategoryCreate):
    idempotency_key: str = Field(
        min_length=8, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"
    )
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MCPProductManufacturerCreate(CanonicalProductManufacturerCreate):
    idempotency_key: str = Field(
        min_length=8, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"
    )
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MCPCustomerCreate(CanonicalCustomerCreate):
    idempotency_key: str = Field(
        min_length=8, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"
    )
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MCPSupplierCreate(CanonicalSupplierCreate):
    idempotency_key: str = Field(
        min_length=8, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"
    )
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MCPCustomerUpdate(CanonicalCustomerUpdate):
    customer_id: UUID
    idempotency_key: str = Field(
        min_length=8, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"
    )
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MCPSupplierUpdate(CanonicalSupplierUpdate):
    supplier_id: UUID
    idempotency_key: str = Field(
        min_length=8, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"
    )
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MCPDrugLicenseRecord(BaseModel):
    subject_kind: Literal["branch", "supplier"]
    subject_code: str = Field(min_length=1, max_length=64)
    evidence_branch_code: str = Field(min_length=1, max_length=64)
    license_type_code: Literal[
        "drug_wholesale_form_20b", "drug_wholesale_form_21b"
    ]
    license_number: str = Field(min_length=1, max_length=128)
    issuing_authority: str = Field(min_length=1, max_length=500)
    jurisdiction_code: str = Field(min_length=1, max_length=32)
    issued_on: date
    valid_from: date
    next_verification_due_on: date
    evidence_filename: str = Field(min_length=1, max_length=255)
    reviewed: Literal[True]
    idempotency_key: str = Field(
        min_length=8, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"
    )
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def _require_master_authority(context: ActionContext, operation_key: str) -> None:
    policy = master_write_policy_for(operation_key)
    if (
        policy is None
        or context.operation_key != operation_key
        or context.permission != policy.permission
        or not context.organization_scope
        or context.branch_ids
        or context.delegated_command_request_id is not None
    ):
        raise HTTPException(
            status_code=403,
            detail="Delegation does not authorize this organization-global master command",
        )


def _activate_master_context(db: Session, context: ActionContext) -> None:
    db.execute(
        text("""
            SELECT erp_security.activate_context(:auth_user_id,:org_id),
                   pg_catalog.set_config('app.request_id',:request_id,true)
        """),
        {
            "auth_user_id": context.auth_user_id,
            "org_id": context.organization_id,
            "request_id": str(uuid4()),
        },
    )


def _run_master_write(
    db: Session,
    context: ActionContext,
    operation_key: str,
    execute,
) -> Any:
    _require_master_authority(context, operation_key)
    _activate_master_context(db, context)
    try:
        created = execute()
        db.commit()
        return dict(created)
    except DBAPIError as exc:
        db.rollback()
        _raise_master_create_database_error(exc)


def _execute_idempotent_product_setup(
    db: Session,
    context: ActionContext,
    request: MCPProductSetup,
    setup: CanonicalProductSetupWrite,
) -> dict[str, Any]:
    configured = canonical_write_commands.configure_product_draft_idempotent(
        db,
        org_id=context.organization_id,
        product_id=request.product_id,
        expected_row_version=setup.row_version,
        category_id=setup.category_id,
        manufacturer_party_id=setup.manufacturer_party_id,
        base_uom_code=setup.base_uom_code,
        dosage_form=setup.dosage_form,
        strength_display=setup.strength_display,
        hsn_code=setup.hsn_code,
        cold_chain_required=setup.cold_chain_required,
        minimum_storage_celsius=setup.minimum_storage_celsius,
        maximum_storage_celsius=setup.maximum_storage_celsius,
        shelf_life_days=setup.shelf_life_days,
        gtin=setup.gtin,
        pack_conversions=json.dumps(
            [item.model_dump(mode="json") for item in setup.pack_conversions],
            separators=(",", ":"), sort_keys=True,
        ),
        ingredients=json.dumps(
            [item.model_dump(mode="json") for item in setup.ingredients],
            separators=(",", ":"), sort_keys=True,
        ),
        idempotency_key_hash=hashlib.sha256(
            request.idempotency_key.encode("utf-8")
        ).digest(),
    )
    return dict(configured)


@router.post("/products")
def create_product_draft(
    request: MCPProductDraftCreate,
    context: ActionContext = Depends(get_action_context),
    db: Session = Depends(get_db),
):
    product = CanonicalProductDraftCreate.model_validate(
        request.model_dump(exclude={"idempotency_key"})
    )
    return _run_master_write(
        db,
        context,
        "catalog.product_draft.create",
        lambda: _execute_canonical_product_create(
            db, context.organization_id, product, request.idempotency_key
        ),
    )


@router.post("/product-categories")
def create_product_category(
    request: MCPProductCategoryCreate,
    context: ActionContext = Depends(get_action_context),
    db: Session = Depends(get_db),
):
    category = CanonicalProductCategoryCreate.model_validate(
        request.model_dump(exclude={"idempotency_key"})
    )
    created = _run_master_write(
        db, context, PRODUCT_CATEGORY_CREATE_OPERATION,
        lambda: _execute_product_reference_create(
            db, org_id=context.organization_id,
            function_name="create_product_category", value=category.name,
            idempotency_key=request.idempotency_key,
        ),
    )
    return {
        "category_id": created["category_id"], "code": created["category_code"],
        "name": created["created_category_name"], "row_version": created["row_version"],
        "idempotency_replayed": created["idempotency_replayed"],
    }


@router.post("/product-manufacturers")
def create_product_manufacturer(
    request: MCPProductManufacturerCreate,
    context: ActionContext = Depends(get_action_context),
    db: Session = Depends(get_db),
):
    manufacturer = CanonicalProductManufacturerCreate.model_validate(
        request.model_dump(exclude={"idempotency_key"})
    )
    created = _run_master_write(
        db, context, PRODUCT_MANUFACTURER_CREATE_OPERATION,
        lambda: _execute_product_reference_create(
            db, org_id=context.organization_id,
            function_name="create_product_manufacturer", value=manufacturer.legal_name,
            idempotency_key=request.idempotency_key,
        ),
    )
    return {
        "manufacturer_party_id": created["manufacturer_party_id"],
        "legal_name": created["legal_name"], "row_version": created["row_version"],
        "idempotency_replayed": created["idempotency_replayed"],
    }


@router.post("/products/setup")
def configure_product_draft(
    request: MCPProductSetup,
    context: ActionContext = Depends(get_action_context),
    db: Session = Depends(get_db),
):
    setup = CanonicalProductSetupWrite.model_validate(
        request.model_dump(exclude={"product_id", "idempotency_key"})
    )
    configured = _run_master_write(
        db,
        context,
        "catalog.product_draft.configure",
        lambda: _execute_idempotent_product_setup(db, context, request, setup),
    )
    return {
        "product_id": configured["product_id"],
        "product_code": configured["product_code"],
        "product_name": configured["product_name"],
        "row_version": configured["new_row_version"],
        "idempotency_replayed": configured["idempotency_replayed"],
        "lifecycle_status": "draft",
        "message": "Product details saved for review",
    }


@router.post("/products/activate")
def activate_product(
    request: MCPProductActivation,
    context: ActionContext = Depends(get_action_context),
    db: Session = Depends(get_db),
):
    activation = CanonicalProductActivationWrite.model_validate(
        request.model_dump(exclude={"product_id", "idempotency_key"})
    )
    activated = _run_master_write(
        db,
        context,
        PRODUCT_ACTIVATION_OPERATION,
        lambda: _execute_canonical_product_activation(
            db,
            org_id=context.organization_id,
            product_id=request.product_id,
            activation=activation,
            idempotency_key=request.idempotency_key,
        ),
    )
    return {
        "product_id": activated["product_id"],
        "product_code": activated["product_code"],
        "product_name": activated["product_name"],
        "row_version": activated["new_row_version"],
        "idempotency_replayed": activated["idempotency_replayed"],
        "lifecycle_status": "active",
        "message": "Product activated and ready for purchasing and sale",
    }


@router.post("/customers")
def create_customer(
    request: MCPCustomerCreate,
    context: ActionContext = Depends(get_action_context),
    db: Session = Depends(get_db),
):
    customer = CanonicalCustomerCreate.model_validate(
        request.model_dump(exclude={"idempotency_key"})
    )
    return _run_master_write(
        db,
        context,
        "parties.customer.create",
        lambda: _execute_canonical_customer_create(
            db, context.organization_id, customer, request.idempotency_key
        ),
    )


@router.post("/suppliers")
def create_supplier(
    request: MCPSupplierCreate,
    context: ActionContext = Depends(get_action_context),
    db: Session = Depends(get_db),
):
    supplier = CanonicalSupplierCreate.model_validate(
        request.model_dump(exclude={"idempotency_key"})
    )
    return _run_master_write(
        db,
        context,
        "parties.supplier.create",
        lambda: _execute_canonical_supplier_create(
            db, context.organization_id, supplier, request.idempotency_key
        ),
    )


@router.post("/customers/update")
def update_customer(
    request: MCPCustomerUpdate,
    context: ActionContext = Depends(get_action_context),
    db: Session = Depends(get_db),
):
    update = CanonicalCustomerUpdate.model_validate(
        request.model_dump(exclude={"customer_id", "idempotency_key"}, exclude_unset=True)
    )
    fields = update.model_fields_set - {"account_row_version", "party_row_version"}

    def execute():
        changed = canonical_write_commands.update_customer_account(
            db,
            org_id=context.organization_id,
            customer_id=request.customer_id,
            expected_account_row_version=update.account_row_version,
            expected_party_row_version=update.party_row_version,
            set_customer_name="customer_name" in fields,
            customer_name=update.customer_name,
            set_customer_type="customer_type" in fields,
            customer_type=update.customer_type,
            set_primary_phone="primary_phone" in fields,
            primary_phone=update.primary_phone,
            set_primary_email="primary_email" in fields,
            primary_email=str(update.primary_email) if update.primary_email else None,
            set_contact_person_name="contact_person_name" in fields,
            contact_person_name=update.contact_person_name,
            set_pan="pan_number" in fields,
            pan=update.pan_number,
            set_credit_limit="credit_limit" in fields,
            credit_limit=update.credit_limit,
            set_credit_days="credit_days" in fields,
            credit_days=update.credit_days,
            idempotency_key_hash=hashlib.sha256(
                request.idempotency_key.encode("utf-8")
            ).digest(),
        )
        return {
            "customer_id": changed["customer_account_id"],
            "party_id": changed["party_id"],
            "customer_code": changed["customer_code"],
            "customer_name": changed["updated_customer_name"],
            "customer_type": changed["updated_customer_type"],
            "primary_phone": changed["updated_primary_phone"],
            "primary_email": changed["updated_primary_email"],
            "contact_person_name": changed["updated_contact_person_name"],
            "pan_number": changed["updated_pan"],
            "credit_limit": money_json(changed["updated_credit_limit"]),
            "credit_days": changed["updated_credit_days"],
            "account_row_version": changed["account_row_version"],
            "party_row_version": changed["party_row_version"],
            "idempotency_replayed": changed["idempotency_replayed"],
        }

    return _run_master_write(
        db, context, CUSTOMER_UPDATE_OPERATION, execute
    )


@router.post("/suppliers/update")
def update_supplier(
    request: MCPSupplierUpdate,
    context: ActionContext = Depends(get_action_context),
    db: Session = Depends(get_db),
):
    update = CanonicalSupplierUpdate.model_validate(
        request.model_dump(exclude={"supplier_id", "idempotency_key"}, exclude_unset=True)
    )
    fields = update.model_fields_set - {"account_row_version", "party_row_version"}

    def execute():
        changed = canonical_write_commands.update_supplier_account(
            db,
            org_id=context.organization_id,
            supplier_id=request.supplier_id,
            expected_account_row_version=update.account_row_version,
            expected_party_row_version=update.party_row_version,
            set_supplier_name="supplier_name" in fields,
            supplier_name=update.supplier_name,
            set_primary_phone="primary_phone" in fields,
            primary_phone=update.primary_phone,
            set_primary_email="primary_email" in fields,
            primary_email=str(update.primary_email) if update.primary_email else None,
            set_contact_person_name="contact_person" in fields,
            contact_person_name=update.contact_person,
            set_pan="pan_number" in fields,
            pan=update.pan_number,
            set_payment_days="payment_days" in fields,
            payment_days=update.payment_days,
            idempotency_key_hash=hashlib.sha256(
                request.idempotency_key.encode("utf-8")
            ).digest(),
        )
        return {
            "supplier_id": changed["supplier_account_id"],
            "party_id": changed["party_id"],
            "supplier_code": changed["supplier_code"],
            "supplier_name": changed["updated_supplier_name"],
            "primary_phone": changed["updated_primary_phone"],
            "primary_email": changed["updated_primary_email"],
            "contact_person": changed["updated_contact_person_name"],
            "pan_number": changed["updated_pan"],
            "payment_days": changed["updated_payment_days"],
            "account_row_version": changed["account_row_version"],
            "party_row_version": changed["party_row_version"],
            "idempotency_replayed": changed["idempotency_replayed"],
        }

    return _run_master_write(
        db, context, SUPPLIER_UPDATE_OPERATION, execute
    )


@router.post("/drug-licenses")
def record_drug_license(
    request: MCPDrugLicenseRecord,
    context: ActionContext = Depends(get_action_context),
    db: Session = Depends(get_db),
):
    def execute():
        evidence_branch_id = db.execute(
            text(
                """SELECT branch.id FROM core.branches branch
                     WHERE branch.org_id=:org_id AND branch.code=:branch_code
                       AND branch.status='active'
                       AND erp_security.can_access_branch(branch.id)"""
            ),
            {
                "org_id": context.organization_id,
                "branch_code": request.evidence_branch_code,
            },
        ).scalar_one_or_none()
        if evidence_branch_id is None:
            raise HTTPException(
                status_code=422,
                detail="Evidence branch code is not active or accessible",
            )
        if request.subject_kind == "branch":
            subject_id = db.execute(
                text(
                    """SELECT branch.id FROM core.branches branch
                         WHERE branch.org_id=:org_id AND branch.code=:subject_code
                           AND branch.status='active'
                           AND erp_security.can_access_branch(branch.id)"""
                ),
                {
                    "org_id": context.organization_id,
                    "subject_code": request.subject_code,
                },
            ).scalar_one_or_none()
        else:
            subject_id = db.execute(
                text(
                    """SELECT supplier.party_id
                         FROM parties.supplier_accounts supplier
                         JOIN parties.parties party
                           ON party.org_id=supplier.org_id
                          AND party.id=supplier.party_id
                        WHERE supplier.org_id=:org_id
                          AND supplier.supplier_code=:subject_code
                          AND supplier.status='active' AND party.status='active'"""
                ),
                {
                    "org_id": context.organization_id,
                    "subject_code": request.subject_code,
                },
            ).scalar_one_or_none()
        if subject_id is None:
            raise HTTPException(
                status_code=422,
                detail=f"{request.subject_kind.title()} code is not active or accessible",
            )
        evidence_rows = db.execute(
            text(
                """SELECT attachment.id
                     FROM core.attachments attachment
                    WHERE attachment.org_id=:org_id
                      AND attachment.branch_id=:branch_id
                      AND attachment.evidence_kind='drug_license_evidence'
                      AND attachment.original_filename=:filename
                      AND attachment.document_date=:issued_on
                      AND attachment.status IN ('verified','retained')
                      AND attachment.verified_at IS NOT NULL
                      AND attachment.legal_hold=true
                    ORDER BY attachment.id"""
            ),
            {
                "org_id": context.organization_id,
                "branch_id": evidence_branch_id,
                "filename": request.evidence_filename,
                "issued_on": request.issued_on,
            },
        ).scalars().all()
        if len(evidence_rows) != 1:
            detail = (
                "No matching verified licence PDF was found"
                if not evidence_rows
                else "More than one verified PDF has this filename and issue date"
            )
            raise HTTPException(status_code=422, detail=detail)
        canonical_request = DrugLicenseRecordRequest(
            subject_kind=request.subject_kind,
            subject_id=subject_id,
            evidence_branch_id=evidence_branch_id,
            license_type_code=request.license_type_code,
            license_number=request.license_number,
            issuing_authority=request.issuing_authority,
            jurisdiction_code=request.jurisdiction_code,
            issued_on=request.issued_on,
            valid_from=request.valid_from,
            next_verification_due_on=request.next_verification_due_on,
            evidence_attachment_id=evidence_rows[0],
            reviewed=request.reviewed,
            idempotency_key=request.idempotency_key,
        )
        result = execute_drug_license_record(
            db,
            org_id=context.organization_id,
            actor_id=context.membership_id,
            request=canonical_request,
        )
        rows = _license_rows(
            db, context.organization_id, UUID(str(result["recorded_license_id"]))
        )
        if len(rows) != 1:
            raise HTTPException(status_code=409, detail="License readback is unavailable")
        return {
            "license": rows[0],
            "idempotency_replayed": result["idempotency_replayed"],
            "controlled_drug_scope": "unsupported",
        }

    return _run_master_write(
        db, context, DRUG_LICENSE_RECORD_OPERATION, execute
    )
