import fs from 'fs';
import path from 'path';

const calculationConsumers = [
  'invoiceCalculationService.ts',
  'salesOrderCalculationService.ts',
  'challanCalculationService.ts',
  'purchaseOrderCalculationService.ts',
  'returnCalculationService.ts',
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
      '../api/modules/sales/returnCalculations.api.ts',
      '../api/modules/purchase/calculations.api.ts',
      '../api/modules/finance/noteCalculations.api.ts',
    ].map(relative => fs.readFileSync(path.join(__dirname, relative), 'utf8')).join('\n');
    expect(modules).not.toMatch(/totals:\s*Record<string,\s*number>/);
    expect(modules).not.toMatch(/(?:line_total|taxable_amount|total_amount)\??:\s*number/);
    expect(modules).toContain('CalculationDecimalString');
  });
});
