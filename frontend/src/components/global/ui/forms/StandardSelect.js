/**
 * StandardSelect - Consistent select/dropdown component
 * Ensures all selects have the same height and styling as other form inputs
 */

import React from 'react';
import { ChevronDown } from 'lucide-react';

const StandardSelect = ({
  value = '',
  onChange,
  options = [],
  label,
  placeholder = 'Select an option',
  required = false,
  disabled = false,
  error = null,
  className = '',
  tabIndex,
  autoFocus = false,
  name,
  id,
  multiple = false,
  size = 'md'
}) => {
  // Standardized sizing - MUST match StandardFormInput & StandardDatePicker
  const sizeClasses = {
    sm: 'h-9 px-3 pr-8 py-1.5 text-sm',     // 36px height
    md: 'h-10 px-3 pr-10 py-2 text-base',  // 40px height - DEFAULT
    lg: 'h-12 px-4 pr-12 py-3 text-lg'     // 48px height
  };

  const iconSizes = {
    sm: 'w-4 h-4 right-2',
    md: 'w-4 h-4 right-3',
    lg: 'w-5 h-5 right-4'
  };

  // Base select classes - consistent with other inputs
  const baseSelectClasses = `
    w-full border rounded-lg appearance-none cursor-pointer
    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
    transition-all duration-200
    ${sizeClasses[size]}
    ${disabled ? 'bg-gray-50 cursor-not-allowed text-gray-500' : 'bg-white'}
    ${error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-gray-300'}
    ${className}
  `;

  return (
    <div className="form-select-wrapper">
      {label && (
        <label 
          className="block text-sm font-medium text-gray-700 mb-1.5"
          htmlFor={id}
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        <select
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={baseSelectClasses}
          tabIndex={tabIndex}
          autoFocus={autoFocus}
          name={name}
          id={id}
          multiple={multiple}
        >
          {!multiple && placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => {
            const optionValue = typeof option === 'object' ? option.value : option;
            const optionLabel = typeof option === 'object' ? option.label : option;
            const optionDisabled = typeof option === 'object' ? option.disabled : false;
            
            return (
              <option
                key={optionValue}
                value={optionValue}
                disabled={optionDisabled}
              >
                {optionLabel}
              </option>
            );
          })}
        </select>
        
        {/* Dropdown arrow icon */}
        {!multiple && (
          <ChevronDown 
            className={`absolute top-1/2 transform -translate-y-1/2 ${iconSizes[size]} text-gray-400 pointer-events-none`} 
          />
        )}
      </div>
      
      {error && (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
};

export default StandardSelect;