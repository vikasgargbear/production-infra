import React from 'react';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';
import { theme } from '../../config/theme.config';

/**
 * FormInput Component
 * Consistent form input styling across the application
 */
const FormInput = ({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
  success,
  helperText,
  required = false,
  disabled = false,
  icon,
  size = 'md',
  className = '',
  inputClassName = '',
  ...props
}) => {
  const baseClasses = theme.components.input.base;
  const sizeClasses = theme.components.input.sizes[size];
  
  let stateClasses = '';
  if (error) stateClasses = theme.components.input.states.error;
  else if (success) stateClasses = theme.components.input.states.success;
  else if (disabled) stateClasses = theme.components.input.states.disabled;

  const inputClasses = `
    ${baseClasses}
    ${sizeClasses}
    ${stateClasses}
    ${icon ? 'pl-10' : ''}
    ${inputClassName}
  `.trim();

  return (
    <div className={`space-y-2 ${className}`.trim()}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="text-gray-400">{icon}</span>
          </div>
        )}
        
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          className={inputClasses}
          {...props}
        />

        {(error || success) && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            {error && <AlertCircle className="h-5 w-5 text-red-500" />}
            {success && <CheckCircle className="h-5 w-5 text-green-500" />}
          </div>
        )}
      </div>

      {(error || success || helperText) && (
        <p className={`text-xs ${error ? 'text-red-600' : success ? 'text-green-600' : 'text-gray-500'}`}>
          {error || success || helperText}
        </p>
      )}
    </div>
  );
};

// FormGroup component for grouping related inputs
export const FormGroup = ({ children, className = '' }) => (
  <div className={`space-y-4 ${className}`.trim()}>
    {children}
  </div>
);

// FormRow component for horizontal layouts
export const FormRow = ({ children, className = '' }) => (
  <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${className}`.trim()}>
    {children}
  </div>
);

// FormSection component for form sections
export const FormSection = ({ title, description, children, className = '' }) => (
  <div className={`space-y-4 ${className}`.trim()}>
    {(title || description) && (
      <div className="border-b border-gray-200 pb-4">
        {title && <h3 className="text-lg font-semibold text-gray-900">{title}</h3>}
        {description && <p className="text-sm text-gray-600 mt-1">{description}</p>}
      </div>
    )}
    {children}
  </div>
);

export default FormInput;