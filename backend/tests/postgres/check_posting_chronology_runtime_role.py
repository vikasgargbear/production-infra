"""Exercise forward-only posting chronology through the real runtime role.

This is a disposable PostgreSQL-15 acceptance.  It proves predecessor chronology,
organization-local future-date rejection, replay, rollback, and tenant isolation
without bypassing the production prepare/approve/execute service.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal
import hashlib
import os
from typing import Any
from urllib.parse import quote
from uuid import UUID, uuid4

import psycopg2
from psycopg2.extensions import AsIs, register_adapter

from app.domain.operator_actions.contract import ACTION_POLICIES, PREPARE_PAYLOAD_MODELS
from app.domain.operator_actions.models import (
    ActionContext,
    ActionErrorCode,
    OperatorActionError,
)
from scripts import provision_canonical_demo as fixture
from check_sales_dispatch_partial_input_credit_acceptance import (
    _approve,
    _execute,
    _prepare,
)
from check_sales_invoice_direct_issue_acceptance import (
    _admin_dsn,
    _configure_fixture_ids,
    _context,
    _install_failure,
    _remove_failure,
    _role_url,
    _seed_reference_authority,
    _service,
)


def _expect_validation(service, operation: str, payload: dict[str, Any]) -> None:
    try:
        _prepare(service, operation, payload, f"chronology-invalid-{uuid4()}")
    except OperatorActionError as error:
        assert error.code is ActionErrorCode.VALIDATION_FAILED
        assert error.metadata == {
            "operation_key": operation,
            "reason": "CANONICAL_DATABASE_POLICY_REJECTED",
            "sqlstate": "22007",
        }
    else:
        raise AssertionError(f"{operation} accepted invalid posting chronology")


def _expect_policy_predecessor_rejection(
    service, operation: str, payload: dict[str, Any]
) -> None:
    try:
        _prepare(service, operation, payload, f"chronology-predecessor-{uuid4()}")
    except OperatorActionError as error:
        assert error.code is ActionErrorCode.POLICY_BLOCKED
        assert error.metadata == {
            "operation_key": operation,
            "reason": "CANONICAL_DATABASE_POLICY_REJECTED",
            "sqlstate": "0A000",
        }
    else:
        raise AssertionError(f"{operation} accepted a pre-source document date")


def _expect_cross_tenant(service, operation: str, payload: dict[str, Any]) -> None:
    policy = ACTION_POLICIES[operation]
    model = PREPARE_PAYLOAD_MODELS[operation].model_validate(
        {**payload, "idempotency_key": f"chronology-cross-{uuid4()}"}
    )
    values = model.model_dump(mode="python", exclude_none=True)
    values.pop("idempotency_key")
    try:
        service.prepare(
            policy=policy,
            payload=values,
            idempotency_key=f"chronology-cross-{uuid4()}",
            context=_context(
                operation,
                policy.permission,
                org_id=UUID(fixture.IDS["denial_org"]),
            ),
        )
    except OperatorActionError as error:
        assert error.code is ActionErrorCode.SCOPE_DENIED
        assert error.metadata["sqlstate"] == "42501"
    else:
        raise AssertionError(f"{operation} crossed tenant scope")


def _resource_id(admin_dsn: str, command_id: UUID) -> UUID:
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT target_resource_id FROM automation.command_requests "
            "WHERE org_id=%s AND id=%s",
            (fixture.IDS["org"], command_id),
        )
        row = cursor.fetchone()
    assert row is not None and row[0] is not None
    return UUID(str(row[0]))


def _execute_replay(service, prepared) -> UUID:
    assert _approve(service, prepared).status == "approved"
    executed = _execute(service, prepared)
    replayed = _execute(service, prepared)
    assert executed.status == "succeeded"
    assert replayed.idempotency_replayed is True
    assert replayed.resource_id == executed.resource_id
    return UUID(str(executed.resource_id))


def _approve_as_reviewer(service, prepared):
    return service.approve(
        command_request_id=prepared.command_request_id,
        preview_hash=prepared.preview_hash,
        idempotency_key=f"approve-{prepared.command_request_id}",
        context=ActionContext(
            auth_user_id=UUID(fixture.IDS["reviewer_auth_user"]),
            user_id=UUID(fixture.IDS["reviewer_user"]),
            organization_id=UUID(fixture.IDS["org"]),
            membership_id=UUID(fixture.IDS["reviewer_membership"]),
            agent_grant_id=UUID(fixture.IDS["legacy_approver_agent_grant"]),
            client_id=fixture.CLIENT_ID,
            operation_key="automation.command.approve",
            permission="automation.command.approve",
            branch_ids=(UUID(fixture.IDS["branch"]),),
            organization_scope=True,
        ),
    )


def _execute_return_replay(service, prepared) -> UUID:
    assert _approve_as_reviewer(service, prepared).status == "approved"
    executed = _execute(service, prepared)
    replayed = _execute(service, prepared)
    assert executed.status == "succeeded"
    assert replayed.idempotency_replayed is True
    assert replayed.resource_id == executed.resource_id
    return UUID(str(executed.resource_id))


def _assert_supplier_invoice_rollback(runtime_dsn: str, invoice_id: UUID) -> None:
    with psycopg2.connect(runtime_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s,%s)",
            (fixture.IDS["operator_auth_user"], fixture.IDS["org"]),
        )
        cursor.execute(
            """
            SELECT invoice.status,
                   (SELECT count(*) FROM tax.documents tax_document
                     WHERE tax_document.org_id=invoice.org_id
                       AND tax_document.supplier_invoice_id=invoice.id),
                   (SELECT count(*) FROM finance.accounting_events event
                     WHERE event.org_id=invoice.org_id
                       AND event.supplier_invoice_id=invoice.id),
                   (SELECT count(*) FROM finance.open_items item
                      JOIN finance.accounting_events event
                        ON event.org_id=item.org_id AND event.id=item.accounting_event_id
                     WHERE event.org_id=invoice.org_id
                       AND event.supplier_invoice_id=invoice.id)
              FROM procurement.supplier_invoices invoice
             WHERE invoice.org_id=%s AND invoice.id=%s
            """,
            (fixture.IDS["org"], invoice_id),
        )
        assert cursor.fetchone() == ("approved", 0, 0, 0)


def _return_balance(runtime_dsn: str, batch_id: str) -> Decimal:
    with psycopg2.connect(runtime_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s,%s)",
            (fixture.IDS["operator_auth_user"], fixture.IDS["org"]),
        )
        cursor.execute(
            """
            SELECT on_hand_quantity
              FROM inventory.stock_balances
             WHERE org_id=%s AND branch_id=%s AND location_id=%s
               AND product_id=%s AND batch_id=%s
            """,
            (
                fixture.IDS["org"],
                fixture.IDS["branch"],
                fixture.IDS["saleable_location"],
                fixture.IDS["product"],
                batch_id,
            ),
        )
        row = cursor.fetchone()
    assert row is not None
    return Decimal(row[0])


def _assert_return_rollback(
    runtime_dsn: str,
    *,
    return_kind: str,
    return_id: UUID,
    batch_id: str,
    expected_status: str,
    expected_balance: Decimal,
) -> None:
    sources = {
        "sales": (
            "sales.returns",
            "sales_return_id",
        ),
        "purchase": (
            "procurement.purchase_returns",
            "purchase_return_id",
        ),
    }
    header_table, return_fk = sources[return_kind]
    with psycopg2.connect(runtime_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s,%s)",
            (fixture.IDS["operator_auth_user"], fixture.IDS["org"]),
        )
        cursor.execute(
            f"""
            SELECT returned.status,
                   (SELECT count(*) FROM finance.adjustment_notes note
                     WHERE note.org_id=returned.org_id
                       AND note.{return_fk}=returned.id),
                   (SELECT count(*) FROM tax.documents tax_document
                      JOIN finance.adjustment_notes note
                        ON note.org_id=tax_document.org_id
                       AND note.id=tax_document.adjustment_note_id
                     WHERE note.org_id=returned.org_id
                       AND note.{return_fk}=returned.id),
                   (SELECT count(*) FROM finance.accounting_events event
                      JOIN finance.adjustment_notes note
                        ON note.org_id=event.org_id
                       AND note.id=event.adjustment_note_id
                     WHERE note.org_id=returned.org_id
                       AND note.{return_fk}=returned.id),
                   (SELECT count(*) FROM inventory.stock_ledger_entries ledger
                      JOIN inventory.inventory_documents document
                        ON document.org_id=ledger.org_id
                       AND document.id=ledger.inventory_document_id
                     WHERE document.org_id=returned.org_id
                       AND document.{return_fk}=returned.id)
              FROM {header_table} returned
             WHERE returned.org_id=%s AND returned.id=%s
            """,
            (fixture.IDS["org"], return_id),
        )
        evidence = cursor.fetchone()
        assert evidence == (expected_status, 0, 0, 0, 0), evidence
    assert _return_balance(runtime_dsn, batch_id) == expected_balance


def _bump_return_row_version(admin_dsn: str, *, return_kind: str, return_id: UUID) -> None:
    header_table = {
        "sales": "sales.returns",
        "purchase": "procurement.purchase_returns",
    }[return_kind]
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        for setting, value in (
            ("app.request_id", str(uuid4())),
            ("app.org_id", fixture.IDS["org"]),
            ("app.membership_id", fixture.IDS["reviewer_membership"]),
            ("app.user_id", fixture.IDS["reviewer_user"]),
        ):
            cursor.execute("SELECT set_config(%s,%s,true)", (setting, value))
        cursor.execute(
            f"UPDATE {header_table} SET row_version=row_version+1 "
            "WHERE org_id=%s AND id=%s",
            (fixture.IDS["org"], return_id),
        )
        assert cursor.rowcount == 1


def _line_id(admin_dsn: str, table: str, parent_column: str, parent_id: UUID) -> UUID:
    allowed = {
        ("procurement.purchase_order_lines", "purchase_order_id"),
        ("sales.order_lines", "order_id"),
    }
    assert (table, parent_column) in allowed
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            f"SELECT id FROM {table} WHERE org_id=%s AND {parent_column}=%s "
            "ORDER BY line_number DESC LIMIT 1",
            (fixture.IDS["org"], parent_id),
        )
        row = cursor.fetchone()
    assert row is not None
    return UUID(str(row[0]))


def _seed_adjustment_authority(connection, business_date) -> None:
    """Install a labelled disposable two-rule authority under migration ownership."""

    source_hash = hashlib.sha256(b"pg15 chronology adjustment source").digest()
    dataset_hash = hashlib.sha256(b"pg15 chronology adjustment dataset").digest()
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT release.id,sales.id,purchase.id
              FROM core.reference_data_releases release
              JOIN tax.gst_adjustment_rule_versions sales
                ON sales.release_id=release.id AND sales.side='sales'
               AND sales.direction='credit' AND sales.reason_code='customer_rejection'
               AND sales.tax_effect='statutory' AND sales.status='active'
              JOIN tax.gst_adjustment_rule_versions purchase
                ON purchase.release_id=release.id AND purchase.side='purchase'
               AND purchase.direction='debit' AND purchase.reason_code='wrong_supply'
               AND purchase.tax_effect='statutory' AND purchase.status='active'
             WHERE release.dataset_kind='gst_adjustment_rules'
               AND release.status='active'
            """
        )
        existing = cursor.fetchall()
        if existing:
            assert len(existing) == 1
            fixture.IDS["adjustment_rule_release"] = str(existing[0][0])
            fixture.IDS["sales_return_rule"] = str(existing[0][1])
            fixture.IDS["purchase_return_rule"] = str(existing[0][2])
            # Continue: the test organization still needs its own sequence.
        else:
            cursor.execute("SET LOCAL ROLE erp_migration_owner")
            cursor.execute("ALTER TABLE core.reference_data_releases DISABLE TRIGGER USER")
            cursor.execute(
                """
                INSERT INTO core.reference_data_releases(
                  id,dataset_kind,ruleset_version,source_authority,source_uri,
                  source_storage_bucket,source_storage_object_path,source_media_type,
                  source_document_sha256,dataset_storage_bucket,dataset_storage_object_path,
                  dataset_media_type,dataset_sha256,record_count,publication_date,
                  effective_from,reviewed_by_user_id,reviewed_at,status)
                VALUES(%s,'gst_adjustment_rules',%s,'gst_council',
                  'https://example.invalid/pg15-chronology-adjustment-authority',
                  'fixture','chronology/source.txt','text/plain',%s,
                  'fixture','chronology/dataset.json','application/json',%s,2,%s,%s,
                  %s,transaction_timestamp(),'active')
                """,
                (
                    fixture.IDS["adjustment_rule_release"],
                    f"pg15-chronology-{fixture.IDS['adjustment_rule_release']}",
                    psycopg2.Binary(source_hash),
                    psycopg2.Binary(dataset_hash),
                    business_date,
                    business_date,
                    fixture.IDS["reviewer_user"],
                ),
            )
            cursor.execute("ALTER TABLE core.reference_data_releases ENABLE TRIGGER USER")
            cursor.execute(
                "ALTER TABLE tax.gst_adjustment_rule_versions DISABLE TRIGGER USER"
            )
            cursor.execute(
                """
                INSERT INTO tax.gst_adjustment_rule_versions(
                  id,release_id,rule_code,rule_version,side,direction,document_effect,
                  reason_code,deadline_policy,deadline_days,portal_evidence_required,
                  tax_effect,effective_from,status)
                VALUES
                  (%s,%s,'PG15_CHRONOLOGY_SALES','1','sales','credit','decrease',
                   'customer_rejection','none',NULL,false,'statutory',%s,'active'),
                  (%s,%s,'PG15_CHRONOLOGY_PURCHASE','1','purchase','debit','decrease',
                   'wrong_supply','none',NULL,true,'statutory',%s,'active')
                """,
                (
                    fixture.IDS["sales_return_rule"],
                    fixture.IDS["adjustment_rule_release"],
                    business_date,
                    fixture.IDS["purchase_return_rule"],
                    fixture.IDS["adjustment_rule_release"],
                    business_date,
                ),
            )
            cursor.execute(
                "ALTER TABLE tax.gst_adjustment_rule_versions ENABLE TRIGGER USER"
            )
        cursor.execute("SET LOCAL ROLE erp_migration_owner")
        fiscal_start_year = (
            business_date.year if business_date.month >= 4 else business_date.year - 1
        )
        cursor.execute(
            """
            INSERT INTO core.document_sequences(
              org_id,id,branch_id,document_type,fiscal_year_start,prefix,suffix,
              padding,next_value,status,created_by_membership_id,updated_by_membership_id)
            VALUES(%s,%s,%s,'adjustment_note',%s,'PG15-AN-','',6,1,'active',%s,%s)
            """,
            (
                fixture.IDS["org"],
                uuid4(),
                fixture.IDS["branch"],
                business_date.replace(year=fiscal_start_year, month=4, day=1),
                fixture.IDS["reviewer_membership"],
                fixture.IDS["reviewer_membership"],
            ),
        )


def main() -> None:
    register_adapter(UUID, lambda value: AsIs(f"'{value}'::uuid"))
    admin_url = os.environ["DATABASE_URL"]
    admin_dsn = _admin_dsn(admin_url)
    password = quote(f"pg15-chronology-{uuid4()}", safe="")
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
        fixture.bootstrap_identity(connection, organization_pan=organization_pan)
    with psycopg2.connect(admin_dsn) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id,release_id FROM tax.tax_code_versions "
                "WHERE code='481910' AND version_number=1"
            )
            tax_rows = cursor.fetchall()
        if not tax_rows:
            _seed_reference_authority(connection)
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT id,release_id FROM tax.tax_code_versions "
                    "WHERE code='481910' AND version_number=1"
                )
                tax_rows = cursor.fetchall()
        assert len(tax_rows) == 1
        fixture.IDS["tax_version"] = str(tax_rows[0][0])
        fixture.IDS["tax_release"] = str(tax_rows[0][1])
    with psycopg2.connect(runtime_dsn) as connection:
        business_date, business_instant = fixture.organization_business_clock(
            connection
        )
    previous_date = business_date - timedelta(days=1)
    next_date = business_date + timedelta(days=1)
    # This chronology fixture deliberately proves that a supplier document may
    # predate its receipt by one day.  Its master and tax authority therefore
    # begin on that exact earliest tested document date.  Runtime timestamps
    # are still interpreted through the organization's locked timezone.
    with psycopg2.connect(admin_dsn) as connection:
        fixture.seed_business_master(connection, business_date=previous_date)
        fixture.seed_end_to_end_master(connection, business_date=previous_date)
        _seed_adjustment_authority(connection, business_date)
    with psycopg2.connect(runtime_dsn) as connection:
        fixture.activate_demo_product(connection)
    with _service(runtime_url, calculator_url) as service:
        purchase_payload = fixture.purchase_order_payload(business_date=business_date)
        future_purchase = deepcopy(purchase_payload)
        future_purchase["order_date"] = next_date.isoformat()
        _expect_validation(service, "procurement.purchase_order.prepare", future_purchase)

        purchase_key = f"chronology-po-{uuid4()}"
        purchase = _prepare(
            service, "procurement.purchase_order.prepare", purchase_payload, purchase_key
        )
        assert (
            _prepare(
                service,
                "procurement.purchase_order.prepare",
                purchase_payload,
                purchase_key,
            ).command_request_id
            == purchase.command_request_id
        )
        purchase_id = _execute_replay(service, purchase)
        purchase_line_id = _line_id(
            admin_dsn,
            "procurement.purchase_order_lines",
            "purchase_order_id",
            purchase_id,
        )

        receipt_payload = fixture.goods_receipt_payload(
            str(purchase_id),
            str(purchase_line_id),
            business_date=business_date,
            received_at=business_instant,
        )
        receipt_batch = receipt_payload["lines"][0]["batches"][0]
        receipt_batch.update(
            {
                "received_quantity": "50",
                "accepted_quantity": "50",
                "free_quantity": "2.5",
            }
        )
        invalid_receipt = deepcopy(receipt_payload)
        invalid_receipt["received_at"] = datetime.combine(
            previous_date, time(12), tzinfo=timezone.utc
        ).isoformat()
        invalid_receipt["supplier_challan_date"] = previous_date.isoformat()
        _expect_validation(
            service, "procurement.goods_receipt.prepare", invalid_receipt
        )

        receipt = _prepare(
            service,
            "procurement.goods_receipt.prepare",
            receipt_payload,
            f"chronology-grn-{uuid4()}",
        )
        receipt_id = _execute_replay(service, receipt)
        with psycopg2.connect(runtime_dsn) as connection:
            receipt_readback = fixture.reconcile_goods_receipt(
                connection,
                str(receipt_id),
                expected_accepted_quantity="50",
                expected_free_quantity="2.5",
            )
            fixture.release_received_batch(
                connection, str(receipt_id), receipt_readback["batch_id"]
            )

        with psycopg2.connect(admin_dsn) as connection:
            portal_evidence = fixture.seed_supplier_invoice_portal_evidence(
                connection, business_date=previous_date
            )
        supplier_payload = fixture.supplier_invoice_payload(
            str(receipt_id),
            receipt_readback["goods_receipt_line_id"],
            portal_evidence,
            business_date=previous_date,
        )
        # The supplier's invoice may legally predate receipt.  Recognition may not.
        supplier_payload["received_date"] = business_date.isoformat()
        future_supplier_invoice = deepcopy(supplier_payload)
        future_supplier_invoice["invoice_date"] = next_date.isoformat()
        future_supplier_invoice["received_date"] = next_date.isoformat()
        _expect_validation(
            service,
            "procurement.supplier_invoice.prepare",
            future_supplier_invoice,
        )
        future_supplier_received = deepcopy(supplier_payload)
        future_supplier_received["received_date"] = next_date.isoformat()
        _expect_validation(
            service,
            "procurement.supplier_invoice.prepare",
            future_supplier_received,
        )
        invalid_supplier = deepcopy(supplier_payload)
        invalid_supplier["received_date"] = previous_date.isoformat()
        _expect_validation(
            service, "procurement.supplier_invoice.prepare", invalid_supplier
        )
        _expect_cross_tenant(
            service, "procurement.supplier_invoice.prepare", supplier_payload
        )

        supplier_key = f"chronology-supplier-invoice-{uuid4()}"
        supplier_invoice = _prepare(
            service,
            "procurement.supplier_invoice.prepare",
            supplier_payload,
            supplier_key,
        )
        supplier_replay = _prepare(
            service,
            "procurement.supplier_invoice.prepare",
            supplier_payload,
            supplier_key,
        )
        assert supplier_replay.command_request_id == supplier_invoice.command_request_id
        assert supplier_replay.preview_hash == supplier_invoice.preview_hash
        supplier_invoice_id = _resource_id(
            admin_dsn, supplier_invoice.command_request_id
        )
        assert _approve(service, supplier_invoice).status == "approved"
        _install_failure(admin_dsn)
        try:
            try:
                _execute(service, supplier_invoice)
            except Exception as error:
                assert "injected journal failure" in str(error)
            else:
                raise AssertionError(
                    "injected journal failure did not abort supplier invoice"
                )
            _assert_supplier_invoice_rollback(runtime_dsn, supplier_invoice_id)
        finally:
            _remove_failure(admin_dsn)
        executed_supplier = _execute(service, supplier_invoice)
        replayed_supplier = _execute(service, supplier_invoice)
        assert executed_supplier.status == "succeeded"
        assert UUID(str(executed_supplier.resource_id)) == supplier_invoice_id
        assert replayed_supplier.idempotency_replayed is True
        assert replayed_supplier.resource_id == executed_supplier.resource_id

        with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
            cursor.execute(
                "SELECT allocation.id "
                "FROM procurement.supplier_invoice_receipt_allocations allocation "
                "JOIN procurement.supplier_invoice_lines line "
                "ON line.org_id=allocation.org_id "
                "AND line.id=allocation.supplier_invoice_line_id "
                "WHERE line.org_id=%s AND line.supplier_invoice_id=%s",
                (fixture.IDS["org"], supplier_invoice_id),
            )
            allocation_id = UUID(str(cursor.fetchone()[0]))
            purchase_return_evidence = fixture.seed_purchase_return_portal_evidence(
                connection
            )
            cursor.execute("SET LOCAL ROLE erp_migration_owner")
            cursor.execute(
                "ALTER TABLE tax.portal_document_lines DISABLE TRIGGER USER"
            )
            cursor.execute(
                "UPDATE tax.portal_document_lines SET invoice_date=%s "
                "WHERE org_id=%s AND id=%s",
                (
                    next_date,
                    fixture.IDS["org"],
                    purchase_return_evidence["supplier_credit_note_portal_line_id"],
                ),
            )
            cursor.execute(
                "ALTER TABLE tax.portal_document_lines ENABLE TRIGGER USER"
            )
        purchase_return = fixture.purchase_return_payload(
            str(supplier_invoice_id),
            receipt_readback["goods_receipt_line_id"],
            str(allocation_id),
            receipt_readback["batch_id"],
            purchase_return_evidence,
            business_date=business_date,
        )
        _expect_validation(
            service, "procurement.purchase_return.prepare", purchase_return
        )
        with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
            cursor.execute("SET LOCAL ROLE erp_migration_owner")
            cursor.execute(
                "ALTER TABLE tax.portal_document_lines DISABLE TRIGGER USER"
            )
            cursor.execute(
                "UPDATE tax.portal_document_lines SET invoice_date=%s "
                "WHERE org_id=%s AND id=%s",
                (
                    previous_date,
                    fixture.IDS["org"],
                    purchase_return_evidence[
                        "supplier_credit_note_portal_line_id"
                    ],
                ),
            )
            cursor.execute(
                "ALTER TABLE tax.portal_document_lines ENABLE TRIGGER USER"
            )
        future_purchase_return = deepcopy(purchase_return)
        future_purchase_return["return_date"] = next_date.isoformat()
        _expect_validation(
            service,
            "procurement.purchase_return.prepare",
            future_purchase_return,
        )
        predecessor_purchase_return = deepcopy(purchase_return)
        predecessor_purchase_return["return_date"] = (
            previous_date - timedelta(days=1)
        ).isoformat()
        _expect_validation(
            service,
            "procurement.purchase_return.prepare",
            predecessor_purchase_return,
        )

        purchase_return_key = f"chronology-purchase-return-{uuid4()}"
        prepared_purchase_return = _prepare(
            service,
            "procurement.purchase_return.prepare",
            purchase_return,
            purchase_return_key,
        )
        purchase_return_prepare_replay = _prepare(
            service,
            "procurement.purchase_return.prepare",
            purchase_return,
            purchase_return_key,
        )
        assert (
            purchase_return_prepare_replay.command_request_id
            == prepared_purchase_return.command_request_id
        )
        assert (
            purchase_return_prepare_replay.preview_hash
            == prepared_purchase_return.preview_hash
        )
        purchase_return_id = _resource_id(
            admin_dsn, prepared_purchase_return.command_request_id
        )
        assert _approve_as_reviewer(service, prepared_purchase_return).status == "approved"
        purchase_balance_before = _return_balance(
            runtime_dsn, receipt_readback["batch_id"]
        )
        _install_failure(admin_dsn)
        try:
            try:
                _execute(service, prepared_purchase_return)
            except Exception as error:
                assert "injected journal failure" in str(error)
            else:
                raise AssertionError(
                    "injected journal failure did not abort purchase return"
                )
            _assert_return_rollback(
                runtime_dsn,
                return_kind="purchase",
                return_id=purchase_return_id,
                batch_id=receipt_readback["batch_id"],
                expected_status="submitted",
                expected_balance=purchase_balance_before,
            )
        finally:
            _remove_failure(admin_dsn)
        executed_purchase_return = _execute(service, prepared_purchase_return)
        replayed_purchase_return = _execute(service, prepared_purchase_return)
        assert executed_purchase_return.status == "succeeded"
        assert UUID(str(executed_purchase_return.resource_id)) == purchase_return_id
        assert replayed_purchase_return.idempotency_replayed is True
        assert replayed_purchase_return.resource_id == executed_purchase_return.resource_id
        with psycopg2.connect(runtime_dsn) as connection:
            purchase_return_readback = fixture.reconcile_purchase_return(
                connection,
                str(purchase_return_id),
                str(prepared_purchase_return.command_request_id),
            )
        assert purchase_return_readback["base_billed_quantity"] == "10.000000"
        assert purchase_return_readback["base_free_quantity"] == "0.000000"

        with psycopg2.connect(runtime_dsn) as connection:
            address_version = fixture.selected_customer_delivery_address_row_version(
                connection, business_date=business_date
            )
        order_payload = fixture.sales_order_payload(
            address_version, business_date=business_date, delivery_offset_days="2"
        )
        future_order = deepcopy(order_payload)
        future_order["order_date"] = next_date.isoformat()
        _expect_validation(service, "sales.order.prepare", future_order)
        order = _prepare(
            service, "sales.order.prepare", order_payload, f"chronology-so-{uuid4()}"
        )
        order_id = _execute_replay(service, order)
        order_line_id = _line_id(admin_dsn, "sales.order_lines", "order_id", order_id)

        dispatch_payload = fixture.sales_dispatch_payload(
            str(order_id),
            str(order_line_id),
            [
                {
                    "batch_id": receipt_readback["batch_id"],
                    "billed_quantity": "12",
                    "free_quantity": "2",
                }
            ],
            business_date=business_date,
            requested_delivery_date=order_payload["requested_delivery_date"],
        )
        future_dispatch = deepcopy(dispatch_payload)
        future_dispatch["dispatch_date"] = next_date.isoformat()
        _expect_validation(service, "sales.dispatch.prepare", future_dispatch)
        dispatch = _prepare(
            service,
            "sales.dispatch.prepare",
            dispatch_payload,
            f"chronology-dispatch-{uuid4()}",
        )
        dispatch_id = _execute_replay(service, dispatch)
        with psycopg2.connect(runtime_dsn) as connection:
            dispatch_readback = fixture.reconcile_sales_dispatch(
                connection,
                str(dispatch_id),
                expected_billed_quantity="12",
                expected_free_quantity="2",
            )

        invoice_payload = fixture.sales_invoice_payload(
            dispatch_readback["dispatch_lines"],
            address_version,
            business_date=business_date,
        )
        past_invoice = deepcopy(invoice_payload)
        past_invoice["invoice_date"] = previous_date.isoformat()
        _expect_validation(service, "sales.invoice.prepare", past_invoice)
        future_invoice = deepcopy(invoice_payload)
        future_invoice["invoice_date"] = next_date.isoformat()
        _expect_validation(service, "sales.invoice.prepare", future_invoice)
        invoice_key = f"chronology-sales-invoice-{uuid4()}"
        invoice = _prepare(
            service, "sales.invoice.prepare", invoice_payload, invoice_key
        )
        assert (
            _prepare(
                service, "sales.invoice.prepare", invoice_payload, invoice_key
            ).command_request_id
            == invoice.command_request_id
        )
        _expect_cross_tenant(service, "sales.invoice.prepare", invoice_payload)

        invoice_id = _execute_replay(service, invoice)
        with psycopg2.connect(runtime_dsn) as connection:
            invoice_readback = fixture.reconcile_sales_invoice(
                connection, str(invoice_id), str(invoice.command_request_id)
            )

        sales_return_payload = fixture.sales_return_payload(
            str(invoice_id),
            invoice_readback["invoice_line_id"],
            invoice_readback["dispatch_allocations"],
            business_date=business_date,
        )
        future_sales_return = deepcopy(sales_return_payload)
        future_sales_return["return_date"] = next_date.isoformat()
        _expect_validation(service, "sales.return.prepare", future_sales_return)
        predecessor_sales_return = deepcopy(sales_return_payload)
        predecessor_sales_return["return_date"] = previous_date.isoformat()
        _expect_validation(
            service, "sales.return.prepare", predecessor_sales_return
        )

        stale_sales_return = _prepare(
            service,
            "sales.return.prepare",
            sales_return_payload,
            f"chronology-sales-return-stale-{uuid4()}",
        )
        stale_sales_return_id = _resource_id(
            admin_dsn, stale_sales_return.command_request_id
        )
        assert _approve_as_reviewer(service, stale_sales_return).status == "approved"
        sales_balance_before = _return_balance(
            runtime_dsn,
            sales_return_payload["lines"][0]["batch_allocation"]["batch_id"],
        )
        _bump_return_row_version(
            admin_dsn,
            return_kind="sales",
            return_id=stale_sales_return_id,
        )
        try:
            _execute(service, stale_sales_return)
        except OperatorActionError as error:
            assert error.code is ActionErrorCode.STALE_VERSION
        else:
            raise AssertionError("stale sales-return aggregate executed")
        _assert_return_rollback(
            runtime_dsn,
            return_kind="sales",
            return_id=stale_sales_return_id,
            batch_id=sales_return_payload["lines"][0]["batch_allocation"]["batch_id"],
            expected_status="draft",
            expected_balance=sales_balance_before,
        )

        sales_return_key = f"chronology-sales-return-{uuid4()}"
        prepared_sales_return = _prepare(
            service,
            "sales.return.prepare",
            sales_return_payload,
            sales_return_key,
        )
        sales_return_prepare_replay = _prepare(
            service,
            "sales.return.prepare",
            sales_return_payload,
            sales_return_key,
        )
        assert (
            sales_return_prepare_replay.command_request_id
            == prepared_sales_return.command_request_id
        )
        assert sales_return_prepare_replay.preview_hash == prepared_sales_return.preview_hash
        sales_return_id = _execute_return_replay(service, prepared_sales_return)
        with psycopg2.connect(runtime_dsn) as connection:
            sales_return_readback = fixture.reconcile_sales_return(
                connection,
                str(sales_return_id),
                str(prepared_sales_return.command_request_id),
            )
        assert sales_return_readback["base_billed_quantity"] == "4.000000"
        assert sales_return_readback["base_free_quantity"] == "0.000000"

        with psycopg2.connect(runtime_dsn) as connection, connection.cursor() as cursor:
            cursor.execute(
                "SELECT erp_security.activate_context(%s,%s)",
                (fixture.IDS["operator_auth_user"], fixture.IDS["org"]),
            )
            cursor.execute(
                """
                SELECT invoice.rounding_policy,invoice.document_discount_kind,
                       invoice.document_discount_basis,invoice.document_discount_value,
                       line.id,line.billed_quantity,line.free_quantity,
                       line.free_supply_tax_treatment,line.quoted_unit_rate,
                       line.price_basis,line.line_discount_kind,
                       line.line_discount_basis,line.line_discount_value,
                       line.document_discount_eligible
                  FROM sales.invoices invoice
                  JOIN sales.invoice_lines line
                    ON line.org_id=invoice.org_id AND line.invoice_id=invoice.id
                 WHERE invoice.org_id=%s AND invoice.id=%s
                   AND line.line_kind='product'
                """,
                (fixture.IDS["org"], invoice_id),
            )
            note_source = cursor.fetchone()
            cursor.execute(
                """
                SELECT reason_code,tax_effect
                  FROM tax.gst_adjustment_rule_versions
                 WHERE status='active' AND side='sales' AND direction='credit'
                   AND document_effect='decrease' AND tax_effect='statutory'
                   AND effective_from<=%s
                   AND (effective_to IS NULL OR effective_to>=%s)
                 ORDER BY id LIMIT 1
                """,
                (business_date, business_date),
            )
            note_rule = cursor.fetchone()
        assert note_source is not None and note_rule is not None
        adjustment_payload = {
            "branch_id": fixture.IDS["branch"],
            "side": "sales",
            "direction": "credit",
            "original_document_id": str(invoice_id),
            "note_date": business_date.isoformat(),
            "gst_tax_treatment": note_rule[1],
            "reason_code": note_rule[0],
            "reason": "Disposable chronology acceptance",
            "recipient_itc_reversal_evidence_attachment_id": fixture.IDS[
                "recipient_itc_evidence"
            ],
            "recipient_itc_reversal_confirmed_at": datetime.now(
                timezone.utc
            ).isoformat(),
            "rounding_policy": note_source[0],
            "document_discount": {
                "document_discount_kind": note_source[1],
                "document_discount_basis": note_source[2],
                "document_discount_value": str(note_source[3]),
            },
            "lines": [
                {
                    "original_line_id": str(note_source[4]),
                    "billed_quantity": "1",
                    "free_quantity": "0",
                    "free_supply_tax_treatment": note_source[7],
                    "quoted_unit_rate": str(note_source[8]),
                    "price_basis": note_source[9],
                    "line_discount": {
                        "line_discount_kind": note_source[10],
                        "line_discount_basis": note_source[11],
                        "line_discount_value": str(note_source[12]),
                    },
                    "document_discount_eligible": note_source[13],
                }
            ],
        }
        future_adjustment = deepcopy(adjustment_payload)
        future_adjustment["note_date"] = next_date.isoformat()
        _expect_validation(
            service, "finance.adjustment_note.prepare", future_adjustment
        )
        predecessor_adjustment = deepcopy(adjustment_payload)
        predecessor_adjustment["note_date"] = previous_date.isoformat()
        _expect_policy_predecessor_rejection(
            service, "finance.adjustment_note.prepare", predecessor_adjustment
        )

    print(
        "posting chronology PostgreSQL 15 acceptance passed: "
        f"supplier_invoice={supplier_invoice_id} dispatch={dispatch_id} "
        f"purchase_return={purchase_return_id} sales_return={sales_return_id}"
    )


if __name__ == "__main__":
    main()
