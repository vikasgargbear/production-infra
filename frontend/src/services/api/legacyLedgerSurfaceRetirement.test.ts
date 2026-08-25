import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../../../');

const retiredPaths = [
  'frontend/src/components/ledger/CreditManagement.tsx',
  'frontend/src/components/ledger/LedgerReports.tsx',
  'frontend/src/components/ledger/hooks/useCreditManagement.ts',
  'frontend/src/components/ledger/hooks/useCollectionCenter.ts',
  'frontend/src/components/ledger/hooks/useLedgerReports.ts',
  'frontend/src/components/modules.ts',
  'frontend/src/services/api/modules/analytics/collectionCenter.api.ts',
  'frontend/src/services/api/modules/analytics/customerOutstanding.api.ts',
];

test('unreachable inferred ledger surfaces stay retired', () => {
  for (const relativePath of retiredPaths) {
    expect(fs.existsSync(path.join(root, relativePath))).toBe(false);
  }

  const ledgerExports = fs.readFileSync(
    path.join(root, 'frontend/src/components/ledger/index.tsx'),
    'utf8',
  );
  expect(ledgerExports.trim()).toBe("export { default as LedgerHub } from './LedgerHub';");
});
