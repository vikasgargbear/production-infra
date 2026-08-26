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
3. Create one dedicated Supabase Auth service user. Set immutable reviewed app
   metadata `erp_service_identity=canonical-evidence-storage-service-v1`, and configure the
   reviewed Custom Access Token Hook to assign this user only the
   `erp_evidence_storage` role. Configure a maximum 15-minute access-token
   lifetime. Do not use a `service_role` key or a custom server API key.
4. Set `EVIDENCE_STORAGE_EXPECTED_PROJECT_REF` for the reviewed environment and
   its exact matching `SUPABASE_URL`. Set `SUPABASE_ANON_KEY` to the public
   publishable/anon key, and configure the dedicated identity through
   `EVIDENCE_STORAGE_SERVICE_EMAIL`, `EVIDENCE_STORAGE_SERVICE_PASSWORD`, and
   `EVIDENCE_STORAGE_SERVICE_AUTH_USER_ID`. The service password must be unique,
   contain at least 32 bytes, and must never equal `JWT_SECRET_KEY`.
5. Add an active organization-scoped canonical setting with namespace
   `evidence_retention`, key `expense_receipt_months`, and a positive integral
   numeric value reviewed for that organization's applicable retention rules.
   The upload API remains closed if this policy fact is absent.
6. Set `EVIDENCE_STORAGE_ENABLED=true` only after the PostgreSQL migration,
   bucket policy, service identity/hook, and retention setting have
   all been verified.

The object key is immutable and content-addressed:

```text
{org_id}/{branch_id}/expense_receipt/{sha256}.pdf
```

The backend creates without upsert, fetches the bytes back through the
short-lived service-user token, parses the bounded PDF structure and at least
one page, recomputes SHA-256, and only then changes canonical metadata from
`pending_upload` to `verified`. Every Storage request carries the public key in
`apikey` and the verified short-lived user session in `Authorization: Bearer`.
The adapter refreshes and retries exactly once after a 401; it never retries a
403 authorization denial.
Missing configuration, storage errors, and integrity mismatches fail closed.

## Retention and cleanup

Verified and retained objects are never cleanup candidates. Legal hold always
wins. The operator cleanup command accepts one explicit organization and
branch, activates that canonical tenant context, and deletes only exact object
keys for old `pending_upload` or `rejected` rows that are not under legal hold.
Scheduled lifecycle deletion is intentionally deferred until the reviewed
retention/erasure command boundary exists.
