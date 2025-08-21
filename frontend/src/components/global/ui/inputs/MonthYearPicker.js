import React, { useState, useRef, useEffect } from 'react';
import { Calendar } from 'lucide-react';

/**
 * Global Month/Year Picker Component
 * For selecting month and year (commonly used for expiry dates)
 * Displays as MM/YY but allows manual typing
 */
const MonthYearPicker = ({
  value, // Date string or null
  onChange,
  placeholder = 'MM/YY',
  className = '',
  disabled = false,
  required = false,
  minDate,
  maxDate,
  width = 'w-20'
}) => {
  const [displayValue, setDisplayValue] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef(null);
  const hiddenInputRef = useRef(null);

  // Format date to MM/YY
  const formatToMMYY = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '';
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = String(date.getFullYear()).slice(-2);
      return `${month}/${year}`;
    } catch {
      return '';
    }
  };

  // Parse MM/YY input to date
  const parseMMYY = (input) => {
    // Remove any non-digit characters except /
    const cleaned = input.replace(/[^\d/]/g, '');
    
    // Try to parse MM/YY or MMYY format
    let month, year;
    
    if (cleaned.includes('/')) {
      const parts = cleaned.split('/');
      month = parts[0];
      year = parts[1];
    } else if (cleaned.length >= 3) {
      // Assume first 2 digits are month
      month = cleaned.slice(0, 2);
      year = cleaned.slice(2);
    } else {
      return null;
    }
    
    // Validate and convert
    const monthNum = parseInt(month, 10);
    if (monthNum < 1 || monthNum > 12) return null;
    
    // Convert 2-digit year to 4-digit
    let yearNum = parseInt(year, 10);
    if (yearNum < 100) {
      // Assume 20XX for years 00-50, 19XX for 51-99
      yearNum = yearNum <= 50 ? 2000 + yearNum : 1900 + yearNum;
    }
    
    // Create date (first day of the month)
    const date = new Date(yearNum, monthNum - 1, 1);
    return date;
  };

  // Initialize display value
  useEffect(() => {
    setDisplayValue(formatToMMYY(value));
  }, [value]);

  // Handle manual input
  const handleManualInput = (e) => {
    let input = e.target.value;
    
    // Auto-add slash after 2 digits
    if (input.length === 2 && !input.includes('/') && displayValue.length < input.length) {
      input = input + '/';
    }
    
    // Limit input length
    if (input.length > 5) return;
    
    setDisplayValue(input);
    
    // Try to parse and update if valid
    if (input.length >= 3) {
      const date = parseMMYY(input);
      if (date) {
        onChange(date.toISOString().split('T')[0]);
      }
    } else if (input === '') {
      onChange(null);
    }
  };

  // Handle blur - validate and format
  const handleBlur = () => {
    setIsEditing(false);
    
    if (displayValue) {
      const date = parseMMYY(displayValue);
      if (date) {
        setDisplayValue(formatToMMYY(date.toISOString()));
        onChange(date.toISOString().split('T')[0]);
      } else {
        // Invalid input, revert to previous value
        setDisplayValue(formatToMMYY(value));
      }
    }
  };

  // Handle native date picker change
  const handleNativeChange = (e) => {
    const selectedDate = e.target.value;
    if (selectedDate) {
      // Convert YYYY-MM to date
      const date = new Date(selectedDate + '-01');
      onChange(date.toISOString().split('T')[0]);
      setDisplayValue(formatToMMYY(date.toISOString()));
    }
  };

  // Handle click on display input
  const handleDisplayClick = () => {
    if (!disabled) {
      setIsEditing(true);
      // Also trigger native date picker
      if (hiddenInputRef.current) {
        hiddenInputRef.current.showPicker?.();
      }
    }
  };

  // Handle focus
  const handleFocus = () => {
    setIsEditing(true);
    if (inputRef.current) {
      inputRef.current.select();
    }
  };

  return (
    <div className={`relative inline-block ${width}`}>
      {/* Hidden native month picker */}
      <input
        ref={hiddenInputRef}
        type="month"
        value={value ? value.substring(0, 7) : ''}
        onChange={handleNativeChange}
        min={minDate ? minDate.substring(0, 7) : undefined}
        max={maxDate ? maxDate.substring(0, 7) : undefined}
        disabled={disabled}
        required={required}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        style={{ zIndex: isEditing ? -1 : 1 }}
      />
      
      {/* Visible input for manual entry */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={handleManualInput}
          onBlur={handleBlur}
          onFocus={handleFocus}
          onClick={handleDisplayClick}
          placeholder={placeholder}
          disabled={disabled}
          className={`
            w-full text-center border-0 bg-transparent 
            focus:ring-2 focus:ring-blue-500 rounded-md
            cursor-pointer
            ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}
            ${className}
          `}
          style={{ fontSize: '0.75rem' }}
        />
        <Calendar 
          className="absolute right-1 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" 
        />
      </div>
    </div>
  );
};

export default MonthYearPicker;