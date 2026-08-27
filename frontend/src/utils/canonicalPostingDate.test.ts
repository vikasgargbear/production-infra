import {
  canonicalBusinessDateInputMax,
  canonicalBusinessTimestampInputMax,
  requireCanonicalPostingDate,
  requireCanonicalPostingTimestamp,
} from './canonicalPostingDate';

describe('canonical posting date authority', () => {
  it('accepts the organization business date and a prior date', () => {
    expect(requireCanonicalPostingDate('2026-08-28', '2026-08-28', 'Invoice date')).toBe('2026-08-28');
    expect(requireCanonicalPostingDate('2026-08-27', '2026-08-28', 'Invoice date')).toBe('2026-08-27');
  });

  it('rejects future, impossible, missing-authority, and pre-source dates', () => {
    expect(() => requireCanonicalPostingDate('2026-08-29', '2026-08-28', 'Invoice date'))
      .toThrow('Invoice date cannot be later than the authoritative organization date.');
    expect(() => requireCanonicalPostingDate('2026-02-30', '2026-08-28', 'Invoice date'))
      .toThrow('Invoice date must be a valid calendar date.');
    expect(() => requireCanonicalPostingDate('2026-08-28', '', 'Invoice date'))
      .toThrow('Authoritative organization business date must be a valid calendar date.');
    expect(() => requireCanonicalPostingDate('2026-08-26', '2026-08-28', 'Payment date', '2026-08-27'))
      .toThrow('Payment date cannot precede its source document date.');
  });

  it('validates organization-local posting timestamps without using the browser clock', () => {
    expect(requireCanonicalPostingTimestamp('2026-08-28T23:59', '2026-08-28', 'Receipt time'))
      .toBe('2026-08-28T23:59');
    expect(() => requireCanonicalPostingTimestamp('2026-08-29T00:00', '2026-08-28', 'Receipt time'))
      .toThrow('Receipt time cannot be later than the authoritative organization date.');
    expect(() => requireCanonicalPostingTimestamp('2026-08-28T25:90', '2026-08-28', 'Receipt time'))
      .toThrow('Receipt time must include an exact local date and time.');
  });

  it('publishes HTML maxima only for valid server dates', () => {
    expect(canonicalBusinessDateInputMax('2026-08-28')).toBe('2026-08-28');
    expect(canonicalBusinessTimestampInputMax('2026-08-28')).toBe('2026-08-28T23:59:59');
    expect(canonicalBusinessDateInputMax('28-08-2026')).toBeUndefined();
  });
});
