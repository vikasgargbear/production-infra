import offlineDB from '../core/offlineDatabase';
import { invoicesApi } from '../../api';
import syncEngine from './syncEngine';

jest.mock('../core/offlineDatabase', () => ({
  __esModule: true,
  default: {
    updateLocalId: jest.fn(),
    clearReservedQuantity: jest.fn(),
  },
}));

jest.mock('../../api', () => ({
  invoicesApi: {
    createCanonical: jest.fn(),
  },
}));

jest.mock('react-toastify', () => ({
  toast: {
    success: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('offline invoice canonical sync boundary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('quarantines legacy invoice payloads without making a server call', async () => {
    const result = await syncEngine.syncItem({
      entity_type: 'invoices',
      entity_id: 'LOCAL-1',
      action: 'create',
      data: { invoice_number: 'LEGACY-1', items: [] },
      created_at: new Date().toISOString(),
      attempts: 0,
      sync_status: 'pending',
    } as any);

    expect(result).toEqual(expect.objectContaining({
      success: false,
      conflict: true,
      error: expect.stringMatching(/predates the canonical command contract/i),
    }));
    expect(invoicesApi.createCanonical).not.toHaveBeenCalled();
  });

  it('posts a versioned offline invoice through the canonical command transport', async () => {
    (invoicesApi.createCanonical as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        invoice_id: '10000000-0000-4000-8000-000000000002',
      },
    });
    const payload = { branch_id: '10000000-0000-4000-8000-000000000003' };

    const result = await syncEngine.syncItem({
      entity_type: 'invoices',
      entity_id: 'LOCAL-2',
      action: 'create',
      data: {
        canonical_operation: 'sales.invoice.prepare',
        canonical_payload: payload,
        temp_id: 'LOCAL-2',
      },
      created_at: new Date().toISOString(),
      attempts: 0,
      sync_status: 'pending',
    } as any);

    expect(result.success).toBe(true);
    expect(invoicesApi.createCanonical).toHaveBeenCalledWith(payload);
    expect(offlineDB.updateLocalId).toHaveBeenCalledWith(
      'invoices',
      'LOCAL-2',
      '10000000-0000-4000-8000-000000000002',
    );
  });
});
