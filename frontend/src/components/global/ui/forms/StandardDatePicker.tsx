import React, { FC, useId } from 'react';
import { Calendar } from 'lucide-react';

// ==================== TYPE DEFINITIONS ====================

export interface StandardDatePickerProps {
    label?: string;
    value?: string;
    onChange?: (value: string) => void;
    required?: boolean;
    disabled?: boolean;
    placeholder?: string;
    min?: string | Date;
    max?: string | Date;
    size?: 'sm' | 'md' | 'lg';
    tabIndex?: number;
    autoFocus?: boolean;
    className?: string;
    error?: string | null;
}

type SizeKey = 'sm' | 'md' | 'lg';

// ==================== COMPONENT ====================

const StandardDatePicker: FC<StandardDatePickerProps> = ({
    value = '',
    onChange,
    label,
    placeholder = '',
    required = false,
    disabled = false,
    error = null,
    className = '',
    tabIndex,
    min,
    max,
    size = 'md',
    autoFocus = false
}) => {
    const inputId = useId();
    const sizeClasses: Record<SizeKey, string> = {
        sm: 'h-11 pl-8 pr-3 py-2 text-base',
        md: 'h-12 pl-10 pr-3 py-2 text-base',
        lg: 'h-12 pl-12 pr-4 py-3 text-lg'
    };

    const iconSizes: Record<SizeKey, string> = {
        sm: 'w-4 h-4 left-2.5',
        md: 'w-4 h-4 left-3',
        lg: 'w-5 h-5 left-4'
    };

    const formatDateForInput = (date: string | Date | undefined): string | undefined => {
        if (!date) return undefined;
        if (typeof date === 'string') return date;
        return date.toISOString().split('T')[0];
    };

    return (
        <div className={className}>
            {label && (
                <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1.5">
                    {label}
                    {required && <span className="text-red-500 ml-1">*</span>}
                </label>
            )}

            <div className="relative">
                <Calendar className={`absolute top-1/2 transform -translate-y-1/2 ${iconSizes[size]} text-gray-400 pointer-events-none`} />
                <input
                    id={inputId}
                    type="date"
                    value={value}
                    onChange={(e) => onChange?.(e.target.value)}
                    className={`
            w-full border border-gray-300 rounded-lg 
            focus:ring-2 focus:ring-blue-500 focus:border-blue-500
            ${sizeClasses[size]}
            ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
            ${error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}
            transition-colors duration-200
          `}
                    placeholder={placeholder}
                    required={required}
                    disabled={disabled}
                    tabIndex={tabIndex}
                    min={formatDateForInput(min)}
                    max={formatDateForInput(max)}
                    autoFocus={autoFocus}
                />
            </div>

            {error && (
                <p className="mt-1 text-sm text-red-600">{error}</p>
            )}
        </div>
    );
};

export default StandardDatePicker;
