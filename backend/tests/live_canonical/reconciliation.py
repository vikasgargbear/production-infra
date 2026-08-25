"""Canonical database reconciliation after action execution."""

from __future__ import annotations

from decimal import Decimal
import hashlib
from typing import Any, Callable


Query = Callable[[str, tuple[Any, ...]], list[dict[str, Any]]]

RESOURCE_TABLES = {
    "sales.order": ("sales.orders", "sales.order_lines", "order_id"),
    "sales.dispatch": ("sales.dispatches", "sales.dispatch_lines", "dispatch_id"),
    "sales.invoice": ("sales.invoices", "sales.invoice_lines", "invoice_id"),
    "sales.return": ("sales.returns", "sales.return_lines", "return_id"),
    "procurement.purchase_order": (
        "procurement.purchase_orders",
        "procurement.purchase_order_lines",
        "purchase_order_id",
    ),
    "procurement.goods_receipt": (
        "procurement.goods_receipts",
        "procurement.goods_receipt_lines",
        "goods_receipt_id",
    ),
    "procurement.supplier_invoice": (
        "procurement.supplier_invoices",
        "procurement.supplier_invoice_lines",
        "supplier_invoice_id",
    ),
    "procurement.purchase_return": (
        "procurement.purchase_returns",
        "procurement.purchase_return_lines",
        "purchase_return_id",
    ),
    "finance.customer_receipt": ("finance.payments", "finance.allocations", "payment_id"),
    "finance.supplier_payment": ("finance.payments", "finance.allocations", "payment_id"),
    "finance.supplier_advance": (
        "finance.payments",
        "procurement.purchase_order_advance_allocations",
        "payment_id",
    ),
    "finance.adjustment_note": (
        "finance.adjustment_notes",
        "finance.adjustment_note_lines",
        "adjustment_note_id",
    ),
    "inventory.transfer": (
        "inventory.inventory_documents",
        "inventory.inventory_document_lines",
        "inventory_document_id",
    ),
    "inventory.adjustment": (
        "inventory.inventory_documents",
        "inventory.inventory_document_lines",
        "inventory_document_id",
    ),
    "inventory.destruction": (
        "compliance.destructions",
        "inventory.inventory_documents",
        "destruction_id",
    ),
}

TOTAL_FIELDS = (
    "subtotal",
    "discount_total",
    "net_value_total",
    "gst_taxable_total",
    "cgst_total",
    "sgst_total",
    "igst_total",
    "cess_total",
    "recipient_assessed_tax_total",
    "rounding_adjustment",
    "grand_total",
)

TAX_DOCUMENT_OPERATIONS = {
    "sales.invoice",
    "sales.return",
    "procurement.supplier_invoice",
    "procurement.purchase_return",
}
RETURN_OPERATIONS = {"sales.return", "procurement.purchase_return"}
PAYMENT_OPERATIONS = {
    "finance.customer_receipt",
    "finance.supplier_payment",
    "finance.supplier_advance",
}


def _qualified(identifier: str) -> str:
    parts = identifier.split(".")
    if not parts or any(not part.replace("_", "").isalnum() for part in parts):
        raise ValueError(f"unsafe SQL identifier: {identifier}")
    return ".".join(f'"{part}"' for part in parts)


def _find(mapping: Any, key: str):
    if isinstance(mapping, dict):
        if key in mapping:
            return mapping[key]
        for value in mapping.values():
            found = _find(value, key)
            if found is not None:
                return found
    elif isinstance(mapping, list):
        for value in mapping:
            found = _find(value, key)
            if found is not None:
                return found
    return None


class CanonicalReconciler:
    def __init__(self, query: Query, org_id: str):
        self.query = query
        self.org_id = org_id

    def assert_disposable_target(self) -> None:
        rows = self.query(
            """
            SELECT value_boolean
              FROM core.settings
             WHERE org_id = %s::uuid
               AND scope_kind = 'organization'
               AND namespace = 'test_safety'
               AND key = 'disposable_live_write_target'
               AND status = 'active'
            """,
            (self.org_id,),
        )
        if rows != [{"value_boolean": True}]:
            raise AssertionError(
                "target organization lacks the active disposable live-write marker"
            )

    def assert_cross_tenant_denied(
        self,
        operation: str,
        resource_id: str,
        denial_query: Query,
    ) -> None:
        header_table = RESOURCE_TABLES[operation][0]
        rows = denial_query(
            f"SELECT id FROM {_qualified(header_table)} "
            "WHERE org_id = %s::uuid AND id = %s::uuid",
            (self.org_id, resource_id),
        )
        assert rows == [], f"{operation} leaked through canonical RLS to the denial tenant"

    def reconcile(
        self,
        command_request_id: str,
        operation: str,
        resource_id: str,
        preview: dict[str, Any],
    ) -> dict[str, Any]:
        if operation not in RESOURCE_TABLES:
            raise AssertionError(f"operation has no reconciliation owner: {operation}")
        header_table, line_table, line_fk = RESOURCE_TABLES[operation]
        command = self.query(
            """
            SELECT status, result_resource_id, preview_hash, response_hash, row_version
              FROM automation.command_requests
             WHERE org_id = %s::uuid AND id = %s::uuid
            """,
            (self.org_id, command_request_id),
        )
        assert len(command) == 1 and command[0]["status"] == "succeeded"
        assert str(command[0]["result_resource_id"]) == resource_id

        approvals = self.query(
            """
            SELECT decision, preview_hash
              FROM automation.command_approvals
             WHERE org_id = %s::uuid AND command_request_id = %s::uuid
            """,
            (self.org_id, command_request_id),
        )
        assert approvals and all(row["decision"] == "approved" for row in approvals)
        assert all(row["preview_hash"] == command[0]["preview_hash"] for row in approvals)

        header = self.query(
            f"SELECT * FROM {_qualified(header_table)} WHERE org_id = %s::uuid AND id = %s::uuid",
            (self.org_id, resource_id),
        )
        assert len(header) == 1
        lines = self.query(
            f"SELECT * FROM {_qualified(line_table)} WHERE org_id = %s::uuid AND {_qualified(line_fk)} = %s::uuid ORDER BY id",
            (self.org_id, resource_id),
        )
        assert lines, f"{operation} posted without typed lines/allocations"

        line_to_header = {
            "net_value_amount": "net_value_total",
            "gst_taxable_value": "gst_taxable_total",
            "cgst_amount": "cgst_total",
            "sgst_amount": "sgst_total",
            "igst_amount": "igst_total",
            "cess_amount": "cess_total",
        }
        for line_field, header_field in line_to_header.items():
            if line_field in lines[0] and header_field in header[0]:
                assert sum(
                    (Decimal(str(row[line_field])) for row in lines), Decimal("0")
                ) == Decimal(str(header[0][header_field])), header_field
        if "line_total" in lines[0] and "grand_total" in header[0]:
            line_total = sum(
                (Decimal(str(row["line_total"])) for row in lines), Decimal("0")
            )
            rounding = Decimal(str(header[0].get("rounding_adjustment") or 0))
            assert line_total + rounding == Decimal(str(header[0]["grand_total"]))
        if "gross_amount" in lines[0] and "subtotal" in header[0]:
            assert sum(
                (Decimal(str(row["gross_amount"])) for row in lines), Decimal("0")
            ) == Decimal(str(header[0]["subtotal"]))
        if "line_discount_amount" in lines[0] and "discount_total" in header[0]:
            assert sum(
                (
                    Decimal(str(row["line_discount_amount"]))
                    + Decimal(str(row["document_discount_amount"]))
                    for row in lines
                ),
                Decimal("0"),
            ) == Decimal(str(header[0]["discount_total"]))
        if "base_quantity" in lines[0] and "total_abs_base_quantity" in header[0]:
            assert sum(
                (abs(Decimal(str(row["base_quantity"]))) for row in lines), Decimal("0")
            ) == Decimal(str(header[0]["total_abs_base_quantity"]))

        for field in TOTAL_FIELDS:
            expected = _find(preview, field)
            actual = header[0].get(field)
            if expected is not None and actual is not None:
                assert Decimal(str(actual)) == Decimal(str(expected)), field

        audit = self.query(
            """
            SELECT event.chain_sequence, event.evidence_hash,
                   event.previous_event_hash,
                   previous.evidence_hash AS expected_previous_event_hash
              FROM core.audit_events event
              LEFT JOIN core.audit_events previous
                ON previous.org_id=event.org_id
               AND previous.chain_sequence=event.chain_sequence-1
             WHERE event.org_id = %s::uuid
               AND event.command_request_id = %s::uuid
             ORDER BY event.chain_sequence
            """,
            (self.org_id, command_request_id),
        )
        assert audit
        for event in audit:
            assert len(bytes(event["evidence_hash"])) == 32
            if event["chain_sequence"] == 1:
                assert event["previous_event_hash"] is None
            else:
                assert event["expected_previous_event_hash"] is not None
                assert bytes(event["previous_event_hash"]) == bytes(
                    event["expected_previous_event_hash"]
                )
        outbox = self.query(
            """
            SELECT event_type, aggregate_type, aggregate_id, event_version,
                   payload_bytes, payload_hash
              FROM core.outbox_events
             WHERE org_id = %s::uuid AND aggregate_id = %s::uuid
             ORDER BY event_version, id
            """,
            (self.org_id, resource_id),
        )
        assert outbox
        assert len({(row["event_type"], row["event_version"]) for row in outbox}) == len(
            outbox
        )
        for event in outbox:
            assert str(event["aggregate_id"]) == resource_id
            payload_bytes = bytes(event["payload_bytes"])
            assert hashlib.sha256(payload_bytes).digest() == bytes(event["payload_hash"])

        journal = self.query(
            """
            SELECT count(*)::integer AS entry_count,
                   COALESCE(sum(je.transaction_debit_total), 0) AS debit_total,
                   COALESCE(sum(je.transaction_credit_total), 0) AS credit_total,
                   COALESCE(sum(je.functional_debit_total), 0) AS functional_debit_total,
                   COALESCE(sum(je.functional_credit_total), 0) AS functional_credit_total
              FROM finance.accounting_events ae
              JOIN finance.journal_entries je
                ON je.org_id = ae.org_id AND je.id = ae.journal_entry_id
             WHERE ae.org_id = %s::uuid
               AND (ae.sales_invoice_id = %s::uuid OR ae.supplier_invoice_id = %s::uuid
                    OR ae.payment_id = %s::uuid OR ae.inventory_document_id = %s::uuid)
            """,
            (self.org_id, resource_id, resource_id, resource_id, resource_id),
        )[0]
        if journal["entry_count"]:
            assert journal["debit_total"] == journal["credit_total"]
            assert journal["functional_debit_total"] == journal["functional_credit_total"]

        stock = self.query(
            """
            SELECT count(*)::integer AS entry_count,
                   COALESCE(sum(sle.quantity_delta), 0) AS quantity_delta,
                   COALESCE(sum(sle.value_delta), 0) AS value_delta
              FROM inventory.inventory_documents doc
              JOIN inventory.stock_ledger_entries sle
                ON sle.org_id = doc.org_id AND sle.inventory_document_id = doc.id
             WHERE doc.org_id = %s::uuid
               AND (doc.id = %s::uuid OR doc.sales_dispatch_id = %s::uuid
                    OR doc.sales_invoice_id = %s::uuid OR doc.sales_return_id = %s::uuid
                    OR doc.goods_receipt_id = %s::uuid OR doc.supplier_invoice_id = %s::uuid
                    OR doc.purchase_return_id = %s::uuid OR doc.destruction_id = %s::uuid)
            """,
            (self.org_id,) + (resource_id,) * 8,
        )[0]
        if stock["entry_count"]:
            projection = self.query(
                """
                WITH touched AS (
                    SELECT DISTINCT sle.branch_id, sle.location_id, sle.product_id, sle.batch_id
                      FROM inventory.inventory_documents doc
                      JOIN inventory.stock_ledger_entries sle
                        ON sle.org_id = doc.org_id AND sle.inventory_document_id = doc.id
                     WHERE doc.org_id = %s::uuid
                       AND (doc.id = %s::uuid OR doc.sales_dispatch_id = %s::uuid
                            OR doc.sales_invoice_id = %s::uuid OR doc.sales_return_id = %s::uuid
                            OR doc.goods_receipt_id = %s::uuid OR doc.supplier_invoice_id = %s::uuid
                            OR doc.purchase_return_id = %s::uuid OR doc.destruction_id = %s::uuid)
                ), ledger AS (
                    SELECT sle.branch_id, sle.location_id, sle.product_id, sle.batch_id,
                           sum(sle.quantity_delta) AS on_hand_quantity,
                           sum(sle.value_delta) AS inventory_value
                      FROM inventory.stock_ledger_entries sle
                      JOIN touched USING (branch_id, location_id, product_id, batch_id)
                     WHERE sle.org_id = %s::uuid
                     GROUP BY sle.branch_id, sle.location_id, sle.product_id, sle.batch_id
                )
                SELECT count(*) FILTER (
                           WHERE bal.on_hand_quantity IS DISTINCT FROM ledger.on_hand_quantity
                              OR bal.inventory_value IS DISTINCT FROM ledger.inventory_value
                       )::integer AS mismatch_count,
                       count(*)::integer AS touched_count
                  FROM ledger
                  LEFT JOIN inventory.stock_balances bal
                    ON bal.org_id = %s::uuid
                   AND bal.branch_id = ledger.branch_id
                   AND bal.location_id = ledger.location_id
                   AND bal.product_id = ledger.product_id
                   AND bal.batch_id = ledger.batch_id
                """,
                (self.org_id,) + (resource_id,) * 8 + (self.org_id, self.org_id),
            )[0]
            assert projection["touched_count"] > 0
            assert projection["mismatch_count"] == 0
        else:
            projection = {"touched_count": 0, "mismatch_count": 0}

        destruction_evidence: list[dict[str, Any]] = []
        if operation == "inventory.destruction":
            destruction_evidence = self.query(
                """
                SELECT destruction.created_by_membership_id,
                       destruction.approved_by_membership_id,
                       destruction.posted_by_membership_id,
                       destruction.method_code,
                       destruction.certificate_attachment_id,
                       document.total_abs_base_quantity,
                       document.total_value,
                       sum(line.base_quantity) AS line_quantity,
                       sum(line.extended_cost) AS line_value,
                       sum(-ledger.quantity_delta) AS ledger_quantity,
                       sum(-ledger.value_delta) AS ledger_value,
                       count(*) FILTER (
                           WHERE balance.on_hand_quantity <> 0
                              OR balance.inventory_value <> 0
                       )::integer AS nonzero_balance_count,
                       journal.status AS journal_status,
                       journal.transaction_debit_total,
                       journal.transaction_credit_total
                  FROM compliance.destructions destruction
                  JOIN inventory.inventory_documents document
                    ON document.org_id=destruction.org_id
                   AND document.destruction_id=destruction.id
                  JOIN inventory.inventory_document_lines line
                    ON line.org_id=document.org_id
                   AND line.inventory_document_id=document.id
                  JOIN inventory.stock_ledger_entries ledger
                    ON ledger.org_id=line.org_id
                   AND ledger.inventory_document_line_id=line.id
                   AND ledger.entry_kind='issue'
                  JOIN inventory.stock_balances balance
                    ON balance.org_id=ledger.org_id
                   AND balance.branch_id=ledger.branch_id
                   AND balance.location_id=ledger.location_id
                   AND balance.product_id=ledger.product_id
                   AND balance.batch_id=ledger.batch_id
                  JOIN finance.accounting_events event
                    ON event.org_id=document.org_id
                   AND event.inventory_document_id=document.id
                   AND event.event_type='inventory_valuation'
                  JOIN finance.journal_entries journal
                    ON journal.org_id=event.org_id
                   AND journal.id=event.journal_entry_id
                 WHERE destruction.org_id=%s::uuid AND destruction.id=%s::uuid
                   AND destruction.status='posted' AND document.status='posted'
                 GROUP BY destruction.created_by_membership_id,
                          destruction.approved_by_membership_id,
                          destruction.posted_by_membership_id,
                          destruction.method_code,
                          destruction.certificate_attachment_id,
                          document.total_abs_base_quantity,document.total_value,
                          journal.status,journal.transaction_debit_total,
                          journal.transaction_credit_total
                """,
                (self.org_id, resource_id),
            )
            assert len(destruction_evidence) == 1
            destruction = destruction_evidence[0]
            assert destruction["approved_by_membership_id"] != destruction[
                "created_by_membership_id"
            ]
            assert destruction["method_code"] == "licensed_incineration"
            assert destruction["certificate_attachment_id"] is not None
            assert destruction["line_quantity"] == destruction[
                "total_abs_base_quantity"
            ] == destruction["ledger_quantity"]
            assert destruction["line_value"] == destruction["total_value"] == destruction[
                "ledger_value"
            ]
            assert destruction["nonzero_balance_count"] == 0
            assert destruction["journal_status"] == "posted"
            assert destruction["transaction_debit_total"] == destruction[
                "total_value"
            ] == destruction["transaction_credit_total"]

        tax_documents = self.query(
            """
            SELECT td.*
              FROM tax.documents td
              LEFT JOIN finance.adjustment_notes note
                ON note.org_id = td.org_id AND note.id = td.adjustment_note_id
             WHERE td.org_id = %s::uuid
               AND (td.sales_invoice_id = %s::uuid OR td.supplier_invoice_id = %s::uuid
                    OR note.sales_return_id = %s::uuid OR note.purchase_return_id = %s::uuid)
            """,
            (self.org_id,) + (resource_id,) * 4,
        )
        commercial_only = _find(preview, "gst_tax_treatment") == "commercial_only"
        if operation in TAX_DOCUMENT_OPERATIONS and not commercial_only:
            assert len(tax_documents) == 1
            for preview_field, tax_field in (
                ("net_value_total", "net_value_amount"),
                ("gst_taxable_total", "gst_taxable_value"),
                ("cgst_total", "cgst_amount"),
                ("sgst_total", "sgst_amount"),
                ("igst_total", "igst_amount"),
                ("cess_total", "cess_amount"),
                ("grand_total", "counterparty_payable_amount"),
            ):
                expected = _find(preview, preview_field)
                if expected is not None:
                    assert Decimal(str(tax_documents[0][tax_field])) == Decimal(str(expected))
        elif commercial_only:
            assert operation in RETURN_OPERATIONS
            assert tax_documents == []

        adjustment_notes = []
        if operation in RETURN_OPERATIONS:
            return_field = "sales_return_id" if operation == "sales.return" else "purchase_return_id"
            adjustment_notes = self.query(
                f"SELECT * FROM finance.adjustment_notes WHERE org_id = %s::uuid AND {_qualified(return_field)} = %s::uuid",
                (self.org_id, resource_id),
            )
            assert len(adjustment_notes) == 1

        open_items = self.query(
            """
            SELECT oi.*
              FROM finance.open_items oi
              JOIN finance.accounting_events ae
                ON ae.org_id = oi.org_id AND ae.id = oi.accounting_event_id
             WHERE ae.org_id = %s::uuid
               AND (ae.sales_invoice_id = %s::uuid OR ae.supplier_invoice_id = %s::uuid
                    OR ae.payment_id = %s::uuid)
            """,
            (self.org_id, resource_id, resource_id, resource_id),
        )
        allocations = []
        if operation in PAYMENT_OPERATIONS:
            allocations = self.query(
                """
                SELECT * FROM finance.allocations
                 WHERE org_id = %s::uuid AND payment_id = %s::uuid AND status = 'posted'
                """,
                (self.org_id, resource_id),
            )
            if operation != "finance.supplier_advance":
                assert allocations, "settlement payment posted without typed allocations"

        withholdings = self.query(
            """
            SELECT wh.*
              FROM tax.withholdings wh
              LEFT JOIN procurement.purchase_order_advance_allocations advance
                ON advance.org_id = wh.org_id
               AND advance.id = wh.purchase_order_advance_allocation_id
             WHERE wh.org_id = %s::uuid
               AND (wh.triggered_by_payment_id = %s::uuid OR advance.payment_id = %s::uuid)
            """,
            (self.org_id, resource_id, resource_id),
        )
        return {
            "command": command[0],
            "header": header[0],
            "lines": lines,
            "audit_count": len(audit),
            "outbox_count": len(outbox),
            "journal": journal,
            "stock": stock,
            "stock_projection": projection,
            "destruction_evidence": destruction_evidence,
            "tax_documents": tax_documents,
            "adjustment_notes": adjustment_notes,
            "open_items": open_items,
            "allocations": allocations,
            "withholdings": withholdings,
        }
