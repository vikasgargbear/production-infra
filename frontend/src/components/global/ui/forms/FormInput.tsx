import React, { ReactNode, InputHTMLAttributes, ChangeEvent } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
// Theme config - using default fallbacks if not found
const theme = { components: { input: { base: 'w-full px-3 py-2 border rounded-lg', sizes: { sm: 'text-sm', md: '', lg: 'text-lg' }, states: { error: 'border-red-500', success: 'border-green-500', disabled: 'bg-gray-100' } } } };

// ==================== TYPE DEFINITIONS ====================

type InputSize = 'sm' | 'md' | 'lg';

export interface FormInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'onChange'> {
    label?: string;
    type?: string;
    value?: string | number;
    onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    error?: string;
    success?: string;
    helperText?: string;
    required?: boolean;
    disabled?: boolean;
    icon?: ReactNode;
    size?: InputSize;
    className?: string;
    inputClassName?: string;
}

export interface FormGroupProps {
    children: ReactNode;
    className?: string;
}

export interface FormRowProps {
    children: ReactNode;
    className?: string;
}

export interface FormSectionProps {
    title?: string;
    description?: string;
    children: ReactNode;
    className?: string;
}

// ==================== COMPONENTS ====================

/**
 * FormInput Component
 * Consistent form input styling across the application
 */
const FormInput: React.FC<FormInputProps> = ({
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
    const themeConfig = theme as any;
    const baseClasses = themeConfig.components?.input?.base || 'w-full px-3 py-2 border rounded-lg';
    const sizeClasses = themeConfig.components?.input?.sizes?.[size] || '';

    let stateClasses = '';
    if (error) stateClasses = themeConfig.components?.input?.states?.error || 'border-red-500';
    else if (success) stateClasses = themeConfig.components?.input?.states?.success || 'border-green-500';
    else if (disabled) stateClasses = themeConfig.components?.input?.states?.disabled || 'bg-gray-100';

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

/**
 * FormGroup Component
 * Grouping related inputs
 */
export const FormGroup: React.FC<FormGroupProps> = ({ children, className = '' }) => (
    <div className={`space-y-4 ${className}`.trim()}>
        {children}
    </div>
);

/**
 * FormRow Component
 * Horizontal layouts
 */
export const FormRow: React.FC<FormRowProps> = ({ children, className = '' }) => (
    <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${className}`.trim()}>
        {children}
    </div>
);

/**
 * FormSection Component
 * Form sections with title
 */
export const FormSection: React.FC<FormSectionProps> = ({ title, description, children, className = '' }) => (
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
