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
    onFocus: onFocusProp,
    onBlur: onBlurProp
}, ref) => {
    const [localValue, setLocalValue] = useState<string | number>(value);
    const [isEditing, setIsEditing] = useState(false);
    const [originalValue, setOriginalValue] = useState<string | number>(value);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setLocalValue(value);
    }, [value]);

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

    const handleSave = (val: string | number): void => {
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

        if (onChange) {
            onChange(processedValue);
        }
        if (onSave && processedValue !== originalValue) {
            onSave(processedValue);
            setOriginalValue(processedValue);
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
        if (readOnly) return;

        switch (e.key) {
            case 'Enter':
                e.preventDefault();
                handleSave(localValue);
                setIsEditing(false);
                onNavigate?.('next');
                break;

            case 'Tab':
                e.preventDefault();
                handleSave(localValue);
                setIsEditing(false);
                onNavigate?.(e.shiftKey ? 'left' : 'right');
                break;

            case 'ArrowDown':
                if (!e.shiftKey && !e.ctrlKey) {
                    e.preventDefault();
                    handleSave(localValue);
                    setIsEditing(false);
                    onNavigate?.('down');
                }
                break;

            case 'ArrowUp':
                if (!e.shiftKey && !e.ctrlKey) {
                    e.preventDefault();
                    handleSave(localValue);
                    setIsEditing(false);
                    onNavigate?.('up');
                }
                break;

            case 'Escape':
                e.preventDefault();
                setLocalValue(originalValue);
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
        handleSave(localValue);
        setIsEditing(false);
        onBlurProp?.(e);
    };

    const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
        const val = e.target.value;

        if (type === 'number') {
            const cleaned = val.replace(/[^0-9.-]/g, '');
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

            {suffix && <span className="text-gray-600 ml-1 text-sm">{suffix}</span>}
        </div>
    );
};

const EditableCell = forwardRef(EditableCellComponent);
EditableCell.displayName = 'EditableCell';

export default EditableCell;
