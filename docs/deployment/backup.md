# Backup and restore evidence

Production promotion requires a verified backup and a PostgreSQL 15 restore
drill for the exact canonical candidate. The authoritative artifact format and
validation predicates are documented in
[`promotion-evidence/README.md`](../architecture/promotion-evidence/README.md)
and enforced by `backend/scripts/audit/application_promotion_evidence.py`.

Required evidence includes:

- the exact reviewed Git commit and Alembic head;
- a cryptographic digest and provider artifact identity for the backup;
- a restore into an isolated PostgreSQL 15 target;
- source-versus-restored relation counts and exact monetary reconciliation;
- runtime-role, forced-RLS, and tenant checks on the restored target; and
- reviewer and timestamp binding.

Do not test recovery by dropping, truncating, or replacing a live database. Do
not record an unchecked file path, successful command exit, or provider promise
as a verified restore. Missing backup/restore evidence leaves promotion
fail-closed.
