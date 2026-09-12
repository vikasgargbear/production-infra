# Reviewed batch selling rates

`inventory.batch_sale_rate.prepare` uses the shared operator prepare, exact-preview
approval and execution lifecycle. The named SQL command appends a versioned price
to `inventory.batch_sale_rate_evidence`; it does not alter batches, stock, valuation,
posted documents or historical migration facts. UI and MCP use the same payload.

The amount is a selling price per exact canonical base unit, tax exclusive. MRP
and purchase cost are never substitutes. The latest applicable saved version wins
over imported price suggestions. An invoice-specific price remains separate.

`operator_review` records a human-selected price and reason. `migration_source`
also binds the immutable batch and corroborating historical sale identities and
hashes, matching product, batch, dataset, branch, rate and exclusive-tax arithmetic.
Its external file references, raw unit and basis are **operator-reviewed evidence**,
not a server attestation that an external file was read or authenticated. Unknown
or mismatched units must be resolved rather than relabeled. Migration prices must
be positive; an explicitly reviewed manual zero price is allowed.

Read context is available at `/api/canonical/batch-sale-rates/context`, restricted
to `catalog.product.manage` and the authorized branch. Source sale proofs are
bounded review candidates, not a declaration that every candidate qualifies.
Exact persisted prices are read back at `/api/canonical/batch-sale-rates/reviews/{command_id}`.

The new capability is not automatically added to Live18 grants. Existing pilot
grants need a separately authorized capability update before live acceptance.
Migration 0079 must complete before deploying the application that requires it.
