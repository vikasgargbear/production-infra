"""Post a real mixed-source/global invoice in an explicitly disposable PG15 DB.

Synthetic master setup reuses the direct-issue fixture. Reviewed tax facts enter
through the canonical import/install commands; invoice calculation, approval,
posting and replay run through the restricted operator-action service.
"""
from copy import deepcopy
from datetime import timedelta
from decimal import Decimal
import hashlib
import os
from urllib.parse import urlparse
from uuid import UUID, uuid4

import psycopg2
from psycopg2.extensions import AsIs, register_adapter
from psycopg2.extras import Json
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.routes import canonical_erp_reads

import check_sales_invoice_direct_issue_acceptance as base


def _scoped_products(dsn, business_date):
    dataset = f"pg15-source-tax-{uuid4()}"
    sources = [(uuid4(), rate) for rate in (5, 18)]
    org = base.fixture.IDS["org"]
    member = base.fixture.IDS["operator_membership"]
    facts = [{
        "id": str(fact), "dataset_id": dataset, "source_kind": "product",
        "record_key": f"product:{fact}", "branch_id": base.fixture.IDS["branch"],
        "event_date": business_date.isoformat(), "product_code": f"TAX-{rate}",
        "product_name": f"Synthetic scoped medicine {rate}",
        "quantity": "0.000000", "inventory_value": "0.00", "selection_state": "reviewed",
        "payload": {"hsn_code": "481910", "gst_rate": str(rate),
                    "hsn_gst_candidate_unique": True, "product_kind": "medicine",
                    "source_product_code": f"TAX-{rate}", "base_uom_code": "EA",
                    "source_company": "Demo Paper Products Private Limited"},
        "row_sha256": hashlib.sha256(f"{dataset}:{fact}:{rate}".encode()).hexdigest(),
    } for fact, rate in sources]
    products = []
    with psycopg2.connect(dsn) as connection, connection.cursor() as cur:
        cur.execute("SELECT erp_security.activate_context(%s,%s)", (base.fixture.IDS["operator_auth_user"], org))
        cur.execute("SELECT set_config('app.request_id',%s,true)", (str(uuid4()),))
        equity = uuid4()
        cur.execute("""INSERT INTO finance.accounts(org_id,id,code,name,account_type,status,
            created_by_membership_id,updated_by_membership_id)
            VALUES(%s,%s,'TAX-OPENING','Synthetic opening equity','equity','active',%s,%s)""", (org, equity, member, member))
        cur.execute("""INSERT INTO core.settings(org_id,id,scope_kind,namespace,key,value_type,value_text,status,
            created_by_membership_id,updated_by_membership_id)
            VALUES(%s,%s,'organization','finance.account_roles','opening_balance_equity','text',%s,'active',%s,%s)""",
            (org, uuid4(), str(equity), member, member))
        cur.execute("SELECT erp_automation_commands.import_historical_migration_facts(%s,%s::jsonb)", (org, Json(facts)))
        assert cur.fetchone()[0]["inserted"] == 2
        cur.execute("SET LOCAL ROLE erp_migration_owner")
        cur.execute("SELECT erp_automation_commands.promote_historical_product_inventory_batch(%s,%s,%s,100)",
            (org, dataset, base.fixture.IDS["saleable_location"]))
        assert cur.fetchone()[0]["products_created"] == 2
        for fact, rate in sources:
            cur.execute("""SELECT b.product_id,c.id,v.id FROM automation.historical_product_bindings b
                JOIN catalog.uom_conversions c ON c.org_id=b.org_id AND c.product_id=b.product_id
                JOIN tax.tax_code_versions v ON v.org_id=b.org_id AND v.source_fact_id=b.source_fact_id
                WHERE b.org_id=%s AND b.source_fact_id=%s""", (org, fact))
            product, conversion, version = cur.fetchone()
            products.append((product, conversion, fact, rate))
            cur.execute("SELECT id,igst_rate FROM erp_automation_reads.resolve_product_tax(%s,%s,%s)", (org, product, business_date))
            assert cur.fetchone() == (version, Decimal(rate))
            cur.execute("SELECT id FROM erp_automation_reads.resolve_product_tax(%s,%s,%s)", (org, product, business_date-timedelta(days=1)))
            assert cur.fetchall() == []  # Must not silently use global 12% before source validity.
            cur.execute("SAVEPOINT foreign_tax_scope")
            try:
                cur.execute("SELECT id FROM erp_automation_reads.resolve_product_tax(%s,%s,%s)",
                    (base.fixture.IDS["denial_org"], product, business_date))
            except psycopg2.errors.InsufficientPrivilege:
                cur.execute("ROLLBACK TO SAVEPOINT foreign_tax_scope")
            else:
                raise AssertionError("foreign organization tax resolver scope was accepted")
    return products


def _assert_snapshot_guards(dsn, products, business_date):
    org = base.fixture.IDS["org"]
    product = products[0][0]
    with psycopg2.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute("SELECT erp_security.activate_context(%s,%s)", (base.fixture.IDS["operator_auth_user"], org))
        cur.execute("SELECT set_config('app.request_id',%s,true)", (str(uuid4()),))
        for sql in (
            "UPDATE tax.tax_code_versions SET igst_rate=7 WHERE org_id=%s AND product_id=%s",
            "UPDATE automation.historical_product_bindings SET gst_rate=7 WHERE org_id=%s AND product_id=%s",
            "DELETE FROM automation.historical_product_bindings WHERE org_id=%s AND product_id=%s",
        ):
            cur.execute("SAVEPOINT immutable_snapshot")
            try:
                cur.execute(sql, (org, product))
            except (psycopg2.errors.CheckViolation, psycopg2.errors.ObjectNotInPrerequisiteState):
                cur.execute("ROLLBACK TO SAVEPOINT immutable_snapshot")
            else:
                raise AssertionError(f"snapshot mutation accepted: {sql}")
        # Simulate the state after the reviewed setup flag is cleared. This
        # admin-only savepoint never commits and leaves every trigger enabled.
        cur.execute("SAVEPOINT reviewed_marker")
        cur.execute("""INSERT INTO erp_regulatory_commands.command_scopes VALUES
            (pg_backend_pid(),txid_current(),'product_activation',%s)""", (product,))
        try:
            cur.execute("""UPDATE catalog.products SET setup_review_required=false,
                drug_schedule='NONE',requires_prescription=false,ndps_regulated=false,
                regulatory_ruleset_version='missing-classification-fixture'
                WHERE org_id=%s AND id=%s""", (org, product))
        except psycopg2.errors.CheckViolation as error:
            assert "active medicine requires a current active composition" in str(error)
            cur.execute("ROLLBACK TO SAVEPOINT reviewed_marker")
            return  # The stricter active-composition guard rejects incomplete review first.
        cur.execute("SELECT org_id,igst_rate FROM erp_automation_reads.resolve_product_tax(%s,%s,%s)", (org, product, business_date))
        assert cur.fetchone() == (None, Decimal(12))
        cur.execute("SAVEPOINT ordinary_classification")
        try:
            cur.execute("SELECT erp_regulatory_commands.product_ready(%s,%s,%s)", (org, product, business_date))
        except psycopg2.errors.CheckViolation as error:
            assert "ingredient classification" in str(error)
            cur.execute("ROLLBACK TO SAVEPOINT ordinary_classification")
        else:
            assert cur.fetchone() == (False,)
        cur.execute("ROLLBACK TO SAVEPOINT reviewed_marker")


def _assert_second_organization(dsn, business_date, first_org, first_products):
    saved_ids, saved_client = dict(base.fixture.IDS), base.fixture.CLIENT_ID
    try:
        base._configure_fixture_ids()
        with psycopg2.connect(dsn) as conn:
            base.fixture.bootstrap_identity(conn, organization_pan="ABCDF1234G")
        org, member = base.fixture.IDS["org"], base.fixture.IDS["operator_membership"]
        with psycopg2.connect(dsn) as conn, conn.cursor() as cur:
            cur.execute("SELECT erp_security.activate_context(%s,%s)", (base.fixture.IDS["operator_auth_user"], org))
            cur.execute("SELECT set_config('app.request_id',%s,true)", (str(uuid4()),))
            cur.execute("""INSERT INTO inventory.locations(org_id,id,branch_id,code,name,location_type,status,
                allows_sale,allows_negative_stock,created_by_membership_id,updated_by_membership_id)
                VALUES(%s,%s,%s,'SALE','Synthetic saleable','saleable','active',true,false,%s,%s)""",
                (org, base.fixture.IDS["saleable_location"], base.fixture.IDS["branch"], member, member))
            cur.execute("""INSERT INTO finance.accounts(org_id,id,code,name,account_type,status,
                created_by_membership_id,updated_by_membership_id)
                VALUES(%s,%s,'INV','Synthetic inventory','asset','active',%s,%s)""",
                (org, base.fixture.IDS["inventory_account"], member, member))
            cur.execute("""INSERT INTO core.settings(org_id,id,scope_kind,namespace,key,value_type,value_text,status,
                created_by_membership_id,updated_by_membership_id)
                VALUES(%s,%s,'organization','finance.account_roles','inventory_asset','text',%s,'active',%s,%s)""",
                (org, uuid4(), base.fixture.IDS["inventory_account"], member, member))
        second = _scoped_products(dsn, business_date)
        with psycopg2.connect(dsn) as conn, conn.cursor() as cur:
            cur.execute("SELECT erp_security.activate_context(%s,%s)", (base.fixture.IDS["operator_auth_user"], org))
            cur.execute("SET LOCAL ROLE erp_runtime")
            cur.execute("SELECT product_id,igst_rate,version_number FROM tax.tax_code_versions WHERE org_id IS NOT NULL ORDER BY igst_rate")
            assert [(str(p), rate, version) for p, rate, version in cur.fetchall()] == [(str(p), Decimal(rate), 1) for p, _, _, rate in second]
            cur.execute("SELECT count(*) FROM core.reference_data_releases WHERE org_id=%s", (first_org,))
            assert cur.fetchone() == (0,)
            cur.execute("SELECT id FROM erp_automation_reads.resolve_product_tax(%s,%s,%s)", (org, first_products[0][0], business_date))
            assert cur.fetchall() == []
    finally:
        base.fixture.IDS.clear()
        base.fixture.IDS.update(saved_ids)
        base.fixture.CLIENT_ID = saved_client


def main():
    url = os.environ["DATABASE_URL"]
    parsed = urlparse(url)
    if (os.environ.get("CANONICAL_CI_ALLOW_DISPOSABLE") != "1"
            or parsed.hostname not in {"localhost", "127.0.0.1"}
            or parsed.path != "/canonical_alembic_ci"):
        raise RuntimeError("Requires explicitly disposable local canonical_alembic_ci")
    register_adapter(UUID, lambda value: AsIs(f"'{value}'::uuid"))
    dsn = base._admin_dsn(url)
    base._configure_fixture_ids()
    password = f"pg15-{uuid4()}"
    runtime_url = base._role_url(url, "erp_runtime", password)
    calculator_url = base._role_url(url, "erp_calculator", password)
    runtime_dsn = base._admin_dsn(runtime_url)
    with psycopg2.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute("SHOW server_version_num")
        assert int(cur.fetchone()[0]) // 10000 == 15
        for role in ("erp_runtime", "erp_calculator"):
            cur.execute(f"ALTER ROLE {role} LOGIN PASSWORD %s", (password,))
    with psycopg2.connect(dsn) as conn:
        base.fixture.bootstrap_identity(conn)
    with psycopg2.connect(dsn) as conn:
        base._seed_reference_authority(conn)
    with psycopg2.connect(runtime_dsn) as conn:
        business_date = base.fixture.organization_business_date(conn)
    with psycopg2.connect(dsn) as conn:
        base.fixture.seed_business_master(conn, business_date=business_date)
        base.fixture.seed_end_to_end_master(conn, business_date=business_date)
    with psycopg2.connect(runtime_dsn) as conn:
        base.fixture.activate_demo_product(conn)
    def global_reference_rows():
        with psycopg2.connect(dsn) as conn, conn.cursor() as cur:
            rows = []
            for table in ("core.reference_data_releases", "tax.tax_code_versions"):
                cur.execute(f"SELECT to_jsonb(r) FROM {table} r WHERE org_id IS NULL ORDER BY id")
                rows.append(cur.fetchall())
            return rows
    global_before = global_reference_rows()
    original_product = base.fixture.IDS["product"]
    original_conversion = base.fixture.IDS["uom_conversion"]
    scoped = _scoped_products(dsn, business_date)
    lines = []
    for product, conversion, _, rate in [*scoped, (original_product, original_conversion, None, 12)]:
        base.fixture.IDS["product"] = str(product)
        base.fixture.IDS["uom_conversion"] = str(conversion)
        batches, _ = base._seed_opening_stock(runtime_dsn)
        payload = base._payload(dsn, batches, business_date=business_date)
        line = deepcopy(payload["lines"][0])
        line.update(billed_quantity="1", free_quantity="0", free_supply_tax_treatment="excluded_from_taxable_value",
                    batch_allocations=[{"batch_id": str(batches[0]), "billed_quantity": "1", "free_quantity": "0"}])
        lines.append(line)
    payload["lines"] = lines
    org = base.fixture.IDS["org"]
    with base._service(runtime_url, calculator_url) as service:
        key = f"mixed-tax-{uuid4()}"
        prepared = base._prepare(service, payload, key)
        replay = base._prepare(service, payload, key)
        assert replay.command_request_id == prepared.command_request_id
        command = prepared.command_request_id
        approved = service.approve(command_request_id=command, preview_hash=prepared.preview_hash,
            idempotency_key=f"approve-{command}", context=base._context("automation.command.approve", "automation.command.approve"))
        assert approved.status == "approved"
        kwargs = dict(command_request_id=command, preview_hash=prepared.preview_hash,
            idempotency_key=f"execute-{command}", context=base._context("automation.command.execute", "automation.command.execute"))
        service.execute(**kwargs)
        service.execute(**kwargs)
    with psycopg2.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute("SELECT target_resource_id FROM automation.command_requests WHERE org_id=%s AND id=%s", (org, command))
        invoice = cur.fetchone()[0]
    with psycopg2.connect(runtime_dsn) as conn, conn.cursor() as cur:
        cur.execute("SELECT erp_security.activate_context(%s,%s)", (base.fixture.IDS["operator_auth_user"], org))
        cur.execute("""SELECT i.status,i.net_value_total,i.cgst_total,i.sgst_total,i.igst_total,i.grand_total
            FROM sales.invoices i WHERE i.org_id=%s AND i.id=%s""", (org, invoice))
        status, net, cgst, sgst, igst, total = cur.fetchone()
        assert (status, net, cgst, sgst, igst, total) == ("posted", Decimal(300), Decimal("17.50"), Decimal("17.50"), Decimal(0), Decimal(335))
        cur.execute("""SELECT v.igst_rate,l.gst_taxable_value,l.cgst_amount,l.sgst_amount,l.line_total
            FROM sales.invoice_lines l JOIN tax.tax_code_versions v ON v.id=l.tax_code_version_id
            WHERE l.org_id=%s AND l.invoice_id=%s ORDER BY v.igst_rate""", (org, invoice))
        assert cur.fetchall() == [(Decimal(r), Decimal(100), Decimal(r)/2, Decimal(r)/2, Decimal(100+r)) for r in (5,12,18)]
        cur.execute("""SELECT sum(l.base_quantity),sum(l.extended_cost) FROM inventory.inventory_document_lines l
            JOIN inventory.inventory_documents d ON d.org_id=l.org_id AND d.id=l.inventory_document_id
            WHERE d.org_id=%s AND d.sales_invoice_id=%s AND d.status='posted'""", (org, invoice))
        assert cur.fetchone() == (Decimal(3), Decimal(30))
        cur.execute("""SELECT sum(jl.transaction_debit),sum(jl.transaction_credit)
            FROM finance.journal_lines jl JOIN finance.journal_entries j ON j.org_id=jl.org_id AND j.id=jl.journal_entry_id
            JOIN finance.accounting_events e ON e.org_id=j.org_id AND e.journal_entry_id=j.id
            WHERE e.org_id=%s AND e.sales_invoice_id=%s""", (org, invoice))
        assert cur.fetchone() == (Decimal(365), Decimal(365))
        cur.execute("""SELECT jl.account_id,sum(jl.transaction_debit),sum(jl.transaction_credit)
            FROM finance.journal_lines jl JOIN finance.accounting_events e
              ON e.org_id=jl.org_id AND e.journal_entry_id=jl.journal_entry_id
            WHERE e.org_id=%s AND e.sales_invoice_id=%s GROUP BY jl.account_id""", (org, invoice))
        accounts = {str(row[0]): row[1:] for row in cur.fetchall()}
        assert accounts == {
            base.fixture.IDS["receivable_account"]: (Decimal(335), Decimal(0)),
            base.fixture.IDS["sales_revenue_account"]: (Decimal(0), Decimal(300)),
            base.fixture.IDS["output_cgst_account"]: (Decimal(0), Decimal("17.50")),
            base.fixture.IDS["output_sgst_account"]: (Decimal(0), Decimal("17.50")),
            base.fixture.IDS["cogs_account"]: (Decimal(30), Decimal(0)),
            base.fixture.IDS["inventory_account"]: (Decimal(0), Decimal(30)),
        }
    assert global_reference_rows() == global_before
    read_engine = create_engine(runtime_url)
    try:
        with Session(read_engine) as session:
            user = {"org_id": org, "auth_user_id": base.fixture.IDS["operator_auth_user"]}
            expected_rates = {str(p): Decimal(rate) for p, _, _, rate in scoped}
            expected_rates[str(original_product)] = Decimal(12)
            listed = canonical_erp_reads.products(limit=100, skip=0, offset=None, search="",
                include_inactive=False, origin="all", user=user, db=session)
            with_batches = canonical_erp_reads.products_with_batches(page=1, page_size=100, q="",
                origin="all", user=user, db=session)
            for response in (listed, with_batches):
                assert {str(row["product_id"]): Decimal(row["gst_percent"]) for row in response["products"]} == expected_rates
            source_batches = canonical_erp_reads.product_batches(UUID(str(scoped[0][0])), user=user, db=session)
            assert len(source_batches["batches"]) == 2
            assert all(Decimal(row["gst_percent"]) == Decimal(5) for row in source_batches["batches"])
    finally:
        read_engine.dispose()
    _assert_snapshot_guards(dsn, scoped, business_date)
    _assert_second_organization(dsn, business_date, org, scoped)
    assert global_reference_rows() == global_before
    print("Mixed 5%/18% source and 12% global invoice posted/replayed: net300 GST35 total335 stock3 value30 balanced ledger365")


if __name__ == "__main__":
    main()
