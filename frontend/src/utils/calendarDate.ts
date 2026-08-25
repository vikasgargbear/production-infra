export type CalendarDate = string;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const formatParts = (year: number, month: number, day: number): CalendarDate =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export function requireCalendarDate(value: unknown, label = 'Calendar date'): CalendarDate {
  if (typeof value !== 'string') throw new Error(`${label} must be a YYYY-MM-DD calendar date.`);
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new Error(`${label} must be a YYYY-MM-DD calendar date.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error(`${label} is not a valid calendar date.`);
  }
  return value;
}

const parts = (value: CalendarDate): [number, number, number] => {
  const valid = requireCalendarDate(value);
  return valid.split('-').map(Number) as [number, number, number];
};

export function addCalendarDays(value: CalendarDate, days: number): CalendarDate {
  if (!Number.isSafeInteger(days)) throw new Error('Calendar day offset must be an integer.');
  const [year, month, day] = parts(value);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return formatParts(result.getUTCFullYear(), result.getUTCMonth() + 1, result.getUTCDate());
}

export function calendarDateToPickerDate(value: CalendarDate): Date {
  const [year, month, day] = parts(value);
  return new Date(year, month - 1, day);
}

/** Serialize the calendar day selected by the user, never the UTC instant. */
export function serializeCalendarDateInput(value: Date | string, label = 'Selected date'): CalendarDate {
  if (typeof value === 'string') return requireCalendarDate(value, label);
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error(`${label} is invalid.`);
  return requireCalendarDate(
    formatParts(value.getFullYear(), value.getMonth() + 1, value.getDate()),
    label,
  );
}

export function formatCalendarDate(
  value: CalendarDate,
  locale = 'en-IN',
): string {
  const [year, month, day] = parts(value);
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function historyPresetRange(
  businessDate: CalendarDate,
  preset: string,
): { from: CalendarDate; to: CalendarDate } | null {
  const today = requireCalendarDate(businessDate, 'Organization business date');
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'yesterday') {
    const yesterday = addCalendarDays(today, -1);
    return { from: yesterday, to: yesterday };
  }
  if (preset === 'last7days') return { from: addCalendarDays(today, -6), to: today };
  if (preset === 'last30days') return { from: addCalendarDays(today, -29), to: today };
  if (preset === 'thisMonth') return organizationPeriodRange(today, 'current');
  if (preset === 'lastMonth') return organizationPeriodRange(today, 'previous');
  if (preset === 'thisQuarter') return organizationPeriodRange(today, 'quarter');
  return null;
}

export type OrganizationPeriod = 'current' | 'previous' | 'quarter' | 'year';

export function organizationPeriodRange(
  businessDate: CalendarDate,
  period: OrganizationPeriod,
): { from: CalendarDate; to: CalendarDate } {
  const [year, month] = parts(businessDate);
  if (period === 'current') return { from: formatParts(year, month, 1), to: businessDate };
  if (period === 'previous') {
    const previousMonthEnd = addCalendarDays(formatParts(year, month, 1), -1);
    const [previousYear, previousMonth] = parts(previousMonthEnd);
    return { from: formatParts(previousYear, previousMonth, 1), to: previousMonthEnd };
  }
  if (period === 'quarter') {
    const financialMonth = (month - 4 + 12) % 12;
    const financialYear = month >= 4 ? year : year - 1;
    const absoluteStartMonth = 4 + Math.floor(financialMonth / 3) * 3;
    const quarterYear = absoluteStartMonth > 12 ? financialYear + 1 : financialYear;
    const quarterMonth = absoluteStartMonth > 12 ? absoluteStartMonth - 12 : absoluteStartMonth;
    return { from: formatParts(quarterYear, quarterMonth, 1), to: businessDate };
  }
  const financialYear = month >= 4 ? year : year - 1;
  return { from: formatParts(financialYear, 4, 1), to: businessDate };
}
