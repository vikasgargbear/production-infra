import fs from 'fs';
import path from 'path';

const read = (relativePath: string) => fs.readFileSync(path.join(__dirname, relativePath), 'utf8');

describe('desktop canonical sales and purchase UX boundaries', () => {
  it('contains no native alert or confirmation dialog in the active core paths', () => {
    const sources = [
      'invoice/InvoiceFlow.tsx',
      'invoice/hooks/useInvoiceActions.ts',
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
});
