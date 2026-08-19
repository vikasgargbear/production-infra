# Legacy and Dead-Code Retirement

## Decision

Delete dead and redundant surfaces only after dependencies, production use,
persisted data, and external contracts are measured. Agent friendliness comes
from a small canonical catalog, not from hiding a large legacy backend behind
prompt instructions.

## Completed narrow cleanup

- The unmounted HTTP handlers formerly stored in
  `backend/app/api/shared/calculations.py` were removed. That module now contains
  only pure helpers used by the canonical invoice service.
- The frontend's unused `finance/calculations.api.ts` surface was retired. The
  online sales invoice flow now calls `sales/calculations.api.ts`, which adapts
  the backend preview contract.
- Five `tests/integration/*_critical_path.py` files with undefined database
  fixtures, empty setup, and simulated rather than real workflows were retired.
  The credential-gated `tests/live_erp` suite is the executable API/Supabase
  replacement; company-profile persistence remains an explicit coverage gap.

These removals had static caller checks and focused calculation/contract tests.
They do not classify the remaining legacy calculators or API variants as safe
to delete.

This repository contains visible cleanup candidates, including commented
removed imports in `backend/app/main.py` and frontend API modules/configuration
that name routes such as `purchases-enhanced`, `schemes-discounts`, and
`quick-sale` that are not registered in the current application entry point.
These are candidates for investigation, not proof that deletion is safe.

## Canonical action map

Every user intent has one public MCP tool and one backend application operation.
Aliases may exist temporarily at REST edges, but they do not become additional
tools and must delegate to the canonical operation.

| User intent | Canonical MCP tool | Application operation | Canonical records | Never mutate directly |
|---|---|---|---|---|
| Find a customer | `erp_customer_search` | `master.search_customers` | `parties.customers` | report/export caches |
| Check available batch stock | `erp_stock_get` | `inventory.get_availability` | movement ledger plus stock projection after reconciliation | `location_wise_stock` by generic patch |
| Create a sales order | preview + `erp_order_create` | `sales.create_order` | order header/items | invoice or analytics rows |
| Issue an invoice | preview + `erp_invoice_create` | `sales.issue_invoice` | invoice/items, stock movements, accounting/tax effects in one transaction | outstanding/GSTR projection rows |
| Record and allocate payment | preview + `erp_payment_record` | `finance.record_payment` | payment and allocation records, journal effect | outstanding balance columns |
| Receive purchased stock | preview + future `erp_grn_create` | `procurement.receive_goods` | GRN/items and inventory movements | quantity projection alone |
| Adjust inventory | preview + future `erp_stock_adjust` | `inventory.adjust_stock` | adjustment reason and inventory movement | balance projection alone |
| Cancel a posted document | dedicated W3 tool, not generic update | domain-specific reversal operation | linked reversal/adjustment and audit | original posted totals/status without policy |
| Review GST position | `erp_gst_summary_get` | `gst.get_period_summary` | canonical transaction snapshots plus filing artifacts | arbitrary recalculation into filed rows |
| Export a GST filing | `erp_gst_export_preview` then future approved export | `gst.build_filing_export` | immutable export/filing artifact and audit | source invoices or filed return by patch |

The exact Python operation identifiers are target names until service extraction
is complete. The generated catalog must link each name to its implementation,
OpenAPI operation, permission, tables read/written, calculations, and tests.

## Inventory first

Generate an inventory for all of the following:

- Python modules, imports, route registrations, decorators, background jobs,
  scripts, migration helpers, and environment flags;
- frontend pages, components, hooks, API methods, direct URL strings, dynamic
  imports, service worker/offline queues, and Electron packaging references;
- OpenAPI operations, MCP tools/resources, webhook consumers, scheduled jobs,
  external integrations, and documented curl/SDK examples;
- tables, columns, functions, triggers, views, RLS policies, indexes, migrations,
  and raw SQL string references;
- production request counts, job executions, feature-flag states, error traces,
  database reads/writes, and client/version distribution.

Static analysis alone is insufficient because SQL, FastAPI registration,
configuration, and frontend routes can be dynamic. Runtime telemetry alone is
insufficient because month/quarter/year-end and disaster-recovery paths may be
dormant for long periods.

## Generated dependency artifacts

Extend the knowledge-base generation described in
`data-model-for-agents.md` with:

```text
docs/generated/
  reference/routes.md            route -> operation -> permission
  reference/frontend-calls.md    page/hook -> API operation
  reference/mcp-tools.md         tool -> operation -> risk/approval
  reference/jobs.md              schedule -> operation -> tables
  reference/legacy-surfaces.md   owner, replacement, deadline, telemetry
  flows/<operation>.md           callers -> operation -> tables/events
  graph.json                     typed nodes and dependency edges
```

At minimum, graph nodes use stable IDs and one of `ui`, `api_client`, `route`,
`mcp_tool`, `operation`, `calculation`, `repository`, `job`, `table`, `column`,
`trigger`, `external_contract`, or `test`. Edges distinguish `calls`, `reads`,
`writes`, `derives`, `schedules`, `guards`, `tests`, and `replaces`.

CI fails when:

- an exported route/tool has no application operation, permission, owner, or
  test edge;
- two non-alias public actions claim the same user intent;
- an MCP write targets a projection or legacy node;
- a compatibility node lacks a replacement and removal milestone;
- code/schema changes leave generated graph documentation dirty.

## Classification

Assign every candidate exactly one status:

| Status | Meaning | Allowed action |
|---|---|---|
| Canonical | Current source of truth or supported entry point | Keep and test |
| Adapter | Thin supported transport into canonical operation | Keep while supported |
| Compatibility | Delegating old contract with measured consumers | Deprecate on schedule |
| Projection | Rebuildable read model with reconciliation | Keep if query value exceeds cost |
| Dormant-required | Rare close, filing, recovery, or migration path | Keep and exercise periodically |
| Orphan | No valid callers, data purpose, external contract, or required history | Remove through protocol |
| Unknown | Evidence is incomplete | Do not delete |

Code duplication is not automatically dead code. First prove which
implementation is canonical with calculation parity and production data.

## Deletion gates

A code/API compatibility surface may be removed only when all apply:

1. The canonical replacement and owner are recorded.
2. The typed dependency graph has no unexplained inbound edge.
3. Production telemetry shows zero valid use for the greater of 90 days, three
   normal releases, or one complete applicable business cycle. Annual/rare
   close and recovery paths require explicit owner attestation and a rehearsal.
4. Supported frontend, mobile/Electron, MCP, offline queue, webhook, and external
   client versions no longer reference it.
5. Contract deprecation was announced, measured, and completed; old clients get
   a stable migration error or `410 Gone`, not silent semantic remapping.
6. Equivalent unit, contract, calculation, tenant, and integration coverage is
   attached to the replacement.
7. Feature flags/configuration, documentation, examples, monitoring, and alerts
   are removed in the same or a tracked follow-up change.
8. Rollback is defined and the deletion is approved by the owning engineering
   domain; finance/tax/compliance owners also approve affected workflows.

A table or column additionally requires the safe retirement protocol in
`data-model-for-agents.md`, verified zero writes, completed data migration,
retention/legal approval, backup/restore proof, and at least one release where
the application runs without reading it before a later drop migration.

## Compatibility adapter rules

A temporary adapter must:

- contain no calculation, authorization, transaction, or audit logic;
- call the canonical application operation and preserve its security context;
- emit structured usage telemetry with client/version and replacement;
- carry an owner, introduction date, removal condition, and deadline;
- never be exported as a separate MCP tool;
- fail clearly when old semantics cannot be preserved safely.

Do not create bidirectional synchronization between legacy and canonical
tables. Prefer a controlled backfill, a read comparison window, then a single
write path. Do not retain `v2`, `enhanced`, `fixed`, `complete`, or `legacy`
variants indefinitely; these suffixes trigger an ownership review in CI.

## Retirement workflow

1. Generate the graph and candidate report.
2. Confirm the canonical action/data owner and map consumers.
3. Add replacement parity tests and usage telemetry.
4. Migrate supported consumers and persisted offline work.
5. Disable legacy writes; compare reads/results through a business cycle.
6. Remove public registration/export, monitor, then remove implementation.
7. Remove data structures in a later migration after retention gates pass.
8. Regenerate the graph and attach before/after node, edge, route, test, and
   database-size counts to the change record.
