import React, { useState, useEffect } from 'react';
import { Plus, Minus } from 'lucide-react';

/**
 * NumberInput Component
 * A number input with increment/decrement buttons
 * 
 * @param {Number} value - Current value
 * @param {Function} onChange - Change handler
 * @param {Number} min - Minimum value
 * @param {Number} max - Maximum value
 * @param {Number} step - Step increment
 * @param {String} placeholder - Placeholder text
 * @param {Boolean} disabled - Disabled state
 * @param {String} error - Error message
 * @param {String} label - Field label
 * @param {Boolean} required - Required field
 * @param {Boolean} showButtons - Show increment/decrement buttons
 * @param {String} className - Additional classes
 */
const NumberInput = ({
  value,
  onChange,
  min,
  max,
  step = 1,
  placeholder = "0",
  disabled = false,
  error,
  label,
  required = false,
  showButtons = true,
  className = "",
  size = "md",
  prefix,
  suffix,
  decimals = null,
  allowNegative = true
}) => {
  const [displayValue, setDisplayValue] = useState(value || '');

  useEffect(() => {
    setDisplayValue(value || '');
  }, [value]);

  // Handle input change
  const handleChange = (e) => {
    let newValue = e.target.value;
    
    // Allow empty value
    if (newValue === '') {
      setDisplayValue('');
      onChange(null);
      return;
    }

    // Remove non-numeric characters except minus and decimal
    newValue = newValue.replace(/[^0-9.-]/g, '');
    
    // Handle negative values
    if (!allowNegative) {
      newValue = newValue.replace('-', '');
    }
    
    // Parse the value
    const numValue = parseFloat(newValue);
    
    // Validate against min/max
    if (!isNaN(numValue)) {
      if (min !== undefined && numValue < min) return;
      if (max !== undefined && numValue > max) return;
    }
    
    setDisplayValue(newValue);
    
    // Call onChange with numeric value
    if (!isNaN(numValue)) {
      onChange(decimals !== null ? parseFloat(numValue.toFixed(decimals)) : numValue);
    }
  };

  // Handle increment
  const handleIncrement = () => {
    if (disabled) return;
    
    const currentValue = parseFloat(value) || 0;
    const newValue = currentValue + step;
    
    if (max !== undefined && newValue > max) return;
    
    onChange(decimals !== null ? parseFloat(newValue.toFixed(decimals)) : newValue);
  };

  // Handle decrement
  const handleDecrement = () => {
    if (disabled) return;
    
    const currentValue = parseFloat(value) || 0;
    const newValue = currentValue - step;
    
    if (min !== undefined && newValue < min) return;
    
    onChange(decimals !== null ? parseFloat(newValue.toFixed(decimals)) : newValue);
  };

  // Handle blur - format the display value
  const handleBlur = () => {
    if (displayValue === '') return;
    
    const numValue = parseFloat(displayValue);
    if (!isNaN(numValue)) {
      setDisplayValue(decimals !== null ? numValue.toFixed(decimals) : numValue.toString());
    }
  };

  // Size classes
  const sizeClasses = {
    sm: 'py-1.5 text-sm',
    md: 'py-2',
    lg: 'py-3 text-lg'
  };

  const buttonSizeClasses = {
    sm: 'px-2 py-1.5',
    md: 'px-3 py-2',
    lg: 'px-4 py-3'
  };

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative flex items-center">
        {prefix && (
          <span className={`absolute left-3 text-gray-500 ${sizeClasses[size]}`}>
            {prefix}
          </span>
        )}
        
        <input
          type="text"
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          className={`
            w-full border rounded-lg
            ${prefix ? 'pl-8' : 'pl-3'}
            ${suffix ? 'pr-8' : 'pr-3'}
            ${showButtons ? 'px-12' : ''}
            ${sizeClasses[size]}
            ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
            ${error ? 'border-red-500' : 'border-gray-300'}
            focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          `}
        />
        
        {suffix && !showButtons && (
          <span className={`absolute right-3 text-gray-500 ${sizeClasses[size]}`}>
            {suffix}
          </span>
        )}
        
        {showButtons && (
          <>
            <button
              type="button"
              onClick={handleDecrement}
              disabled={disabled || (min !== undefined && value <= min)}
              className={`
                absolute left-0 border border-r-0 rounded-l-lg
                ${buttonSizeClasses[size]}
                ${disabled || (min !== undefined && value <= min)
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-white hover:bg-gray-50 text-gray-600'
                }
              `}
            >
              <Minus className="w-4 h-4" />
            </button>
            
            <button
              type="button"
              onClick={handleIncrement}
              disabled={disabled || (max !== undefined && value >= max)}
              className={`
                absolute right-0 border border-l-0 rounded-r-lg
                ${buttonSizeClasses[size]}
                ${disabled || (max !== undefined && value >= max)
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-white hover:bg-gray-50 text-gray-600'
                }
              `}
            >
              <Plus className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
      
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
};

export default NumberInput;