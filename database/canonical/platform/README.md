# Canonical platform contract

Status: **reviewed foundation, not applied**. Nothing in this directory connects
to Supabase. The mapping is designed to compose with the independent security
and future invariant mappings.

Generate or verify deterministic artifacts:

```bash
python3 database/canonical/platform/generate_platform_contract.py
python3 database/canonical/platform/generate_platform_contract.py --check
```

`baseline-platform-enforcements.json` resolves exactly 15 baseline blockers:
the absence preflight for all 12 canonical schemas, the `auth.users` UUID key
eligibility preflight, and exact seeds for the application-owned permission and
unit vocabularies. Permission risk classes are an exhaustive reviewed mapping;
a new catalog permission makes generation fail until classified.

`core.reference_data_releases`, `catalog.ingredients`, and
`tax.tax_code_versions` use the reviewed `regulated_import` population mode.
The schema deploys them empty; they are not baseline seed blockers. Runtime and
MCP roles remain SELECT-only, and only the isolated regulatory importer can
populate exact reviewed releases. Product activation and product-bearing
posting fail closed until effective ingredient and HSN/SAC releases exist. The
generator never invents ingredient, schedule, HSN/SAC, GST, or cess values.

`trigger-foundations.sql` provides a migration-only binding registry, a generic
mutation rejection trigger helper, and a transactional idempotent outbox enqueue
helper. It resolves **zero** trigger blockers. Exact immutability bindings,
canonical before/after audit evidence, and owned integration-event bindings are
still required. Runtime roles receive no access to the plumbing schema here.

Compose the disjoint reviewed fragments for a blocker report:

```bash
python3 backend/scripts/generate_canonical_baseline.py --draft \
  --enforcement-map database/canonical/security/baseline-platform-enforcements.json \
  --enforcement-map database/canonical/platform/baseline-platform-enforcements.json
```

The default command without `--draft` still refuses SQL output. That refusal is
the intended release behavior until every trigger binding and domain invariant
is reviewed and executable; regulated dataset population is a separate
operational-readiness gate.

The PostgreSQL 15 gate discovers disjoint mapping fragments named
`database/canonical/**/baseline-*-enforcements.json`, rejects duplicate keys,
generates without `--draft`, and only then applies SQL to the guarded local
`canonical_ci` database. Keep future invariant/trigger mappings on that naming
contract; the gate never accepts a live host or database name.
