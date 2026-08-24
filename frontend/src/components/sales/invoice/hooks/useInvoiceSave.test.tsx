import { act, renderHook } from '@testing-library/react';
import { toast } from 'react-toastify';
import { invoicesApi } from '../../../../services/api';
import { showFinancialEntryNotification } from '../../../../utils/financialEntryNotifier';
import { useInvoiceSave } from './useInvoiceSave';

jest.mock('react-toastify', () => ({ toast: { error: jest.fn() } }));
jest.mock('../../../../services/api', () => ({
    invoicesApi: {
        prepareCanonical: jest.fn(),
        executePreparedCanonical: jest.fn(),
    },
}));
jest.mock('../../../../utils/financialEntryNotifier', () => ({
    showFinancialEntryNotification: jest.fn(),
}));
jest.mock('../../../../utils/clientUuid', () => ({ clientUuid: () => 'client-uuid' }));
jest.mock('../utils/canonicalInvoiceCommand', () => ({
    companyInvoiceValidationError: jest.fn(() => null),
    canonicalInvoiceValidationError: jest.fn(() => null),
    buildCanonicalInvoicePreparePayload: jest.fn(() => ({ idempotency_key: 'erp-web-invoice:client-uuid' })),
}));

const createProps = (isOnline: boolean) => ({
    invoice: {
        invoice_number: '',
        final_amount: 150,
        items: [{ product_id: 'product-1' }],
    } as any,
    selectedCustomer: {
        customer_id: 'customer-1',
        customer_name: 'Synthetic Customer',
        primary_phone: '9000000000',
        primary_email: 'customer@example.test',
    } as any,
    companyInfo: { name: 'Synthetic Company' } as any,
    isOnline,
    setInvoice: jest.fn(),
    setCreatedInvoiceData: jest.fn(),
    setShowSuccessModal: jest.fn(),
    setError: jest.fn(),
});

describe('useInvoiceSave API-only policy', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(window, 'confirm').mockReturnValue(true);
        (invoicesApi.prepareCanonical as jest.Mock).mockResolvedValue({
            data: {
                command_request_id: '10000000-0000-4000-8000-000000000001',
                preview_hash: `sha256:${'a'.repeat(64)}`,
                financial_impact: [{ receivable: '150.00' }],
                tax_impact: [{ igst_total: '0.00' }],
                inventory_impact: [{}],
            },
        });
    });

    it('does not create or queue an invoice without an API connection', async () => {
        const props = createProps(false);
        const { result } = renderHook(() => useInvoiceSave(props));

        await act(async () => result.current.handleSaveInvoice());

        expect(invoicesApi.prepareCanonical).not.toHaveBeenCalled();
        expect(props.setCreatedInvoiceData).not.toHaveBeenCalled();
        expect(props.setShowSuccessModal).not.toHaveBeenCalled();
        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('No local or queued invoice'));
    });

    it('shows success only after the canonical API confirms ID and number', async () => {
        (invoicesApi.executePreparedCanonical as jest.Mock).mockResolvedValue({
            data: {
                success: true,
                invoice_id: 'invoice-uuid',
                invoice_number: 'INV-2026-0001',
                total_amount: 150,
            },
        });
        const props = createProps(true);
        const { result } = renderHook(() => useInvoiceSave(props));

        await act(async () => result.current.handleSaveInvoice());

        expect(invoicesApi.prepareCanonical).toHaveBeenCalledTimes(1);
        expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Authoritative backend preview'));
        expect(invoicesApi.executePreparedCanonical).toHaveBeenCalledTimes(1);
        expect(props.setCreatedInvoiceData).toHaveBeenCalledWith(expect.objectContaining({
            invoiceId: 'invoice-uuid',
            invoiceNumber: 'INV-2026-0001',
            isOffline: false,
        }));
        expect(props.setShowSuccessModal).toHaveBeenCalledWith(true);
        expect(showFinancialEntryNotification).toHaveBeenCalledWith(expect.objectContaining({
            status: 'confirmed',
            reference: 'INV-2026-0001',
        }));
    });

    it('keeps the flow in an error state when the API does not confirm execution', async () => {
        (invoicesApi.executePreparedCanonical as jest.Mock).mockResolvedValue({ data: { success: false } });
        const props = createProps(true);
        const { result } = renderHook(() => useInvoiceSave(props));

        await act(async () => result.current.handleSaveInvoice());

        expect(props.setCreatedInvoiceData).not.toHaveBeenCalled();
        expect(props.setShowSuccessModal).not.toHaveBeenCalled();
        expect(props.setError).toHaveBeenLastCalledWith(expect.stringContaining('did not confirm'));
    });

    it('does not approve or execute when the actor cancels the server preview', async () => {
        (window.confirm as jest.Mock).mockReturnValue(false);
        const props = createProps(true);
        const { result } = renderHook(() => useInvoiceSave(props));

        await act(async () => result.current.handleSaveInvoice());

        expect(invoicesApi.prepareCanonical).toHaveBeenCalledTimes(1);
        expect(invoicesApi.executePreparedCanonical).not.toHaveBeenCalled();
        expect(props.setError).toHaveBeenLastCalledWith(expect.stringContaining('No invoice was created'));
    });
});
