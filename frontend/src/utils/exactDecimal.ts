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

/** Validate and normalize a canonical API decimal that must have crossed JSON as a string. */
export function normalizeAuthoritativeDecimal(
  value: unknown,
  label: string,
  options: ExactDecimalOptions,
): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must remain an exact decimal string.`);
  }
  return normalizeExactDecimal(value, label, options);
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

export function subtractExactDecimals(
  left: unknown,
  right: unknown,
  label: string,
  options: ExactDecimalOptions,
): string {
  return exactDecimalString(
    exactDecimalUnits(left, `${label} left`, options)
      - exactDecimalUnits(right, `${label} right`, options),
    options.scale,
  );
}

/** Format exact API money without ever passing through IEEE-754 arithmetic. */
export function formatExactCurrency(value: unknown, label = 'Money'): string {
  const normalized = normalizeExactDecimal(value, label, {
    scale: 2,
    maximumWholeDigits: 20,
    allowNegative: true,
  });
  const sign = normalized.startsWith('-') ? '-' : '';
  const [whole, fraction] = normalized.replace(/^-/, '').split('.');
  const lastThree = whole.slice(-3);
  const leading = whole.slice(0, -3);
  const groupedLeading = leading.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const grouped = leading ? `${groupedLeading},${lastThree}` : lastThree;
  return `${sign}₹${grouped}.${fraction}`;
}

/** Render a validated decimal without converting it to an IEEE-754 number. */
export function formatExactDecimal(
  value: unknown,
  label: string,
  options: ExactDecimalOptions,
  minimumFractionDigits = 0,
): string {
  if (!Number.isInteger(minimumFractionDigits)
    || minimumFractionDigits < 0
    || minimumFractionDigits > options.scale) {
    throw new Error(`${label} has unsupported display precision.`);
  }
  const normalized = normalizeExactDecimal(value, label, options);
  if (options.scale === 0) return normalized;
  const [whole, fraction = ''] = normalized.split('.');
  const retained = fraction.replace(/0+$/, '').padEnd(minimumFractionDigits, '0');
  return retained ? `${whole}.${retained}` : whole;
}
