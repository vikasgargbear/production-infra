import React, { forwardRef, useState, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Input, InputProps } from './Input';

export interface NumberInputProps extends Omit<InputProps, 'type' | 'onChange'> {
  value?: number;
  onChange?: (value: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  showStepper?: boolean;
  thousandSeparator?: boolean;
  prefix?: string;
  suffix?: string;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(({
  value,
  onChange,
  min,
  max,
  step = 1,
  precision = 0,
  showStepper = true,
  thousandSeparator = false,
  prefix,
  suffix,
  disabled,
  ...props
}, ref) => {
  const [displayValue, setDisplayValue] = useState('');
  
  // Format number for display
  const formatNumber = (num: number | undefined): string => {
    if (num === undefined || isNaN(num)) return '';
    
    let formatted = num.toFixed(precision);
    
    if (thousandSeparator && !isNaN(Number(formatted))) {
      const parts = formatted.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      formatted = parts.join('.');
    }
    
    return formatted;
  };
  
  // Parse display value to number
  const parseValue = (val: string): number | undefined => {
    if (!val) return undefined;
    
    // Remove thousand separators
    const cleaned = val.replace(/,/g, '');
    const parsed = parseFloat(cleaned);
    
    if (isNaN(parsed)) return undefined;
    
    // Apply precision
    return Math.round(parsed * Math.pow(10, precision)) / Math.pow(10, precision);
  };
  
  // Update display when value changes
  useEffect(() => {
    setDisplayValue(formatNumber(value));
  }, [value]);
  
  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    
    // Allow typing negative, decimal point, etc.
    if (inputValue === '-' || inputValue === '.' || inputValue === '-.') {
      setDisplayValue(inputValue);
      return;
    }
    
    // Remove non-numeric characters except . and -
    const cleaned = inputValue.replace(/[^0-9.-]/g, '');
    setDisplayValue(cleaned);
    
    const parsed = parseValue(cleaned);
    if (parsed !== undefined) {
      // Apply min/max constraints
      let constrained = parsed;
      if (min !== undefined && parsed < min) constrained = min;
      if (max !== undefined && parsed > max) constrained = max;
      
      onChange?.(constrained);
    } else {
      onChange?.(undefined);
    }
  };
  
  // Handle increment/decrement
  const handleStep = (direction: 'up' | 'down') => {
    const currentValue = value ?? 0;
    const newValue = direction === 'up' 
      ? currentValue + step 
      : currentValue - step;
    
    // Apply constraints
    let constrained = newValue;
    if (min !== undefined && newValue < min) constrained = min;
    if (max !== undefined && newValue > max) constrained = max;
    
    onChange?.(constrained);
  };
  
  // Handle blur to format display
  const handleBlur = () => {
    setDisplayValue(formatNumber(value));
  };
  
  const inputElement = (
    <Input
      ref={ref}
      value={displayValue}
      onChange={handleInputChange}
      onBlur={handleBlur}
      disabled={disabled}
      leftAddon={prefix}
      rightAddon={suffix}
      {...props}
    />
  );
  
  if (!showStepper) {
    return inputElement;
  }
  
  // With stepper controls
  return (
    <div className="relative">
      {inputElement}
      <div className="absolute inset-y-0 right-0 flex flex-col border-l border-gray-300">
        <button
          type="button"
          onClick={() => handleStep('up')}
          disabled={disabled || (max !== undefined && (value ?? 0) >= max)}
          className="flex-1 px-2 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:bg-gray-100"
          tabIndex={-1}
        >
          <ChevronUp className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => handleStep('down')}
          disabled={disabled || (min !== undefined && (value ?? 0) <= min)}
          className="flex-1 px-2 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed border-t border-gray-300 focus:outline-none focus:bg-gray-100"
          tabIndex={-1}
        >
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
});

NumberInput.displayName = 'NumberInput';