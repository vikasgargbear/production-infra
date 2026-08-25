const STATE_CODE_PATTERN = /^[0-9]{2}$/;

/**
 * Validate an exact GST state code without translating an unversioned state
 * name in the browser. Human-readable geography remains unavailable until a
 * reviewed reference-data release is exposed by the canonical API.
 */
export const canonicalStateCode = (
  value: unknown,
  label = 'GST state code',
): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const stateCode = String(value).trim();
  if (!STATE_CODE_PATTERN.test(stateCode)) {
    throw new Error(`${label} must contain exactly 2 digits.`);
  }
  return stateCode;
};

export const gstinStateCodeError = (
  stateCodeValue: unknown,
  gstinValue: unknown,
): string | null => {
  const stateCode = canonicalStateCode(stateCodeValue);
  const gstin = String(gstinValue || '').trim().toUpperCase();
  if (!stateCode || !gstin) return null;
  if (gstin.length >= 2 && gstin.slice(0, 2) !== stateCode) {
    return 'GSTIN state code must match the address GST state code.';
  }
  return null;
};
