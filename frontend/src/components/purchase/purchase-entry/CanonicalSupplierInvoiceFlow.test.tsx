import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import CanonicalSupplierInvoiceFlow from './CanonicalSupplierInvoiceFlow';
import { canonicalBusinessContextApi } from '../../../services/api/modules/org/canonicalBusinessContext.api';
import { canonicalSupplierInvoicesApi } from '../../../services/api/modules/purchase/canonicalSupplierInvoices.api';

jest.mock('../../../services/api/modules/org/canonicalBusinessContext.api', () => ({
  canonicalBusinessContextApi: { get: jest.fn() },
}));
jest.mock('../../../services/api/modules/purchase/canonicalSupplierInvoices.api', () => ({
  canonicalSupplierInvoicesApi: {
    eligibleReceipts: jest.fn(), context: jest.fn(), detail: jest.fn(),
  },
}));
jest.mock('../../../services/api/canonicalOperatorActions', () => ({
  approveAndExecuteCanonicalAction: jest.fn(),
}));
jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { branch_id: 'd3000000-0000-7000-8000-000000000003' } }),
}));
jest.mock('../../../services/api/modules/invoiceDrafts.api', () => ({
  invoiceDraftIdFromLocation: () => null,
  invoiceDraftsApi: {
    list: jest.fn(), get: jest.fn(), create: jest.fn(), update: jest.fn(), prepare: jest.fn(), abandon: jest.fn(),
  },
}));
jest.mock('../../../utils/clientUuid', () => ({
  clientUuid: () => 'd3000000-0000-7000-8000-000000000001',
}));
jest.mock('react-toastify', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));
jest.mock('../../global', () => ({
  ModuleHeader: ({ title }: { title: string }) => <header>{title}</header>,
  InvoiceDraftPicker: () => null,
}));

describe('CanonicalSupplierInvoiceFlow organization dates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (canonicalSupplierInvoicesApi.eligibleReceipts as jest.Mock).mockResolvedValue({
      data: { receipts: [] },
    });
  });

  it('defaults financial dates only from the authenticated organization context', async () => {
    (canonicalBusinessContextApi.get as jest.Mock).mockResolvedValue({
      organization_id: 'd3000000-0000-7000-8000-000000000002',
      timezone: 'Asia/Kolkata',
      business_date: '2026-08-25',
    });

    render(<CanonicalSupplierInvoiceFlow />);

    await waitFor(() => {
      expect((screen.getByLabelText('Supplier invoice date') as HTMLInputElement).value).toBe('2026-08-25');
    });
    expect((screen.getByLabelText('Supplier invoice received date') as HTMLInputElement).value).toBe('2026-08-25');
    expect(canonicalBusinessContextApi.get).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: 'Load canonical evidence' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('never substitutes the browser clock when organization context is unavailable', async () => {
    (canonicalBusinessContextApi.get as jest.Mock).mockRejectedValue(
      new Error('Organization business date is unavailable'),
    );

    render(<CanonicalSupplierInvoiceFlow />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Organization business date is unavailable',
    );
    expect((screen.getByLabelText('Supplier invoice date') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Supplier invoice received date') as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('button', { name: 'Load canonical evidence' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('discards canonical context that resolves after its source invoice changes', async () => {
    (canonicalBusinessContextApi.get as jest.Mock).mockResolvedValue({
      organization_id: 'd3000000-0000-7000-8000-000000000002',
      timezone: 'Asia/Kolkata',
      business_date: '2026-08-25',
    });
    (canonicalSupplierInvoicesApi.eligibleReceipts as jest.Mock).mockResolvedValue({
      data: { receipts: [{
        goods_receipt_id: 'd3000000-0000-7000-8000-000000000010',
        goods_receipt_number: 'GRN-10', supplier_name: 'Exact Supplier',
        remaining_capitalized_value: '168.00', purchase_order_number: 'PO-10',
        remaining_line_count: 1,
      }] },
    });
    let resolveContext!: (value: any) => void;
    (canonicalSupplierInvoicesApi.context as jest.Mock).mockReturnValue(
      new Promise(resolve => { resolveContext = resolve; }),
    );

    render(<CanonicalSupplierInvoiceFlow />);
    await waitFor(() => expect(
      (screen.getByLabelText('Supplier invoice date') as HTMLInputElement).value,
    ).toBe('2026-08-25'));
    fireEvent.change(screen.getByLabelText('Posted GRN'), {
      target: { value: 'd3000000-0000-7000-8000-000000000010' },
    });
    fireEvent.change(screen.getByLabelText('Supplier invoice number'), {
      target: { value: 'SUP-A' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load canonical evidence' }));
    fireEvent.change(screen.getByLabelText('Supplier invoice number'), {
      target: { value: 'SUP-B' },
    });
    await act(async () => resolveContext({ data: {
      ready: true, blocking_reasons: [], lines: [], expense_charge_lines: [],
      portal_evidence: null,
    } }));

    await waitFor(() => expect(canonicalSupplierInvoicesApi.context).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('2. Verify exact quantities, values, and ITC basis')).toBeNull();
  });
});
