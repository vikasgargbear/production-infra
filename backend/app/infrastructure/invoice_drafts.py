"""SQL boundary for the persisted invoice editor workspace."""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session


def create_invoice_draft(db: Session, **parameters: Any) -> dict[str, Any]:
    row = db.execute(
        text(
            """
            SELECT created_draft_id,new_row_version
              FROM erp_automation_commands.create_invoice_draft(
                :org_id,:draft_id,:document_kind,:branch_id,:title,
                CAST(:payload AS jsonb),:created_via
              )
            """
        ),
        {**parameters, "payload": json.dumps(parameters["payload"])},
    ).mappings().one()
    return dict(row)


def update_invoice_draft(db: Session, **parameters: Any) -> dict[str, Any]:
    row = db.execute(
        text(
            """
            SELECT updated_draft_id,new_row_version
              FROM erp_automation_commands.update_invoice_draft(
                :org_id,:draft_id,:expected_row_version,:set_title,:title,
                CAST(:payload AS jsonb)
              )
            """
        ),
        {**parameters, "payload": json.dumps(parameters["payload"])},
    ).mappings().one()
    return dict(row)


def abandon_invoice_draft(db: Session, **parameters: Any) -> dict[str, Any]:
    row = db.execute(
        text(
            """
            SELECT abandoned_draft_id,new_row_version
              FROM erp_automation_commands.abandon_invoice_draft(
                :org_id,:draft_id,:expected_row_version
              )
            """
        ),
        parameters,
    ).mappings().one()
    return dict(row)


def get_invoice_draft(
    db: Session, *, org_id: UUID, draft_id: UUID
) -> dict[str, Any] | None:
    rows = db.execute(
        text(
            """
            SELECT *
              FROM erp_automation_reads.invoice_draft(:org_id,:draft_id)
            """
        ),
        {"org_id": org_id, "draft_id": draft_id},
    ).mappings().all()
    if len(rows) > 1:
        raise RuntimeError("invoice draft read returned more than one row")
    return dict(rows[0]) if rows else None


def list_invoice_drafts(
    db: Session,
    *,
    org_id: UUID,
    document_kind: str | None,
    status: str | None,
    limit: int,
    offset: int,
    branch_ids: tuple[UUID, ...] | None = None,
) -> tuple[list[dict[str, Any]], int]:
    rows = [
        dict(row)
        for row in db.execute(
            text(
                """
                SELECT *
                  FROM erp_automation_reads.invoice_drafts(
                    :org_id,:document_kind,:status,
                    CAST(:branch_ids AS uuid[]),:limit,:offset
                  )
                """
            ),
            {
                "org_id": org_id,
                "document_kind": document_kind,
                "status": status,
                "limit": limit,
                "offset": offset,
                "branch_ids": list(branch_ids) if branch_ids is not None else None,
            },
        ).mappings().all()
    ]
    total = int(rows[0].pop("total_count")) if rows else 0
    for row in rows[1:]:
        row.pop("total_count", None)
    return rows, total


__all__ = [
    "abandon_invoice_draft",
    "create_invoice_draft",
    "get_invoice_draft",
    "list_invoice_drafts",
    "update_invoice_draft",
]
