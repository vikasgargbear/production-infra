# Versioned migrations

`20260820_0001_canonical_v1.py` is the first reviewed canonical migration. Its
SQL is generated only by `generate_canonical_baseline.py --enforcement-root
database/canonical`, checked in under `alembic/sql`, and bound to a SHA-256
manifest. The revision verifies that manifest and removes only the generator's
outer transaction pair so Alembic owns the complete migration transaction.

This package has not been applied to the live Supabase project. Applying it
requires the exact reviewed hash in `CANONICAL_BASELINE_APPROVED_SHA256`, the
bootstrap migration-principal preflight, and the reset procedure in
`database/canonical/RESET_AND_BASELINE.md`. Downgrade fails closed; recovery is
the separately approved restore/reset workflow.
