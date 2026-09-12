"""Disposable PG15 proof of imported sale-rate provenance under forced RLS."""

from __future__ import annotations

import importlib.util
import json
import os
from datetime import date
from pathlib import Path
from uuid import uuid4

from sqlalchemy import create_engine, text

SPEC = importlib.util.spec_from_file_location(
    "cutover_fixture", Path(__file__).with_name("check_historical_product_inventory_cutover_runtime_role.py")
)
assert SPEC and SPEC.loader
cutover = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(cutover)
fixture = cutover.fixture

READ = "SELECT * FROM erp_automation_reads.migrated_batch_sale_rate(:org,:batch,:branch,DATE '2026-08-30')"


def _activate(connection, role="erp_runtime"):
    connection.exec_driver_sql("RESET SESSION AUTHORIZATION")
    connection.exec_driver_sql(f'SET SESSION AUTHORIZATION "{role}"')
    connection.execute(text("SELECT erp_security.activate_context(:auth,:org),"
                            "set_config('app.request_id',gen_random_uuid()::text,true)"),
                       {"auth": fixture.AUTH_A, "org": fixture.ORG_A})


def main():
    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            fixture._seed(connection)
            cutover._seed_cutover_authority(connection)
            _activate(connection)
            assert connection.exec_driver_sql("SELECT current_user").scalar_one() == "erp_runtime"
            assert connection.exec_driver_sql(
                "SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class "
                "WHERE oid IN ('automation.historical_migration_facts'::regclass,"
                "'automation.historical_batch_bindings'::regclass,"
                "'automation.historical_product_bindings'::regclass)"
            ).scalar_one() is True

            facts, expected = [], {}
            saved = {"sale_price_per_unit": "44.1250", "sale_price_uom_code": "PCS",
                     "sale_price_basis": "tax_exclusive"}
            cases = [
                ("batch", saved, {**saved, "sale_price_per_unit": "33.00"}, {}, ("44.1250", "migrated_batch_price", None)),
                ("product", {}, saved, {}, ("44.1250", "migrated_product_price", None)),
                ("history", {}, {}, {}, ("29.00", "last_imported_sale", date(2026, 8, 20))),
                ("no-history", {}, {}, {"omit": True}, None),
                ("future", {}, {}, {"event_date": "2026-09-01"}, None),
                ("quarantine", {}, {}, {"selection_state": "quarantined"}, None),
                ("parent-quarantine", {}, {}, {"parent_state": "quarantined"}, None),
                ("dataset", {}, {}, {"dataset_id": "other-dataset"}, None),
                ("product-code", {}, {}, {"product_code": "OTHER"}, None),
                ("batch-number", {}, {}, {"batch_number": "OTHER"}, None),
                ("zero-quantity", {}, {}, {"quantity": "0"}, None),
                ("missing-uom", {}, {}, {"uom_code": None}, None),
                ("wrong-uom", {}, {}, {"uom_code": "BOX"}, None),
                ("missing-basis", {}, {}, {"price_basis": None}, None),
                ("inclusive-basis", {}, {}, {"price_basis": "tax_inclusive"}, None),
            ]
            for index, invalid in enumerate(("-1", "abc", "1.00001", "1e2", "10000000000000000", "NaN", "")):
                cases.append((f"invalid-history-{index}", {}, {}, {"quoted_unit_rate": invalid}, None))
                cases.append((f"invalid-saved-{index}", {**saved, "sale_price_per_unit": invalid}, {}, {"omit": True}, None))
            for label, field, value in (("missing-uom", "sale_price_uom_code", None),
                                         ("wrong-uom", "sale_price_uom_code", "BOX"),
                                         ("missing-basis", "sale_price_basis", None),
                                         ("inclusive", "sale_price_basis", "tax_inclusive")):
                cases.append((f"saved-{label}", {**saved, field: value}, {}, {"omit": True}, None))

            for name, batch_price, product_price, history, result in cases:
                code = f"RATE-{name}"
                expected[code] = result
                def fact(kind, suffix, payload, event_date="2026-08-20", **overrides):
                    return {**cutover._fact(
                        str(uuid4()), kind, f"{code}:{suffix}", product_code=code,
                        product_name=code, quantity="1", inventory_value="10.00",
                        event_date=event_date, payload=payload, batch_number="RATE-B1",
                    ), **overrides}
                facts.extend([
                    fact("product", "product", {
                        "source_product_code": code, "source_company": "CODEX-E2E Rates",
                        "product_kind": "medicine", "base_uom_code": "PCS",
                        "hsn_code": "30049099", "gst_rate": "12.000000",
                        "hsn_gst_candidate_unique": True, "batch_reconciliation_status": "exact",
                        **product_price,
                    }),
                    fact("batch", "batch", {
                        "mrp": "120.00", "unit_cost": "10.00", "base_uom_code": "PCS",
                        "mrp_uom_code": "PCS", "mrp_uom_multiplier": "1.000000", **batch_price,
                    }, event_date="2028-08-01"),
                ])
                if history.get("omit"):
                    continue
                event = history.get("event_date", "2026-08-20")
                dataset = history.get("dataset_id", cutover.DATASET)
                facts.append(fact("sales_invoice", "invoice", {}, event_date=event,
                                  dataset_id=dataset, selection_state=history.get("parent_state", "reviewed")))
                facts.append(fact("sales_invoice_line", "line", {
                    "source_invoice_id": f"{code}:invoice", "quoted_unit_rate": history.get("quoted_unit_rate", "29.00"),
                    "uom_code": history.get("uom_code", "PCS"), "price_basis": history.get("price_basis", "tax_exclusive"),
                }, event_date=event, dataset_id=dataset,
                    product_code=history.get("product_code", code), batch_number=history.get("batch_number", "RATE-B1"),
                    quantity=history.get("quantity", "1"), selection_state=history.get("selection_state", "reviewed")))
                if name == "history":
                    facts.extend([
                        fact("sales_invoice", "old-invoice", {}, event_date="2026-08-01"),
                        fact("sales_invoice_line", "old-line", {
                            "source_invoice_id": f"{code}:old-invoice", "quoted_unit_rate": "18.00",
                            "uom_code": "PCS", "price_basis": "tax_exclusive",
                        }, event_date="2026-08-01"),
                    ])
            connection.execute(text("SELECT erp_automation_commands.import_historical_migration_facts(:org,CAST(:facts AS jsonb))"),
                               {"org": fixture.ORG_A, "facts": json.dumps(facts)})
            _activate(connection, "erp_migration_owner")
            connection.execute(text("SELECT erp_automation_commands.install_historical_tax_snapshot(:org,:dataset)"),
                               {"org": fixture.ORG_A, "dataset": cutover.DATASET})
            _activate(connection)
            connection.execute(text("SELECT erp_automation_commands.promote_historical_product_inventory_batch(:org,:dataset,:location,100)"),
                               {"org": fixture.ORG_A, "dataset": cutover.DATASET, "location": cutover.LOCATION})
            connection.exec_driver_sql("SET CONSTRAINTS ALL IMMEDIATE")
            bindings = connection.execute(text("SELECT product.name,batch.id FROM inventory.batches batch "
                                               "JOIN catalog.products product ON product.org_id=batch.org_id AND product.id=batch.product_id "
                                               "WHERE batch.org_id=:org"),
                                          {"org": fixture.ORG_A}).all()
            assert len(bindings) == len(expected)
            for code, batch in bindings:
                params = {"org": fixture.ORG_A, "batch": batch, "branch": cutover.BRANCH}
                actual = connection.execute(text(READ), params).first()
                assert (tuple(actual) if actual else None) == expected[code], (code, actual, expected[code])
            params = {"org": fixture.ORG_A, "batch": bindings[0][1], "branch": cutover.BRANCH}
            cutover._expect_denied(connection, READ, {**params, "org": fixture.ORG_B})
            assert connection.execute(text(READ), {**params, "branch": uuid4()}).first() is None
            assert connection.execute(text(READ), {**params, "batch": uuid4()}).first() is None
            print(f"migrated sale-rate runtime-role checks passed: {len(expected)} provenance cases, tenant/branch guards, forced RLS")
        finally:
            transaction.rollback()
            connection.exec_driver_sql("RESET SESSION AUTHORIZATION")
    engine.dispose()


if __name__ == "__main__":
    main()
