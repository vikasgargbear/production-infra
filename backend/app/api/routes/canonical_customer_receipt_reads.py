"""Authoritative customer-receipt entry context.

The browser receives business date, supported command methods, and settlement
ledger identities from one authenticated projection.  None of those facts is
invented by a frontend default or copied from a legacy payment router.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query, Security
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
CustomerReceiptMethod = Literal["cash", "cheque", "bank_transfer", "card", "upi"]


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


class CustomerReceiptEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    attachment_id: UUID
    branch_id: UUID
    branch_code: str
    branch_name: str
    original_filename: str
    document_date: date
    retention_until: date
    status: Literal["verified", "retained"]
    verified_at: datetime
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class CustomerAdvanceOrder(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sales_order_id: UUID
    order_number: str
    order_date: date
    branch_id: UUID
    branch_code: str
    branch_name: str
    grand_total: Decimal = Field(gt=0)
    prior_active_advance: Decimal = Field(ge=0)
    remaining_advance_amount: Decimal = Field(gt=0)


class CustomerReceiptContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    business_date: date
    payment_methods: list[CustomerReceiptMethod] = Field(min_length=1)
    settlement_accounts: list[CustomerReceiptSettlementAccount]
    evidence: list[CustomerReceiptEvidence]
    approved_goods_orders: list[CustomerAdvanceOrder]


@router.get("/context", response_model=CustomerReceiptContext)
def customer_receipt_context(
    customer_account_id: UUID | None = Query(default=None),
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
    evidence = [
        dict(row._mapping)
        for row in db.execute(
            text(
                """
                SELECT attachment.id AS attachment_id, attachment.branch_id,
                       branch.code AS branch_code, branch.name AS branch_name,
                       attachment.original_filename, attachment.document_date,
                       attachment.retention_until, attachment.status,
                       attachment.verified_at,
                       pg_catalog.encode(attachment.sha256,'hex') AS sha256
                  FROM core.attachments attachment
                  JOIN core.branches branch
                    ON branch.org_id=attachment.org_id
                   AND branch.id=attachment.branch_id
                   AND branch.status='active'
                 WHERE attachment.org_id=:org_id
                   AND attachment.evidence_kind='customer_receipt_evidence'
                   AND attachment.status IN ('verified','retained')
                   AND attachment.verified_at IS NOT NULL
                   AND attachment.verified_at<=pg_catalog.transaction_timestamp()
                   AND attachment.retention_until>=:business_date
                   AND erp_security.can_access_branch(attachment.branch_id)
                   AND erp_security.has_permission(
                         'finance.payment.manage',attachment.branch_id
                       )
                 ORDER BY attachment.document_date DESC,
                          attachment.verified_at DESC, attachment.id
                 LIMIT 250
                """
            ),
            {"org_id": org_id, "business_date": business_date},
        ).fetchall()
    ]
    orders: list[dict[str, Any]] = []
    if customer_account_id is not None:
        orders = [
            dict(row._mapping)
            for row in db.execute(
                text(
                    """
                    WITH active_advances AS (
                      SELECT payment.org_id, payment.sales_order_id,
                             SUM(payment.amount) AS prior_active_advance
                        FROM finance.payments payment
                       WHERE payment.org_id=:org_id
                         AND payment.payment_purpose='customer_advance'
                         AND payment.status='posted'
                         AND payment.sales_order_id IS NOT NULL
                         AND NOT EXISTS (
                           SELECT 1 FROM finance.payments reversal
                            WHERE reversal.org_id=payment.org_id
                              AND reversal.status='posted'
                              AND (
                                reversal.reversal_of_payment_id=payment.id
                                OR (reversal.related_payment_id=payment.id
                                    AND reversal.payment_purpose='cheque_bounce')
                              )
                         )
                       GROUP BY payment.org_id,payment.sales_order_id
                    )
                    SELECT source.id AS sales_order_id, source.order_number,
                           source.order_date, source.branch_id,
                           branch.code AS branch_code, branch.name AS branch_name,
                           source.grand_total,
                           COALESCE(active.prior_active_advance,0)
                             AS prior_active_advance,
                           source.grand_total-COALESCE(active.prior_active_advance,0)
                             AS remaining_advance_amount
                      FROM sales.orders source
                      JOIN core.branches branch
                        ON branch.org_id=source.org_id
                       AND branch.id=source.branch_id
                       AND branch.status='active'
                      LEFT JOIN active_advances active
                        ON active.org_id=source.org_id
                       AND active.sales_order_id=source.id
                     WHERE source.org_id=:org_id
                       AND source.customer_account_id=:customer_account_id
                       AND source.status IN ('approved','partially_fulfilled')
                       AND source.currency_code='INR'
                       AND source.tax_charge_mechanism='normal'
                       AND source.supply_type IN ('intra_state','inter_state')
                       AND source.grand_total-COALESCE(active.prior_active_advance,0)>0
                       AND erp_security.can_access_branch(source.branch_id)
                       AND erp_security.has_permission(
                             'finance.payment.manage',source.branch_id
                           )
                       AND NOT EXISTS (
                         SELECT 1 FROM sales.order_lines line
                          WHERE line.org_id=source.org_id
                            AND line.order_id=source.id
                            AND line.line_kind<>'product'
                       )
                       AND EXISTS (
                         SELECT 1 FROM sales.order_lines line
                          WHERE line.org_id=source.org_id
                            AND line.order_id=source.id
                            AND line.line_kind='product'
                       )
                     ORDER BY source.order_date DESC,source.order_number,source.id
                     LIMIT 250
                    """
                ),
                {"org_id": org_id, "customer_account_id": customer_account_id},
            ).fetchall()
        ]
    return CustomerReceiptContext(
        business_date=business_date,
        payment_methods=list(_supported_methods()),
        settlement_accounts=accounts,
        evidence=evidence,
        approved_goods_orders=orders,
    )
