# Prepared migration import

Master → Import data reviews `migration-bundle.json` produced by the existing
MARG export compiler. It is not a Windows MARG extraction adapter and does not
accept raw DBF/CSV files. The automatic extraction step still needs verification
against an actual MARG installation.

## Operator journey

1. Sign into the intended organization with `core.organization.manage` and
   finance-view access. Choose its already-targeted package (maximum 64 MB).
2. Review uploads the package to the ERP's read-only `/bundle-review` endpoint.
   The browser first rejects another organization or unavailable branch/location.
   The backend independently binds organization identity to the signed session,
   validates every request batch, duplicate source identities and product tax
   completeness using the same validation functions as the operator CLI.
3. Review source counts, quarantined records and missing source domains. Download
   the review/exception report if needed. Explicitly confirm the destination and
   creation of reviewed opening stock and balances.
4. Import sends bounded requests to the existing `/facts`, `/operational-cutover`
   and `/product-inventory-cutover` authorities. No credentials, direct database
   writes, resets, new SQL functions or migrations are introduced.
5. Completion requires readback reconciliation of product/batch bindings, opening
   item counts, exact stock quantity/value and receivable/payable balances.

Pause takes effect after the in-flight request. Closing the screen stops subsequent
requests; an already sent request may finish. Reopen the same package to resume.
All batch identities are replayed against the existing database idempotency checks;
there is no localStorage/IndexedDB checkpoint and no offline business queue.
Changed source records fail rather than overwrite an earlier import.

Historical invoices are retained in the archive, not reposted into accounting.
Quarantined facts remain evidence. Product setup, drug-licence review and a real
invoice/PDF acceptance pass remain separate requirements; a successful import is
not evidence of those journeys.

## Tests

`test_migration_bundle_review.py` covers session target binding, duplicate source
identities, private-error redaction and exact review totals. Existing operator tests
exercise the shared validation contract. `migration.api.test.ts` covers pause,
network failure, replay, stalled/invalid receipts and exact readback mismatches.
`MigrationSetup.test.tsx` covers explicit approval and prevention of double submits.

`e2e/migration-setup.spec.ts` runs the rendered screen at 1280, 360 and 412 pixels
with synthetic API responses, including interruption/resume. These browser tests
are UI/transport evidence, not live PostgreSQL or production acceptance.
