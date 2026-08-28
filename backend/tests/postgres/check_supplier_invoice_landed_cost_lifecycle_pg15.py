"""Exercise supplier-invoice variance posting on disposable PostgreSQL 15.

The fixture creates a PO and GRN through their canonical command lifecycles,
posts a test-only inventory issue through the named inventory command, and then
uses the supplier-invoice prepare/approve/execute authority.  Every identity is
run-scoped and the script refuses anything except the opted-in local Alembic
test database.
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import date, datetime
from decimal import Decimal
import hashlib
import os
from typing import Any, Iterator
from urllib.parse import quote
from uuid import UUID, uuid4, uuid5

import psycopg2
from psycopg2.extensions import AsIs, register_adapter
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.api.routes.canonical_supplier_invoice_reads import posted_supplier_invoice
from app.domain.operator_actions.contract import ACTION_POLICIES, PREPARE_PAYLOAD_MODELS
from app.domain.operator_actions.models import (
    ActionContext,
    ActionErrorCode,
    OperatorActionError,
)
from app.infrastructure.operator_actions.service import SqlAlchemyOperatorActionService
from scripts import provision_canonical_demo as fixture

from check_sales_invoice_direct_issue_acceptance import _seed_reference_authority


EXPECTED = {
    "receipt_billed_quantity": Decimal("50.000000"),
    "receipt_free_quantity": Decimal("2.500000"),
    "receipt_quantity": Decimal("52.500000"),
    "receipt_value": Decimal("4500.00"),
    "issued_quantity": Decimal("21.000000"),
    "issued_value": Decimal("1800.00"),
    "remaining_quantity": Decimal("31.500000"),
    "remaining_value_before_invoice": Decimal("2700.00"),
    "invoice_net": Decimal("5000.00"),
    "cgst": Decimal("300.00"),
    "sgst": Decimal("300.00"),
    "grand_total": Decimal("5600.00"),
    "total_variance": Decimal("500.00"),
    "inventory_value_adjustment": Decimal("300.00"),
    "consumed_variance": Decimal("200.00"),
    "remaining_value_after_invoice": Decimal("3000.00"),
    "journal_total": Decimal("5800.00"),
}

TRANSFER_EXPECTED = {
    "transferred_quantity": Decimal("21.000000"),
    "transferred_value": Decimal("1800.00"),
    "source_quantity": Decimal("31.500000"),
    "source_value_before_invoice": Decimal("2700.00"),
    "destination_quantity": Decimal("21.000000"),
    "destination_value_before_invoice": Decimal("1800.00"),
    "source_value_after_invoice": Decimal("3000.00"),
    "destination_value_after_invoice": Decimal("2000.00"),
    "source_adjustment": Decimal("300.00"),
    "destination_adjustment": Decimal("200.00"),
}


def _admin_dsn(database_url: str) -> str:
    url = make_url(database_url)
    return (
        f"host={url.host} port={url.port or 5432} dbname={url.database} "
        f"user={url.username} password={url.password or ''}"
    )


def _role_url(database_url: str, role: str, password: str) -> str:
    return make_url(database_url).set(
        username=role, password=password
    ).render_as_string(hide_password=False)


def _assert_disposable_pg15(database_url: str) -> None:
    url = make_url(database_url)
    if os.environ.get("CANONICAL_CI_ALLOW_DISPOSABLE") != "1":
        raise RuntimeError("supplier-invoice lifecycle requires explicit disposable opt-in")
    if url.host not in {"127.0.0.1", "localhost"}:
        raise RuntimeError("supplier-invoice lifecycle requires an exact loopback host")
    if url.database != "canonical_alembic_ci":
        raise RuntimeError("supplier-invoice lifecycle requires canonical_alembic_ci")


def _context(
    operation: str,
    permission: str,
    *,
    org_id: UUID | None = None,
) -> ActionContext:
    return ActionContext(
        auth_user_id=UUID(fixture.IDS["operator_auth_user"]),
        user_id=UUID(fixture.IDS["operator_user"]),
        organization_id=org_id or UUID(fixture.IDS["org"]),
        membership_id=UUID(fixture.IDS["operator_membership"]),
        agent_grant_id=UUID(fixture.IDS["agent_grant"]),
        client_id=fixture.CLIENT_ID,
        operation_key=operation,
        permission=permission,
        branch_ids=(UUID(fixture.IDS["branch"]),),
        organization_scope=True,
    )


@contextmanager
def _service(
    runtime_url: str,
    calculator_url: str,
) -> Iterator[SqlAlchemyOperatorActionService]:
    runtime_engine = create_engine(runtime_url, pool_pre_ping=True)
    calculator_engine = create_engine(calculator_url, pool_pre_ping=True)
    try:
        yield SqlAlchemyOperatorActionService(
            session_factory=lambda: Session(runtime_engine),
            calculator_factory=lambda: Session(calculator_engine),
            runtime_principal_configured=True,
        )
    finally:
        calculator_engine.dispose()
        runtime_engine.dispose()


def _configure_fixture_ids() -> str:
    namespace = uuid4()
    for key in tuple(fixture.IDS):
        fixture.IDS[key] = str(uuid5(namespace, key))
    fixture.CLIENT_ID = f"pg15-supplier-invoice-variance-{namespace}"
    return f"SILIF{namespace.int % 10000:04d}C"


def _prepare(
    service: SqlAlchemyOperatorActionService,
    operation: str,
    payload: dict[str, Any],
):
    policy = ACTION_POLICIES[operation]
    validated = PREPARE_PAYLOAD_MODELS[operation].model_validate(payload)
    values = validated.model_dump(mode="python", exclude_none=True)
    idempotency_key = values.pop("idempotency_key")
    return service.prepare(
        policy=policy,
        payload=values,
        idempotency_key=idempotency_key,
        context=_context(operation, policy.permission),
    )


def _approve_and_execute(
    service: SqlAlchemyOperatorActionService,
    prepared: Any,
):
    command_id = prepared.command_request_id
    approval = service.approve(
        command_request_id=command_id,
        preview_hash=prepared.preview_hash,
        idempotency_key=f"approve-{command_id}",
        context=_context("automation.command.approve", "automation.command.approve"),
    )
    assert approval.status == "approved"
    executed = service.execute(
        command_request_id=command_id,
        preview_hash=prepared.preview_hash,
        idempotency_key=f"execute-{command_id}",
        context=_context("automation.command.execute", "automation.command.execute"),
    )
    assert executed.status == "succeeded"
    return executed


def _purchase_order_payload(*, business_date: date) -> dict[str, Any]:
    payload = fixture.purchase_order_payload(business_date=business_date)
    product = dict(payload["lines"][0])
    product.update({
        "billed_quantity": "50",
        "free_quantity": "2.5",
        "quoted_unit_rate": "90.0000",
    })
    payload["lines"] = [product]
    payload["idempotency_key"] = f"pg15-po-{uuid4()}"
    return payload


def _goods_receipt_payload(
    purchase_order_id: UUID,
    purchase_order_line_id: UUID,
    *,
    business_date: date,
    received_at: datetime,
) -> dict[str, Any]:
    payload = fixture.goods_receipt_payload(
        str(purchase_order_id),
        str(purchase_order_line_id),
        business_date=business_date,
        received_at=received_at,
    )
    batch = payload["lines"][0]["batches"][0]
    batch.update({
        "received_quantity": "50",
        "accepted_quantity": "50",
        "free_quantity": "2.5",
    })
    payload["idempotency_key"] = f"pg15-grn-{uuid4()}"
    return payload


def _supplier_invoice_payload(
    goods_receipt_id: UUID,
    goods_receipt_line_id: UUID,
    portal_evidence: dict[str, str],
    *,
    business_date: date,
) -> dict[str, Any]:
    payload = fixture.supplier_invoice_payload(
        str(goods_receipt_id), str(goods_receipt_line_id), portal_evidence,
        business_date=business_date,
    )
    payload["idempotency_key"] = f"pg15-supplier-invoice-{uuid4()}"
    payload["lines"][0]["landed_cost_allocation_method"] = "direct"
    return payload


def _inventory_transfer_payload(
    *, batch_id: UUID, business_date: date
) -> dict[str, Any]:
    return {
        "idempotency_key": f"pg15-landed-cost-transfer-{uuid4()}",
        "source_branch_id": fixture.IDS["branch"],
        "destination_branch_id": fixture.IDS["transfer_destination_branch"],
        "source_location_id": fixture.IDS["saleable_location"],
        "destination_location_id": fixture.IDS["transfer_destination_location"],
        "transfer_date": business_date.isoformat(),
        "lines": [{
            "product_id": fixture.IDS["product"],
            "uom_conversion_id": fixture.IDS["uom_conversion"],
            "batch_allocations": [{
                "batch_id": str(batch_id),
                "entered_quantity": str(TRANSFER_EXPECTED["transferred_quantity"]),
            }],
        }],
        "logistics": {"transport_mode": "in_person", "distance_km": "0.00"},
    }


def _source_rows(admin_dsn: str, goods_receipt_id: UUID) -> tuple[UUID, UUID, UUID, str]:
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT line.id,line.batch_id,order_line.id,line.uom_code
              FROM procurement.goods_receipt_lines line
              JOIN procurement.purchase_order_lines order_line
                ON order_line.org_id=line.org_id AND order_line.id=line.purchase_order_line_id
             WHERE line.org_id=%s AND line.goods_receipt_id=%s
            """,
            (fixture.IDS["org"], goods_receipt_id),
        )
        row = cursor.fetchone()
    assert row is not None
    return UUID(str(row[0])), UUID(str(row[1])), UUID(str(row[2])), str(row[3])


def _post_consumption(
    runtime_dsn: str,
    *,
    batch_id: UUID,
    uom_code: str,
    business_date: date,
) -> None:
    document_id, line_id = uuid4(), uuid4()
    with psycopg2.connect(runtime_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s,%s)",
            (fixture.IDS["operator_auth_user"], fixture.IDS["org"]),
        )
        cursor.execute("SELECT set_config('app.request_id',%s,true)", (str(uuid4()),))
        cursor.execute(
            """
            SELECT average_unit_cost,on_hand_quantity,inventory_value
              FROM inventory.stock_balances
             WHERE org_id=%s AND location_id=%s AND product_id=%s AND batch_id=%s
            """,
            (
                fixture.IDS["org"], fixture.IDS["saleable_location"],
                fixture.IDS["product"], batch_id,
            ),
        )
        average_cost, quantity, value = cursor.fetchone()
        assert (quantity, value) == (
            EXPECTED["receipt_quantity"], EXPECTED["receipt_value"]
        )
        cursor.execute(
            """
            INSERT INTO inventory.inventory_documents(
              org_id,id,branch_id,physical_movement_required,document_type,
              document_number,fiscal_year,document_date,status,reason_code,
              currency_code,costing_method_snapshot,total_abs_base_quantity,
              total_value,approved_at,approved_by_membership_id,
              created_by_membership_id,updated_by_membership_id)
            VALUES (%s,%s,%s,false,'adjustment',%s,2026,%s,'approved',
              'pg15_consumed_variance_fixture','INR','moving_weighted_average',
              %s,%s,transaction_timestamp(),%s,%s,%s)
            """,
            (
                fixture.IDS["org"], document_id, fixture.IDS["branch"],
                f"PG15-CONSUME-{document_id}", business_date,
                EXPECTED["issued_quantity"], EXPECTED["issued_value"],
                fixture.IDS["operator_membership"], fixture.IDS["operator_membership"],
                fixture.IDS["operator_membership"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO inventory.inventory_document_lines(
              org_id,id,inventory_document_id,line_number,movement_kind,
              product_id,batch_id,uom_code,entered_quantity,base_quantity,
              from_location_id,unit_cost,extended_cost,created_by_membership_id)
            VALUES (%s,%s,%s,1,'issue',%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (
                fixture.IDS["org"], line_id, document_id, fixture.IDS["product"],
                batch_id, uom_code, EXPECTED["issued_quantity"],
                EXPECTED["issued_quantity"], fixture.IDS["saleable_location"],
                average_cost, EXPECTED["issued_value"], fixture.IDS["operator_membership"],
            ),
        )
        cursor.execute(
            """
            SELECT erp_trade_commands.post_inventory_document(
              %s,%s,%s,%s,%s,transaction_timestamp()+interval '15 minutes')
            """,
            (
                fixture.IDS["org"], document_id, fixture.IDS["operator_membership"],
                psycopg2.Binary(hashlib.sha256(f"issue-key-{document_id}".encode()).digest()),
                psycopg2.Binary(hashlib.sha256(f"issue-request-{document_id}".encode()).digest()),
            ),
        )
        posted = cursor.fetchone()
        assert posted is not None and UUID(str(posted[0])) == document_id


def _set_balance_version(admin_dsn: str, batch_id: UUID, delta: int) -> None:
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        cursor.execute(
            """
            UPDATE inventory.stock_balances
               SET row_version=row_version+%s
             WHERE org_id=%s AND location_id=%s AND product_id=%s AND batch_id=%s
            """,
            (
                delta, fixture.IDS["org"], fixture.IDS["saleable_location"],
                fixture.IDS["product"], batch_id,
            ),
        )
        assert cursor.rowcount == 1


def _release_disposable_receipt_batch(admin_dsn: str, batch_id: UUID) -> None:
    """Satisfy the transfer command's reviewed released-batch prerequisite."""

    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        cursor.execute(
            """
            SELECT set_config('app.org_id',%s,true),
                   set_config('app.membership_id',%s,true),
                   set_config('app.request_id',%s,true)
            """,
            (
                fixture.IDS["org"], fixture.IDS["operator_membership"], str(uuid4()),
            ),
        )
        cursor.execute(
            """
            UPDATE inventory.batches
               SET status='released',released_at=transaction_timestamp(),
                   released_by_membership_id=%s,updated_at=transaction_timestamp(),
                   updated_by_membership_id=%s,row_version=row_version+1
             WHERE org_id=%s AND id=%s AND status='quarantined'
            """,
            (
                fixture.IDS["operator_membership"],
                fixture.IDS["operator_membership"],
                fixture.IDS["org"], batch_id,
            ),
        )
        assert cursor.rowcount == 1


def _assert_upstream_has_no_payable_or_tax(runtime_dsn: str) -> None:
    """The isolated organization has only its posted PO, GRN, and stock issue."""

    with psycopg2.connect(runtime_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s,%s)",
            (fixture.IDS["operator_auth_user"], fixture.IDS["org"]),
        )
        cursor.execute(
            """
            SELECT
              (SELECT count(*) FROM tax.documents WHERE org_id=%s),
              (SELECT count(*) FROM finance.open_items WHERE org_id=%s),
              (SELECT count(*) FROM finance.accounting_events WHERE org_id=%s),
              (SELECT count(*) FROM procurement.purchase_orders
                WHERE org_id=%s AND status IN ('approved','partially_received','received')),
              (SELECT count(*) FROM procurement.goods_receipts
                WHERE org_id=%s AND status='posted')
            """,
            (fixture.IDS["org"],) * 5,
        )
        assert cursor.fetchone() == (0, 0, 0, 1, 1)


def _install_failure(admin_dsn: str) -> None:
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            CREATE FUNCTION public.pg15_supplier_invoice_variance_failure()
            RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'injected supplier invoice journal failure'; END $$;
            CREATE TRIGGER pg15_supplier_invoice_variance_failure
              BEFORE INSERT ON finance.journal_lines
              FOR EACH ROW EXECUTE FUNCTION public.pg15_supplier_invoice_variance_failure()
            """
        )


def _remove_failure(admin_dsn: str) -> None:
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            "DROP TRIGGER pg15_supplier_invoice_variance_failure ON finance.journal_lines"
        )
        cursor.execute("DROP FUNCTION public.pg15_supplier_invoice_variance_failure()")


def _assert_execute_rollback(runtime_dsn: str, supplier_invoice_id: UUID, batch_id: UUID) -> None:
    with psycopg2.connect(runtime_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s,%s)",
            (fixture.IDS["operator_auth_user"], fixture.IDS["org"]),
        )
        cursor.execute(
            """
            SELECT invoice.status,
              (SELECT count(*) FROM tax.documents WHERE org_id=%s AND supplier_invoice_id=%s),
              (SELECT count(*) FROM finance.accounting_events WHERE org_id=%s AND supplier_invoice_id=%s),
              (SELECT count(*) FROM inventory.inventory_documents
                WHERE org_id=%s AND supplier_invoice_id=%s),
              balance.on_hand_quantity,balance.inventory_value
              FROM procurement.supplier_invoices invoice
              JOIN inventory.stock_balances balance
                ON balance.org_id=invoice.org_id AND balance.location_id=%s
               AND balance.product_id=%s AND balance.batch_id=%s
             WHERE invoice.org_id=%s AND invoice.id=%s
            """,
            (
                fixture.IDS["org"], supplier_invoice_id,
                fixture.IDS["org"], supplier_invoice_id,
                fixture.IDS["org"], supplier_invoice_id,
                fixture.IDS["saleable_location"], fixture.IDS["product"], batch_id,
                fixture.IDS["org"], supplier_invoice_id,
            ),
        )
        assert cursor.fetchone() == (
            "approved", 0, 0, 0,
            EXPECTED["remaining_quantity"], EXPECTED["remaining_value_before_invoice"],
        )


def _assert_posted_readback(
    runtime_url: str,
    runtime_dsn: str,
    supplier_invoice_id: UUID,
    goods_receipt_id: UUID,
    batch_id: UUID,
) -> None:
    runtime_engine = create_engine(runtime_url, pool_pre_ping=True)
    try:
        with Session(runtime_engine) as session:
            readback = posted_supplier_invoice(
                supplier_invoice_id,
                user={
                    "org_id": fixture.IDS["org"],
                    "auth_user_id": fixture.IDS["operator_auth_user"],
                },
                db=session,
            )
    finally:
        runtime_engine.dispose()

    assert readback.status == "posted"
    assert readback.net_value_total == EXPECTED["invoice_net"]
    assert (readback.cgst_total, readback.sgst_total, readback.grand_total) == (
        EXPECTED["cgst"], EXPECTED["sgst"], EXPECTED["grand_total"]
    )
    assert readback.tax_document_taxable_total == EXPECTED["invoice_net"]
    assert readback.tax_document_payable_total == EXPECTED["grand_total"]
    assert readback.open_item_status == "open"
    assert readback.open_item_principal == EXPECTED["grand_total"]
    assert readback.journal_status == "posted"
    assert readback.journal_debit_total == readback.journal_credit_total == EXPECTED["journal_total"]
    assert readback.supplier_invoice_inventory_document_count == 1
    assert readback.supplier_invoice_inventory_value_delta == EXPECTED["inventory_value_adjustment"]
    assert readback.consumed_variance_amount == EXPECTED["consumed_variance"]
    assert len(readback.lines) == 1
    product_line = readback.lines[0]
    assert product_line.landed_cost_allocation_method == "direct"
    assert product_line.base_billed_quantity == EXPECTED["receipt_billed_quantity"]
    assert product_line.base_free_quantity == EXPECTED["receipt_free_quantity"]
    assert len(product_line.allocations) == 1
    assert product_line.allocations[0].goods_receipt_id == goods_receipt_id
    assert product_line.allocations[0].capitalized_value == EXPECTED["receipt_value"]
    assert len(readback.landed_cost_adjustments) == 1
    adjustment = readback.landed_cost_adjustments[0]
    assert adjustment.supplier_invoice_line_id == product_line.supplier_invoice_line_id
    assert adjustment.batch_id == batch_id
    assert adjustment.allocation_method == "direct"
    assert adjustment.quantity_delta == Decimal("0.000000")
    assert adjustment.value_delta == EXPECTED["inventory_value_adjustment"]

    with psycopg2.connect(runtime_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s,%s)",
            (fixture.IDS["operator_auth_user"], fixture.IDS["org"]),
        )
        cursor.execute(
            """
            SELECT balance.on_hand_quantity,balance.inventory_value,
                   sum(ledger.quantity_delta),sum(ledger.value_delta)
              FROM inventory.stock_balances balance
              JOIN inventory.stock_ledger_entries ledger
                ON ledger.org_id=balance.org_id AND ledger.location_id=balance.location_id
               AND ledger.product_id=balance.product_id AND ledger.batch_id=balance.batch_id
             WHERE balance.org_id=%s AND balance.location_id=%s
               AND balance.product_id=%s AND balance.batch_id=%s
             GROUP BY balance.on_hand_quantity,balance.inventory_value
            """,
            (
                fixture.IDS["org"], fixture.IDS["saleable_location"],
                fixture.IDS["product"], batch_id,
            ),
        )
        assert cursor.fetchone() == (
            EXPECTED["remaining_quantity"], EXPECTED["remaining_value_after_invoice"],
            EXPECTED["remaining_quantity"], EXPECTED["remaining_value_after_invoice"],
        )
        cursor.execute(
            """
            SELECT
              count(*) FILTER (WHERE document.goods_receipt_id=%s AND ledger.quantity_delta>0),
              count(*) FILTER (WHERE document.supplier_invoice_id=%s),
              coalesce(sum(ledger.quantity_delta) FILTER (
                WHERE document.supplier_invoice_id=%s),0)
              FROM inventory.stock_ledger_entries ledger
              JOIN inventory.inventory_documents document
                ON document.org_id=ledger.org_id AND document.id=ledger.inventory_document_id
             WHERE ledger.org_id=%s AND ledger.batch_id=%s
            """,
            (
                goods_receipt_id, supplier_invoice_id, supplier_invoice_id,
                fixture.IDS["org"], batch_id,
            ),
        )
        assert cursor.fetchone() == (1, 1, Decimal("0.000000"))
        cursor.execute(
            """
            SELECT account_id,transaction_debit,transaction_credit
              FROM finance.journal_lines
             WHERE org_id=%s AND journal_entry_id=%s
               AND description='Consumed supplier price or landed-cost variance'
            """,
            (fixture.IDS["org"], readback.journal_entry_id),
        )
        variance_line = cursor.fetchone()
        assert variance_line is not None
        assert UUID(str(variance_line[0])) == UUID(
            fixture.IDS["purchase_price_variance_account"]
        )
        assert variance_line[1:] == (
            EXPECTED["consumed_variance"], Decimal("0.00")
        )


def _run_transferred_stock_lifecycle(
    admin_dsn: str,
    runtime_url: str,
    calculator_url: str,
    runtime_dsn: str,
) -> UUID:
    """Prove that transferred receipt stock remains capitalizable lineage."""

    shared_reference_ids = {
        key: fixture.IDS[key] for key in ("tax_release", "tax_version")
    }
    organization_pan = _configure_fixture_ids()
    fixture.IDS.update(shared_reference_ids)
    with psycopg2.connect(admin_dsn) as connection:
        fixture.bootstrap_identity(connection, organization_pan=organization_pan)
    with psycopg2.connect(runtime_dsn) as connection:
        business_date, business_instant = fixture.organization_business_clock(
            connection
        )
    with psycopg2.connect(admin_dsn) as connection:
        fixture.seed_business_master(connection, business_date=business_date)
        fixture.seed_end_to_end_master(connection, business_date=business_date)
    with psycopg2.connect(runtime_dsn) as connection:
        fixture.activate_demo_product(connection)
    with psycopg2.connect(admin_dsn) as connection:
        portal_evidence = fixture.seed_supplier_invoice_portal_evidence(
            connection, business_date=business_date
        )

    with _service(runtime_url, calculator_url) as service:
        purchase = _approve_and_execute(service, _prepare(
            service, "procurement.purchase_order.prepare",
            _purchase_order_payload(business_date=business_date),
        ))
        assert purchase.resource_id is not None
        with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM procurement.purchase_order_lines WHERE org_id=%s AND purchase_order_id=%s",
                (fixture.IDS["org"], purchase.resource_id),
            )
            purchase_order_line_id = UUID(str(cursor.fetchone()[0]))
        receipt = _approve_and_execute(service, _prepare(
            service, "procurement.goods_receipt.prepare",
            _goods_receipt_payload(
                purchase.resource_id, purchase_order_line_id,
                business_date=business_date,
                received_at=business_instant,
            ),
        ))
        assert receipt.resource_id is not None
        goods_receipt_line_id, batch_id, _, _ = _source_rows(
            admin_dsn, receipt.resource_id
        )
        _release_disposable_receipt_batch(admin_dsn, batch_id)

        transfer = _approve_and_execute(service, _prepare(
            service, "inventory.transfer.prepare",
            _inventory_transfer_payload(batch_id=batch_id, business_date=business_date),
        ))
        assert transfer.resource_id is not None
        with psycopg2.connect(runtime_dsn) as connection, connection.cursor() as cursor:
            cursor.execute(
                "SELECT erp_security.activate_context(%s,%s)",
                (fixture.IDS["operator_auth_user"], fixture.IDS["org"]),
            )
            cursor.execute(
                """
                SELECT location_id,on_hand_quantity,inventory_value
                  FROM inventory.stock_balances
                 WHERE org_id=%s AND product_id=%s AND batch_id=%s
                 ORDER BY location_id
                """,
                (fixture.IDS["org"], fixture.IDS["product"], batch_id),
            )
            balances = {UUID(str(row[0])): row[1:] for row in cursor.fetchall()}
            assert balances == {
                UUID(fixture.IDS["saleable_location"]): (
                    TRANSFER_EXPECTED["source_quantity"],
                    TRANSFER_EXPECTED["source_value_before_invoice"],
                ),
                UUID(fixture.IDS["transfer_destination_location"]): (
                    TRANSFER_EXPECTED["destination_quantity"],
                    TRANSFER_EXPECTED["destination_value_before_invoice"],
                ),
            }

        prepared = _prepare(
            service,
            "procurement.supplier_invoice.prepare",
            _supplier_invoice_payload(
                receipt.resource_id, goods_receipt_line_id, portal_evidence,
                business_date=business_date,
            ),
        )
        command_id = prepared.command_request_id
        with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT request.target_resource_id,line.id
                  FROM automation.command_requests AS request
                  JOIN procurement.supplier_invoice_lines AS line
                    ON line.org_id=request.org_id
                   AND line.supplier_invoice_id=request.target_resource_id
                 WHERE request.org_id=%s AND request.id=%s
                """,
                (fixture.IDS["org"], command_id),
            )
            supplier_invoice_id, supplier_invoice_line_id = cursor.fetchone()
        approval = service.approve(
            command_request_id=command_id,
            preview_hash=prepared.preview_hash,
            idempotency_key=f"approve-{command_id}",
            context=_context("automation.command.approve", "automation.command.approve"),
        )
        assert approval.status == "approved"

        with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
            cursor.execute(
                "SELECT erp_trade_commands_v2.landed_cost_lineage_state(%s,%s)",
                (fixture.IDS["org"], supplier_invoice_line_id),
            )
            lineage = cursor.fetchone()[0]
        assert lineage["contract_version"] == "supplier_invoice_landed_cost_lineage_v1"
        assert lineage["source_identity_count"] == 1
        assert lineage["target_identity_count"] == 2
        assert Decimal(lineage["source_quantity_basis"]) == EXPECTED["receipt_quantity"]
        assert Decimal(lineage["remaining_quantity_basis"]) == EXPECTED["receipt_quantity"]
        assert lineage["goods_receipt_line_ids"] == [str(goods_receipt_line_id)]
        assert len(lineage["transfer_line_ids"]) == 1
        assert {
            UUID(target["location_id"]): (
                Decimal(target["on_hand_quantity"]),
                Decimal(target["inventory_value"]),
                int(target["stock_row_version"]),
            )
            for target in lineage["targets"]
        } == {
            UUID(fixture.IDS["saleable_location"]): (
                TRANSFER_EXPECTED["source_quantity"],
                TRANSFER_EXPECTED["source_value_before_invoice"],
                2,
            ),
            UUID(fixture.IDS["transfer_destination_location"]): (
                TRANSFER_EXPECTED["destination_quantity"],
                TRANSFER_EXPECTED["destination_value_before_invoice"],
                1,
            ),
        }

        executed = service.execute(
            command_request_id=command_id,
            preview_hash=prepared.preview_hash,
            idempotency_key=f"execute-{command_id}",
            context=_context("automation.command.execute", "automation.command.execute"),
        )
        assert executed.status == "succeeded"
        assert executed.resource_id == UUID(str(supplier_invoice_id))

    with psycopg2.connect(runtime_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s,%s)",
            (fixture.IDS["operator_auth_user"], fixture.IDS["org"]),
        )
        cursor.execute(
            """
            SELECT adjustment.from_location_id,adjustment.extended_cost,
                   balance.on_hand_quantity,balance.inventory_value
              FROM inventory.inventory_document_lines AS adjustment
              JOIN inventory.inventory_documents AS document
                ON document.org_id=adjustment.org_id
               AND document.id=adjustment.inventory_document_id
              JOIN inventory.stock_balances AS balance
                ON balance.org_id=adjustment.org_id
               AND balance.location_id=adjustment.from_location_id
               AND balance.product_id=adjustment.product_id
               AND balance.batch_id=adjustment.batch_id
             WHERE adjustment.org_id=%s
               AND document.supplier_invoice_id=%s
               AND document.document_type='cost_adjustment'
             ORDER BY adjustment.from_location_id
            """,
            (fixture.IDS["org"], supplier_invoice_id),
        )
        adjustments = {
            UUID(str(row[0])): row[1:] for row in cursor.fetchall()
        }
        assert adjustments == {
            UUID(fixture.IDS["saleable_location"]): (
                TRANSFER_EXPECTED["source_adjustment"],
                TRANSFER_EXPECTED["source_quantity"],
                TRANSFER_EXPECTED["source_value_after_invoice"],
            ),
            UUID(fixture.IDS["transfer_destination_location"]): (
                TRANSFER_EXPECTED["destination_adjustment"],
                TRANSFER_EXPECTED["destination_quantity"],
                TRANSFER_EXPECTED["destination_value_after_invoice"],
            ),
        }
        cursor.execute(
            """
            SELECT count(*),COALESCE(sum(line.transaction_debit-line.transaction_credit),0)
              FROM finance.journal_lines AS line
              JOIN finance.accounting_events AS event
                ON event.org_id=line.org_id AND event.journal_entry_id=line.journal_entry_id
             WHERE line.org_id=%s AND event.supplier_invoice_id=%s
               AND line.description='Consumed supplier price or landed-cost variance'
            """,
            (fixture.IDS["org"], supplier_invoice_id),
        )
        assert cursor.fetchone() == (0, Decimal("0"))
    return UUID(str(supplier_invoice_id))


def run_lifecycle() -> None:
    register_adapter(UUID, lambda value: AsIs(f"'{value}'::uuid"))
    admin_url = os.environ["DATABASE_URL"]
    _assert_disposable_pg15(admin_url)
    admin_dsn = _admin_dsn(admin_url)
    password = quote(f"pg15-{uuid4()}", safe="")
    runtime_url = _role_url(admin_url, "erp_runtime", password)
    calculator_url = _role_url(admin_url, "erp_calculator", password)
    runtime_dsn = _admin_dsn(runtime_url)
    organization_pan = _configure_fixture_ids()

    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute("SHOW server_version_num")
        assert int(cursor.fetchone()[0]) // 10000 == 15
        cursor.execute(f'ALTER ROLE "erp_runtime" LOGIN PASSWORD \'{password}\'')
        cursor.execute(f'ALTER ROLE "erp_calculator" LOGIN PASSWORD \'{password}\'')
    with psycopg2.connect(admin_dsn) as connection:
        fixture.bootstrap_identity(connection, organization_pan=organization_pan)
    with psycopg2.connect(admin_dsn) as connection:
        _seed_reference_authority(connection)
    with psycopg2.connect(runtime_dsn) as connection:
        business_date, business_instant = fixture.organization_business_clock(
            connection
        )
    with psycopg2.connect(admin_dsn) as connection:
        fixture.seed_business_master(connection, business_date=business_date)
        fixture.seed_end_to_end_master(connection, business_date=business_date)
    with psycopg2.connect(runtime_dsn) as connection:
        fixture.activate_demo_product(connection)
    with psycopg2.connect(admin_dsn) as connection:
        portal_evidence = fixture.seed_supplier_invoice_portal_evidence(
            connection, business_date=business_date
        )

    with _service(runtime_url, calculator_url) as service:
        purchase = _approve_and_execute(service, _prepare(
            service, "procurement.purchase_order.prepare",
            _purchase_order_payload(business_date=business_date),
        ))
        purchase_order_id = purchase.resource_id
        assert purchase_order_id is not None
        with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM procurement.purchase_order_lines WHERE org_id=%s AND purchase_order_id=%s",
                (fixture.IDS["org"], purchase_order_id),
            )
            purchase_order_line_id = UUID(str(cursor.fetchone()[0]))
        receipt = _approve_and_execute(service, _prepare(
            service,
            "procurement.goods_receipt.prepare",
            _goods_receipt_payload(
                purchase_order_id,
                purchase_order_line_id,
                business_date=business_date,
                received_at=business_instant,
            ),
        ))
        goods_receipt_id = receipt.resource_id
        assert goods_receipt_id is not None

        goods_receipt_line_id, batch_id, source_order_line_id, uom_code = _source_rows(
            admin_dsn, goods_receipt_id
        )
        assert source_order_line_id == purchase_order_line_id
        _post_consumption(
            runtime_dsn,
            batch_id=batch_id,
            uom_code=uom_code,
            business_date=business_date,
        )
        _assert_upstream_has_no_payable_or_tax(runtime_dsn)
        payload = _supplier_invoice_payload(
            goods_receipt_id, goods_receipt_line_id, portal_evidence,
            business_date=business_date,
        )

        policy = ACTION_POLICIES["procurement.supplier_invoice.prepare"]
        denied_values = PREPARE_PAYLOAD_MODELS[policy.operation_key].model_validate(
            payload
        ).model_dump(mode="python", exclude_none=True)
        denied_key = denied_values.pop("idempotency_key")
        try:
            service.prepare(
                policy=policy,
                payload=denied_values,
                idempotency_key=f"cross-tenant-{denied_key}",
                context=_context(
                    policy.operation_key,
                    policy.permission,
                    org_id=UUID(fixture.IDS["denial_org"]),
                ),
            )
        except OperatorActionError as error:
            assert error.code is ActionErrorCode.SCOPE_DENIED
        else:
            raise AssertionError("cross-tenant supplier-invoice prepare was not denied")

        prepared = _prepare(service, policy.operation_key, payload)
        replay = _prepare(service, policy.operation_key, payload)
        assert replay.command_request_id == prepared.command_request_id
        assert replay.preview_hash == prepared.preview_hash
        assert len(prepared.inventory_impact) == 1
        impact = prepared.inventory_impact[0]
        assert impact["allocation_method"] == "direct"
        assert impact["total_landed_cost_pool"] == "500.00"
        assert impact["landed_cost_inventory_value_delta"] == "300.00"
        assert impact["consumed_variance_amount"] == "200.00"
        assert len(impact["targets"]) == 1
        assert impact["targets"][0]["remaining_on_hand_quantity"] == "31.500000"
        command_id = prepared.command_request_id
        with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
            cursor.execute(
                "SELECT target_resource_id FROM automation.command_requests WHERE org_id=%s AND id=%s",
                (fixture.IDS["org"], command_id),
            )
            supplier_invoice_id = UUID(str(cursor.fetchone()[0]))
        approval = service.approve(
            command_request_id=command_id,
            preview_hash=prepared.preview_hash,
            idempotency_key=f"approve-{command_id}",
            context=_context("automation.command.approve", "automation.command.approve"),
        )
        assert approval.status == "approved"

        _set_balance_version(admin_dsn, batch_id, 1)
        try:
            service.execute(
                command_request_id=command_id,
                preview_hash=prepared.preview_hash,
                idempotency_key=f"execute-{command_id}",
                context=_context("automation.command.execute", "automation.command.execute"),
            )
        except OperatorActionError as error:
            assert error.code is ActionErrorCode.STALE_VERSION
            assert error.retryable is True
        else:
            raise AssertionError("stale stock-balance version was not denied")
        finally:
            _set_balance_version(admin_dsn, batch_id, -1)

        _install_failure(admin_dsn)
        try:
            try:
                service.execute(
                    command_request_id=command_id,
                    preview_hash=prepared.preview_hash,
                    idempotency_key=f"execute-{command_id}",
                    context=_context("automation.command.execute", "automation.command.execute"),
                )
            except Exception as error:
                assert "injected supplier invoice journal failure" in str(error)
            else:
                raise AssertionError("injected journal failure did not abort execution")
            _assert_execute_rollback(
                runtime_dsn, supplier_invoice_id, batch_id
            )
        finally:
            _remove_failure(admin_dsn)

        executed = service.execute(
            command_request_id=command_id,
            preview_hash=prepared.preview_hash,
            idempotency_key=f"execute-{command_id}",
            context=_context("automation.command.execute", "automation.command.execute"),
        )
        replayed = service.execute(
            command_request_id=command_id,
            preview_hash=prepared.preview_hash,
            idempotency_key=f"execute-{command_id}",
            context=_context("automation.command.execute", "automation.command.execute"),
        )
        assert executed.resource_id == replayed.resource_id == supplier_invoice_id
        assert executed.idempotency_replayed is False
        assert replayed.idempotency_replayed is True
        status = service.get_status(
            command_request_id=command_id,
            context=_context(
                "automation.command.status.get", "automation.command.view"
            ),
        )
        assert status.status == "succeeded"
        assert status.resource_id == supplier_invoice_id
        assert status.preview_hash == prepared.preview_hash

    _assert_posted_readback(
        runtime_url, runtime_dsn, supplier_invoice_id, goods_receipt_id, batch_id
    )
    transferred_supplier_invoice_id = _run_transferred_stock_lifecycle(
        admin_dsn, runtime_url, calculator_url, runtime_dsn
    )
    print(
        "supplier-invoice landed-cost PostgreSQL 15 lifecycle passed: "
        f"invoice={supplier_invoice_id} inventory_delta=300.00 consumed_variance=200.00; "
        f"transferred_invoice={transferred_supplier_invoice_id} "
        "inventory_delta=500.00 consumed_variance=0.00"
    )


if __name__ == "__main__":
    run_lifecycle()
