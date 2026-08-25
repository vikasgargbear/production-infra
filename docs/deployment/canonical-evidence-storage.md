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
3. From the canonical project's JWT signing authority, issue a server-only JWT
   whose `role` claim is exactly `erp_evidence_storage`. Store it only in the
   backend secret `EVIDENCE_STORAGE_SERVER_JWT`. Never use or expose the
   Supabase service-role key.
4. Add an active organization-scoped canonical setting with namespace
   `evidence_retention`, key `expense_receipt_months`, and a positive integral
   numeric value reviewed for that organization's applicable retention rules.
   The upload API remains closed if this policy fact is absent.
5. Set `EVIDENCE_STORAGE_ENABLED=true` only after the PostgreSQL migration,
   bucket policy, restricted JWT, and retention setting have all been verified.

The object key is immutable and content-addressed:

```text
{org_id}/{branch_id}/expense_receipt/{sha256}.pdf
```

The backend creates without upsert, fetches the bytes back through the
bucket-restricted role, validates the PDF envelope, recomputes SHA-256, and
only then changes canonical metadata from `pending_upload` to `verified`.
Missing configuration, storage errors, and integrity mismatches fail closed.

## Retention and cleanup

Verified and retained objects are never cleanup candidates. Legal hold always
wins. The operator cleanup command accepts one explicit organization and
branch, activates that canonical tenant context, and deletes only exact object
keys for old `pending_upload` or `rejected` rows that are not under legal hold.
Scheduled lifecycle deletion is intentionally deferred until the reviewed
retention/erasure command boundary exists.
