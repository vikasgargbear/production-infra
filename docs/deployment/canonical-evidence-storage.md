# Canonical evidence storage

The ERP evidence boundary uses one private Supabase Storage bucket named
`canonical-evidence-private-v1`. PostgreSQL stores attachment metadata and a
SHA-256 digest; PDF bytes never enter PostgreSQL.

## Provisioning order

1. Apply Alembic through the current reviewed head to the disposable canonical
   staging database.
2. Apply
   `database/09-deployment/canonical-evidence-storage.sql` to that same Supabase
   project. Confirm the bucket is private, limited to 10 MiB PDF objects, and
   has no UPDATE policy.
3. Reconcile the exact non-human Auth identity defined by
   `database/canonical/security/evidence-storage-service-identity.json`, enable
   the reviewed custom access-token hook, rotate its password, and verify a
   password session. The hook grants only `erp_evidence_storage`, stamps the
   platform marker, and caps access-token lifetime at 15 minutes. The hosted
   project `service_role` key is runner-local bootstrap authority only; it is
   never stored on Render or sent to a browser.
4. Set `EVIDENCE_STORAGE_EXPECTED_PROJECT_REF` for the reviewed environment and
   its exact matching `SUPABASE_URL`. Keep retired-project denial in the
   deployment/promotion allowlist rather than in application source.
5. Add an active organization-scoped canonical setting with namespace
   `evidence_retention`, key `expense_receipt_months`, and a positive integral
   numeric value reviewed for that organization's applicable retention rules.
   The upload API remains closed if this policy fact is absent.
6. Set `EVIDENCE_STORAGE_ENABLED=true` only after the PostgreSQL migration,
   bucket policy, exact service identity, hook readback, and retention setting have
   all been verified.

The object key is immutable and content-addressed:

```text
{org_id}/{branch_id}/expense_receipt/{sha256}.pdf
```

The backend creates without upsert, fetches the bytes back through the
short-lived service-identity token, parses the bounded PDF structure and at least one
page, recomputes SHA-256, and only then changes canonical metadata from
`pending_upload` to `verified`.
Missing configuration, storage errors, and integrity mismatches fail closed.

## Retention and cleanup

Verified and retained objects are never cleanup candidates. Legal hold always
wins. The operator cleanup command accepts one explicit organization and
branch, activates that canonical tenant context, and deletes only exact object
keys for old `pending_upload` or `rejected` rows that are not under legal hold.
Scheduled lifecycle deletion is intentionally deferred until the reviewed
retention/erasure command boundary exists.
