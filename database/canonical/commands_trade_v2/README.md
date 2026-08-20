# Canonical trade posting follow-up

This fragment composes with `commands_trade` and resolves the inventory facts
that became enforceable after the canonical catalog gained explicit landed-cost
treatment and allocation evidence.

It adds no stock-ledger writer or stock-balance projector. The landed-cost
command calls `erp_trade_commands.emit_entry`, which remains the only ledger
writer and invokes the existing projector. The follow-up owns:

- exact eligible product-price-variance and capitalized-charge pools;
- deterministic direct, quantity-weighted, or value-weighted allocation with
  the final paise assigned to the last stable line;
- positive-on-hand and nonnegative-value moving-weighted-average adjustments;
- exact inverse zero-quantity reversal entries; and
- deferred one-source/one-inventory-document ownership across dispatches,
  direct invoices, returns, receipts, supplier landed cost, and destructions;
- exact sales-order and purchase-order input/output comparison against the
  independently issued `calculation.artifacts` envelope; and
- one-time, permission-scoped order approval and immutable approved terms.

The order flow preclaims through `core.claim_idempotency_key`, issues through
the separately authenticated calculator, then locks, compares, consumes, and
approves on the same claim. Invoices, supplier invoices, and returns remain
blocked here: their catalog rules also require exact tax, open-item, accounting,
and typed inventory effects. This fragment does not invent parallel writers for
those domains or treat an application-supplied digest as proof.

Generate or check the artifacts with:

```sh
python3 database/canonical/commands_trade_v2/generate_trade_posting_contract.py
python3 database/canonical/commands_trade_v2/generate_trade_posting_contract.py --check
```

`test_trade_posting_rollback.sql` is discovered by the PostgreSQL 15 canonical
CI gate and always rolls back.
