const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?$/;

interface LocalTimestamp {
  text: string;
  date: string;
  sortable: string;
}

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
  authoritativeBusinessAsOf: unknown,
  label: string,
  sourceDate?: unknown,
): string {
  const asOf = requireLocalTimestamp(
    authoritativeBusinessAsOf,
    'Authoritative organization time',
  );
  const posting = requireLocalTimestamp(value, label);
  if (posting.sortable > asOf.sortable) {
    throw new Error(`${label} cannot be later than the authoritative organization time.`);
  }
  if (sourceDate !== undefined && sourceDate !== null && sourceDate !== '') {
    const source = requireCalendarDate(sourceDate, `${label} source date`);
    if (posting.date < source) throw new Error(`${label} cannot precede its source document date.`);
  }
  return posting.text;
}

function requireLocalTimestamp(value: unknown, label: string): LocalTimestamp {
  const text = String(value ?? '').trim();
  const match = LOCAL_TIMESTAMP.exec(text);
  if (!match
    || Number(match[2]) > 23
    || Number(match[3]) > 59
    || Number(match[4] || '0') > 59) {
    throw new Error(`${label} must include an exact local date and time.`);
  }
  const date = requireCalendarDate(match[1], label);
  const sortable = `${date}T${match[2]}:${match[3]}:${match[4] || '00'}.${(match[5] || '').padEnd(6, '0')}`;
  return { text, date, sortable };
}

export function canonicalBusinessDateInputMax(value: unknown): string | undefined {
  try {
    return requireCalendarDate(value, 'Authoritative organization business date');
  } catch {
    return undefined;
  }
}

export function canonicalBusinessTimestampInputMax(value: unknown): string | undefined {
  try {
    return requireLocalTimestamp(value, 'Authoritative organization time').text;
  } catch {
    return undefined;
  }
}

export function canonicalSourceTimestampInputMin(value: unknown): string | undefined {
  const date = canonicalBusinessDateInputMax(value);
  return date ? `${date}T00:00` : undefined;
}
