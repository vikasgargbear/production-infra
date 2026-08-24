import { render, screen, waitFor } from '@testing-library/react';

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
  prepareCanonicalAction: jest.fn(),
  approveAndExecuteCanonicalAction: jest.fn(),
}));
jest.mock('../../../utils/clientUuid', () => ({
  clientUuid: () => 'd3000000-0000-7000-8000-000000000001',
}));
jest.mock('react-toastify', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));
jest.mock('../../global', () => ({
  ModuleHeader: ({ title }: { title: string }) => <header>{title}</header>,
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
});
