import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import ModularPaymentEntry from './ModularPaymentEntry';
import { paymentAllocationApi } from '../../../services/api/modules/finance/paymentAllocation.api';
import {
  approveCustomerReceipt,
  prepareCustomerReceipt,
  reconcileCustomerReceipt,
} from '../../../services/api/modules/finance/customerReceipts.api';

jest.mock('../../../services/api/modules/finance/paymentAllocation.api', () => ({
  paymentAllocationApi: { getUnpaidInvoices: jest.fn(), getCustomerReceiptReadback: jest.fn() },
}));
jest.mock('../../../services/api/modules/finance/customerReceipts.api', () => ({
  approveCustomerReceipt: jest.fn(),
  prepareCustomerReceipt: jest.fn(),
  reconcileCustomerReceipt: jest.fn(),
}));
jest.mock('../shared/PaymentSummaryCompact', () => () => <div>Receipt review</div>);
jest.mock('../shared/PaymentSummary', () => () => null);
jest.mock('../shared/InvoiceSelector', () => () => null);
jest.mock('../shared/PaymentFlowOptimized', () => () => {
  const { usePayment } = require('../../../contexts/PaymentContext');
  const { setPaymentField } = usePayment();
  return <button onClick={() => {
    setPaymentField('amount', '168.00');
    setPaymentField('payment_mode', 'UPI');
    setPaymentField('reference_number', 'UPI-RETRY-1');
    setPaymentField('bank_account_id', '0198ea37-2b20-7c8d-9123-123456789abc');
    setPaymentField('settlement_account_id', '0198ea37-2b21-7c8d-9123-123456789abc');
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
    jest.spyOn(window, 'confirm').mockReturnValue(true);
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
    fireEvent.click(await screen.findByRole('button', { name: 'Post Receipt' }));
    await screen.findByText(/readback temporarily unavailable/);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect((await screen.findAllByText(new RegExp(paymentId))).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Reconcile Receipt' }));
    await screen.findByText(/Payment Recorded Successfully/);
    expect(prepareCustomerReceipt).toHaveBeenCalledTimes(1);
    expect(approveCustomerReceipt).toHaveBeenCalledTimes(1);
    expect(reconcileCustomerReceipt).toHaveBeenCalledTimes(2);
  });
});
