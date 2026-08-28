# Canonical Hosted Verification

This index identifies the maintained exact-SHA verification surfaces. It is not
itself release evidence, and it must not be used to run writes against a real
operating organization.

## Authority

- `.github/workflows/production-readiness.yml` orchestrates deployment,
  disposable identity provisioning, browser acceptance, reconciliation, and
  cleanup for one reviewed commit.
- `.github/workflows/canonical-staging.yml` and
  `.github/workflows/railway-canonical-staging.yml` define provider-specific
  deployment and database boundaries. Provider configuration does not change
  the application contract.
- `backend/tests/live_acceptance/operation_matrix.json` defines the 18 required
  business operations and their authoritative readbacks and relations.
- `docs/testing/canonical-live18-acceptance.md` defines the evidence and review
  rules.

## Executable layers

- `frontend/e2e/live18/` drives each operation through the deployed UI.
- `backend/tests/live_acceptance/` reconciles browser evidence with REST, MCP,
  and direct PostgreSQL evidence.
- `backend/tests/live_canonical/` verifies canonical operator journeys and
  transport/readback consistency.
- `backend/tests/unit/` enforces mounted-route, schema, identity, deployment,
  retirement, and fail-closed contracts.

The workflow must compile fixture facts from authoritative staging identities
and database state. Fixed organization, branch, user, document, or resource IDs
are prohibited. Railway resolves facts inside its direct-IPv6 service boundary;
Render uses its reviewed database-resolution path. Neither provider may silently
fall back to a different database or deployment SHA.

## Required release evidence

A release claim requires all of the following for the same commit:

1. The API, frontend, and MCP services publish the reviewed SHA.
2. The canonical migration head and runtime-role/RLS checks pass.
3. Disposable canonical users, membership, grants, organization, and branch are
   provisioned by the workflow.
4. All 18 browser operations reach prepare, review/approval when required,
   execute, and authoritative readback.
5. REST, MCP, and PostgreSQL identifiers and business totals reconcile.
6. Replay, stale-preview, cross-tenant, and self-approval denials pass where
   applicable.
7. Evidence is hash-bound to the workflow run, reviewer, timestamp, identities,
   deployment SHA, and migration head.
8. The disposable identities and records are cleaned up and the write fence is
   restored even after a failure.

Public `/health` and `/ready` responses, unit tests, an authenticated home page,
or a successful deploy alone do not satisfy these requirements.

## Safety

Use only protected workflow secrets. Do not paste bearer tokens, database URLs,
service-role keys, OAuth codes, or business payloads into commands, logs, docs,
or browser storage. Do not reuse disposable staging evidence as proof for a
different commit or provider.
