import React, { forwardRef, InputHTMLAttributes } from 'react';
import { Check } from 'lucide-react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  checkboxSize?: 'sm' | 'md' | 'lg';
  indeterminate?: boolean;
}

const sizeStyles = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

const labelSizeStyles = {
  sm: 'text-sm',
  md: 'text-sm',
  lg: 'text-base',
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({
  label,
  error,
  helperText,
  checkboxSize = 'md',
  indeterminate = false,
  className = '',
  id,
  disabled,
  ...props
}, ref) => {
  const checkboxId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;
  const hasError = !!error;
  
  React.useEffect(() => {
    if (ref && 'current' in ref && ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate, ref]);
  
  const containerStyles = 'relative flex items-start';
  const checkboxStyles = [
    'appearance-none border-2 rounded transition-colors cursor-pointer',
    sizeStyles[checkboxSize],
    hasError ? 'border-red-500' : 'border-gray-300',
    'checked:bg-blue-600 checked:border-blue-600',
    'indeterminate:bg-blue-600 indeterminate:border-blue-600',
    'hover:border-gray-400 checked:hover:bg-blue-700 checked:hover:border-blue-700',
    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500',
    'disabled:cursor-not-allowed disabled:opacity-50',
    className,
  ].filter(Boolean).join(' ');
  
  return (
    <div>
      <div className={containerStyles}>
        <div className="flex items-center h-5">
          <input
            ref={ref}
            type="checkbox"
            id={checkboxId}
            className={checkboxStyles}
            disabled={disabled}
            {...props}
          />
          {/* Check icon overlay */}
          <Check 
            className={`absolute pointer-events-none text-white transition-opacity ${
              sizeStyles[checkboxSize]
            } ${
              props.checked ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              width: checkboxSize === 'sm' ? '12px' : checkboxSize === 'md' ? '14px' : '16px',
              height: checkboxSize === 'sm' ? '12px' : checkboxSize === 'md' ? '14px' : '16px',
              left: checkboxSize === 'sm' ? '2px' : checkboxSize === 'md' ? '3px' : '4px',
              top: checkboxSize === 'sm' ? '2px' : checkboxSize === 'md' ? '3px' : '4px',
            }}
          />
        </div>
        {label && (
          <div className="ml-3">
            <label
              htmlFor={checkboxId}
              className={`font-medium text-gray-700 cursor-pointer select-none ${
                labelSizeStyles[checkboxSize]
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {label}
            </label>
          </div>
        )}
      </div>
      
      {(error || helperText) && (
        <div className={label ? 'ml-8 mt-1' : 'mt-1'}>
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          {helperText && !error && (
            <p className="text-sm text-gray-500">{helperText}</p>
          )}
        </div>
      )}
    </div>
  );
});

Checkbox.displayName = 'Checkbox';