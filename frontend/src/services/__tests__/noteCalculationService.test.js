/* eslint-disable import/first */
jest.mock('../api/modules/finance/noteCalculations.api', () => ({
  noteCalculationsApi: { preview: jest.fn() }
}));

import { noteCalculationsApi } from '../api/modules/finance/noteCalculations.api';
import { calculateNotePreview } from '../calculations/noteCalculationService';
import { exactNoteResponse } from './exactCalculationFixtures';

const items = [{
  product_id: '10000000-0000-7000-8000-000000000002',
  quantity: '0.123456', unit_price: '9007199254740993.000000', discount_percent: '0', tax_percent: '18',
}];

beforeEach(() => jest.clearAllMocks());

test('uses only authenticated API calculation and preserves exact strings', async () => {
  noteCalculationsApi.preview.mockResolvedValue({ data: exactNoteResponse({
    line_items: [{ ...exactNoteResponse().line_items[0], quantity: '0.123456' }],
  }) });
  const result = await calculateNotePreview(items, {
    noteType: 'credit', partyId: '10000000-0000-7000-8000-000000000001', includeGst: true, isOnline: true,
  });
  expect(noteCalculationsApi.preview).toHaveBeenCalledWith(expect.objectContaining({
    items: [expect.objectContaining({ quantity: '0.123456', unit_price: '9007199254740993.000000' })],
  }));
  expect(result).toEqual(expect.objectContaining({ subtotal: '0.10', taxAmount: '0.02', grandTotal: '0.12' }));
});

test.each([1, '0.1234567'])('rejects invalid authoritative quantity %p', async quantity => {
  noteCalculationsApi.preview.mockResolvedValue({ data: exactNoteResponse({
    line_items: [{ ...exactNoteResponse().line_items[0], quantity }],
  }) });
  await expect(calculateNotePreview([{ ...items[0], quantity: '1.000000' }], {
    noteType: 'debit', includeGst: true, isOnline: true,
  })).rejects.toThrow(/exact decimal string|precision/);
});

test('fails closed offline instead of using the retired local calculator', async () => {
  await expect(calculateNotePreview(items, {
    noteType: 'debit', includeGst: true, isOnline: false,
  })).rejects.toThrow('live ERP API');
  expect(noteCalculationsApi.preview).not.toHaveBeenCalled();
});
