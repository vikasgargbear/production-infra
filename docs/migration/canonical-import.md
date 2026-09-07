# Canonical organization import

## One-command MARG migration

`backend/scripts/migrate_marg.py` compiles the supported MARG evidence profile,
imports all source batches, promotes parties and opening balances, validates the
existing reviewed tax catalog, promotes products and saleable batches, and reconciles
source counts, opening balances, and inventory ledger quantities/values. It uses
the existing canonical commands; no new database model is required.

The private source repository must include `migration-work/tools/compile_migration.py`.
Its evidence profile identifies the twelve decoded exports used by the existing
source extractor. This supports that export format; an arbitrary MARG backup or a
different fiscal-year layout still requires a supported extraction profile.

Create a private target JSON file with `organization_id`, `user_id`, `branch_id`,
`location_id`, `dataset_id`, `opening_date` (ISO date), and the explicitly reviewed
`default_product_kind` (`medicine` for the current MARG profile). Keep a stable
dataset ID for retries. Select an empty test organization for a new rehearsal;
do not use a new dataset ID to reload balances already migrated into an organization.

Run from the deployed ERP source checkout with backend dependencies installed:

```bash
python backend/scripts/migrate_marg.py \
  --source-repo /private/path/to/aasopharma-marg-migration-reference \
  --source /private/path/to/MARG-data-or-export-folder \
  --target /private/path/to/target.json \
  --output /private/path/to/aasopharma-marg-migration-reference/migration-work/output/customer-import
```

`--source` automatically snapshots the selected folders, identifies supported
reports, runs the existing parsers, and constructs the evidence profile. Repeat
`--source` to include another export folder. The snapshot is taken into a separate
directory; original MARG files are read only. Missing or ambiguous report families
are listed in `acquisition-status.json`. Proprietary files that do not match a
verified parser are not treated as decoded. Driving the MARG application's Export
controls must be verified against the connected Windows installation. An existing
decoded profile may instead be passed with `--profile`.

The prepared `migration-plan.json` shows counts, exclusions, and `source_tax_conflicts`.
Multiple source GST rates under one HSN are currently incompatible with the tax
assignment model and stop application before any import writes. Application also
checks every reviewed product's HSN/rate/date against the existing active catalog
before importing. It never installs or supersedes a shared tax release as part of
a customer migration. Supporting differing per-product rates requires a reviewed
product-level tax assignment shared by calculation, posting, and readback; it must
not be implemented as a migration-only override.

Add `--apply`
to the same command to run the complete import. Operator credentials come from
the existing Railway CLI login and `SUPABASE_DB_PASSWORD` environment variable.
The tool streams private records directly to the selected ERP service. Passwords
are never command arguments, source files, or receipts. Temporary SSH access is
removed after the attempt. This operator currently targets the persistent pilot;
the production database remains outside its allowed scope.

Each batch commits independently. Retry the same output directory after an
interruption; PostgreSQL checks/replays the same source identities. The tool stops
if promotion ceases making progress or final reconciliation differs. It never
cleans up existing organizations. Completion is written to `migration-receipt.json`.

Supported historical invoices are available in the invoice archive. They are
not reposted as new sales, which would double stock and ledger effects. Unknown
purchase lines, unresolved returns, and incomplete product setups remain listed
in the package's exclusions/quarantine report; they are not reported as usable
stock or completed transactional history.

This is the repeatable boundary for moving reviewed legacy data into one ERP
organization. It is not a generic CSV loader and never writes directly to ERP
tables.

## Ownership

- A private source repository extracts and reconciles legacy records. It may
  emit candidates, but it cannot authorize ERP writes.
- `production-infra` validates and applies a reviewed canonical operation
  bundle through the same authenticated REST commands used by the ERP UI.
- PostgreSQL remains the calculation, tenant-isolation, command, accounting,
  inventory, and idempotency authority.

Raw source files and candidate rows must not be committed to this repository.

## Repeatable sequence

1. Extract source data read-only and record source hashes and row identities.
2. Reconcile masters, batches, current stock, invoices, returns, open items,
   tax, and control-account totals.
3. Keep every unresolved or ambiguous record quarantined. Never guess a
   product kind, GSTIN, HSN, party role, batch allocation, or opening value.
4. Compile only reviewed rows into `operations.jsonl`. Each operation names a
   canonical REST mutation or a registered prepare/review/approve/execute
   command, a stable source record ID, and a deterministic idempotency key.
5. Bind the package to the exact target organization UUID and hash the source
   manifest and operation file.
6. Generate a content-addressed plan. A plan is invalid after any bundle byte
   changes.
7. Apply with a short-lived ERP bearer token for the same organization and the
   exact confirmation string printed from the plan.
8. Reconcile every successful mutation through a canonical GET before writing
   its resumable local receipt.
9. Reconcile package counts and financial/inventory totals independently after
   all operations complete.
10. Run a final delta extraction at cutover and import only the reviewed delta.

## Candidate audit

Candidate evidence can be inspected without loading its rows:

```bash
cd backend
PYTHONPATH=. python scripts/canonical_import_bundle.py audit-candidates \
  --manifest /private/path/to/candidate-bundle/manifest.json
```

Exit status `2` means apply is correctly blocked. A candidate bundle cannot be
renamed into an import bundle.

## Reviewed bundle

The directory must contain:

- `manifest.json`
- `source-manifest.json`
- `operations.jsonl`

`manifest.json` uses schema `aasopharma.canonical-import-bundle.v1` and binds:

- one normalized package ID;
- one target organization UUID;
- the SHA-256 of the source manifest;
- the SHA-256 and count of operations;
- zero quarantined rows; and
- explicit `apply_allowed: true` from the reviewed compiler.

Operations are ordered by phase. Direct operations are restricted to the
canonical master endpoints. Transactional operations must use a registered
operator-action prepare command. Later phases may bind server-assigned UUIDs
and row versions from earlier operation responses. The receipt stores only
these required scalar bindings, not source payloads.

## Plan and apply

```bash
cd backend
PYTHONPATH=. python scripts/canonical_import_bundle.py plan \
  --bundle /private/path/to/reviewed-package \
  --out /private/path/to/import-plan.json

export ERP_IMPORT_ACCESS_TOKEN='<short-lived token for the target organization>'
PYTHONPATH=. python scripts/canonical_import_bundle.py preflight \
  --bundle /private/path/to/reviewed-package \
  --plan /private/path/to/import-plan.json \
  --api-origin https://canonical-api.example

PYTHONPATH=. python scripts/canonical_import_bundle.py apply \
  --bundle /private/path/to/reviewed-package \
  --plan /private/path/to/import-plan.json \
  --receipt /private/path/to/import-receipt.json \
  --api-origin https://canonical-api.example \
  --confirmation 'APPLY-MIGRATION:<organization-uuid>:<plan-sha256>'
```

The access token is read only from the named environment variable and is never
written to the plan or receipt. Apply refuses HTTP, an unready API, an invalid
token, a token for another organization, changed package bytes, arbitrary write
paths, unregistered operator commands, missing readbacks, or a mismatched
confirmation.

An interrupted run is resumed with the same bundle, plan, and receipt. Already
reconciled operation IDs are skipped; writes use the same idempotency keys.

## Current MARG candidate status

The `marg-canonical-candidates-v1` export is evidence, not a reviewed import
bundle. Its own manifest sets `apply_allowed: false`. It must remain blocked
until all required source facts, crosswalks, command ownership, and
reconciliation gates are resolved and a new reviewed operation bundle is
compiled.
