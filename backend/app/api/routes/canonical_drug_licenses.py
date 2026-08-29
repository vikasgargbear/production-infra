"""Reviewed branch and supplier Forms 20B/21B setup authority."""

from __future__ import annotations

from datetime import date, datetime
import hashlib
from typing import Literal, Optional
from uuid import UUID, uuid4, uuid5

from fastapi import APIRouter, Depends, File, Form, HTTPException, Security, UploadFile
from fastapi.security import HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.security.permissions import ExactPermissionChecker
from ...infrastructure import canonical_write_commands
from ...infrastructure.evidence_storage import (
    EVIDENCE_BUCKET,
    MAX_EVIDENCE_BYTES,
    EvidenceIntegrityError,
    EvidenceStorageUnavailable,
    SupabaseEvidenceStorage,
    configured_evidence_storage,
    evidence_object_key,
    validate_pdf,
)


router = APIRouter(
    prefix="/canonical/compliance/drug-licenses",
    tags=["Drug Licenses"],
    dependencies=[Security(HTTPBearer(auto_error=False))],
)
LICENSE_TYPES = ("drug_wholesale_form_20b", "drug_wholesale_form_21b")
LICENSE_EVIDENCE_KIND = "drug_license_evidence"
LICENSE_PERMISSION = Depends(ExactPermissionChecker("compliance.license.manage"))


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class LicenseSubjectOption(StrictModel):
    id: UUID
    code: str
    name: str


class LicenseReadback(StrictModel):
    license_id: UUID
    subject_kind: Literal["branch", "supplier"]
    subject_id: UUID
    subject_code: str
    subject_name: str
    evidence_branch_id: UUID
    license_type_code: Literal[
        "drug_wholesale_form_20b", "drug_wholesale_form_21b"
    ]
    license_number: str
    issuing_authority: str
    jurisdiction_code: str
    issued_on: date
    valid_from: date
    next_verification_due_on: date
    evidence_attachment_id: UUID
    evidence_filename: str
    evidence_sha256: str
    status: Literal["active"]
    verified_at: datetime
    row_version: int


class LicenseSetupContext(StrictModel):
    business_date: date
    branches: list[LicenseSubjectOption]
    suppliers: list[LicenseSubjectOption]
    licenses: list[LicenseReadback]
    supported_license_types: list[str]
    controlled_drug_scope: Literal["unsupported"] = "unsupported"
    controlled_drug_message: str


class DrugLicenseEvidenceResponse(StrictModel):
    attachment_id: UUID
    branch_id: UUID
    evidence_kind: Literal["drug_license_evidence"]
    original_filename: str
    media_type: Literal["application/pdf"]
    byte_size: int
    sha256: str
    document_date: date
    status: Literal["verified", "retained"]
    verified_at: datetime
    idempotency_replayed: bool


class DrugLicenseRecordRequest(StrictModel):
    subject_kind: Literal["branch", "supplier"]
    subject_id: UUID
    evidence_branch_id: UUID
    license_type_code: Literal[
        "drug_wholesale_form_20b", "drug_wholesale_form_21b"
    ]
    license_number: str = Field(min_length=1, max_length=128)
    issuing_authority: str = Field(min_length=1, max_length=500)
    jurisdiction_code: str = Field(min_length=1, max_length=32)
    issued_on: date
    valid_from: date
    next_verification_due_on: date
    evidence_attachment_id: UUID
    reviewed: Literal[True]
    idempotency_key: str = Field(
        min_length=8, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"
    )

    @model_validator(mode="after")
    def validate_dates(self):
        if self.issued_on > self.valid_from:
            raise ValueError("valid_from must be on or after issued_on")
        if self.next_verification_due_on < self.valid_from:
            raise ValueError("next verification must be on or after valid_from")
        return self


class DrugLicenseRecordResponse(StrictModel):
    license: LicenseReadback
    idempotency_replayed: bool


def _uuid_claim(user: dict, name: str) -> UUID:
    try:
        return UUID(str(user[name]))
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail=f"Invalid ERP {name} claim") from exc


def _activate(db: Session, user: dict) -> tuple[UUID, UUID]:
    org_id = _uuid_claim(user, "org_id")
    auth_user_id = _uuid_claim(user, "auth_user_id")
    db.execute(
        text(
            """
            SELECT erp_security.activate_context(:auth_user_id,:org_id),
                   pg_catalog.set_config('app.request_id',:request_id,true)
            """
        ),
        {"auth_user_id": auth_user_id, "org_id": org_id, "request_id": str(uuid4())},
    )
    actor_id = db.execute(
        text("SELECT erp_security.current_membership_id()")
    ).scalar_one()
    return org_id, UUID(str(actor_id))


def _raise_database_error(exc: DBAPIError) -> None:
    sqlstate = getattr(exc.orig, "sqlstate", None) or getattr(exc.orig, "pgcode", None)
    mapped = {
        "22023": (422, "License details or effective dates are invalid"),
        "23505": (409, "This license or idempotency identity already exists"),
        "23514": (409, "Verified effective license evidence is incomplete"),
        "23P01": (409, "An effective license of this form already covers this holder"),
        "40001": (409, "License evidence changed; reload before retrying"),
        "42501": (403, "Drug license management is not authorized"),
        "55000": (409, "License request is no longer executable"),
    }.get(sqlstate)
    if mapped is None:
        raise exc
    raise HTTPException(status_code=mapped[0], detail=mapped[1]) from exc


def _license_rows(db: Session, org_id: UUID, license_id: Optional[UUID] = None) -> list[dict]:
    return [
        dict(row)
        for row in db.execute(
            text(
                """
                SELECT license.id AS license_id,
                       CASE WHEN license.branch_id IS NOT NULL
                            THEN 'branch' ELSE 'supplier' END AS subject_kind,
                       COALESCE(license.branch_id,license.party_id) AS subject_id,
                       COALESCE(branch.code,supplier.supplier_code) AS subject_code,
                       COALESCE(branch.name,party.legal_name) AS subject_name,
                       evidence.branch_id AS evidence_branch_id,
                       license.license_type_code,license.license_number,
                       license.issuing_authority,license.jurisdiction_code,
                       license.issued_on,license.valid_from,
                       license.next_verification_due_on,
                       license.evidence_attachment_id,
                       evidence.original_filename AS evidence_filename,
                       pg_catalog.encode(evidence.sha256,'hex') AS evidence_sha256,
                       license.status,license.verified_at,license.row_version
                  FROM compliance.licenses license
                  JOIN core.attachments evidence
                    ON evidence.org_id=license.org_id
                   AND evidence.id=license.evidence_attachment_id
                  LEFT JOIN core.branches branch
                    ON branch.org_id=license.org_id AND branch.id=license.branch_id
                  LEFT JOIN parties.parties party
                    ON party.org_id=license.org_id AND party.id=license.party_id
                  LEFT JOIN parties.supplier_accounts supplier
                    ON supplier.org_id=license.org_id AND supplier.party_id=license.party_id
                 WHERE license.org_id=:org_id
                   AND license.license_type_code IN (
                     'drug_wholesale_form_20b','drug_wholesale_form_21b'
                   )
                   AND license.status='active'
                   AND (:license_id IS NULL OR license.id=:license_id)
                 ORDER BY subject_kind,subject_name,license.license_type_code,license.id
                """
            ),
            {"org_id": org_id, "license_id": license_id},
        ).mappings().all()
    ]


def execute_drug_license_record(
    db: Session,
    *,
    org_id: UUID,
    actor_id: UUID,
    request: DrugLicenseRecordRequest,
) -> dict:
    license_id = uuid5(org_id, f"drug-license:{request.idempotency_key}")
    result = canonical_write_commands.record_effective_wholesale_license(
        db,
        org_id=org_id,
        license_id=license_id,
        actor_id=actor_id,
        subject_branch_id=request.subject_id if request.subject_kind == "branch" else None,
        subject_party_id=request.subject_id if request.subject_kind == "supplier" else None,
        evidence_branch_id=request.evidence_branch_id,
        license_type_code=request.license_type_code,
        license_number=request.license_number,
        issuing_authority=request.issuing_authority,
        jurisdiction_code=request.jurisdiction_code,
        issued_on=request.issued_on,
        valid_from=request.valid_from,
        next_verification_due_on=request.next_verification_due_on,
        evidence_attachment_id=request.evidence_attachment_id,
        idempotency_key_hash=hashlib.sha256(request.idempotency_key.encode()).digest(),
    )
    return result


@router.get("/setup", response_model=LicenseSetupContext)
def setup_context(
    user: dict = LICENSE_PERMISSION,
    db: Session = Depends(get_db),
) -> LicenseSetupContext:
    org_id, _ = _activate(db, user)
    business_date = db.execute(
        text(
            """SELECT (pg_catalog.transaction_timestamp() AT TIME ZONE timezone)::date
                   FROM core.organizations WHERE id=:org_id AND status='active'"""
        ),
        {"org_id": org_id},
    ).scalar_one()
    branches = db.execute(
        text(
            """SELECT id,code,name FROM core.branches
                 WHERE org_id=:org_id AND status='active'
                   AND erp_security.can_access_branch(id)
                 ORDER BY name,id"""
        ),
        {"org_id": org_id},
    ).mappings().all()
    suppliers = db.execute(
        text(
            """SELECT supplier.party_id AS id,supplier.supplier_code AS code,
                      party.legal_name AS name
                 FROM parties.supplier_accounts supplier
                 JOIN parties.parties party ON party.org_id=supplier.org_id
                   AND party.id=supplier.party_id
                WHERE supplier.org_id=:org_id AND supplier.status='active'
                  AND party.status='active' ORDER BY party.legal_name,supplier.id LIMIT 500"""
        ),
        {"org_id": org_id},
    ).mappings().all()
    return LicenseSetupContext(
        business_date=business_date,
        branches=[LicenseSubjectOption(**row) for row in branches],
        suppliers=[LicenseSubjectOption(**row) for row in suppliers],
        licenses=[LicenseReadback(**row) for row in _license_rows(db, org_id)],
        supported_license_types=list(LICENSE_TYPES),
        controlled_drug_message=(
            "Schedule H/H1/X and NDPS movements are not enabled by this setup. "
            "Forms 20B/21B do not bypass controlled-drug registers or approvals."
        ),
    )


def _storage_dependency() -> SupabaseEvidenceStorage:
    try:
        return configured_evidence_storage()
    except EvidenceStorageUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _attachment_row(db: Session, org_id: UUID, branch_id: UUID, attachment_id: UUID):
    return db.execute(
        text(
            """
            SELECT id AS attachment_id,branch_id,evidence_kind,original_filename,
                   media_type,byte_size,pg_catalog.encode(sha256,'hex') AS sha256,
                   document_date,status,verified_at,storage_object_path
              FROM core.attachments
             WHERE org_id=:org_id AND branch_id=:branch_id AND id=:attachment_id
               AND evidence_kind='drug_license_evidence'
            """
        ),
        {"org_id": org_id, "branch_id": branch_id, "attachment_id": attachment_id},
    ).mappings().one_or_none()


@router.post("/evidence", response_model=DrugLicenseEvidenceResponse)
def upload_license_evidence(
    branch_id: UUID = Form(...),
    issued_on: date = Form(...),
    file: UploadFile = File(...),
    user: dict = LICENSE_PERMISSION,
    db: Session = Depends(get_db),
    storage: SupabaseEvidenceStorage = Depends(_storage_dependency),
) -> DrugLicenseEvidenceResponse:
    content = file.file.read(MAX_EVIDENCE_BYTES + 1)
    try:
        pdf = validate_pdf(file.filename, file.content_type, content)
    except EvidenceIntegrityError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    org_id, _ = _activate(db, user)
    digest = hashlib.sha256(pdf.content).hexdigest()
    object_key = evidence_object_key(str(org_id), str(branch_id), LICENSE_EVIDENCE_KIND, digest)
    attachment_id = uuid4()
    try:
        initiated = canonical_write_commands.initiate_drug_license_attachment(
            db,
            org_id=org_id,
            branch_id=branch_id,
            attachment_id=attachment_id,
            storage_bucket=EVIDENCE_BUCKET,
            storage_object_path=object_key,
            original_filename=pdf.filename,
            byte_size=len(pdf.content),
            sha256=bytes.fromhex(digest),
            document_date=issued_on,
        )
        attachment_id = initiated["attachment_id"]
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        _raise_database_error(exc)
    _activate(db, user)
    current = _attachment_row(db, org_id, branch_id, attachment_id)
    db.rollback()
    if current is None:
        raise HTTPException(status_code=409, detail="License evidence metadata disappeared")
    if current["status"] in ("verified", "retained"):
        try:
            stored = storage.read(current["storage_object_path"])
            if (
                len(stored) != current["byte_size"]
                or hashlib.sha256(stored).hexdigest() != current["sha256"]
            ):
                raise EvidenceIntegrityError(
                    "Stored license evidence differs from verified metadata"
                )
        except (EvidenceIntegrityError, EvidenceStorageUnavailable) as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return DrugLicenseEvidenceResponse(
            **{k: v for k, v in current.items() if k != "storage_object_path"},
            idempotency_replayed=True,
        )
    if current["status"] == "rejected":
        raise HTTPException(
            status_code=409,
            detail="This PDF identity was rejected and cannot be presented as verified",
        )
    try:
        storage.create(object_key, pdf.content)
        stored = storage.read(object_key)
        if len(stored) != len(pdf.content) or hashlib.sha256(stored).hexdigest() != digest:
            raise EvidenceIntegrityError("Stored license evidence differs from uploaded PDF")
        _activate(db, user)
        canonical_write_commands.transition_drug_license_attachment(
            db, org_id=org_id, branch_id=branch_id,
            attachment_id=attachment_id, target_status="verified"
        )
        db.commit()
    except EvidenceIntegrityError as exc:
        db.rollback()
        _activate(db, user)
        canonical_write_commands.transition_drug_license_attachment(
            db, org_id=org_id, branch_id=branch_id,
            attachment_id=attachment_id, target_status="rejected"
        )
        db.commit()
        try:
            storage.delete(object_key)
        except EvidenceStorageUnavailable:
            pass
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except EvidenceStorageUnavailable as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    _activate(db, user)
    verified = _attachment_row(db, org_id, branch_id, attachment_id)
    db.rollback()
    return DrugLicenseEvidenceResponse(
        **{k: v for k, v in dict(verified).items() if k != "storage_object_path"},
        idempotency_replayed=initiated["idempotency_replayed"],
    )


@router.post("", response_model=DrugLicenseRecordResponse)
def record_license(
    request: DrugLicenseRecordRequest,
    user: dict = LICENSE_PERMISSION,
    db: Session = Depends(get_db),
) -> DrugLicenseRecordResponse:
    org_id, actor_id = _activate(db, user)
    try:
        result = execute_drug_license_record(
            db, org_id=org_id, actor_id=actor_id, request=request
        )
        license_id = UUID(str(result["recorded_license_id"]))
        row = _license_rows(db, org_id, license_id)
        if len(row) != 1:
            raise HTTPException(status_code=409, detail="License readback is unavailable")
        db.commit()
        return DrugLicenseRecordResponse(
            license=LicenseReadback(**row[0]),
            idempotency_replayed=result["idempotency_replayed"],
        )
    except DBAPIError as exc:
        db.rollback()
        _raise_database_error(exc)


@router.get("/{license_id}", response_model=LicenseReadback)
def license_readback(
    license_id: UUID,
    user: dict = LICENSE_PERMISSION,
    db: Session = Depends(get_db),
) -> LicenseReadback:
    org_id, _ = _activate(db, user)
    rows = _license_rows(db, org_id, license_id)
    if len(rows) != 1:
        raise HTTPException(status_code=404, detail="Drug license not found")
    return LicenseReadback(**rows[0])
