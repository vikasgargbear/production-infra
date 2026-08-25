import {
  dashboardDateRange,
  projectExecutiveInventory,
  projectExecutiveStats,
  projectExecutiveSales,
  projectTopCustomers,
} from './executiveDashboardProjection';

test('keeps explicit dashboard zeroes distinct from missing facts', () => {
  expect(projectExecutiveStats({
    total_revenue: '0.00',
    total_orders: 0,
    new_customers: 0,
    revenue_change: null,
    orders_change: 0,
    new_customers_change: null,
  })).toEqual({
    total_revenue: '0.00',
    total_orders: 0,
    new_customers: 0,
    revenue_change: null,
    orders_change: 0,
    new_customers_change: null,
  });

  expect(() => projectExecutiveStats({ total_orders: 0, new_customers: 0 })).toThrow(
    'Total revenue is unavailable',
  );
});

test('rejects legacy inventory aliases instead of guessing their meaning', () => {
  expect(() => projectExecutiveInventory({
    total_products: 2,
    total_stock_value: 168,
    low_stock_count: 1,
  })).toThrow('Inventory timezone is unavailable');
});

test('requires exact canonical sales fields', () => {
  expect(projectExecutiveSales([{ date: '2026-08-25', revenue: '168.00', invoice_count: 1 }]))
    .toEqual([{ date: '2026-08-25', revenue: 168, invoice_count: 1 }]);
  expect(() => projectExecutiveSales([{ period: '2026-08-25', amount: 168, count: 1 }]))
    .toThrow('Sales trend row 1 date is unavailable');
});

test('derives inclusive ranges from the organization business date', () => {
  expect(dashboardDateRange('2026-08-25', '7days')).toEqual({
    date_from: '2026-08-19',
    date_to: '2026-08-25',
  });
  expect(dashboardDateRange('2026-08-25', '30days')).toEqual({
    date_from: '2026-07-27',
    date_to: '2026-08-25',
  });
  expect(dashboardDateRange('2026-08-25', 'month')).toEqual({
    date_from: '2026-08-01',
    date_to: '2026-08-25',
  });
});

test('requires exact top-customer facts without compatibility aliases', () => {
  expect(projectTopCustomers([
    { id: 'customer-1', name: 'Demo Retail', revenue: 4596, orders: 3 },
  ])[0]).toMatchObject({ name: 'Demo Retail', revenue: 4596, volume: 3 });

  expect(() => projectTopCustomers([
    { id: 'customer-1', customer_name: 'Legacy alias', orders: 0 },
  ])).toThrow('Top customer 1 name is unavailable');
});
