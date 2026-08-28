import { isValidReportDateRange } from './reportDateRange';

describe('report date ranges', () => {
  it('accepts chronological and same-day ranges', () => {
    expect(isValidReportDateRange('2026-08-01', '2026-08-24')).toBe(true);
    expect(isValidReportDateRange('2026-08-24', '2026-08-24')).toBe(true);
  });

  it('rejects reversed or incomplete ranges', () => {
    expect(isValidReportDateRange('2026-09-01', '2026-08-24')).toBe(false);
    expect(isValidReportDateRange('', '2026-08-24')).toBe(false);
  });
});
