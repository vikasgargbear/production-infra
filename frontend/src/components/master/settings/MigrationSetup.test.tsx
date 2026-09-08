import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MigrationSetup from './MigrationSetup';
import { migrationApi, runMigration } from '../../../services/api/modules/master/migration.api';
import { canonicalInventoryReadsApi } from '../../../services/api/modules/inventory/canonicalInventoryReads.api';

jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { org_id: 'org', email: 'qa@example.com' } }) }));
jest.mock('../../../hooks/usePermissions', () => ({ usePermissions: () => ({ hasCapability: () => true, hasPermission: () => true }) }));
jest.mock('../../../services/api/modules/inventory/canonicalInventoryReads.api', () => ({ canonicalInventoryReadsApi: { context: jest.fn() } }));
jest.mock('../../../services/api/modules/master/migration.api', () => ({ migrationApi: { review: jest.fn() }, runMigration: jest.fn() }));

const bundle = {
  schema_version: 'aasopharma.marg-migration.v1', organization_id: 'org', branch_id: 'branch', location_id: 'location',
  dataset_id: 'test-dataset', opening_date: '2026-09-08', import_requests: [{ facts: [] }],
  exclusions: { missing_source_domains: ['return line linkage'] },
};
beforeEach(() => {
  jest.clearAllMocks();
  (canonicalInventoryReadsApi.context as jest.Mock).mockResolvedValue({ data: {
    organization_id: 'org', branches: [{ branch_id: 'branch', branch_name: 'Test branch', locations: [
      { location_id: 'location', location_name: 'Test stockroom', location_status: 'active' },
    ] }],
  } });
  (migrationApi.review as jest.Mock).mockResolvedValue({ facts: 1, request_batches: 1, counts_by_kind: { product: 1 }, quarantined_by_kind: { product: 1 }, expected: {} });
  (runMigration as jest.Mock).mockResolvedValue({});
});
async function choose(value: unknown) {
  const input = screen.getByLabelText(/Choose the prepared package/) as HTMLInputElement;
  await waitFor(() => expect(input).not.toBeDisabled());
  const file = { size: 500, text: async () => JSON.stringify(value) };
  fireEvent.change(input, { target: { files: [file] } });
  await act(async () => { await Promise.resolve(); });
}
test('choosing a package does not upload it or create records', async () => {
  render(<MigrationSetup />);
  await choose(bundle);
  expect(await screen.findByText(/Test branch \/ Test stockroom/)).toBeInTheDocument();
  expect(migrationApi.review).not.toHaveBeenCalled();
  expect(runMigration).not.toHaveBeenCalled();
});
test('wrong organization and invalid raw export are rejected locally', async () => {
  render(<MigrationSetup />);
  await choose({ ...bundle, organization_id: 'other-org' });
  expect(await screen.findByRole('alert')).toHaveTextContent('another organization');
  await choose({ raw_csv: true });
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('migration-bundle.json'));
  expect(migrationApi.review).not.toHaveBeenCalled();
});
test('exclusions and explicit approval precede import; double click starts one run', async () => {
  let finish: (value: unknown) => void = () => {};
  (runMigration as jest.Mock).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<MigrationSetup />);
  await choose(bundle);
  fireEvent.click(await screen.findByRole('button', { name: 'Review package' }));
  expect(await screen.findByText('return line linkage')).toBeInTheDocument();
  const button = screen.getByRole('button', { name: 'Import / resume this package' });
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(runMigration).toHaveBeenCalledTimes(1));
  await act(async () => { finish({}); });
  expect(await screen.findByRole('button', { name: 'Import complete' })).toBeDisabled();
});
test('a failed import exposes resume rather than claiming completion', async () => {
  (runMigration as jest.Mock).mockRejectedValue(new Error('Stock does not reconcile'));
  render(<MigrationSetup />);
  await choose(bundle);
  fireEvent.click(await screen.findByRole('button', { name: 'Review package' }));
  fireEvent.click(await screen.findByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Import / resume this package' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Stock does not reconcile');
  expect(screen.queryByRole('button', { name: 'Import complete' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Import / resume this package' })).toBeEnabled();
});
