import {
  isCanonicalUtcEventTimestamp,
  requireCanonicalUtcEventTimestamp,
} from './canonicalEventTimestamp';

describe('canonical inventory evidence timestamps', () => {
  it('accepts only an explicit normalized RFC 3339 UTC instant', () => {
    const timestamp = '2026-08-25T12:34:56.789Z';
    expect(isCanonicalUtcEventTimestamp(timestamp)).toBe(true);
    expect(requireCanonicalUtcEventTimestamp(timestamp, 'Physical event time')).toBe(timestamp);
  });

  it.each([
    '',
    '2026-08-25T12:34:56Z',
    '2026-08-25T12:34:56.789+05:30',
    '2026-08-25 12:34:56.789Z',
    '2026-02-30T12:34:56.789Z',
    ' 2026-08-25T12:34:56.789Z',
  ])('rejects missing, noncanonical, offset, or impossible input: %s', value => {
    expect(isCanonicalUtcEventTimestamp(value)).toBe(false);
    expect(() => requireCanonicalUtcEventTimestamp(value, 'Physical event time'))
      .toThrow('explicit canonical UTC timestamp');
  });
});
