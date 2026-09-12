import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import InvoiceFlow from './InvoiceFlow';
import { EscapeKeyProvider } from '../../../contexts/EscapeKeyContext';
import { invoiceDraftsApi } from '../../../services/api/modules/invoiceDrafts.api';

const mockInvoice = { invoice_date: '2026-09-13', items: [{ product_name: 'Retained product', product_id: 'product', batch_id: 'batch', branch_id: 'branch', quantity: '2.000000', unit_price: '22.00' }] };
const mockSetError = jest.fn();
jest.mock('../../../contexts/CompanyContext', () => ({ useCompany: () => ({ companyInfo: {} }) }));
jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { branch_id: 'branch' } }) }));
jest.mock('./hooks/useInvoiceLogic', () => ({ useInvoiceLogic: () => ({
    invoice: mockInvoice, selectedCustomer: null, employees: [], setError: mockSetError,
    productSearchRef: { current: null }, itemsTableRef: { current: null },
}) }));
jest.mock('../../global', () => ({ GenericSuccessModal: () => null, InvoiceDraftPicker: () => null }));
jest.mock('../CanonicalSalesCommandReview', () => () => null);
jest.mock('./steps/InvoiceDetailsStep', () => () => null);
jest.mock('./steps/InvoicePreviewStep', () => () => null);
jest.mock('./steps/InvoiceItemsStep', () => (props: any) => <section>
    <p>{props.invoice.items[0].product_name}</p>
    <input aria-label="Invoice rate" defaultValue={props.invoice.items[0].unit_price} />
    <button onClick={props.onClose}>Close invoice</button>
</section>);
jest.mock('../../../services/api/modules/invoiceDrafts.api', () => ({
    invoiceDraftsApi: { create: jest.fn() },
    invoiceDraftIdFromLocation: () => null,
    invoiceDraftMutationError: (error: unknown) => error,
}));

describe('InvoiceFlow unsaved exit', () => {
    beforeEach(() => jest.clearAllMocks());
    const mount = () => {
        const onClose = jest.fn();
        render(<EscapeKeyProvider><InvoiceFlow onClose={onClose} /></EscapeKeyProvider>);
        return onClose;
    };

    it('Escape offers a draft without losing the row; Keep editing and dialog Escape retain it', () => {
        const onClose = mount();
        const input = screen.getByLabelText('Invoice rate');
        input.focus();
        fireEvent.keyDown(input, { key: 'Escape' });
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        const keep = screen.getByRole('button', { name: 'Keep editing' });
        const leave = screen.getByRole('button', { name: 'Leave without saving' });
        expect(keep).toHaveFocus();
        fireEvent.keyDown(keep, { key: 'Tab', shiftKey: true });
        expect(leave).toHaveFocus();
        fireEvent.keyDown(leave, { key: 'Tab' });
        expect(keep).toHaveFocus();
        fireEvent.click(keep);
        expect(input).toHaveFocus();
        fireEvent.keyDown(input, { key: 'Escape' });
        fireEvent.keyDown(screen.getByRole('button', { name: 'Keep editing' }), { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByText('Retained product')).toBeInTheDocument();
        expect(input).toHaveValue('22.00');
        expect(onClose).not.toHaveBeenCalled();
        expect(invoiceDraftsApi.create).not.toHaveBeenCalled();
    });

    it('waits for authoritative draft save before closing and preserves exact editor state', async () => {
        let finish!: (value: unknown) => void;
        (invoiceDraftsApi.create as jest.Mock).mockReturnValue(new Promise(resolve => { finish = resolve; }));
        const onClose = mount();
        fireEvent.click(screen.getByRole('button', { name: 'Close invoice' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save draft and close' }));
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Save draft and close' })).toBeDisabled();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(invoiceDraftsApi.create).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({
            editor_state: expect.objectContaining({ invoice: mockInvoice }), command_payload: null,
        }) }));
        await act(async () => finish({ data: { draft_id: 'saved', row_version: 1 } }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('keeps both the dialog and invoice after a failed save', async () => {
        (invoiceDraftsApi.create as jest.Mock).mockRejectedValue(new Error('Save unavailable'));
        const onClose = mount();
        fireEvent.click(screen.getByRole('button', { name: 'Close invoice' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save draft and close' }));
        await waitFor(() => expect(mockSetError).toHaveBeenCalledWith('Save unavailable'));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Retained product')).toBeInTheDocument();
        expect(screen.getByLabelText('Invoice rate')).toHaveValue('22.00');
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Save draft and close' })).toBeEnabled();
    });
});
