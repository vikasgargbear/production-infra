# Canonical Production Review Response

## Scope

This document disposes the findings returned against
`canonical-production-review-handoff.md`. It does not approve a production
mutation. Production project `jfrairkkzxwkhbtqejnz` remains read-only until a
complete preserve-and-convert release has passed on a separate canonical target.

## Finding disposition

### 1. Command idempotency uniqueness

**Disposition: false positive; additional contention hardening added.**

`automation.command_requests` already has the database constraint
`command_requests_idempotency_uq` over
`(org_id, agent_grant_id, operation, idempotency_key_hash)`. Approval evidence
also has `command_approvals_idempotency_uq`. These are generated from
`database/canonical/domains/automation.json` and present in the packaged Alembic
baseline.

The application now additionally takes a transaction-scoped advisory lock for
the exact organization, grant, operation, and idempotency hash before resolving
or writing any prepare draft. The unique constraint remains the correctness
backstop; the lock makes concurrent same-key calls converge on replay instead of
allowing one caller to receive a uniqueness error after draft work begins.

### 2. Approval aggregate hash transaction boundary

**Disposition: original claim false; lock strengthened.**

`SqlAlchemyOperatorActionService.approve` already opens one transaction and
calls `erp_automation_commands.approve_operator_command`. That database function
reads `aggregate_version_hash` and inserts the approval in the same function and
transaction. The status query cited by the review is not used by the approval
write path.

The command request lock in the database function has been strengthened from
`FOR SHARE` to `FOR UPDATE`. This serializes concurrent approvals for the same
command before the idempotency replay lookup and makes the concurrency behavior
explicit. Existing trigger enforcement still rejects an approval whose preview
or aggregate hash differs from the request.

### 3. Count-only reconciliation

**Disposition: false positive.**

The live canonical reconciler compares:

- every persisted monetary header total to the independent Decimal oracle and
  immutable preview;
- line sums to header net, taxable, GST, cess, discount, subtotal, and grand
  totals;
- tax-document values to preview values;
- journal debit and credit values in transaction and functional currency;
- stock ledger quantity and value sums to stock-balance projections; and
- return and inventory quantities to their exact signed effects.

In the demo provisioner, expressions such as
`transaction_debit_total <> transaction_credit_total` occur inside a count of
invalid rows. The script requires that invalid count to equal zero. It is not an
assertion that debit and credit should differ. Resource reconciliations select
the exact returned resource UUID, not an arbitrary row satisfying `COUNT(*)`.

### 4. Contact conversion and email uniqueness

**Disposition: production conversion gap confirmed; proposed unique key
rejected.**

Production contact facts are embedded in legacy customer and supplier rows and
must be converted. There is not yet an executable full production conversion,
so this remains part of the production blocker.

A global `UNIQUE(org_id, party_id, email)` is not the correct canonical rule.
Email is nullable, a party may legitimately use one endpoint for different
contact purposes, and two parties may share a centralized endpoint. The model
instead enforces one active primary contact per party and contact kind, with a
search index over organization, email, and party. The eventual ETL must use a
deterministic source identity, normalize endpoints for comparison, report
collisions, and reconcile each source contact to exactly one target party.

A contact-only script is insufficient for cutover because the same conversion
must preserve party, account, address, GST registration, transaction, stock,
payment, tax, and audit foreign-key lineage.

### 5. Tax-provider promotion gate

**Disposition: false positive.**

`TAX_PROVIDER_PROMOTION_VERIFIED = False` is already a module-level literal in
`backend/app/api/routes/internal/tax_provider.py`. It is not read from an
environment variable. The monkeypatch in the unit test proves the remainder of
the route boundary for a future reviewed code change; it does not demonstrate a
deployment-config bypass.

### 6. Demo run isolation

**Disposition: false positive.**

Each primary reconciliation uses the exact resource ID returned by execution.
Command and calculation-artifact reconciliation uses the exact set of 12 command
request IDs. Derived journal, open-item, allocation, and tax checks use the
captured `journey_started_at` boundary. Organization-wide stock reconciliation is
intentional because the invariant is that the full ledger projection equals the
full balance projection after the run.

### 7. Decimal JSON round trip

**Disposition: false positive.**

`_json_value` does not call `json.dumps` and does not coerce Decimal to float.
All prepare documents flow through `canonical_json_bytes`, whose recursive
`_wire` function serializes Decimal as an exact decimal string. The calculation
and live oracle tests already cover six-decimal quantities and compare values as
Decimal. Adding `Decimal` handling to `_json_value` would be harmless but would
duplicate the canonical serializer rather than fix the reported float coercion,
which cannot occur on this path.

### 8. Full production conversion

**Disposition: confirmed blocker.**

No complete legacy-to-canonical ETL exists for the current production rows. An
in-place baseline is not viable because canonical and legacy relations reuse
schema-qualified names with incompatible shapes. Preserve-and-convert therefore
requires a separate canonical target, a read-only source snapshot, deterministic
ID maps, ordered conversion, exact reconciliation, application cutover, and a
tested rollback to the source.

### 9. Initial-release e-Invoice handling

**Disposition: provider submission deferred by product-owner direction.**

The initial production release will not submit e-invoices or e-way bills. The
provider boundary remains hard-disabled in application code. Finance owns the
applicability decision and any required submission outside this application.
This decision removes provider integration and applicability evidence as a
blocker for a provider-disabled release; it does not claim that the organization
is legally exempt. Enabling submission later still requires reviewed
applicability rules, provider conformance, credentials, and network evidence.

## Changes made after review

- Added transaction-scoped same-key serialization before all 12 prepare paths.
- Changed the approval request-row lock to `FOR UPDATE` in the canonical command
  generator and regenerated the hash-bound Alembic package.
- Expanded the live REST/MCP concurrency probe to run the same prepare, approve,
  and execute calls concurrently across both transports.
- Fixed the live reconciler's evidence summary to return `len(audit)` and
  `len(outbox)`; the prior unrun path incorrectly accessed a nonexistent
  `count` field.
- Added deterministic unit assertions for the prepare lock and approval lock.
- Recorded the provider-disabled release mode with finance-owned manual
  compliance handling; the operational audit now requires applicability
  evidence only when software provider submission is enabled.
- Reduced the disposable Nano staging Supavisor pool from 15 to 5 database
  connections per role/database combination. The canonical workflow uses four
  isolated roles plus the bootstrap role, so this bounds their potential
  database-side pool footprint while preserving the 200-client queue.

## Verdict

**Staging evidence:** valid for the completed disposable demo journey. The new
concurrent REST/MCP probe must be rerun against the regenerated baseline before
its added contention claim is promoted.

The latest reruns did not reach that probe. Run `32658718261` applied the
hash-approved baseline but failed isolated-role verification with a Supavisor
`EAUTHQUERY` timeout. Run `32659048918` failed the same gate when the pooler
dropped the client startup handshake. After bounding the Nano pool to five
database connections per role/database combination, run `32659214897` confirmed
the configuration and again failed the gate with Supavisor
`ECIRCUITBREAKER` while retrieving `erp_runtime` credentials. No further blind
retry is authorized; the hosted business-journey evidence remains unpromoted.

Run `32660835178` then repeated only the non-destructive baseline verification
with reset, restart, credential rotation, pooler mutation, and demo provisioning
all disabled. Both documented shared-pooler modes still failed the
`erp_runtime` canary with `EAUTHQUERY auth_query secret check timed out`. The
canary now uses `gssencmode=disable`, permits at most two attempts per port, and
queries an aggregate Supavisor diagnostic on failure. The diagnostic endpoint
returned a provider backend error. A staging database restart is the next
bounded recovery action and requires immediate user confirmation before it is
dispatched. A subsequent read-only role-catalog diagnostic in run `32661047853`
proved all four isolated roles are login-enabled, have passwords, are unexpired,
and have the intended `erp_app` membership. The authenticated Supabase CLI then
reported one staging network ban. Removing that single staging ban and running
one canary is now the preferred next action; it requires explicit user
confirmation because it changes a security control.

**Production:** blocked; preserve-and-convert required. Do not run
`supabase db push`, reset production, or apply the canonical baseline in place.

### Production conversion evidence now available

Read-only preflight job `97245824039` in run `32660498426` succeeded against
production project `jfrairkkzxwkhbtqejnz`. The checked aggregate evidence is
`database/live-conversion-preflight-evidence.json`; it contains no customer,
supplier, user, document, or product identifiers.

- All eight document-number duplicate-group counts are zero.
- All transaction-line orphan counts are zero.
- GSTIN and PAN format failures are zero for customers and suppliers.
- Exact Decimal baselines now cover document headers and lines, GST components,
  billed/free/returned quantities, payments, allocations, movements, and stock.
- Embedded contact evidence covers 140 customer contacts, 134 customer contact
  emails, eight supplier named contacts, and all customer/supplier business
  endpoints.
- Legacy exceptions are explicit: 311 header-only documents, two inventory
  movements referencing absent batches, and seven active users without auth
  identities.

`backend/scripts/compile_legacy_conversion_plan.py` binds this evidence to the
read-only schema capture and all 184 non-auth source-relation dispositions. It
refuses the production project as a target, permits only the reviewed separate
staging project, derives deterministic UUIDs, requires a disposition for every
counted row, preserves header-only documents without fabricated lines, assigns
missing-batch movements to audited deterministic untracked batches, and imports
users without auth identities as disabled profiles. The compiled plan covers
4,839 counted source rows with zero unexplained rows allowed.

This is conversion planning and source reconciliation evidence, not a completed
row extraction or target import. It does not remove the production cutover
blocker by itself.

## Remaining production evidence

1. Restore reliable isolated-role access to the separate canonical shadow
   target and retain the current project as the read-only conversion source.
2. Implement and execute source-to-target row ETL for master, transaction, inventory, finance,
   tax, challan, attachment, and audit lineage, including embedded contacts.
3. Reconcile source and target counts, exact monetary totals, signed stock by
   product/batch/location, open-item balances, GST components, and source-ID
   coverage with zero unexplained exceptions.
4. Complete a backup and restore drill and document retention approval.
5. Rerun the full live REST/MCP matrix, including concurrent prepare, approve,
   and execute, against the converted shadow target.
6. Before enabling the provider feature, obtain finance classification for
   e-Invoice applicability and complete the provider operational evidence.
