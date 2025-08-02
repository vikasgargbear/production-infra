import React, { forwardRef, InputHTMLAttributes, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  leftAddon?: ReactNode;
  rightAddon?: ReactNode;
  fullWidth?: boolean;
  inputSize?: 'sm' | 'md' | 'lg';
}

const sizeStyles = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-4 py-2.5 text-base',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  leftAddon,
  rightAddon,
  fullWidth = true,
  inputSize = 'md',
  className = '',
  id,
  ...props
}, ref) => {
  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
  const hasError = !!error;
  
  const baseInputStyles = 'block w-full border transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0';
  const normalStyles = 'border-gray-300 focus:border-blue-500 focus:ring-blue-500';
  const errorStyles = 'border-red-300 focus:border-red-500 focus:ring-red-500';
  const disabledStyles = 'disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed';
  
  const inputStyles = [
    baseInputStyles,
    hasError ? errorStyles : normalStyles,
    disabledStyles,
    leftIcon ? 'pl-10' : '',
    rightIcon ? 'pr-10' : '',
    leftAddon ? 'rounded-r-lg' : rightAddon ? 'rounded-l-lg' : 'rounded-lg',
    sizeStyles[inputSize],
    className,
  ].filter(Boolean).join(' ');
  
  const containerStyles = fullWidth ? 'w-full' : 'inline-block';
  
  return (
    <div className={containerStyles}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      
      <div className="relative">
        {(leftAddon || rightAddon) ? (
          <div className="flex">
            {leftAddon && (
              <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                {leftAddon}
              </span>
            )}
            
            <div className="relative flex-1">
              {leftIcon && (
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-400">{leftIcon}</span>
                </div>
              )}
              
              <input
                ref={ref}
                id={inputId}
                className={inputStyles}
                {...props}
              />
              
              {rightIcon && (
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <span className="text-gray-400">{rightIcon}</span>
                </div>
              )}
            </div>
            
            {rightAddon && (
              <span className="inline-flex items-center px-3 rounded-r-lg border border-l-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                {rightAddon}
              </span>
            )}
          </div>
        ) : (
          <>
            {leftIcon && (
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-400">{leftIcon}</span>
              </div>
            )}
            
            <input
              ref={ref}
              id={inputId}
              className={inputStyles}
              {...props}
            />
            
            {rightIcon && (
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <span className="text-gray-400">{rightIcon}</span>
              </div>
            )}
          </>
        )}
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

Input.displayName = 'Input';