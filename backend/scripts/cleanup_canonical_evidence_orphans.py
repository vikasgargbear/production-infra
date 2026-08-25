#!/usr/bin/env python3
"""List or delete explicitly scoped canonical evidence-storage orphans."""

from __future__ import annotations

import argparse
from datetime import datetime
import json
from uuid import UUID

from sqlalchemy import text

from app.core.database import engine
from app.infrastructure.evidence_storage import (
    EVIDENCE_BUCKET,
    configured_evidence_storage,
)


def _utc_timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise argparse.ArgumentTypeError("cutoff must include an explicit UTC offset")
    return parsed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--organization-id", required=True, type=UUID)
    parser.add_argument("--branch-id", required=True, type=UUID)
    parser.add_argument("--auth-user-id", required=True, type=UUID)
    parser.add_argument("--created-before", required=True, type=_utc_timestamp)
    parser.add_argument(
        "--delete",
        action="store_true",
        help="Delete exact resolved object keys; omitted means read-only preview.",
    )
    args = parser.parse_args()

    with engine.begin() as connection:
        connection.execute(
            text("SELECT erp_security.activate_context(:auth_user_id,:org_id)"),
            {
                "auth_user_id": args.auth_user_id,
                "org_id": args.organization_id,
            },
        )
        rows = connection.execute(
            text(
                """
                SELECT attachment.id,attachment.status,
                       attachment.storage_object_path,attachment.created_at
                  FROM core.attachments AS attachment
                 WHERE attachment.org_id=:org_id
                   AND attachment.branch_id=:branch_id
                   AND attachment.storage_bucket=:bucket
                   AND attachment.status IN ('pending_upload','rejected')
                   AND NOT attachment.legal_hold
                   AND attachment.created_at<:created_before
                   AND erp_security.has_permission(
                         'core.attachment.manage',attachment.branch_id
                       )
                 ORDER BY attachment.created_at,attachment.id
                """
            ),
            {
                "org_id": args.organization_id,
                "branch_id": args.branch_id,
                "bucket": EVIDENCE_BUCKET,
                "created_before": args.created_before,
            },
        ).mappings().all()

    storage = configured_evidence_storage() if args.delete else None
    results = []
    for row in rows:
        deleted = storage.delete(row["storage_object_path"]) if storage else False
        results.append(
            {
                "attachment_id": str(row["id"]),
                "status": row["status"],
                "created_at": row["created_at"].isoformat(),
                "object_deleted": deleted,
                "mode": "delete" if args.delete else "preview",
            }
        )
    print(json.dumps({"candidate_count": len(results), "candidates": results}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
