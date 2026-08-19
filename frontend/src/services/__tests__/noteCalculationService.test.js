/* eslint-disable import/first */
jest.mock('../api/modules/finance/noteCalculations.api', () => ({
  noteCalculationsApi: { preview: jest.fn() }
}));
jest.mock('../enterpriseCalculator', () => ({
  __esModule: true,
  default: { calculateNoteTotals: jest.fn() }
}));

import EnterpriseCalculator from '../enterpriseCalculator';
import { noteCalculationsApi } from '../api/modules/finance/noteCalculations.api';
import { calculateNotePreview } from '../calculations/noteCalculationService';


const items = [{ quantity: 2, unit_price: 100, discount_percent: 10, tax_percent: 18 }];

test('uses authenticated backend note preview online', async () => {
  noteCalculationsApi.preview.mockResolvedValue({
    data: {
      success: true,
      gst_type: 'CGST/SGST',
      calculation_timestamp: 1,
      line_items: [{ taxable_amount: 180, tax_amount: 32.4, total_amount: 212.4 }],
      totals: { taxable_amount: 180, tax_amount: 32.4, total_amount: 212.4 }
    }
  });

  const result = await calculateNotePreview(items, {
    noteType: 'credit',
    partyId: 5,
    includeGst: true,
    isOnline: true
  });

  expect(noteCalculationsApi.preview).toHaveBeenCalledWith(expect.objectContaining({
    note_type: 'credit',
    party_id: 5,
    items: [expect.objectContaining({ gst_percent: 18 })]
  }));
  expect(EnterpriseCalculator.calculateNoteTotals).not.toHaveBeenCalled();
  expect(result).toEqual(expect.objectContaining({ subtotal: 180, taxAmount: 32.4, grandTotal: 212.4 }));
});

test('uses local note calculator only when explicitly offline', async () => {
  EnterpriseCalculator.calculateNoteTotals.mockReturnValue({
    items: [],
    totals: { subtotal_amount: 100, tax_amount: 18, total_amount: 118 }
  });

  const result = await calculateNotePreview(items, {
    noteType: 'debit',
    includeGst: true,
    isOnline: false
  });

  expect(result.grandTotal).toBe(118);
  expect(noteCalculationsApi.preview).not.toHaveBeenCalled();
});
