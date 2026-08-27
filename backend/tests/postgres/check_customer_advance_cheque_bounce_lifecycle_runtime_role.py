#!/usr/bin/env python3
"""Prove customer-advance cheque bounce and replacement on PostgreSQL 15.

The fixture uses only the opted-in disposable Alembic database. It creates the
sales order and every payment through canonical command lifecycles; the sole
owner-side mutation temporarily moves that order to another branch to prove the
runtime resolver rejects cross-branch lineage, then restores it before posting.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
import hashlib
import os
from typing import Any
from urllib.parse import quote
from uuid import UUID, uuid4, uuid5

import psycopg2
from psycopg2.extensions import AsIs, register_adapter
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.domain.operator_actions.contract import ACTION_POLICIES, PREPARE_PAYLOAD_MODELS
from app.domain.operator_actions.models import (
    ActionContext,
    ActionErrorCode,
    OperatorActionError,
)
from app.infrastructure.operator_actions.service import SqlAlchemyOperatorActionService
from scripts import provision_canonical_demo as fixture

def _assert_disposable_pg15(database_url: str) -> None:
    url = make_url(database_url)
    if os.environ.get("CANONICAL_CI_ALLOW_DISPOSABLE") != "1":
        raise RuntimeError("customer-advance lifecycle requires disposable opt-in")
    if url.host not in {"127.0.0.1", "localhost"}:
        raise RuntimeError("customer-advance lifecycle requires an exact loopback host")
    if url.database != "canonical_alembic_ci":
        raise RuntimeError("customer-advance lifecycle requires canonical_alembic_ci")


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


def _configure_fixture_ids() -> str:
    namespace = uuid4()
    for key in tuple(fixture.IDS):
        fixture.IDS[key] = str(uuid5(namespace, key))
    fixture.CLIENT_ID = f"pg15-customer-advance-bounce-{namespace}"
    return f"CABIF{namespace.int % 10000:04d}C"


def _seed_reference_authority(connection: Any) -> None:
    """Seed run-unique disposable HSN authority for repeatable lifecycle runs."""

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT release.id,version.id
              FROM core.reference_data_releases release
              JOIN tax.tax_code_versions version ON version.release_id=release.id
             WHERE release.dataset_kind='hsn_sac_tax' AND release.status='active'
               AND version.code='481910' AND version.status='active'
             ORDER BY release.effective_from DESC,release.id,version.id
             LIMIT 1
            """
        )
        existing = cursor.fetchone()
    if existing is not None:
        fixture.IDS["tax_release"] = str(existing[0])
        fixture.IDS["tax_version"] = str(existing[1])
        return

    release_id = UUID(fixture.IDS["tax_release"])
    source_hash = hashlib.sha256(
        b"pg15 customer advance tax fixture:" + release_id.bytes
    ).digest()
    dataset_hash = hashlib.sha256(
        b"481910:6:6:12:0:" + release_id.bytes
    ).digest()
    with connection.cursor() as cursor:
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        cursor.execute("SET CONSTRAINTS ALL DEFERRED")
        for setting, value in (
            ("app.org_id", fixture.IDS["org"]),
            ("app.membership_id", fixture.IDS["reviewer_membership"]),
            ("app.user_id", fixture.IDS["reviewer_user"]),
            ("app.request_id", fixture.IDS["request"]),
        ):
            cursor.execute("SELECT set_config(%s, %s, true)", (setting, value))
        cursor.execute("ALTER TABLE core.reference_data_releases DISABLE TRIGGER USER")
        cursor.execute("ALTER TABLE tax.tax_code_versions DISABLE TRIGGER USER")
        cursor.execute(
            """
            INSERT INTO core.reference_data_releases(
              id,dataset_kind,ruleset_version,source_authority,source_uri,
              source_storage_bucket,source_storage_object_path,source_media_type,
              source_document_sha256,dataset_storage_bucket,dataset_storage_object_path,
              dataset_media_type,dataset_sha256,record_count,publication_date,
              effective_from,reviewed_by_user_id,reviewed_at,status)
            VALUES (%s,'hsn_sac_tax','pg15-customer-advance-fixture-v1','gstn',
              'https://example.invalid/pg15-customer-advance-authority',
              'fixture','customer-advance/source.txt','text/plain',%s,
              'fixture','customer-advance/dataset.json','application/json',%s,1,
              DATE '2026-08-20',DATE '2026-08-20',%s,transaction_timestamp(),'active')
            """,
            (
                release_id,
                psycopg2.Binary(source_hash),
                psycopg2.Binary(dataset_hash),
                fixture.IDS["reviewer_user"],
            ),
        )
        cursor.execute(
            """
            INSERT INTO tax.tax_code_versions(
              id,release_id,code,code_kind,version_number,description,
              effective_from,taxability,default_supply_type,cgst_rate,sgst_rate,
              igst_rate,cess_rate,ruleset_version,status)
            VALUES (%s,%s,'481910','hsn',1,'Disposable customer advance tax fixture',
              DATE '2026-08-20','taxable','goods',6,6,12,0,
              'pg15-customer-advance-fixture-v1','active')
            """,
            (fixture.IDS["tax_version"], release_id),
        )
        cursor.execute("ALTER TABLE tax.tax_code_versions ENABLE TRIGGER USER")
        cursor.execute("ALTER TABLE core.reference_data_releases ENABLE TRIGGER USER")


def _context(
    operation: str,
    permission: str,
    *,
    approver: bool = False,
    org_id: UUID | None = None,
) -> ActionContext:
    return ActionContext(
        auth_user_id=UUID(
            fixture.IDS["reviewer_auth_user" if approver else "operator_auth_user"]
        ),
        user_id=UUID(fixture.IDS["reviewer_user" if approver else "operator_user"]),
        organization_id=org_id or UUID(fixture.IDS["org"]),
        membership_id=UUID(
            fixture.IDS["reviewer_membership" if approver else "operator_membership"]
        ),
        agent_grant_id=UUID(
            fixture.IDS[
                "legacy_approver_agent_grant" if approver else "agent_grant"
            ]
        ),
        client_id=fixture.CLIENT_ID,
        operation_key=operation,
        permission=permission,
        branch_ids=(UUID(fixture.IDS["branch"]),),
        organization_scope=True,
    )


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
    *,
    separate_approver: bool,
):
    command_id = prepared.command_request_id
    approval = service.approve(
        command_request_id=command_id,
        preview_hash=prepared.preview_hash,
        idempotency_key=f"approve-{command_id}",
        context=_context(
            "automation.command.approve",
            "automation.command.approve",
            approver=separate_approver,
        ),
    )
    assert approval.status == "approved"
    executed = service.execute(
        command_request_id=command_id,
        preview_hash=prepared.preview_hash,
        idempotency_key=f"execute-{command_id}",
        context=_context("automation.command.execute", "automation.command.execute"),
    )
    assert executed.status == "succeeded"
    replay = service.execute(
        command_request_id=command_id,
        preview_hash=prepared.preview_hash,
        idempotency_key=f"execute-{command_id}",
        context=_context("automation.command.execute", "automation.command.execute"),
    )
    assert replay.resource_id == executed.resource_id
    assert replay.idempotency_replayed is True
    return executed


def _sales_order_payload(*, business_date: date, row_version: int) -> dict[str, Any]:
    payload = fixture.sales_order_payload(
        row_version,
        business_date=business_date,
        delivery_offset_days="5",
    )
    payload["idempotency_key"] = f"pg15-customer-advance-order-{uuid4()}"
    return payload


def _advance_payload(
    order_id: UUID,
    amount: Decimal,
    *,
    business_date: date,
    suffix: str,
) -> dict[str, Any]:
    return {
        "idempotency_key": f"pg15-customer-advance-{suffix}-{uuid4()}",
        "branch_id": fixture.IDS["branch"],
        "payment_date": business_date.isoformat(),
        "customer_account_id": fixture.IDS["customer_account"],
        "payment_method": "cheque",
        "receipt_purpose": "customer_advance",
        "amount": format(amount, ".2f"),
        "allocations": [],
        "sales_order_id": str(order_id),
        "external_reference": f"PG15-ADV-{suffix}-{uuid4()}",
        "evidence_attachment_id": fixture.IDS["customer_receipt_evidence"],
        "instrument_number": f"PG15-{suffix}-{uuid4()}",
        "instrument_date": business_date.isoformat(),
        "drawee_bank_name": "Disposable PostgreSQL 15 cheque fixture",
        "account_payee_confirmed": True,
    }


def _bounce_payload(
    payment_id: UUID,
    row_version: int,
    *,
    business_date: date,
) -> dict[str, Any]:
    return {
        "idempotency_key": f"pg15-customer-advance-bounce-{uuid4()}",
        "branch_id": fixture.IDS["branch"],
        "original_payment_id": str(payment_id),
        "original_payment_row_version": str(row_version),
        "bounce_date": business_date.isoformat(),
        "evidence_attachment_id": fixture.IDS["customer_receipt_evidence"],
        "reason_code": "funds_insufficient",
    }


def _set_order_branch_for_cross_branch_fixture(
    admin_dsn: str,
    order_id: UUID,
    branch_id: str,
) -> None:
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        cursor.execute("SELECT set_config('app.org_id',%s,true)", (fixture.IDS["org"],))
        cursor.execute(
            "SELECT set_config('app.membership_id',%s,true)",
            (fixture.IDS["reviewer_membership"],),
        )
        cursor.execute("SELECT set_config('app.request_id',%s,true)", (str(uuid4()),))
        cursor.execute("ALTER TABLE sales.orders DISABLE TRIGGER USER")
        try:
            cursor.execute(
                "UPDATE sales.orders SET branch_id=%s WHERE org_id=%s AND id=%s",
                (branch_id, fixture.IDS["org"], order_id),
            )
            assert cursor.rowcount == 1
        finally:
            cursor.execute("ALTER TABLE sales.orders ENABLE TRIGGER USER")


def _assert_posted_bounce_accounting(admin_dsn: str, original_id: UUID, bounce_id: UUID) -> None:
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT original.status,original.payment_purpose,bounce.status,bounce.payment_purpose,
                   bounce.related_payment_id,bounce.amount
              FROM finance.payments original
              JOIN finance.payments bounce ON bounce.org_id=original.org_id
               AND bounce.related_payment_id=original.id
             WHERE original.org_id=%s AND original.id=%s AND bounce.id=%s
            """,
            (fixture.IDS["org"], original_id, bounce_id),
        )
        payment = cursor.fetchone()
        assert payment[:5] == (
            "posted", "customer_advance", "posted", "cheque_bounce", str(original_id),
        )
        assert payment[5] > Decimal("0.00")
        cursor.execute(
            """
            SELECT original.status,bounce.status,bounce.reversal_of_journal_entry_id=original.id,
                   bounce.transaction_debit_total,bounce.transaction_credit_total,
                   coalesce(sum(line.transaction_debit),0),coalesce(sum(line.transaction_credit),0)
              FROM finance.accounting_events original_event
              JOIN finance.journal_entries original ON original.org_id=original_event.org_id
               AND original.id=original_event.journal_entry_id
              JOIN finance.accounting_events bounce_event ON bounce_event.org_id=original_event.org_id
               AND bounce_event.payment_id=%s
              JOIN finance.journal_entries bounce ON bounce.org_id=bounce_event.org_id
               AND bounce.id=bounce_event.journal_entry_id
              JOIN finance.journal_lines line ON line.org_id=bounce.org_id
               AND line.journal_entry_id=bounce.id
             WHERE original_event.org_id=%s AND original_event.payment_id=%s
             GROUP BY original.status,bounce.status,bounce.reversal_of_journal_entry_id,
                      original.id,bounce.transaction_debit_total,bounce.transaction_credit_total
            """,
            (bounce_id, fixture.IDS["org"], original_id),
        )
        journal = cursor.fetchone()
        assert journal[0:3] == ("reversed", "posted", True)
        assert journal[3] == journal[4] == journal[5] == journal[6] == payment[5]
        cursor.execute(
            """
            SELECT item.status,allocation.payment_id,allocation.amount
              FROM finance.accounting_events event
              JOIN finance.open_items item ON item.org_id=event.org_id
               AND item.accounting_event_id=event.id
              JOIN finance.allocations allocation ON allocation.org_id=item.org_id
               AND allocation.open_item_id=item.id
             WHERE event.org_id=%s AND event.payment_id=%s
            """,
            (fixture.IDS["org"], original_id),
        )
        item = cursor.fetchone()
        assert item == ("settled", str(bounce_id), payment[5])


def run_lifecycle() -> None:
    register_adapter(UUID, lambda value: AsIs(f"'{value}'::uuid"))
    admin_url = os.environ["DATABASE_URL"]
    _assert_disposable_pg15(admin_url)
    admin_dsn = _admin_dsn(admin_url)
    role_password = quote(f"pg15-{uuid4()}", safe="")
    runtime_url = _role_url(admin_url, "erp_runtime", role_password)
    calculator_url = _role_url(admin_url, "erp_calculator", role_password)
    runtime_dsn = _admin_dsn(runtime_url)
    organization_pan = _configure_fixture_ids()

    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute("SHOW server_version_num")
        assert int(cursor.fetchone()[0]) // 10000 == 15, "PostgreSQL 15 is required"
        cursor.execute(f'ALTER ROLE "erp_runtime" LOGIN PASSWORD \'{role_password}\'')
        cursor.execute(f'ALTER ROLE "erp_calculator" LOGIN PASSWORD \'{role_password}\'')
    with psycopg2.connect(admin_dsn) as connection:
        fixture.bootstrap_identity(connection, organization_pan=organization_pan)
    with psycopg2.connect(admin_dsn) as connection:
        _seed_reference_authority(connection)
    with psycopg2.connect(runtime_dsn) as connection:
        business_date = fixture.organization_business_date(connection)
    with psycopg2.connect(admin_dsn) as connection:
        fixture.seed_business_master(connection, business_date=business_date)
        fixture.seed_end_to_end_master(connection, business_date=business_date)
    with psycopg2.connect(runtime_dsn) as connection:
        fixture.activate_demo_product(connection)
        row_version = fixture.selected_customer_delivery_address_row_version(
            connection, business_date=business_date
        )

    runtime_engine = create_engine(runtime_url, pool_pre_ping=True)
    calculator_engine = create_engine(calculator_url, pool_pre_ping=True)
    try:
        service = SqlAlchemyOperatorActionService(
            session_factory=lambda: Session(runtime_engine),
            calculator_factory=lambda: Session(calculator_engine),
            runtime_principal_configured=True,
        )
        order = _approve_and_execute(
            service,
            _prepare(
                service,
                "sales.order.prepare",
                _sales_order_payload(business_date=business_date, row_version=row_version),
            ),
            separate_approver=False,
        )
        assert order.resource_id is not None
        with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
            cursor.execute(
                "SELECT grand_total FROM sales.orders WHERE org_id=%s AND id=%s",
                (fixture.IDS["org"], order.resource_id),
            )
            order_total = cursor.fetchone()[0]
        assert isinstance(order_total, Decimal) and order_total > Decimal("0.01")

        _set_order_branch_for_cross_branch_fixture(
            admin_dsn, order.resource_id, fixture.IDS["transfer_destination_branch"]
        )
        try:
            _prepare(
                service,
                "finance.customer_receipt.prepare",
                _advance_payload(
                    order.resource_id,
                    order_total,
                    business_date=business_date,
                    suffix="cross-branch",
                ),
            )
        except OperatorActionError as error:
            assert error.code in {
                ActionErrorCode.POLICY_BLOCKED,
                ActionErrorCode.SCOPE_DENIED,
                ActionErrorCode.VALIDATION_FAILED,
            }
        else:
            raise AssertionError("cross-branch customer advance prepare was not denied")
        finally:
            _set_order_branch_for_cross_branch_fixture(
                admin_dsn, order.resource_id, fixture.IDS["branch"]
            )

        advance_payload = _advance_payload(
            order.resource_id,
            order_total,
            business_date=business_date,
            suffix="original",
        )
        advance = _prepare(service, "finance.customer_receipt.prepare", advance_payload)
        advance_replay = _prepare(
            service, "finance.customer_receipt.prepare", advance_payload
        )
        assert advance_replay.command_request_id == advance.command_request_id
        assert advance_replay.preview_hash == advance.preview_hash
        advance_execution = _approve_and_execute(
            service, advance, separate_approver=False
        )
        assert advance_execution.resource_id is not None
        with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
            cursor.execute(
                "SELECT row_version FROM finance.payments WHERE org_id=%s AND id=%s",
                (fixture.IDS["org"], advance_execution.resource_id),
            )
            original_row_version = cursor.fetchone()[0]

        bounce = _prepare(
            service,
            "finance.customer_cheque_bounce.prepare",
            _bounce_payload(
                advance_execution.resource_id,
                original_row_version,
                business_date=business_date,
            ),
        )
        bounce_execution = _approve_and_execute(
            service, bounce, separate_approver=True
        )
        assert bounce_execution.resource_id is not None
        _assert_posted_bounce_accounting(
            admin_dsn, advance_execution.resource_id, bounce_execution.resource_id
        )

        replacement_payload = _advance_payload(
            order.resource_id,
            order_total,
            business_date=business_date,
            suffix="replacement",
        )
        replacement = _prepare(
            service, "finance.customer_receipt.prepare", replacement_payload
        )
        replacement_execution = _approve_and_execute(
            service, replacement, separate_approver=False
        )
        assert replacement_execution.resource_id is not None

        try:
            _prepare(
                service,
                "finance.customer_receipt.prepare",
                _advance_payload(
                    order.resource_id,
                    Decimal("0.01"),
                    business_date=business_date,
                    suffix="over-ceiling",
                ),
            )
        except OperatorActionError as error:
            assert error.code is ActionErrorCode.VALIDATION_FAILED
        else:
            raise AssertionError("replacement plus 0.01 exceeded order advance ceiling")

        cross_tenant_payload = _advance_payload(
            order.resource_id,
            Decimal("0.01"),
            business_date=business_date,
            suffix="cross-tenant",
        )
        policy = ACTION_POLICIES["finance.customer_receipt.prepare"]
        values = PREPARE_PAYLOAD_MODELS[policy.operation_key].model_validate(
            cross_tenant_payload
        ).model_dump(mode="python", exclude_none=True)
        key = values.pop("idempotency_key")
        try:
            service.prepare(
                policy=policy,
                payload=values,
                idempotency_key=key,
                context=_context(
                    policy.operation_key,
                    policy.permission,
                    org_id=UUID(fixture.IDS["denial_org"]),
                ),
            )
        except OperatorActionError as error:
            assert error.code is ActionErrorCode.SCOPE_DENIED
        else:
            raise AssertionError("cross-tenant customer advance prepare was not denied")

        with Session(runtime_engine) as session:
            try:
                session.execute(
                    text("UPDATE finance.payments SET memo='forbidden' WHERE id=:id"),
                    {"id": advance_execution.resource_id},
                )
            except DBAPIError:
                session.rollback()
            else:
                raise AssertionError("erp_runtime retained direct payment UPDATE")
    finally:
        calculator_engine.dispose()
        runtime_engine.dispose()


if __name__ == "__main__":
    run_lifecycle()
