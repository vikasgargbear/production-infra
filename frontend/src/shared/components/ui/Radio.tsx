import React, { forwardRef, InputHTMLAttributes } from 'react';

export interface RadioOption {
  value: string;
  label: string;
  disabled?: boolean;
  helperText?: string;
}

export interface RadioGroupProps {
  name: string;
  value?: string;
  onChange?: (value: string) => void;
  options: RadioOption[];
  label?: string;
  error?: string;
  helperText?: string;
  orientation?: 'horizontal' | 'vertical';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  required?: boolean;
}

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string;
  radioSize?: 'sm' | 'md' | 'lg';
  error?: boolean;
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

// Individual Radio component
export const Radio = forwardRef<HTMLInputElement, RadioProps>(({
  label,
  radioSize = 'md',
  error = false,
  className = '',
  id,
  disabled,
  ...props
}, ref) => {
  const radioId = id || `radio-${Math.random().toString(36).substr(2, 9)}`;
  
  const radioStyles = [
    'appearance-none border-2 rounded-full transition-colors cursor-pointer',
    'checked:border-blue-600 checked:bg-blue-600',
    'hover:border-gray-400 checked:hover:border-blue-700 checked:hover:bg-blue-700',
    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'relative',
    sizeStyles[radioSize],
    error ? 'border-red-500' : 'border-gray-300',
    className,
  ].filter(Boolean).join(' ');
  
  const dotSize = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5',
  };
  
  return (
    <div className="flex items-center">
      <div className="relative">
        <input
          ref={ref}
          type="radio"
          id={radioId}
          className={radioStyles}
          disabled={disabled}
          {...props}
        />
        {/* Center dot when checked */}
        <div
          className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-full pointer-events-none ${
            dotSize[radioSize]
          } ${props.checked ? 'opacity-100' : 'opacity-0'} transition-opacity`}
        />
      </div>
      {label && (
        <label
          htmlFor={radioId}
          className={`ml-3 font-medium text-gray-700 cursor-pointer select-none ${
            labelSizeStyles[radioSize]
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {label}
        </label>
      )}
    </div>
  );
});

Radio.displayName = 'Radio';

// Radio Group component
export const RadioGroup: React.FC<RadioGroupProps> = ({
  name,
  value,
  onChange,
  options,
  label,
  error,
  helperText,
  orientation = 'vertical',
  size = 'md',
  disabled = false,
  required = false,
}) => {
  const handleChange = (optionValue: string) => {
    if (!disabled && onChange) {
      onChange(optionValue);
    }
  };
  
  const containerStyles = orientation === 'horizontal' 
    ? 'flex flex-wrap gap-4'
    : 'space-y-3';
  
  return (
    <fieldset className="w-full">
      {label && (
        <legend className="text-sm font-medium text-gray-700 mb-3">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </legend>
      )}
      
      <div className={containerStyles} role="radiogroup" aria-required={required}>
        {options.map((option) => (
          <div key={option.value} className="flex flex-col">
            <Radio
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => handleChange(option.value)}
              label={option.label}
              radioSize={size}
              disabled={disabled || option.disabled}
              error={!!error}
            />
            {option.helperText && (
              <p className="ml-7 mt-1 text-xs text-gray-500">
                {option.helperText}
              </p>
            )}
          </div>
        ))}
      </div>
      
      {(error || helperText) && (
        <div className="mt-2">
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          {helperText && !error && (
            <p className="text-sm text-gray-500">{helperText}</p>
          )}
        </div>
      )}
    </fieldset>
  );
};