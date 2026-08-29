import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import ModularPaymentEntry from './ModularPaymentEntry';
import { paymentAllocationApi } from '../../../services/api/modules/finance/paymentAllocation.api';
import {
  approveCustomerReceipt,
  prepareCustomerReceipt,
  reconcileCustomerReceipt,
} from '../../../services/api/modules/finance/customerReceipts.api';

jest.mock('../../../hooks/usePermissions', () => ({
  usePermissions: () => ({ hasCapability: () => true }),
}));

jest.mock('../../../services/api/modules/finance/paymentAllocation.api', () => ({
  paymentAllocationApi: { getUnpaidInvoices: jest.fn(), getCustomerReceiptReadback: jest.fn() },
}));
jest.mock('../../../services/api/modules/finance/customerReceipts.api', () => ({
  approveCustomerReceipt: jest.fn(),
  prepareCustomerReceipt: jest.fn(),
  reconcileCustomerReceipt: jest.fn(),
}));
jest.mock('../shared/PaymentSummaryCompact', () => () => <div>Receipt review</div>);
jest.mock('../shared/PaymentFlowOptimized', () => () => {
  const { usePayment } = require('../../../contexts/PaymentContext');
  const { setPaymentField } = usePayment();
  return <button onClick={() => {
    setPaymentField('amount', '168.00');
    setPaymentField('payment_date', '2026-08-25');
    setPaymentField('business_date', '2026-08-25');
    setPaymentField('payment_mode', 'upi');
    setPaymentField('reference_number', 'UPI-RETRY-1');
    setPaymentField('bank_account_id', '0198ea37-2b20-7c8d-9123-123456789abc');
    setPaymentField('settlement_account_id', '0198ea37-2b21-7c8d-9123-123456789abc');
    setPaymentField('evidence_attachment_id', '0198ea37-2b24-7c8d-9123-123456789abc');
    globalThis.dispatchEvent(new CustomEvent('customerSelected', { detail: {
      customer_id: '0198ea37-2b1d-7c8d-9123-123456789abc', customer_name: 'E2E Customer',
    } }));
  }}>Select fixture customer</button>;
});
jest.mock('../../global', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  ModuleHeader: () => null,
  GSTCalculator: () => null,
  CustomerCreation: () => null,
  CustomerSearch: () => null,
  ProceedToReviewComponent: ({ onProceed, onBack, proceedText }: any) => <div>
    {onBack && <button onClick={onBack}>Back</button>}
    <button onClick={onProceed}>{proceedText}</button>
  </div>,
}));

const paymentId = '0198ea37-2b30-7c8d-9123-123456789abc';

describe('ModularPaymentEntry canonical retry boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, 'confirm');
    (paymentAllocationApi.getUnpaidInvoices as jest.Mock).mockResolvedValue({ data: {
      invoice_count: 1,
      invoices: [{
        invoice_id: '0198ea37-2b22-7c8d-9123-123456789abc',
        open_item_id: '0198ea37-2b23-7c8d-9123-123456789abc',
        branch_id: '0198ea37-2b1e-7c8d-9123-123456789abc',
        invoice_number: 'DEMO-SI-000004', invoice_date: '2026-08-24',
        total_amount: '168.00', allocated: '0.00', due: '168.00', payment_status: 'pending',
      }],
    } });
    (prepareCustomerReceipt as jest.Mock).mockResolvedValue({ data: {
      command_request_id: '0198ea37-2b33-7c8d-9123-123456789abc',
      preview_hash: `sha256:${'a'.repeat(64)}`,
      branch_id: '0198ea37-2b1e-7c8d-9123-123456789abc',
      financial_impact: [{
        receipt_amount: '168.00',
        settlement_account_id: '0198ea37-2b21-7c8d-9123-123456789abc',
        allocations: [{
          open_item_id: '0198ea37-2b23-7c8d-9123-123456789abc',
          allocated_amount: '168.00',
        }],
      }],
    } });
    (approveCustomerReceipt as jest.Mock).mockResolvedValue({ payment_id: paymentId });
    (reconcileCustomerReceipt as jest.Mock)
      .mockRejectedValueOnce(new Error('readback temporarily unavailable'))
      .mockResolvedValueOnce({ payment_id: paymentId, payment_number: 'RCPT-4' });
  });

  afterEach(() => jest.restoreAllMocks());

  it('retries only readback after execution has returned a payment identity', async () => {
    render(<ModularPaymentEntry onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select fixture customer' }));
    await waitFor(() => expect(paymentAllocationApi.getUnpaidInvoices).toHaveBeenCalled());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 550)); });
    await screen.findByText(/FIFO Applied/);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const reviewPosting = await screen.findByRole('button', { name: 'Review Posting' });
    reviewPosting.focus();
    fireEvent.click(reviewPosting);
    const review = await screen.findByRole('dialog', { name: 'Approve customer receipt' });
    expect(screen.getByTestId('canonical-immutable-preview')).toBe(review);
    expect(prepareCustomerReceipt).toHaveBeenCalledTimes(1);
    expect(approveCustomerReceipt).not.toHaveBeenCalled();
    expect(review.textContent).toContain('DEMO-SI-000004');
    expect(review.textContent).toContain('₹168.00');
    expect(review.textContent).toContain('UPI-RETRY-1');
    fireEvent.click(screen.getByRole('button', { name: 'Approve & Post Receipt' }));
    await screen.findByText(/readback temporarily unavailable/);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect((await screen.findAllByText(new RegExp(paymentId))).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Reconcile Receipt' }));
    await screen.findByText(/Receipt posted and reconciled against the authoritative invoice balance/);
    expect(screen.getByTestId('canonical-posted-resource-id')).toHaveTextContent(paymentId);
    expect(prepareCustomerReceipt).toHaveBeenCalledTimes(1);
    expect(approveCustomerReceipt).toHaveBeenCalledTimes(1);
    expect(reconcileCustomerReceipt).toHaveBeenCalledTimes(2);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('prepares first and lets Escape leave the server preview unapproved without transport writes', async () => {
    render(<ModularPaymentEntry onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select fixture customer' }));
    await waitFor(() => expect(paymentAllocationApi.getUnpaidInvoices).toHaveBeenCalled());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 550)); });
    await screen.findByText(/FIFO Applied/);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const reviewPosting = await screen.findByRole('button', { name: 'Review Posting' });
    reviewPosting.focus();
    fireEvent.click(reviewPosting);
    const dialog = await screen.findByRole('dialog', { name: 'Approve customer receipt' });
    const closeReview = screen.getByRole('button', { name: 'Close receipt review without posting' });
    const approve = screen.getByRole('button', { name: 'Approve & Post Receipt' });
    expect(closeReview).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(approve).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(closeReview).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Approve customer receipt' })).toBeNull());
    expect(reviewPosting).toHaveFocus();
    expect(await screen.findByText(/prepared but unapproved/)).not.toBeNull();
    expect(prepareCustomerReceipt).toHaveBeenCalledTimes(1);
    expect(approveCustomerReceipt).not.toHaveBeenCalled();
    expect(reconcileCustomerReceipt).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('keeps outstanding invoices bound to the most recently selected customer', async () => {
    let resolveFirst!: (value: any) => void;
    let resolveSecond!: (value: any) => void;
    (paymentAllocationApi.getUnpaidInvoices as jest.Mock)
      .mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve; }))
      .mockReturnValueOnce(new Promise(resolve => { resolveSecond = resolve; }));
    render(<ModularPaymentEntry onClose={jest.fn()} />);

    act(() => {
      globalThis.dispatchEvent(new CustomEvent('customerSelected', { detail: {
        customer_id: '0198ea37-2b1d-7c8d-9123-123456789ab1', customer_name: 'Customer A',
      } }));
      globalThis.dispatchEvent(new CustomEvent('customerSelected', { detail: {
        customer_id: '0198ea37-2b1d-7c8d-9123-123456789ab2', customer_name: 'Customer B',
      } }));
    });
    await act(async () => resolveSecond({ data: { invoice_count: 1, invoices: [{
      invoice_id: '0198ea37-2b22-7c8d-9123-123456789ab2',
      open_item_id: '0198ea37-2b23-7c8d-9123-123456789ab2',
      branch_id: '0198ea37-2b1e-7c8d-9123-123456789abc',
      invoice_number: 'B-INVOICE', invoice_date: '2026-08-24',
      total_amount: '50.00', allocated: '0.00', due: '50.00', payment_status: 'pending',
    }] } }));
    expect(await screen.findByText('B-INVOICE')).toBeInTheDocument();

    await act(async () => resolveFirst({ data: { invoice_count: 1, invoices: [{
      invoice_id: '0198ea37-2b22-7c8d-9123-123456789ab1',
      open_item_id: '0198ea37-2b23-7c8d-9123-123456789ab1',
      branch_id: '0198ea37-2b1e-7c8d-9123-123456789abc',
      invoice_number: 'A-INVOICE', invoice_date: '2026-08-24',
      total_amount: '75.00', allocated: '0.00', due: '75.00', payment_status: 'pending',
    }] } }));
    expect(screen.queryByText('A-INVOICE')).toBeNull();
    expect(screen.getByText('B-INVOICE')).toBeInTheDocument();
  });
});
