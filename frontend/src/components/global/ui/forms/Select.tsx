import React, { useState, useRef, useEffect, useId, ChangeEvent, ReactNode, MouseEvent, KeyboardEvent } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';

// ==================== TYPE DEFINITIONS ====================

type SizeType = 'sm' | 'md' | 'lg';

export interface SelectOption {
    value: string | number;
    label: string;
    group?: string;
    disabled?: boolean;
}

export interface SelectProps {
    options?: SelectOption[];
    value?: string | number | (string | number)[] | null;
    onChange: (value: string | number | (string | number)[] | null) => void;
    placeholder?: string;
    searchable?: boolean;
    multiple?: boolean;
    clearable?: boolean;
    disabled?: boolean;
    error?: string;
    label?: string;
    required?: boolean;
    renderOption?: (option: SelectOption) => ReactNode;
    className?: string;
    size?: SizeType;
}

// ==================== COMPONENT ====================

const Select: React.FC<SelectProps> = ({
    options = [],
    value,
    onChange,
    placeholder = "Select...",
    searchable = false,
    multiple = false,
    clearable = false,
    disabled = false,
    error,
    label,
    required = false,
    renderOption,
    className = "",
    size = "md"
}) => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [activeIndex, setActiveIndex] = useState<number>(-1);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const listboxId = `select-listbox-${useId().replace(/:/g, '')}`;

    useEffect(() => {
        const handleClickOutside = (event: Event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearchQuery('');
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = searchQuery
        ? options.filter(opt =>
            opt.label.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : options;

    const groupedOptions = filteredOptions.reduce<Record<string, SelectOption[]>>((acc, option) => {
        const group = option.group || 'default';
        if (!acc[group]) acc[group] = [];
        acc[group].push(option);
        return acc;
    }, {});
    const selectableOptions = filteredOptions.filter(option => !option.disabled);
    const hasValue = value !== undefined && value !== null && value !== ''
        && (!Array.isArray(value) || value.length > 0);

    useEffect(() => {
        if (!isOpen) {
            setActiveIndex(-1);
            return;
        }
        const selectedIndex = selectableOptions.findIndex(option => multiple && Array.isArray(value)
            ? value.includes(option.value)
            : value === option.value);
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : (selectableOptions.length ? 0 : -1));
    // `isSelected` is intentionally derived from the current option/value props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, searchQuery, value, options]);

    const getDisplayValue = (): string => {
        if (!hasValue) {
            return placeholder;
        }

        if (multiple && Array.isArray(value)) {
            const selectedOptions = options.filter(opt => value.includes(opt.value));
            return selectedOptions.length > 0
                ? `${selectedOptions.length} selected`
                : placeholder;
        }

        const selectedOption = options.find(opt => opt.value === value);
        return selectedOption ? selectedOption.label : placeholder;
    };

    const handleSelect = (option: SelectOption): void => {
        if (option.disabled) return;

        if (multiple) {
            const currentValues = Array.isArray(value) ? value : [];
            const newValues = currentValues.includes(option.value)
                ? currentValues.filter(v => v !== option.value)
                : [...currentValues, option.value];
            onChange(newValues);
        } else {
            onChange(option.value);
            setIsOpen(false);
        }
        setSearchQuery('');
    };

    const handleClear = (e: MouseEvent): void => {
        e.stopPropagation();
        onChange(multiple ? [] : null);
        triggerRef.current?.focus();
    };

    const closeAndRestoreFocus = (): void => {
        setIsOpen(false);
        setSearchQuery('');
        triggerRef.current?.focus();
    };

    const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
        if (disabled) return;
        if (event.key === 'Escape' && isOpen) {
            event.preventDefault();
            closeAndRestoreFocus();
            return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!isOpen) {
                setIsOpen(true);
                return;
            }
            const delta = event.key === 'ArrowDown' ? 1 : -1;
            setActiveIndex(current => {
                if (!selectableOptions.length) return -1;
                const start = current < 0 ? (delta > 0 ? -1 : 0) : current;
                return (start + delta + selectableOptions.length) % selectableOptions.length;
            });
            return;
        }
        if ((event.key === 'Enter' || event.key === ' ') && isOpen && activeIndex >= 0) {
            event.preventDefault();
            handleSelect(selectableOptions[activeIndex]);
            return;
        }
        if (event.key === 'Home' && isOpen && selectableOptions.length) {
            event.preventDefault();
            setActiveIndex(0);
        } else if (event.key === 'End' && isOpen && selectableOptions.length) {
            event.preventDefault();
            setActiveIndex(selectableOptions.length - 1);
        }
    };

    const isSelected = (option: SelectOption): boolean => {
        if (multiple && Array.isArray(value)) {
            return value.includes(option.value);
        }
        return value === option.value;
    };

    const sizeClasses: Record<SizeType, string> = {
        sm: 'py-1.5 px-3 text-sm',
        md: 'py-2 px-3',
        lg: 'py-3 px-4 text-lg'
    };

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            {label && (
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    {label}
                    {required && <span className="text-red-500 ml-1">*</span>}
                </label>
            )}

            <button
                ref={triggerRef}
                type="button"
                role="combobox"
                aria-expanded={isOpen}
                aria-controls={listboxId}
                aria-haspopup="listbox"
                aria-label={label || placeholder}
                aria-required={required || undefined}
                aria-invalid={Boolean(error) || undefined}
                aria-activedescendant={isOpen && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
                disabled={disabled}
                onClick={() => setIsOpen(!isOpen)}
                onKeyDown={handleTriggerKeyDown}
                className={`
          w-full border rounded-lg cursor-pointer
          flex items-center justify-between
          ${sizeClasses[size]}
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white hover:border-gray-400'}
          ${isOpen ? 'ring-2 ring-blue-500 border-blue-500' : 'border-gray-300'}
          ${error ? 'border-red-500' : ''}
        `}
            >
                <span className={`flex-1 truncate text-left ${!hasValue ? 'text-gray-400' : ''}`}>
                    {getDisplayValue()}
                </span>

                <div className="flex items-center gap-1">
                    <ChevronDown
                        className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'transform rotate-180' : ''
                            }`}
                    />
                </div>
            </button>
            {clearable && hasValue && !disabled && (
                <button
                    type="button"
                    aria-label={`Clear ${label || 'selection'}`}
                    onClick={handleClear}
                    className="absolute right-8 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <X className="w-4 h-4" />
                </button>
            )}

            {error && (
                <p className="mt-1 text-sm text-red-600">{error}</p>
            )}

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
                    {searchable && (
                        <div className="p-2 border-b border-gray-200">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Escape') {
                                            event.preventDefault();
                                            closeAndRestoreFocus();
                                        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                                            event.preventDefault();
                                            const delta = event.key === 'ArrowDown' ? 1 : -1;
                                            setActiveIndex(current => selectableOptions.length
                                                ? (Math.max(current, 0) + delta + selectableOptions.length) % selectableOptions.length
                                                : -1);
                                        } else if (event.key === 'Enter' && activeIndex >= 0) {
                                            event.preventDefault();
                                            handleSelect(selectableOptions[activeIndex]);
                                        }
                                    }}
                                    placeholder="Search..."
                                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    onClick={(e: MouseEvent) => e.stopPropagation()}
                                    autoFocus
                                />
                            </div>
                        </div>
                    )}

                    <div id={listboxId} role="listbox" aria-multiselectable={multiple || undefined} className="max-h-60 overflow-y-auto">
                        {filteredOptions.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-gray-500 text-center">
                                No options found
                            </div>
                        ) : (
                            Object.entries(groupedOptions).map(([group, groupOptions]) => (
                                <div key={group}>
                                    {group !== 'default' && (
                                        <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase bg-gray-50">
                                            {group}
                                        </div>
                                    )}
                                    {groupOptions.map((option) => {
                                        const optionIndex = selectableOptions.indexOf(option);
                                        return (
                                        <button
                                            type="button"
                                            key={String(option.value)}
                                            id={optionIndex >= 0 ? `${listboxId}-option-${optionIndex}` : undefined}
                                            role="option"
                                            aria-selected={isSelected(option)}
                                            disabled={option.disabled}
                                            onClick={() => handleSelect(option)}
                                            className={`
                        w-full px-3 py-2 cursor-pointer flex items-center justify-between text-left
                        ${option.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}
                        ${isSelected(option) || optionIndex === activeIndex ? 'bg-blue-50' : ''}
                      `}
                                        >
                                            <div className="flex items-center gap-2">
                                                {multiple && (
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected(option)}
                                                        onChange={() => { }}
                                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                        disabled={option.disabled}
                                                    />
                                                )}
                                                {renderOption ? (
                                                    renderOption(option)
                                                ) : (
                                                    <span className={`text-sm ${isSelected(option) ? 'font-medium' : ''}`}>
                                                        {option.label}
                                                    </span>
                                                )}
                                            </div>
                                            {!multiple && isSelected(option) && (
                                                <Check className="w-4 h-4 text-blue-600" />
                                            )}
                                        </button>
                                    );})}
                                </div>
                            ))
                        )}
                    </div>

                    {multiple && (
                        <div className="px-3 py-2 border-t border-gray-200 flex justify-between">
                            <button
                                onClick={(e: MouseEvent) => {
                                    e.stopPropagation();
                                    onChange([]);
                                }}
                                className="text-sm text-gray-600 hover:text-gray-800"
                                type="button"
                            >
                                Clear all
                            </button>
                            <button
                                onClick={(e: MouseEvent) => {
                                    e.stopPropagation();
                                    setIsOpen(false);
                                }}
                                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                                type="button"
                            >
                                Done
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Select;
