import fs from 'fs';
import path from 'path';

import { projectSalesDailyRows } from './SalesReport';

const read = (file: string) => fs.readFileSync(path.join(__dirname, file), 'utf8');

test('inventory analytics fails closed without an organization-wide canonical projection', () => {
  const source = read('InventoryReport.tsx');
  expect(source).toContain('authoritative organization-wide inventory report projection is not published');
  expect(source).not.toContain('apiClient');
  expect(source).not.toMatch(/['"]\/(inventory|stock-adjustments|stock-movements|stock-writeoff)/);
});

test('sales daily rows require one exact field name and preserve explicit zero', () => {
  expect(projectSalesDailyRows([{
    date: '2026-08-25',
    invoice_count: 0,
    customer_count: 0,
    total_sales: 0,
    avg_order_value: 0,
  }])).toEqual([{
    date: '2026-08-25',
    invoiceCount: 0,
    customerCount: 0,
    totalSales: 0,
    averageInvoiceValue: 0,
  }]);
});

test.each([
  ['alias-only money', { date: '2026-08-25', invoice_count: 1, customer_count: 1, revenue: 168, avg_order_value: 168 }],
  ['alias-only count', { date: '2026-08-25', order_count: 1, customer_count: 1, total_sales: 168, avg_order_value: 168 }],
  ['missing average', { date: '2026-08-25', invoice_count: 1, customer_count: 1, total_sales: 168 }],
  ['invalid date', { date: '25/08/2026', invoice_count: 1, customer_count: 1, total_sales: 168, avg_order_value: 168 }],
])('sales daily projection rejects %s', (_label, row) => {
  expect(() => projectSalesDailyRows([row])).toThrow();
});

test('unpublished report surfaces contain no browser business policy', () => {
  const retired = [
    'ProductAnalytics.tsx',
  ];
  for (const file of retired) {
    const source = read(file);
    expect(source).toContain('CanonicalReportUnavailable');
    expect(source).not.toContain('apiClient');
    expect(source).not.toMatch(/\|\|\s*0|\|\|\s*1|\?\?\s*0/);
  }

  expect(read('ProductAnalytics.tsx')).not.toMatch(/margin\s*[><]=?\s*25|turnover\s*>\s*10|stock\s*<=\s*0/);

  const customer = read('CustomerAnalytics.tsx');
  const financial = read('FinancialReport.tsx');
  const projection = read('utils/canonicalReportingProjection.ts');
  expect(customer).toContain('projectCustomerActivity');
  expect(customer).toContain('useCanonicalBusinessDate');
  expect(customer).not.toMatch(/Date\.now|>\s*60|>\s*180|customer_type\s*===/);
  expect(financial).toContain('projectTrialBalance');
  expect(financial).toContain('projectProfitLoss');
  expect(financial).toContain('useCanonicalBusinessDate');
  expect(financial).not.toMatch(/new Date|apiClient|toFixed\(2\)|grossMargin|ebitdaMargin/);
  expect(projection).toContain('normalizeAuthoritativeDecimal');
  expect(projection).toContain('does not reconcile');
  expect(read('LedgerAnalytics.tsx')).toContain('showProfitLoss={false}');
  expect(read('ProfitLossStatement.tsx')).toContain('showTrialBalance={false}');
  expect(read('../payment/reports/FinancialReports.tsx')).toContain('<FinancialReport');

  const sales = read('SalesReport.tsx');
  expect(sales).not.toMatch(/item\.(period|order_count|orders|revenue|invoice_date|total_amount|unique_customers)/);
  expect(sales).not.toMatch(/\|\|\s*0|\|\|\s*1/);
});

test('unsupported report clients stay deleted', () => {
  expect(fs.existsSync(path.join(
    __dirname,
    '../../services/api/modules/analytics/reports.api.ts',
  ))).toBe(false);

  const ledgerApi = read('../../services/api/modules/finance/ledger.api.ts');
  expect(ledgerApi).not.toMatch(/getReport|exportReport|getDashboardStats|\/ledger\/reports\//);
});
