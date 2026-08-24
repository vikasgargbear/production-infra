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
});
