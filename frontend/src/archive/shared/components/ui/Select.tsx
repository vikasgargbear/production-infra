import React, { forwardRef, SelectHTMLAttributes, ReactNode } from 'react';
import { ChevronDown, AlertCircle } from 'lucide-react';

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

// Export Option as an alias for SelectOption for backward compatibility
export type Option = SelectOption;

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'onChange' | 'value'> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
  fullWidth?: boolean;
  selectSize?: 'sm' | 'md' | 'lg';
  leftIcon?: ReactNode;
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
}

const sizeStyles = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-4 py-2.5 text-base',
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({
  label,
  error,
  helperText,
  options,
  placeholder = 'Select an option',
  fullWidth = true,
  selectSize = 'md',
  leftIcon,
  className = '',
  id,
  value,
  onChange,
  ...props
}, ref) => {
  const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`;
  const hasError = !!error;
  
  const baseSelectStyles = 'block w-full border transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0 appearance-none bg-white';
  const normalStyles = 'border-gray-300 focus:border-blue-500 focus:ring-blue-500';
  const errorStyles = 'border-red-300 focus:border-red-500 focus:ring-red-500';
  const disabledStyles = 'disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed';
  
  const selectStyles = [
    baseSelectStyles,
    hasError ? errorStyles : normalStyles,
    disabledStyles,
    'rounded-lg',
    leftIcon ? 'pl-10' : '',
    'pr-10', // Always have right padding for chevron
    sizeStyles[selectSize],
    className,
  ].filter(Boolean).join(' ');
  
  const containerStyles = fullWidth ? 'w-full' : 'inline-block';
  
  return (
    <div className={containerStyles}>
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      
      <div className="relative">
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="text-gray-400">{leftIcon}</span>
          </div>
        )}
        
        <select
          ref={ref}
          id={selectId}
          className={selectStyles}
          value={value}
          onChange={(e) => {
            if (onChange) {
              if (props.multiple && e.target.selectedOptions) {
                const values = Array.from(e.target.selectedOptions).map(option => option.value);
                onChange(values);
              } else {
                onChange(e.target.value);
              }
            }
          }}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>
        
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </div>
      </div>
      
      {(error || helperText) && (
        <div className="mt-1">
          {error && (
            <p className="text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {error}
            </p>
          )}
          {helperText && !error && (
            <p className="text-sm text-gray-500">{helperText}</p>
          )}
        </div>
      )}
    </div>
  );
});

Select.displayName = 'Select';