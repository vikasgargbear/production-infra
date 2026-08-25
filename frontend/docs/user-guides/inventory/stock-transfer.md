# Stock Transfer

Use Stock Transfer to move released, saleable stock between two branches in the
same organization. A canonical transfer is one reviewed, atomic posting: the
source balance decreases and the destination balance increases together. It
does not create a separate in-transit or receiving step.

## Before you start

You need transfer, inventory-posting, and command execution access to both the
source and destination branches. The source and destination must also be:

- Different active branches and different active locations.
- Saleable locations that allow sales and do not allow negative stock.
- Governed by the same storage-temperature bounds.

Only released, non-expired, non-recalled stock without another pending movement
is eligible. The transfer date comes from the organization's business timezone;
the browser clock is not the posting authority.

Cold-chain and NDPS-regulated products are excluded from this ordinary transfer
workflow. The canonical command does not yet create the temperature-chain or
controlled-substance register, licence, and handling evidence those movements
require. Use the relevant governed workflow when that authority is available.

## Create and post a transfer

1. Go to **Inventory → Stock Transfer**.
2. Select the source branch and saleable source location.
3. Select a different destination branch and a compatible saleable destination
   location.
4. Search for a product and select its unit of measure.
5. Enter the requested quantity.
6. Review the batch allocation. The form allocates the requested quantity by
   FEFO by default.
7. If needed, adjust the allocation manually. Manual allocation may use more
   than one batch only when every selected batch has the same earliest eligible
   expiry date. Later-expiry stock cannot be selected while earlier eligible
   stock remains.
8. This UI currently records an in-person movement at an exact distance of
   `0.00`. Other transport modes are not exposed here.
9. Review the exact quantity and inventory value preview, then confirm and post.

The same user confirmation supplies the required actor approval. A successful
post returns one transfer number and exact readback evidence for both sides of
each line.

## Verify the result

The posted readback shows:

- Source and destination branch and location identifiers.
- The product and manufacturer batch that moved.
- Equal and opposite six-decimal quantities.
- The same four-decimal unit cost on both sides.
- Equal and opposite two-decimal inventory values.

Stock Hub should then show the source batch reduced and the destination batch
increased by the same quantity and value. Replaying the same approved command
does not post another document or duplicate ledger entries.

## When a transfer is unavailable

The form excludes locations that are quarantined, non-saleable, configured for
negative stock, or temperature-incompatible. If an eligible batch disappears,
refresh the stock context: another posting, recall, expiry, or pending movement
may have changed its authority.

A submitted command also fails closed if either branch permission, the exact
preview, the selected batch balance, the document sequence, or the organization
business date changes before execution. Refresh the form and prepare a new
reviewed transfer rather than retrying stale values.

## Important limitations

- Canonical Stock Transfer is inter-branch only. Use the appropriate inventory
  workflow for movement within one branch.
- Partial receipt and a separate receive confirmation are not part of this
  atomic workflow.
- A posted transfer is immutable. Use an approved correction workflow when a
  physical discrepancy must be recorded.

Related guides: [Managing Stock](./managing-stock.md) and
[Batch & Expiry](./batch-expiry.md).
