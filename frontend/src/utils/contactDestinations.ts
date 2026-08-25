export const indianContactDigits = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return digits;
  if (/^0[6-9]\d{9}$/.test(digits)) return `91${digits.slice(1)}`;
  return null;
};

export const canonicalContactEmail = (value: string | null | undefined): string | null => {
  const email = value?.trim();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
};
