import { apiHelpers } from '../../apiClient';
import { compareExactDecimals } from '../../../../utils/exactDecimal';

export interface MigrationBundle {
  schema_version: 'aasopharma.marg-migration.v1';
  organization_id: string;
  branch_id: string;
  location_id: string;
  dataset_id: string;
  opening_date: string;
  import_requests: Array<{ facts: unknown[]; [key: string]: unknown }>;
  exclusions?: Record<string, unknown>;
}
export interface MigrationReview {
  counts_by_kind: Record<string, number>;
  quarantined_by_kind: Record<string, number>;
  facts: number;
  request_batches: number;
  expected: { products: number; batches: number; openings: number; quantity: string; value: string; receivable: string; payable: string };
}
const base = '/canonical/migration-history';
const exact = { preserveExactDecimals: true };
export const migrationApi = {
  review: async (bundle: MigrationBundle): Promise<MigrationReview> => (
    await apiHelpers.post<MigrationReview>(`${base}/bundle-review`, bundle, exact)
  ).data,
  importBatch: async (batch: MigrationBundle['import_requests'][number]) => (
    await apiHelpers.post<{ accepted: number }>(`${base}/facts`, batch, exact)
  ).data,
  parties: async (bundle: MigrationBundle) => (
    await apiHelpers.post<{ complete: boolean; parties_remaining: number; openings_remaining: number }>(`${base}/operational-cutover`, {
      dataset_id: bundle.dataset_id, batch_size: 500,
      confirmation: `PROMOTE-HISTORY:${bundle.organization_id}:${bundle.dataset_id}`,
    }, exact)
  ).data,
  inventory: async (bundle: MigrationBundle) => (
    await apiHelpers.post<{ complete: boolean; products_remaining: number }>(`${base}/product-inventory-cutover`, {
      dataset_id: bundle.dataset_id, location_id: bundle.location_id, batch_size: 100,
      confirmation: `PROMOTE-HISTORICAL-INVENTORY:${bundle.organization_id}:${bundle.dataset_id}:${bundle.location_id}`,
    }, exact)
  ).data,
  status: async (dataset: string) => {
    const config = { ...exact, params: { dataset_id: dataset } };
    const [parties, inventory] = await Promise.all([
      apiHelpers.get<Record<string, unknown>>(`${base}/operational-cutover`, config),
      apiHelpers.get<Record<string, unknown>>(`${base}/product-inventory-cutover`, config),
    ]);
    return { parties: parties.data, inventory: inventory.data };
  },
};

export async function runMigration(
  bundle: MigrationBundle, review: MigrationReview,
  progress: (message: string) => void, stop: () => boolean,
) {
  const checkStop = () => { if (stop()) throw new Error('Paused. Completed batches are retained. Resume with the same package.'); };
  // Always replay the same identities: no browser checkpoint or unsafe skipped batch.
  for (const [index, batch] of bundle.import_requests.entries()) {
    checkStop(); progress(`Checking import batch ${index + 1} of ${bundle.import_requests.length}`);
    const receipt = await migrationApi.importBatch(batch);
    if (receipt.accepted !== batch.facts.length) throw new Error('Import receipt differs from the package. No further batches were sent.');
  }
  const converge = async (label: string, step: () => Promise<{ complete: boolean; remaining: number }>) => {
    let previous = Infinity;
    for (let index = 0; index < 10000; index += 1) {
      checkStop(); progress(`${label} — batch ${index + 1}`);
      const value = await step();
      if (!Number.isSafeInteger(value.remaining) || value.remaining < 0 || (value.complete && value.remaining !== 0)) {
        throw new Error(`${label}: invalid completion receipt.`);
      }
      if (value.complete) return;
      if (value.remaining >= previous) throw new Error(`${label}: no further progress. Resolve the rejected records before resuming.`);
      previous = value.remaining;
    }
    throw new Error(`${label}: batch limit reached. Review before resuming.`);
  };
  await converge('Creating parties and opening balances', async () => {
    const value = await migrationApi.parties(bundle);
    return { complete: value.complete, remaining: value.parties_remaining + value.openings_remaining };
  });
  if (review.expected.products) await converge('Creating products and opening stock', async () => {
    const value = await migrationApi.inventory(bundle);
    return { complete: value.complete, remaining: value.products_remaining };
  });
  checkStop(); progress('Verifying stock and opening balances');
  const status = await migrationApi.status(bundle.dataset_id);
  checkStop();
  const { inventory, parties } = status;
  const expected = review.expected;
  const countsMatch = inventory.source_products === expected.products && inventory.bound_products === expected.products
    && inventory.source_batches === expected.batches && inventory.bound_batches === expected.batches
    && parties.source_openings === expected.openings && parties.posted_openings === expected.openings
    && typeof parties.bound_parties === 'number' && typeof parties.source_parties === 'number'
    && parties.bound_parties >= parties.source_parties;
  if (!countsMatch) throw new Error('Imported record counts do not reconcile. Review the dataset before using it.');
  for (const [actual, source, scale] of [
    [inventory.opening_quantity, expected.quantity, 6], [inventory.ledger_quantity, expected.quantity, 6],
    [inventory.opening_value, expected.value, 2], [inventory.ledger_value, expected.value, 2],
    [parties.receivable, expected.receivable, 2], [parties.payable, expected.payable, 2],
  ] as const) {
    if (typeof actual !== 'string' || compareExactDecimals(actual, source, 'Migration reconciliation', { scale, allowNegative: true }) !== 0) {
      throw new Error('Stock or opening balances do not reconcile. Review before using the imported data.');
    }
  }
  return status;
}
