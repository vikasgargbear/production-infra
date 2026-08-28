"""Canonical database reconciliation after action execution."""

from __future__ import annotations

from dataclasses import dataclass
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
    "finance.customer_cheque_clearance": (
        "finance.payments", "finance.accounting_events", "payment_id",
    ),
    "finance.customer_cheque_bounce": (
        "finance.payments", "finance.accounting_events", "payment_id",
    ),
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
    "sales.return.reversal": (
        "finance.adjustment_notes", "finance.adjustment_note_lines", "adjustment_note_id",
    ),
    "procurement.purchase_return.reversal": (
        "finance.adjustment_notes", "finance.adjustment_note_lines", "adjustment_note_id",
    ),
    "finance.adjustment_note.reversal": (
        "finance.adjustment_notes", "finance.adjustment_note_lines", "adjustment_note_id",
    ),
    "finance.bank_reconciliation": (
        "finance.reconciliation_matches",
        "finance.bank_statement_lines",
        "bank_statement_line_id",
    ),
    "finance.expense_claim": (
        "finance.expense_claims",
        "finance.expense_claim_lines",
        "expense_claim_id",
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


@dataclass(frozen=True)
class HeaderOwnedDetailRelation:
    """A reviewed link where the posted header points at an existing detail row."""

    header_foreign_key: str
    detail_primary_key: str


HEADER_OWNED_DETAIL_RELATIONS = {
    # A bank-reconciliation command returns finance.reconciliation_matches.id.
    # The matched statement line is not a child carrying that match UUID: the
    # reconciliation match owns bank_statement_line_id, which references the
    # existing finance.bank_statement_lines.id row.
    "finance.bank_reconciliation": HeaderOwnedDetailRelation(
        header_foreign_key="bank_statement_line_id",
        detail_primary_key="id",
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
    "finance.adjustment_note",
}
RETURN_OPERATIONS = {"sales.return", "procurement.purchase_return"}
PAYMENT_OPERATIONS = {
    "finance.customer_receipt",
    "finance.supplier_payment",
    "finance.supplier_advance",
}
STOCK_EFFECT_OPERATIONS = {
    "sales.dispatch",
    "sales.invoice",
    "sales.return",
    "procurement.goods_receipt",
    "procurement.purchase_return",
    "inventory.transfer",
    "inventory.adjustment",
    "inventory.destruction",
}
JOURNAL_EFFECT_OPERATIONS = {
    "sales.dispatch",
    "sales.invoice",
    "sales.return",
    "procurement.supplier_invoice",
    "procurement.purchase_return",
    "finance.customer_receipt",
    "finance.customer_cheque_clearance",
    "finance.customer_cheque_bounce",
    "finance.supplier_payment",
    "finance.supplier_advance",
    "finance.adjustment_note",
    "sales.return.reversal",
    "procurement.purchase_return.reversal",
    "finance.adjustment_note.reversal",
    "finance.expense_claim",
    "inventory.adjustment",
    "inventory.destruction",
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

    def _load_resource_rows(
        self,
        operation: str,
        resource_id: str,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        header_table, detail_table, detail_link = RESOURCE_TABLES[operation]
        header = self.query(
            f"SELECT * FROM {_qualified(header_table)} WHERE org_id = %s::uuid AND id = %s::uuid",
            (self.org_id, resource_id),
        )
        if len(header) != 1:
            return header, []

        header_owned = HEADER_OWNED_DETAIL_RELATIONS.get(operation)
        if header_owned is None:
            detail_value = resource_id
            detail_column = detail_link
        else:
            detail_value = header[0].get(header_owned.header_foreign_key)
            if detail_value is None:
                raise AssertionError(
                    f"{operation} header omitted reviewed relation "
                    f"{header_owned.header_foreign_key}"
                )
            detail_column = header_owned.detail_primary_key

        details = self.query(
            f"SELECT * FROM {_qualified(detail_table)} WHERE org_id = %s::uuid AND {_qualified(detail_column)} = %s::uuid ORDER BY id",
            (self.org_id, detail_value),
        )
        return header, details

    def reconcile(
        self,
        command_request_id: str,
        operation: str,
        resource_id: str,
        preview: dict[str, Any],
        prepare_request: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if operation not in RESOURCE_TABLES:
            raise AssertionError(f"operation has no reconciliation owner: {operation}")
        command = self.query(
            """
            SELECT status,result_resource_id,preview_hash
              FROM erp_automation_reads.command_authority_context(
                   %s::uuid,%s::uuid
              )
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

        header, lines = self._load_resource_rows(operation, resource_id)
        assert len(header) == 1
        customer_advance_receipt = (
            operation == "finance.customer_receipt"
            and header[0].get("payment_purpose") == "customer_advance"
        )
        if customer_advance_receipt and not lines:
            lines = self.query(
                """
                SELECT item.*
                  FROM finance.accounting_events event
                  JOIN finance.open_items item
                    ON item.org_id=event.org_id
                   AND item.accounting_event_id=event.id
                 WHERE event.org_id=%s::uuid AND event.payment_id=%s::uuid
                   AND item.item_side='payable'
                 ORDER BY item.id
                """,
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
            WITH related_inventory AS (
                SELECT id
                  FROM inventory.inventory_documents
                 WHERE org_id=%s::uuid
                   AND (id=%s::uuid OR sales_dispatch_id=%s::uuid
                        OR sales_invoice_id=%s::uuid OR sales_return_id=%s::uuid
                        OR goods_receipt_id=%s::uuid OR supplier_invoice_id=%s::uuid
                        OR purchase_return_id=%s::uuid OR destruction_id=%s::uuid)
            ), related_adjustments AS (
                SELECT id
                  FROM finance.adjustment_notes
                 WHERE org_id=%s::uuid
                   AND (sales_return_id=%s::uuid OR purchase_return_id=%s::uuid)
            ), entries AS (
                SELECT DISTINCT je.id,je.transaction_debit_total,
                       je.transaction_credit_total,je.functional_debit_total,
                       je.functional_credit_total
                  FROM finance.accounting_events ae
                  JOIN finance.journal_entries je
                    ON je.org_id=ae.org_id AND je.id=ae.journal_entry_id
                 WHERE ae.org_id=%s::uuid
                   AND (ae.sales_invoice_id=%s::uuid OR ae.supplier_invoice_id=%s::uuid
                        OR ae.payment_id=%s::uuid
                        OR ae.inventory_document_id IN (SELECT id FROM related_inventory)
                        OR ae.expense_claim_id=%s::uuid
                        OR ae.adjustment_note_id=%s::uuid
                        OR ae.adjustment_note_id IN (SELECT id FROM related_adjustments))
            ), line_totals AS (
                SELECT count(line.id)::integer AS line_count,
                       COALESCE(sum(line.transaction_debit),0) AS line_debit_total,
                       COALESCE(sum(line.transaction_credit),0) AS line_credit_total,
                       COALESCE(sum(line.functional_debit),0) AS line_functional_debit_total,
                       COALESCE(sum(line.functional_credit),0) AS line_functional_credit_total
                  FROM entries
                  JOIN finance.journal_lines line ON line.org_id=%s::uuid
                   AND line.journal_entry_id=entries.id
            )
            SELECT (SELECT count(*)::integer FROM entries) AS entry_count,
                   (SELECT COALESCE(sum(transaction_debit_total),0) FROM entries)
                     AS debit_total,
                   (SELECT COALESCE(sum(transaction_credit_total),0) FROM entries)
                     AS credit_total,
                   (SELECT COALESCE(sum(functional_debit_total),0) FROM entries)
                     AS functional_debit_total,
                   (SELECT COALESCE(sum(functional_credit_total),0) FROM entries)
                     AS functional_credit_total,
                   line_totals.line_count,line_totals.line_debit_total,
                   line_totals.line_credit_total,line_totals.line_functional_debit_total,
                   line_totals.line_functional_credit_total
              FROM line_totals
            """,
            (self.org_id,)
            + (resource_id,) * 8
            + (self.org_id, resource_id, resource_id, self.org_id)
            + (resource_id,) * 5
            + (self.org_id,),
        )[0]
        if operation in JOURNAL_EFFECT_OPERATIONS:
            assert journal["entry_count"] > 0, f"{operation} posted without accounting evidence"
            assert journal["line_count"] > 0, f"{operation} posted without journal lines"
        if journal["entry_count"]:
            assert journal["debit_total"] == journal["credit_total"]
            assert journal["functional_debit_total"] == journal["functional_credit_total"]
            assert journal["line_debit_total"] == journal["debit_total"]
            assert journal["line_credit_total"] == journal["credit_total"]
            assert journal["line_functional_debit_total"] == journal["functional_debit_total"]
            assert journal["line_functional_credit_total"] == journal["functional_credit_total"]

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
        if operation in STOCK_EFFECT_OPERATIONS:
            assert stock["entry_count"] > 0, f"{operation} posted without stock-ledger evidence"
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
                       destruction.physical_destruction_confirmed_at,
                       destruction.itc_treatment,
                       reversal.registration_id,reversal.return_period_id,
                       reversal.gstr3b_return_id,reversal.rule_version_id,
                       reversal.evidence_attachment_id AS reversal_evidence_attachment_id,
                       reversal.cgst_amount,reversal.sgst_amount,
                       reversal.igst_amount,reversal.cess_amount,
                       reversal.status AS reversal_status,
                       applications.application_count,
                       applications.applied_quantity,
                       applications.applied_cgst_amount,
                       applications.applied_sgst_amount,
                       applications.applied_igst_amount,
                       applications.applied_cess_amount,
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
                  JOIN tax.input_credit_reversal_events reversal
                    ON reversal.org_id=destruction.org_id
                   AND reversal.destruction_id=destruction.id
                   AND reversal.journal_entry_id=journal.id
                  JOIN LATERAL (
                    SELECT count(*)::integer AS application_count,
                           sum(application.applied_base_quantity) AS applied_quantity,
                           sum(application.applied_cgst_amount) AS applied_cgst_amount,
                           sum(application.applied_sgst_amount) AS applied_sgst_amount,
                           sum(application.applied_igst_amount) AS applied_igst_amount,
                           sum(application.applied_cess_amount) AS applied_cess_amount
                      FROM tax.input_credit_applications application
                     WHERE application.org_id=reversal.org_id
                       AND application.reversal_event_id=reversal.id
                       AND application.destruction_id=destruction.id
                       AND application.application_kind='destruction_reversal'
                       AND application.application_direction='consume'
                       AND application.status='posted'
                  ) applications ON applications.application_count>0
                 WHERE destruction.org_id=%s::uuid AND destruction.id=%s::uuid
                   AND destruction.status='posted' AND document.status='posted'
                 GROUP BY destruction.created_by_membership_id,
                          destruction.approved_by_membership_id,
                          destruction.posted_by_membership_id,
                          destruction.method_code,
                          destruction.certificate_attachment_id,
                          destruction.physical_destruction_confirmed_at,
                          destruction.itc_treatment,
                          reversal.registration_id,reversal.return_period_id,
                          reversal.gstr3b_return_id,reversal.rule_version_id,
                          reversal.evidence_attachment_id,reversal.cgst_amount,
                          reversal.sgst_amount,reversal.igst_amount,reversal.cess_amount,
                          reversal.status,applications.application_count,
                          applications.applied_quantity,applications.applied_cgst_amount,
                          applications.applied_sgst_amount,applications.applied_igst_amount,
                          applications.applied_cess_amount,
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
            assert destruction["physical_destruction_confirmed_at"] is not None
            assert destruction["itc_treatment"] == "section_17_5_h_reversal"
            assert destruction["reversal_evidence_attachment_id"] is not None
            assert destruction["registration_id"] is not None
            assert destruction["return_period_id"] is not None
            assert destruction["gstr3b_return_id"] is not None
            assert destruction["rule_version_id"] is not None
            assert destruction["reversal_status"] == "posted"
            assert destruction["line_quantity"] == destruction[
                "total_abs_base_quantity"
            ] == destruction["ledger_quantity"]
            assert destruction["line_value"] == destruction["total_value"] == destruction[
                "ledger_value"
            ]
            assert destruction["nonzero_balance_count"] == 0
            assert destruction["journal_status"] == "posted"
            assert destruction["applied_quantity"] == destruction["total_abs_base_quantity"]
            for component in ("cgst", "sgst", "igst", "cess"):
                assert destruction[f"applied_{component}_amount"] == destruction[
                    f"{component}_amount"
                ]
            reversal_total = sum(
                destruction[f"{component}_amount"]
                for component in ("cgst", "sgst", "igst", "cess")
            )
            assert reversal_total > 0
            assert destruction["transaction_debit_total"] == (
                destruction["total_value"] + reversal_total
            ) == destruction["transaction_credit_total"]

        expense_evidence: list[dict[str, Any]] = []
        if operation == "finance.expense_claim":
            expense_evidence = self.query(
                """
                SELECT claim.claimant_membership_id,claim.approved_by_membership_id,
                       claim.claimed_amount,claim.approved_amount,claim.status,
                       count(*)::integer AS line_count,
                       sum(line.claimed_amount) AS line_claimed_amount,
                       sum(line.approved_amount) AS line_approved_amount,
                       count(*) FILTER (WHERE receipt.status NOT IN ('verified','retained')
                         OR receipt.evidence_kind<>'expense_receipt'
                         OR receipt.sha256 IS NULL)::integer AS invalid_receipt_count,
                       journal.status AS journal_status,journal.transaction_debit_total,
                       journal.transaction_credit_total
                  FROM finance.expense_claims claim
                  JOIN finance.expense_claim_lines line
                    ON line.org_id=claim.org_id AND line.expense_claim_id=claim.id
                  JOIN core.attachments receipt
                    ON receipt.org_id=line.org_id AND receipt.id=line.receipt_attachment_id
                  JOIN finance.accounting_events event
                    ON event.org_id=claim.org_id AND event.expense_claim_id=claim.id
                   AND event.event_type='expense_claim'
                  JOIN finance.journal_entries journal
                    ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id
                 WHERE claim.org_id=%s::uuid AND claim.id=%s::uuid
                 GROUP BY claim.claimant_membership_id,claim.approved_by_membership_id,
                          claim.claimed_amount,claim.approved_amount,claim.status,
                          journal.status,journal.transaction_debit_total,
                          journal.transaction_credit_total
                """,
                (self.org_id, resource_id),
            )
            assert len(expense_evidence) == 1
            expense = expense_evidence[0]
            assert expense["status"] == "posted"
            assert expense["approved_by_membership_id"] != expense[
                "claimant_membership_id"
            ]
            assert expense["invalid_receipt_count"] == 0
            assert expense["claimed_amount"] == expense["approved_amount"]
            assert expense["line_claimed_amount"] == expense["claimed_amount"]
            assert expense["line_approved_amount"] == expense["approved_amount"]
            assert expense["journal_status"] == "posted"
            assert expense["transaction_debit_total"] == expense[
                "approved_amount"
            ] == expense["transaction_credit_total"]

            if prepare_request is None:
                raise AssertionError("expense claim reconciliation requires its exact prepare request")
            expected_lines = prepare_request.get("lines")
            assert isinstance(expected_lines, list) and expected_lines
            persisted_lines = self.query(
                """
                SELECT line.expense_account_id::text, line.receipt_attachment_id::text,
                       line.claimed_amount, line.approved_amount,
                       receipt.sha256, receipt.status, receipt.evidence_kind
                  FROM finance.expense_claim_lines line
                  JOIN core.attachments receipt
                    ON receipt.org_id=line.org_id AND receipt.id=line.receipt_attachment_id
                 WHERE line.org_id=%s::uuid AND line.expense_claim_id=%s::uuid
                 ORDER BY line.line_number,line.id
                """,
                (self.org_id, resource_id),
            )
            assert len(persisted_lines) == len(expected_lines)
            for persisted, expected in zip(persisted_lines, expected_lines):
                assert persisted["expense_account_id"] == str(expected["expense_account_id"])
                assert persisted["receipt_attachment_id"] == str(expected["receipt_attachment_id"])
                assert persisted["claimed_amount"] == Decimal(str(expected["claimed_amount"]))
                assert persisted["approved_amount"] == persisted["claimed_amount"]
                assert len(bytes(persisted["sha256"])) == 32
                assert persisted["status"] in {"verified", "retained"}
                assert persisted["evidence_kind"] == "expense_receipt"
            journal_accounts = self.query(
                """
                SELECT line.account_id::text,line.transaction_debit,line.transaction_credit
                  FROM finance.accounting_events event
                  JOIN finance.journal_lines line
                    ON line.org_id=event.org_id AND line.journal_entry_id=event.journal_entry_id
                 WHERE event.org_id=%s::uuid AND event.expense_claim_id=%s::uuid
                 ORDER BY line.line_number,line.id
                """,
                (self.org_id, resource_id),
            )
            reimbursement_account_id = str(prepare_request["reimbursement_account_id"])
            reimbursement_lines = [
                row for row in journal_accounts
                if row["account_id"] == reimbursement_account_id
            ]
            assert len(reimbursement_lines) == 1
            assert reimbursement_lines[0]["transaction_credit"] == expense["approved_amount"]
            for expected in expected_lines:
                expense_account_id = str(expected["expense_account_id"])
                amount = Decimal(str(expected["claimed_amount"]))
                matching = [
                    row for row in journal_accounts
                    if row["account_id"] == expense_account_id
                    and row["transaction_debit"] == amount
                ]
                assert len(matching) == 1

        bank_reconciliation_evidence: list[dict[str, Any]] = []
        if operation == "finance.bank_reconciliation":
            if prepare_request is None:
                raise AssertionError("bank reconciliation requires its exact prepare request")
            bank_reconciliation_evidence = self.query(
                """
                SELECT match.bank_statement_line_id::text,match.journal_entry_id::text,
                       match.matched_amount,match.currency_code,match.match_method,match.status,
                       statement.amount AS statement_amount,
                       journal.status AS journal_status,
                       journal.transaction_debit_total,journal.transaction_credit_total,
                       journal.functional_debit_total,journal.functional_credit_total
                  FROM finance.reconciliation_matches match
                  JOIN finance.bank_statement_lines statement
                    ON statement.org_id=match.org_id
                   AND statement.id=match.bank_statement_line_id
                  JOIN finance.journal_entries journal
                    ON journal.org_id=match.org_id AND journal.id=match.journal_entry_id
                 WHERE match.org_id=%s::uuid AND match.id=%s::uuid
                """,
                (self.org_id, resource_id),
            )
            assert len(bank_reconciliation_evidence) == 1
            match = bank_reconciliation_evidence[0]
            assert match["bank_statement_line_id"] == str(
                prepare_request["bank_statement_line_id"]
            )
            assert match["journal_entry_id"] == str(prepare_request["journal_entry_id"])
            assert match["match_method"] == prepare_request["match_method"]
            assert match["status"] == "matched"
            assert match["matched_amount"] == match["statement_amount"]
            assert match["journal_status"] == "posted"
            assert match["transaction_debit_total"] == match["transaction_credit_total"]
            assert match["functional_debit_total"] == match["functional_credit_total"]

        adjustment_evidence: list[dict[str, Any]] = []
        if operation == "finance.adjustment_note":
            if prepare_request is None:
                raise AssertionError("adjustment-note reconciliation requires its exact prepare request")
            adjustment_evidence = self.query(
                """
                SELECT note.side,note.direction,note.status,
                       note.sales_invoice_id::text,note.supplier_invoice_id::text,
                       note.adjusts_open_item_id::text,note.counterparty_payable_amount,
                       note.net_value_amount,note.cgst_amount,note.sgst_amount,
                       note.igst_amount,note.cess_amount,
                       event.journal_entry_id::text,journal.status AS journal_status,
                       journal.transaction_debit_total,journal.transaction_credit_total,
                       count(DISTINCT allocation.id)::integer AS allocation_count,
                       coalesce(sum(DISTINCT allocation.amount),0) AS allocated_amount,
                       count(DISTINCT tax_document.id)::integer AS tax_document_count
                  FROM finance.adjustment_notes note
                  JOIN finance.accounting_events event
                    ON event.org_id=note.org_id AND event.adjustment_note_id=note.id
                   AND event.event_type='adjustment_note'
                  JOIN finance.journal_entries journal
                    ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id
                  LEFT JOIN finance.allocations allocation
                    ON allocation.org_id=note.org_id
                   AND allocation.adjustment_note_id=note.id
                   AND allocation.status='posted'
                  LEFT JOIN tax.documents tax_document
                    ON tax_document.org_id=note.org_id
                   AND tax_document.adjustment_note_id=note.id
                 WHERE note.org_id=%s::uuid AND note.id=%s::uuid
                 GROUP BY note.side,note.direction,note.status,note.sales_invoice_id,
                          note.supplier_invoice_id,note.adjusts_open_item_id,
                          note.counterparty_payable_amount,note.net_value_amount,
                          note.cgst_amount,note.sgst_amount,note.igst_amount,note.cess_amount,
                          event.journal_entry_id,journal.status,
                          journal.transaction_debit_total,journal.transaction_credit_total
                """,
                (self.org_id, resource_id),
            )
            assert len(adjustment_evidence) == 1
            note = adjustment_evidence[0]
            assert note["status"] == "posted"
            assert note["side"] == prepare_request["side"]
            assert note["direction"] == prepare_request["direction"]
            original_document_id = str(prepare_request["original_document_id"])
            if note["side"] == "sales":
                assert note["sales_invoice_id"] == original_document_id
                assert note["supplier_invoice_id"] is None
            else:
                assert note["supplier_invoice_id"] == original_document_id
                assert note["sales_invoice_id"] is None
            assert note["adjusts_open_item_id"] is not None
            assert note["journal_status"] == "posted"
            assert note["transaction_debit_total"] == note["transaction_credit_total"]
            assert note["allocation_count"] in {0, 1}
            assert note["allocated_amount"] <= note["counterparty_payable_amount"]
            assert note["tax_document_count"] == 1
            for field in (
                "counterparty_payable_amount", "net_value_amount", "cgst_amount",
                "sgst_amount", "igst_amount", "cess_amount",
            ):
                expected = _find(preview, field)
                if expected is not None:
                    assert note[field] == Decimal(str(expected)), field

        tax_documents = self.query(
            """
            SELECT td.*
              FROM tax.documents td
              LEFT JOIN finance.adjustment_notes note
                ON note.org_id = td.org_id AND note.id = td.adjustment_note_id
             WHERE td.org_id = %s::uuid
               AND (td.sales_invoice_id = %s::uuid OR td.supplier_invoice_id = %s::uuid
                    OR note.sales_return_id = %s::uuid OR note.purchase_return_id = %s::uuid
                    OR td.adjustment_note_id = %s::uuid)
            """,
            (self.org_id,) + (resource_id,) * 5,
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
        if operation in {"sales.invoice", "procurement.supplier_invoice"}:
            assert len(open_items) == 1, f"{operation} posted without one authoritative open item"
        sales_invoice_evidence: dict[str, Any] = {}
        if operation == "sales.invoice":
            coverage = self.query(
                """
                WITH product_lines AS (
                    SELECT id,base_billed_quantity,base_free_quantity
                      FROM sales.invoice_lines
                     WHERE org_id=%s::uuid AND invoice_id=%s::uuid
                       AND line_kind='product'
                ), direct AS (
                    SELECT sales_invoice_line_id,
                           count(*)::integer AS allocation_count,
                           sum(base_quantity) AS base_quantity
                      FROM inventory.inventory_document_lines
                     WHERE org_id=%s::uuid AND sales_invoice_line_id IN (
                         SELECT id FROM product_lines)
                     GROUP BY sales_invoice_line_id
                ), dispatched AS (
                    SELECT invoice_line_id,
                           count(*)::integer AS allocation_count,
                           sum(allocated_base_billed_quantity) AS base_billed_quantity,
                           sum(allocated_base_free_quantity) AS base_free_quantity
                      FROM sales.invoice_dispatch_allocations
                     WHERE org_id=%s::uuid AND invoice_line_id IN (
                         SELECT id FROM product_lines)
                     GROUP BY invoice_line_id
                )
                SELECT count(*)::integer AS product_line_count,
                       count(*) FILTER (WHERE direct.allocation_count>0)::integer
                         AS direct_line_count,
                       coalesce(sum(direct.allocation_count),0)::integer
                         AS direct_inventory_line_count,
                       count(*) FILTER (WHERE dispatched.allocation_count>0)::integer
                         AS dispatch_line_count,
                       count(*) FILTER (
                         WHERE (direct.allocation_count IS NULL) =
                               (dispatched.allocation_count IS NULL)
                       )::integer AS ownership_mismatch_count,
                       count(*) FILTER (
                         WHERE direct.allocation_count IS NOT NULL
                           AND direct.base_quantity IS DISTINCT FROM
                               product_lines.base_billed_quantity+
                               product_lines.base_free_quantity
                       )::integer AS direct_quantity_mismatch_count,
                       count(*) FILTER (
                         WHERE dispatched.allocation_count IS NOT NULL
                           AND (dispatched.base_billed_quantity IS DISTINCT FROM
                                  product_lines.base_billed_quantity
                             OR dispatched.base_free_quantity IS DISTINCT FROM
                                  product_lines.base_free_quantity)
                       )::integer AS dispatch_quantity_mismatch_count
                  FROM product_lines
                  LEFT JOIN direct ON direct.sales_invoice_line_id=product_lines.id
                  LEFT JOIN dispatched ON dispatched.invoice_line_id=product_lines.id
                """,
                (self.org_id, resource_id, self.org_id, self.org_id),
            )[0]
            assert coverage["product_line_count"] > 0
            assert coverage["ownership_mismatch_count"] == 0
            assert coverage["direct_quantity_mismatch_count"] == 0
            assert coverage["dispatch_quantity_mismatch_count"] == 0
            assert (
                coverage["direct_line_count"] + coverage["dispatch_line_count"]
                == coverage["product_line_count"]
            )

            direct_inventory = self.query(
                """
                SELECT document.id,document.document_type,document.status,
                       document.total_abs_base_quantity,document.total_value,
                       count(DISTINCT line.id)::integer AS line_count,
                       count(DISTINCT ledger.id)::integer AS ledger_count,
                       sum(line.base_quantity) AS line_base_quantity,
                       sum(line.extended_cost) AS line_value,
                       sum(-ledger.quantity_delta) AS ledger_base_quantity,
                       sum(-ledger.value_delta) AS ledger_value,
                       count(*) FILTER (
                         WHERE ledger.entry_kind<>'issue'
                            OR ledger.inventory_document_line_id<>line.id
                            OR ledger.location_id<>line.from_location_id
                            OR ledger.product_id<>line.product_id
                            OR ledger.batch_id<>line.batch_id
                       )::integer AS invalid_ledger_count
                  FROM inventory.inventory_documents document
                  JOIN inventory.inventory_document_lines line
                    ON line.org_id=document.org_id
                   AND line.inventory_document_id=document.id
                  JOIN inventory.stock_ledger_entries ledger
                    ON ledger.org_id=line.org_id
                   AND ledger.inventory_document_id=document.id
                   AND ledger.inventory_document_line_id=line.id
                 WHERE document.org_id=%s::uuid
                   AND document.sales_invoice_id=%s::uuid
                 GROUP BY document.id,document.document_type,document.status,
                          document.total_abs_base_quantity,document.total_value
                """,
                (self.org_id, resource_id),
            )
            if coverage["direct_line_count"]:
                assert len(direct_inventory) == 1
                inventory = direct_inventory[0]
                assert inventory["document_type"] == "sales_issue"
                assert inventory["status"] == "posted"
                assert inventory["line_count"] == coverage[
                    "direct_inventory_line_count"
                ]
                assert inventory["line_count"] == inventory["ledger_count"] > 0
                assert inventory["invalid_ledger_count"] == 0
                assert inventory["line_base_quantity"] == inventory[
                    "total_abs_base_quantity"
                ] == inventory["ledger_base_quantity"]
                assert inventory["line_value"] == inventory["total_value"] == inventory[
                    "ledger_value"
                ]
            else:
                assert direct_inventory == []

            accounting = self.query(
                """
                SELECT event.event_type,journal.status,
                       journal.transaction_debit_total,
                       journal.transaction_credit_total,
                       journal.functional_debit_total,
                       journal.functional_credit_total,
                       count(line.id)::integer AS line_count,
                       coalesce(sum(line.transaction_debit),0) AS line_debit_total,
                       coalesce(sum(line.transaction_credit),0) AS line_credit_total,
                       coalesce(sum(line.functional_debit),0) AS line_functional_debit_total,
                       coalesce(sum(line.functional_credit),0) AS line_functional_credit_total
                  FROM finance.accounting_events event
                  JOIN finance.journal_entries journal
                    ON journal.org_id=event.org_id
                   AND journal.id=event.journal_entry_id
                  JOIN finance.journal_lines line
                    ON line.org_id=journal.org_id
                   AND line.journal_entry_id=journal.id
                 WHERE event.org_id=%s::uuid
                   AND event.sales_invoice_id=%s::uuid
                 GROUP BY event.id,event.event_type,journal.id,journal.status,
                          journal.transaction_debit_total,
                          journal.transaction_credit_total,
                          journal.functional_debit_total,
                          journal.functional_credit_total
                """,
                (self.org_id, resource_id),
            )
            assert len(accounting) == 1
            invoice_accounting = accounting[0]
            assert invoice_accounting["event_type"] == "sales_invoice"
            assert invoice_accounting["status"] == "posted"
            assert invoice_accounting["line_count"] > 1
            assert invoice_accounting["line_debit_total"] == invoice_accounting[
                "transaction_debit_total"
            ] == invoice_accounting["line_credit_total"] == invoice_accounting[
                "transaction_credit_total"
            ]
            assert invoice_accounting[
                "line_functional_debit_total"
            ] == invoice_accounting["functional_debit_total"] == invoice_accounting[
                "line_functional_credit_total"
            ] == invoice_accounting["functional_credit_total"]

            assert len(tax_documents) == 1
            tax_document = tax_documents[0]
            assert tax_document["document_class"] == "sales_invoice"
            assert tax_document["direction"] == "outward"
            assert tax_document["document_effect"] == "original"
            for invoice_field, tax_field in (
                ("net_value_total", "net_value_amount"),
                ("gst_taxable_total", "gst_taxable_value"),
                ("cgst_total", "cgst_amount"),
                ("sgst_total", "sgst_amount"),
                ("igst_total", "igst_amount"),
                ("cess_total", "cess_amount"),
                ("rounding_adjustment", "rounding_adjustment"),
                ("grand_total", "counterparty_payable_amount"),
            ):
                assert Decimal(str(tax_document[tax_field])) == Decimal(
                    str(header[0][invoice_field])
                )

            assert len(open_items) == 1
            open_item = open_items[0]
            assert open_item["item_side"] == "receivable"
            assert open_item["status"] == "open"
            assert open_item["document_number"] == header[0]["invoice_number"]
            assert open_item["currency_code"] == header[0]["currency_code"]
            assert Decimal(str(open_item["principal_amount"])) == Decimal(
                str(header[0]["grand_total"])
            )
            assert Decimal(str(open_item["functional_principal_amount"])) == Decimal(
                str(header[0]["grand_total"])
            )
            sales_invoice_evidence = {
                "fulfillment_coverage": coverage,
                "direct_inventory": direct_inventory,
                "accounting": accounting,
                "tax_document": tax_document,
                "open_item": open_item,
            }
        allocations = []
        if operation in PAYMENT_OPERATIONS:
            allocations = self.query(
                """
                SELECT * FROM finance.allocations
                 WHERE org_id = %s::uuid AND payment_id = %s::uuid AND status = 'posted'
                """,
                (self.org_id, resource_id),
            )
            if operation != "finance.supplier_advance" and not customer_advance_receipt:
                assert allocations, "settlement payment posted without typed allocations"
                assert sum(
                    (Decimal(str(row["amount"])) for row in allocations), Decimal("0")
                ) == Decimal(str(header[0]["amount"])), (
                    f"{operation} allocations do not reconcile to its payment amount"
                )
            if customer_advance_receipt:
                assert allocations == []
                assert len(lines) == 1
                assert lines[0]["item_side"] == "payable"
                assert lines[0]["status"] in {"open", "settled"}
                assert Decimal(str(lines[0]["principal_amount"])) == Decimal(
                    str(header[0]["amount"])
                )

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
            "expense_evidence": expense_evidence,
            "bank_reconciliation_evidence": bank_reconciliation_evidence,
            "adjustment_evidence": adjustment_evidence,
            "tax_documents": tax_documents,
            "adjustment_notes": adjustment_notes,
            "open_items": open_items,
            "sales_invoice_evidence": sales_invoice_evidence,
            "allocations": allocations,
            "withholdings": withholdings,
        }
