# Read-Only Supabase Schema Capture

This runbook captures the live catalog needed to baseline project
`jfrairkkzxwkhbtqejnz`. It does not use Supabase CLI authentication, `db pull`,
`db push`, migrations, or any remote write statement.

## Safety Boundary

- Use a database credential supplied interactively by the operator. Do not put
  it in the repository, a command argument, a URL, or a shell history entry.
- The passwordless connection URL must identify `jfrairkkzxwkhbtqejnz` in its
  database hostname or pooler username. Other project refs are rejected.
- The command forces `default_transaction_read_only=on`, opens an explicit
  repeatable-read read-only transaction, and refuses to write an artifact unless
  PostgreSQL reports read-only mode. The `psql` path also disables `.psqlrc` and
  `.pgpass`; the driver path separately sets the session to read-only and rolls
  the transaction back after the catalog query.
- Output is written with mode `0600` under the ignored
  `artifacts/live-schema-captures/` directory.

## Prerequisites

Use either of these local clients:

- PostgreSQL client tools with `psql` available. This path is preferred when
  both clients are installed.
- The pinned `psycopg2-binary` dependency from `backend/requirements.txt`. This
  is used automatically when `psql` is unavailable and does not require a
  separate PostgreSQL client installation.

Obtain a database role that can read PostgreSQL catalogs. When
`supabase_migrations.schema_migrations` exists, the capture includes its rows;
otherwise it records `migration_history_available = false` and an empty history.
The command does not require or read `SUPABASE_ACCESS_TOKEN`, anon keys, service
role keys, or any repository `.env` file. Both client paths pass the password
separately from the validated URL and suppress remote error details.

## Validate Without Connecting

Enter a passwordless direct or pooler URL. Then provide the password through a
silent prompt:

```bash
export PHARMA_SCHEMA_CAPTURE_DATABASE_URL='postgresql://postgres.jfrairkkzxwkhbtqejnz@POOLER_HOST:6543/postgres'
read -rsp 'Database password: ' PGPASSWORD && export PGPASSWORD && printf '\n'

python3 backend/scripts/capture_supabase_schema.py \
  --project-ref jfrairkkzxwkhbtqejnz \
  --validate-only
```

`--validate-only` performs no network operation.

## Capture

```bash
python3 backend/scripts/capture_supabase_schema.py \
  --project-ref jfrairkkzxwkhbtqejnz
```

The command prints three repository-relative paths:

- the catalog JSON artifact
- its SHA-256 checksum file
- metadata containing the project ref, SQL checksum, read-only proof, and row
  counts for each catalog section

When `psql` is absent, the psycopg2 fallback executes only the validated final
catalog `WITH ... SELECT` statement. Connection options force
`default_transaction_read_only=on`, `set_session` enforces repeatable-read and
read-only mode, and the returned JSON must still prove
`transaction_read_only = 'on'` before any artifact is written.

Immediately remove the password from the shell environment:

```bash
unset PGPASSWORD PHARMA_SCHEMA_CAPTURE_DATABASE_URL
```

Verify the artifact before review:

```bash
cd artifacts/live-schema-captures
shasum -a 256 -c supabase-jfrairkkzxwkhbtqejnz-*.sha256
```

Do not change `database/schema-authority.json` to `production_ready` from this
capture alone. Review tables, constraints, RLS, policies, triggers, functions,
grants, and migration history; reconcile the approved result into the canonical
Alembic baseline separately.
