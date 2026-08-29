"""Closed write-policy allowlist for delegated canonical master commands."""

from __future__ import annotations

from typing import Optional

from ....domain.operator_actions import ActionPolicy


CUSTOMER_UPDATE_OPERATION = "parties.customer." + "update"
SUPPLIER_UPDATE_OPERATION = "parties.supplier." + "update"
PRODUCT_ACTIVATION_OPERATION = "catalog.product.activate"
DRUG_LICENSE_RECORD_OPERATION = "compliance.wholesale_license.record"
PRODUCT_CATEGORY_CREATE_OPERATION = "catalog.product_category.create"
PRODUCT_MANUFACTURER_CREATE_OPERATION = "catalog.product_manufacturer.create"


MASTER_WRITE_POLICIES = {
    policy.operation_key: policy
    for policy in (
        ActionPolicy(
            "catalog.product_draft.create", "catalog.product.manage",
            "reversible_write", "canonical_product_draft_create_v1",
            "actor_confirmation", (),
        ),
        ActionPolicy(
            "catalog.product_draft.configure", "catalog.product.manage",
            "reversible_write", "canonical_product_setup_v1",
            "actor_confirmation", (),
        ),
        ActionPolicy(
            PRODUCT_CATEGORY_CREATE_OPERATION, "catalog.product.manage",
            "reversible_write", "canonical_product_category_create_v1",
            "actor_confirmation", (),
        ),
        ActionPolicy(
            PRODUCT_MANUFACTURER_CREATE_OPERATION, "catalog.product.manage",
            "reversible_write", "canonical_product_manufacturer_create_v1",
            "actor_confirmation", (),
        ),
        ActionPolicy(
            PRODUCT_ACTIVATION_OPERATION, "catalog.product.manage",
            "consequential_write", "canonical_product_activation_v1",
            "actor_confirmation", (),
        ),
        ActionPolicy(
            "parties.customer.create", "parties.customer.manage",
            "reversible_write", "canonical_customer_create_v1",
            "actor_confirmation", (),
        ),
        ActionPolicy(
            "parties.supplier.create", "parties.supplier.manage",
            "reversible_write", "canonical_supplier_create_v1",
            "actor_confirmation", (),
        ),
        ActionPolicy(
            CUSTOMER_UPDATE_OPERATION, "parties.customer.manage",
            "reversible_write", "canonical_customer_update_v1",
            "actor_confirmation", (),
        ),
        ActionPolicy(
            SUPPLIER_UPDATE_OPERATION, "parties.supplier.manage",
            "reversible_write", "canonical_supplier_update_v1",
            "actor_confirmation", (),
        ),
        ActionPolicy(
            DRUG_LICENSE_RECORD_OPERATION, "compliance.license.manage",
            "consequential_write", "canonical_wholesale_license_record_v1",
            "actor_confirmation", (),
        ),
    )
}


def master_write_policy_for(operation_key: str) -> Optional[ActionPolicy]:
    return MASTER_WRITE_POLICIES.get(operation_key)
