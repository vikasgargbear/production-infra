import React, { useState, useEffect, useRef } from 'react';

/**
 * Global Numeric Input Component
 * Handles all numeric inputs consistently across the application
 * Fixes common issues like default value deletion, arrow key behavior, etc.
 */
const NumericInput = ({
  value,
  onChange,
  onBlur,
  min = 0,
  max,
  step = 1,
  placeholder = '',
  className = '',
  align = 'left', // left, center, right
  width = 'w-16',
  disabled = false,
  required = false,
  allowNegative = false,
  decimalPlaces = 2,
  defaultValue = 0,
  clearable = true, // Allow clearing to empty
  format = 'number', // number, currency, percentage
  prefix = '', // e.g., '$', '₹'
  suffix = '', // e.g., '%', 'kg'
  ...props
}) => {
  const [localValue, setLocalValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);

  // Initialize local value
  useEffect(() => {
    if (value !== undefined && value !== null && value !== '') {
      setLocalValue(String(value));
    } else if (!isFocused && !clearable) {
      setLocalValue(String(defaultValue));
    } else {
      setLocalValue('');
    }
  }, [value, defaultValue, clearable, isFocused]);

  // Format display value
  const formatDisplayValue = (val) => {
    if (val === '' || val === undefined || val === null) {
      return '';
    }
    
    const numVal = parseFloat(val);
    if (isNaN(numVal)) return '';
    
    switch (format) {
      case 'currency':
        return numVal.toFixed(decimalPlaces);
      case 'percentage':
        return numVal.toFixed(decimalPlaces);
      default:
        // For regular numbers, only show decimal places if needed
        return numVal % 1 === 0 ? numVal.toString() : numVal.toFixed(decimalPlaces);
    }
  };

  // Handle input change
  const handleChange = (e) => {
    let inputValue = e.target.value;
    
    // Remove prefix/suffix if present
    inputValue = inputValue.replace(prefix, '').replace(suffix, '');
    
    // Allow empty value if clearable
    if (inputValue === '' && clearable) {
      setLocalValue('');
      onChange && onChange('');
      return;
    }
    
    // Allow negative sign at beginning if allowed
    if (!allowNegative) {
      inputValue = inputValue.replace('-', '');
    }
    
    // Validate numeric input
    const regex = allowNegative 
      ? /^-?\d*\.?\d*$/
      : /^\d*\.?\d*$/;
    
    if (regex.test(inputValue) || inputValue === '-') {
      setLocalValue(inputValue);
      
      // Parse and validate the numeric value
      const numValue = parseFloat(inputValue);
      if (!isNaN(numValue)) {
        // Apply min/max constraints
        let constrainedValue = numValue;
        if (min !== undefined && numValue < min) {
          constrainedValue = min;
        }
        if (max !== undefined && numValue > max) {
          constrainedValue = max;
        }
        onChange && onChange(constrainedValue);
      } else if (inputValue === '' || inputValue === '-') {
        onChange && onChange(inputValue);
      }
    }
  };

  // Handle blur event
  const handleBlur = (e) => {
    setIsFocused(false);
    
    // Format and validate on blur
    let finalValue = localValue;
    
    if (finalValue === '' || finalValue === '-') {
      if (!clearable) {
        finalValue = String(defaultValue);
        setLocalValue(finalValue);
        onChange && onChange(defaultValue);
      } else {
        onChange && onChange('');
      }
    } else {
      const numValue = parseFloat(finalValue);
      if (!isNaN(numValue)) {
        // Apply constraints
        let constrainedValue = numValue;
        if (min !== undefined && numValue < min) {
          constrainedValue = min;
        }
        if (max !== undefined && numValue > max) {
          constrainedValue = max;
        }
        
        setLocalValue(formatDisplayValue(constrainedValue));
        onChange && onChange(constrainedValue);
      }
    }
    
    onBlur && onBlur(e);
  };

  // Handle focus event
  const handleFocus = () => {
    setIsFocused(true);
    // Select all text on focus for easy replacement
    if (inputRef.current) {
      inputRef.current.select();
    }
  };

  // Handle keyboard events
  const handleKeyDown = (e) => {
    // Allow backspace to clear the field
    if (e.key === 'Backspace' && localValue === String(defaultValue) && clearable) {
      e.preventDefault();
      setLocalValue('');
      onChange && onChange('');
      return;
    }
    
    // Handle arrow keys for increment/decrement
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const currentValue = parseFloat(localValue) || defaultValue;
      const newValue = currentValue + (parseFloat(step) || 1);
      if (!max || newValue <= max) {
        setLocalValue(String(newValue));
        onChange && onChange(newValue);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const currentValue = parseFloat(localValue) || defaultValue;
      const newValue = currentValue - (parseFloat(step) || 1);
      if (!min || newValue >= min) {
        setLocalValue(String(newValue));
        onChange && onChange(newValue);
      }
    }
  };

  // Determine alignment class
  const alignClass = align === 'center' ? 'text-center' : 
                     align === 'right' ? 'text-right' : 
                     'text-left';

  return (
    <div className={`relative inline-flex items-center ${width}`}>
      {prefix && (
        <span className="absolute left-2 text-gray-500 pointer-events-none">
          {prefix}
        </span>
      )}
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={isFocused ? localValue : formatDisplayValue(localValue)}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        className={`
          w-full border-0 bg-transparent focus:ring-2 focus:ring-blue-500 rounded-md
          [appearance:textfield] 
          [&::-webkit-outer-spin-button]:appearance-none 
          [&::-webkit-inner-spin-button]:appearance-none
          ${alignClass}
          ${prefix ? 'pl-6' : 'pl-2'}
          ${suffix ? 'pr-6' : 'pr-2'}
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}
          ${className}
        `}
        {...props}
      />
      {suffix && (
        <span className="absolute right-2 text-gray-500 pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  );
};

export default NumericInput;