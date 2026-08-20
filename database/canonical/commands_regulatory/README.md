# Regulatory reference and product activation boundary

This fragment does not ship or invent CDSCO, NDPS, Schedule H2, HSN, GST,
cess, TDS, or withholding rows. The regulated ledgers deploy empty and remain operationally blocked
until an operator imports reviewed official artifacts.

`erp_regulatory_importer` is a separate `LOGIN NOINHERIT NOBYPASSRLS`
principal. Its three import functions accept only reviewed authority/host pairs,
verify exact source and canonical-dataset bytes against SHA-256, require
immutable object-storage coordinates and an active `core.users` reviewer, and
replace one complete typed dataset in a transaction. None is granted to the
application, runtime, browser, or MCP roles.

The withholding importer accepts one fixed canonical schema for effective-
dated applicability, thresholds, aggregation, basis, rates, and deposit policy.
It rejects overlapping rows for the same rule/applicability dimensions and
atomically retires the prior release. The catalog and importer contain no legal
rule rows; an official reviewed dataset is still an operator prerequisite.

Before calling an import function, the deployment operator must upload both
artifacts to the recorded immutable object paths, read them back, and verify the
same hashes supplied to PostgreSQL. The database proves the command bytes and
retains retrieval coordinates; it cannot independently fetch Supabase Storage.

Superseding ingredient classifications blocks every active product composed
from the prior release. Superseding HSN data blocks active products whose HSN is
absent from the new effective release. Sales and receipt line guards reject a
product whose active regulatory or HSN authority is no longer effective.
Approval/posting transition guards recheck the same readiness after draft lines
have been created.

`activate_product` is the only runtime command. It derives Drugs Rules schedule,
prescription requirement, NDPS control, and H2 applicability from the single
active ingredient release; validates the product HSN against the active tax
release; requires H2 traceability evidence when effective; and stores release
provenance. It does not store a mutable current GST rate. Posting commands must
resolve and snapshot `tax_code_version_id` by the business document date.

Regenerate and test with:

```sh
python3 database/canonical/commands_regulatory/generate_regulatory_commands.py
pytest -q backend/tests/unit/test_canonical_regulatory_commands.py
```

`test_regulatory_commands_rollback.sql` is for the complete PostgreSQL 15
baseline and always rolls back.
