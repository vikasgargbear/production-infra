import fs from 'fs';
import path from 'path';

import { calculateReturnPreview } from './returnCalculationService';
import { returnCalculationsApi } from '../api/modules/sales/returnCalculations.api';

jest.mock('../api/modules/sales/returnCalculations.api', () => ({
  returnCalculationsApi: { preview: jest.fn() },
}));

const exactResponse = ({
  quantity = '0.300000',
  taxable = '0.30',
  tax = '0.00',
  total = '0.30',
  roundOff = '0.00',
}: {
  quantity?: string;
  taxable?: string;
  tax?: string;
  total?: string;
  roundOff?: string;
} = {}) => ({
  data: {
    success: true as const,
    gst_type: 'CGST/SGST' as const,
    calculation_timestamp: 1,
    line_items: [{
      return_quantity: quantity,
      taxable_quantity: quantity,
      unit_price: '1.000000',
      discount_percent: '0.000000',
      discount_amount: '0.00',
      tax_percent: '0.000000',
      taxable_amount: taxable,
      cgst_amount: '0.00',
      sgst_amount: '0.00',
      igst_amount: '0.00',
      tax_amount: tax,
      total_amount: total,
    }],
    totals: {
      subtotal: taxable,
      tax_amount: tax,
      cgst_amount: '0.00',
      sgst_amount: '0.00',
      igst_amount: '0.00',
      round_off_amount: roundOff,
      total_amount: total,
      total_return_quantity: quantity,
    },
  },
});

const canonicalItem = (overrides: Record<string, unknown> = {}) => ({
  selected: true,
  product_id: 'd3000000-0000-7000-8000-000000000015',
  return_quantity: '0.300000',
  return_paid_qty: '0.100000',
  return_free_qty: '0.200000',
  unit_price: '1.000000',
  discount_percent: '0.000000',
  tax_percent: '0.000000',
  ...overrides,
});

describe('exact canonical return calculation boundary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('adds 0.10 and 0.20 exactly while preserving UUIDv7 identities', async () => {
    (returnCalculationsApi.preview as jest.Mock).mockResolvedValue(exactResponse());
    const supplierId = 'd3000000-0000-7000-8000-000000000021';

    const result = await calculateReturnPreview({
      supplier_id: supplierId,
      include_gst: true,
      items: [canonicalItem()],
    }, 'purchase');

    expect(returnCalculationsApi.preview).toHaveBeenCalledWith(expect.objectContaining({
      supplier_id: supplierId,
      items: [expect.objectContaining({
        product_id: 'd3000000-0000-7000-8000-000000000015',
        return_quantity: '0.300000',
        paid_quantity: '0.100000',
        free_quantity: '0.200000',
      })],
    }));
    expect(result.totals.final_amount).toBe('0.30');
  });

  it('preserves separate six-place billed and free quantities', async () => {
    (returnCalculationsApi.preview as jest.Mock).mockResolvedValue(exactResponse({
      quantity: '1.000000', taxable: '0.75', total: '0.75',
    }));

    await calculateReturnPreview({
      customer_id: 'd3000000-0000-7000-8000-000000000021',
      items: [canonicalItem({
        return_quantity: '1.000000',
        return_paid_qty: '0.123456',
        return_free_qty: '0.876544',
      })],
    }, 'sales');

    expect(returnCalculationsApi.preview).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({
        return_quantity: '1.000000',
        paid_quantity: '0.123456',
        free_quantity: '0.876544',
      })],
    }));
  });

  it('preserves money above the JavaScript safe-integer boundary as a string', async () => {
    const large = '9007199254740993.01';
    (returnCalculationsApi.preview as jest.Mock).mockResolvedValue(exactResponse({
      quantity: '1.000000', taxable: large, total: large,
    }));

    const result = await calculateReturnPreview({
      items: [canonicalItem({
        return_quantity: '1.000000',
        return_paid_qty: '1.000000',
        return_free_qty: '0.000000',
      })],
    }, 'purchase');

    expect(result.items[0].total_amount).toBe(large);
    expect(result.totals.total_amount).toBe(large);
  });

  it('rejects a numeric authoritative decimal response before it reaches UI state', async () => {
    const response: any = exactResponse();
    response.data.line_items[0].total_amount = 0.3;
    (returnCalculationsApi.preview as jest.Mock).mockResolvedValue(response);

    await expect(calculateReturnPreview({ items: [canonicalItem()] }, 'sales'))
      .rejects.toThrow('must remain an exact decimal string');
  });

  it('contains no IEEE-754 coercion sentinel in the active canonical return path', () => {
    const sources = [
      '../../components/returns/SalesReturnFlow.tsx',
      '../../components/returns/PurchaseReturnFlow.tsx',
      '../../components/returns/components/ReturnItemsTable.tsx',
      '../../components/returns/components/ReturnReviewPanel.tsx',
      '../../components/returns/ui/DebitNotePreview.tsx',
      '../../components/returns/utils/salesReturnProjection.ts',
      '../../components/returns/utils/purchaseReturnProjection.ts',
      '../../components/returns/utils/returnDecimal.ts',
      './returnCalculationService.ts',
      '../api/modules/sales/returnCalculations.api.ts',
    ].map(relative => fs.readFileSync(path.resolve(__dirname, relative), 'utf8')).join('\n');

    expect(sources).not.toMatch(/\bNumber\s*\(/);
    expect(sources).not.toMatch(/parseFloat\s*\(/);
    expect(sources).not.toMatch(/\.toFixed\s*\(/);
  });
});
