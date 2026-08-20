# Commercial posting authority

This fragment owns the design boundary for the eight invoice and return
invariants left by `commands_trade_v2`. The no-new-table catalog corrections and
typed posting functions are emitted as one deterministic enforcement map.

This module owns five typed, idempotent aggregate posting commands:

- `post_sales_invoice`
- `post_supplier_invoice`
- `post_sales_return`
- `post_purchase_return`
- `post_adjustment_note`

Allocated sales dispatches use `post_dispatch_inventory_valuation` after the
typed inventory issue posts and before invoice posting. It creates no stock
facts; it derives COGS from the locked stock ledger and owns the one typed
inventory-valuation journal/event required by the allocated invoice path.

Each command must consume the fixed `calculation.artifacts` envelope, compose
the existing typed inventory writer, and atomically create tax, journal,
accounting-event and open-item/adjustment evidence. Account roles resolve from
active `core.settings` rows and fail closed if the setting or active account is
missing. COGS comes only from posted stock-ledger value deltas.

Generate or verify the deterministic artifacts:

```bash
python3 database/canonical/commands_commercial/generate_commercial_commands.py
python3 database/canonical/commands_commercial/generate_commercial_commands.py --check
```

The PostgreSQL fixture is rollback-only. It verifies the fixed security context,
all four command entry points, signed rounding reversals, component-wise RCM
reversal, allocated-dispatch valuation ownership, and changed-MWA purchase-return
variance routing.

Return and adjustment artifacts carry an explicit `gst_tax_treatment`. A
`statutory` sales decrease requires an effective imported GST adjustment rule
and retained, verified recipient ITC-reversal evidence; a statutory purchase
decrease requires the supplier's reconciled portal credit-note line. The buyer's
purchase-return debit note is therefore never used as supplier-issued section
34 evidence. A `commercial_only` credit preserves the exact financial credit
calculated from the original price basis while producing zero GST adjustment
and no `tax.documents` row. Effective rules determine statutory deadlines; no
deadline is hardcoded in command SQL.

Posted return and adjustment reversal currently fails closed. Reversal needs a
separate compensating-note artifact and command so immutable tax, open-item,
inventory and journal facts reverse exactly once; changing a posted status is
not accepted as a substitute.

The same authority now posts invoice-linked generic credit/debit notes. It binds
an approved adjustment note to exact calculation bytes, locks typed original
invoice lines and their tax/open-item context, enforces original-plus-increase
cumulative ceilings, and atomically creates the signed tax document, balanced
journal, accounting event, allocation, and any residual open item.

Tax on service advances is explicitly deferred from this India pharma-goods v1
release. A generic `finance.payments` row cannot represent multi-rate service
advance tax evidence, so `tax.documents` deliberately has no taxable-advance
source class. Adding it later requires a reviewed typed taxable-advance owner;
payments must never be treated as an implicit tax snapshot.
