import { localBusinessDate } from './PaymentContext';

describe('localBusinessDate', () => {
  it('uses browser-local calendar fields instead of the UTC date', () => {
    const value = new Date('2026-08-24T18:45:00.000Z');
    jest.spyOn(value, 'getFullYear').mockReturnValue(2026);
    jest.spyOn(value, 'getMonth').mockReturnValue(7);
    jest.spyOn(value, 'getDate').mockReturnValue(25);
    expect(localBusinessDate(value)).toBe('2026-08-25');
  });
});
