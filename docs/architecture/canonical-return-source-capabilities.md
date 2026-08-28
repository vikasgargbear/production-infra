# Canonical return source capabilities

The published MCP prepare schemas are the machine-readable owner for return
source support. Each return schema exposes
`x-aasopharma-source-capabilities`; the backend semantic validator, concrete
service guard, browser context and structured failure response consume that
contract. A source appearing in the input enum does not mean it is executable:
blocked sources are represented so ChatGPT and browser callers receive a stable
failure instead of inventing source allocations.

| Operation | Executable source | Represented, blocked source | Missing authority |
| --- | --- | --- | --- |
| `sales.return.prepare` | `dispatch_allocated` | `direct_issue` | direct invoice-issue lineage lock, cumulative direct-issue return ceiling, exact issue-cost reversal, PostgreSQL runtime acceptance |
| `procurement.purchase_return.prepare` | `invoiced` | `uninvoiced` | goods-receipt-only resolution and locking, cumulative receipt ceiling, commercial-only zero-GST debit/accounting path, PostgreSQL runtime acceptance |

Blocked attempts return HTTP 409 with `code=POLICY_BLOCKED`,
`metadata.reason=RETURN_SOURCE_AUTHORITY_UNAVAILABLE`, the exact
`source_kind`, executable source kinds and the missing authority list.
`retryable=false` prevents an agent from retrying or silently substituting a
different lineage. The concrete action service repeats the guard before opening
a database transaction.

## Why these are not enabled by this change

The tables intentionally permit nullable source allocations, but the current
reviewed prepare, artifact assertion, approval execution and readback authority
only implements invoice-allocation branches:

- sales-return resolution and persistence require one
  `sales.invoice_dispatch_allocations` row and its dispatch inventory issue;
- purchase-return resolution and persistence require one
  `procurement.supplier_invoice_receipt_allocations` row and insert
  `return_source_kind='invoiced'`;
- execute-time revalidation, cumulative ceilings, tax artifacts, open-item
  adjustment and valuation all assume those same sources.

Enabling either alternate source therefore requires a new hash-bound migration
from the named canonical command owners plus PostgreSQL 15 runtime-role,
forced-RLS, tenant, idempotency, concurrency, rollback, approval, tax,
inventory, accounting and exact-readback acceptance. Removing only the
transport validation would weaken fail-closed behavior and is forbidden.
