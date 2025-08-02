import React, { useState, useEffect } from 'react';
import { IndianRupee, DollarSign, Euro, PoundSterling, LucideIcon } from 'lucide-react';

type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP';
type InputSize = 'sm' | 'md' | 'lg';

interface CurrencyConfig {
  symbol: string;
  icon: LucideIcon;
  locale: string;
}

interface CurrencyInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
  currency?: CurrencyCode;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  label?: string;
  required?: boolean;
  showSymbol?: boolean;
  className?: string;
  size?: InputSize;
  min?: number;
  max?: number;
  allowNegative?: boolean;
}

/**
 * CurrencyInput Component
 * A formatted currency input with proper number formatting
 */
const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value,
  onChange,
  currency = 'INR',
  placeholder = "0.00",
  disabled = false,
  error,
  label,
  required = false,
  showSymbol = true,
  className = "",
  size = "md",
  min = 0,
  max,
  allowNegative = false
}) => {
  const [displayValue, setDisplayValue] = useState<string>('');
  const [isFocused, setIsFocused] = useState<boolean>(false);

  const currencyConfig: Record<CurrencyCode, CurrencyConfig> = {
    INR: { symbol: '₹', icon: IndianRupee, locale: 'en-IN' },
    USD: { symbol: '$', icon: DollarSign, locale: 'en-US' },
    EUR: { symbol: '€', icon: Euro, locale: 'en-EU' },
    GBP: { symbol: '£', icon: PoundSterling, locale: 'en-GB' }
  };

  const config = currencyConfig[currency] || currencyConfig.INR;
  const CurrencyIcon = config.icon;

  // Format number for display
  const formatCurrency = (num: number | null | undefined): string => {
    if (num === null || num === undefined || num === '') return '';
    
    const formatter = new Intl.NumberFormat(config.locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    
    return formatter.format(num);
  };

  // Update display value when value prop changes
  useEffect(() => {
    if (!isFocused) {
      setDisplayValue(formatCurrency(value));
    }
  }, [value, isFocused, config.locale]);

  // Parse formatted value to number
  const parseValue = (str: string): number | null => {
    if (!str) return null;
    
    // Remove all non-numeric characters except decimal and minus
    const cleaned = str.replace(/[^0-9.-]/g, '');
    
    // Handle negative values
    if (!allowNegative) {
      const positive = cleaned.replace('-', '');
      return parseFloat(positive);
    }
    
    return parseFloat(cleaned);
  };

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    
    // Allow only numbers, decimal, and optionally minus
    const regex = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
    const cleaned = inputValue.replace(/[^0-9.-]/g, '');
    
    if (regex.test(cleaned)) {
      setDisplayValue(cleaned);
      
      const numValue = parseValue(cleaned);
      if (numValue !== null) {
        // Validate against min/max
        if (min !== undefined && numValue < min) return;
        if (max !== undefined && numValue > max) return;
        
        onChange(numValue);
      } else {
        onChange(null);
      }
    }
  };

  // Handle focus
  const handleFocus = () => {
    setIsFocused(true);
    // Show raw number on focus
    if (value !== null && value !== undefined) {
      setDisplayValue(value.toString());
    }
  };

  // Handle blur
  const handleBlur = () => {
    setIsFocused(false);
    // Format value on blur
    setDisplayValue(formatCurrency(value));
  };

  // Handle paste
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const numValue = parseValue(pastedText);
    
    if (numValue !== null && !isNaN(numValue)) {
      // Validate against min/max
      if (min !== undefined && numValue < min) return;
      if (max !== undefined && numValue > max) return;
      
      onChange(numValue);
      setDisplayValue(isFocused ? numValue.toString() : formatCurrency(numValue));
    }
  };

  // Size classes
  const sizeClasses: Record<InputSize, string> = {
    sm: 'py-1.5 px-3 text-sm',
    md: 'py-2 px-3',
    lg: 'py-3 px-4 text-lg'
  };

  const iconSizeClasses: Record<InputSize, string> = {
    sm: 'w-4 h-4',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        {showSymbol && (
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
            <CurrencyIcon className={iconSizeClasses[size]} />
          </div>
        )}
        
        <input
          type="text"
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={disabled}
          className={`
            w-full border rounded-lg
            ${showSymbol ? 'pl-10' : ''}
            ${sizeClasses[size]}
            ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
            ${error ? 'border-red-500' : 'border-gray-300'}
            focus:ring-2 focus:ring-blue-500 focus:border-blue-500
            text-right
          `}
        />
        
        {!isFocused && value !== null && value !== undefined && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-500">
            {currency}
          </div>
        )}
      </div>
      
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
      
      {/* Helper text for min/max */}
      {(min !== undefined || max !== undefined) && !error && (
        <p className="mt-1 text-xs text-gray-500">
          {min !== undefined && max !== undefined && `${config.symbol}${formatCurrency(min)} - ${config.symbol}${formatCurrency(max)}`}
          {min !== undefined && max === undefined && `Min: ${config.symbol}${formatCurrency(min)}`}
          {min === undefined && max !== undefined && `Max: ${config.symbol}${formatCurrency(max)}`}
        </p>
      )}
    </div>
  );
};

export default CurrencyInput;
