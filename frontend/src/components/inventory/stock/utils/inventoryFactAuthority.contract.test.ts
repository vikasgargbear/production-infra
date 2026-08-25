import fs from 'fs';
import path from 'path';

const inventoryRoot = path.resolve(__dirname, '../..');

test('retired inventory adapters cannot reintroduce guessed business facts', () => {
  const retired = [
    'hooks/useCurrentStock.ts',
    'utils/batchHelpers.ts',
    'utils/exportHelpers.ts',
    'utils/stockCalculations.ts',
    'utils/stockValidation.ts',
    'stock/utils/normalizeCurrentStock.ts',
  ];
  for (const relativePath of retired) {
    expect(fs.existsSync(path.join(inventoryRoot, relativePath))).toBe(false);
  }
});

test('active desktop inventory reads contain no zero, one, or price-alias fallback', () => {
  const activeFiles = [
    'stock/CurrentStock.tsx',
    'stock/BatchTracking.tsx',
    'stock/StockMovement.tsx',
    'stock/utils/canonicalStockReads.ts',
  ];
  const source = activeFiles
    .map(relativePath => fs.readFileSync(path.join(inventoryRoot, relativePath), 'utf8'))
    .join('\n');

  expect(source).not.toMatch(/(?:\?\?|\|\|)\s*[01](?:\D|$)/);
  expect(source).not.toContain('sale_price_per_unit');
  expect(source).not.toContain('reorder_level');
  expect(source).not.toContain('pack_size');
  expect(source).not.toContain("'Units'");
});
