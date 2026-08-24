import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import GSTR1Report from '../gst/reports/GSTR1Report';
import GSTR3BReport from '../gst/reports/GSTR3BReport';
import GSTReportsContainer from '../gst/reports/GSTReportsContainer';
import PurchaseReport from './PurchaseReport';

const mockGetInvoices = jest.fn();
const mockSearchInvoices = jest.fn();
const mockGetPurchaseOrders = jest.fn();
const mockGetCreditDebitNotes = jest.fn();

jest.mock('../../services/api', () => ({
  invoicesApi: {
    getAll: (...args: unknown[]) => mockGetInvoices(...args),
    search: (...args: unknown[]) => mockSearchInvoices(...args),
  },
  purchasesApi: {
    getOrders: (...args: unknown[]) => mockGetPurchaseOrders(...args),
  },
  gstApi: {
    reports: {
      creditDebitNotes: (...args: unknown[]) => mockGetCreditDebitNotes(...args),
    },
  },
}));

jest.mock('../global', () => ({
  DataTable: () => <div data-testid="data-table" />,
  DatePicker: () => <input aria-label="date picker" />,
}));

jest.mock('../global/ui/ModuleHeader', () => () => <div data-testid="module-header" />);

jest.mock('../gst/hooks/useGSTExport', () => ({
  useGSTExport: () => ({ exportToCSV: jest.fn() }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetInvoices.mockResolvedValue({ data: { invoices: [] } });
  mockSearchInvoices.mockResolvedValue({ data: { invoices: [] } });
  mockGetPurchaseOrders.mockResolvedValue({ data: { orders: [] } });
  mockGetCreditDebitNotes.mockResolvedValue({ data: { notes: [] } });
});

test('GSTR-1 can mount directly without a supplied date range', async () => {
  render(<GSTR1Report />);

  await waitFor(() => expect(mockGetInvoices).toHaveBeenCalledTimes(1));
  expect(mockGetInvoices.mock.calls[0][0]).toEqual(expect.objectContaining({
    from_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    to_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  }));
  expect(await screen.findByText('B2B Invoices')).toBeTruthy();
});

test('GSTR-3B can mount directly without a supplied date range', async () => {
  render(<GSTR3BReport />);

  await waitFor(() => expect(mockSearchInvoices).toHaveBeenCalledTimes(1));
  expect(mockSearchInvoices.mock.calls[0][0]).toEqual(expect.objectContaining({
    dateFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    dateTo: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  }));
  expect(await screen.findByText('Net GST Payable')).toBeTruthy();
});

test('purchase report never displays the removed sample totals', () => {
  render(<PurchaseReport />);

  expect(screen.getByText(/canonical purchase analytics are not available yet/i)).toBeTruthy();
  expect(screen.queryByText('₹8,45,670')).toBeNull();
  expect(screen.queryByText('234')).toBeNull();
});

test('GST reports expose labeled mobile report and period selectors', async () => {
  render(<GSTReportsContainer />);

  expect(screen.getByLabelText('Choose GST report')).toBeTruthy();
  expect(screen.getByLabelText('GST report period')).toBeTruthy();
  expect(await screen.findByText('B2B Invoices')).toBeTruthy();
});
