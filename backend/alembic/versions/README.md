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

`20260824_0002_sales_invoice_fefo_expiry_equivalence.py` is the first
incremental revision. It preserves the applied baseline and replaces only the
reviewed FEFO block in `resolve_sales_invoice_prepare`. The replacement is
hash-bound, checks its exact predecessor, and can upgrade an existing
`20260820_0001` database without reset or business-data mutation. It treats all
released lots sharing the earliest expiry date as one FEFO tier; later tiers
remain unavailable until earlier-tier stock is fully allocated.

`20260825_0003_gst_reporting_rules.py` adds the reviewed-reference boundary for
date-effective GSTR-1 classification. It deliberately seeds no statutory
threshold: a reviewed `gst_reporting_rules` release and non-overlapping rule
records must be loaded through the governed reference-data process before a
GSTR-1 report containing B2C supplies is available.

The existing isolated import pattern is `erp_regulatory_commands.stage_release`
→ typed dataset validation/insertion → `erp_regulatory_commands.finish_release`,
called only as `erp_regulatory_importer` with retained source/dataset bytes,
SHA-256 attestations, an active typed reviewer, and a request id. Before this
dataset can be activated, that command boundary must be extended with a typed
`import_gstr1_reporting_release` operation and official GSTN/GST Portal URI
validation. Direct SQL, demo provisioning, and application startup must not
activate this global reference dataset.
