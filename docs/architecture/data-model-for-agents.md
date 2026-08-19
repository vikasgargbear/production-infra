# Data Model for Reliable ERP and Agents

## Decision

Do not shrink the schema to reduce the table count. Table count is not an
optimization target. Retain a table when it has a distinct lifecycle, owner,
authorization boundary, retention rule, cardinality, or audit meaning. Merge or
retire it only with evidence that it represents the same fact and workflow as
another canonical table.

The requested Mozie reference suggests two practices to validate once that
private repository is available in the build workspace:

1. publish a generated, machine-readable model and dependency graph before
   changing schema; and
2. name one canonical source of truth for each workflow, keeping projections
   and legacy fields out of agent writes.

## Required model properties

Every business table must declare:

- canonical domain and owning application service;
- primary key and stable public opaque ID;
- `org_id` ownership, or a documented global/parent-inherited exception;
- branch semantics: required, optional, inherited, two-ended transfer, or none;
- foreign keys whose tenant consistency is enforceable;
- create/update actor, timestamps, and row version where mutable;
- status lifecycle and allowed transitions;
- deletion policy: restrict, soft-delete, archive, or never delete;
- retention and sensitivity classification;
- indexes supporting all tenant-first access paths;
- whether it is canonical, reference, event/audit, projection/cache, or legacy.

Child tables that omit `org_id` are acceptable only when all access joins
through a tenant-owned parent and the database prevents reparenting across
tenants. For high-risk financial and compliance children, prefer composite
tenant-aware constraints or explicit `org_id` when it materially simplifies RLS
and verification.

## Canonical facts

Define one source of truth for each fact. Examples:

| Fact | Canonical candidate | Other representations |
|---|---|---|
| Issued sale | `sales.invoices` + `sales.invoice_items` | GST/report rows are derived snapshots or filings |
| Inventory change | append-only `inventory.inventory_movements` | `location_wise_stock` is a rebuildable balance projection |
| Customer debt | posted invoices, allocations, credit/debit adjustments | `financial.customer_outstanding` is a projection with reconciliation |
| Supplier debt | supplier invoices, allocations, adjustments | `financial.supplier_outstanding` is a projection |
| Accounting effect | posted `journal_entries` + lines | dashboards and cash forecasts are projections |
| Tax obligation | versioned transaction tax snapshot | GSTR tables are period filing/reconciliation artifacts |

The candidates above require validation against actual triggers and production
queries; they are not permission to delete tables. Agent write tools operate on
canonical commands, never by patching projections such as outstanding balances,
analytics KPIs, or report rows.

## Financial and tax invariants

Enforce these in database constraints and transaction-level services, then test
them through REST and MCP:

- currency amounts use `NUMERIC`, never floating point; scale and rounding mode
  are defined per field/ruleset;
- invoice header totals equal the rounded sum of immutable line tax snapshots,
  discounts, charges, and adjustments;
- posted journal entries balance by currency and organization;
- allocations cannot exceed the allocatable payment or open document amount;
- inventory movements conserve quantity across transfers and cannot silently
  create negative stock unless an explicit policy permits it;
- batch, expiry, unit conversion, and branch/location are part of stock identity;
- GST rate, HSN/SAC, place-of-supply, registration status, rule version, and
  rounding inputs are snapshotted on posting so later master-data changes do not
  rewrite history;
- closed periods and filed returns are immutable; corrections are append-only
  adjustments linked to the original;
- cancellation/reversal references the original and is unique where required.

## Evaluate tables with evidence

Build a generated catalog from the live schema and source graph. For every
table capture row count, size,
write/read callers, foreign keys, indexes and usage, RLS policies, triggers,
retention, last write, and downstream reports/tools.

Score each table with this decision matrix:

| Signal | Retain/split | Merge/retire candidate |
|---|---|---|
| Lifecycle | Independent status or retention | Same lifecycle as parent |
| Cardinality | Unbounded child/history | Always 1:1 with identical access |
| Security | Different sensitivity or branch rules | Identical policy |
| Audit | Must preserve events/versions | Duplicate mutable snapshot |
| Query | Independent indexed access | Never independently queried |
| Ownership | Different domain/service | Same owner and transaction |
| Evidence | Active callers and rows | No callers/writes after full period |

JSONB is appropriate for bounded extension metadata, external raw payloads with
a typed extracted core, and immutable audit context. It is not appropriate for
money, tax lines, allocations, stock quantities, permissions, branch access, or
fields used in joins/constraints/reporting. Arrays of foreign IDs should become
join tables when membership is queried, authorized, or updated independently.

## Safe retirement protocol

1. Name the canonical replacement and invariant mapping.
2. Add dual-read comparison or a shadow reconciliation, not immediate dual
   write hidden in clients.
3. Backfill in resumable tenant-bounded batches with counts and hashes.
4. Prove parity over at least one full financial/compliance period.
5. Stop writes to the legacy representation and monitor all reads.
6. Remove callers, then archive before dropping according to retention policy.
7. Keep reversible migrations and an evidence report signed off by finance,
   tax/compliance, and engineering owners.

Never merge an audit/event table into a mutable entity, delete filing snapshots
because they can be recomputed, or collapse header/line tables into JSON solely
to reduce joins.

## Generated knowledge base

CI should produce the following from schema, OpenAPI, frontend client usage, and
MCP catalog:

```text
docs/generated/
  index.md                    architecture and domain map
  data-model.md               tables, fields, constraints, indexes, RLS
  domains/<domain>.md         routes, operations, tables, calculations
  flows/<operation>.md        client -> operation -> tables/events
  reference/openapi-operations.md
  reference/mcp-tools.md
  graph.json                  machine-readable dependency graph
```

Schema or operation changes must regenerate these artifacts. CI fails on a dirty
diff, an orphan table, an MCP tool that writes a projection, an unbounded query,
or a high-risk operation without invariant tests.

## Minimum test matrix

For each financial, inventory, GST, and compliance workflow cover normal,
boundary, invalid, and concurrent cases across multiple organizations and
branches. Include zero/negative values, fractional quantities, every rounding
boundary, inclusive/exclusive tax, intra/inter-state tax, credit/debit notes,
returns, cancellation, closed periods, expired batches, duplicate external
references, partial/over allocation, retries, stale versions, and transaction
rollback after each side effect. Golden cases must cite the governing ruleset
and effective date, with independent finance/tax review.
