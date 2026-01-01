import React, { useState, useEffect, ChangeEvent } from 'react';
import { Plus, Minus } from 'lucide-react';

// ==================== TYPE DEFINITIONS ====================

type SizeType = 'sm' | 'md' | 'lg';

export interface NumberInputProps {
    value?: number | null;
    onChange: (value: number | null) => void;
    min?: number;
    max?: number;
    step?: number;
    placeholder?: string;
    disabled?: boolean;
    error?: string;
    label?: string;
    required?: boolean;
    showButtons?: boolean;
    className?: string;
    size?: SizeType;
    prefix?: string;
    suffix?: string;
    decimals?: number | null;
    allowNegative?: boolean;
}

// ==================== COMPONENT ====================

const NumberInput: React.FC<NumberInputProps> = ({
    value,
    onChange,
    min,
    max,
    step = 1,
    placeholder = "0",
    disabled = false,
    error,
    label,
    required = false,
    showButtons = true,
    className = "",
    size = "md",
    prefix,
    suffix,
    decimals = null,
    allowNegative = true
}) => {
    const [displayValue, setDisplayValue] = useState<string>(value?.toString() || '');

    useEffect(() => {
        setDisplayValue(value?.toString() || '');
    }, [value]);

    const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
        let newValue = e.target.value;

        if (newValue === '') {
            setDisplayValue('');
            onChange(null);
            return;
        }

        newValue = newValue.replace(/[^0-9.-]/g, '');

        if (!allowNegative) {
            newValue = newValue.replace('-', '');
        }

        const numValue = parseFloat(newValue);

        if (!isNaN(numValue)) {
            if (min !== undefined && numValue < min) return;
            if (max !== undefined && numValue > max) return;
        }

        setDisplayValue(newValue);

        if (!isNaN(numValue)) {
            onChange(decimals !== null ? parseFloat(numValue.toFixed(decimals)) : numValue);
        }
    };

    const handleIncrement = (): void => {
        if (disabled) return;

        const currentValue = value || 0;
        const newValue = currentValue + step;

        if (max !== undefined && newValue > max) return;

        onChange(decimals !== null ? parseFloat(newValue.toFixed(decimals)) : newValue);
    };

    const handleDecrement = (): void => {
        if (disabled) return;

        const currentValue = value || 0;
        const newValue = currentValue - step;

        if (min !== undefined && newValue < min) return;

        onChange(decimals !== null ? parseFloat(newValue.toFixed(decimals)) : newValue);
    };

    const handleBlur = (): void => {
        if (displayValue === '') return;

        const numValue = parseFloat(displayValue);
        if (!isNaN(numValue)) {
            setDisplayValue(decimals !== null ? numValue.toFixed(decimals) : numValue.toString());
        }
    };

    const sizeClasses: Record<SizeType, string> = {
        sm: 'py-1.5 text-sm',
        md: 'py-2',
        lg: 'py-3 text-lg'
    };

    const buttonSizeClasses: Record<SizeType, string> = {
        sm: 'px-2 py-1.5',
        md: 'px-3 py-2',
        lg: 'px-4 py-3'
    };

    return (
        <div className={className}>
            {label && (
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    {label}
                    {required && <span className="text-red-500 ml-1">*</span>}
                </label>
            )}

            <div className="relative flex items-center">
                {prefix && (
                    <span className={`absolute left-3 text-gray-500 ${sizeClasses[size]}`}>
                        {prefix}
                    </span>
                )}

                <input
                    type="text"
                    value={displayValue}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder={placeholder}
                    disabled={disabled}
                    className={`
            w-full border rounded-lg
            ${prefix ? 'pl-8' : 'pl-3'}
            ${suffix ? 'pr-8' : 'pr-3'}
            ${showButtons ? 'px-12' : ''}
            ${sizeClasses[size]}
            ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
            ${error ? 'border-red-500' : 'border-gray-300'}
            focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          `}
                />

                {suffix && !showButtons && (
                    <span className={`absolute right-3 text-gray-500 ${sizeClasses[size]}`}>
                        {suffix}
                    </span>
                )}

                {showButtons && (
                    <>
                        <button
                            type="button"
                            onClick={handleDecrement}
                            disabled={disabled || (min !== undefined && (value || 0) <= min)}
                            className={`
                absolute left-0 border border-r-0 rounded-l-lg
                ${buttonSizeClasses[size]}
                ${disabled || (min !== undefined && (value || 0) <= min)
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-white hover:bg-gray-50 text-gray-600'
                                }
              `}
                        >
                            <Minus className="w-4 h-4" />
                        </button>

                        <button
                            type="button"
                            onClick={handleIncrement}
                            disabled={disabled || (max !== undefined && (value || 0) >= max)}
                            className={`
                absolute right-0 border border-l-0 rounded-r-lg
                ${buttonSizeClasses[size]}
                ${disabled || (max !== undefined && (value || 0) >= max)
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-white hover:bg-gray-50 text-gray-600'
                                }
              `}
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </>
                )}
            </div>

            {error && (
                <p className="mt-1 text-sm text-red-600">{error}</p>
            )}
        </div>
    );
};

export default NumberInput;
