import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import GSTR1Report from '../gst/reports/GSTR1Report';
import GSTR3BReport from '../gst/reports/GSTR3BReport';
import GSTReportsContainer from '../gst/reports/GSTReportsContainer';
import PurchaseReport from './PurchaseReport';

const mockGstr1 = jest.fn();
const mockGstr3b = jest.fn();

jest.mock('../../services/api', () => ({
  gstApi: {
    reports: {
      gstr1: (...args: unknown[]) => mockGstr1(...args),
      gstr3b: (...args: unknown[]) => mockGstr3b(...args),
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
  mockGstr1.mockResolvedValue({ data: {
    b2b: [], notes: [],
    b2c: {
      small: { count: 0, taxableValue: '0.00', cgst: '0.00', sgst: '0.00', igst: '0.00', cess: '0.00', totalTax: '0.00' },
      large: { count: 0, taxableValue: '0.00', cgst: '0.00', sgst: '0.00', igst: '0.00', cess: '0.00', totalTax: '0.00' },
    },
    summary: { totalInvoices: 0, totalTaxableValue: '0.00', totalTax: '0.00', netAdjustment: '0.00' },
  } });
  mockGstr3b.mockResolvedValue({ data: {
    outputTax: { cgst: '0.00', sgst: '0.00', igst: '0.00', cess: '0.00', total: '0.00' },
    inputCredit: { cgst: '0.00', sgst: '0.00', igst: '0.00', cess: '0.00', total: '0.00' },
    payable: { cgst: '0.00', sgst: '0.00', igst: '0.00', cess: '0.00', total: '0.00' },
    netPayable: '0.00',
  } });
});

test('GSTR-1 can mount directly without a supplied date range', async () => {
  render(<GSTR1Report />);

  await waitFor(() => expect(mockGstr1).toHaveBeenCalledTimes(1));
  expect(mockGstr1.mock.calls[0][0]).toEqual(expect.objectContaining({
    date_from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    date_to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  }));
  expect(await screen.findByText('B2B Invoices')).toBeTruthy();
});

test('GSTR-3B can mount directly without a supplied date range', async () => {
  render(<GSTR3BReport />);

  await waitFor(() => expect(mockGstr3b).toHaveBeenCalledTimes(1));
  expect(mockGstr3b.mock.calls[0][0]).toEqual(expect.objectContaining({
    date_from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    date_to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  }));
  expect(await screen.findByText('Net GST Payable')).toBeTruthy();
});

test('GSTR-3B preserves authoritative money beyond JavaScript safe integers', async () => {
  const onDataReady = jest.fn();
  mockGstr3b.mockResolvedValue({ data: {
    outputTax: { cgst: '9007199254740993.01', sgst: '2.00', igst: '0.00', cess: '0.00', total: '9007199254740995.01' },
    inputCredit: { cgst: '0.01', sgst: '0.00', igst: '0.00', cess: '0.00', total: '0.01' },
    payable: { cgst: '9007199254740993.00', sgst: '2.00', igst: '0.00', cess: '0.00', total: '9007199254740995.00' },
    netPayable: '9007199254740995.00',
  } });

  render(<GSTR3BReport onDataReady={onDataReady} />);

  await waitFor(() => expect(onDataReady).toHaveBeenCalledWith({
    outputTax: { cgst: '9007199254740993.01', sgst: '2.00', igst: '0.00', cess: '0.00', total: '9007199254740995.01' },
    inputCredit: { cgst: '0.01', sgst: '0.00', igst: '0.00', cess: '0.00', total: '0.01' },
    payable: { cgst: '9007199254740993.00', sgst: '2.00', igst: '0.00', cess: '0.00', total: '9007199254740995.00' },
    netPayable: '9007199254740995.00',
  }));
  expect((await screen.findAllByText('₹9,00,71,99,25,47,40,995.00')).length).toBeGreaterThan(0);
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
