"""Stateless, non-posting review contract for purchase-bill evidence.

This module deliberately does not resolve ERP identities, create master data, or
prepare a transaction.  It preserves the caller's extracted evidence and exact
canonical resolutions, reports every unresolved/skipped fact, and describes the
remaining canonical PO -> GRN -> supplier-invoice gates.
"""

from __future__ import annotations

from copy import deepcopy
import hashlib
import json
from typing import Any, Mapping

from jsonschema import Draft202012Validator, FormatChecker


_RAW_EVIDENCE_FIELDS = {
    field: {"type": ["string", "null"], "maxLength": 512}
    for field in (
        "description",
        "pack",
        "batch",
        "expiry",
        "mrp",
        "quantity",
        "free_quantity",
        "rate",
        "discount",
        "hsn",
        "tax",
    )
}

_BLOCKING_STAGE_ENUM = [
    "supplier_create",
    "product_create",
    "product_setup",
    "purchase_order",
    "goods_receipt",
    "supplier_invoice",
]

_OPEN_FIELD = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "path": {"type": "string", "minLength": 1, "maxLength": 256},
        "reason": {"type": "string", "minLength": 1, "maxLength": 512},
        "required_for": {
            "type": "array",
            "uniqueItems": True,
            "items": {"type": "string", "enum": _BLOCKING_STAGE_ENUM},
        },
    },
    "required": ["path", "reason", "required_for"],
}

_PARTY_RESOLUTION = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "status": {
            "type": "string",
            "enum": ["matched", "proposed_new", "unresolved", "skipped"],
        },
        "supplier_id": {"type": ["string", "null"], "format": "uuid"},
        "canonical_name": {"type": ["string", "null"], "maxLength": 200},
        "proposed_supplier_name": {
            "type": ["string", "null"],
            "maxLength": 200,
        },
        "candidate_supplier_ids": {
            "type": "array",
            "uniqueItems": True,
            "maxItems": 20,
            "items": {"type": "string", "format": "uuid"},
        },
        "skip_reason": {"type": ["string", "null"], "maxLength": 512},
    },
    "required": [
        "status",
        "supplier_id",
        "canonical_name",
        "proposed_supplier_name",
        "candidate_supplier_ids",
        "skip_reason",
    ],
}

_PRODUCT_RESOLUTION = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "status": {
            "type": "string",
            "enum": ["matched", "proposed_new", "unresolved", "skipped"],
        },
        "product_id": {"type": ["string", "null"], "format": "uuid"},
        "canonical_name": {"type": ["string", "null"], "maxLength": 255},
        "candidate_product_ids": {
            "type": "array",
            "uniqueItems": True,
            "maxItems": 20,
            "items": {"type": "string", "format": "uuid"},
        },
        "proposed_product": {
            "type": ["object", "null"],
            "additionalProperties": False,
            "properties": {
                "product_name": {"type": "string", "minLength": 1, "maxLength": 255},
                "product_kind": {
                    "type": "string",
                    "enum": ["medicine", "medical_device", "consumable"],
                },
                "generic_name": {"type": ["string", "null"], "maxLength": 255},
                "observed_pack": {"type": ["string", "null"], "maxLength": 100},
            },
            "required": ["product_name", "product_kind", "generic_name", "observed_pack"],
        },
        "skip_reason": {"type": ["string", "null"], "maxLength": 512},
    },
    "required": [
        "status",
        "product_id",
        "canonical_name",
        "candidate_product_ids",
        "proposed_product",
        "skip_reason",
    ],
}

PURCHASE_BILL_MAPPING_ARGUMENT_SCHEMA: Mapping[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "mapping": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "review_id": {
                    "type": "string",
                    "pattern": r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$",
                },
                "revision": {"type": "integer", "minimum": 1},
                "parent_mapping_hash": {
                    "type": ["string", "null"],
                    "pattern": r"^sha256:[0-9a-f]{64}$",
                },
                "evidence": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "source_kind": {
                            "type": "string",
                            "enum": ["image", "pdf", "manual"],
                        },
                        "source_reference": {
                            "type": ["string", "null"],
                            "maxLength": 256,
                        },
                        "supplier_name": {
                            "type": ["string", "null"],
                            "maxLength": 200,
                        },
                        "supplier_gstin": {
                            "type": ["string", "null"],
                            "maxLength": 32,
                        },
                        "invoice_number": {
                            "type": ["string", "null"],
                            "maxLength": 128,
                        },
                        "invoice_date": {
                            "type": ["string", "null"],
                            "format": "date",
                        },
                        "additional_document_fields": {
                            "type": "array",
                            "maxItems": 100,
                            "items": {
                                "type": "object",
                                "additionalProperties": False,
                                "properties": {
                                    "label": {
                                        "type": "string",
                                        "minLength": 1,
                                        "maxLength": 128,
                                    },
                                    "value": {
                                        "type": ["string", "null"],
                                        "maxLength": 512,
                                    },
                                    "uncertain": {"type": "boolean"},
                                },
                                "required": ["label", "value", "uncertain"],
                            },
                        },
                    },
                    "required": [
                        "source_kind",
                        "source_reference",
                        "supplier_name",
                        "supplier_gstin",
                        "invoice_number",
                        "invoice_date",
                        "additional_document_fields",
                    ],
                },
                "supplier_resolution": _PARTY_RESOLUTION,
                "lines": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 500,
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "line_id": {
                                "type": "string",
                                "pattern": r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$",
                            },
                            "source_fields": {
                                "type": "object",
                                "additionalProperties": False,
                                "properties": _RAW_EVIDENCE_FIELDS,
                                "required": list(_RAW_EVIDENCE_FIELDS),
                            },
                            "uncertain_fields": {
                                "type": "array",
                                "uniqueItems": True,
                                "maxItems": len(_RAW_EVIDENCE_FIELDS),
                                "items": {
                                    "type": "string",
                                    "enum": list(_RAW_EVIDENCE_FIELDS),
                                },
                            },
                            "product_resolution": _PRODUCT_RESOLUTION,
                        },
                        "required": [
                            "line_id",
                            "source_fields",
                            "uncertain_fields",
                            "product_resolution",
                        ],
                    },
                },
                "unresolved_fields": {
                    "type": "array",
                    "maxItems": 1000,
                    "items": _OPEN_FIELD,
                },
                "skipped_fields": {
                    "type": "array",
                    "maxItems": 1000,
                    "items": _OPEN_FIELD,
                },
                "explicit_skip_permission": {"type": "boolean"},
            },
            "required": [
                "review_id",
                "revision",
                "parent_mapping_hash",
                "evidence",
                "supplier_resolution",
                "lines",
                "unresolved_fields",
                "skipped_fields",
                "explicit_skip_permission",
            ],
        }
    },
    "required": ["mapping"],
}


def _semantic_errors(mapping: Mapping[str, Any]) -> list[str]:
    errors: list[str] = []
    skip_permission = mapping["explicit_skip_permission"]
    supplier = mapping["supplier_resolution"]
    supplier_status = supplier["status"]
    if supplier_status == "matched" and not supplier["supplier_id"]:
        errors.append("supplier_resolution.supplier_id is required when status is matched")
    if supplier_status == "matched" and supplier["proposed_supplier_name"]:
        errors.append(
            "supplier_resolution.proposed_supplier_name must be empty when status is matched"
        )
    if supplier_status == "proposed_new" and not supplier["proposed_supplier_name"]:
        errors.append(
            "supplier_resolution.proposed_supplier_name is required when status is proposed_new"
        )
    if supplier_status != "matched" and supplier["supplier_id"]:
        errors.append(
            "supplier_resolution.supplier_id is allowed only when status is matched"
        )
    if supplier_status == "skipped":
        if not skip_permission:
            errors.append("explicit skip permission is required to skip the supplier")
        if not supplier["skip_reason"]:
            errors.append("supplier_resolution.skip_reason is required when status is skipped")

    line_ids: set[str] = set()
    for index, line in enumerate(mapping["lines"]):
        line_id = line["line_id"]
        if line_id in line_ids:
            errors.append(f"lines[{index}].line_id duplicates {line_id}")
        line_ids.add(line_id)
        resolution = line["product_resolution"]
        status = resolution["status"]
        if status == "matched" and not resolution["product_id"]:
            errors.append(
                f"lines[{index}].product_resolution.product_id is required when status is matched"
            )
        if status == "matched" and resolution["proposed_product"]:
            errors.append(
                f"lines[{index}].product_resolution.proposed_product must be empty when status is matched"
            )
        if status == "proposed_new" and not resolution["proposed_product"]:
            errors.append(
                f"lines[{index}].product_resolution.proposed_product is required when status is proposed_new"
            )
        if status != "matched" and resolution["product_id"]:
            errors.append(
                f"lines[{index}].product_resolution.product_id is allowed only when status is matched"
            )
        if status == "skipped":
            if not skip_permission:
                errors.append(f"explicit skip permission is required to skip line {line_id}")
            if not resolution["skip_reason"]:
                errors.append(f"skip_reason is required for skipped line {line_id}")

    unresolved_paths = [item["path"] for item in mapping["unresolved_fields"]]
    skipped_paths = [item["path"] for item in mapping["skipped_fields"]]
    for label, paths in (("unresolved_fields", unresolved_paths), ("skipped_fields", skipped_paths)):
        if len(paths) != len(set(paths)):
            errors.append(f"{label} contains a duplicate path")
    overlap = sorted(set(unresolved_paths) & set(skipped_paths))
    if overlap:
        errors.append(f"a field cannot be unresolved and skipped: {overlap[0]}")
    if skipped_paths and not skip_permission:
        errors.append("explicit skip permission is required when skipped_fields is non-empty")
    return errors


def _stage_blockers(mapping: Mapping[str, Any], stage: str) -> list[str]:
    blockers: list[str] = []
    supplier = mapping["supplier_resolution"]
    if supplier["status"] != "matched":
        blockers.append(f"supplier_{supplier['status']}")

    included_lines = 0
    for line in mapping["lines"]:
        line_id = line["line_id"]
        status = line["product_resolution"]["status"]
        if status == "skipped":
            blockers.append(f"line_skipped:{line_id}")
            continue
        included_lines += 1
        if status != "matched":
            blockers.append(f"product_{status}:{line_id}")
        for field_name in line["uncertain_fields"]:
            blockers.append(f"uncertain_evidence:{line_id}.{field_name}")
    if included_lines == 0:
        blockers.append("no_included_lines")

    for collection_name in ("unresolved_fields", "skipped_fields"):
        for item in mapping[collection_name]:
            if stage in item["required_for"]:
                blockers.append(f"{collection_name}:{item['path']}")
    return sorted(set(blockers))


def review_purchase_bill_mapping(mapping: Mapping[str, Any]) -> dict[str, Any]:
    """Validate and return one complete resumable purchase-bill review state."""

    arguments = {"mapping": mapping}
    errors = sorted(
        Draft202012Validator(
            PURCHASE_BILL_MAPPING_ARGUMENT_SCHEMA,
            format_checker=FormatChecker(),
        ).iter_errors(arguments),
        key=lambda error: list(error.absolute_path),
    )
    if errors:
        error = errors[0]
        location = ".".join(str(part) for part in error.absolute_path) or "mapping"
        raise ValueError(f"{location}: {error.message}")
    semantic_errors = _semantic_errors(mapping)
    if semantic_errors:
        raise ValueError(semantic_errors[0])

    preserved = deepcopy(dict(mapping))
    encoded = json.dumps(
        preserved,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    mapping_hash = "sha256:" + hashlib.sha256(encoded).hexdigest()

    supplier_status = preserved["supplier_resolution"]["status"]
    product_statuses = {
        line["product_resolution"]["status"] for line in preserved["lines"]
    }
    has_context_gap = bool(preserved["unresolved_fields"]) or bool(
        any(line["uncertain_fields"] for line in preserved["lines"])
    )
    has_context_gap = has_context_gap or supplier_status in {"unresolved", "skipped"}
    has_context_gap = has_context_gap or bool(product_statuses & {"unresolved", "skipped"})
    has_new_master = supplier_status == "proposed_new" or "proposed_new" in product_statuses
    if has_context_gap:
        status = "needs_context"
    elif has_new_master:
        status = "needs_master_data"
    else:
        status = "ready_for_canonical_prepare_validation"

    po_blockers = _stage_blockers(preserved, "purchase_order")
    grn_blockers = [*_stage_blockers(preserved, "goods_receipt"), "requires_executed_purchase_order"]
    invoice_blockers = [
        *_stage_blockers(preserved, "supplier_invoice"),
        "requires_executed_goods_receipt",
    ]
    if not preserved["evidence"]["invoice_number"]:
        invoice_blockers.append("invoice_number_missing")
    if not preserved["evidence"]["invoice_date"]:
        invoice_blockers.append("invoice_date_missing")

    return {
        "contract": "aasopharma.purchase_bill_mapping.v1",
        "review_id": preserved["review_id"],
        "revision": preserved["revision"],
        "mapping_hash": mapping_hash,
        "status": status,
        "mapping": preserved,
        "next_steps": [
            {
                "sequence": 1,
                "tool": "erp_purchase_order_prepare",
                "state": "awaiting_canonical_validation" if not po_blockers else "blocked",
                "blockers": po_blockers,
            },
            {
                "sequence": 2,
                "tool": "erp_goods_receipt_prepare",
                "state": "blocked",
                "blockers": sorted(set(grn_blockers)),
            },
            {
                "sequence": 3,
                "tool": "erp_supplier_invoice_prepare",
                "state": "blocked",
                "blockers": sorted(set(invoice_blockers)),
            },
        ],
        "resume": {
            "mode": "stateless_full_mapping",
            "next_revision": preserved["revision"] + 1,
            "parent_mapping_hash": mapping_hash,
            "instruction": (
                "Carry the complete mapping forward, change only reviewed facts or canonical "
                "resolutions, increment revision, and set parent_mapping_hash to this mapping_hash."
            ),
        },
        "posting_performed": False,
        "canonical_ids_resolved_by_this_tool": False,
    }
