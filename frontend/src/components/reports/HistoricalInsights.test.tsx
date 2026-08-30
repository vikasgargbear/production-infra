import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import { reportingApi } from '../../services/api';
import HistoricalInsights from './HistoricalInsights';

jest.mock('../../services/api', () => ({ reportingApi: { getHistoricalInsights: jest.fn() } }));

const response = {
  contract_version: '1.0.0', definition_version: 'historical-observed-v1', currency_code: 'INR', date_from: null, date_to: null,
  coverage: { sales_invoice: 2333, batch: 1121 },
  sales: { invoice_count: 2333, taxable: '5790307.94', tax: '287623.48', total: '6079723.00' },
  purchases: { invoice_count: 282, taxable: '4206036.41', tax: '213715.53', total: '4419732.00' },
  returns: { sales_count: 27, purchase_count: 2, sales_total: '91473.00', purchase_total: '2026.00' },
  outstanding: { receivable: '0.00', payable: '33248292.00', overdue_receivable: '0.00', item_count: 6260 },
  inventory: { batch_count: 1121, quantity: '135540.250000', value: '1604202.79', near_expiry_batches: 149, near_expiry_value: '135554.43' },
  monthly_sales: [{ month: '2026-08-01', invoices: 10, total: '1000.00' }],
  top_products: [{ name: 'Observed medicine', quantity: '12.500000', total: '500.00' }],
  top_customers: [{ name: 'Observed customer', invoices: 2, total: '250.00' }],
  limitations: ['Historical facts do not post stock.'],
};

test('shows exact imported-history totals and labels the data as non-posting', async () => {
  (reportingApi.getHistoricalInsights as jest.Mock).mockResolvedValue({ data: response });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><HistoricalInsights /></QueryClientProvider>);
  expect(await screen.findByText('₹60,79,723.00')).toBeTruthy();
  expect(screen.getByText('135540.25 units · 1,121 batches')).toBeTruthy();
  expect(screen.getByText(/do not post stock, GST, or ledger entries/i)).toBeTruthy();
  expect(screen.getByText('Observed medicine')).toBeTruthy();
});

test('fails visibly instead of substituting zero totals', async () => {
  (reportingApi.getHistoricalInsights as jest.Mock).mockRejectedValue(new Error('failed'));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><HistoricalInsights /></QueryClientProvider>);
  expect(await screen.findByText('Imported history is unavailable.', {}, { timeout: 3000 })).toBeTruthy();
  expect(screen.queryByText('₹0.00')).toBeNull();
});
