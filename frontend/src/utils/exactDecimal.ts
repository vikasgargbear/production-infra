export interface ExactDecimalOptions {
  scale: number;
  maximumWholeDigits?: number;
  allowNegative?: boolean;
}

const plainDecimal = (allowNegative: boolean): RegExp => (
  allowNegative
    ? /^-?(?:0|[1-9]\d*)(?:\.(\d+))?$/
    : /^(?:0|[1-9]\d*)(?:\.(\d+))?$/
);

/**
 * Convert an authoritative decimal string to fixed-scale integer units.
 *
 * Canonical API decimals must stay strings until this boundary. A JS number is
 * accepted only when it is a safe integer, which keeps legacy integer defaults
 * usable without pretending that an IEEE-754 fraction is exact.
 */
export function exactDecimalUnits(
  value: unknown,
  label: string,
  options: ExactDecimalOptions,
): bigint {
  const { scale, maximumWholeDigits = 18, allowNegative = false } = options;
  if (!Number.isInteger(scale) || scale < 0 || scale > 18) {
    throw new Error(`${label} has an unsupported decimal scale.`);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${label} must remain an exact decimal string.`);
    }
  } else if (typeof value !== 'string') {
    throw new Error(`${label} must remain an exact decimal string.`);
  }
  const text = String(value).trim();
  const match = plainDecimal(allowNegative).exec(text);
  if (!match) throw new Error(`${label} must be a plain decimal string.`);
  const unsigned = text.replace(/^-/, '');
  const [whole, fraction = ''] = unsigned.split('.');
  if (whole.length > maximumWholeDigits || fraction.length > scale) {
    throw new Error(`${label} exceeds canonical decimal precision.`);
  }
  const sign = text.startsWith('-') ? -1n : 1n;
  const factor = 10n ** BigInt(scale);
  return sign * (BigInt(whole) * factor + BigInt(fraction.padEnd(scale, '0') || '0'));
}

export function exactDecimalString(units: bigint, scale: number): string {
  if (!Number.isInteger(scale) || scale < 0 || scale > 18) {
    throw new Error('Decimal scale is unsupported.');
  }
  const sign = units < 0n ? '-' : '';
  const absolute = units < 0n ? -units : units;
  if (scale === 0) return `${sign}${absolute}`;
  const factor = 10n ** BigInt(scale);
  const whole = absolute / factor;
  const fraction = String(absolute % factor).padStart(scale, '0');
  return `${sign}${whole}.${fraction}`;
}

export function normalizeExactDecimal(
  value: unknown,
  label: string,
  options: ExactDecimalOptions,
): string {
  return exactDecimalString(exactDecimalUnits(value, label, options), options.scale);
}

export function compareExactDecimals(
  left: unknown,
  right: unknown,
  label: string,
  options: ExactDecimalOptions,
): -1 | 0 | 1 {
  const leftUnits = exactDecimalUnits(left, `${label} left`, options);
  const rightUnits = exactDecimalUnits(right, `${label} right`, options);
  return leftUnits < rightUnits ? -1 : leftUnits > rightUnits ? 1 : 0;
}

export function addExactDecimals(
  values: readonly unknown[],
  label: string,
  options: ExactDecimalOptions,
): string {
  const total = values.reduce<bigint>(
    (sum, value, index) => sum + exactDecimalUnits(value, `${label}[${index}]`, options),
    0n,
  );
  return exactDecimalString(total, options.scale);
}
