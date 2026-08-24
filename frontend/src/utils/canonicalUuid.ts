// RFC 9562 keeps the 8-4-4-4-12 UUID text shape and adds UUIDv6-v8.
// Canonical ERP data uses UUIDv7 identities, so an older v1-v5-only regex is
// an invalid boundary check.
export const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isCanonicalUuid = (value: unknown): boolean => (
  CANONICAL_UUID_PATTERN.test(String(value ?? '').trim())
);
