import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { gstApi } from '../../../services/api';
import GSTDashboard, { projectGSTDashboard } from './GSTDashboard';

jest.mock('../../../services/api', () => ({
  gstApi: { dashboard: { getSummary: jest.fn() } },
}));

jest.mock('../../global/ui/ModuleHeader', () => () => <div>GST Dashboard</div>);
jest.mock('../../global/ui/display/SummaryCard', () => ({ title }: { title: string }) => <div>{title}</div>);

describe('GSTDashboard periods', () => {
  it('reloads the selected server-bounded period and shows its exact dates', async () => {
    (gstApi.dashboard.getSummary as jest.Mock)
      .mockResolvedValueOnce({
        data: {
          period: { key: 'current', start: '2026-08-01', end: '2026-08-24' },
          outputTax: '9007199254740993.01',
          inputCredit: '5.00',
          netPayable: '9007199254740988.01',
          summary: {
            total_invoices: 0, total_suppliers: 0, total_supplier_invoices: 0,
            cgst_amount: '9007199254740993.01', sgst_amount: '0.00', igst_amount: '0.00',
            purchase_cgst_amount: '5.00', purchase_sgst_amount: '0.00', purchase_igst_amount: '0.00',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          period: { key: 'previous', start: '2026-07-01', end: '2026-07-31' },
          outputTax: '3.00',
          inputCredit: '1.00',
          netPayable: '2.00',
          summary: {
            total_invoices: 3, total_suppliers: 1, total_supplier_invoices: 2,
            cgst_amount: '3.00', sgst_amount: '0.00', igst_amount: '0.00',
            purchase_cgst_amount: '1.00', purchase_sgst_amount: '0.00', purchase_igst_amount: '0.00',
          },
        },
      });

    render(<GSTDashboard />);

    expect(await screen.findByText('1 Aug 2026 – 24 Aug 2026')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'GST reporting period' }), {
      target: { value: 'previous' },
    });

    await waitFor(() => expect(gstApi.dashboard.getSummary).toHaveBeenLastCalledWith('previous'));
    expect(await screen.findByText('1 Jul 2026 – 31 Jul 2026')).toBeTruthy();
  });

  it('preserves authoritative zero counts instead of treating them as missing', () => {
    expect(projectGSTDashboard({
      period: { key: 'current', start: '2026-08-01', end: '2026-08-25' },
      outputTax: '0.00', inputCredit: '0.00', netPayable: '0.00',
      summary: {
        total_invoices: 0, total_suppliers: 0, total_supplier_invoices: 0,
        cgst_amount: '0.00', sgst_amount: '0.00', igst_amount: '0.00',
        purchase_cgst_amount: '0.00', purchase_sgst_amount: '0.00',
        purchase_igst_amount: '0.00',
      },
    }, 'current')).toMatchObject({
      totalInvoices: 0,
      totalSuppliers: 0,
      totalSupplierInvoices: 0,
      netPayable: '0.00',
    });
  });

  it.each([
    ['missing invoice count', {
      period: { key: 'current', start: '2026-08-01', end: '2026-08-25' },
      outputTax: '0.00', inputCredit: '0.00', netPayable: '0.00',
      summary: {
        total_suppliers: 0, total_supplier_invoices: 0,
        cgst_amount: '0.00', sgst_amount: '0.00', igst_amount: '0.00',
        purchase_cgst_amount: '0.00', purchase_sgst_amount: '0.00', purchase_igst_amount: '0.00',
      },
    }],
    ['missing exact money', {
      period: { key: 'current', start: '2026-08-01', end: '2026-08-25' },
      inputCredit: '0.00', netPayable: '0.00',
      summary: {
        total_invoices: 0, total_suppliers: 0, total_supplier_invoices: 0,
        cgst_amount: '0.00', sgst_amount: '0.00', igst_amount: '0.00',
        purchase_cgst_amount: '0.00', purchase_sgst_amount: '0.00', purchase_igst_amount: '0.00',
      },
    }],
    ['mismatched period', {
      period: { key: 'previous', start: '2026-07-01', end: '2026-07-31' },
      outputTax: '0.00', inputCredit: '0.00', netPayable: '0.00',
      summary: {
        total_invoices: 0, total_suppliers: 0, total_supplier_invoices: 0,
        cgst_amount: '0.00', sgst_amount: '0.00', igst_amount: '0.00',
        purchase_cgst_amount: '0.00', purchase_sgst_amount: '0.00', purchase_igst_amount: '0.00',
      },
    }],
  ])('fails closed for %s', (_label, payload) => {
    expect(() => projectGSTDashboard(payload, 'current')).toThrow();
  });

  it('renders an unavailable state when a canonical fact is missing', async () => {
    (gstApi.dashboard.getSummary as jest.Mock).mockResolvedValueOnce({
      data: {
        period: { key: 'current', start: '2026-08-01', end: '2026-08-25' },
        outputTax: '0.00', inputCredit: '0.00', netPayable: '0.00',
        summary: {
          total_suppliers: 0, total_supplier_invoices: 0,
          cgst_amount: '0.00', sgst_amount: '0.00', igst_amount: '0.00',
          purchase_cgst_amount: '0.00', purchase_sgst_amount: '0.00',
          purchase_igst_amount: '0.00',
        },
      },
    });

    render(<GSTDashboard />);

    expect((await screen.findByRole('alert')).textContent).toContain('invalid canonical invoice count');
    expect(screen.queryByText('Output Tax (Sales)')).toBeNull();
  });
});
