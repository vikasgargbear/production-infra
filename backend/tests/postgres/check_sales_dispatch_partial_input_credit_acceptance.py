"""Run a real runtime-role sales dispatch against partially ITC-backed stock."""

from __future__ import annotations

from copy import deepcopy
from decimal import Decimal
import hashlib
import os
from typing import Any
from urllib.parse import quote
from uuid import UUID, uuid4

import psycopg2
from psycopg2.extensions import AsIs, register_adapter
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.routes.canonical_sales_chain_reads import (
    _sales_dispatch_valuation_acceptance_readback,
)
from app.domain.operator_actions.contract import ACTION_POLICIES, PREPARE_PAYLOAD_MODELS
from app.domain.operator_actions.models import ActionErrorCode, OperatorActionError
from scripts import provision_canonical_demo as fixture
from check_sales_invoice_direct_issue_acceptance import (
    _admin_dsn, _configure_fixture_ids, _context, _install_failure, _remove_failure,
    _role_url, _seed_reference_authority, _service,
)


OPEN_QTY = Decimal("54.000000")
OPEN_VALUE = Decimal("5142.87")
ISSUE_QTY = Decimal("14.000000")
ISSUE_VALUE = Decimal("1333.34")
ITC_QTY = Decimal("12.500000")
ITC_TAX = Decimal("71.43")


def _prepare(service, operation: str, payload: dict[str, Any], key: str):
    policy = ACTION_POLICIES[operation]
    model = PREPARE_PAYLOAD_MODELS[operation].model_validate(
        {**payload, "idempotency_key": key}
    )
    values = model.model_dump(mode="python", exclude_none=True)
    values.pop("idempotency_key")
    return service.prepare(
        policy=policy, payload=values, idempotency_key=key,
        context=_context(operation, policy.permission),
    )


def _approve(service, prepared):
    return service.approve(
        command_request_id=prepared.command_request_id,
        preview_hash=prepared.preview_hash,
        idempotency_key=f"approve-{prepared.command_request_id}",
        context=_context("automation.command.approve", "automation.command.approve"),
    )


def _execute(service, prepared):
    return service.execute(
        command_request_id=prepared.command_request_id,
        preview_hash=prepared.preview_hash,
        idempotency_key=f"execute-{prepared.command_request_id}",
        context=_context("automation.command.execute", "automation.command.execute"),
    )


def _seed_opening_stock(runtime_dsn: str) -> UUID:
    batch_id, document_id, line_id = uuid4(), uuid4(), uuid4()
    with psycopg2.connect(runtime_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s,%s)",
            (fixture.IDS["operator_auth_user"], fixture.IDS["org"]),
        )
        cursor.execute("SELECT set_config('app.request_id',%s,true)", (str(uuid4()),))
        cursor.execute(
            """
            INSERT INTO inventory.batches(
              org_id,id,product_id,batch_number,lot_kind,manufactured_on,expires_on,
              mrp,mrp_uom_conversion_id,status,released_at,released_by_membership_id,
              created_by_membership_id,updated_by_membership_id)
            VALUES (%s,%s,%s,%s,'manufacturer_batch',CURRENT_DATE-30,CURRENT_DATE+365,
              200,%s,'released',transaction_timestamp(),%s,%s,%s)
            """,
            (fixture.IDS["org"], batch_id, fixture.IDS["product"],
             f"PG15-PARTIAL-ITC-{batch_id}", fixture.IDS["uom_conversion"],
             fixture.IDS["operator_membership"], fixture.IDS["operator_membership"],
             fixture.IDS["operator_membership"]),
        )
        cursor.execute(
            """
            INSERT INTO inventory.inventory_documents(
              org_id,id,branch_id,physical_movement_required,document_type,
              document_number,fiscal_year,document_date,status,reason_code,currency_code,
              costing_method_snapshot,total_abs_base_quantity,total_value,approved_at,
              approved_by_membership_id,created_by_membership_id,updated_by_membership_id)
            VALUES (%s,%s,%s,false,'opening_receipt',%s,
              extract(year from CURRENT_DATE)::smallint,CURRENT_DATE,'approved',
              'opening_balance','INR','moving_weighted_average',%s,%s,
              transaction_timestamp(),%s,%s,%s)
            """,
            (fixture.IDS["org"], document_id, fixture.IDS["branch"],
             f"PG15-PARTIAL-OPEN-{document_id}", OPEN_QTY, OPEN_VALUE,
             fixture.IDS["operator_membership"], fixture.IDS["operator_membership"],
             fixture.IDS["operator_membership"]),
        )
        cursor.execute(
            """
            INSERT INTO inventory.inventory_document_lines(
              org_id,id,inventory_document_id,line_number,movement_kind,product_id,
              batch_id,uom_code,entered_quantity,base_quantity,to_location_id,
              unit_cost,extended_cost,created_by_membership_id)
            VALUES (%s,%s,%s,1,'receipt',%s,%s,'EA',%s,%s,%s,95.2383,%s,%s)
            """,
            (fixture.IDS["org"], line_id, document_id, fixture.IDS["product"],
             batch_id, OPEN_QTY, OPEN_QTY, fixture.IDS["saleable_location"],
             OPEN_VALUE, fixture.IDS["operator_membership"]),
        )
        cursor.execute(
            """
            SELECT erp_trade_commands.post_inventory_document(
              %s,%s,%s,%s,%s,transaction_timestamp()+interval '1 hour')
            """,
            (fixture.IDS["org"], document_id, fixture.IDS["operator_membership"],
             psycopg2.Binary(hashlib.sha256(f"open-key-{document_id}".encode()).digest()),
             psycopg2.Binary(hashlib.sha256(f"open-request-{document_id}".encode()).digest())),
        )
    return batch_id


def _seed_partial_itc(admin_dsn: str, batch_id: UUID) -> tuple[UUID, UUID, UUID]:
    lot_id, other_lot_id, other_org = uuid4(), uuid4(), uuid4()
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        # Fixture setup only. The dispatch and all triggered mutations below run
        # normally as erp_runtime with every production trigger enabled.
        cursor.execute("SET LOCAL session_replication_role=replica")
        for org_id, source_lot_id in (
            (fixture.IDS["org"], lot_id), (other_org, other_lot_id),
        ):
            cursor.execute(
                """
                INSERT INTO tax.input_credit_lots(
                  org_id,id,registration_id,supplier_invoice_id,supplier_invoice_line_id,
                  supplier_invoice_receipt_allocation_id,goods_receipt_line_id,batch_id,
                  acquired_on,acquired_base_quantity,eligible_cgst_amount,
                  eligible_sgst_amount,eligible_igst_amount,eligible_cess_amount,
                  remaining_base_quantity,remaining_cgst_amount,remaining_sgst_amount,
                  remaining_igst_amount,remaining_cess_amount,lineage_status,source_hash,
                  created_by_membership_id,updated_by_membership_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,CURRENT_DATE-5,%s,%s,%s,0,0,
                  %s,%s,%s,0,0,'exact',%s,%s,%s)
                """,
                (org_id, source_lot_id, uuid4(), uuid4(), uuid4(), uuid4(), uuid4(),
                 batch_id, ITC_QTY, ITC_TAX, ITC_TAX, ITC_QTY, ITC_TAX, ITC_TAX,
                 psycopg2.Binary(hashlib.sha256(
                     f"partial-itc-{source_lot_id}".encode()
                 ).digest()), fixture.IDS["operator_membership"],
                 fixture.IDS["operator_membership"]),
            )
    return lot_id, other_lot_id, other_org


def _resource_id(admin_dsn: str, org_id: str, command_id: UUID) -> UUID:
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT target_resource_id FROM automation.command_requests WHERE org_id=%s AND id=%s",
            (org_id, command_id),
        )
        return UUID(str(cursor.fetchone()[0]))


def _cancel_prepared_dispatch(runtime_dsn: str, dispatch_id: UUID) -> None:
    """Cancel only the disposable draft; it must never consume order quantity."""

    with psycopg2.connect(runtime_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s,%s)",
            (fixture.IDS["operator_auth_user"], fixture.IDS["org"]),
        )
        cursor.execute(
            "SELECT set_config('app.request_id',%s,true)",
            (str(uuid4()),),
        )
        cursor.execute(
            """
            UPDATE sales.dispatches
               SET status='cancelled', updated_at=transaction_timestamp(),
                   updated_by_membership_id=%s, row_version=row_version+1
             WHERE org_id=%s AND id=%s AND status='draft'
            """,
            (fixture.IDS["operator_membership"], fixture.IDS["org"], dispatch_id),
        )
        assert cursor.rowcount == 1


def _expect_separate_quantity_ceiling(service, payload: dict[str, Any]) -> None:
    over_ceiling = deepcopy(payload)
    over_ceiling["lines"][0]["batch_allocations"][0][
        "billed_quantity"
    ] = "12.000001"
    over_ceiling["lines"][0]["billed_quantity"] = "12.000001"
    try:
        _prepare(
            service,
            "sales.dispatch.prepare",
            over_ceiling,
            f"pg15-dispatch-over-ceiling-{uuid4()}",
        )
    except OperatorActionError as error:
        assert error.code is ActionErrorCode.VALIDATION_FAILED
        assert error.metadata["sqlstate"] == "23514"
    else:
        raise AssertionError("dispatch accepted billed quantity above 12.000000")


def _assert_rollback(runtime_dsn: str, dispatch_id: UUID, batch_id: UUID, lot_id: UUID) -> None:
    with psycopg2.connect(runtime_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s,%s)",
            (fixture.IDS["operator_auth_user"], fixture.IDS["org"]),
        )
        cursor.execute(
            """
            SELECT status,
              (SELECT count(*) FROM inventory.stock_ledger_entries ledger
                JOIN inventory.inventory_documents document
                  ON document.org_id=ledger.org_id AND document.id=ledger.inventory_document_id
               WHERE document.org_id=%s AND document.sales_dispatch_id=%s),
              (SELECT count(*) FROM finance.accounting_events event
               WHERE event.org_id=%s AND event.inventory_document_id IN (
                 SELECT id FROM inventory.inventory_documents
                  WHERE org_id=%s AND sales_dispatch_id=%s))
              FROM sales.dispatches WHERE org_id=%s AND id=%s
            """,
            (fixture.IDS["org"], dispatch_id, fixture.IDS["org"], fixture.IDS["org"],
             dispatch_id, fixture.IDS["org"], dispatch_id),
        )
        assert cursor.fetchone() == ("draft", 0, 0)
        cursor.execute(
            "SELECT on_hand_quantity,inventory_value FROM inventory.stock_balances "
            "WHERE org_id=%s AND location_id=%s AND product_id=%s AND batch_id=%s",
            (fixture.IDS["org"], fixture.IDS["saleable_location"],
             fixture.IDS["product"], batch_id),
        )
        assert cursor.fetchone() == (OPEN_QTY, OPEN_VALUE)
        cursor.execute(
            """
            SELECT remaining_base_quantity,row_version,
              (SELECT count(*) FROM tax.input_credit_applications application
                WHERE application.org_id=lot.org_id AND application.input_credit_lot_id=lot.id)
              FROM tax.input_credit_lots lot WHERE org_id=%s AND id=%s
            """,
            (fixture.IDS["org"], lot_id),
        )
        assert cursor.fetchone() == (ITC_QTY, 1, 0)


def _reconcile(runtime_dsn: str, dispatch_id: UUID, batch_id: UUID, lot_id: UUID) -> None:
    with psycopg2.connect(runtime_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s,%s)",
            (fixture.IDS["operator_auth_user"], fixture.IDS["org"]),
        )
        cursor.execute(
            """
            SELECT dispatch.status,document.status,ledger.id,ledger.quantity_delta,
                   ledger.value_delta,balance.on_hand_quantity,balance.inventory_value,
                   count(DISTINCT event.id),min(journal.status),
                   min(journal.transaction_debit_total),min(journal.transaction_credit_total)
              FROM sales.dispatches dispatch
              JOIN inventory.inventory_documents document
                ON document.org_id=dispatch.org_id AND document.sales_dispatch_id=dispatch.id
              JOIN inventory.stock_ledger_entries ledger
                ON ledger.org_id=document.org_id AND ledger.inventory_document_id=document.id
              JOIN inventory.stock_balances balance
                ON balance.org_id=ledger.org_id AND balance.location_id=ledger.location_id
               AND balance.product_id=ledger.product_id AND balance.batch_id=ledger.batch_id
              JOIN finance.accounting_events event
                ON event.org_id=document.org_id AND event.inventory_document_id=document.id
              JOIN finance.journal_entries journal
                ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id
             WHERE dispatch.org_id=%s AND dispatch.id=%s AND ledger.batch_id=%s
             GROUP BY dispatch.status,document.status,ledger.id,ledger.quantity_delta,
                      ledger.value_delta,balance.on_hand_quantity,balance.inventory_value
            """,
            (fixture.IDS["org"], dispatch_id, batch_id),
        )
        row = cursor.fetchone()
        assert row is not None and row[:2] == ("posted", "posted")
        ledger_id = row[2]
        assert row[3:] == (-ISSUE_QTY, -ISSUE_VALUE, OPEN_QTY-ISSUE_QTY,
                           OPEN_VALUE-ISSUE_VALUE, 1, "posted", ISSUE_VALUE, ISSUE_VALUE)
        cursor.execute(
            """
            SELECT lot.remaining_base_quantity,lot.remaining_cgst_amount,
                   lot.remaining_sgst_amount,lot.row_version,
                   application.stock_ledger_entry_id,application.applied_base_quantity,
                   application.applied_cgst_amount,application.applied_sgst_amount,
                   application.application_kind,application.status
              FROM tax.input_credit_lots lot JOIN tax.input_credit_applications application
                ON application.org_id=lot.org_id AND application.input_credit_lot_id=lot.id
             WHERE lot.org_id=%s AND lot.id=%s
            """,
            (fixture.IDS["org"], lot_id),
        )
        assert cursor.fetchone() == (Decimal("0.000000"), Decimal("0.00"),
            Decimal("0.00"), 2, ledger_id, ITC_QTY, ITC_TAX, ITC_TAX,
            "sale_consumption", "posted")


def main() -> None:
    register_adapter(UUID, lambda value: AsIs(f"'{value}'::uuid"))
    admin_url = os.environ["DATABASE_URL"]
    admin_dsn = _admin_dsn(admin_url)
    password = quote(f"pg15-{uuid4()}", safe="")
    runtime_url = _role_url(admin_url, "erp_runtime", password)
    calculator_url = _role_url(admin_url, "erp_calculator", password)
    runtime_dsn = _admin_dsn(runtime_url)
    _configure_fixture_ids()
    org_hex = UUID(fixture.IDS["org"]).hex
    organization_pan = (
        "".join(chr(ord("A") + int(character, 16)) for character in org_hex[:5])
        + "".join(str(int(character, 16) % 10) for character in org_hex[5:9])
        + chr(ord("A") + int(org_hex[9], 16))
    )
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute("SHOW server_version_num")
        assert int(cursor.fetchone()[0]) // 10000 == 15
        cursor.execute(f'ALTER ROLE "erp_runtime" LOGIN PASSWORD \'{password}\'')
        cursor.execute(f'ALTER ROLE "erp_calculator" LOGIN PASSWORD \'{password}\'')
    with psycopg2.connect(admin_dsn) as connection:
        # This gate runs after the independent invoice acceptance in the same
        # disposable database, so use a distinct, shape-valid organization PAN.
        fixture.bootstrap_identity(connection, organization_pan=organization_pan)
    with psycopg2.connect(admin_dsn) as connection:
        # Reference tax releases are global authority. Install the reviewed
        # fixture when this test runs alone; otherwise reuse the exact version
        # already installed by an earlier acceptance in the same disposable DB.
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id,release_id FROM tax.tax_code_versions "
                "WHERE code='481910' AND version_number=1"
            )
            rows = cursor.fetchall()
        if not rows:
            _seed_reference_authority(connection)
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT id,release_id FROM tax.tax_code_versions "
                    "WHERE code='481910' AND version_number=1"
                )
                rows = cursor.fetchall()
        assert len(rows) == 1
        fixture.IDS["tax_version"] = str(rows[0][0])
        fixture.IDS["tax_release"] = str(rows[0][1])
    with psycopg2.connect(runtime_dsn) as connection:
        business_date = fixture.organization_business_date(connection)
    with psycopg2.connect(admin_dsn) as connection:
        fixture.seed_business_master(connection, business_date=business_date)
        fixture.seed_end_to_end_master(connection, business_date=business_date)
    with psycopg2.connect(runtime_dsn) as connection:
        fixture.activate_demo_product(connection)

    batch_id = _seed_opening_stock(runtime_dsn)
    lot_id, other_lot_id, other_org = _seed_partial_itc(admin_dsn, batch_id)
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute("SELECT row_version FROM parties.addresses WHERE org_id=%s AND id=%s",
                       (fixture.IDS["org"], fixture.IDS["customer_address"]))
        address_version = int(cursor.fetchone()[0])

    with _service(runtime_url, calculator_url) as service:
        order_payload = fixture.sales_order_payload(
            address_version,
            business_date=business_date,
            delivery_offset_days="2",
        )
        order_key = f"pg15-partial-order-{uuid4()}"
        order = _prepare(service, "sales.order.prepare", order_payload, order_key)
        assert _prepare(service, "sales.order.prepare", order_payload, order_key).command_request_id == order.command_request_id
        assert _approve(service, order).status == "approved"
        order_execution = _execute(service, order)
        assert order_execution.status == "succeeded"
        assert _execute(service, order).idempotency_replayed is True
        order_id = UUID(str(order_execution.resource_id))
        with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
            cursor.execute("SELECT id FROM sales.order_lines WHERE org_id=%s AND order_id=%s",
                           (fixture.IDS["org"], order_id))
            lines = cursor.fetchall()
            assert len(lines) == 1
            order_line_id = UUID(str(lines[0][0]))

        dispatch_payload = fixture.sales_dispatch_payload(
            str(order_id),
            str(order_line_id),
            [{
                "batch_id": str(batch_id), "billed_quantity": "12", "free_quantity": "2",
            }],
            business_date=business_date,
            requested_delivery_date=order_payload["requested_delivery_date"],
        )
        policy = ACTION_POLICIES["sales.dispatch.prepare"]
        try:
            model = PREPARE_PAYLOAD_MODELS["sales.dispatch.prepare"].model_validate(
                {**dispatch_payload, "idempotency_key": f"cross-{uuid4()}"})
            values = model.model_dump(mode="python", exclude_none=True)
            values.pop("idempotency_key")
            service.prepare(policy=policy, payload=values, idempotency_key=f"cross-{uuid4()}",
                context=_context("sales.dispatch.prepare", policy.permission,
                                 org_id=UUID(fixture.IDS["denial_org"])))
        except OperatorActionError as error:
            assert error.code is ActionErrorCode.SCOPE_DENIED
        else:
            raise AssertionError("cross-tenant sales dispatch was not denied")

        dispatch_key = f"pg15-partial-dispatch-{uuid4()}"

        # An abandoned/cancelled prepare and a concurrent draft are evidence,
        # not fulfillment.  Each exact 12 billed + 2 free draft must prepare
        # independently while the separate approved ceilings remain strict.
        cancelled = _prepare(
            service,
            "sales.dispatch.prepare",
            dispatch_payload,
            f"pg15-cancelled-dispatch-{uuid4()}",
        )
        cancelled_id = _resource_id(
            admin_dsn, fixture.IDS["org"], cancelled.command_request_id
        )
        _cancel_prepared_dispatch(runtime_dsn, cancelled_id)

        dispatch = _prepare(service, "sales.dispatch.prepare", dispatch_payload, dispatch_key)
        replay = _prepare(service, "sales.dispatch.prepare", dispatch_payload, dispatch_key)
        assert replay.command_request_id == dispatch.command_request_id
        assert replay.preview_hash == dispatch.preview_hash
        dispatch_id = _resource_id(admin_dsn, fixture.IDS["org"], dispatch.command_request_id)

        parallel_draft = _prepare(
            service,
            "sales.dispatch.prepare",
            dispatch_payload,
            f"pg15-parallel-draft-dispatch-{uuid4()}",
        )
        parallel_draft_id = _resource_id(
            admin_dsn, fixture.IDS["org"], parallel_draft.command_request_id
        )
        _cancel_prepared_dispatch(runtime_dsn, parallel_draft_id)
        _expect_separate_quantity_ceiling(service, dispatch_payload)

        assert _approve(service, dispatch).status == "approved"
        _install_failure(admin_dsn)
        try:
            try:
                _execute(service, dispatch)
            except Exception as error:
                assert "injected journal failure" in str(error)
            else:
                raise AssertionError("injected journal failure did not abort dispatch")
            _assert_rollback(runtime_dsn, dispatch_id, batch_id, lot_id)
        finally:
            _remove_failure(admin_dsn)
        executed = _execute(service, dispatch)
        replayed = _execute(service, dispatch)
        assert executed.status == "succeeded"
        assert UUID(str(executed.resource_id)) == dispatch_id
        assert replayed.idempotency_replayed is True
        assert replayed.resource_id == executed.resource_id

    _reconcile(runtime_dsn, dispatch_id, batch_id, lot_id)
    runtime_engine = create_engine(runtime_url)
    try:
        with Session(runtime_engine) as session:
            readback = _sales_dispatch_valuation_acceptance_readback(
                dispatch_id,
                {
                    "org_id": fixture.IDS["org"],
                    "auth_user_id": fixture.IDS["operator_auth_user"],
                },
                session,
            )
        assert readback.dispatch_id == dispatch_id
        assert readback.sales_order_id == order_id
        assert readback.status == "posted"
        assert len(readback.lines) == 1
        assert readback.lines[0].sales_order_line_id == order_line_id
    finally:
        runtime_engine.dispose()
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute("SELECT remaining_base_quantity,remaining_cgst_amount,remaining_sgst_amount,row_version "
                       "FROM tax.input_credit_lots WHERE org_id=%s AND id=%s",
                       (other_org, other_lot_id))
        assert cursor.fetchone() == (ITC_QTY, ITC_TAX, ITC_TAX, 1)
    print(f"sales-dispatch partial-ITC PostgreSQL 15 acceptance passed: {dispatch_id}")


if __name__ == "__main__":
    main()
