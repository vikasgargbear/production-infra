type BatchValuationRow = {
  quantity_available?: unknown;
  cost_per_unit?: unknown;
};

/** Return null when any row lacks canonical cost; partial totals are misleading. */
export const calculateCompleteBatchValuation = (batches: BatchValuationRow[]): number | null => {
  if (batches.length === 0) return 0;
  if (!batches.every(batch => (
    batch.cost_per_unit !== null
    && batch.cost_per_unit !== undefined
    && batch.cost_per_unit !== ''
    && Number.isFinite(Number(batch.cost_per_unit))
  ))) return null;
  return batches.reduce(
    (sum, batch) => sum + (Number(batch.quantity_available ?? 0) * Number(batch.cost_per_unit)),
    0,
  );
};
