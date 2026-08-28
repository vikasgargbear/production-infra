# GST-registered inventory destruction authority gap

## Decision

`inventory.destruction.prepare` must remain unavailable for a GST-registered
organization. The current command correctly fails closed, but it cannot yet
calculate or post the Section 17(5)(h) input-tax-credit reversal required for
destroyed goods. A browser template must not be marked ready by using a second
non-GST organization or by relabelling the existing unregistered command.

## Authority that exists

- `procurement.goods_receipt_lines.batch_id` identifies the received batch.
- `procurement.supplier_invoice_receipt_allocations.goods_receipt_line_id`
  connects a billed receipt quantity to a supplier invoice line.
- `procurement.supplier_invoice_lines` snapshots the eligible CGST, SGST, IGST,
  cess, base quantities, and `itc_eligibility` at invoice posting.
- The destruction command already posts the full locked batch/location stock
  balance, inventory value, stock ledger, and balanced inventory-loss journal.
- The immutable command request and preview contain
  `physical_destruction_confirmed_at` and the verified certificate hash.

## Missing durable authority

1. There is no canonical input-credit lot or ledger that tracks the unconsumed
   CGST/SGST/IGST/cess attributable to the remaining quantity of a batch after
   sales, purchase returns, transfers, adjustments, and prior reversals.
   Acquisition joins alone cannot prove which part of a merged batch balance
   still carries eligible credit.
2. There is no immutable application relation from a destruction line to the
   exact input-credit source lots and component amounts it reverses.
3. There is no GST reversal event bound to the active registration, return
   period, Section 17(5)(h) rule release, and GSTR-3B reporting projection.
4. `compliance.destructions` does not persist the physical destruction
   timestamp, ITC treatment, reversal evidence, or component totals. The
   timestamp currently survives only in command bytes/preview bytes.
5. The command has no reviewed account binding for the ITC reversal expense
   and input CGST/SGST/IGST/cess credits, and its readback cannot reconcile
   those journal lines or the GST event.

## Bounded implementation plan

Reserve Alembic revision `20260825_0021` after `20260825_0020` and implement the
following as one reviewed database boundary:

1. Add immutable `tax.input_credit_lots` created by canonical supplier-invoice
   posting. Each lot must bind supplier invoice line, receipt allocation,
   goods-receipt line, batch, acquired base quantity, eligible component
   amounts, and remaining quantities/amounts.
2. Add immutable `tax.input_credit_applications` for consumption, purchase
   return, and Section 17 reversal events. Lock source lots and allocate exact
   residual quantities and tax components deterministically; fail on ambiguous
   or insufficient lineage.
3. Add a destruction GST reversal event bound to organization registration,
   return period, an effective reviewed Section 17(5)(h) rule version, and the
   destruction command. Publish it to the GSTR-3B reversal projection.
4. Extend `compliance.destructions` with the physical timestamp, explicit ITC
   treatment, separate verified reversal evidence, and exact CGST/SGST/IGST/
   cess reversal totals.
5. Extend the atomic execute function to post both balanced effects:
   inventory-loss debit/inventory-asset credit, and ITC-reversal expense debit/
   input-tax component credits. Any stock, tax, accounting, evidence, or outbox
   failure must roll back the whole command.
6. Extend context, preview, REST/MCP readback, and PostgreSQL reconciliation to
   prove source-lot quantities, tax components, registration/rule/period,
   physical evidence, zero remaining destroyed stock, balanced journals,
   immutable preview hash, replay, stale-source rejection, and cross-tenant
   denial.
7. Only then add a run-scoped GST demo certificate, quarantined stock lineage,
   deterministic compiler facts, and the desktop maker/checker template.

No legacy schema, offline state, hardcoded identifier, hardcoded amount, or
unregistered-organization bypass is an acceptable substitute for this lineage.
