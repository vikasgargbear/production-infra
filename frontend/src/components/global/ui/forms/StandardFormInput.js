/**
 * StandardFormInput - Consistent form input component
 * Ensures all form inputs have the same height, padding, and styling
 */

import React from 'react';

const StandardFormInput = ({
  type = 'text',
  value = '',
  onChange,
  label,
  placeholder = '',
  required = false,
  disabled = false,
  readOnly = false,
  error = null,
  className = '',
  tabIndex,
  autoFocus = false,
  icon: Icon = null,
  name,
  id,
  min,
  max,
  step,
  options = [], // For select inputs
  multiple = false,
  size = 'md',
  ...rest
}) => {
  // Standardized sizing - MUST match across all form components
  const sizeClasses = {
    sm: 'h-9 px-3 py-1.5 text-sm', // 36px height
    md: 'h-10 px-3 py-2 text-base', // 40px height - DEFAULT
    lg: 'h-12 px-4 py-3 text-lg'   // 48px height
  };

  // Icon padding adjustment
  const iconPadding = {
    sm: 'pl-8',
    md: 'pl-10',
    lg: 'pl-12'
  };

  const iconSizes = {
    sm: 'w-4 h-4 left-2.5',
    md: 'w-4 h-4 left-3',
    lg: 'w-5 h-5 left-4'
  };

  // Base input classes - consistent across all inputs
  const baseInputClasses = `
    w-full border rounded-lg
    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
    transition-all duration-200
    ${sizeClasses[size]}
    ${Icon ? iconPadding[size] : ''}
    ${disabled || readOnly ? 'bg-gray-50 cursor-not-allowed text-gray-500' : 'bg-white'}
    ${error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-gray-300'}
    ${className}
  `;

  const renderInput = () => {
    // Select input
    if (type === 'select') {
      return (
        <select
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={baseInputClasses}
          tabIndex={tabIndex}
          autoFocus={autoFocus}
          name={name}
          id={id}
          multiple={multiple}
          {...rest}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option
              key={option.value || option}
              value={option.value || option}
            >
              {option.label || option}
            </option>
          ))}
        </select>
      );
    }

    // Textarea input
    if (type === 'textarea') {
      return (
        <textarea
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          className={`${baseInputClasses} min-h-[80px] resize-y`}
          tabIndex={tabIndex}
          autoFocus={autoFocus}
          name={name}
          id={id}
          {...rest}
        />
      );
    }

    // Standard input (text, number, email, etc.)
    return (
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        className={baseInputClasses}
        tabIndex={tabIndex}
        autoFocus={autoFocus}
        name={name}
        id={id}
        min={min}
        max={max}
        step={step}
        {...rest}
      />
    );
  };

  return (
    <div className={`form-input-wrapper`}>
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
        {Icon && (
          <Icon className={`absolute top-1/2 transform -translate-y-1/2 ${iconSizes[size]} text-gray-400 pointer-events-none`} />
        )}
        {renderInput()}
      </div>
      
      {error && (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
};

export default StandardFormInput;