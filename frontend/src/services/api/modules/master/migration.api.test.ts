import { MigrationBundle, MigrationReview, migrationApi, runMigration } from './migration.api';
import { apiHelpers } from '../../apiClient';

jest.mock('../../apiClient', () => ({ apiHelpers: { post: jest.fn(), get: jest.fn() } }));
const bundle: MigrationBundle = {
  schema_version: 'aasopharma.marg-migration.v1', organization_id: 'org', branch_id: 'branch', location_id: 'location',
  dataset_id: 'test-dataset', opening_date: '2026-09-08', import_requests: [{ facts: [{}] }, { facts: [{}] }],
};
const review: MigrationReview = {
  facts: 2, request_batches: 2, counts_by_kind: {}, quarantined_by_kind: {},
  expected: { products: 1, batches: 1, openings: 1, quantity: '1.250000', value: '78.10', receivable: '20.01', payable: '0.00' },
};
const status = () => ({
  parties: { source_parties: 1, bound_parties: 1, source_openings: 1, posted_openings: 1, receivable: '20.01', payable: '0.00' },
  inventory: { source_products: 1, bound_products: 1, source_batches: 1, bound_batches: 1,
    opening_quantity: '1.250000', ledger_quantity: '1.250000', opening_value: '78.10', ledger_value: '78.10' },
});
beforeEach(() => {
  jest.restoreAllMocks(); jest.clearAllMocks();
  jest.spyOn(migrationApi, 'importBatch').mockResolvedValue({ accepted: 1 });
  jest.spyOn(migrationApi, 'parties').mockResolvedValue({ complete: true, parties_remaining: 0, openings_remaining: 0 });
  jest.spyOn(migrationApi, 'inventory').mockResolvedValue({ complete: true, products_remaining: 0 });
  jest.spyOn(migrationApi, 'status').mockResolvedValue(status());
});
test('imports in order and verifies exact readbacks', async () => {
  const progress = jest.fn();
  await expect(runMigration(bundle, review, progress, () => false)).resolves.toEqual(status());
  expect(migrationApi.importBatch).toHaveBeenNthCalledWith(1, bundle.import_requests[0]);
  expect(migrationApi.importBatch).toHaveBeenNthCalledWith(2, bundle.import_requests[1]);
  expect(migrationApi.status).toHaveBeenCalledWith(bundle.dataset_id);
});
test('pause stops before the next write', async () => {
  await expect(runMigration(bundle, review, jest.fn(), () => true)).rejects.toThrow('Paused');
  expect(migrationApi.importBatch).not.toHaveBeenCalled();
});
test('network failure stops downstream posting; resume replays all original identities', async () => {
  (migrationApi.importBatch as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  await expect(runMigration(bundle, review, jest.fn(), () => false)).rejects.toThrow('offline');
  expect(migrationApi.parties).not.toHaveBeenCalled();
  await runMigration(bundle, review, jest.fn(), () => false);
  expect(migrationApi.importBatch).toHaveBeenCalledTimes(3);
});
test('invalid import receipt cannot proceed', async () => {
  (migrationApi.importBatch as jest.Mock).mockResolvedValue({ accepted: 0 });
  await expect(runMigration(bundle, review, jest.fn(), () => false)).rejects.toThrow('receipt differs');
  expect(migrationApi.parties).not.toHaveBeenCalled();
});
test('non-converging and contradictory promotion receipts cannot succeed', async () => {
  (migrationApi.parties as jest.Mock).mockResolvedValue({ complete: false, parties_remaining: 1, openings_remaining: 0 });
  await expect(runMigration(bundle, review, jest.fn(), () => false)).rejects.toThrow('no further progress');
  (migrationApi.parties as jest.Mock).mockResolvedValue({ complete: true, parties_remaining: 1, openings_remaining: 0 });
  await expect(runMigration(bundle, review, jest.fn(), () => false)).rejects.toThrow('invalid completion');
});
test.each(['78.11', 78.1, null])('rejects mismatched or coerced ledger value %s', async value => {
  (migrationApi.status as jest.Mock).mockResolvedValue({ ...status(), inventory: { ...status().inventory, ledger_value: value } });
  await expect(runMigration(bundle, review, jest.fn(), () => false)).rejects.toThrow('do not reconcile');
});
test('rejects incomplete counts even if monetary totals match', async () => {
  (migrationApi.status as jest.Mock).mockResolvedValue({ ...status(), parties: { ...status().parties, posted_openings: 0 } });
  await expect(runMigration(bundle, review, jest.fn(), () => false)).rejects.toThrow('counts do not reconcile');
});
test('review transport preserves decimals and sends package only to the ERP', async () => {
  (apiHelpers.post as jest.Mock).mockResolvedValue({ data: review });
  await expect(migrationApi.review(bundle)).resolves.toEqual(review);
  expect(apiHelpers.post).toHaveBeenCalledWith('/canonical/migration-history/bundle-review', bundle, { preserveExactDecimals: true });
});
