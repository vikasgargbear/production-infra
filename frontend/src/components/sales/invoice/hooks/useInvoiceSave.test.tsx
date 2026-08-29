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
        getCanonicalPostingReadback: jest.fn(),
    },
}));
jest.mock('../../../../utils/financialEntryNotifier', () => ({
    showFinancialEntryNotification: jest.fn(),
}));
jest.mock('../../../../utils/clientUuid', () => ({ clientUuid: () => '10000000-0000-4000-8000-000000000099' }));
jest.mock('../utils/canonicalInvoiceCommand', () => ({
    invoicePreviewValidationError: jest.fn(() => null),
    buildCanonicalInvoicePreparePayload: jest.fn((invoice, _customer, key) => ({
        idempotency_key: key,
        invoice_total: String(invoice.final_amount),
    })),
}));

const preview = {
    command_request_id: '10000000-0000-4000-8000-000000000001',
    preview_hash: `sha256:${'a'.repeat(64)}`,
    financial_impact: [{ receivable: '150.00' }],
    tax_impact: [{ igst_total: '0.00' }],
    inventory_impact: [{}],
};

const posted = {
    sales_invoice_id: '10000000-0000-4000-8000-000000000002',
    invoice_number: 'INV-2026-0001',
    invoice_total: '9007199254740993.30',
};

const createProps = (isOnline: boolean) => ({
    invoice: {
        invoice_number: '',
        invoice_date: '2026-08-27',
        final_amount: '150.00',
        items: [{ product_id: 'product-1' }],
    } as any,
    selectedCustomer: {
        customer_id: 'customer-1',
        customer_name: 'Synthetic Customer',
        primary_phone: '9000000000',
        primary_email: 'customer@example.test',
    } as any,
    companyInfo: { name: 'Synthetic Company' } as any,
    documentPolicy: {} as any,
    businessDate: '2026-08-27',
    isOnline,
    setInvoice: jest.fn(),
    setCreatedInvoiceData: jest.fn(),
    setShowSuccessModal: jest.fn(),
    setError: jest.fn(),
});

describe('useInvoiceSave reviewed canonical lifecycle', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (invoicesApi.prepareCanonical as jest.Mock).mockResolvedValue({ data: preview });
        (invoicesApi.executePreparedCanonical as jest.Mock).mockResolvedValue({
            data: { success: true, invoice_id: posted.sales_invoice_id },
        });
        (invoicesApi.getCanonicalPostingReadback as jest.Mock).mockResolvedValue({ data: posted });
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

    it('prepares an immutable preview and waits for the visible acknowledgement CTA', async () => {
        const props = createProps(true);
        const { result } = renderHook(() => useInvoiceSave(props));
        await act(async () => result.current.handleSaveInvoice());
        expect(result.current.preparedPreview).toEqual(preview);
        expect(result.current.reviewOpen).toBe(true);
        expect(invoicesApi.executePreparedCanonical).not.toHaveBeenCalled();
        expect(props.setCreatedInvoiceData).not.toHaveBeenCalled();
    });

    it('uses the persisted draft prepare boundary and still never posts without confirmation', async () => {
        const props = createProps(true);
        const prepareDraft = jest.fn().mockResolvedValue(preview);
        const { result } = renderHook(() => useInvoiceSave({ ...props, prepareDraft }));
        await act(async () => result.current.handleSaveInvoice());
        expect(prepareDraft).toHaveBeenCalledTimes(1);
        expect(invoicesApi.prepareCanonical).not.toHaveBeenCalled();
        expect(invoicesApi.executePreparedCanonical).not.toHaveBeenCalled();
    });

    it('Back closes review and reopening the unchanged draft reuses its preview and idempotency', async () => {
        const props = createProps(true);
        const { result } = renderHook(() => useInvoiceSave(props));
        await act(async () => result.current.handleSaveInvoice());
        act(() => result.current.closeInvoiceReview());
        expect(result.current.reviewOpen).toBe(false);
        await act(async () => result.current.handleSaveInvoice());
        expect(result.current.reviewOpen).toBe(true);
        expect(invoicesApi.prepareCanonical).toHaveBeenCalledTimes(1);
        expect(invoicesApi.executePreparedCanonical).not.toHaveBeenCalled();
    });

    it('posts only after explicit confirmation and verifies exact canonical readback', async () => {
        const props = createProps(true);
        const { result } = renderHook(() => useInvoiceSave(props));
        await act(async () => result.current.handleSaveInvoice());
        await act(async () => result.current.confirmPreparedInvoice());
        expect(invoicesApi.executePreparedCanonical).toHaveBeenCalledWith(
            preview,
            '10000000-0000-4000-8000-000000000099',
        );
        expect(invoicesApi.getCanonicalPostingReadback).toHaveBeenCalledWith(posted.sales_invoice_id);
        expect(props.setCreatedInvoiceData).toHaveBeenCalledWith(expect.objectContaining({
            invoiceId: posted.sales_invoice_id,
            invoiceNumber: posted.invoice_number,
            totalAmount: '9007199254740993.30',
            isOffline: false,
        }));
        expect(props.setShowSuccessModal).toHaveBeenCalledWith(true);
        expect(showFinancialEntryNotification).toHaveBeenCalledWith(expect.objectContaining({
            status: 'confirmed',
            reference: posted.invoice_number,
            amount: '9007199254740993.30',
        }));
    });

    it('retries GET-only after execute succeeded but authoritative readback was temporarily unavailable', async () => {
        (invoicesApi.getCanonicalPostingReadback as jest.Mock)
            .mockRejectedValueOnce(new Error('readback unavailable'))
            .mockResolvedValueOnce({ data: posted });
        const props = createProps(true);
        const { result } = renderHook(() => useInvoiceSave(props));
        await act(async () => result.current.handleSaveInvoice());
        await act(async () => result.current.confirmPreparedInvoice());
        await act(async () => result.current.confirmPreparedInvoice());
        expect(invoicesApi.executePreparedCanonical).toHaveBeenCalledTimes(1);
        expect(invoicesApi.getCanonicalPostingReadback).toHaveBeenCalledTimes(2);
        expect(props.setShowSuccessModal).toHaveBeenCalledWith(true);
    });

    it('retries a response-lost execute with the same command and lifecycle instead of preparing again', async () => {
        (invoicesApi.executePreparedCanonical as jest.Mock)
            .mockRejectedValueOnce(new Error('connection closed after POST'))
            .mockResolvedValueOnce({ data: { success: true, invoice_id: posted.sales_invoice_id } });
        const props = createProps(true);
        const { result } = renderHook(() => useInvoiceSave(props));
        await act(async () => result.current.handleSaveInvoice());
        await act(async () => result.current.confirmPreparedInvoice());
        await act(async () => result.current.confirmPreparedInvoice());
        expect(invoicesApi.prepareCanonical).toHaveBeenCalledTimes(1);
        expect(invoicesApi.executePreparedCanonical).toHaveBeenCalledTimes(2);
        expect((invoicesApi.executePreparedCanonical as jest.Mock).mock.calls[0])
            .toEqual((invoicesApi.executePreparedCanonical as jest.Mock).mock.calls[1]);
        expect(props.setShowSuccessModal).toHaveBeenCalledWith(true);
    });
});
