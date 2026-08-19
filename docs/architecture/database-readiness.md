# Database Readiness Authority

`database/schema-authority.json` is the machine-readable source for database
migration readiness. It intentionally declares the repository `unbaselined`.
That state must not be changed by assuming the legacy numbered DDL matches the
live database.

Run the fail-closed audit from the repository root:

```bash
python3 backend/scripts/schema_readiness.py
python3 backend/scripts/schema_readiness.py --json
```

The normal command exits nonzero until the database is production-ready. CI can
validate that the authority does not overstate readiness while remediation is in
progress:

```bash
python3 backend/scripts/schema_readiness.py --validate-claim
```

## Promotion Procedure

1. Export the live schema, extensions, triggers, policies, grants, and indexes.
2. Review differences against `database/02-tables` and the raw legacy migration
   directories. Do not apply legacy bootstrap SQL to the live database.
3. Create the reviewed baseline in `backend/alembic`, then test both an empty
   bootstrap and an upgrade from a production-like snapshot.
4. Resolve every blocker reported by `schema_readiness.py`, including deploy
   includes, competing DDL, tenant-child isolation, and `FORCE RLS` coverage.
5. Change `readiness_state` to `production_ready` only in the same change that
   makes the default audit exit zero.

After the baseline is established, only `backend/alembic` may contain new
production migrations. Legacy SQL remains evidence for reconciliation until it
is explicitly archived; it is not an executable migration chain.

## Reviewed Live Capture

The read-only capture from project `jfrairkkzxwkhbtqejnz` on 2026-08-19 is
summarized in `database/live-schema-evidence.json`. Its artifact hash is checked
in, while the 0600 raw artifact remains ignored because catalog output may
contain operational details.

The capture verifies that every column in the 36-query conflict inventory exists
live. It does not establish a migration baseline: Supabase migration history was
unavailable, 92 of 175 reviewed business tables had RLS disabled, no reviewed
business table used `FORCE RLS`, and `system_config.feature_flags` had RLS enabled
without a policy.

Do not start the backend pilot against live data until the deployed database role
is proven to be a non-owner without RLS bypass, every request is proven to set
`app.org_id`, cross-tenant read tests pass with that exact role, and pilot routes
are restricted to an allowlist of reviewed RLS-protected tables. All live writes
remain blocked by unresolved trigger ownership and transaction-contract issues.
