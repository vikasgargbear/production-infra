import fs from 'fs';
import path from 'path';

const calculationConsumers = [
  'invoiceCalculationService.ts',
  'salesOrderCalculationService.ts',
  'purchaseOrderCalculationService.ts',
  'noteCalculationService.ts',
];

describe('exact calculation consumer boundaries', () => {
  it.each(calculationConsumers)('%s does not coerce authoritative preview decimals', file => {
    const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
    expect(source).not.toMatch(/\b(?:Number|parseFloat|parseInt)\s*\(/);
    expect(source).not.toMatch(/\.toFixed\s*\(/);
  });

  it('types every calculation response decimal as a JSON string', () => {
    const modules = [
      '../api/modules/sales/calculations.api.ts',
      '../api/modules/purchase/calculations.api.ts',
      '../api/modules/finance/noteCalculations.api.ts',
    ].map(relative => fs.readFileSync(path.join(__dirname, relative), 'utf8')).join('\n');
    expect(modules).not.toMatch(/totals:\s*Record<string,\s*number>/);
    expect(modules).not.toMatch(/(?:line_total|taxable_amount|total_amount)\??:\s*number/);
    expect(modules).toContain('CalculationDecimalString');
  });

  it('does not disguise exact calculation strings as runtime number fields', () => {
    const consumers = [
      '../../components/sales/invoice/hooks/useInvoiceLogic.ts',
      '../../components/sales/invoice/InvoiceFlow.tsx',
      '../../components/sales/order/hooks/useSalesOrderLogic.ts',
      '../../components/sales/challan/hooks/useChallanLogic.ts',
      '../../components/purchase/purchase-entry/hooks/usePurchaseEntryLogic.ts',
      '../../components/sales/invoice/ui/InvoicePreviewEnterprise.tsx',
      '../../components/global/ui/display/DocumentFooter.tsx',
      '../../components/global/ui/PrintUtility.tsx',
    ].map(relative => fs.readFileSync(path.join(__dirname, relative), 'utf8')).join('\n');
    expect(consumers).not.toMatch(/as unknown as (?:number|InvoiceTotals|OrderItem|ChallanItem)/);
    expect(consumers).not.toContain('preview may return JSON numbers');
  });

  it('keeps sales dispatch valuation at the canonical command/readback boundary', () => {
    const retiredCalculator = path.join(__dirname, 'challanCalculationService.ts');
    const dispatchHook = fs.readFileSync(
      path.join(__dirname, '../../components/sales/challan/hooks/useChallanLogic.ts'),
      'utf8',
    );
    const dispatchApi = fs.readFileSync(
      path.join(__dirname, '../api/modules/sales/challans.api.ts'),
      'utf8',
    );

    expect(fs.existsSync(retiredCalculator)).toBe(false);
    expect(dispatchHook).not.toContain('/calculations/challan');
    expect(dispatchApi).toContain("prepareCanonicalAction('sales.dispatch.prepare'");
    expect(dispatchApi).toMatch(/\/canonical\/sales-dispatches\/\$\{id\}\/acceptance-readback/);
    expect(dispatchApi).toContain('inventory_value');
  });

  it('keeps return valuation at the canonical command preview boundary', () => {
    expect(fs.existsSync(path.join(__dirname, 'returnCalculationService.ts'))).toBe(false);
    expect(fs.existsSync(path.join(__dirname, '../api/modules/sales/returnCalculations.api.ts'))).toBe(false);

    const flows = [
      '../../components/returns/SalesReturnFlow.tsx',
      '../../components/returns/PurchaseReturnFlow.tsx',
    ].map(relative => fs.readFileSync(path.join(__dirname, relative), 'utf8')).join('\n');
    expect(flows).not.toContain('/calculations/return');
    expect(flows).not.toContain('calculateReturnPreview');
    expect(flows).toContain('prepareCanonicalSalesReturn');
    expect(flows).toContain('prepareCanonicalPurchaseReturn');
  });
});
