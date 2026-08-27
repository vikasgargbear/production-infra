"""Exercise one canonical multi-batch direct-issue sales invoice on PostgreSQL 15.

The fixture owns only disposable data.  It derives every UUID from a per-run
namespace, seeds opening stock through the canonical inventory posting command,
and leaves production/staging untouched.
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import date
from decimal import Decimal
import hashlib
import os
from typing import Any, Iterator
from urllib.parse import quote
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

import psycopg2
from psycopg2.extensions import AsIs, register_adapter
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.domain.operator_actions.contract import ACTION_POLICIES, PREPARE_PAYLOAD_MODELS
from app.domain.operator_actions.models import (
    ActionContext,
    ActionErrorCode,
    OperatorActionError,
)
from app.infrastructure.operator_actions.service import SqlAlchemyOperatorActionService
from scripts import provision_canonical_demo as fixture


EXPECTED = {
    "billed_quantity": Decimal("12.000000"),
    "free_quantity": Decimal("2.000000"),
    "net_value_total": Decimal("1200.00"),
    "gst_taxable_total": Decimal("1200.00"),
    "cgst_total": Decimal("72.00"),
    "sgst_total": Decimal("72.00"),
    "igst_total": Decimal("0.00"),
    "cess_total": Decimal("0.00"),
    "grand_total": Decimal("1344.00"),
    "inventory_quantity": Decimal("14.000000"),
    "inventory_value": Decimal("160.00"),
    "journal_total": Decimal("1504.00"),
}


def _admin_dsn(database_url: str) -> str:
    url = make_url(database_url)
    return (
        f"host={url.host} port={url.port or 5432} dbname={url.database} "
        f"user={url.username} password={url.password or ''}"
    )


def _role_url(database_url: str, role: str, password: str) -> str:
    url = make_url(database_url).set(username=role, password=password)
    return url.render_as_string(hide_password=False)


def _context(operation: str, permission: str, *, org_id: UUID | None = None) -> ActionContext:
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
def _service(runtime_url: str, calculator_url: str) -> Iterator[SqlAlchemyOperatorActionService]:
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


def _configure_fixture_ids() -> None:
    run_namespace = uuid4()
    for key in tuple(fixture.IDS):
        fixture.IDS[key] = str(uuid5(run_namespace, key))
    fixture.CLIENT_ID = f"pg15-sales-invoice-{run_namespace}"


def _seed_reference_authority(connection: Any) -> None:
    """Seed a clearly labelled, rollback-disposable tax authority fixture."""

    source_hash = hashlib.sha256(b"pg15 sales invoice tax fixture").digest()
    dataset_hash = hashlib.sha256(b"481910:6:6:12:0").digest()
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT release.id,version.id
              FROM core.reference_data_releases AS release
              JOIN tax.tax_code_versions AS version
                ON version.release_id=release.id
             WHERE release.dataset_kind='hsn_sac_tax'
               AND release.dataset_sha256=%s
               AND release.status='active'
               AND version.code='481910'
               AND version.code_kind='hsn'
               AND version.status='active'
            """,
            (psycopg2.Binary(dataset_hash),),
        )
        existing = cursor.fetchone()
        if existing is not None:
            fixture.IDS["tax_release"] = str(existing[0])
            fixture.IDS["tax_version"] = str(existing[1])
            return
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
        try:
            cursor.execute(
                """
                INSERT INTO core.reference_data_releases(
                  id,dataset_kind,ruleset_version,source_authority,source_uri,
                  source_storage_bucket,source_storage_object_path,source_media_type,
                  source_document_sha256,dataset_storage_bucket,dataset_storage_object_path,
                  dataset_media_type,dataset_sha256,record_count,publication_date,
                  effective_from,reviewed_by_user_id,reviewed_at,status)
                VALUES (%s,'hsn_sac_tax','pg15-sales-invoice-fixture-v1','gstn',
                  'https://example.invalid/pg15-sales-invoice-authority',
                  'fixture','sales-invoice/source.txt','text/plain',%s,
                  'fixture','sales-invoice/dataset.json','application/json',%s,1,
                  DATE '2026-08-20',DATE '2026-08-20',%s,transaction_timestamp(),'active')
                """,
                (
                    fixture.IDS["tax_release"],
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
                VALUES (%s,%s,'481910','hsn',1,'Disposable acceptance tax fixture',
                  DATE '2026-08-20','taxable','goods',6,6,12,0,
                  'pg15-sales-invoice-fixture-v1','active')
                """,
                (fixture.IDS["tax_version"], fixture.IDS["tax_release"]),
            )
        finally:
            cursor.execute("ALTER TABLE tax.tax_code_versions ENABLE TRIGGER USER")
            cursor.execute("ALTER TABLE core.reference_data_releases ENABLE TRIGGER USER")


def _seed_opening_stock(runtime_dsn: str) -> tuple[list[UUID], dict[UUID, tuple[Decimal, Decimal]]]:
    batch_ids = [uuid4(), uuid4()]
    quantities = [Decimal("10.000000"), Decimal("10.000000")]
    costs = [Decimal("10.0000"), Decimal("15.0000")]
    # FEFO is expiry-tier based: multiple lots sharing the earliest expiry are
    # equivalent and may be consumed together.
    expiries = [date(2027, 1, 31), date(2027, 1, 31)]
    before: dict[UUID, tuple[Decimal, Decimal]] = {}
    with psycopg2.connect(runtime_dsn) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT erp_security.activate_context(%s,%s)",
                (fixture.IDS["operator_auth_user"], fixture.IDS["org"]),
            )
            cursor.execute(
                "SELECT set_config('app.request_id',%s,true)", (str(uuid4()),)
            )
            for index, (batch_id, quantity, cost, expiry) in enumerate(
                zip(batch_ids, quantities, costs, expiries), start=1
            ):
                document_id, line_id = uuid4(), uuid4()
                value = (quantity * cost).quantize(Decimal("0.01"))
                cursor.execute(
                    """
                    INSERT INTO inventory.batches(
                      org_id,id,product_id,batch_number,lot_kind,manufactured_on,
                      expires_on,mrp,mrp_uom_conversion_id,status,released_at,
                      released_by_membership_id,created_by_membership_id,
                      updated_by_membership_id)
                    VALUES (%s,%s,%s,%s,'manufacturer_batch',CURRENT_DATE-30,%s,200,
                      %s,'released',transaction_timestamp(),%s,%s,%s)
                    """,
                    (
                        fixture.IDS["org"], batch_id, fixture.IDS["product"],
                        f"PG15-FEFO-{index}-{batch_id}", expiry,
                        fixture.IDS["uom_conversion"], fixture.IDS["operator_membership"],
                        fixture.IDS["operator_membership"], fixture.IDS["operator_membership"],
                    ),
                )
                cursor.execute(
                    """
                    INSERT INTO inventory.inventory_documents(
                      org_id,id,branch_id,physical_movement_required,document_type,
                      document_number,fiscal_year,document_date,status,reason_code,
                      currency_code,costing_method_snapshot,total_abs_base_quantity,
                      total_value,approved_at,approved_by_membership_id,
                      created_by_membership_id,updated_by_membership_id)
                    VALUES (%s,%s,%s,false,'opening_receipt',%s,
                      extract(year from CURRENT_DATE)::smallint,CURRENT_DATE,'approved',
                      'opening_balance','INR','moving_weighted_average',%s,%s,
                      transaction_timestamp(),%s,%s,%s)
                    """,
                    (
                        fixture.IDS["org"], document_id, fixture.IDS["branch"],
                        f"PG15-OPEN-{index}-{document_id}", quantity, value,
                        fixture.IDS["operator_membership"], fixture.IDS["operator_membership"],
                        fixture.IDS["operator_membership"],
                    ),
                )
                cursor.execute(
                    """
                    INSERT INTO inventory.inventory_document_lines(
                      org_id,id,inventory_document_id,line_number,movement_kind,
                      product_id,batch_id,uom_code,entered_quantity,base_quantity,
                      to_location_id,unit_cost,extended_cost,created_by_membership_id)
                    VALUES (%s,%s,%s,1,'receipt',%s,%s,'EA',%s,%s,%s,%s,%s,%s)
                    """,
                    (
                        fixture.IDS["org"], line_id, document_id, fixture.IDS["product"],
                        batch_id, quantity, quantity, fixture.IDS["saleable_location"],
                        cost, value, fixture.IDS["operator_membership"],
                    ),
                )
                cursor.execute(
                    """
                    SELECT erp_trade_commands.post_inventory_document(
                      %s,%s,%s,%s,%s,transaction_timestamp()+interval '1 hour')
                    """,
                    (
                        fixture.IDS["org"], document_id,
                        fixture.IDS["operator_membership"],
                        psycopg2.Binary(hashlib.sha256(
                            f"opening-key-{document_id}".encode()
                        ).digest()),
                        psycopg2.Binary(hashlib.sha256(
                            f"opening-request-{document_id}".encode()
                        ).digest()),
                    ),
                )
                before[batch_id] = (quantity, value)
    return batch_ids, before


def _assert_batch_guard_uses_organization_date(
    admin_dsn: str, business_date: date
) -> None:
    """Prove a local-midnight batch does not use the session UTC date."""

    batch_id = uuid4()
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        cursor.execute("SET LOCAL TIME ZONE 'UTC'")
        for setting, value in (
            ("app.org_id", fixture.IDS["org"]),
            ("app.membership_id", fixture.IDS["operator_membership"]),
            ("app.user_id", fixture.IDS["operator_user"]),
            ("app.request_id", str(uuid4())),
        ):
            cursor.execute("SELECT set_config(%s,%s,true)", (setting, value))
        cursor.execute("SAVEPOINT tenant_batch_clock")
        cursor.execute(
            """
            INSERT INTO inventory.batches(
              org_id,id,product_id,batch_number,lot_kind,manufactured_on,
              expires_on,mrp,mrp_uom_conversion_id,status,created_at,
              created_by_membership_id,updated_by_membership_id)
            SELECT %s,%s,%s,%s,'manufacturer_batch',%s::date-30,%s::date+365,
                   200,%s,'quarantined',
                   (%s::date+TIME '00:15') AT TIME ZONE organization.timezone,
                   %s,%s
              FROM core.organizations AS organization
             WHERE organization.id=%s AND organization.status='active'
            """,
            (
                fixture.IDS["org"],
                batch_id,
                fixture.IDS["product"],
                f"PG15-TENANT-CLOCK-{batch_id}",
                business_date,
                business_date,
                fixture.IDS["uom_conversion"],
                business_date,
                fixture.IDS["operator_membership"],
                fixture.IDS["operator_membership"],
                fixture.IDS["org"],
            ),
        )
        cursor.execute(
            """
            SELECT batch.created_at::date,
                   (batch.created_at AT TIME ZONE organization.timezone)::date
              FROM inventory.batches AS batch
              JOIN core.organizations AS organization ON organization.id=batch.org_id
             WHERE batch.org_id=%s AND batch.id=%s
            """,
            (fixture.IDS["org"], batch_id),
        )
        session_date, organization_date = cursor.fetchone()
        assert organization_date == business_date
        assert session_date < organization_date
        cursor.execute("ROLLBACK TO SAVEPOINT tenant_batch_clock")


def _payload(
    admin_dsn: str, batch_ids: list[UUID], *, business_date: date
) -> dict[str, Any]:
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT row_version FROM parties.addresses WHERE org_id=%s AND id=%s",
            (fixture.IDS["org"], fixture.IDS["customer_address"]),
        )
        address_row_version = cursor.fetchone()[0]
    return {
        "branch_id": fixture.IDS["branch"],
        "invoice_date": business_date.isoformat(),
        "customer_account_id": fixture.IDS["customer_account"],
        "delivery_address_id": fixture.IDS["customer_address"],
        "delivery_address_row_version": str(address_row_version),
        "from_location_id": fixture.IDS["saleable_location"],
        "tax_charge_mechanism": "normal",
        "document_discount": {
            "document_discount_kind": "none",
            "document_discount_basis": "price_value",
            "document_discount_value": "0",
        },
        "rounding_policy": "none",
        "zero_rated_payment_mode": "not_applicable",
        "lines": [{
            "product_id": fixture.IDS["product"],
            "uom_conversion_id": fixture.IDS["uom_conversion"],
            "billed_quantity": "12",
            "free_quantity": "2",
            "free_supply_tax_treatment": "excluded_from_taxable_value",
            "quoted_unit_rate": "100",
            "price_basis": "tax_exclusive",
            "line_discount": {
                "line_discount_kind": "none",
                "line_discount_basis": "price_value",
                "line_discount_value": "0",
            },
            "document_discount_eligible": True,
            "fulfillment_source": "direct_issue",
            "batch_allocations": [
                {"batch_id": str(batch_ids[0]), "billed_quantity": "10", "free_quantity": "0"},
                {"batch_id": str(batch_ids[1]), "billed_quantity": "2", "free_quantity": "2"},
            ],
        }],
        "logistics": {
            "transport_mode": "road",
            "distance_km": "18.50",
            "transporter_party_id": fixture.IDS["supplier_party"],
            "vehicle_number": "MH01PG1501",
            "vehicle_type": "regular",
        },
    }


def _prepare(service: SqlAlchemyOperatorActionService, payload: dict[str, Any], key: str):
    operation = "sales.invoice.prepare"
    policy = ACTION_POLICIES[operation]
    model = PREPARE_PAYLOAD_MODELS[operation].model_validate(
        {**payload, "idempotency_key": key}
    )
    values = model.model_dump(mode="python", exclude_none=True)
    values.pop("idempotency_key")
    return service.prepare(
        policy=policy,
        payload=values,
        idempotency_key=key,
        context=_context(operation, policy.permission),
    )


def _install_failure(admin_dsn: str) -> None:
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            CREATE FUNCTION public.pg15_invoice_injected_failure() RETURNS trigger
            LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected journal failure'; END $$;
            CREATE TRIGGER pg15_invoice_injected_failure
              BEFORE INSERT ON finance.journal_lines
              FOR EACH ROW EXECUTE FUNCTION public.pg15_invoice_injected_failure()
            """
        )


def _assert_calculation_input(admin_dsn: str, command_id: UUID) -> None:
    expected_product_keys = {
        "base_billed_quantity",
        "base_free_quantity",
        "billed_quantity",
        "cess_rate",
        "document_discount_eligible",
        "free_quantity",
        "free_supply_tax_treatment",
        "gst_rate",
        "line_discount",
        "line_id",
        "price_basis",
        "quoted_unit_rate",
        "tax_charge_mechanism",
        "taxability_snapshot",
        "uom_conversion_factor",
    }
    numeric_keys = {
        "base_billed_quantity",
        "base_free_quantity",
        "billed_quantity",
        "cess_rate",
        "free_quantity",
        "gst_rate",
        "quoted_unit_rate",
        "uom_conversion_factor",
    }
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT input_bytes,input_sha256,
                   pg_catalog.convert_from(input_bytes,'UTF8')::jsonb
              FROM calculation.artifacts
             WHERE org_id=%s AND command_request_id=%s
            """,
            (fixture.IDS["org"], command_id),
        )
        input_bytes, input_sha256, document = cursor.fetchone()

    assert hashlib.sha256(bytes(input_bytes)).digest() == bytes(input_sha256)
    assert set(document) == {
        "aggregate_version",
        "calculation_kind",
        "document",
        "operation",
        "original",
        "resource_id",
        "resource_type",
        "reversal",
        "schema",
        "schema_version",
        "serializer_version",
    }
    products = document["document"]["products"]
    assert len(products) == 1
    product = products[0]
    assert set(product) == expected_product_keys
    assert isinstance(product["document_discount_eligible"], bool)
    assert set(product["line_discount"]) == {"basis", "kind", "value"}
    scalar_keys = expected_product_keys - {
        "document_discount_eligible",
        "line_discount",
    }
    assert all(isinstance(product[key], str) for key in scalar_keys)
    assert all(Decimal(product[key]).is_finite() for key in numeric_keys)
    print(
        "sales-invoice calculation input accepted: "
        f"sha256={hashlib.sha256(bytes(input_bytes)).hexdigest()} "
        f"product_keys={','.join(sorted(product))}"
    )


def _remove_failure(admin_dsn: str) -> None:
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute("DROP TRIGGER pg15_invoice_injected_failure ON finance.journal_lines")
        cursor.execute("DROP FUNCTION public.pg15_invoice_injected_failure()")


def _assert_rollback(runtime_dsn: str, invoice_id: UUID, before: dict[UUID, tuple[Decimal, Decimal]]) -> None:
    with psycopg2.connect(runtime_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s,%s)",
            (fixture.IDS["operator_auth_user"], fixture.IDS["org"]),
        )
        cursor.execute(
            """
            SELECT status,
              (SELECT count(*) FROM tax.documents WHERE org_id=%s AND sales_invoice_id=%s),
              (SELECT count(*) FROM finance.accounting_events WHERE org_id=%s AND sales_invoice_id=%s),
              (SELECT count(*) FROM finance.open_items item JOIN finance.accounting_events event
                 ON event.org_id=item.org_id AND event.id=item.accounting_event_id
                WHERE event.org_id=%s AND event.sales_invoice_id=%s),
              (SELECT count(*) FROM inventory.stock_ledger_entries ledger
                 JOIN inventory.inventory_documents document
                   ON document.org_id=ledger.org_id AND document.id=ledger.inventory_document_id
                WHERE document.org_id=%s AND document.sales_invoice_id=%s)
            FROM sales.invoices WHERE org_id=%s AND id=%s
            """,
            (fixture.IDS["org"], invoice_id) * 5,
        )
        assert cursor.fetchone() == ("draft", 0, 0, 0, 0)
        for batch_id, expected in before.items():
            cursor.execute(
                "SELECT on_hand_quantity,inventory_value FROM inventory.stock_balances "
                "WHERE org_id=%s AND location_id=%s AND product_id=%s AND batch_id=%s",
                (
                    fixture.IDS["org"], fixture.IDS["saleable_location"],
                    fixture.IDS["product"], batch_id,
                ),
            )
            assert cursor.fetchone() == expected


def _assert_runtime_resume_projection(
    runtime_dsn: str,
    command_id: UUID,
    idempotency_key: str,
) -> None:
    """Prove resume lookup is typed while the backing table stays private."""

    key_hash = hashlib.sha256(idempotency_key.encode("utf-8")).digest()
    with psycopg2.connect(runtime_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s,%s)",
            (fixture.IDS["operator_auth_user"], fixture.IDS["org"]),
        )
        cursor.execute("SAVEPOINT raw_command_read_denial")
        try:
            cursor.execute("SELECT id FROM automation.command_requests WHERE false")
        except psycopg2.errors.InsufficientPrivilege:
            cursor.execute("ROLLBACK TO SAVEPOINT raw_command_read_denial")
        else:
            raise AssertionError("erp_runtime retained raw command-request SELECT")

        cursor.execute(
            """
            SELECT id,status,completed_at,result_resource_id
              FROM erp_automation_reads.requester_command_by_idempotency(
                   %s,%s,%s,%s
              )
            """,
            (
                fixture.IDS["org"],
                "sales.invoice.prepare",
                fixture.CLIENT_ID,
                psycopg2.Binary(key_hash),
            ),
        )
        actual = cursor.fetchone()
        assert actual is not None
        assert UUID(str(actual[0])) == command_id
        assert actual[1:] == ("prepared", None, None)

        for client_id, candidate_hash in (
            (f"{fixture.CLIENT_ID}-wrong", key_hash),
            (fixture.CLIENT_ID, hashlib.sha256(b"wrong-key").digest()),
        ):
            cursor.execute(
                """
                SELECT count(*)
                  FROM erp_automation_reads.requester_command_by_idempotency(
                       %s,%s,%s,%s
                  )
                """,
                (
                    fixture.IDS["org"],
                    "sales.invoice.prepare",
                    client_id,
                    psycopg2.Binary(candidate_hash),
                ),
            )
            assert cursor.fetchone() == (0,)

        cursor.execute("SAVEPOINT cross_tenant_resume_denial")
        try:
            cursor.execute(
                """
                SELECT *
                  FROM erp_automation_reads.requester_command_by_idempotency(
                       %s,%s,%s,%s
                  )
                """,
                (
                    fixture.IDS["denial_org"],
                    "sales.invoice.prepare",
                    fixture.CLIENT_ID,
                    psycopg2.Binary(key_hash),
                ),
            )
        except psycopg2.errors.InsufficientPrivilege:
            cursor.execute("ROLLBACK TO SAVEPOINT cross_tenant_resume_denial")
        else:
            raise AssertionError("cross-tenant command resume lookup was not denied")


def _reconcile(runtime_dsn: str, invoice_id: UUID, batch_ids: list[UUID]) -> None:
    with psycopg2.connect(runtime_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT erp_security.activate_context(%s,%s)",
            (fixture.IDS["operator_auth_user"], fixture.IDS["org"]),
        )
        cursor.execute("SELECT current_user")
        assert cursor.fetchone() == ("erp_runtime",)
        cursor.execute(
            """
            SELECT invoice.status,invoice.net_value_total,invoice.gst_taxable_total,
                   invoice.cgst_total,invoice.sgst_total,invoice.igst_total,
                   invoice.cess_total,invoice.grand_total,line.billed_quantity,
                   line.free_quantity,line.base_billed_quantity,line.base_free_quantity
              FROM sales.invoices invoice
              JOIN sales.invoice_lines line ON line.org_id=invoice.org_id AND line.invoice_id=invoice.id
             WHERE invoice.org_id=%s AND invoice.id=%s
            """,
            (fixture.IDS["org"], invoice_id),
        )
        row = cursor.fetchone()
        assert row == (
            "posted", EXPECTED["net_value_total"], EXPECTED["gst_taxable_total"],
            EXPECTED["cgst_total"], EXPECTED["sgst_total"], EXPECTED["igst_total"],
            EXPECTED["cess_total"], EXPECTED["grand_total"],
            EXPECTED["billed_quantity"], EXPECTED["free_quantity"],
            EXPECTED["billed_quantity"], EXPECTED["free_quantity"],
        )
        cursor.execute(
            """
            SELECT ledger.batch_id,ledger.quantity_delta,ledger.value_delta,
                   balance.on_hand_quantity,balance.inventory_value
              FROM inventory.stock_ledger_entries ledger
              JOIN inventory.inventory_documents document
                ON document.org_id=ledger.org_id AND document.id=ledger.inventory_document_id
              JOIN inventory.stock_balances balance
                ON balance.org_id=ledger.org_id AND balance.location_id=ledger.location_id
               AND balance.product_id=ledger.product_id AND balance.batch_id=ledger.batch_id
             WHERE document.org_id=%s AND document.sales_invoice_id=%s
             ORDER BY ledger.batch_id
            """,
            (fixture.IDS["org"], invoice_id),
        )
        ledger = {UUID(str(row[0])): row[1:] for row in cursor.fetchall()}
        assert ledger[batch_ids[0]] == (Decimal("-10.000000"), Decimal("-100.00"), Decimal("0.000000"), Decimal("0.00"))
        assert ledger[batch_ids[1]] == (Decimal("-4.000000"), Decimal("-60.00"), Decimal("6.000000"), Decimal("90.00"))
        cursor.execute(
            """
            SELECT document_class,direction,supply_type,net_value_amount,gst_taxable_value,
                   cgst_amount,sgst_amount,igst_amount,cess_amount,counterparty_payable_amount
              FROM tax.documents WHERE org_id=%s AND sales_invoice_id=%s
            """,
            (fixture.IDS["org"], invoice_id),
        )
        assert cursor.fetchone() == (
            "sales_invoice", "outward", "intra_state", EXPECTED["net_value_total"],
            EXPECTED["gst_taxable_total"], EXPECTED["cgst_total"], EXPECTED["sgst_total"],
            EXPECTED["igst_total"], EXPECTED["cess_total"], EXPECTED["grand_total"],
        )
        cursor.execute(
            """
            SELECT event.event_type,item.item_side,item.principal_amount,item.status,
                   journal.status,journal.transaction_debit_total,journal.transaction_credit_total,
                   sum(line.transaction_debit),sum(line.transaction_credit)
              FROM finance.accounting_events event
              JOIN finance.open_items item ON item.org_id=event.org_id AND item.accounting_event_id=event.id
              JOIN finance.journal_entries journal ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id
              JOIN finance.journal_lines line ON line.org_id=journal.org_id AND line.journal_entry_id=journal.id
             WHERE event.org_id=%s AND event.sales_invoice_id=%s
             GROUP BY event.event_type,item.item_side,item.principal_amount,item.status,
                      journal.status,journal.transaction_debit_total,journal.transaction_credit_total
            """,
            (fixture.IDS["org"], invoice_id),
        )
        assert cursor.fetchone() == (
            "sales_invoice", "receivable", EXPECTED["grand_total"], "open", "posted",
            EXPECTED["journal_total"], EXPECTED["journal_total"],
            EXPECTED["journal_total"], EXPECTED["journal_total"],
        )
        cursor.execute(
            """
            SELECT account_id,sum(transaction_debit),sum(transaction_credit)
              FROM finance.journal_lines line
              JOIN finance.accounting_events event
                ON event.org_id=line.org_id AND event.journal_entry_id=line.journal_entry_id
             WHERE event.org_id=%s AND event.sales_invoice_id=%s
             GROUP BY account_id
            """,
            (fixture.IDS["org"], invoice_id),
        )
        accounts = {str(row[0]): row[1:] for row in cursor.fetchall()}
        assert accounts == {
            fixture.IDS["receivable_account"]: (EXPECTED["grand_total"], Decimal("0")),
            fixture.IDS["sales_revenue_account"]: (Decimal("0"), EXPECTED["net_value_total"]),
            fixture.IDS["output_cgst_account"]: (Decimal("0"), EXPECTED["cgst_total"]),
            fixture.IDS["output_sgst_account"]: (Decimal("0"), EXPECTED["sgst_total"]),
            fixture.IDS["cogs_account"]: (EXPECTED["inventory_value"], Decimal("0")),
            fixture.IDS["inventory_account"]: (Decimal("0"), EXPECTED["inventory_value"]),
        }


def main() -> None:
    register_adapter(UUID, lambda value: AsIs(f"'{value}'::uuid"))
    admin_url = os.environ["DATABASE_URL"]
    admin_dsn = _admin_dsn(admin_url)
    role_password = quote(f"pg15-{uuid4()}", safe="")
    runtime_url = _role_url(admin_url, "erp_runtime", role_password)
    calculator_url = _role_url(admin_url, "erp_calculator", role_password)
    runtime_dsn = _admin_dsn(runtime_url)
    _configure_fixture_ids()

    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute("SHOW server_version_num")
        assert int(cursor.fetchone()[0]) // 10000 == 15
        cursor.execute(f'ALTER ROLE "erp_runtime" LOGIN PASSWORD \'{role_password}\'')
        cursor.execute(f'ALTER ROLE "erp_calculator" LOGIN PASSWORD \'{role_password}\'')
    with psycopg2.connect(admin_dsn) as connection:
        fixture.bootstrap_identity(connection)
    with psycopg2.connect(admin_dsn) as connection:
        _seed_reference_authority(connection)
    with psycopg2.connect(runtime_dsn) as connection:
        business_date = fixture.organization_business_date(connection)
    with psycopg2.connect(admin_dsn) as connection:
        fixture.seed_business_master(connection, business_date=business_date)
        fixture.seed_end_to_end_master(connection, business_date=business_date)
    with psycopg2.connect(runtime_dsn) as connection:
        fixture.activate_demo_product(connection)

    _assert_batch_guard_uses_organization_date(admin_dsn, business_date)
    batch_ids, before = _seed_opening_stock(runtime_dsn)
    payload = _payload(admin_dsn, batch_ids, business_date=business_date)
    prepare_key = f"pg15-sales-invoice-{uuid4()}"
    with _service(runtime_url, calculator_url) as service:
        try:
            policy = ACTION_POLICIES["sales.invoice.prepare"]
            service.prepare(
                policy=policy,
                payload={**payload, "branch_id": UUID(fixture.IDS["branch"])},
                idempotency_key=f"cross-tenant-{uuid4()}",
                context=_context(
                    "sales.invoice.prepare", policy.permission,
                    org_id=UUID(fixture.IDS["denial_org"]),
                ),
            )
        except OperatorActionError as error:
            assert error.code is ActionErrorCode.SCOPE_DENIED
            assert error.metadata == {
                "operation_key": "sales.invoice.prepare",
                "reason": "CANONICAL_DATABASE_POLICY_REJECTED",
                "sqlstate": "42501",
            }
        else:
            raise AssertionError("cross-tenant sales-invoice prepare was not denied")

        prepared = _prepare(service, payload, prepare_key)
        product_references = [
            reference
            for reference in prepared.resolved_references
            if reference.get("resource_type") == "product"
        ]
        assert len(product_references) == 1
        assert product_references[0] == {
            "resource_type": "product",
            "id": fixture.IDS["product"],
            "row_version": product_references[0]["row_version"],
            "product_code": "DEMO-CARTON-481910",
            "product_name": "Synthetic Corrugated Pharmacy Packing Carton",
        }
        assert int(product_references[0]["row_version"]) >= 1
        _assert_calculation_input(admin_dsn, prepared.command_request_id)
        _assert_runtime_resume_projection(
            runtime_dsn, prepared.command_request_id, prepare_key
        )
        replay = _prepare(service, payload, prepare_key)
        assert replay.command_request_id == prepared.command_request_id
        assert replay.preview_hash == prepared.preview_hash
        command_id = prepared.command_request_id
        with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
            cursor.execute(
                "SELECT target_resource_id FROM automation.command_requests "
                "WHERE org_id=%s AND id=%s",
                (fixture.IDS["org"], command_id),
            )
            invoice_id = UUID(str(cursor.fetchone()[0]))
        approval = service.approve(
            command_request_id=command_id,
            preview_hash=prepared.preview_hash,
            idempotency_key=f"approve-{command_id}",
            context=_context("automation.command.approve", "automation.command.approve"),
        )
        assert approval.status == "approved"
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
                assert "injected journal failure" in str(error)
            else:
                raise AssertionError("injected journal failure did not abort execution")
            _assert_rollback(runtime_dsn, invoice_id, before)
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
        assert executed.status == "succeeded"
        assert replayed.idempotency_replayed is True
        assert replayed.resource_id == executed.resource_id == invoice_id

    _reconcile(runtime_dsn, invoice_id, batch_ids)
    print(f"sales-invoice direct-issue PostgreSQL 15 acceptance passed: {invoice_id}")


if __name__ == "__main__":
    main()
