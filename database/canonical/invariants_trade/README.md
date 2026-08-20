# Trade-domain invariant contract

This directory owns reviewed executable mappings for cross-row invariants in
`inventory`, `sales`, and `procurement`.

- `generate_trade_contract.py` is the deterministic source.
- `baseline-trade-enforcements.json` is auto-discovered by the canonical
  baseline and PostgreSQL 15 gates.
- `trade-invariants-manifest.json` gives every catalog invariant exactly one
  disposition: executable or explicitly blocked.

Regenerate after an intentional trade-domain catalog change:

```bash
python3 database/canonical/invariants_trade/generate_trade_contract.py
```

The resolved layer enforces referenced location/batch identity, reservation
capacity and lifecycle, billed/free quantity conversion and cumulative caps,
allocation caps, posted allocation immutability, and direct-invoice issue
exclusivity. All concurrency-sensitive caps take deterministic transaction
locks before reading the aggregate.

The mapping intentionally adds no inventory ledger or balance writer. Exact
commercial calculation, posting fan-out, returns with final cumulative
rounding residuals, and moving-weighted-average landed costing stay blocked
until reviewed idempotent command functions own those mutations and all needed
allocation evidence is persisted. A row trigger or caller-set session flag is
not an acceptable substitute for single mutation ownership.
