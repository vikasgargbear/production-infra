import fs from 'fs';
import path from 'path';

const read = (relativePath: string) => fs.readFileSync(path.join(__dirname, relativePath), 'utf8');

describe('desktop canonical sales and purchase UX boundaries', () => {
  it('contains no native alert or confirmation dialog in the active core paths', () => {
    const sources = [
      'invoice/InvoiceFlow.tsx',
      'invoice/invoicelist/components/InvoiceTable.tsx',
      'challan/hooks/useChallanLogic.ts',
      'challan/ui/ChallanSuccess.tsx',
      'order/hooks/useSalesOrderLogic.ts',
      '../payment/entry/ModularPaymentEntry.tsx',
      '../purchase/purchase-order/hooks/usePurchaseOrderSave.ts',
    ].map(read).join('\n');

    expect(sources).not.toMatch(/window\.(?:alert|confirm)\s*\(/);
    expect(sources).not.toMatch(/(^|[^.\w])alert\s*\(/m);
  });

  it('keeps direct legacy order conversion unreachable', () => {
    const source = read('ui/ConvertToInvoiceButton.tsx');
    expect(source).not.toContain('ordersApi');
    expect(source).not.toContain('convertToInvoice');
    expect(source).toContain('disabled');
    expect(source).toContain('canonical batch and dispatch review');
  });

  it('keeps canonical product and batch decimals out of IEEE-754 transforms', () => {
    const sources = [
      '../global/search/ProductSearch.tsx',
      '../global/selector/BatchSelector.tsx',
      '../global/selector/batchEligibility.ts',
      'utils/productItemTransform.ts',
    ].map(read).join('\n');

    expect(sources).not.toMatch(/\bNumber\s*\(/);
    expect(sources).not.toMatch(/\bparseFloat\s*\(/);
    expect(sources).not.toMatch(/\.toFixed\s*\(/);
  });

  it('keeps sales entry controls responsive at phone widths', () => {
    const invoiceItems = read('invoice/steps/InvoiceItemsStep.tsx');
    const invoiceDetails = read('invoice/steps/InvoiceDetailsStep.tsx');
    const dispatchDetails = read('challan/steps/ChallanDetailsStep.tsx');

    expect(invoiceItems).toContain('grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3');
    expect(invoiceDetails).toContain('grid grid-cols-1 items-end gap-4 sm:grid-cols-12');
    expect(invoiceDetails).toContain('grid grid-cols-2 overflow-hidden');
    expect(dispatchDetails).toContain('data-testid="dispatch-batch-cards"');
    expect(dispatchDetails).toContain('min-h-11 w-full max-w-full');
  });
});
