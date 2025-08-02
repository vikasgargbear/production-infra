import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, MoreVertical } from 'lucide-react';
import { Button, ButtonProps } from './Button';

export interface DropdownItem {
  key?: string;
  id?: string; // Support both key and id
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  variant?: 'default' | 'danger' | 'warning';
  onClick?: () => void;
}

export interface DropdownProps {
  items: (DropdownItem | 'divider')[];
  trigger?: React.ReactNode;
  triggerProps?: Partial<ButtonProps>;
  placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';
  closeOnClick?: boolean;
  className?: string;
  menuClassName?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({
  items,
  trigger,
  triggerProps,
  placement = 'bottom-start',
  closeOnClick = true,
  className = '',
  menuClassName = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  
  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);
  
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);
  
  const handleItemClick = (item: DropdownItem) => {
    if (item.disabled) return;
    
    item.onClick?.();
    
    if (closeOnClick) {
      setIsOpen(false);
    }
  };
  
  const placementStyles = {
    'bottom-start': 'top-full left-0 mt-1',
    'bottom-end': 'top-full right-0 mt-1',
    'top-start': 'bottom-full left-0 mb-1',
    'top-end': 'bottom-full right-0 mb-1',
  };
  
  return (
    <div ref={dropdownRef} className={`relative inline-block ${className}`}>
      {/* Trigger */}
      {trigger ? (
        <div onClick={() => setIsOpen(!isOpen)}>
          {trigger}
        </div>
      ) : (
        <Button
          ref={triggerRef}
          onClick={() => setIsOpen(!isOpen)}
          rightIcon={<ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
          {...triggerProps}
        >
          {triggerProps?.children || 'Options'}
        </Button>
      )}
      
      {/* Menu */}
      {isOpen && (
        <div
          className={`
            absolute z-50 min-w-[12rem] py-1 bg-white rounded-lg shadow-lg border border-gray-200
            ${placementStyles[placement]}
            ${menuClassName}
          `}
          role="menu"
        >
          {items.map((item, index) => {
            if (item === 'divider') {
              return (
                <div
                  key={`divider-${index}`}
                  className="my-1 border-t border-gray-200"
                />
              );
            }
            
            const isDanger = item.danger || item.variant === 'danger';
            const isDisabled = item.disabled;
            
            return (
              <button
                key={item.key || item.id || `item-${index}`}
                onClick={() => handleItemClick(item)}
                disabled={isDisabled}
                className={`
                  w-full px-4 py-2 text-sm text-left flex items-center gap-3
                  transition-colors
                  ${isDanger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'}
                  ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
                role="menuitem"
              >
                {item.icon && (
                  <span className="flex-shrink-0">{item.icon}</span>
                )}
                <span className="flex-1">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Action Menu component (three dots menu)
export interface ActionMenuProps extends Omit<DropdownProps, 'trigger' | 'triggerProps'> {
  iconClassName?: string;
}

export const ActionMenu: React.FC<ActionMenuProps> = ({
  iconClassName = 'w-5 h-5',
  ...dropdownProps
}) => {
  return (
    <Dropdown
      {...dropdownProps}
      trigger={
        <button
          className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="More actions"
        >
          <MoreVertical className={iconClassName} />
        </button>
      }
      placement={dropdownProps.placement || 'bottom-end'}
    />
  );
};

// Multi-select dropdown component
export interface MultiSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface MultiSelectDropdownProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}

export const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select options...',
  label,
  error,
  disabled,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);
  
  const handleToggleOption = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter(v => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };
  
  const selectedLabels = options
    .filter(opt => value.includes(opt.value))
    .map(opt => opt.label);
  
  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full px-4 py-2 text-left border rounded-lg flex items-center justify-between
          transition-colors
          ${error ? 'border-red-300' : 'border-gray-300'}
          ${disabled ? 'bg-gray-50 cursor-not-allowed' : 'bg-white hover:border-gray-400'}
        `}
      >
        <span className={value.length === 0 ? 'text-gray-400' : 'text-gray-900'}>
          {value.length === 0
            ? placeholder
            : selectedLabels.length <= 2
            ? selectedLabels.join(', ')
            : `${selectedLabels.length} selected`}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
      
      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 py-1 bg-white rounded-lg shadow-lg border border-gray-200 max-h-60 overflow-auto">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => !option.disabled && handleToggleOption(option.value)}
              disabled={option.disabled}
              className={`
                w-full px-4 py-2 text-sm text-left flex items-center gap-3
                transition-colors
                ${option.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50 cursor-pointer'}
              `}
            >
              <div className="w-4 h-4 border rounded flex items-center justify-center">
                {value.includes(option.value) && (
                  <Check className="w-3 h-3 text-blue-600" />
                )}
              </div>
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};