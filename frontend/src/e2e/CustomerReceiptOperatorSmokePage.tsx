import React from 'react';

import { PaymentProvider, usePayment } from '../contexts/PaymentContext';
import PaymentFlowOptimized from '../components/payment/shared/PaymentFlowOptimized';

const CUSTOMER_ID = '0198ea37-2b1d-7c8d-9123-123456789abc';
const INVOICE_ID = '0198ea37-2b22-7c8d-9123-123456789abc';
const BRANCH_ID = '0198ea37-2b1e-7c8d-9123-123456789abc';

const SeedOperatorReceipt: React.FC = () => {
  const { setCustomer, setOutstandingInvoices, setPaymentData } = usePayment();
  React.useEffect(() => {
    setCustomer({ customer_id: CUSTOMER_ID, customer_name: 'Operator Receipt Customer' });
    setOutstandingInvoices([{
      invoice_id: INVOICE_ID,
      open_item_id: '0198ea37-2b23-7c8d-9123-123456789abc',
      branch_id: BRANCH_ID,
      invoice_number: 'SI-0021', invoice_date: '2026-08-28', amount_due: '400.00',
    }]);
    setPaymentData({
      amount: '100.00', payment_mode: 'upi', reference_number: 'UPI-SMOKE-1',
      allocations: [{ invoice_id: INVOICE_ID, invoice_number: 'SI-0021', amount: '100.00' }],
    });
    // This deterministic test-only seed runs once; context actions are render-local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

const CustomerReceiptOperatorSmokePage: React.FC = () => (
  <main className="min-h-screen bg-gray-50 p-3 sm:p-6">
    <div className="mx-auto max-w-4xl rounded-xl border border-gray-200 bg-white p-3 sm:p-6">
      <h1 className="mb-4 text-xl font-semibold">Customer receipt operator entry</h1>
      <PaymentProvider>
        <SeedOperatorReceipt />
        <PaymentFlowOptimized />
      </PaymentProvider>
    </div>
  </main>
);

export default CustomerReceiptOperatorSmokePage;
