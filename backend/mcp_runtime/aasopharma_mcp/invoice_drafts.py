"""Exact MCP schemas for the shared canonical invoice-draft authority.

The ERP API owns the invoice-draft payload contract.  MCP deliberately types
only the authoring envelope and lifecycle coordinates here; it does not copy
the sales- or supplier-invoice command schemas into a second implementation.
"""

from __future__ import annotations

from typing import Any, Mapping


DOCUMENT_KINDS = ("sales_invoice", "supplier_invoice")
UUID_PATTERN = (
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-"
    r"[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
)

DOCUMENT_KIND_PROPERTY: Mapping[str, Any] = {
    "type": "string",
    "enum": list(DOCUMENT_KINDS),
    "description": "Canonical invoice draft kind; never inferred from editor state.",
}
BRANCH_ID_PROPERTY: Mapping[str, Any] = {
    "type": "string",
    "pattern": UUID_PATTERN,
    "description": "Authorized ERP branch that owns the draft.",
}
DRAFT_ID_PROPERTY: Mapping[str, Any] = {
    "type": "string",
    "pattern": UUID_PATTERN,
    "description": "Canonical invoice-draft UUID returned by save or list.",
}
ROW_VERSION_PROPERTY: Mapping[str, Any] = {
    "type": "integer",
    "minimum": 1,
    "description": "Exact current draft row version for optimistic concurrency.",
}
TITLE_PROPERTY: Mapping[str, Any] = {
    "type": "string",
    "minLength": 1,
    "maxLength": 200,
    "description": "Optional human label for finding this draft; not invoice authority.",
}
PAYLOAD_PROPERTY: Mapping[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "schema_version": {
            "type": "string",
            "const": "invoice-draft.v1",
        },
        "editor_state": {
            "type": "object",
            "description": (
                "Incomplete UI/assistant authoring state preserved exactly for resumption. "
                "It is never business, tax, inventory, or accounting authority."
            ),
        },
        "command_payload": {
            "type": ["object", "null"],
            "description": (
                "Canonical command-shaped input when complete, otherwise null. The ERP "
                "draft-prepare authority performs the authoritative schema validation, "
                "reference resolution, and calculation; MCP never guesses missing facts."
            ),
        },
    },
    "required": ["schema_version", "editor_state", "command_payload"],
    "description": (
        "Shared invoice-draft.v1 authoring envelope forwarded unchanged to the ERP."
    ),
}

SALES_EDITOR_STATE: Mapping[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "invoice": {
            "type": "object",
            "additionalProperties": True,
            "description": "Permissive resumable sales-invoice form data; never posting authority.",
        },
        "selected_customer": {
            "type": ["object", "null"],
            "additionalProperties": True,
            "description": "Permissive selected-customer UI projection or null.",
        },
        "current_step": {"type": "integer", "minimum": 1, "maximum": 3},
    },
    "required": ["invoice", "selected_customer", "current_step"],
}

SUPPLIER_EDITOR_STATE: Mapping[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "selected_receipt_id": {"type": "string"},
        "invoice_number": {"type": "string"},
        "invoice_date": {"type": "string"},
        "received_date": {"type": "string"},
        "rates": {
            "type": "object",
            "additionalProperties": {"type": "string"},
        },
        "allocation_methods": {
            "type": "object",
            "additionalProperties": {"type": "string"},
        },
        "charge_allocation_methods": {
            "type": "object",
            "additionalProperties": {"type": "string"},
        },
        "itc_attested": {"type": "boolean"},
    },
    "required": [
        "selected_receipt_id",
        "invoice_number",
        "invoice_date",
        "received_date",
        "rates",
        "allocation_methods",
        "charge_allocation_methods",
        "itc_attested",
    ],
}


def _editor_state_conditionals() -> list[Mapping[str, Any]]:
    return [
        {
            "if": {
                "properties": {"document_kind": {"const": "sales_invoice"}},
                "required": ["document_kind"],
            },
            "then": {
                "properties": {
                    "payload": {
                        "properties": {"editor_state": SALES_EDITOR_STATE},
                    }
                }
            },
        },
        {
            "if": {
                "properties": {"document_kind": {"const": "supplier_invoice"}},
                "required": ["document_kind"],
            },
            "then": {
                "properties": {
                    "payload": {
                        "properties": {"editor_state": SUPPLIER_EDITOR_STATE},
                    }
                }
            },
        },
    ]


def _schema(
    properties: Mapping[str, Any],
    required: tuple[str, ...],
    description: str,
    **keywords: Any,
) -> Mapping[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": dict(properties),
        "required": list(required),
        "description": description,
        **keywords,
    }


INVOICE_DRAFT_SCHEMAS: Mapping[str, Mapping[str, Any]] = {
    "erp_invoice_draft_list": _schema(
        {
            "document_kind": DOCUMENT_KIND_PROPERTY,
            "branch_id": BRANCH_ID_PROPERTY,
            "limit": {
                "type": "integer",
                "minimum": 1,
                "maximum": 100,
                "default": 50,
            },
            "offset": {"type": "integer", "minimum": 0, "default": 0},
            "status": {
                "type": "string",
                "enum": ["open", "prepared", "posted", "abandoned"],
                "default": "open",
                "description": "Draft lifecycle state to list.",
            },
        },
        ("document_kind", "branch_id"),
        "List bounded resumable invoice drafts from the shared ERP draft authority.",
    ),
    "erp_invoice_draft_get": _schema(
        {
            "document_kind": DOCUMENT_KIND_PROPERTY,
            "branch_id": BRANCH_ID_PROPERTY,
            "draft_id": DRAFT_ID_PROPERTY,
        },
        ("document_kind", "branch_id", "draft_id"),
        "Read one resumable invoice draft without preparing, approving, or posting it.",
    ),
    "erp_invoice_draft_save": _schema(
        {
            "document_kind": DOCUMENT_KIND_PROPERTY,
            "branch_id": BRANCH_ID_PROPERTY,
            "title": TITLE_PROPERTY,
            "payload": PAYLOAD_PROPERTY,
        },
        ("document_kind", "branch_id", "payload"),
        "Save a new resumable authoring draft; incomplete editor state is allowed.",
        allOf=_editor_state_conditionals(),
    ),
    "erp_invoice_draft_update": _schema(
        {
            "document_kind": DOCUMENT_KIND_PROPERTY,
            "branch_id": BRANCH_ID_PROPERTY,
            "draft_id": DRAFT_ID_PROPERTY,
            "expected_row_version": ROW_VERSION_PROPERTY,
            "title": TITLE_PROPERTY,
            "payload": PAYLOAD_PROPERTY,
        },
        ("document_kind", "branch_id", "draft_id", "expected_row_version"),
        "Update one resumable draft under exact row-version concurrency.",
        anyOf=[{"required": ["title"]}, {"required": ["payload"]}],
        allOf=_editor_state_conditionals(),
    ),
    "erp_invoice_draft_abandon": _schema(
        {
            "document_kind": DOCUMENT_KIND_PROPERTY,
            "branch_id": BRANCH_ID_PROPERTY,
            "draft_id": DRAFT_ID_PROPERTY,
            "expected_row_version": ROW_VERSION_PROPERTY,
        },
        ("document_kind", "branch_id", "draft_id", "expected_row_version"),
        "Abandon an editable draft without approving, posting, or deleting accounting data.",
    ),
    "erp_invoice_draft_prepare": _schema(
        {
            "document_kind": DOCUMENT_KIND_PROPERTY,
            "branch_id": BRANCH_ID_PROPERTY,
            "draft_id": DRAFT_ID_PROPERTY,
            "expected_row_version": ROW_VERSION_PROPERTY,
        },
        ("document_kind", "branch_id", "draft_id", "expected_row_version"),
        (
            "Validate the non-null command payload and create an immutable preview. "
            "This never approves, executes, or posts the invoice."
        ),
    ),
}


INVOICE_DRAFT_TOOL_DESCRIPTIONS: Mapping[str, str] = {
    "erp_invoice_draft_list": (
        "List resumable sales- or supplier-invoice drafts from the same canonical ERP "
        "authority used by the UI; each result may include its relative edit_path, and "
        "editor state is not business authority."
    ),
    "erp_invoice_draft_get": (
        "Read one shared canonical invoice draft and relative edit_path for UI resumption "
        "without preparing or posting it."
    ),
    "erp_invoice_draft_save": (
        "Save a new shared invoice-draft.v1 authoring envelope. command_payload may be null "
        "while incomplete, and editor_state never becomes business authority."
    ),
    "erp_invoice_draft_update": (
        "Update a shared invoice draft using its exact row version while preserving the "
        "invoice-draft.v1 payload without a parallel MCP business schema."
    ),
    "erp_invoice_draft_abandon": (
        "Abandon one unposted invoice draft under exact row-version concurrency; this creates "
        "no invoice, tax, inventory, payable, or receivable posting."
    ),
    "erp_invoice_draft_prepare": (
        "Prepare one complete shared invoice draft into an immutable canonical command preview. "
        "This never approves or posts; use review, approve, and execute separately with explicit "
        "human confirmation."
    ),
}
