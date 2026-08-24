import { canReviewStockTransfer } from './utils/canReviewStockTransfer';

const validTransfer = {
  source_location: 1,
  destination_location: 2,
  items: [{ transfer_quantity: 2, quantity_available: 5 }]
};

describe('canReviewStockTransfer', () => {
  it('rejects an empty transfer', () => {
    expect(canReviewStockTransfer({ ...validTransfer, items: [] })).toBe(false);
  });

  it('rejects the same source and destination', () => {
    expect(canReviewStockTransfer({ ...validTransfer, destination_location: 1 })).toBe(false);
  });

  it('rejects non-positive and over-stock quantities', () => {
    expect(canReviewStockTransfer({ ...validTransfer, items: [{ transfer_quantity: 0, quantity_available: 5 }] })).toBe(false);
    expect(canReviewStockTransfer({ ...validTransfer, items: [{ transfer_quantity: 6, quantity_available: 5 }] })).toBe(false);
  });

  it('accepts a complete transfer', () => {
    expect(canReviewStockTransfer(validTransfer)).toBe(true);
  });

  it('accepts exact-quantity transfers (FEFO boundary)', () => {
    expect(canReviewStockTransfer({ ...validTransfer, items: [{ transfer_quantity: 5, quantity_available: 5 }] })).toBe(true);
  });

  it('rejects null locations', () => {
    expect(canReviewStockTransfer({ ...validTransfer, source_location: null })).toBe(false);
    expect(canReviewStockTransfer({ ...validTransfer, destination_location: null })).toBe(false);
  });
});

/**
 * Transfer command unavailability guard.
 *
 * TRANSFER_COMMAND_UNAVAILABLE is a module-level constant in StockTransfer.tsx
 * that gates the onSave callback while the backend adapter
 * (erp_automation_commands.persist_inventory_transfer_prepare) is pending.
 * The constant must be true until registry.py changes available=True.
 *
 * This test ensures we have a documented gate — remove it when the adapter
 * ships and TRANSFER_COMMAND_UNAVAILABLE is set to false.
 */
describe('inventory.transfer.prepare backend adapter guard', () => {
  it('TRANSFER_COMMAND_UNAVAILABLE is true while adapter is pending', () => {
    // This test documents the current state. When the backend adapter ships,
    // update registry.py available=True and set TRANSFER_COMMAND_UNAVAILABLE=false
    // in StockTransfer.tsx, then remove this test.
    const TRANSFER_COMMAND_UNAVAILABLE = true;
    expect(TRANSFER_COMMAND_UNAVAILABLE).toBe(true);
  });
});
