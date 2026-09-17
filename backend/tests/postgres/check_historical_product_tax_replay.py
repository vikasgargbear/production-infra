"""Restricted replay repairs real pre-0077 state in a disposable PG15 cluster."""
import os
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID, uuid4

import psycopg2
from psycopg2.extensions import AsIs, register_adapter
import check_scoped_product_tax_invoice as mixed

base = mixed.base


def assert_repair(cur, org, dataset, business_date):
    cur.execute("SELECT product_id FROM automation.historical_product_bindings WHERE org_id=%s AND dataset_id=%s ORDER BY product_id", (org, dataset))
    products = [row[0] for row in cur.fetchall()]
    for product in products:
        cur.execute("SELECT status FROM erp_automation_reads.resolve_product_tax(%s,%s,%s)", (org, product, business_date))
        assert cur.fetchone() == ("active",)
        cur.execute("SAVEPOINT prior_readiness")
        try:
            cur.execute("SELECT erp_regulatory_commands.product_ready(%s,%s,%s)", (org, product, business_date))
            assert cur.fetchone() == (False,)
        except psycopg2.errors.CheckViolation:
            cur.execute("ROLLBACK TO SAVEPOINT prior_readiness")
    cur.execute("SELECT count(*),coalesce(sum(on_hand_quantity),0),coalesce(sum(inventory_value),0) FROM inventory.stock_balances WHERE org_id=%s", (org,))
    stock_before = cur.fetchone()
    sql = (Path(__file__).resolve().parents[2] / "alembic/sql/20260917_0080_historical_product_tax_replay.sql").read_text()
    cur.execute(sql)
    cur.execute("SET LOCAL ROLE erp_runtime")
    cur.execute("SAVEPOINT repair_rollback")
    cur.execute("SELECT erp_automation_commands.promote_historical_product_inventory_batch(%s,%s,%s,1)", (org, dataset, base.fixture.IDS["saleable_location"]))
    assert cur.fetchone()[0]["products_replayed"] == 1
    cur.execute("ROLLBACK TO SAVEPOINT repair_rollback")
    cur.execute("SELECT count(*) FROM tax.tax_code_versions WHERE org_id=%s", (org,))
    assert cur.fetchone() == (0,)
    for expected_remaining in (1, 0):
        cur.execute("SELECT erp_automation_commands.promote_historical_product_inventory_batch(%s,%s,%s,1)", (org, dataset, base.fixture.IDS["saleable_location"]))
        result = cur.fetchone()[0]
        assert result["products_replayed"] == 1
        assert result["products_remaining"] == expected_remaining
        assert result["complete"] == (expected_remaining == 0)
        assert result["products_created"] == result["batches_bound"] == result["openings_posted"] == 0
    cur.execute("SELECT erp_automation_commands.promote_historical_product_inventory_batch(%s,%s,%s,100)", (org, dataset, base.fixture.IDS["saleable_location"]))
    result = cur.fetchone()[0]
    assert result["complete"] and result["products_replayed"] == 0
    cur.execute("SAVEPOINT foreign_repair")
    try:
        cur.execute("SELECT erp_automation_commands.promote_historical_product_inventory_batch(%s,%s,%s,100)", (base.fixture.IDS["denial_org"], dataset, base.fixture.IDS["saleable_location"]))
    except psycopg2.errors.InsufficientPrivilege:
        cur.execute("ROLLBACK TO SAVEPOINT foreign_repair")
    else:
        raise AssertionError("foreign organization replay accepted")
    cur.execute("SELECT count(*),coalesce(sum(on_hand_quantity),0),coalesce(sum(inventory_value),0) FROM inventory.stock_balances WHERE org_id=%s", (org,))
    assert cur.fetchone() == stock_before
    cur.execute("SET LOCAL ROLE erp_migration_owner")
    for product in products:
        cur.execute("SELECT status FROM erp_automation_reads.resolve_product_tax(%s,%s,%s)", (org, product, business_date))
        assert cur.fetchone() == ("source_snapshot",)
        cur.execute("SELECT erp_regulatory_commands.product_ready(%s,%s,%s)", (org, product, business_date))
        assert cur.fetchone() == (True,)
        cur.execute("SELECT setup_review_required,regulatory_ruleset_version FROM catalog.products WHERE org_id=%s AND id=%s", (org, product))
        assert cur.fetchone() == (True, None)


def main():
    url = os.environ["DATABASE_URL"]
    parsed = urlparse(url)
    if os.environ.get("CANONICAL_CI_ALLOW_DISPOSABLE") != "1" or parsed.hostname not in {"localhost", "127.0.0.1"} or parsed.path != "/canonical_alembic_ci":
        raise RuntimeError("Requires disposable local canonical_alembic_ci")
    register_adapter(UUID, lambda value: AsIs(f"'{value}'::uuid"))
    dsn = base._admin_dsn(url)
    base._configure_fixture_ids()
    with psycopg2.connect(dsn) as conn:
        base.fixture.bootstrap_identity(conn, organization_pan=mixed._fixture_pan())
    with psycopg2.connect(dsn) as conn:
        base._seed_reference_authority(conn)
    with psycopg2.connect(dsn) as conn:
        business_date = base.fixture.organization_business_date(conn)
        base.fixture.seed_business_master(conn, business_date=business_date)
        base.fixture.seed_end_to_end_master(conn, business_date=business_date)
    mixed._scoped_products(dsn, business_date, pre_scoped=True)
    print("Pre-0077 source tax replay: bounded repair, replay, foreign-org denial and unchanged stock passed")


if __name__ == "__main__":
    main()
