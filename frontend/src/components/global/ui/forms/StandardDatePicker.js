import React from 'react';
import { Calendar } from 'lucide-react';

/**
 * StandardDatePicker - Consistent date input component for full dates
 * Replaces all raw type="date" inputs across the application
 * 
 * @param {string} value - Date value in YYYY-MM-DD format
 * @param {Function} onChange - Change handler receiving YYYY-MM-DD string
 * @param {string} label - Field label
 * @param {string} placeholder - Placeholder text
 * @param {boolean} required - Required field indicator
 * @param {boolean} disabled - Disabled state
 * @param {string} error - Error message
 * @param {string} className - Additional CSS classes
 * @param {number} tabIndex - Tab index for keyboard navigation
 * @param {Date} min - Minimum date
 * @param {Date} max - Maximum date
 * @param {string} size - Component size: sm, md, lg
 */
const StandardDatePicker = ({
  value = '',
  onChange,
  label,
  placeholder = '',
  required = false,
  disabled = false,
  error = null,
  className = '',
  tabIndex,
  min,
  max,
  size = 'md',
  autoFocus = false
}) => {
  // Size configurations
  const sizeClasses = {
    sm: 'py-1.5 pl-8 pr-3 text-sm',
    md: 'py-2 pl-10 pr-3',
    lg: 'py-3 pl-12 pr-4 text-lg'
  };

  const iconSizes = {
    sm: 'w-3 h-3 left-2.5',
    md: 'w-4 h-4 left-3',
    lg: 'w-5 h-5 left-4'
  };

  // Format min/max dates for HTML input
  const formatDateForInput = (date) => {
    if (!date) return undefined;
    if (typeof date === 'string') return date;
    return date.toISOString().split('T')[0];
  };

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-gray-600 mb-2">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        <Calendar className={`absolute top-1/2 transform -translate-y-1/2 ${iconSizes[size]} text-gray-400 pointer-events-none`} />
        <input
          type="date"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          className={`
            w-full border border-gray-300 rounded-lg 
            focus:ring-2 focus:ring-blue-500 focus:border-blue-500
            ${sizeClasses[size]}
            ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
            ${error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}
            transition-colors duration-200
          `}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          tabIndex={tabIndex}
          min={formatDateForInput(min)}
          max={formatDateForInput(max)}
          autoFocus={autoFocus}
        />
      </div>

      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
};

export default StandardDatePicker;