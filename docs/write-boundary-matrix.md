# ERP web write-boundary matrix

Status date: 2026-08-25. This document describes the canonical web boundary on
`feat/canonical-erp-data-model`; it is not a record of the retired legacy UI.

## Authority rule

Business documents have one browser write authority:

1. `POST /api/web/actions/{operation}/prepare` validates business inputs and
   returns an immutable backend preview.
2. A visible review identifies the command, exact financial/tax/inventory
   impact, warnings, and required approval policy.
3. `POST /api/web/actions/commands/{id}/approve` records explicit intent.
4. `POST /api/web/actions/commands/{id}/execute` is idempotent and is the only
   posting boundary.
5. A canonical UUID detail projection must reconcile the executed resource,
   line values, tax, stock, open items, and journals before the UI reports
   success.

The resolver requires exactly one active reviewed ERP web grant. Zero grants
mean the environment is not provisioned; multiple grants are an authority
ambiguity. It must fail closed instead of selecting one arbitrarily.

## Core document flows

| Flow | Operation | Desktop UI | Authoritative readback | State |
|---|---|---|---|---|
| Sales order | `sales.order.prepare` | backend review → Approve & Post | canonical sales-order UUID detail | active |
| Delivery / challan | `sales.dispatch.prepare` | source selection → backend review → Approve & Post | dispatch, batch allocation, stock ledger and valuation | active |
| Sales invoice | `sales.invoice.prepare` | FEFO batch selection → exact review → Approve & Post | invoice, tax, open item, journal and inventory lineage | active |
| Sales return | `sales.return.prepare` | exact review → independent approval inbox → execute | return, credit note, tax, inventory and journal evidence | active; separate approver |
| Purchase order | `procurement.purchase_order.prepare` | backend review → Approve & Create PO | approved PO UUID detail and exact lines/totals | active |
| Goods receipt | `procurement.goods_receipt.prepare` | PO remaining quantities → physical batches → review → post | GRN, locations, stock ledger and valuation | active |
| Supplier invoice | `procurement.supplier_invoice.prepare` | GRN + parsed GSTR-2B evidence → review → post | receipt allocations, ITC, payable, journal; zero second stock movement | active when portal evidence matches |
| Purchase return | `procurement.purchase_return.prepare` | exact billed/free review → independent approval inbox → execute | return, debit note, tax, stock and journal evidence | active; separate approver |
| Customer receipt | `finance.customer_receipt.prepare` | FIFO/manual allocation → exact review → Approve & Post | payment, allocations, residual open items and balanced journal | active |
| Supplier payment | `finance.supplier_payment.prepare` | FIFO/manual allocation → attested review → post | payment, bank/settlement accounts, allocations and balanced journal | active |
| Supplier advance | `finance.supplier_advance.prepare` | no primary desktop entry yet | canonical command supports it | backend available; UI absent |
| Cycle-count adjustment | `inventory.adjustment.prepare` | exact count review → independent approval → execute | inventory document, stock ledger and valuation | active; separate approver |
| Stock transfer | `inventory.transfer.prepare` | explicit source/destination branches and locations → requested quantity → tied-earliest FEFO allocation → exact review → actor confirmation → execute once | posted transfer UUID, exact lines, paired `transfer_out`/`transfer_in` quantities and values | active; inter-branch only |
| Standalone customer credit | `finance.adjustment_note.prepare` (`side=sales`, `direction=credit`) | posted invoice/open balance → line quantities and reviewed GST rule → immutable preview → independent approval → requester execute | posted note, exact original lines, tax document when statutory, allocation/residual and balanced journal | active |
| Standalone supplier debit | `finance.adjustment_note.prepare` (`side=purchase`, `direction=debit`) | posted supplier invoice/open balance → line quantities and reviewed GST rule → immutable preview → independent approval → requester execute | posted note, exact original lines, tax document when statutory, allocation/residual and balanced journal | active |
| Bank reconciliation | `finance.bank_reconciliation.prepare` | canonical candidate projection → choose one imported statement line and one posted bank-ledger journal → exact review → independent approval → requester execute/recover | immutable full-amount match, statement lifecycle, unchanged posted journal, audit and outbox | active; statement import remains explicitly unavailable until a separate reviewed import command exists |
| Destruction | `inventory.destruction.prepare` | canonical eligibility/evidence projection → select one full stock balance and same-day verified certificate → exact review → independent approval → requester execute/recover | exact destruction certificate, stock ledger, remaining balance, valuation and balanced loss journal | active; certificate upload remains explicitly unavailable until a separate reviewed evidence-ingestion command exists |
| Expense claim | `finance.expense_claim.prepare` | branch/claimant context → verified unused receipts and exact INR accounts → immutable preview → independent approval → requester execute/recover | claim, receipt hashes, exact expense lines, accounting event and balanced journal | active; separate approver; unsupported GST ITC, withholding, FX, mileage/per diem, cash advance, reversal and partial approval fail closed |

The browser never retries `execute` after an ambiguous response. Once an
execution returns a resource UUID, recovery is GET-only against canonical
readback using the retained UUID and lifecycle identity.

Stock Transfer preserves the canonical inter-branch authority: the source and
destination branches must be distinct, the actor/session must be authorized
for both, and each location must belong to its explicitly selected branch.
Same-branch inter-location movement is a different capability and remains
unsupported. Eligibility returns only released, nonexpired, unrecalled stock in
the equally earliest-expiry FEFO tier; the operator chooses the requested
quantity and may adjust its split only among that tier. Posting locks and
rechecks source stock, then writes one inventory document with exactly balanced
`transfer_out` and `transfer_in` quantity/value evidence. Deployment must
provision an active `stock_transfer` document sequence for the source branch and
fiscal year. Missing sequence authority fails closed; neither migrations nor
runtime code silently create one.

## Deliberately unsupported writes

The following surfaces have no reviewed canonical command and therefore remain
disabled or reject before transport:

- direct journal authoring;
- notification rules, campaigns, reminder sending, SMS and email sending;
- direct collection-center payment recording;
- company logo, QR and profile mutations;
- branches, departments, employees and bank-account mutations;
- supplier/customer lifecycle edits and deletes;
- product category/type, stock-edit and batch-upload mutations;
- settings, feature flags, setup/seed and document-number reservation;
- compliance/drug-license and GSTR-2B mutation routes.

These are product gaps, not permission bypasses. A disabled CTA must explain
the missing command; it must not fall back to local storage, an offline queue,
or a legacy endpoint.

## Bounded canonical master authoring

These narrow master operations are intentionally owned directly by
`canonical_erp_reads` until they require a richer reviewed workflow:

| Method and path | Owner |
|---|---|
| `POST /api/products/` | canonical product draft creation |
| `PUT /api/products/{product_id}` | canonical product draft edit |
| `DELETE /api/products/{product_id}` | canonical draft-only deletion |
| `POST /api/customers/` | canonical customer account creation |
| `POST /api/suppliers/` | canonical supplier account creation |
| `POST /api/customers/{customer_id}/addresses/` | canonical UUID address creation |
| `PUT /api/customers/{customer_id}/addresses/{address_id}` | canonical UUID address edit |

Registration tests require exactly one owner for each path. The later legacy
master routers are mounted read-only and cannot shadow these handlers.

## Read-only and calculation utilities

Legacy routers are filtered when mounted: only GET/HEAD/OPTIONS survive. Every
effective POST/PUT/PATCH/DELETE is compared with an exact owner allowlist at
test time. Read handlers are separately audited for database, file and external
side effects.

The only browser POST utilities outside reviewed commands are non-persistent,
owner-pinned parsers and calculators:

- purchase invoice parse/validation;
- invoice, order, challan, purchase, return and note calculation previews;
- tax-entry and GST calculations.

Their decimal-bearing responses are JSON strings. A JSON number at an
authoritative numeric boundary is rejected by the active UI because it may
already have lost precision.

## External contact actions

Email, WhatsApp and telephone links are browser intents, not ERP persistence.
They require a valid destination and an explicit click. Automated acceptance
may inspect the encoded destination and content, but must not send a message or
place a call.

## Release evidence required

Before promotion, the deployed SHA must pass:

- full backend, frontend, TypeScript, lint, build and PostgreSQL/Alembic gates;
- authenticated desktop Playwright journeys with writes enabled in the
  disposable canonical organization;
- maker/checker Playwright for sales return, purchase return and cycle count;
- exact API and database reconciliation for UUIDs, decimals, tax, inventory,
  allocations, open items and balanced journals;
- live API, frontend and MCP deployment-SHA agreement;
- negative missing/invalid/duplicate/ambiguous tests with no fake success and
  no legacy/offline fallback.
