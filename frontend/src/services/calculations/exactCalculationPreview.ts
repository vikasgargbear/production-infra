import {
  addExactDecimals,
  compareExactDecimals,
  type ExactDecimalOptions,
  normalizeAuthoritativeDecimal,
  normalizeExactDecimal,
} from '../../utils/exactDecimal';
import { isCanonicalUuid } from '../../utils/canonicalUuid';

export const calculationQuantityOptions = {
  scale: 6,
  maximumWholeDigits: 14,
} as const;
export const calculationRateOptions = {
  scale: 6,
  maximumWholeDigits: 20,
} as const;
export const calculationPercentOptions = {
  scale: 6,
  maximumWholeDigits: 3,
} as const;
export const calculationMoneyOptions = {
  scale: 2,
  maximumWholeDigits: 20,
} as const;
export const calculationSignedMoneyOptions = {
  ...calculationMoneyOptions,
  allowNegative: true,
} as const;

export const inputQuantity = (value: unknown, label: string): string =>
  normalizeExactDecimal(value ?? '0', label, calculationQuantityOptions);
export const inputRate = (value: unknown, label: string): string =>
  normalizeExactDecimal(value ?? '0', label, calculationRateOptions);
export const inputPercent = (value: unknown, label: string): string =>
  normalizeExactDecimal(value ?? '0', label, calculationPercentOptions);
export const inputMoney = (value: unknown, label: string): string =>
  normalizeExactDecimal(value ?? '0', label, calculationMoneyOptions);

export const outputQuantity = (value: unknown, label: string): string =>
  normalizeAuthoritativeDecimal(value, label, calculationQuantityOptions);
export const outputRate = (value: unknown, label: string): string =>
  normalizeAuthoritativeDecimal(value, label, calculationRateOptions);
export const outputPercent = (value: unknown, label: string): string =>
  normalizeAuthoritativeDecimal(value, label, calculationPercentOptions);
export const outputMoney = (value: unknown, label: string): string =>
  normalizeAuthoritativeDecimal(value, label, calculationMoneyOptions);
export const outputSignedMoney = (value: unknown, label: string): string =>
  normalizeAuthoritativeDecimal(value, label, calculationSignedMoneyOptions);

export function calculationEntityId(
  value: unknown,
  label: string,
  required = false,
): number | string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`${label} is missing its canonical identifier.`);
    return undefined;
  }
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && value > 0) return value;
    throw new Error(`${label} must remain an exact canonical identifier.`);
  }
  if (typeof value !== 'string') {
    throw new Error(`${label} must remain an exact canonical identifier.`);
  }
  const normalized = value.trim();
  if (isCanonicalUuid(normalized) || /^[1-9]\d*$/.test(normalized)) return normalized;
  throw new Error(`${label} is missing its canonical identifier.`);
}

export function assertCalculationEnvelope(
  data: { success: true; calculation_timestamp: number; gst_type: string },
  label: string,
) {
  if (data.success !== true
    || !Number.isSafeInteger(data.calculation_timestamp)
    || data.calculation_timestamp < 0
    || !['CGST/SGST', 'IGST'].includes(data.gst_type)) {
    throw new Error(`${label} is not the reviewed calculation contract.`);
  }
}

export function assertExactEqual(
  actual: unknown,
  expected: unknown,
  label: string,
  options: ExactDecimalOptions = calculationMoneyOptions,
) {
  if (compareExactDecimals(actual, expected, label, options) !== 0) {
    throw new Error(`${label} does not reconcile.`);
  }
}

export function sumMoney(values: readonly unknown[], label: string): string {
  return addExactDecimals(values, label, calculationMoneyOptions);
}

export function sumSignedMoney(values: readonly unknown[], label: string): string {
  return addExactDecimals(values, label, calculationSignedMoneyOptions);
}
