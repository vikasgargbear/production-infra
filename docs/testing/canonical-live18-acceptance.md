# Canonical ERP live18 acceptance

This harness catalogs all 18 named desktop ERP operations without implementing
or repairing product behavior. The current release scope requires all 17
operations marked `ready` in
`docs/testing/live18-ui-template-readiness.json`; the checked-in matrix remains
`backend/tests/live_acceptance/operation_matrix.json`. A blocked or explicitly
deferred operation is never silently skipped or represented as passing
evidence. Moving it to
`ready` automatically makes its template, browser run, and reconciliation
mandatory.

Live18 certifies one UI-driven success scenario for each distinct operation;
it does not claim all 23 success variants named by the broader canonical
scenario matrix. The five additional tax/return variants, including their
current blockers, are tracked separately in
`docs/testing/live23-ui-variant-readiness.json` and
`docs/testing/canonical-live23-variants.md`. They cannot inherit a Live18 pass.

## Non-negotiable gate

A run is not live evidence unless all of the following are true:

1. The target is an explicitly configured disposable organization.
2. App and API metadata both expose the full `LIVE18_EXPECTED_DEPLOYED_SHA`.
3. The requester and reviewer are distinct authenticated users.
   Separate-approver operations also prove that the requester receives `403`
   when attempting to approve their own immutable preview.
4. Every business value and identity comes from the reviewed fixture or a
   canonical authenticated resolution read. No demo UUID, GST rate, amount,
   date, stock value, or fallback row is embedded in the harness.
5. Each operation completes desktop UI, REST prepare, immutable review,
   approval, execute, REST readback, MCP readback, and restricted PostgreSQL
   reconciliation. Missing authority fails the operation; it is never skipped
   and promoted to a pass.
6. Evidence retains command/resource UUIDs, preview hash, actor identities,
   HTTP request IDs, exact financial/tax/stock assertions, and a supported
   reversal or cleanup identifier where one exists. Each operation also
   produces two reviewed screenshot commitments as described below.

At the checked-in base, all 18 business operations map to 17 published canonical
prepare commands. Customer credit note and supplier debit note are two bounded
uses of `finance.adjustment_note.prepare`; expense claim is published through
`finance.expense_claim.prepare` and migration `0009`, but its release
certification is explicitly deferred under
`EXPENSE_EVIDENCE_STORAGE_DEFERRED`. The source contract remains intact for
future re-enable; neither the API nor UI may fall back when evidence storage is
disabled.

## Configuration

The harness never contains live credentials or fixture business values. Supply
them through the `LIVE18_*` environment described by
`backend/tests/live_acceptance/config.py`. `LIVE18_FIXTURE_PATH` is a reviewed,
untracked JSON file outside the repository with `fixture_schema` set to
`aasopharma.live18.fixture.v1`, exactly the registry-ready operation keys, and non-empty
`missing_required_steps`, `prepare_steps`, `approval_steps`, and `execute_steps`
arrays for each flow. Every missing-required phase must assert a visible error,
must not create a prepared command, and the valid phase must restart from an
application route so invalid form state cannot leak into the valid proof.
`approval_steps` and `execute_steps` must target the exact command created by
that operation using `{{command_request_id}}` in a field value or locator name;
selecting the first or latest pending row is forbidden. The only runtime
substitutions are `{{command_request_id}}`, `{{preview_hash}}`, and
`{{run_token}}`. Command identity and preview hash come only from the successful
canonical prepare response. The bounded run token is
`GITHUB_RUN_ID-GITHUB_RUN_ATTEMPT`; use it only to make external reference
numbers unique between retries. It must not replace reviewed canonical IDs,
amounts, quantities, tax facts, or event dates. Unknown, malformed, or
unavailable tokens fail fixture loading or execution.
Every non-test-ID selector is an exact accessible locator, and every action
must resolve exactly one element before it can run. Search results and dynamic
rows use canonical-ID test IDs rather than display-name substring matches.

### Privacy-safe screenshot boundary

Each successful operation captures exactly two viewport PNGs: one after its
visible missing-required validation and one after the UI visibly shows the
posted canonical resource UUID. Across the current 17-operation release scope
this is exactly 34 screenshots.
Capture is allowed only when `PHARMA_CANONICAL_LIVE_TARGET_KIND` is
`disposable_test`, `CANONICAL_STAGING_PROJECT_REF` is the exact reviewed
canonical staging project, and `LIVE18_PLAYWRIGHT_ARTIFACT_DIR` is an absolute
runner-temporary directory. A login/password form, sign-in screen, visibly
rendered test credential or token, foreign application origin, or path outside
that directory fails capture closed.

The PNGs remain runner-local with owner-only permissions under
`$LIVE18_PLAYWRIGHT_ARTIFACT_DIR/screenshots`; they are never uploaded. The
fixed-schema public manifest retains only each stage/filename, dimensions,
byte count, and SHA-256 commitment after re-reading and verifying the
runner-local file. Automatic Playwright screenshots, traces, videos, and HTML
reports remain disabled so an unexpected authenticated failure cannot create
an unreviewed rich artifact.

Expense-claim certification is outside the current release scope. Re-enabling
it additionally requires one externally reviewed
synthetic PDF receipt. Canonical staging materializes it only from the protected
`CANONICAL_DEMO_EXPENSE_RECEIPT_BASE64` secret and verifies the lowercase
`CANONICAL_DEMO_EXPENSE_RECEIPT_SHA256` secret before inserting its run-scoped
`core.attachments` identity. Missing bytes, PDF signature, size authority, or
hash fail with `CANONICAL_EXPENSE_RECEIPT_AUTHORITY_MISSING`/`INVALID`; the
provisioner never generates or relabels another document as expense evidence.

Actor-confirmation screens that expose one reviewed approval-and-execute CTA
must declare `lifecycle_mode` as `combined_actor_confirmation`; the harness
proves that no approval occurred before that CTA and then captures exactly one
approval and one execution for the reviewed command. Other screens declare
`split`. The first checked-in operation template is stock transfer. Its compact
reviewed scalar pack entries are `stock_transfer_quantity` (an exact positive
six-place quantity within the server-returned FEFO tier) and
`stock_transfer_distance_km` (an exact positive two-place distance). Branch,
location, product, UOM, business date, transport mode, and eligible batch facts
remain canonical runtime facts and are forbidden in the scalar secret.
The base sales chain runs in its business order: sales order, delivery challan,
then sales invoice. Sales order reviews `sales_order_quantity`,
`sales_order_rate`, `sales_invoice_discount_percent`,
`sales_invoice_free_quantity`, `sales_invoice_free_supply_tax_treatment`, and
`sales_order_delivery_offset_days`. The reviewed order quantity and rate must
equal the downstream invoice scalar authority; the compiler fails closed on
any mismatch. The compiler combines the bounded
1–30-day offset with the canonical organization business date; no calendar
date is accepted from the secret. Customer, default canonical delivery-address
identity/row version, product, FEFO batch, GST, and document policy are resolved
by the authenticated UI and APIs.
Delivery challan reviews only `delivery_challan_distance_km`. It selects the
exact certified sales-order UUID produced earlier in the run; customer, lines,
batch allocations, address, dispatch date, and the allowed default transport
mode are authoritative API or server-policy facts. A transporter is neither
requested nor invented when that policy mode does not require one.
Sales invoice imports the exact completed delivery-challan UUID produced by the
preceding operation, then selects the compiler-proven delivery-address UUID and
row version. Customer, line pricing, billed/free split, tax treatment, batch,
inventory document, and dispatch-line identities come from that authoritative
import detail; the invoice performs no second stock issue.
`sales_invoice_distance_km` remains reviewed only for the separate direct-issue
Live23 invoice variants. Downstream customer receipt, sales return, and customer
credit note all consume this same captured dispatch-allocated invoice UUID.
Purchase order reviews its quantity, rate, line discount, free quantity,
document discount, freight charge, and a bounded delivery offset. Its supplier,
product/UOM, branch, business date, GST facts, and immutable preview remain
canonical API authority.
Supplier advance reviews `supplier_advance_amount`,
`supplier_advance_method`, `supplier_advance_approval_attestation`, and
`supplier_advance_execution_attestation`. The supplier, bank, business date,
exact purchase-order UUID, and its sole eligible product-line UUID remain
canonical runtime authority. The purchase order runs before its advance and
before goods receipt so the context can prove it is still approved; ambiguous
multi-line selection fails closed instead of selecting an arbitrary line.
Goods receipt reviews physical quantities, MRP, QC disposition, and a bounded
`goods_receipt_expiry_offset_days` between 30 and 3650 for the disposable test
batch. Its batch reference is run-token-derived; receipt time comes from the
organization-local database clock, while the exact prior PO, MRP conversion,
and eligible destination are canonical identities. The template is strict-mode
safe only for the single-line PO created by this run and fails on ambiguity.
Purchase return reviews billed/free quantities, effective reason label, GST
treatment label, transport-mode label, and distance. It targets the exact
supplier-invoice UUID posted earlier, then accepts only its canonical
invoice-to-GRN allocation, batch and stock-location context. A sole verified
supplier destination is selected automatically; zero or multiple destinations
remain blocked. Independent reviewer approval and original-requester execution
both target the captured command UUID.
Sales return reviews billed/free quantities, return condition, effective reason
label, and GST-treatment label. It selects the exact certified sales-invoice
UUID produced earlier, then uses only its dispatch allocation, batch, and
server-published quarantine locations. The return remains intentionally
dependent on the sales-invoice operation; no older invoice fallback is used.
Stock adjustment reviews only `stock_adjustment_gain_quantity`, expressed in
the exact canonical count UOM. The compiler resolves the requester membership,
the exact run-and-attempt-bound unused retained cycle-count evidence, eligible
released batch, UOM multiplier,
evidence verification instant, and pre-run base stock from canonical staging.
It derives one exactly representable physical count above that system stock.
Before compiling the later dispatch, the compiler proves that this exact batch's
ordered adjustment and direct-invoice effects leave enough stock for the exact
sales-order quantity. The UI independently reloads eligibility, visibly
reconciles that exact system balance, and requires a distinct reviewer before
requester execution.
The two metadata URLs, three HTTPS origins, exact deployed SHA,
two user credentials, and canonical organization/branch UUIDs are mandatory.
The browser runner rejects any fixture step targeting WhatsApp, email, SMS,
telephone, or call controls.

Posted facts are never silently reused or deleted. Evidence must retain every
resource UUID and the supported reversal/cleanup identifier (when the command
returns one); any retained test record is reported in the uploaded artifact.

Run the non-live contract gates with:

```bash
PYTHONPATH=backend python3 -m pytest -q backend/tests/live_acceptance
python3 backend/scripts/live_acceptance/verify_scope.py --base "$(git merge-base HEAD origin/feat/canonical-erp-data-model)"
```

Do not run live writes until the exact SHA is deployed and both metadata probes
agree. Do not send communications or delete posted facts; use only reviewed
reversal commands and report any retained test record IDs.
