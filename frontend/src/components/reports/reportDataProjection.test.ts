import fs from 'fs';
import path from 'path';
import {
  formatAnalyticsMultiplier,
  formatAnalyticsPercent,
  projectAnalyticsProducts,
} from './ProductAnalytics';

test('inventory analytics fails closed without an organization-wide canonical projection', () => {
  const source = fs.readFileSync(path.join(__dirname, 'InventoryReport.tsx'), 'utf8');
  expect(source).toContain('authoritative organization-wide inventory report projection is not published');
  expect(source).not.toContain('apiClient');
  expect(source).not.toMatch(/['"]\/(inventory|stock-adjustments|stock-movements|stock-writeoff)/);
});

test('product analytics normalizes decimal strings and uses stable precision', () => {
  const products = projectAnalyticsProducts([{
    id: 'product-1', name: 'Product', category: 'Packing', margin: '33.333333',
    turnover: '0.147368421', trend: 'up', trend_value: '0',
  }]);

  expect(products[0].margin).toBeCloseTo(33.333333);
  expect(formatAnalyticsPercent(products[0].margin)).toBe('33.3%');
  expect(formatAnalyticsMultiplier(products[0].turnover)).toBe('0.15x');
  expect(products[0].trendValue).toBe(0);
});
