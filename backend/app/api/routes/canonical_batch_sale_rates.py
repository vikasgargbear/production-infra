"""Read context only; selling-rate writes use shared operator-action lifecycle."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Security
from fastapi.security import HTTPBearer
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from .canonical_erp_reads import PRODUCT_USER, _activate
from ...core.database import get_db

router = APIRouter(prefix="/canonical/batch-sale-rates", tags=["Batch selling rates"],
                   dependencies=[Security(HTTPBearer(auto_error=False))])


def _read(db, statement, params):
    try:
        return db.execute(text(statement), params).scalar_one()
    except DBAPIError as exc:
        if getattr(exc.orig, "pgcode", None) == "42501":
            raise HTTPException(status_code=403, detail="Selling-rate review is not authorized for this scope") from exc
        raise


@router.get("/context")
def batch_sale_rate_context(branch_id: UUID, limit: int = Query(100, ge=1, le=100),
                           offset: int = Query(0, ge=0), user: dict = PRODUCT_USER,
                           db: Session = Depends(get_db)):
    org = _activate(db, user)
    return _read(db, "SELECT erp_automation_reads.batch_sale_rate_context(:org,:branch,:limit,:offset)",
                 {"org": org, "branch": branch_id, "limit": limit, "offset": offset})


@router.get("/reviews/{command_id}")
def batch_sale_rate_review(command_id: UUID, user: dict = PRODUCT_USER, db: Session = Depends(get_db)):
    org = _activate(db, user)
    return {"organization_id": str(org), "command_request_id": str(command_id), "rows": _read(db,
        "SELECT erp_automation_reads.batch_sale_rate_review(:org,:command)",
        {"org": org, "command": command_id})}
