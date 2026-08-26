# Canonical evidence storage

The ERP evidence boundary uses one private Supabase Storage bucket named
`canonical-evidence-private-v1`. PostgreSQL stores attachment metadata and a
SHA-256 digest; PDF bytes never enter PostgreSQL.

## Provisioning order

1. Apply Alembic through migration `20260825_0022` to the disposable canonical
   staging database.
2. Apply
   `database/09-deployment/canonical-evidence-storage.sql` to that same Supabase
   project. Confirm the bucket is private, limited to 10 MiB PDF objects, and
   has no UPDATE policy.
3. Create a server-only Supabase secret API key whose custom database role is
   exactly `erp_evidence_storage`. Store the resulting `sb_secret_...` value
   only in the backend secret `EVIDENCE_STORAGE_SERVER_API_KEY`. Never use or
   expose the Supabase `service_role` key, and never send this key to a browser.
   The backend sends this credential only in Supabase's `apikey` header; it
   does not pair it with an anon key or an `Authorization` bearer header.
4. Set `EVIDENCE_STORAGE_EXPECTED_PROJECT_REF` for the reviewed environment and
   its exact matching `SUPABASE_URL`. Keep retired-project denial in the
   deployment/promotion allowlist rather than in application source.
5. Add an active organization-scoped canonical setting with namespace
   `evidence_retention`, key `expense_receipt_months`, and a positive integral
   numeric value reviewed for that organization's applicable retention rules.
   The upload API remains closed if this policy fact is absent.
6. Set `EVIDENCE_STORAGE_ENABLED=true` only after the PostgreSQL migration,
   bucket policy, restricted custom-role API key, and retention setting have
   all been verified.

The object key is immutable and content-addressed:

```text
{org_id}/{branch_id}/expense_receipt/{sha256}.pdf
```

The backend creates without upsert, fetches the bytes back through the
bucket-restricted API key, parses the bounded PDF structure and at least one
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
