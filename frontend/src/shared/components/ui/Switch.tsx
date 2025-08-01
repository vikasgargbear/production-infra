import React, { forwardRef, InputHTMLAttributes } from 'react';

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string;
  labelPosition?: 'left' | 'right';
  error?: string;
  helperText?: string;
  switchSize?: 'sm' | 'md' | 'lg';
  onLabel?: string;
  offLabel?: string;
}

const sizeStyles = {
  sm: {
    container: 'w-8 h-4',
    thumb: 'w-3 h-3',
    translate: 'translate-x-4',
    labelText: 'text-sm',
  },
  md: {
    container: 'w-11 h-6',
    thumb: 'w-5 h-5',
    translate: 'translate-x-5',
    labelText: 'text-sm',
  },
  lg: {
    container: 'w-14 h-7',
    thumb: 'w-6 h-6',
    translate: 'translate-x-7',
    labelText: 'text-base',
  },
};

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(({
  label,
  labelPosition = 'right',
  error,
  helperText,
  switchSize = 'md',
  onLabel,
  offLabel,
  className = '',
  id,
  disabled,
  checked,
  ...props
}, ref) => {
  const switchId = id || `switch-${Math.random().toString(36).substr(2, 9)}`;
  const hasError = !!error;
  const size = sizeStyles[switchSize];
  
  const containerStyles = [
    'relative inline-block align-middle select-none transition duration-200 ease-in',
    size.container,
    disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
  ].join(' ');
  
  const backgroundStyles = [
    'block overflow-hidden rounded-full transition-colors duration-200',
    size.container,
    checked ? 'bg-blue-600' : 'bg-gray-300',
    hasError && 'ring-2 ring-red-500',
  ].filter(Boolean).join(' ');
  
  const thumbStyles = [
    'absolute left-0.5 top-0.5 bg-white rounded-full shadow-sm transition-transform duration-200',
    size.thumb,
    checked ? size.translate : 'translate-x-0',
  ].join(' ');
  
  const labelElement = label && (
    <label
      htmlFor={switchId}
      className={`font-medium text-gray-700 cursor-pointer select-none ${
        size.labelText
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {label}
    </label>
  );
  
  const switchElement = (
    <div className={containerStyles}>
      <input
        ref={ref}
        type="checkbox"
        id={switchId}
        className="sr-only"
        disabled={disabled}
        checked={checked}
        {...props}
      />
      <div className={backgroundStyles}>
        {(onLabel || offLabel) && (
          <div className="absolute inset-0 flex items-center justify-between px-1 text-xs font-medium text-white">
            <span className={checked ? 'opacity-100' : 'opacity-0'}>{onLabel}</span>
            <span className={checked ? 'opacity-0' : 'opacity-100'}>{offLabel}</span>
          </div>
        )}
      </div>
      <div className={thumbStyles} />
    </div>
  );
  
  return (
    <div>
      <div className="flex items-center gap-3">
        {labelPosition === 'left' && labelElement}
        {switchElement}
        {labelPosition === 'right' && labelElement}
      </div>
      
      {(error || helperText) && (
        <div className="mt-1">
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

Switch.displayName = 'Switch';