# Stable-domain invariant contract

This directory owns reviewed executable mappings for cross-row invariants in
`core`, `parties`, `catalog`, `hr`, and `automation`. It does not claim that the
canonical baseline is deployable.

- `generate_stable_contract.py` is the source of the deterministic artifacts.
- `baseline-stable-enforcements.json` is auto-discovered by the baseline and
  disposable PostgreSQL 15 gates.
- `stable-invariants-manifest.json` lists every resolved invariant and every
  invariant still blocked by missing persisted facts or command orchestration.
- `test_stable_invariants.sql` is a post-baseline disposable-database fixture.

Regenerate artifacts after an intentional stable-domain catalog change:

```bash
python3 database/canonical/invariants/generate_stable_contract.py
```

The mapping is fail-closed. Every resolved entry is bound to the SHA-256 of the
exact catalog rule and the baseline generator rejects stale or duplicate keys.
`btree_gist` extension creation is owned only by the product-ingredient overlap
entry; other invariant fragments must not create it again.

The SQL uses static schema-qualified references, fixed empty function search
paths, `SECURITY INVOKER`, private trigger functions, and no dynamic SQL. The
only runtime-callable function is the atomic idempotency claim API. Requirements
that need facts absent from the model remain blockers, especially approved
version lineage, audit links, MCP consent ceilings, command branch/amount/read
sensitivity, approver permission identity, and shared application command
dispatch.
