import { apiHelpers } from '../../apiClient';
import { invoicesApi } from './invoices.api';

jest.mock('../../apiClient', () => ({
    apiHelpers: {
        get: jest.fn(),
        post: jest.fn(),
    },
}));

jest.mock('../../../offline/sync/deltaSyncService', () => ({
    __esModule: true,
    default: { afterInvoiceCreated: jest.fn() },
}));

describe('canonical invoice web transport', () => {
    it('uses prepare, approve, execute, then reads the authoritative invoice', async () => {
        const post = apiHelpers.post as jest.Mock;
        const get = apiHelpers.get as jest.Mock;
        post
            .mockResolvedValueOnce({ data: {
                command_request_id: '10000000-0000-4000-8000-000000000001',
                preview_hash: `sha256:${'a'.repeat(64)}`,
            } })
            .mockResolvedValueOnce({ data: { status: 'approved' } })
            .mockResolvedValueOnce({ data: {
                status: 'succeeded',
                resource_id: '10000000-0000-4000-8000-000000000002',
            } });
        get.mockResolvedValueOnce({ data: {
            invoice_number: 'INV-2026-0001',
            total_amount: 118,
        } });

        const response = await invoicesApi.createCanonical({
            idempotency_key: 'erp-web-invoice:test-0001',
        });

        expect(post.mock.calls.map(call => call[0])).toEqual([
            '/web/actions/sales.invoice.prepare/prepare',
            '/web/actions/commands/10000000-0000-4000-8000-000000000001/approve',
            '/web/actions/commands/10000000-0000-4000-8000-000000000001/execute',
        ]);
        expect(get).toHaveBeenCalledWith(
            '/canonical/invoices/10000000-0000-4000-8000-000000000002',
        );
        expect(response.data).toEqual(expect.objectContaining({
            success: true,
            invoice_id: '10000000-0000-4000-8000-000000000002',
            invoice_number: 'INV-2026-0001',
            total_amount: 118,
        }));
    });
});
