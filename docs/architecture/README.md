# Production Architecture Decisions

This directory defines the target boundaries for making PharmaERP safe to expose
to web, mobile, and agent clients. These documents are design gates, not claims
that the target state is already implemented.

## Documents

- [India compliance rules](india-compliance-rules.md): effective-dated GST and
  pharmaceutical rule ownership, evidence, and missing release gates.
- [MCP readiness](mcp-readiness.md): the agent-facing contract, authorization,
  approvals, idempotency, and audit requirements.
- [`mcp-operator-actions.json`](mcp-operator-actions.json): machine-readable
  day-to-day prepare, approve, execute, and status contract; the reviewed
  bounded subset is published while transfer and destruction remain fail-closed.
- [Hosting options, August 2026](hosting-options-2026-08.md): the accepted Render
  internal pilot, production promotion options, and hosted MCP OAuth gates.
- [Repository boundaries](repository-boundaries.md): the frontend/backend split
  and migration sequence.
- [Authentication boundary](authentication.md): cloud identity verification,
  canonical tenant membership resolution, and ERP session authority.
- [Data model for agents](data-model-for-agents.md): rules for deciding whether
  to retain, merge, split, or retire tables.
- [Canonical data model](canonical-data-model.md): the reviewed wholesale ERP
  topology, relation cardinalities, type policy, and reset gates. The
  machine-readable contract owns the current table count.
- [`canonical-data-model.json`](canonical-data-model.json): machine-readable
  topology authority and exhaustive disposition of the 184 live app relations.
- [`canonical-field-dictionary.json`](canonical-field-dictionary.json):
  generated definitions, types, classifications, constraints, relationships,
  and semantic IDs for every fully qualified canonical field.
- [`app-data-contract.json`](app-data-contract.json): application workflow and
  MCP operation ownership mapped to the canonical model.
- [`runtime-environment-contract.json`](runtime-environment-contract.json):
  machine-readable environment-variable names, meanings, formats, defaults,
  secret boundaries, and cross-service reuse rules.
- [Legacy retirement](legacy-retirement.md): dependency-evidenced dead-code and
  compatibility cleanup, including canonical agent action mappings.
- [`legacy-surface-inventory.yaml`](legacy-surface-inventory.yaml):
  machine-readable evidence for retired and unresolved compatibility surfaces.
- [`frontend-calculation-inventory.yaml`](frontend-calculation-inventory.yaml):
  migration state for client-side business-rule calculations.
- [`frontend-router-inventory.yaml`](frontend-router-inventory.yaml):
  evidence for retiring the unused router dependency and the gates for future
  URL-based navigation.
- [`spreadsheet-dependency-inventory.json`](spreadsheet-dependency-inventory.json):
  browser spreadsheet input/output contracts, security boundary, and pinned
  SheetJS distribution evidence.
- [`document-number-data-model-inventory.yaml`](document-number-data-model-inventory.yaml):
  machine-readable number ownership, canonical data-model mappings, retired
  duplication, and residual live-schema gates.

## Release gates

Do not advertise agent integrations as production-ready until all of the
following are enforced by CI and exercised against a production-like database:

1. One versioned backend contract is used by frontend, MCP, and other clients.
2. Every exported operation has an owner, permission, risk class, tenant rule,
   branch rule, input/output schema, and test coverage.
3. No client can supply or override `org_id`; it is derived from the grant.
4. High-impact writes implement preview, approval, idempotency, atomic audit,
   and concurrency checks.
5. Posted financial and compliance records are append-only or reversed by an
   explicit compensating document.
6. Tenant and branch isolation tests fail closed for reads, writes, exports,
   background jobs, and agent calls.
7. OpenAPI and generated architecture documentation are reproducible in CI and
   drift causes the build to fail.
8. Compatibility and legacy surfaces have an owner and expiry; deletion follows
   the evidence and rollback protocol in `legacy-retirement.md`.
