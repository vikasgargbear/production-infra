# Reviewed stable-invariant follow-up

This directory is an isolated review of the 15 blockers previously listed in
`database/canonical/invariants/stable-invariants-manifest.json`. Its generated
mapping composes with, and does not replace, the existing stable mapping.

Five requirements are executable in PostgreSQL 15 from facts already present:

- organization lifecycle and fail-closed post-closure immutability;
- product lifecycle and fail-closed post-first-use regulatory/composition edits;
- a current composition before a medicine is active;
- distinct, currently authorized command approvers; and
- versioned, deterministic audit-event hashing and one chain per organization.

The audit evidence algorithm `pg-jsonb-sha256-v1` is the canonical plumbing's
SHA-256 digest of a PostgreSQL `jsonb` object containing: version,
organization, chain sequence, request, command request, actor membership,
actor kind, event type, resource type, resource, mutation kind, before-state
hash, after-state hash, and previous-event hash. The validator holds the same
organization-scoped advisory transaction lock (salt `9042026`) and rejects a
sequence, prior hash, or evidence hash that differs from the plumbing output.
It does not allocate or define a second hashing algorithm. Database unique
constraints and indexes reject duplicate sequence numbers, evidence hashes,
and forks.

The remaining ten requirements stay blocked. SQL must not invent CDSCO/NDPS
classifications, approval ceilings, opaque command semantics, source-state
serialization, idempotent sequence ownership, or audit lineage that the model
does not persist. Lifecycle fragments alone are not presented as full
enforcement of those compound requirements.

Regenerate and run focused tests with:

```bash
python3 database/canonical/invariants_agent/generate_invariants_agent_contract.py
pytest -q database/canonical/invariants_agent/test_invariants_agent_contract.py
```
