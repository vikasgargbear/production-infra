import React, { forwardRef, TextareaHTMLAttributes } from 'react';
import { AlertCircle } from 'lucide-react';

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
  resize?: 'none' | 'vertical' | 'horizontal' | 'both';
  showCharCount?: boolean;
  maxLength?: number;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(({
  label,
  error,
  helperText,
  fullWidth = true,
  resize = 'vertical',
  showCharCount = false,
  maxLength,
  className = '',
  id,
  value,
  ...props
}, ref) => {
  const textAreaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`;
  const hasError = !!error;
  const charCount = value ? String(value).length : 0;
  
  const resizeStyles = {
    none: 'resize-none',
    vertical: 'resize-y',
    horizontal: 'resize-x',
    both: 'resize',
  };
  
  const baseTextAreaStyles = 'block w-full px-4 py-2 text-sm border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0';
  const normalStyles = 'border-gray-300 focus:border-blue-500 focus:ring-blue-500';
  const errorStyles = 'border-red-300 focus:border-red-500 focus:ring-red-500';
  const disabledStyles = 'disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed';
  
  const textAreaStyles = [
    baseTextAreaStyles,
    hasError ? errorStyles : normalStyles,
    disabledStyles,
    resizeStyles[resize],
    className,
  ].filter(Boolean).join(' ');
  
  const containerStyles = fullWidth ? 'w-full' : 'inline-block';
  
  return (
    <div className={containerStyles}>
      {label && (
        <label htmlFor={textAreaId} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      
      <textarea
        ref={ref}
        id={textAreaId}
        className={textAreaStyles}
        maxLength={maxLength}
        value={value}
        {...props}
      />
      
      <div className="mt-1 flex justify-between items-start">
        <div className="flex-1">
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
        
        {showCharCount && (
          <div className="ml-2 text-sm text-gray-500">
            {maxLength ? `${charCount}/${maxLength}` : charCount}
          </div>
        )}
      </div>
    </div>
  );
});

TextArea.displayName = 'TextArea';