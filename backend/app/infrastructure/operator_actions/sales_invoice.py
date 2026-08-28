"""Canonical sales-invoice prepare calculation and wire projections."""

from __future__ import annotations

from typing import Any, Mapping
from uuid import UUID

from sqlalchemy import text

from .sales_order import commercial_calculation_documents


RESOLVE_SALES_INVOICE_SQL = text(
    """
    SELECT erp_automation_commands.resolve_sales_invoice_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :invoice_id, CAST(:request_json AS jsonb)
    ) AS resolution
    """
)

RESOLVE_SALES_INVOICE_PRODUCT_IDENTITIES_SQL = text(
    """
    SELECT erp_automation_commands.resolve_sales_invoice_product_identities(
        :org_id, CAST(:resolution_json AS jsonb)
    ) AS product_references
    """
)

PERSIST_SALES_INVOICE_SQL = text(
    """
    SELECT erp_automation_commands.persist_sales_invoice_prepare(
        :org_id, :membership_id, :auth_user_id, :user_id, :agent_grant_id,
        :client_id, :invoice_id, :inventory_document_id,
        :command_request_id, :artifact_id, :request_id,
        :idempotency_key_hash, :sequence_key_hash,
        :request_bytes, :resolved_bytes, :preview_bytes,
        :calculation_input_bytes, :calculation_output_bytes, :expires_at
    ) AS command_request_id
    """
)


def calculation_documents(
    request: Mapping[str, Any],
    resolution: Mapping[str, Any],
    *,
    invoice_id: UUID,
) -> tuple[dict[str, Any], dict[str, Any]]:
    return commercial_calculation_documents(
        request,
        resolution,
        resource_id=invoice_id,
        operation="sales.invoice.post",
        resource_type="sales_invoice",
    )


def authoritative_product_references(
    resolved_references: Any,
) -> tuple[dict[str, Any], ...]:
    """Validate product labels read for the resolver's exact row versions."""

    if not isinstance(resolved_references, list):
        raise ValueError("resolved product identities are not an array")
    references: dict[str, dict[str, Any]] = {}
    for item in resolved_references:
        if not isinstance(item, Mapping) or item.get("resource_type") != "product":
            raise ValueError("resolved product identity has an invalid type")
        try:
            product_id = str(UUID(str(item["id"])))
            row_version = int(item["row_version"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("resolved product identity is incomplete") from exc
        product_code = str(item.get("product_code") or "").strip()
        product_name = str(item.get("product_name") or "").strip()
        if row_version < 1 or not product_code or not product_name:
            raise ValueError("resolved product label is missing")
        reference = {
            "resource_type": "product",
            "id": product_id,
            "row_version": row_version,
            "product_code": product_code,
            "product_name": product_name,
        }
        prior_reference = references.setdefault(product_id, reference)
        if prior_reference != reference:
            raise ValueError("one product resolved with different labels")
    if not references:
        raise ValueError("resolved invoice has no product identity")
    return tuple(references[product_id] for product_id in sorted(references))


__all__ = [
    "PERSIST_SALES_INVOICE_SQL",
    "RESOLVE_SALES_INVOICE_PRODUCT_IDENTITIES_SQL",
    "RESOLVE_SALES_INVOICE_SQL",
    "authoritative_product_references",
    "calculation_documents",
]
