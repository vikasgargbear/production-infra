#!/usr/bin/env python3
"""Mutation tests for the canonical column catalog validator."""

from __future__ import annotations

import copy
import unittest

from validate_domain_catalog import load_catalog, validate_catalog


class DomainCatalogContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.contract, cls.authority, cls.documents = load_catalog()

    def validate(self, documents):
        return validate_catalog(self.contract, self.authority, documents)

    def table(self, documents, name):
        return next(table for document in documents for table in document["tables"] if table["name"] == name)

    def test_reviewed_catalog_is_valid(self):
        self.assertEqual([], self.validate(copy.deepcopy(self.documents)))

    def test_global_reference_population_modes_are_explicit(self):
        references = {
            table["name"]: table["population_mode"]
            for document in self.documents
            for table in document["tables"]
            if table["tenant_class"] == "global_reference"
        }
        self.assertEqual({
            "core.permissions": "application_seed",
            "core.reference_data_releases": "regulated_import",
            "catalog.units_of_measure": "application_seed",
            "catalog.ingredients": "regulated_import",
            "tax.tax_code_versions": "regulated_import",
        }, references)

    def test_rejects_missing_global_reference_population_mode(self):
        documents = copy.deepcopy(self.documents)
        del self.table(documents, "catalog.ingredients")["population_mode"]
        self.assertTrue(any(
            "catalog.ingredients: global reference requires a reviewed population_mode" in issue
            for issue in self.validate(documents)
        ))

    def test_rejects_tenant_owned_regulatory_release_authority(self):
        documents = copy.deepcopy(self.documents)
        self.table(documents, "core.reference_data_releases")["tenant_class"] = "tenant_direct"
        self.assertTrue(any(
            "core.reference_data_releases: declared global FK target must remain a global_reference" in issue
            for issue in self.validate(documents)
        ))

    def test_rejects_unavailable_uuidv7_database_default(self):
        documents = copy.deepcopy(self.documents)
        self.table(documents, "catalog.products")["columns"][1][3] = "uuidv7()"
        self.assertTrue(any("uuidv7()" in issue for issue in self.validate(documents)))

    def test_rejects_tenant_unsafe_foreign_key(self):
        documents = copy.deepcopy(self.documents)
        table = self.table(documents, "catalog.products")
        fk = next(item for item in table["foreign_keys"] if item["name"] == "products_category_fk")
        fk["columns"] = ["category_id"]
        fk["referenced_columns"] = ["id"]
        self.assertTrue(any("products_category_fk is not tenant-safe" in issue for issue in self.validate(documents)))

    def test_rejects_unbounded_jsonb(self):
        documents = copy.deepcopy(self.documents)
        table = self.table(documents, "core.settings")
        table["columns"].append(["configuration_json", "jsonb", True, None, "internal"])
        self.assertTrue(any("JSONB lacks an allowed bounded_json_purpose" in issue for issue in self.validate(documents)))

    def test_rejects_fiscal_fact_in_bounded_jsonb(self):
        documents = copy.deepcopy(self.documents)
        table = self.table(documents, "core.settings")
        table["columns"].append(["tax_amounts", "jsonb", True, None, "regulated", "configuration"])
        self.assertTrue(any("hides a relational or fiscal business fact" in issue for issue in self.validate(documents)))

    def test_rejects_nullable_unique_without_null_semantics(self):
        documents = copy.deepcopy(self.documents)
        table = self.table(documents, "core.settings")
        table["uniques"].append({"name": "bad_scope_uq", "columns": ["org_id", "branch_id", "namespace", "key"], "where": None})
        self.assertTrue(any("nullable branch_id without explicit NULL semantics" in issue for issue in self.validate(documents)))

    def test_rejects_surrogate_id_on_pure_association(self):
        documents = copy.deepcopy(self.documents)
        table = self.table(documents, "core.role_permissions")
        table["columns"].append(["id", "uuid", False, "gen_random_uuid()", "internal"])
        self.assertTrue(any("association/projection" in issue for issue in self.validate(documents)))

    def test_rejects_actor_without_composite_membership_fk(self):
        documents = copy.deepcopy(self.documents)
        table = self.table(documents, "parties.parties")
        table["foreign_keys"] = [fk for fk in table["foreign_keys"] if fk["name"] != "parties_updated_by_fk"]
        self.assertTrue(any("updated_by_membership_id lacks composite" in issue for issue in self.validate(documents)))

    def test_rejects_optional_branch_scope_without_split_uniqueness(self):
        documents = copy.deepcopy(self.documents)
        table = self.table(documents, "automation.agent_grants")
        table["indexes"] = [index for index in table["indexes"] if "branch_id IS NULL" not in (index.get("where") or "")]
        self.assertTrue(any("optional branch scope requires" in issue for issue in self.validate(documents)))

    def test_rejects_missing_foreign_key_target_column(self):
        documents = copy.deepcopy(self.documents)
        table = self.table(documents, "sales.order_lines")
        fk = next(item for item in table["foreign_keys"] if item["references"] == "catalog.units_of_measure")
        fk["referenced_columns"] = ["missing_code"]
        self.assertTrue(any("targets absent columns" in issue for issue in self.validate(documents)))

    def test_rejects_quantity_type_drift(self):
        documents = copy.deepcopy(self.documents)
        table = self.table(documents, "sales.order_lines")
        column = next(item for item in table["columns"] if item[0] == "billed_quantity")
        column[1] = "numeric(20,2)"
        self.assertTrue(any("canonical quantity numeric(20,6)" in issue for issue in self.validate(documents)))

    def test_rejects_money_type_drift(self):
        documents = copy.deepcopy(self.documents)
        table = self.table(documents, "finance.payments")
        column = next(item for item in table["columns"] if item[0] == "amount")
        column[1] = "numeric(20,4)"
        self.assertTrue(any("amount must use canonical numeric(20,2)" in issue for issue in self.validate(documents)))

    def test_rejects_shared_identifier_type_drift(self):
        documents = copy.deepcopy(self.documents)
        table = self.table(documents, "inventory.inventory_documents")
        column = next(item for item in table["columns"] if item[0] == "document_number")
        column[1] = "text"
        self.assertTrue(
            any(
                "document_number must use shared identifier type varchar(64)" in issue
                for issue in self.validate(documents)
            )
        )

    def test_rejects_cross_domain_document_number_type_drift(self):
        documents = copy.deepcopy(self.documents)
        order = self.table(documents, "sales.orders")
        column = next(item for item in order["columns"] if item[0] == "order_number")
        column[1] = "text"
        self.assertTrue(
            any(
                "order_number must use shared identifier type varchar(64)" in issue
                for issue in self.validate(documents)
            )
        )

    def test_rejects_conflated_product_schedule_and_ndps_classification(self):
        documents = copy.deepcopy(self.documents)
        product = self.table(documents, "catalog.products")
        column = next(item for item in product["columns"] if item[0] == "ndps_regulated")
        column[0] = "controlled_substance"
        schedule_check = next(item for item in product["checks"] if item["name"] == "products_schedule_ck")
        schedule_check["expression"] = "drug_schedule IN ('NONE','H','H1','X','NDPS')"
        issues = self.validate(documents)
        self.assertTrue(any("conflates Drugs Rules and NDPS" in issue for issue in issues))
        self.assertTrue(any("missing regulatory constraint" in issue for issue in issues))

    def test_rejects_conflated_ingredient_regulatory_classification(self):
        documents = copy.deepcopy(self.documents)
        ingredient = self.table(documents, "catalog.ingredients")
        ingredient["columns"] = [
            column for column in ingredient["columns"]
            if column[0] not in {"drugs_rules_schedule", "ndps_classification"}
        ]
        ingredient["columns"].append(["controlled_schedule", "text", False, "'NONE'::text", "regulated"])
        issues = self.validate(documents)
        self.assertTrue(any("conflates independent legal classifications" in issue for issue in issues))

    def test_rejects_schedule_h2_as_a_prescription_schedule_or_unversioned_fact(self):
        documents = copy.deepcopy(self.documents)
        product = self.table(documents, "catalog.products")
        schedule_check = next(item for item in product["checks"] if item["name"] == "products_schedule_ck")
        schedule_check["expression"] = "drug_schedule IN ('NONE','G','H','H1','H2','X')"
        product["columns"] = [
            column for column in product["columns"]
            if column[0] != "regulatory_ruleset_version"
        ]
        issues = self.validate(documents)
        self.assertTrue(any("missing regulatory constraint" in issue for issue in issues))
        self.assertTrue(any("regulatory_ruleset_version must have explicit regulatory shape" in issue for issue in issues))

    def test_rejects_audit_event_without_before_and_after_evidence(self):
        documents = copy.deepcopy(self.documents)
        audit = self.table(documents, "core.audit_events")
        audit["columns"] = [
            column for column in audit["columns"] if column[0] != "before_state_hash"
        ]
        issues = self.validate(documents)
        self.assertTrue(any("before_state_hash must have audit-evidence shape" in issue for issue in issues))

    def test_rejects_missing_commercial_calculation_policy(self):
        documents = copy.deepcopy(self.documents)
        table = self.table(documents, "sales.order_lines")
        table["columns"] = [column for column in table["columns"] if column[0] != "free_supply_tax_treatment"]
        self.assertTrue(any("free_supply_tax_treatment must have calculation-authority shape" in issue for issue in self.validate(documents)))

    def test_rejects_missing_uom_conversion_reconciliation(self):
        documents = copy.deepcopy(self.documents)
        table = self.table(documents, "procurement.purchase_order_lines")
        check = next(item for item in table["checks"] if item["name"].endswith("uom_conversion"))
        check["expression"] = "uom_conversion_factor > 0"
        self.assertTrue(any("base_billed_quantity=round" in issue for issue in self.validate(documents)))

    def test_rejects_missing_return_reversal_basis(self):
        documents = copy.deepcopy(self.documents)
        table = self.table(documents, "sales.return_lines")
        table["columns"] = [column for column in table["columns"] if column[0] != "reversal_value_basis"]
        self.assertTrue(any("reversal_value_basis must have reversal-authority shape" in issue for issue in self.validate(documents)))

    def test_rejects_commercial_shape_that_forbids_free_only_supply(self):
        table_names = (
            "sales.order_lines",
            "sales.invoice_lines",
            "procurement.purchase_order_lines",
            "procurement.supplier_invoice_lines",
        )
        for table_name in table_names:
            with self.subTest(table=table_name):
                documents = copy.deepcopy(self.documents)
                table = self.table(documents, table_name)
                check = next(item for item in table["checks"] if item["name"].endswith("typed_payload"))
                check["expression"] = check["expression"].replace("billed_quantity>=0", "billed_quantity>0")
                self.assertTrue(any("billed_quantity>=0" in issue for issue in self.validate(documents)))

    def test_rejects_ambiguous_discount_columns(self):
        documents = copy.deepcopy(self.documents)
        table = self.table(documents, "sales.invoice_lines")
        table["columns"].append(["discount_amount", "numeric(20,2)", False, None, "financial"])
        self.assertTrue(any("legacy ambiguous calculation field" in issue for issue in self.validate(documents)))

    def test_rejects_missing_taxability_snapshot(self):
        documents = copy.deepcopy(self.documents)
        table = self.table(documents, "procurement.supplier_invoice_lines")
        table["columns"] = [column for column in table["columns"] if column[0] != "taxability_snapshot"]
        self.assertTrue(any("taxability_snapshot must have calculation-authority shape" in issue for issue in self.validate(documents)))

    def test_rejects_missing_zero_rated_payment_mode(self):
        documents = copy.deepcopy(self.documents)
        table = self.table(documents, "sales.invoices")
        table["columns"] = [column for column in table["columns"] if column[0] != "zero_rated_payment_mode"]
        self.assertTrue(any("zero_rated_payment_mode must have document-calculation shape" in issue for issue in self.validate(documents)))

    def test_rejects_missing_reverse_charge_mechanism(self):
        documents = copy.deepcopy(self.documents)
        table = self.table(documents, "procurement.supplier_invoice_lines")
        table["columns"] = [column for column in table["columns"] if column[0] != "tax_charge_mechanism"]
        self.assertTrue(any("tax_charge_mechanism must have calculation-authority shape" in issue for issue in self.validate(documents)))

    def test_rejects_missing_landed_cost_allocation_method(self):
        documents = copy.deepcopy(self.documents)
        table = self.table(documents, "inventory.inventory_document_lines")
        table["columns"] = [column for column in table["columns"] if column[0] != "cost_allocation_method"]
        self.assertTrue(any("cost_allocation_method has invalid landed-cost shape" in issue for issue in self.validate(documents)))

    def test_rejects_incomplete_lifecycle_status_check(self):
        documents = copy.deepcopy(self.documents)
        table = self.table(documents, "hr.departments")
        table["checks"] = [check for check in table["checks"] if check["name"] != "departments_status_ck"]
        self.assertTrue(any("lifecycle states are not all constrained" in issue for issue in self.validate(documents)))

    def test_rejects_unstructured_cross_row_invariants(self):
        documents = copy.deepcopy(self.documents)
        self.table(documents, "core.audit_events")["cross_row_invariants"] = "append only"
        self.assertTrue(any("cross_row_invariants must be a list" in issue for issue in self.validate(documents)))

    def test_rejects_missing_nontrivial_invariant(self):
        documents = copy.deepcopy(self.documents)
        self.table(documents, "core.idempotency_keys")["cross_row_invariants"] = []
        self.assertTrue(any("nontrivial lifecycle/mutation class" in issue for issue in self.validate(documents)))

    def test_rejects_duplicate_schema_index_name(self):
        documents = copy.deepcopy(self.documents)
        first = self.table(documents, "parties.parties")["indexes"][0]
        second = self.table(documents, "parties.customer_accounts")["indexes"][0]
        second["name"] = first["name"]
        self.assertTrue(any("index name occurs 2 times" in issue for issue in self.validate(documents)))

    def test_rejects_duplicate_foreign_key_signature(self):
        documents = copy.deepcopy(self.documents)
        table = self.table(documents, "sales.order_lines")
        duplicate = copy.deepcopy(
            next(
                fk
                for fk in table["foreign_keys"]
                if fk["references"] == "tax.tax_code_versions"
            )
        )
        duplicate["name"] = "same_relationship_under_another_name"
        table["foreign_keys"].append(duplicate)

        self.assertTrue(
            any("duplicate FK signature" in issue for issue in self.validate(documents))
        )

    def test_rejects_global_permission_surrogate_key(self):
        documents = copy.deepcopy(self.documents)
        self.table(documents, "core.permissions")["primary_key"] = ["domain", "action"]
        self.assertTrue(any("stable code primary key" in issue for issue in self.validate(documents)))


if __name__ == "__main__":
    unittest.main()
