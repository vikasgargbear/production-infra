"""Closed write-policy allowlist for delegated canonical master commands."""

from __future__ import annotations

from typing import Optional

from ....domain.operator_actions import ActionPolicy


CUSTOMER_UPDATE_OPERATION = "parties.customer." + "update"
SUPPLIER_UPDATE_OPERATION = "parties.supplier." + "update"


MASTER_WRITE_POLICIES = {
    policy.operation_key: policy
    for policy in (
        ActionPolicy(
            "catalog.product_draft.create", "catalog.product.manage",
            "reversible_write", "canonical_product_draft_create_v1",
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
    )
}


def master_write_policy_for(operation_key: str) -> Optional[ActionPolicy]:
    return MASTER_WRITE_POLICIES.get(operation_key)
