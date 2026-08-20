# Canonical core command boundary

This directory owns reviewed PostgreSQL 15+ command and trigger enforcement
for the locally provable blockers left by `invariants_agent`.

Generate the deterministic mapping and manifest with:

```bash
python3 database/canonical/commands_core/generate_core_commands_contract.py
```

The four runtime functions are private `SECURITY DEFINER` boundaries with an
empty search path, exact tenant/actor/permission checks, optimistic row
versions, canonical JSON request hashes, and durable `core.idempotency_keys`
responses. Transaction-local scope rows prevent direct counter, setting-value,
or commercial-term mutation. Normal row auditing remains owned by
`erp_plumbing.audit_row_mutation`.

The manifest deliberately leaves four blockers unresolved. The current model
does not persist parent agent ceilings, typed command intent and serializer
evidence, a shared operation dispatcher, or reviewed legal classification
data. Opaque bytes and inferred consent are not substitutes for those facts.

`test_core_commands_rollback.sql` verifies the installed privilege and trigger
surface and always rolls back.
