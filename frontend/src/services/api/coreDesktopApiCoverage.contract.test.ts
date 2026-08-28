import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../../..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

const transport = read('frontend/src/services/api/canonicalOperatorActions.ts');
const coverage = read('docs/architecture/core-desktop-api-coverage.md');
const invoicePreview = read('frontend/src/components/sales/invoice/steps/InvoicePreviewStep.tsx');

const integratedOperations = [
  'sales.order.prepare', 'sales.dispatch.prepare', 'sales.invoice.prepare', 'sales.return.prepare',
  'procurement.purchase_order.prepare', 'procurement.goods_receipt.prepare',
  'procurement.supplier_invoice.prepare', 'procurement.purchase_return.prepare',
  'finance.customer_receipt.prepare', 'finance.supplier_payment.prepare',
  'finance.supplier_advance.prepare', 'finance.adjustment_note.prepare',
  'finance.expense_claim.prepare',
  'inventory.transfer.prepare', 'inventory.adjustment.prepare',
  'inventory.destruction.prepare', 'finance.bank_reconciliation.prepare',
];

it.each(integratedOperations)('%s is accepted by the single desktop command transport', operation => {
  expect(transport).toContain(`'${operation}'`);
  expect(coverage).toContain(`\`${operation}\``);
});

it('records both bounded adjustment outcomes and the integrated eighteenth expense outcome', () => {
  expect(coverage).toContain('Standalone customer credit');
  expect(coverage).toContain('Standalone supplier debit');
  expect(coverage).toContain('Expense claim / `finance.expense_claim.prepare`');
  expect(coverage).toContain('wired, separate approver; verified receipt and balanced journal readback');
});

it('documents the no-default and no-fallback business-data boundary', () => {
  expect(coverage).toMatch(/must not\s+silently become `0`/);
  expect(coverage).toContain('browser storage, IndexedDB, an offline queue');
  expect(coverage).toContain('exact canonical GET readback');
});

it('does not present a hard-coded e-invoice legal threshold as backend truth', () => {
  expect(invoicePreview).not.toContain('mandatory for B2B transactions above');
  expect(invoicePreview).toContain('canonicalInvoicePreviewUnavailableReason');
  expect(invoicePreview).toContain('Authoritative preview unavailable');
  expect(invoicePreview).toContain('No compliance status is inferred in the browser');
});
