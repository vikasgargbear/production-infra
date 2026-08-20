# Canonical Data Model for the Pharma ERP

Status: design decision draft; no live DDL is authorized by this document.

Source: read-only Supabase capture from `2026-08-19T14:37:28Z` and the backend
sales, purchase, inventory, finance, GST, compliance, auth, and MCP surfaces.
The companion file `canonical-data-model.json` is the exhaustive migration
inventory.

## Decision

Replace the 175 application-owned physical tables with exactly 110 canonical
physical tables for the India pharma wholesale core. The live database also contains eight application
views, one partitioned application relation, and 23 Supabase-managed Auth
tables. The Auth tables remain owned by Supabase and are outside this model.

One hundred and three is not an arbitrary database target. It follows a reviewed wholesale
scope and preserves typed evidence for finance, GST, inventory, compliance and
agent approvals. Payroll, loyalty, sales schemes, price lists, QC workflows and
regulatory inspections are deliberately outside this release and must be
unmounted from API/MCP/frontend surfaces. A physical bank account remains
separate from its linked GL account because payment credentials and accounting
classification have different security/lifecycles. The result is a 47%
reduction from 175 without a catch-all commercial document or accounting JSON.

| Domain | Tables | Why they stay separate |
|---|---:|---|
| Core | 15 | Tenant, authorization, reference-release provenance, attachments, numbering, idempotency, audit and delivery have different security/retention rules |
| Parties | 6 | One legal party may independently be a customer and supplier and may have many addresses, contacts and GST registrations |
| Catalog | 6 | Products, ingredients, units and conversions have independent cardinality |
| Inventory | 7 | Batch/location stock, typed operations, append-only ledger and reservations cannot be one mutable row |
| Sales | 9 | Order, dispatch, tax invoice, return and dispatch-to-invoice allocation lifecycles are distinct |
| Procurement | 10 | Order, typed goods advance allocation, receipt, supplier tax invoice, return and receipt-to-invoice allocation are independently auditable |
| Finance | 15 | Accounting event ownership, ledgers, bank credentials, open items, allocations, expenses and bank matching are distinct |
| Tax | 22 | Tax documents, withholding, regulated rules, fiscal evidence, exact basis, M:N challan deposits, immutable statement revisions and later M:N certificate artifacts, GST returns, reconciliation, IRN and e-way bill have distinct retention |
| Compliance | 6 | Licences, recall batches, temperature, controlled drugs and destruction are separately auditable |
| HR | 2 | Department and employee are retained for responsibility/actor context, without payroll |
| Automation | 4 | Agent consent/capabilities, proposed command and human approval have independent security/revocation lifecycles |
| Calculation | 1 | Immutable engine evidence binds exact canonical bytes and one-time posting consumption without replacing typed business rows |

The reduction is achieved by removing speculative analytics/configuration
subsystems, replacing stored summaries with projections, and choosing one owner
for settings, numbering, allocations, notes, GST imports and e-way bills. It is
not achieved by putting invoice lines, stock movements, tax facts or journal
lines into JSON.

## Canonical Inventory

The exact 110-table inventory is machine-readable in
`canonical-data-model.json`. The ownership boundaries are:

- **Core (15):** `organizations`, `branches`, `users`, `memberships`, `roles`,
  `permissions`, `role_permissions`, `access_grants`, `settings`,
  `document_sequences`, `idempotency_keys`, `audit_events`, `outbox_events`,
  `attachments`, `reference_data_releases`.
- **Parties (6):** `parties`, `customer_accounts`, `supplier_accounts`,
  `contacts`, `addresses`, `tax_registrations`.
- **Catalog (6):** `products`, `categories`, `units_of_measure`,
  `uom_conversions`, `ingredients`, `product_ingredients`.
- **Inventory (7):** `locations`, `batches`, `inventory_documents`,
  `inventory_document_lines`, `stock_ledger_entries`, `stock_balances`,
  `reservations`.
- **Sales (9):** `orders`, `order_lines`, `dispatches`, `dispatch_lines`,
  `invoices`, `invoice_lines`, `invoice_dispatch_allocations`, `returns`,
  `return_lines`.
- **Procurement (10):** `purchase_orders`, `purchase_order_lines`,
  `goods_receipts`, `goods_receipt_lines`, `supplier_invoices`,
  `supplier_invoice_lines`, `supplier_invoice_receipt_allocations`,
  `purchase_returns`, `purchase_return_lines`, `purchase_order_advance_allocations`.
- **Finance (15):** `accounts`, `bank_accounts`, `accounting_events`,
  `journal_entries`, `journal_lines`,
  `payments`, `open_items`, `allocations`, `adjustment_notes`,
  `adjustment_note_lines`, `expense_claims`, `expense_claim_lines`,
  `bank_statements`, `bank_statement_lines`, `reconciliation_matches`.
- **Tax (22):** `registrations`, `tax_code_versions`, `documents`, `withholdings`,
  `withholding_rule_versions`, `organization_fiscal_tax_facts`,
  `withholding_basis_lines`, `withholding_deposits`,
  `withholding_deposit_lines`, `withholding_statements`,
  `withholding_statement_lines`, `withholding_certificates`,
  `withholding_certificate_lines`,
  `return_periods`, `returns`, `return_documents`, `portal_documents`,
  `portal_document_lines`, `reconciliation_runs`, `reconciliation_items`,
  `eway_bills`, `einvoices`.
- **Compliance (6):** `licenses`, `recalls`, `recall_batches`,
  `temperature_readings`, `controlled_substance_entries`, `destructions`.
- **HR (2):** `departments`, `employees`.
- **Automation (4):** `agent_grants`, `agent_grant_capabilities`,
  `command_requests`, `command_approvals`.
- **Calculation (1):** `artifacts`.

`stock_balances` is the only synchronous stored projection in the core model.
It is rebuildable from `stock_ledger_entries` and must be reconciled after every
posting transaction. Dashboards, outstanding reports, cash forecasts, reorder
suggestions, vendor performance and GST liability are queries/materialized
views outside the canonical table count, never independent writable facts.

## Cardinality Model

### Core and authorization

- Organization **1:M** branch, membership, role, setting, document sequence,
  idempotency key, audit event and outbox event.
- Supabase `auth.users` **1:0..1** `core.users`. `core.users` is the global ERP
  profile keyed by its own UUID and has one nullable unique `auth_user_id`.
  Authentication credentials, providers, sessions and recovery remain only in
  Supabase Auth; the ERP never copies password hashes.
- User **M:N** organization through `memberships`, unique by
  `(org_id, user_id)`. Tenant status, employee link and default branch belong to
  the membership, not the global profile.
- `permissions` is a seeded, versioned code registry. Role **1:M**
  `role_permissions`; custom role-to-permission assignment is relational and
  tenant-owned with a real permission FK. JSON permissions are prohibited.
- Membership **M:N** role and branch through `access_grants`. Each grant has
  exactly one role and either one branch or organization-wide scope. Arrays of
  branch IDs and JSON permission overrides are prohibited.
- Document sequence **M:1** organization and optional branch. Its uniqueness is
  `(org_id, branch_id, document_type, fiscal_year)`.
- Attachment records object key, checksum, media type, size, uploader and
  retention class. A constrained `owner_type/owner_id` is the model's only
  polymorphic evidence link; a fixed security-definer validator verifies owner
  existence and tenant on insert. Attachments are immutable after linking and
  object deletion is retention-controlled. They never contain business fields.

### Parties

- Organization **1:M** party.
- Party **0:1** customer account and **0:1** supplier account. A party may have
  both roles; legal name, PAN and shared identity are not duplicated.
- Party **1:M** contact, address and tax registration. A GSTIN belongs to one
  party registration, not to every invoice address.
- Customer/supplier account owns commercial terms only. Outstanding amounts,
  lifetime sales, ratings and transaction counts are projections.

### Catalog and inventory

- Category **1:M** product. The initial model permits one operational category
  per product; introduce a join table only if multiple classification has a
  proven workflow.
- Product **1:M** UOM conversion; every conversion points **M:1** to a global
  UOM and converts to the product's base UOM. No free-text UOM is accepted on a
  posted line.
- Product **M:N** ingredient through `product_ingredients`. The join snapshots
  strength, numerator/denominator UOM and display order; composition is not an
  unconstrained product JSON document.
- Product master does not own a mutable selling price or GST percentage. Batch
  owns statutory MRP where applicable; order/invoice lines snapshot negotiated
  unit price and the effective tax-code version. Last-price and price-history
  suggestions are derived reads, not writable price-list tables.
- Branch **1:M** location; product **1:M** batch.
- Inventory document **1:M** line. A line produces **1:M** immutable stock
  ledger entries: one for a receipt/issue and two balanced entries for a
  transfer. The document type also owns count, adjustment and destruction
  operations; there are no parallel stock-count tables.
- Each stock-affecting business header has a typed nullable, unique
  `inventory_document_id` FK. Dispatch, direct invoice, goods receipt, sales
  return, purchase return and destruction therefore produce at most one stock
  effect. An invoice allocated to dispatch cannot also issue stock directly.
- Ledger entry **M:1** product, batch and location. `batch_id` is non-null on
  every ledger, balance and reservation row so a stock identity cannot duplicate
  through SQL NULL semantics. A batch-managed pharma product always uses its
  real manufacturer batch. A non-batch product gets exactly one protected
  `lot_kind = untracked` batch per `(org_id, product_id)`; only that synthetic
  lot may omit manufacture/expiry. All ledger quantities are in base UOM.
- Stock balance is unique by
  `(org_id, branch_id, location_id, product_id, batch_id)`. `on_hand_quantity`
  equals the sum of posted ledger entries only; reservations never change it.
  `available_quantity = on_hand_quantity - active_reserved_quantity` is a read
  model computed with reservation data. The projection is never patched by an
  API.
- Reservation **M:1** order line and **M:1** stock identity. One order line may
  be fulfilled by multiple batches and locations.

### Sales

- Customer account **1:M** sales order, dispatch, invoice and return.
- Each header **1:M** its lines. A line cannot be moved to another header.
- Order line **1:M** dispatch line and **1:M** invoice line. Partial fulfilment
  is represented by multiple child lines, not `challan_ids` arrays.
- Dispatch line references exactly one batch when the product is batch-managed.
  `invoice_dispatch_allocations` is the **M:N** join between invoice lines and
  dispatch lines and stores positive allocated base quantity. Allocation batch,
  product and UOM must agree, allocation sums cannot exceed either line, and an
  invoice line spanning batches is split so every line has one tax/batch
  snapshot. A direct invoice instead references one batch and owns its inventory
  document.
- Return line **M:1** original invoice line. Returnable quantity is a derived
  sum, not a mutable `quantity_returned` column on invoice/product/batch rows.

Sales and procurement headers are intentionally separate instead of one
`commerce.documents` table. Their shared shapes do not mean shared lifecycle:
dispatch and goods receipt own batch movement plus delivery/QC evidence;
supplier invoice owns ITC and portal matching; sales invoice owns IRN and place
of supply; each return has a different original-line ceiling. A generic table
would require many type-specific nullable columns, untyped JSON, or validation
only at posting time. That weakens foreign keys and allows invalid drafts to
persist. Reuse belongs in application calculation/command components, while
the database keeps typed headers and lines. Explicit original-line FKs provide
lineage without foreign-ID arrays or a polymorphic catch-all document table.

### Procurement

- Supplier account **1:M** purchase order, receipt, supplier invoice and return.
- Each procurement header **1:M** its lines.
- Purchase-order line **1:M** goods-receipt line. Partial receipts are separate
  receipt lines.
- `supplier_invoice_receipt_allocations` is the **M:N** join between supplier
  invoice lines and goods-receipt lines and stores positive allocated base
  quantity/value. Sums cannot exceed invoiced or accepted receipt quantities;
  product, batch and UOM conversion snapshots must agree. This replaces arrays
  of GRN IDs and supports one invoice across receipts and one receipt across
  invoices.
- Purchase-return line **M:1** goods-receipt line and, when invoiced, **M:1**
  supplier-invoice line.

Requisitions, quotations and budgets are not canonical v1 tables because the
current runtime has no completed, tested approval ownership for them. They can
return later only as a complete workflow with commands, authorization and
tests, not as dormant tables.

### Finance

- Account has a constrained **M:1** parent-account relationship within the same
  organization. Cycles are prohibited.
- Bank account **1:1** account for organization-owned cash/bank ledgers and may
  **M:1** party for a supplier/customer settlement destination. Encrypted bank
  details and payment configuration do not belong on the chart-of-accounts row.
- Journal entry **1:M** journal line; every posted entry has at least two lines
  and balances by currency.
- `accounting_events` is the typed, unique bridge from exactly one posted sales
  invoice, supplier invoice, adjustment note, payment, approved expense claim
  inventory valuation document or withholding to exactly one journal entry. Its explicit
  nullable FKs plus exactly-one checks prevent duplicate accounting and keep
  generic source IDs out of the journal.
- Accounting event **1:M** open item. Open items hold receivable/payable principal
  for one party and due date; they do not duplicate invoice totals.
- Payment **1:M** allocation; withholding **1:1** allocation; open item **1:M**
  allocation. Allocation has exactly one payment/withholding source and remains
  the only settlement-to-open-item fact.
- Adjustment note **1:M** line. Credit/debit direction and sales/purchase side
  are constrained attributes on one model, replacing four competing note
  owners.
- Bank statement **1:M** line. Reconciliation match is the **M:N** join between
  bank-statement lines and journal entries. Every payment has a journal entry,
  so a second polymorphic payment target is unnecessary.
- Expense claim **1:M** expense-claim line. Approval precedes exactly one posted
  journal entry/payment aggregate; rejected claims never create accounting
  facts. Expense category is an account FK, not a second category hierarchy.

### GST and compliance

- Organization **1:M** GST registration, normally one per state/business
  vertical; branch **M:1** registration.
- HSN/SAC code **1:M** effective version inside `tax_code_versions`. A product
  stores its HSN and the reviewed release used at activation, not a mutable
  current rate. Posting resolves the effective version by document date and
  snapshots code, supply type, rates, taxable value and component amounts.
  Later rule changes never rewrite it.
- Registration **1:M** return period; period **1:M** return, unique by return
  type and revision.
- Every posted sales invoice, supplier invoice, adjustment note or taxable
  advance has exactly one immutable `tax.documents` snapshot with a typed,
  unique source FK. It owns registration, document class, counterparty GSTIN,
  place/supply type, net value, GST taxable value, zero-rated payment mode,
  exact components, recipient liability, organization self-assessed amount,
  rounding adjustment, counterparty payable and ruleset version. Adjustment
  snapshots link the original and carry an explicit increase/decrease effect;
  line tax snapshots remain on the typed business lines.
- One `tax.withholdings` row records Income-tax TDS or GST TDS against one
  payable open item and one immutable `withholding_rule_versions` row imported
  from a reviewed reference-data release. `organization_fiscal_tax_facts`
  retains verified Indian-fiscal-year turnover, applicability and TAN evidence;
  `withholding_basis_lines` binds the deduction to exact supplier-invoice or
  expense-claim lines. Deposits and filed statements are independent M:N
  aggregates because one challan or quarterly statement may cover many
  deductions. Certificates arrive after filing and may cover multiple
  deductions, so they are separate append-only headers with M:N coverage lines.
  The governing Act/provision, earlier-credit/payment
  trigger, basis, rate, exact tax components, deadline and authority evidence
  are typed fields. A withholding creates one journal and one settlement
  allocation; corrections are compensating reversals.
- Return **M:N** tax document through `return_documents`. This makes the filed
  population explicit without linking filings to accounting journals.
- Portal document **1:M** portal-document line. Reconciliation run **1:M** item;
  each item references one internal tax document and/or one immutable portal
  line and records match evidence.
- E-invoice and e-way bill reference `tax.documents`, never sales/procurement
  tables directly. The tax document's typed source establishes invoice or
  dispatch identity; cancellation/regeneration is append-only with one active
  authority artifact per applicable document/version.
- Location **1:M** temperature reading. A reading may additionally reference a
  batch, but location is mandatory.
- Recall **M:N** batch through `recall_batches`. The join records quarantine,
  recovered and destroyed quantities for each affected batch.
- Controlled-substance entry **M:1** batch and **M:1** stock-ledger entry.
- Destruction **1:1** posted inventory document and records approval evidence;
  it never changes stock independently.
- A license references exactly one organization, branch, membership/employee,
  or party through explicit nullable FKs and an exactly-one constraint. License
  type is a bounded database CHECK, not a free string that claims a missing
  vocabulary table. The v1 codes cover wholesale Forms 20B/21B, Schedule X
  wholesale Form 20G, and state pharmacist registration. New types require a
  reviewed migration. Perpetual drug licences use a next-verification date
  rather than a fabricated expiry.

### HR

- Organization **1:M** department and employee; department **1:M** employee.
  Employee **0:1** user membership: most employees need not be login users and
  a login profile is not employment evidence.

### Agent consent and command approval

- Membership **1:M** agent grant; organization **1:M** agent grant. A grant identifies
  the OAuth/MCP client, optional branch boundary, capability codes, grantor,
  issued/expiry/revocation times and policy version. Agent grant **1:M**
  `agent_grant_capabilities`; each row references a real `core.permissions`
  code. Changing scope revokes and replaces the grant. Revocation does not
  delete evidence.
- Agent grant **1:M** command request. A request holds operation, canonical
  target URI, normalized request hash, preview hash, expected row version,
  expiry and state. Its immutable payload is audit evidence only; domain money
  and quantities still persist in typed domain tables after execution.
- Command request **1:M** approval. Approval records approver membership,
  decision, challenge/preview hash and timestamp. Policy determines whether one
  or more approvals are required. An expired, altered or revoked request cannot
  execute.
- Idempotency key **1:1** executed command request. Consent proves scope,
  approval proves human authorization and idempotency proves replay outcome;
  audit events do not substitute for any of those three lifecycles.
- Idempotency key **1:1** calculation artifact for calculation-bound trade
  commands. The artifact names exactly one typed sales or procurement aggregate,
  stores exact versioned input/output bytes, and transitions once from issued to
  consumed under the posting command's lock. It is evidence, not a second owner
  of order, invoice, return, tax, stock, payable, or journal facts.
- OAuth client registration, redirect URIs, client authentication and dynamic
  client registration remain owned by the configured authorization server
  (Supabase Auth), not duplicated in an ERP `agent_clients` table. Agent grants
  snapshot issuer and client ID but store no client secret. If the ERP later
  becomes the OAuth authorization server, that is a new reviewed owner.

## Feature Contract Boundary

- This release is the India pharma wholesale core. Expense claims and basic
  department/employee responsibility remain. Payroll attendance/leave/salary,
  loyalty, sales schemes/promotions, price lists/history, QC/inspection
  workflows, configurable analytics/report builders, purchase requisitions/
  quotations/budgets, field-sales route/visit/target management, competitor
  pricing, and generic workflow/scheduler/notification-inbox subsystems are
  deferred. Their old tables are not preserved. Any matching API route, MCP
  tool, navigation
  item or frontend mutation discovered before cutover must be removed/hidden or
  the feature must return to this model with typed tables and full test gates.
- Supabase owns Auth identities, sessions, OAuth clients and object blobs.
  `core.users`/memberships own ERP profiles and tenancy; `core.attachments` owns
  checksummed evidence metadata. Render/logging owns observability records.

## Canonical Types and Names

These conventions remove the live `integer`/`uuid`, actor and timestamp drift:

| Concept | Canonical representation |
|---|---|
| Tenant primary key | `(org_id uuid, id uuid)`; UUIDv7 preferred, `gen_random_uuid()` fallback |
| Global/root primary key | Single `id uuid`, or a controlled natural code for UOM/permission references |
| Tenant | `org_id uuid NOT NULL` on every tenant fact |
| Branch | `branch_id uuid`; nullable only when the fact is genuinely org-wide |
| Supabase identity | Nullable `auth_user_id uuid`; globally unique on `core.users`; organization access belongs to `core.memberships` |
| Actor | `created_by_membership_id`, `updated_by_membership_id`, `posted_by_membership_id`; composite FK with `org_id`; actor comes from auth context |
| Time | `timestamptz` in UTC; business date is a separate `date` |
| Quantity | `numeric(20,6)` in base UOM; strictly positive on lines; signed only in ledger |
| Rate/percent | `numeric(9,6)`; value between `0` and the rule-specific maximum |
| Calculation money | `numeric(20,4)`; never float |
| Posted currency amount | `numeric(20,2)` plus `currency_code char(3)`; INR by default |
| Human document number | Text, unique by tenant/branch/type/fiscal year; never a PK/FK |
| Version | `row_version bigint NOT NULL DEFAULT 1` for optimistic concurrency |
| Extension data | Bounded `metadata jsonb`; never money, quantity, tax, permission or foreign-ID arrays |

Use one name per concept: `*_id`, `*_number`, `*_date`, `status`, `subtotal`,
`discount_total`, `taxable_total`, `cgst_total`, `sgst_total`, `igst_total`,
`cess_total`, `charges_total`, `rounding_adjustment`, and `grand_total`. Retire
`final_amount` versus `invoice_total`, `item_id` versus `invoice_item_id`,
`created_by` of mixed types, and duplicated boolean/status combinations.

All externally addressable records use the same SQL UUID in the API/MCP URI;
the authenticated organization context completes a tenant resource identity.
Do not add a redundant `public_id`. The command handler should generate a
time-ordered UUIDv7 before the insert so the same ID can flow through
idempotency, audit and outbox data;
the database default `gen_random_uuid()` is only a fallback for trusted SQL
maintenance paths. UUIDv7 improves B-tree insertion locality and index page
utilization compared with random UUIDv4 at this workload. It also exposes a
coarse creation timestamp and can concentrate inserts on the rightmost index
pages, so IDs are not secrets and UUID order is never used as business
chronology; `created_at` plus an explicit tie-breaker remains authoritative.

Statuses are lower `snake_case` text with table-specific checks and one
authoritative transition map in backend code/OpenAPI. Do not create a global
status enum or dozens of database enum types. The common shape is:

```text
draft -> submitted -> approved -> posted
draft/submitted/approved -> cancelled
posted -> reversed (by a linked compensating document only)
```

Order/dispatch/return/tax lifecycles may add explicit states, but synonyms such
as `complete`, `completed`, `closed`, `finalized`, and `done` may not coexist in
one lifecycle. Master rows use one `status` (`active`, `inactive`, `blocked`)
instead of `is_active`, `is_deleted`, `blacklisted` and another status field.
Posted financial, tax, inventory and compliance facts are never soft-deleted.

## Non-Negotiable Invariants

### Tenant and reference integrity

- Every addressable tenant aggregate, event, or ledger fact has `PRIMARY KEY
  (org_id, id)`, not `PRIMARY KEY (id)` plus a duplicate `UNIQUE (org_id, id)`
  index. Pure non-addressable associations and rebuildable projections instead
  use an `org_id`-leading natural composite primary key and do not carry a
  meaningless surrogate `id`. Every tenant FK is composite:
  `(org_id, referenced_id) -> parent(org_id, id)`. This makes cross-tenant
  attachment impossible even if an API filter is missed.
- `core.organizations`, global `core.users`, UOM/permission references and
  statutory global references keep single-column keys. Organization children
  still reference `core.organizations(id)` and carry their own composite PK.
- ORM mappings must declare both primary-key columns and composite
  relationships. Repositories may not expose `get(id)` for tenant data; every
  REST/MCP addressable-resource load, update and lock uses `(org_id, id)`.
  Association and projection access uses its declared natural composite key.
  Secondary indexes begin with `org_id` unless a reviewed global operation
  proves otherwise.
- Branch, location, user, party, product, batch and document references must
  belong to the same organization. A branch-owned child must also match the
  parent's branch unless the documented flow crosses branches.
- Every tenant actor field references `(org_id, membership_id)` and RLS verifies
  that membership is active. A global `core.users.id` or raw Auth UUID is never
  accepted as a tenant actor FK.
- Only `core.permissions`, `core.reference_data_releases`,
  `catalog.units_of_measure`, `catalog.ingredients` and statutory
  `tax.tax_code_versions` are global read-only reference data. Tenant code
  cannot insert/update them. Regulatory releases retain typed reviewer identity,
  official origin, immutable object-storage coordinates and content hashes.
- External identifiers are namespaced and unique, for example
  `(org_id, integration, external_id)`; external IDs never replace canonical
  UUIDs.

### Calculation and GST integrity

- Line calculation order is fixed and versioned: normalize separately persisted
  `billed_quantity` and `free_quantity` to base UOM, compute billed gross, line
  discount, taxable value, GST
  components, cess and line total. Header totals are sums of rounded line
  snapshots plus typed charges and one rounding adjustment.
- A posted product line snapshots billed/free/base quantities, pack/UOM
  conversion, unit price, MRP, discount basis/amount, HSN/SAC, taxability,
  free-quantity tax treatment, component rates/amounts and ruleset version. A
  charge is an explicit line with `line_kind = charge`, charge code, HSN/SAC
  and its own tax snapshot; freight,
  insurance and other charges are not mutable header buckets or JSON.
- The tax engine returns its ruleset version, effective date, supply type,
  place of supply and full component breakdown. Posting persists all of them.
- Intra-state taxable supply has `igst = 0` and `cgst = sgst`; inter-state
  taxable supply has `cgst = sgst = 0`. Exceptions must cite a versioned rule,
  not a user-editable flag.
- Header tax/component totals equal line sums. `grand_total = taxable_total +
  tax totals + cess_total + charges_total + rounding_adjustment` after the
  documented discount order.
- Rounding uses decimal arithmetic and an explicit ruleset. API money and
  quantity values are decimal strings so MCP/LLM clients cannot introduce
  binary floating-point error.
- A filed return and its population are immutable. Corrections create a return
  revision and linked adjustment note.

### Inventory and finance integrity

- Only posting an inventory document writes stock ledger entries. Ledger rows
  are append-only; reversal posts an inverse linked entry.
- A transfer posts equal absolute base quantity and valuation out/in within one
  transaction. No intermediate single-sided transfer may commit.
- Batch expiry is after manufacture date; sale/dispatch of expired, recalled,
  quarantined or unapproved batch is rejected unless an explicit authorized
  disposition command applies.
- Negative available stock is rejected under a locked stock identity. Posting
  uses deterministic lock order to prevent deadlocks and overselling.
- Journal debits equal credits per organization and currency before commit.
- Allocations are positive and active allocations cannot exceed their exact
  payment/withholding source amount or open-item balance under deterministic
  row locks. Reversal is an immutable compensating allocation; cached
  paid/unallocated totals are not writable.
- Every document, payment, open item and allocation stores transaction currency.
  Non-functional-currency posting snapshots `fx_rate_to_functional`, rate
  source and effective timestamp using decimal arithmetic. Allocation either
  matches currency or snapshots its settlement rate and posts realized FX
  gain/loss through an accounting event. Journals balance in transaction and
  functional currency.
- Organization settings choose one reviewed costing method. Every posted stock
  ledger entry snapshots unit cost, total functional-currency cost, method and
  costing-rule version. Inbound free quantity spreads acquisition cost over all
  received base units; outbound cost is deterministic; linked returns use the
  original movement cost. Stock quantity and valuation reconcile independently.
- Document posting, ledger effects, open items, tax evidence, audit event and
  outbox event commit in one database transaction.
- Every externally retried command is unique by
  `(org_id, actor_membership_id, operation, idempotency_key)`. Reuse with different
  request hash is a conflict; reuse with the same hash returns the first result.

## RLS and Database Roles

Do not toggle RLS table-by-table in the dashboard before the canonical rebuild.
The canonical migration must create policies and constraints together:

1. Render connects as a non-owner, non-`BYPASSRLS` application role.
2. Each transaction resolves the Supabase Auth user to one active membership,
   then sets `app.org_id` and `app.membership_id` transaction-locally. A caller
   cannot select an organization without that membership.
3. Enable and `FORCE ROW LEVEL SECURITY` on every tenant table.
4. Policies filter by `org_id`, validate the current membership and use
   `access_grants` for branch/action authorization. Actor columns cannot be set
   to a different tenant membership.
5. Global UOM and tax-code versions receive explicit read-only grants.
6. Background workers use a separate narrowly granted role, not the table
   owner or Supabase service-role key.
7. CI proves same-tenant access, cross-tenant denial, branch denial, missing
   context denial, owner-bypass denial and worker boundaries for every table.

## MCP-First Contract

MCP exposes business resources and commands, never generic table CRUD.

- Resource URIs are stable and opaque, for example
  `erp://organizations/{org_id}/sales/invoices/{id}`. Renaming a physical table
  does not change the resource.
- Commands are verbs with discriminated schemas: `calculate_sales_invoice`,
  `create_sales_invoice_draft`, `post_sales_invoice`, `cancel_sales_invoice`,
  `allocate_payment`, `transfer_stock`, and `file_gst_return`.
- Every create/effectful command requires an idempotency key. Mutable draft
  updates require `expected_row_version`; posting locks the draft and verifies
  its expected version plus approved preview hash. Append-only commands lock
  their invariant owners and rely on idempotency/unique constraints, not a
  meaningless client-supplied event version. Organization, membership and
  permissions are derived from authenticated context, never model arguments.
- Calculation commands are pure and support dry-run. They return normalized
  inputs, decimal-string results, rounding steps, warnings and rule version so
  an agent can explain the result before a human authorizes posting.
- Posted records have no generic update/delete tool. Corrections use typed
  reverse/cancel/adjust commands with reason and original reference.
- Collection tools require bounded pagination, explicit sort, tenant scope and
  typed filters. No arbitrary SQL or unconstrained search is exposed.
- OpenAPI and MCP JSON Schemas share the same generated source. IDs are UUID
  strings, decimals are strings, dates are `YYYY-MM-DD`, timestamps are RFC3339
  UTC, and statuses publish allowed transitions.
- Read models may combine canonical tables for an agent, but every response
  identifies canonical resource IDs and `as_of`/version. An agent never writes
  dashboard cache, outstanding balance, stock balance, GST liability or other
  projection directly.
- High-risk commands return a preview and authorization challenge; posting
  requires explicit confirmation bound to the preview hash and expiry. Under
  its database locks, posting recalculates normalized totals, tax, availability
  and row versions; any preview-hash drift rejects the command for reapproval.

## Current-to-Canonical Disposition

The companion mapping covers all 184 application relations in the live
capture: all 175 physical tables, the partitioned relation and all eight views.
Its current action totals are:

| Action | Count | Meaning |
|---|---:|---|
| `retain` | 41 | Business entity survives, but naming/types/constraints may be rebuilt |
| `merge` | 67 | Useful fields move into one named canonical owner |
| `replace_projection` | 14 | Stored mutable summary becomes a query/materialized view |
| `archive_drop` | 52 | Outside the wholesale v1 owner; dummy rows may be discarded |
| `drop_view` | 8 | Compatibility/debug view is retired after callers switch |
| `drop_partition` | 2 | Obsolete API-usage partitions retire with that subsystem |

Important consolidations include:

- `master.system_settings`, `system_config.system_settings`, definitions and
  feature flags -> `core.settings`.
- `master.number_series` and `public.document_number_sequences` ->
  `core.document_sequences`.
- `financial.allocations` remains the allocation fact; the
  `payment_allocations` view disappears.
- Sales and financial credit/debit variants -> one typed adjustment-note
  aggregate.
- Customer/supplier outstanding tables -> `open_items + allocations` read
  model.
- Sales/GST e-way bill variants -> `tax.eway_bills`.
- Sales invoices/dispatches and supplier invoices/receipts -> explicit
  quantity allocation joins instead of ID arrays or inferred header links.
- Posted taxable business documents -> immutable `tax.documents`; returns,
  IRNs and e-way bills reference that owner instead of accounting journals.
- GSTR 2A/2B upload/invoice/data variants -> immutable portal document headers/
  lines plus reconciliation runs/items.
- Transfers and write-offs -> typed inventory document headers/lines; stock
  effects stay in one ledger.
- Customer and supplier duplicates -> one party legal identity plus independent
  1:1 commercial accounts.
- Analytics, notification, workflow and infrastructure logging tables without
  a product owner -> operational telemetry outside the ERP database or removal.

`retain` does not authorize retaining current columns unchanged. For example,
current batch quantity fields, customer outstanding totals, invoice return
quantities and product returned quantities are removed because they duplicate
ledger facts.

## Rebuild Sequence for Dummy Data

Because all current business data is declared disposable, do not write a long
dual-write migration. Use one reviewable rebuild:

1. Freeze application writes and keep the signed live-schema capture as design
   evidence.
2. Approve this inventory and explicitly decide which deferred workflows are
   out of v1.
3. Create the canonical schemas, types, composite tenant FKs, checks, indexes,
   RLS, non-owner roles and posting functions in a fresh Supabase branch/project.
4. Seed only statutory reference data and the minimum organization/admin
   configuration. Do not migrate dummy business rows.
5. Rewrite repositories to canonical commands; generate OpenAPI/MCP schemas
   from the same application contracts.
6. Run calculation golden tests, state-transition tests, concurrency tests,
   cross-tenant RLS tests, reversal tests and end-to-end REST/MCP parity tests.
7. Repoint the pilot, execute smoke transactions, reconcile all ledgers and
   totals, then replace the old application schemas in a controlled cutover.
8. Drop old relations only after repository/schema reference scanning reports
   zero callers. Supabase-managed `auth` remains untouched.

No production financial or inventory write should be enabled until steps 3-6
pass as deployment gates.

## Mapping Validation

The mapping is deliberately machine-checkable. CI should compare it to each new
live capture and fail for an unmapped relation, stale mapping, invalid target,
duplicate canonical table or unexpected count. Equivalent validation logic is:

```python
actual = {
    f"{r['table_schema']}.{r['table_name']}"
    for r in capture['tables']
    if r['table_schema'] != 'auth'
}
mapped = set(model['source_mapping'])
canonical = {
    table
    for domain_tables in model['canonical_tables'].values()
    for table in domain_tables
}

assert actual == mapped
assert len(actual) == 184
assert sum(r['relation_type'] == 'table' for r in capture['tables']
           if r['table_schema'] != 'auth') == 175
assert len(canonical) == 110
assert all(set(item['targets']) <= canonical
           for item in model['source_mapping'].values())
```
