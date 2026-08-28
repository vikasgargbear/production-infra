import {
  addCalendarDays,
  organizationPeriodRange,
  requireCalendarDate,
  serializeCalendarDateInput,
} from './calendarDate';

describe('organization-owned calendar dates', () => {
  it('adds calendar days without deriving authority from the browser clock', () => {
    expect(addCalendarDays('2026-08-25', 7)).toBe('2026-09-01');
    expect(addCalendarDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('derives GST periods from the organization business date', () => {
    expect(organizationPeriodRange('2026-08-25', 'current')).toEqual({ from: '2026-08-01', to: '2026-08-25' });
    expect(organizationPeriodRange('2026-08-25', 'previous')).toEqual({ from: '2026-07-01', to: '2026-07-31' });
    expect(organizationPeriodRange('2026-08-25', 'quarter')).toEqual({ from: '2026-07-01', to: '2026-08-25' });
    expect(organizationPeriodRange('2026-02-10', 'year')).toEqual({ from: '2025-04-01', to: '2026-02-10' });
  });

  it('serializes the user-selected local calendar day rather than its UTC ISO day', () => {
    const selected = new Date(2026, 7, 25, 0, 0, 0);
    expect(serializeCalendarDateInput(selected)).toBe('2026-08-25');
  });

  it.each(['2026-02-30', '25/08/2026', '', '2026-13-01'])('rejects invalid calendar date %s', value => {
    expect(() => requireCalendarDate(value)).toThrow();
  });
});
