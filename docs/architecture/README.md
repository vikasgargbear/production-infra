# Production Architecture Decisions

This directory defines the target boundaries for making PharmaERP safe to expose
to web, mobile, and agent clients. These documents are design gates, not claims
that the target state is already implemented.

## Documents

- [Production readiness](production-readiness.md): current evidence, release
  blockers, test commands, and the Supabase baseline required for promotion.
- [India compliance rules](india-compliance-rules.md): effective-dated GST and
  pharmaceutical rule ownership, evidence, and missing release gates.
- [MCP readiness](mcp-readiness.md): the agent-facing contract, authorization,
  approvals, idempotency, and audit requirements.
- [Hosting options, August 2026](hosting-options-2026-08.md): the accepted Render
  internal pilot, production promotion options, and hosted MCP OAuth gates.
- [Repository boundaries](repository-boundaries.md): the frontend/backend split
  and migration sequence.
- [Authentication boundary](authentication.md): persistent Supabase login,
  tenant membership resolution, and the target identity model.
- [Data model for agents](data-model-for-agents.md): rules for deciding whether
  to retain, merge, split, or retire tables.
- [Legacy retirement](legacy-retirement.md): dependency-evidenced dead-code and
  compatibility cleanup, including canonical agent action mappings.
- [`legacy-surface-inventory.yaml`](legacy-surface-inventory.yaml):
  machine-readable evidence for retired and unresolved compatibility surfaces.
- [`frontend-calculation-inventory.yaml`](frontend-calculation-inventory.yaml):
  migration state for client-side business-rule calculations.
- [`document-number-data-model-inventory.yaml`](document-number-data-model-inventory.yaml):
  machine-readable number ownership, canonical data-model mappings, retired
  duplication, and residual live-schema gates.

## Current-state snapshot

The snapshot below was taken from the repository on 2026-08-19. It must be
regenerated from source and a live production-like database before any launch
decision.

- FastAPI is the intended backend boundary and publishes `/openapi.json`.
- The checked-in SQL defines about 130 tables across `master`, `parties`,
  `inventory`, `sales`, `procurement`, `financial`, `gst`, `compliance`,
  `analytics`, and `system_config` schemas.
- Route source contains more than 400 HTTP handlers. These are not all suitable
  as MCP tools.
- Tenant identity is carried as `org_id` in JWTs and most business tables.
  Operational access may also be limited by branch.
- Authorization is not expressed uniformly across all route modules. Some use
  `PermissionChecker`, some use JWT organization dependencies, and some rely on
  other tenant-aware helpers.
- The unregistered RLS middleware and its unsigned organization-header fallback
  have been retired. Live database RLS coverage is still unverified until a
  reviewed Supabase baseline is available.
- Payment create paths have a temporary fail-closed idempotency proof backend;
  the dedicated database store and remaining payment mutations are still gated.

These observations make a direct MCP-to-database adapter, direct OpenAPI import,
or broad exposure of existing routes unacceptable for production.

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
