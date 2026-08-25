const CANONICAL_UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * Canonical inventory evidence instants are entered from retained evidence.
 * They must already be normalized UTC values; this validator never supplies or
 * converts a browser-local clock value.
 */
export function isCanonicalUtcEventTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !CANONICAL_UTC_TIMESTAMP_PATTERN.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

export function requireCanonicalUtcEventTimestamp(value: unknown, label: string): string {
  if (!isCanonicalUtcEventTimestamp(value)) {
    throw new Error(`${label} must be an explicit canonical UTC timestamp (YYYY-MM-DDTHH:mm:ss.sssZ).`);
  }
  return value;
}
