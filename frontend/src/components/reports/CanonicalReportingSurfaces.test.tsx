import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import { reportingApi } from '../../services/api';
import CustomerAnalytics from './CustomerAnalytics';
import FinancialReport from './FinancialReport';

jest.mock('../../hooks/useCanonicalBusinessDate', () => ({
  useCanonicalBusinessDate: () => ({
    businessDate: '2026-08-25', organizationTimezone: 'Asia/Kolkata',
    loading: false, error: '', retry: jest.fn(),
  }),
}));

jest.mock('../../services/api', () => ({
  reportingApi: {
    getTrialBalance: jest.fn(), getProfitLoss: jest.fn(), getCustomerActivity: jest.fn(),
  },
}));

const header = {
  contract_version: '1.0.0', definition_version: 'canonical-factual-v1',
  currency_code: 'INR',
  date_from: '2026-08-01', date_to: '2026-08-25',
};

const renderReport = (node: React.ReactElement) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {node}
  </QueryClientProvider>,
);

beforeEach(() => {
  jest.clearAllMocks();
  (reportingApi.getTrialBalance as jest.Mock).mockResolvedValue({ data: {
    ...header, rows: [], total_period_debit: '0.00', total_period_credit: '0.00',
    period_balanced: true,
  } });
  (reportingApi.getProfitLoss as jest.Mock).mockResolvedValue({ data: {
    ...header, income: '9007199254740993.01', expenses: '0.01',
    result: '9007199254740993.00', rows: [
      { account_id: '018f0000-0000-7000-8000-000000000001', account_code: '4000', account_name: 'Sales', account_type: 'income', amount: '9007199254740993.01' },
      { account_id: '018f0000-0000-7000-8000-000000000002', account_code: '5000', account_name: 'Expense', account_type: 'expense', amount: '0.01' },
    ],
  } });
  (reportingApi.getCustomerActivity as jest.Mock).mockResolvedValue({ data: {
    ...header, transacting_customer_count: 0, invoice_count: 0,
    billed_sales: '0.00', customers: [],
  } });
});

test('financial report renders exact canonical results with clear period and refresh controls', async () => {
  renderReport(<FinancialReport />);
  expect(await screen.findByText('Factual profit & loss')).toBeTruthy();
  expect(screen.getAllByText('₹9,00,71,99,25,47,40,993.00').length).toBeGreaterThan(0);
  expect(screen.getByLabelText('Financial report from date')).toBeTruthy();
  expect(screen.getByLabelText('Financial report to date')).toBeTruthy();
  expect(screen.getByRole('button', { name: /refresh/i })).toBeTruthy();
  expect(screen.getByText('Period balanced')).toBeTruthy();
});

test('financial report fails visibly without substituting zero totals', async () => {
  (reportingApi.getProfitLoss as jest.Mock).mockRejectedValue(new Error('failed'));
  renderReport(<FinancialReport />);
  expect(await screen.findByText('Financial statements are unavailable.', {}, { timeout: 3000 })).toBeTruthy();
  expect(screen.queryByText('Income')).toBeNull();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
});

test('customer activity has a truthful empty state and canonical date controls', async () => {
  renderReport(<CustomerAnalytics />);
  expect(await screen.findByText('No posted customer invoices in this period.')).toBeTruthy();
  expect(screen.getAllByText('Billed sales').length).toBeGreaterThan(0);
  expect(screen.getByLabelText('Customer activity from date')).toBeTruthy();
  expect(screen.getByLabelText('Customer activity to date')).toBeTruthy();
});
