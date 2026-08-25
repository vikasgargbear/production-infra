import fs from 'fs';
import path from 'path';

const source = (relativePath: string) => fs.readFileSync(
  path.resolve(__dirname, '..', relativePath),
  'utf8',
);

describe('canonical desktop sales business-fact boundaries', () => {
  it('keeps retired compatibility reports and synthetic helper modals deleted', () => {
    for (const relativePath of [
      'UnifiedSalesHistory.tsx',
      'order/SalesOrderList.tsx',
      'modals/ImportDocumentModal.tsx',
      'modals/BillDiscountModal.tsx',
      'modals/CashCalculatorModal.tsx',
      'modals/ItemProfitModal.tsx',
      'modals/LastDealModal.tsx',
      'modals/TaxDetailModal.tsx',
    ]) {
      expect(fs.existsSync(path.resolve(__dirname, '..', relativePath))).toBe(false);
    }
    expect(fs.existsSync(path.resolve(__dirname, '../../gst/utils/gstCalculations.ts'))).toBe(false);
  });

  it('does not invent document dates or payment state in creation/history', () => {
    const invoiceLogic = source('invoice/hooks/useInvoiceLogic.ts');
    const orderLogic = source('order/hooks/useSalesOrderLogic.ts');
    const challanLogic = source('challan/hooks/useChallanLogic.ts');
    const history = source('invoice/invoicelist/utils/invoiceListProjection.ts');
    expect(invoiceLogic).not.toMatch(/addCalendarDays\([^,]+,\s*30\)/);
    expect(orderLogic).not.toMatch(/addCalendarDays\([^,]+,\s*7\)/);
    expect(challanLogic).not.toMatch(/addCalendarDays\([^,]+,\s*1\)/);
    expect(history).not.toMatch(/payment_status[^\n]*(?:\?\?|\|\|)\s*['"]pending['"]/);
  });

  it('does not synthesize tax splits, legal identities, or selling totals in previews', () => {
    const invoicePreview = source('invoice/ui/InvoicePreviewEnterprise.tsx');
    const invoiceStep = source('invoice/steps/InvoicePreviewStep.tsx');
    const dispatchPreview = source('challan/ui/ChallanPreview.tsx');
    expect(invoicePreview).not.toMatch(/tax_amount[^\n]*\/\s*2/);
    expect(invoicePreview).not.toMatch(/Your Company|Your Company Name|AASO PHARM|08AAX|\b3004\b/);
    expect(invoiceStep).not.toMatch(/>=\s*500|distance\s*>\s*50/i);
    expect(dispatchPreview).not.toMatch(/formatCurrency|taxable_amount|total_tax_amount|challan\.total_amount/);
    expect(dispatchPreview).not.toMatch(/AASO PHARM|Maharashtra|08AAX/);
  });

  it('keeps dispatch posted readback on inventory evidence rather than a nonexistent total', () => {
    const save = source('challan/hooks/useChallanSave.ts');
    expect(save).toContain('detail.inventory_base_quantity');
    expect(save).toContain('detail.inventory_value');
    expect(save).toContain('detail.lines');
    expect(save).not.toContain('detail.total_amount');
    expect(save).not.toContain('detail.items ?? challan.items');
  });

  it('requires exact imported tax, discount, quantity, and rate fields', () => {
    const imports = source('utils/documentImport.ts');
    expect(imports).toContain("exactRequired(item.gst_percent");
    expect(imports).not.toMatch(/gst_percent[^\n]*(?:tax_percent|tax_rate)/);
    expect(imports).toContain("exactRequired(item.discount_percent");
    expect(imports).not.toMatch(/gst_percent[^\n]*(?:\?\?|\|\|)\s*['"]0/);
    expect(imports).not.toMatch(/discount_percent[^\n]*(?:\?\?|\|\|)\s*['"]0/);
  });

  it('does not reintroduce readback identity, status, or company aliases', () => {
    const orderSave = source('order/hooks/useSalesOrderSave.ts');
    const invoiceSave = source('invoice/hooks/useInvoiceSave.ts');
    const history = source('invoice/invoicelist/utils/salesHistoryPresentation.ts');
    const invoicePreview = source('invoice/ui/InvoicePreviewEnterprise.tsx');
    const orderReview = source('order/steps/OrderReviewStep.tsx');
    const invoiceApi = fs.readFileSync(
      path.resolve(__dirname, '../../../services/api/modules/sales/invoices.api.ts'),
      'utf8',
    );

    expect(orderSave).not.toMatch(/sales_order_id\s*(?:\?\?|\|\|)/);
    expect(invoiceSave).not.toMatch(/invoice_number[^\n]*(?:\?\?|\|\|)\s*['"]{2}/);
    expect(history).not.toMatch(/payment_status[^\n]*(?:\?\?|\|\|)[^\n]*document_status/);
    expect(invoicePreview).not.toMatch(/company_name|state_name|bank_accounts/);
    expect(orderReview).not.toMatch(/calculated_total[^\n]*(?:\?\?|\|\|)[^\n]*\.total/);
    expect(invoiceApi).not.toContain('getLastDeals');
  });

  it('leaves GST treatment unresolved until the canonical preview and consumes exact address fields', () => {
    const invoiceLogic = source('invoice/hooks/useInvoiceLogic.ts');
    const invoiceDetails = source('invoice/steps/InvoiceDetailsStep.tsx');
    const invoiceCommand = source('invoice/utils/canonicalInvoiceCommand.ts');
    const orderLogic = source('order/hooks/useSalesOrderLogic.ts');
    const orderReview = source('order/steps/OrderReviewStep.tsx');
    const challanLogic = source('challan/hooks/useChallanLogic.ts');
    const challanTypes = source('challan/types/challanTypes.ts');
    const sharedLogic = source('hooks/useSalesTransaction.ts');
    const itemTransform = source('utils/productItemTransform.ts');

    for (const draftSource of [invoiceLogic, orderLogic, orderReview, challanLogic, challanTypes]) {
      expect(draftSource).not.toMatch(/gst_type:\s*['"]CGST\/SGST['"]/);
    }
    expect(invoiceLogic).not.toMatch(/address_info|billing_address\?\.|shipping_address\?\./);
    expect(invoiceDetails).not.toMatch(/state_name|determineGstType/);
    expect(invoiceCommand).not.toMatch(/state_name|deliveryAddress\.state\b/);
    expect(orderLogic).not.toMatch(/customer\?\.(?:id|name)|customer\.(?:address|state|pincode)/);
    expect(challanLogic).not.toMatch(/customer\.(?:phone|mobile|contact_number|name)\b/);
    expect(sharedLogic).not.toMatch(/customer\.(?:address|state|pincode)\b/);
    expect(sharedLogic).not.toContain('Date.now()');
    expect(itemTransform).not.toContain('Date.now()');
  });

  it('takes order commercial policy from authenticated server context', () => {
    const command = source('utils/canonicalSalesChainCommand.ts');
    const save = source('order/hooks/useSalesOrderSave.ts');
    expect(command).toContain('policy.default_rounding_policy');
    expect(command).toContain('policy.default_zero_rated_payment_mode');
    expect(command).toContain('policy.default_price_basis');
    expect(command).not.toContain("rounding_policy: 'none'");
    expect(command).not.toContain("zero_rated_payment_mode: 'not_applicable'");
    expect(command).not.toContain("price_basis: 'tax_exclusive'");
    expect(command).not.toContain('record?.address_id ?? record?.id');
    expect(save).toContain('documentPolicy');
  });
});
