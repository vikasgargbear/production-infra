"""Authoritative customer-receipt entry context.

The browser receives business date, supported command methods, and settlement
ledger identities from one authenticated projection.  None of those facts is
invented by a frontend default or copied from a legacy payment router.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Security
from fastapi.security import HTTPBearer
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from mcp_runtime.aasopharma_mcp.operator_actions import PREPARE_ACTIONS

from ...core.database import get_db
from ...core.security.permissions import PermissionChecker


router = APIRouter(
    prefix="/canonical/customer-receipts",
    dependencies=[Security(HTTPBearer(auto_error=False))],
    tags=["Canonical Customer Receipt Reads"],
)
FINANCE_USER = Depends(PermissionChecker("finance", "view"))
CustomerReceiptMethod = Literal["bank_transfer", "card", "upi"]


def _activate(db: Session, user: dict[str, Any]) -> UUID:
    org_id = UUID(str(user["org_id"]))
    db.execute(
        text(
            """
            SELECT erp_security.activate_context(:auth_user_id, :org_id),
                   pg_catalog.set_config('app.request_id', :request_id, true)
            """
        ),
        {
            "auth_user_id": UUID(str(user["auth_user_id"])),
            "org_id": org_id,
            "request_id": str(uuid4()),
        },
    )
    return org_id


def _supported_methods() -> tuple[str, ...]:
    actions = [
        action
        for action in PREPARE_ACTIONS.values()
        if action.operation_key == "finance.customer_receipt.prepare"
    ]
    if len(actions) != 1:
        raise RuntimeError("Exactly one customer-receipt command schema is required")
    values = actions[0].input_schema["properties"]["payment_method"].get("enum")
    if not isinstance(values, list) or not values or any(
        not isinstance(value, str) or not value for value in values
    ):
        raise RuntimeError("Customer-receipt payment methods are not published")
    if len(values) != len(set(values)):
        raise RuntimeError("Customer-receipt payment methods are duplicated")
    return tuple(values)


class CustomerReceiptSettlementAccount(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bank_account_id: UUID
    settlement_account_id: UUID
    settlement_account_code: str
    settlement_account_name: str
    bank_name: str
    account_holder_name: str
    currency_code: Literal["INR"]


class CustomerReceiptContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    business_date: date
    payment_methods: list[CustomerReceiptMethod] = Field(min_length=1)
    settlement_accounts: list[CustomerReceiptSettlementAccount]


@router.get("/context", response_model=CustomerReceiptContext)
def customer_receipt_context(
    user: dict[str, Any] = FINANCE_USER,
    db: Session = Depends(get_db),
) -> CustomerReceiptContext:
    org_id = _activate(db, user)
    business_date = db.execute(
        text(
            'SELECT "erp_core_commands"."current_organization_business_date"()'
        )
    ).scalar_one()
    accounts = [
        dict(row._mapping)
        for row in db.execute(
            text(
                """
                SELECT bank.id AS bank_account_id,
                       settlement.id AS settlement_account_id,
                       settlement.code AS settlement_account_code,
                       settlement.name AS settlement_account_name,
                       bank.bank_name, bank.account_holder_name,
                       bank.currency_code
                  FROM finance.bank_accounts bank
                  JOIN finance.accounts settlement
                    ON settlement.org_id=bank.org_id
                   AND settlement.id=bank.account_id
                   AND settlement.status='active'
                   AND settlement.account_type='asset'
                   AND settlement.currency_code='INR'
                 WHERE bank.org_id=:org_id
                   AND bank.status='active'
                   AND bank.currency_code='INR'
                 ORDER BY bank.bank_name, bank.account_holder_name, bank.id
                """
            ),
            {"org_id": org_id},
        ).fetchall()
    ]
    return CustomerReceiptContext(
        business_date=business_date,
        payment_methods=list(_supported_methods()),
        settlement_accounts=accounts,
    )
