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
    'stock/components/StockActions.tsx',
    'stock/components/StockFilters.tsx',
    'stock/components/StockTable.tsx',
    'stock/hooks/useStockState.ts',
    'stock/types/stock.types.ts',
    'stock/utils/batchValuation.ts',
    'stock/utils/movementProjection.ts',
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

test('inventory commands never invent a browser document number', () => {
  const adjustment = fs.readFileSync(
    path.join(inventoryRoot, 'stock/StockAdjustmentFlow.tsx'),
    'utf8',
  );

  expect(adjustment).not.toContain('adjustment_no');
  expect(adjustment).not.toContain('ADJ-');
  expect(adjustment).not.toContain('Date.now()');
  expect(adjustment).not.toContain('new Date(item.expiry_date)');
  expect(adjustment).not.toContain('new Date().toISOString()');
  expect(adjustment).toContain("requireCalendarDate(item.expiry_date, 'Batch expiry date')");
});

test('controlled inventory evidence times are explicit and never browser-generated', () => {
  const source = [
    'stock/StockAdjustmentFlow.tsx',
    'stock/InventoryDestructionFlow.tsx',
  ].map(relativePath => fs.readFileSync(path.join(inventoryRoot, relativePath), 'utf8')).join('\n');

  expect(source).not.toContain('new Date().toISOString()');
  expect(source).toContain('requireCanonicalUtcEventTimestamp');
  expect(source).toContain('The browser does not supply or convert this time.');
});
