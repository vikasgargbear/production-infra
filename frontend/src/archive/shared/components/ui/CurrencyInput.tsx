import React, { forwardRef } from 'react';
import { NumberInput, NumberInputProps } from './NumberInput';

export interface CurrencyInputProps extends Omit<NumberInputProps, 'prefix' | 'precision' | 'thousandSeparator'> {
  currency?: string;
  locale?: string;
  allowNegative?: boolean;
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(({
  currency = '₹',
  locale = 'en-IN',
  allowNegative = false,
  min = allowNegative ? undefined : 0,
  ...props
}, ref) => {
  return (
    <NumberInput
      ref={ref}
      prefix={currency}
      precision={2}
      thousandSeparator={true}
      min={min}
      {...props}
    />
  );
});

CurrencyInput.displayName = 'CurrencyInput';