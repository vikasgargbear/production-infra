import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import { PaymentProvider, usePayment } from '../../../contexts/PaymentContext';
import { getCustomerReceiptContext } from '../../../services/api/modules/finance/customerReceipts.api';
import PaymentFlowOptimized from './PaymentFlowOptimized';

jest.mock('../../../hooks/usePermissions', () => ({
  usePermissions: () => ({ hasCapability: () => true }),
}));
jest.mock('../../../services/api/modules/finance/customerReceipts.api', () => ({
  getCustomerReceiptContext: jest.fn(),
  uploadCustomerReceiptEvidence: jest.fn(),
}));
jest.mock('../../global', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CustomerSearch: require('react').forwardRef(({ onChange }: any, _ref: any) => (
    <button type="button" onClick={() => onChange({
      customer_id: '0198ea37-2b1d-7c8d-9123-123456789abc',
      customer_name: 'Operator Customer',
    })}>Choose customer</button>
  )),
}));

const branchId = '0198ea37-2b1e-7c8d-9123-123456789abc';
const orderId = '0198ea37-2b1f-7c8d-9123-123456789abc';
const evidenceId = '0198ea37-2b20-7c8d-9123-123456789abc';

const context = {
  business_date: '2026-08-29', payment_methods: ['cash', 'cheque', 'bank_transfer', 'card', 'upi'],
  settlement_accounts: [],
  evidence: [{
    attachment_id: evidenceId, branch_id: branchId, branch_code: 'MAIN', branch_name: 'Main Branch',
    original_filename: 'upi-proof.pdf', document_date: '2026-08-29', retention_until: '2033-08-29',
    status: 'verified', verified_at: '2026-08-29T08:00:00Z', sha256: 'a'.repeat(64),
  }],
  approved_goods_orders: [{
    sales_order_id: orderId, order_number: 'SO-0021', order_date: '2026-08-29',
    branch_id: branchId, branch_code: 'MAIN', branch_name: 'Main Branch', grand_total: '500.00',
    prior_active_advance: '100.00', remaining_advance_amount: '400.00',
  }],
};

const Snapshot = () => {
  const { payment } = usePayment();
  return <output data-testid="payment-snapshot">{JSON.stringify(payment)}</output>;
};

describe('operator-completable customer receipt sources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCustomerReceiptContext as jest.Mock).mockResolvedValue({ data: context });
  });

  it('uses human-readable order and evidence selectors without raw UUID inputs', async () => {
    render(<PaymentProvider><PaymentFlowOptimized /><Snapshot /></PaymentProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Choose customer' }));
    await waitFor(() => expect(getCustomerReceiptContext).toHaveBeenCalledWith(
      '0198ea37-2b1d-7c8d-9123-123456789abc',
    ));

    expect(screen.queryByLabelText('Verified evidence ID')).toBeNull();
    expect(screen.queryByLabelText('Approved goods order ID')).toBeNull();
    expect(screen.queryByLabelText('Order branch ID')).toBeNull();

    fireEvent.change(screen.getByLabelText('Receipt purpose'), {
      target: { value: 'customer_advance' },
    });
    const order = await screen.findByLabelText('Approved goods order');
    expect(order).toHaveTextContent('SO-0021');
    expect(order).toHaveTextContent('₹400.00 available');
    fireEvent.change(order, { target: { value: orderId } });
    fireEvent.change(screen.getByLabelText('Verified receipt evidence'), {
      target: { value: evidenceId },
    });

    const snapshot = screen.getByTestId('payment-snapshot').textContent || '';
    expect(snapshot).toContain(`"sales_order_id":"${orderId}"`);
    expect(snapshot).toContain(`"branch_id":"${branchId}"`);
    expect(snapshot).toContain(`"evidence_attachment_id":"${evidenceId}"`);
    expect(screen.getByText(/SO-0021 · Main Branch/)).toBeInTheDocument();
    expect(screen.getAllByText(/upi-proof.pdf · 2026-08-29/).length).toBeGreaterThan(0);
  });
});
