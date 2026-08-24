import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import GSTR1Report from '../gst/reports/GSTR1Report';
import GSTR3BReport from '../gst/reports/GSTR3BReport';
import GSTReportsContainer from '../gst/reports/GSTReportsContainer';
import PurchaseReport from './PurchaseReport';

const mockGetInvoices = jest.fn();
const mockSearchInvoices = jest.fn();
const mockGetSupplierInvoices = jest.fn();
const mockGetCreditDebitNotes = jest.fn();

jest.mock('../../services/api', () => ({
  invoicesApi: {
    getAll: (...args: unknown[]) => mockGetInvoices(...args),
    search: (...args: unknown[]) => mockSearchInvoices(...args),
  },
  supplierInvoicesApi: {
    getAll: (...args: unknown[]) => mockGetSupplierInvoices(...args),
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
  mockGetSupplierInvoices.mockResolvedValue({ data: { invoices: [] } });
  mockGetCreditDebitNotes.mockResolvedValue({ data: { notes: [] } });
});

test('GSTR-1 can mount directly without a supplied date range', async () => {
  render(<GSTR1Report />);

  await waitFor(() => expect(mockGetInvoices).toHaveBeenCalledTimes(1));
  expect(mockGetInvoices.mock.calls[0][0]).toEqual(expect.objectContaining({
    date_from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    date_to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  }));
  expect(await screen.findByText('B2B Invoices')).toBeTruthy();
});

test('GSTR-3B can mount directly without a supplied date range', async () => {
  render(<GSTR3BReport />);

  await waitFor(() => expect(mockSearchInvoices).toHaveBeenCalledTimes(1));
  expect(mockSearchInvoices.mock.calls[0][0]).toEqual(expect.objectContaining({
    date_from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    date_to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  }));
  expect(mockGetSupplierInvoices.mock.calls[0][0]).toEqual(expect.objectContaining({
    from_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    to_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  }));
  expect(await screen.findByText('Net GST Payable')).toBeTruthy();
});

test('GSTR-3B derives output and input tax from posted invoice headers', async () => {
  const onDataReady = jest.fn();
  mockSearchInvoices.mockResolvedValue({
    data: {
      invoices: [
        { status: 'posted', cgst_amount: '6', sgst_amount: '6', igst_amount: 0, cess_amount: '1' },
        { status: 'draft', cgst_amount: 400, sgst_amount: 400, igst_amount: 400, cess_amount: 400 },
        { status: 'cancelled', cgst_amount: 500, sgst_amount: 500, igst_amount: 500, cess_amount: 500 },
      ],
    },
  });
  mockGetSupplierInvoices.mockResolvedValue({
    data: {
      invoices: [
        { status: 'posted', cgst_amount: 2, sgst_amount: 2, igst_amount: '3', cess_amount: 0.5 },
        { status: 'approved', cgst_amount: 50, sgst_amount: 50, igst_amount: 50, cess_amount: 50 },
        { status: 'reversed', cgst_amount: 100, sgst_amount: 100, igst_amount: 100, cess_amount: 100 },
      ],
    },
  });

  render(<GSTR3BReport onDataReady={onDataReady} />);

  await waitFor(() => expect(onDataReady).toHaveBeenCalledWith({
    outputTax: { cgst: 6, sgst: 6, igst: 0, cess: 1, total: 13 },
    inputCredit: { cgst: 2, sgst: 2, igst: 3, cess: 0.5, total: 7.5 },
    netPayable: 5.5,
  }));
  expect(mockGetSupplierInvoices).toHaveBeenCalledTimes(1);
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
