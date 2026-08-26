"""Closed write-policy allowlist for delegated canonical master creation."""

from __future__ import annotations

from typing import Optional

from ....domain.operator_actions import ActionPolicy


MASTER_CREATE_POLICIES = {
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
    )
}


def master_create_policy_for(operation_key: str) -> Optional[ActionPolicy]:
    return MASTER_CREATE_POLICIES.get(operation_key)
