import { indiaBusinessDate } from './returnBusinessDate';

it('uses the India business date across the UTC midnight boundary', () => {
  expect(indiaBusinessDate(new Date('2026-08-24T18:31:00.000Z'))).toBe('2026-08-25');
  expect(indiaBusinessDate(new Date('2026-08-24T18:29:00.000Z'))).toBe('2026-08-24');
});
