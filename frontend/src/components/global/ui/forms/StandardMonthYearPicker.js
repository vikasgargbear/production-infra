import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

/**
 * StandardMonthYearPicker - Consistent month/year input component
 * Replaces all type="month" inputs and legacy MonthYearPicker across the application
 * 
 * @param {string} value - Date value in YYYY-MM format or YYYY-MM-DD format
 * @param {Function} onChange - Change handler receiving YYYY-MM-01 string (first day of month)
 * @param {string} label - Field label
 * @param {string} placeholder - Placeholder text (default: "MM/YYYY")
 * @param {boolean} required - Required field indicator
 * @param {boolean} disabled - Disabled state
 * @param {string} error - Error message
 * @param {string} className - Additional CSS classes
 * @param {number} tabIndex - Tab index for keyboard navigation
 * @param {Date|string} min - Minimum date
 * @param {Date|string} max - Maximum date
 * @param {string} size - Component size: sm, md, lg
 * @param {string} format - Display format: "MM/YYYY" or "MM/YY"
 */
const StandardMonthYearPicker = ({
  value = '',
  onChange,
  label,
  placeholder,
  required = false,
  disabled = false,
  error = null,
  className = '',
  tabIndex,
  min,
  max,
  size = 'md',
  format = 'MM/YYYY', // or 'MM/YY'
  autoFocus = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [displayValue, setDisplayValue] = useState('');
  const dropdownRef = useRef(null);

  // Default placeholder based on format
  const defaultPlaceholder = format === 'MM/YY' ? 'MM/YY' : 'MM/YYYY';
  const finalPlaceholder = placeholder || defaultPlaceholder;

  // Size configurations
  const sizeClasses = {
    sm: 'py-1.5 pl-8 pr-8 text-sm',
    md: 'py-2 pl-10 pr-10',
    lg: 'py-3 pl-12 pr-12 text-lg'
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  // Format value for display
  const formatForDisplay = (dateValue) => {
    if (!dateValue) return '';
    
    try {
      // Handle YYYY-MM or YYYY-MM-DD format
      const dateParts = dateValue.split('-');
      if (dateParts.length >= 2) {
        const year = dateParts[0];
        const month = dateParts[1];
        
        if (format === 'MM/YY') {
          return `${month}/${year.slice(-2)}`;
        } else {
          return `${month}/${year}`;
        }
      }
    } catch (e) {
      console.warn('Invalid date format:', dateValue);
    }
    
    return '';
  };

  // Convert display format back to YYYY-MM-01
  const parseDisplayValue = (displayVal) => {
    if (!displayVal) return '';
    
    try {
      const parts = displayVal.split('/');
      if (parts.length === 2) {
        let month = parts[0].padStart(2, '0');
        let year = parts[1];
        
        // Handle 2-digit year
        if (year.length === 2) {
          const currentYear = new Date().getFullYear();
          const currentCentury = Math.floor(currentYear / 100) * 100;
          year = String(currentCentury + parseInt(year));
        }
        
        // Validate month
        const monthNum = parseInt(month);
        if (monthNum >= 1 && monthNum <= 12) {
          return `${year}-${month}-01`;
        }
      }
    } catch (e) {
      console.warn('Failed to parse display value:', displayVal);
    }
    
    return '';
  };

  // Update display value when value prop changes
  useEffect(() => {
    setDisplayValue(formatForDisplay(value));
  }, [value, format]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Generate month/year options
  const generateOptions = () => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const options = [];
    
    // Generate 5 years back and 10 years forward
    for (let year = currentYear - 5; year <= currentYear + 10; year++) {
      for (let month = 1; month <= 12; month++) {
        const monthStr = month.toString().padStart(2, '0');
        const yearStr = year.toString();
        const optionValue = `${yearStr}-${monthStr}-01`;
        
        // Check if within min/max range
        if (min || max) {
          const optionDate = new Date(optionValue);
          const minDate = min ? new Date(min) : null;
          const maxDate = max ? new Date(max) : null;
          
          if (minDate && optionDate < minDate) continue;
          if (maxDate && optionDate > maxDate) continue;
        }
        
        options.push({
          value: optionValue,
          display: formatForDisplay(optionValue),
          label: `${new Date(year, month - 1).toLocaleString('default', { month: 'long' })} ${year}`
        });
      }
    }
    
    return options;
  };

  const handleInputChange = (e) => {
    const newDisplayValue = e.target.value;
    setDisplayValue(newDisplayValue);
    
    // Try to parse and update if valid
    const parsedValue = parseDisplayValue(newDisplayValue);
    if (parsedValue) {
      onChange?.(parsedValue);
    }
  };

  const handleInputBlur = () => {
    // Reformat display value on blur
    const parsedValue = parseDisplayValue(displayValue);
    if (parsedValue) {
      setDisplayValue(formatForDisplay(parsedValue));
      onChange?.(parsedValue);
    } else if (value) {
      // Reset to original value if parsing failed
      setDisplayValue(formatForDisplay(value));
    }
  };

  const handleOptionSelect = (optionValue) => {
    onChange?.(optionValue);
    setIsOpen(false);
  };

  const options = generateOptions();

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-600 mb-2">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        <Calendar className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${iconSizes[size]} text-gray-400 pointer-events-none`} />
        <input
          type="text"
          value={displayValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onFocus={() => setIsOpen(true)}
          className={`
            w-full border border-gray-300 rounded-lg 
            focus:ring-2 focus:ring-blue-500 focus:border-blue-500
            ${sizeClasses[size]}
            ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
            ${error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}
            transition-colors duration-200
          `}
          placeholder={finalPlaceholder}
          required={required}
          disabled={disabled}
          tabIndex={tabIndex}
          autoFocus={autoFocus}
        />
        <ChevronDown className={`absolute right-3 top-1/2 transform -translate-y-1/2 ${iconSizes[size]} text-gray-400 pointer-events-none`} />
        
        {/* Dropdown */}
        {isOpen && !disabled && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleOptionSelect(option.value)}
                className={`
                  w-full px-3 py-2 text-left hover:bg-blue-50 transition-colors
                  ${value === option.value ? 'bg-blue-100 text-blue-700' : 'text-gray-700'}
                `}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
};

export default StandardMonthYearPicker;