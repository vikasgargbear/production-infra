# Canonical ERP Live23 variant closure

Live18 remains the production gate for the 18 distinct business operations.
This separate layer accounts for the five additional success scenarios already
advertised by the canonical scenario matrix. It must never be reported as a
23-scenario pass until all five rows in
`docs/testing/live23-ui-variant-readiness.json` are `ready` and executed by the
desktop UI against one exact deployed SHA.

Four variants are repository-template ready: inter-state sales invoice,
SEZ-with-IGST sales invoice, final sales return, and final purchase return. The
two invoice variants use run-derived synthetic customer/address/GST identities;
the authenticated document policy explicitly permits `with_igst` but continues
to reject `without_payment`. The return quantities are the exact residual of the reviewed source
quantity less the already posted partial return. They target the exact invoice
resource produced earlier in the same run and retain the normal prepare,
independent approval, requester execute, REST/MCP/database reconciliation
boundary. They are not duplicate retries of a prior command.

The extra customer master rows are provisioned only when the separate runner
sets `LIVE23_VARIANTS_REQUIRED=true`. Ordinary Live18 provisioning neither
requires nor creates them. The expanded runner must still verify the same exact
frontend/API/MCP SHA before enabling that flag.

One variant remains fail-closed. Commercial-only sales return has command and
database shapes, but the reviewed adjustment-rule dataset publishes only
statutory sales-return rules. The authenticated return context therefore cannot
offer a commercial-only reason/treatment pair. Adding a label or forcing the
enum in browser automation would fabricate tax policy. Once a reviewed active
`tax.gst_adjustment_rule_versions` row supplies that authority, the variant must
bind the exact `sales_invoice_inter` resource; no UUID, GST treatment, or tax
result may be hardcoded.

The two final-return variants must be inserted directly after their matching
partial return in a fresh expanded run. Appending them after all Live18 writes
could conflict with later adjustment-note ceilings, so an extra tail job is not
an acceptable certification design.
