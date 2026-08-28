import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const source = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

test.each([
  ['purchase order', 'purchase/purchase-order/PurchaseOrderFlow.tsx', 'canonicalReview.commandRequestId'],
  ['supplier invoice', 'purchase/purchase-entry/CanonicalSupplierInvoiceFlow.tsx', 'prepared.command_request_id'],
  ['supplier payment', 'payment/entry/PaymentMade.tsx', 'prepared.command_request_id'],
])('%s confirmation exposes the exact canonical command', (_name, file, expression) => {
  const implementation = source(file);
  expect(implementation).toContain('aria-label="Canonical command ID"');
  expect(implementation).toContain(expression);
});
