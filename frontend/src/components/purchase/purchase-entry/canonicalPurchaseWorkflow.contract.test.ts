import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '../../..');
const read = (relativePath: string) => readFileSync(join(root, relativePath), 'utf8');

describe('canonical purchase workflow contract', () => {
  it('has no browser combined-purchase editor or legacy write boundary', () => {
    expect(existsSync(join(__dirname, 'PurchaseEntryFlow.tsx'))).toBe(false);
    expect(existsSync(join(__dirname, 'hooks/usePurchaseEntryLogic.ts'))).toBe(false);
    expect(existsSync(join(__dirname, 'hooks/usePurchaseEntrySave.ts'))).toBe(false);

    const activePurchase = [
      read('components/purchase/PurchaseHub.tsx'),
      read('components/purchase/purchase-entry/CanonicalPurchaseWorkflow.tsx'),
      read('components/purchase/purchase-entry/CanonicalSupplierInvoiceFlow.tsx'),
      read('components/purchase/grn/CanonicalGoodsReceiptForm.tsx'),
    ].join('\n');
    expect(activePurchase).not.toContain('/purchases/purchase-entry');
    expect(activePurchase).not.toContain('createPurchaseEntry');
  });

  it('keeps receipt and supplier invoice as separate reviewed commands with exact readback', () => {
    const receiptFlow = read('components/purchase/grn/CanonicalGoodsReceiptForm.tsx');
    const receiptLifecycle = read('components/purchase/grn/canonicalReceiptLifecycle.ts');
    const receiptApi = read('services/api/modules/purchase/canonicalGoodsReceipts.api.ts');
    const invoiceFlow = read('components/purchase/purchase-entry/CanonicalSupplierInvoiceFlow.tsx');
    const invoiceApi = read('services/api/modules/purchase/canonicalSupplierInvoices.api.ts');

    expect(receiptLifecycle).toContain("'procurement.goods_receipt.prepare'");
    expect(receiptFlow).toContain('data-testid={`receive-po-product-');
    expect(receiptFlow).toContain('source.product_id');
    expect(receiptApi).toContain('/canonical/goods-receipts/');
    expect(invoiceFlow).toContain("'procurement.supplier_invoice.prepare'");
    expect(invoiceApi).toContain('/canonical/supplier-invoices/');
    expect(invoiceFlow).toContain('validateCanonicalSupplierInvoicePreview');
    expect(invoiceFlow).toContain('reconcileCanonicalSupplierInvoice');
  });

  it('requires exact GSTR-2B and posted receipt evidence instead of inventing it', () => {
    const flow = read('components/purchase/purchase-entry/CanonicalSupplierInvoiceFlow.tsx');
    const builder = read('components/purchase/purchase-entry/utils/canonicalSupplierInvoiceCommand.ts');

    expect(flow).toContain('Load canonical GRN and GSTR-2B context first.');
    expect(flow).toContain('response.data.blocking_reasons');
    expect(builder).toContain('portal_evidence');
    expect(builder).toContain('goods_receipt_ids');
    expect(builder).not.toMatch(/gst[^\n]*(?:\|\||\?\?)\s*(?:0|5|12|18|28)\b/i);
    expect(builder).toContain('context.zero_rated_payment_mode');
    expect(builder).toContain('context.tax_charge_mechanism');
    expect(builder).not.toMatch(/zero_rated_payment_mode:\s*['"]/);
    expect(builder).not.toMatch(/tax_charge_mechanism:\s*['"]/);
  });
});
