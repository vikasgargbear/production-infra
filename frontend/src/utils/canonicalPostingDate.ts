const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/;

function requireCalendarDate(value: unknown, label: string): string {
  const text = String(value ?? '').trim();
  if (!CALENDAR_DATE.test(text)) throw new Error(`${label} must be a valid calendar date.`);
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new Error(`${label} must be a valid calendar date.`);
  }
  return text;
}

export function requireCanonicalPostingDate(
  value: unknown,
  authoritativeBusinessDate: unknown,
  label: string,
  sourceDate?: unknown,
): string {
  const businessDate = requireCalendarDate(
    authoritativeBusinessDate,
    'Authoritative organization business date',
  );
  const postingDate = requireCalendarDate(value, label);
  if (postingDate > businessDate) {
    throw new Error(`${label} cannot be later than the authoritative organization date.`);
  }
  if (sourceDate !== undefined && sourceDate !== null && sourceDate !== '') {
    const source = requireCalendarDate(sourceDate, `${label} source date`);
    if (postingDate < source) throw new Error(`${label} cannot precede its source document date.`);
  }
  return postingDate;
}

export function requireCanonicalPostingTimestamp(
  value: unknown,
  authoritativeBusinessDate: unknown,
  label: string,
): string {
  const text = String(value ?? '').trim();
  const match = LOCAL_TIMESTAMP.exec(text);
  if (!match
    || Number(match[2]) > 23
    || Number(match[3]) > 59
    || Number(match[4] || '0') > 59) {
    throw new Error(`${label} must include an exact local date and time.`);
  }
  requireCanonicalPostingDate(match[1], authoritativeBusinessDate, label);
  return text;
}

export function canonicalBusinessDateInputMax(value: unknown): string | undefined {
  try {
    return requireCalendarDate(value, 'Authoritative organization business date');
  } catch {
    return undefined;
  }
}

export function canonicalBusinessTimestampInputMax(value: unknown): string | undefined {
  const date = canonicalBusinessDateInputMax(value);
  return date ? `${date}T23:59:59` : undefined;
}
