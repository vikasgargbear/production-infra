"""Authenticated canonical evidence upload and integrity readback."""

from __future__ import annotations

from datetime import date, datetime
import hashlib
from typing import Literal, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Security, UploadFile
from fastapi.security import HTTPBearer
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.security.permissions import PermissionChecker
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
    prefix="/web/evidence",
    tags=["Canonical Evidence"],
    dependencies=[Security(HTTPBearer(auto_error=False))],
)
EXPENSE_RECEIPT_KIND = "expense_receipt"


def evidence_storage_dependency() -> SupabaseEvidenceStorage:
    try:
        return configured_evidence_storage()
    except EvidenceStorageUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


class EvidenceAttachmentResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    organization_id: UUID
    branch_id: UUID
    attachment_id: UUID
    evidence_kind: Literal["expense_receipt"]
    original_filename: str
    media_type: Literal["application/pdf"]
    byte_size: int
    sha256: str
    document_date: date
    retention_until: date
    legal_hold: bool
    status: Literal["pending_upload", "verified", "rejected", "retained"]
    verified_at: Optional[datetime]
    idempotency_replayed: bool = False


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
            SELECT erp_security.activate_context(:auth_user_id, :org_id),
                   pg_catalog.set_config('app.request_id', :request_id, true)
            """
        ),
        {
            "auth_user_id": auth_user_id,
            "org_id": org_id,
            "request_id": str(uuid4()),
        },
    )
    return org_id, auth_user_id


def _upload_context(
    db: Session, user: dict, branch_id: UUID, document_date: date
) -> dict:
    org_id, _ = _activate(db, user)
    rows = db.execute(
        text(
            """
            SELECT organization.id AS organization_id,
                   branch.id AS branch_id,
                   (pg_catalog.transaction_timestamp()
                       AT TIME ZONE organization.timezone)::date AS business_date,
                   (CAST(:document_date AS date)
                       + pg_catalog.make_interval(
                           months => policy.value_numeric::integer
                         ))::date AS retention_until
              FROM core.organizations AS organization
              JOIN core.branches AS branch
                ON branch.org_id=organization.id
               AND branch.id=:branch_id
              JOIN core.settings AS policy
                ON policy.org_id=organization.id
               AND policy.scope_kind='organization'
               AND policy.branch_id IS NULL
               AND policy.namespace='evidence_retention'
               AND policy.key='expense_receipt_months'
               AND policy.status='active'
               AND policy.value_type='numeric'
               AND policy.value_numeric=pg_catalog.trunc(policy.value_numeric)
               AND policy.value_numeric BETWEEN 1 AND 1200
             WHERE organization.id=:org_id
               AND organization.status='active'
               AND branch.status='active'
               AND erp_security.can_access_branch(branch.id)
               AND erp_security.has_permission('core.attachment.manage',branch.id)
               AND erp_security.has_permission('finance.expense.manage',branch.id)
            """
        ),
        {
            "org_id": org_id,
            "branch_id": branch_id,
            "document_date": document_date,
        },
    ).mappings().all()
    if len(rows) != 1:
        raise HTTPException(
            status_code=409,
            detail=(
                "A single active branch authority and reviewed expense-receipt "
                "retention policy are required before upload"
            ),
        )
    context = dict(rows[0])
    if document_date > context["business_date"]:
        raise HTTPException(
            status_code=422,
            detail="Expense receipt date cannot be after the canonical business date",
        )
    return context


def _attachment_row(
    db: Session, org_id: UUID, branch_id: UUID, attachment_id: UUID
) -> dict | None:
    row = db.execute(
        text(
            """
            SELECT attachment.org_id AS organization_id,
                   attachment.branch_id,
                   attachment.id AS attachment_id,
                   attachment.evidence_kind,
                   attachment.original_filename,
                   attachment.media_type,
                   attachment.byte_size,
                   pg_catalog.encode(attachment.sha256,'hex') AS sha256,
                   attachment.document_date,
                   attachment.retention_until,
                   attachment.legal_hold,
                   attachment.status,
                   attachment.verified_at,
                   attachment.storage_object_path
              FROM core.attachments AS attachment
             WHERE attachment.org_id=:org_id
               AND attachment.branch_id=:branch_id
               AND attachment.id=:attachment_id
               AND erp_security.has_permission(
                     'core.attachment.manage',attachment.branch_id
                   )
               AND erp_security.has_permission(
                     'finance.expense.manage',attachment.branch_id
                   )
            """
        ),
        {
            "org_id": org_id,
            "branch_id": branch_id,
            "attachment_id": attachment_id,
        },
    ).mappings().one_or_none()
    return dict(row) if row else None


def _response(row: dict, *, replayed: bool) -> EvidenceAttachmentResponse:
    public = {key: value for key, value in row.items() if key != "storage_object_path"}
    return EvidenceAttachmentResponse(**public, idempotency_replayed=replayed)


def _transition(
    db: Session,
    user: dict,
    *,
    org_id: UUID,
    branch_id: UUID,
    attachment_id: UUID,
    status: Literal["verified", "rejected"],
) -> dict:
    _activate(db, user)
    row = db.execute(
        text(
            """
            UPDATE core.attachments
               SET status=:status,
                   verified_at=CASE WHEN :status='verified'
                                    THEN pg_catalog.transaction_timestamp()
                                    ELSE NULL END
             WHERE org_id=:org_id
               AND branch_id=:branch_id
               AND id=:attachment_id
               AND status='pending_upload'
            RETURNING org_id AS organization_id,branch_id,id AS attachment_id,
                      evidence_kind,original_filename,media_type,byte_size,
                      pg_catalog.encode(sha256,'hex') AS sha256,document_date,
                      retention_until,legal_hold,status,verified_at,
                      storage_object_path
            """
        ),
        {
            "status": status,
            "org_id": org_id,
            "branch_id": branch_id,
            "attachment_id": attachment_id,
        },
    ).mappings().one_or_none()
    if row is None:
        existing = _attachment_row(db, org_id, branch_id, attachment_id)
        if existing is None or existing["status"] != status:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail="Evidence lifecycle changed before integrity finalization",
            )
        db.rollback()
        return existing
    value = dict(row)
    db.commit()
    return value


def _verify_stored_bytes(storage: SupabaseEvidenceStorage, row: dict) -> None:
    stored = storage.read(row["storage_object_path"])
    validate_pdf(row["original_filename"], row["media_type"], stored)
    if len(stored) != row["byte_size"] or hashlib.sha256(stored).hexdigest() != row["sha256"]:
        raise EvidenceIntegrityError(
            "Stored evidence bytes differ from canonical attachment metadata"
        )


@router.post("/expense-receipts", response_model=EvidenceAttachmentResponse)
def upload_expense_receipt(
    branch_id: UUID = Form(...),
    document_date: date = Form(...),
    file: UploadFile = File(...),
    user: dict = Depends(PermissionChecker("payment", "create")),
    db: Session = Depends(get_db),
    storage: SupabaseEvidenceStorage = Depends(evidence_storage_dependency),
) -> EvidenceAttachmentResponse:
    """Validate, store, read back, hash, and only then verify one receipt PDF."""

    content = file.file.read(MAX_EVIDENCE_BYTES + 1)
    try:
        pdf = validate_pdf(file.filename, file.content_type, content)
    except EvidenceIntegrityError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    context = _upload_context(db, user, branch_id, document_date)
    org_id = context["organization_id"]
    digest = hashlib.sha256(pdf.content).hexdigest()
    object_key = evidence_object_key(
        str(org_id), str(branch_id), EXPENSE_RECEIPT_KIND, digest
    )
    attachment_id = uuid4()
    inserted = db.execute(
        text(
            """
            INSERT INTO core.attachments (
                org_id,branch_id,id,storage_bucket,storage_object_path,
                original_filename,media_type,byte_size,sha256,evidence_kind,
                document_date,retention_until,legal_hold,status
            ) VALUES (
                :org_id,:branch_id,:attachment_id,:storage_bucket,:object_key,
                :original_filename,'application/pdf',:byte_size,
                pg_catalog.decode(:sha256,'hex'),'expense_receipt',
                :document_date,:retention_until,false,'pending_upload'
            )
            ON CONFLICT (org_id,storage_bucket,storage_object_path) DO NOTHING
            RETURNING id
            """
        ),
        {
            "org_id": org_id,
            "branch_id": branch_id,
            "attachment_id": attachment_id,
            "storage_bucket": EVIDENCE_BUCKET,
            "object_key": object_key,
            "original_filename": pdf.filename,
            "byte_size": len(pdf.content),
            "sha256": digest,
            "document_date": document_date,
            "retention_until": context["retention_until"],
        },
    ).scalar_one_or_none()
    if inserted is None:
        row = db.execute(
            text(
                """
                SELECT id FROM core.attachments
                 WHERE org_id=:org_id AND branch_id=:branch_id
                   AND storage_bucket=:storage_bucket
                   AND storage_object_path=:object_key
                   AND evidence_kind='expense_receipt'
                   AND sha256=pg_catalog.decode(:sha256,'hex')
                   AND byte_size=:byte_size
                   AND original_filename=:original_filename
                   AND document_date=:document_date
                """
            ),
            {
                "org_id": org_id,
                "branch_id": branch_id,
                "storage_bucket": EVIDENCE_BUCKET,
                "object_key": object_key,
                "sha256": digest,
                "byte_size": len(pdf.content),
                "original_filename": pdf.filename,
                "document_date": document_date,
            },
        ).scalar_one_or_none()
        if row is None:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail="Evidence object identity conflicts with existing canonical metadata",
            )
        attachment_id = row
    db.commit()

    _activate(db, user)
    current = _attachment_row(db, org_id, branch_id, attachment_id)
    db.rollback()
    if current is None:
        raise HTTPException(status_code=409, detail="Canonical evidence metadata disappeared")
    if current["status"] in ("verified", "retained"):
        try:
            _verify_stored_bytes(storage, current)
        except (EvidenceStorageUnavailable, EvidenceIntegrityError) as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return _response(current, replayed=True)
    if current["status"] == "rejected":
        raise HTTPException(
            status_code=409,
            detail="This content identity was rejected and cannot be presented as verified",
        )

    try:
        storage.create(object_key, pdf.content)
        _verify_stored_bytes(storage, current)
    except EvidenceIntegrityError as exc:
        rejected = _transition(
            db,
            user,
            org_id=org_id,
            branch_id=branch_id,
            attachment_id=attachment_id,
            status="rejected",
        )
        try:
            storage.delete(object_key)
        except EvidenceStorageUnavailable:
            pass
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except EvidenceStorageUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    verified = _transition(
        db,
        user,
        org_id=org_id,
        branch_id=branch_id,
        attachment_id=attachment_id,
        status="verified",
    )
    return _response(verified, replayed=inserted is None)


@router.get("/{attachment_id}", response_model=EvidenceAttachmentResponse)
def evidence_integrity_readback(
    attachment_id: UUID,
    branch_id: UUID,
    user: dict = Depends(PermissionChecker("payment", "view")),
    db: Session = Depends(get_db),
) -> EvidenceAttachmentResponse:
    """Return branch-scoped canonical metadata without exposing object bytes or URLs."""

    org_id, _ = _activate(db, user)
    row = _attachment_row(db, org_id, branch_id, attachment_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Evidence attachment not found")
    return _response(row, replayed=False)
