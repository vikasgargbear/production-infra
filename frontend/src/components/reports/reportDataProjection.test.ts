import { filterInventoryItems, projectInventoryItems, projectStockMovements } from './InventoryReport';
import {
  formatAnalyticsMultiplier,
  formatAnalyticsPercent,
  projectAnalyticsProducts,
} from './ProductAnalytics';

test('inventory projection keeps canonical identity, quantities, and value together', () => {
  const items = projectInventoryItems([{
    product_id: '01994df0-52a8-7000-8000-000000000001',
    product_name: 'Canonical Carton',
    category: 'Packing',
    total_quantity_available: '267',
    stock_value: '25428.58',
    min_stock_level: 0,
    max_stock_level: 0,
    turnover_rate: '14',
  }]);

  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    id: '01994df0-52a8-7000-8000-000000000001',
    name: 'Canonical Carton',
    currentStock: 267,
    value: 25428.58,
    status: 'Optimal',
  });
  expect(filterInventoryItems(items, 'all', 'all', '')).toHaveLength(1);
  expect(filterInventoryItems(items, 'Packing', 'all', 'carton')).toHaveLength(1);
  expect(filterInventoryItems(items, 'Other', 'all', '')).toHaveLength(0);
});

test('movement projection replaces sample rows with canonical directions', () => {
  expect(projectStockMovements([
    { movement_date: '2026-08-24T10:00:00Z', movement_type: 'in', quantity: '5', reference_number: 'GRN-1' },
    { movement_date: '2026-08-24T11:00:00Z', movement_type: 'out', quantity: '2', reference_number: 'INV-1' },
  ])).toEqual([
    { date: '2026-08-24T10:00:00Z', type: 'In', quantity: 5, reference: 'GRN-1' },
    { date: '2026-08-24T11:00:00Z', type: 'Out', quantity: 2, reference: 'INV-1' },
  ]);
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
