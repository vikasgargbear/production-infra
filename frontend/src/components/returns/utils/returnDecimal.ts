import {
  compareExactDecimals,
  exactDecimalString,
  exactDecimalUnits,
  formatExactCurrency,
  normalizeAuthoritativeDecimal,
  normalizeExactDecimal,
} from '../../../utils/exactDecimal';

export const RETURN_QUANTITY_OPTIONS = { scale: 6, maximumWholeDigits: 14 } as const;
export const RETURN_RATE_OPTIONS = { scale: 6, maximumWholeDigits: 14 } as const;
export const RETURN_MONEY_OPTIONS = { scale: 2, maximumWholeDigits: 20 } as const;

export const authoritativeReturnQuantity = (value: unknown, label: string): string =>
  normalizeAuthoritativeDecimal(value, label, RETURN_QUANTITY_OPTIONS);

export const authoritativeReturnRate = (value: unknown, label: string): string =>
  normalizeAuthoritativeDecimal(value, label, RETURN_RATE_OPTIONS);

export const authoritativeReturnMoney = (value: unknown, label: string): string =>
  normalizeAuthoritativeDecimal(value, label, RETURN_MONEY_OPTIONS);

export const editableReturnQuantity = (value: unknown, label: string): string =>
  normalizeExactDecimal(value, label, RETURN_QUANTITY_OPTIONS);

export const editableReturnRate = (value: unknown, label: string): string =>
  normalizeExactDecimal(value, label, RETURN_RATE_OPTIONS);

export const positiveReturnQuantity = (value: unknown, label = 'Return quantity'): boolean => {
  try {
    return exactDecimalUnits(value, label, RETURN_QUANTITY_OPTIONS) > 0n;
  } catch {
    return false;
  }
};

export const positiveReturnRate = (value: unknown, label = 'Return rate'): boolean => {
  try {
    return exactDecimalUnits(value, label, RETURN_RATE_OPTIONS) > 0n;
  } catch {
    return false;
  }
};

export const positiveReturnMoney = (value: unknown, label = 'Return amount'): boolean => {
  try {
    return exactDecimalUnits(value, label, RETURN_MONEY_OPTIONS) > 0n;
  } catch {
    return false;
  }
};

export const sameReturnMoney = (left: unknown, right: unknown, label: string): boolean => {
  try {
    return compareExactDecimals(left, right, label, RETURN_MONEY_OPTIONS) === 0;
  } catch {
    return false;
  }
};

export const formatReturnMoney = (value: unknown, label: string): string =>
  formatExactCurrency(value, label);

const roundedDisplayDecimal = (
  value: unknown,
  label: string,
  options: { scale: number; maximumWholeDigits: number },
  minimumFractionDigits: number,
): string => {
  const units = exactDecimalUnits(value, label, options);
  const displayScale = 2;
  const divisor = 10n ** BigInt(options.scale - displayScale);
  const roundedUnits = (units + (divisor / 2n)) / divisor;
  const fixed = exactDecimalString(roundedUnits, displayScale);
  if (minimumFractionDigits === displayScale) return fixed;
  const [whole, fraction = ''] = fixed.split('.');
  const retained = fraction.replace(/0+$/, '').padEnd(minimumFractionDigits, '0');
  return retained ? `${whole}.${retained}` : whole;
};

/** Operator display only; command values retain their exact six-place strings. */
export const formatReturnDisplayQuantity = (value: unknown, label: string): string =>
  roundedDisplayDecimal(value, label, RETURN_QUANTITY_OPTIONS, 0);

export const formatReturnDisplayRate = (value: unknown, label: string): string =>
  `₹${roundedDisplayDecimal(value, label, RETURN_RATE_OPTIONS, 2)}`;

export const formatReturnDisplayPercent = (value: unknown, label: string): string =>
  `${roundedDisplayDecimal(value, label, RETURN_RATE_OPTIONS, 0)}%`;

export function hasExactReturnPreview(
  items: readonly Record<string, unknown>[],
  totals: { subtotal_amount: unknown; tax_amount: unknown; total_amount: unknown },
): boolean {
  try {
    authoritativeReturnMoney(totals.subtotal_amount, 'Return preview subtotal');
    authoritativeReturnMoney(totals.tax_amount, 'Return preview tax');
    authoritativeReturnMoney(totals.total_amount, 'Return preview total');
    items.filter(item => item.selected !== false).forEach((item, index) => {
      authoritativeReturnMoney(item.taxable_amount, `Return preview lines[${index}].taxable_amount`);
      authoritativeReturnMoney(item.tax_amount, `Return preview lines[${index}].tax_amount`);
      authoritativeReturnMoney(item.total_amount, `Return preview lines[${index}].total_amount`);
    });
    return true;
  } catch {
    return false;
  }
}
