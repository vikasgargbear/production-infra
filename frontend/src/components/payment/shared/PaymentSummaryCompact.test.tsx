import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import { PaymentProvider, usePayment } from '../../../contexts/PaymentContext';
import PaymentSummaryCompact from './PaymentSummaryCompact';

jest.mock('../../global', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const Fixture = () => {
  const { setCustomer, setPaymentData } = usePayment();
  const configured = React.useRef(false);
  React.useEffect(() => {
    if (configured.current) return;
    configured.current = true;
    setCustomer({ customer_id: 'customer-1', customer_name: 'Exact Customer' });
    setPaymentData({
      amount: '0.30',
      payment_mode: 'UPI',
      payment_date: '2026-08-25',
      reference_number: 'UPI-EXACT-030',
      allocation_method: 'manual',
      allocations: [
        { invoice_id: 'invoice-1', invoice_number: 'INV-01', amount: '0.10' },
        { invoice_id: 'invoice-2', invoice_number: 'INV-02', amount: '0.20' },
      ],
    });
  }, [setCustomer, setPaymentData]);
  return <PaymentSummaryCompact />;
};

describe('PaymentSummaryCompact exact money projection', () => {
  it('renders 0.10 plus 0.20 as an exact 0.30 multi-allocation without an advance', async () => {
    render(<PaymentProvider><Fixture /></PaymentProvider>);

    await waitFor(() => expect(screen.getAllByText('₹0.30').length).toBeGreaterThanOrEqual(2));
    expect(screen.getByText('₹0.10')).toBeInTheDocument();
    expect(screen.getByText('₹0.20')).toBeInTheDocument();
    expect(screen.queryByText('Customer Advance')).not.toBeInTheDocument();
    expect(screen.queryByText('Full Advance Payment')).not.toBeInTheDocument();
  });
});
