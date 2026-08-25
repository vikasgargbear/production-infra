import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../../../..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

test('customer receipt requires explicit settlement facts and never invents allocations', () => {
  const context = read('frontend/src/contexts/PaymentContext.tsx');
  const flow = read('frontend/src/components/payment/entry/ModularPaymentEntry.tsx');
  const details = read('frontend/src/components/payment/shared/PaymentFlowOptimized.tsx');
  const summary = read('frontend/src/components/payment/shared/PaymentSummaryCompact.tsx');

  expect(context).toContain("payment_mode: ''");
  expect(context).not.toContain("payment_mode: 'UPI'");
  expect(context).toContain("payment_date: ''");
  expect(context).not.toContain('new Date()');
  expect(details).toContain('getCustomerReceiptContext()');
  expect(details).not.toContain('const paymentModes =');
  expect(details).not.toContain('splitPayments');
  expect(details).not.toContain('parseFloat');
  expect(flow).not.toContain("amount: newManualAllocations[id] || '0.00'");
  expect(flow).not.toContain("invoice_number: inv?.invoice_number || ''");
  expect(flow).not.toContain('GSTCalculator');
  expect(summary).toContain("!payment.allocation_method && 'Not selected'");
  expect(summary).not.toContain("!payment.allocation_method && 'FIFO'");
});
