import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle, ForwardRefRenderFunction, FocusEvent, KeyboardEvent, ChangeEvent } from 'react';

// ==================== TYPE DEFINITIONS ====================

type NavigationDirection = 'up' | 'down' | 'left' | 'right' | 'next';

export interface EditableCellRef {
    focus: () => void;
    blur: () => void;
    getValue: () => string | number;
    setValue: (val: string | number) => void;
}

export interface EditableCellProps {
    value: string | number;
    type?: 'number' | 'text';
    onSave?: (value: number | string) => void;
    onChange?: (value: number | string) => void;
    onNavigate?: (direction: NavigationDirection) => void;
    readOnly?: boolean;
    min?: number;
    max?: number;
    step?: number;
    suffix?: string;
    prefix?: string;
    placeholder?: string;
    className?: string;
    selectOnFocus?: boolean;
    allowNegative?: boolean;
    decimalPlaces?: number;
    maxDecimalPlaces?: number;
    decimalPlacesErrorMessage?: string;
    onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
    onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
}

// ==================== COMPONENT ====================

const EditableCellComponent: ForwardRefRenderFunction<EditableCellRef, EditableCellProps> = ({
    value,
    type = 'number',
    onSave,
    onChange,
    onNavigate,
    readOnly = false,
    min = 0,
    max,
    step = 1,
    suffix = '',
    prefix = '',
    placeholder = '0',
    className = '',
    selectOnFocus = true,
    allowNegative = false,
    decimalPlaces = 2,
    maxDecimalPlaces,
    decimalPlacesErrorMessage,
    onFocus: onFocusProp,
    onBlur: onBlurProp
}, ref) => {
    const [localValue, setLocalValue] = useState<string | number>(value);
    const [isEditing, setIsEditing] = useState(false);
    const [originalValue, setOriginalValue] = useState<string | number>(value);
    const [validationError, setValidationError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const errorId = React.useId();

    useEffect(() => {
        setLocalValue(value);
        setValidationError(null);
    }, [value]);

    const decimalPrecisionError = (candidate: string | number): string | null => {
        if (type !== 'number' || maxDecimalPlaces === undefined) return null;
        const normalized = String(candidate).trim();
        if (normalized === '') return null;
        const plainDecimalPattern = allowNegative
            ? /^-?(?:\d+|\d*\.\d*)$/
            : /^(?:\d+|\d*\.\d*)$/;
        if (!plainDecimalPattern.test(normalized)) {
            return decimalPlacesErrorMessage
                || `Enter a plain number with no more than ${maxDecimalPlaces} decimal places.`;
        }
        const unsigned = normalized.replace(/^[+-]/, '');
        const decimalIndex = unsigned.indexOf('.');
        if (decimalIndex < 0) return null;
        if (unsigned.slice(decimalIndex + 1).length <= maxDecimalPlaces) return null;
        return decimalPlacesErrorMessage
            || `Enter no more than ${maxDecimalPlaces} decimal places.`;
    };

    useImperativeHandle(ref, () => ({
        focus: () => {
            if (inputRef.current) {
                inputRef.current.focus();
                if (selectOnFocus) {
                    inputRef.current.select();
                }
            }
        },
        blur: () => {
            if (inputRef.current) {
                inputRef.current.blur();
            }
        },
        getValue: () => localValue,
        setValue: (val: string | number) => setLocalValue(val)
    }));

    const formatValue = (val: string | number): string => {
        if (type === 'number') {
            const num = parseFloat(String(val));
            if (isNaN(num)) return '';
            return num.toFixed(decimalPlaces);
        }
        return String(val);
    };

    const handleSave = (val: string | number): boolean => {
        const precisionError = decimalPrecisionError(val);
        if (precisionError) {
            setValidationError(precisionError);
            return false;
        }

        let processedValue: string | number = val;

        if (type === 'number') {
            const cleaned = String(val).replace(/[^0-9.-]/g, '');
            let num = parseFloat(cleaned);

            if (isNaN(num)) {
                num = 0;
            }

            if (!allowNegative && num < 0) num = 0;
            if (min !== undefined && num < min) num = min;
            if (max !== undefined && num > max) num = max;

            processedValue = num;
        }

        setLocalValue(processedValue);
        setValidationError(null);

        if (onChange) {
            onChange(processedValue);
        }
        if (onSave && processedValue !== originalValue) {
            onSave(processedValue);
            setOriginalValue(processedValue);
        }
        return true;
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
        if (readOnly) return;

        switch (e.key) {
            case 'Enter':
                e.preventDefault();
                if (!handleSave(localValue)) break;
                setIsEditing(false);
                onNavigate?.('next');
                break;

            case 'Tab':
                e.preventDefault();
                if (!handleSave(localValue)) break;
                setIsEditing(false);
                onNavigate?.(e.shiftKey ? 'left' : 'right');
                break;

            case 'ArrowDown':
                if (!e.shiftKey && !e.ctrlKey) {
                    e.preventDefault();
                    if (!handleSave(localValue)) break;
                    setIsEditing(false);
                    onNavigate?.('down');
                }
                break;

            case 'ArrowUp':
                if (!e.shiftKey && !e.ctrlKey) {
                    e.preventDefault();
                    if (!handleSave(localValue)) break;
                    setIsEditing(false);
                    onNavigate?.('up');
                }
                break;

            case 'Escape':
                e.preventDefault();
                setLocalValue(originalValue);
                setValidationError(null);
                setIsEditing(false);
                inputRef.current?.blur();
                break;
        }
    };

    const handleFocus = (e: FocusEvent<HTMLInputElement>): void => {
        setIsEditing(true);
        setOriginalValue(localValue);

        if (selectOnFocus) {
            setTimeout(() => {
                e.target.select();
            }, 0);
        }

        onFocusProp?.(e);
    };

    const handleBlur = (e: FocusEvent<HTMLInputElement>): void => {
        if (handleSave(localValue)) {
            setIsEditing(false);
        }
        onBlurProp?.(e);
    };

    const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
        const val = e.target.value;

        if (type === 'number') {
            const precisionError = decimalPrecisionError(val);
            if (precisionError) {
                setValidationError(precisionError);
                return;
            }
            const cleaned = val.replace(/[^0-9.-]/g, '');
            setValidationError(null);
            setLocalValue(cleaned);
        } else {
            setLocalValue(val);
            onChange?.(val);
        }
    };

    const displayValue = type === 'number' && !isEditing
        ? formatValue(localValue)
        : localValue;

    return (
        <div className={`relative flex items-center ${className}`}>
            {prefix && <span className="text-gray-600 mr-1 text-sm">{prefix}</span>}

            <input
                ref={inputRef}
                type={type === 'number' ? 'text' : type}
                value={displayValue}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder={placeholder}
                readOnly={readOnly}
                step={step}
                aria-invalid={validationError ? true : undefined}
                aria-describedby={validationError ? errorId : undefined}
                className={`
          w-full px-2 py-1.5 text-right border rounded
          transition-all duration-150
          ${isEditing
                        ? 'ring-2 ring-blue-500 border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }
          ${readOnly
                        ? 'bg-gray-50 cursor-not-allowed text-gray-600'
                        : 'bg-white focus:outline-none'
                    }
        `}
                disabled={readOnly}
            />

            {validationError && (
                <span
                    id={errorId}
                    role="alert"
                    className="absolute left-0 top-full z-10 mt-1 min-w-max border border-red-200 bg-white px-2 py-1 text-left text-xs text-red-700 shadow-sm"
                >
                    {validationError}
                </span>
            )}

            {suffix && <span className="text-gray-600 ml-1 text-sm">{suffix}</span>}
        </div>
    );
};

const EditableCell = forwardRef(EditableCellComponent);
EditableCell.displayName = 'EditableCell';

export default EditableCell;
