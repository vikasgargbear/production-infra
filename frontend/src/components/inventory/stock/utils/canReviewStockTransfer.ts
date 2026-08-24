export interface ReviewableStockTransfer {
  source_location: number | null;
  destination_location: number | null;
  items: Array<{ transfer_quantity: number; quantity_available: number }>;
}

export const canReviewStockTransfer = (transferData: ReviewableStockTransfer): boolean => Boolean(
  transferData.source_location &&
  transferData.destination_location &&
  transferData.source_location !== transferData.destination_location &&
  transferData.items.length > 0 &&
  transferData.items.every(item =>
    Number.isFinite(item.transfer_quantity) &&
    item.transfer_quantity > 0 &&
    item.transfer_quantity <= item.quantity_available
  )
);
