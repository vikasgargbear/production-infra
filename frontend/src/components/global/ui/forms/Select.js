import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';

/**
 * Select Component
 * A customizable dropdown select with search, multi-select, and grouping support
 * 
 * @param {Array} options - Array of options {value, label, group?, disabled?}
 * @param {Any} value - Selected value(s)
 * @param {Function} onChange - Change handler
 * @param {String} placeholder - Placeholder text
 * @param {Boolean} searchable - Enable search
 * @param {Boolean} multiple - Enable multi-select
 * @param {Boolean} clearable - Show clear button
 * @param {Boolean} disabled - Disabled state
 * @param {String} error - Error message
 * @param {String} label - Field label
 * @param {Boolean} required - Required field
 * @param {Function} renderOption - Custom option renderer
 * @param {String} className - Additional classes
 */
const Select = ({
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
  size = "md" // sm, md, lg
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter options based on search
  const filteredOptions = searchQuery
    ? options.filter(opt => 
        opt.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : options;

  // Group options if groups are present
  const groupedOptions = filteredOptions.reduce((acc, option) => {
    const group = option.group || 'default';
    if (!acc[group]) acc[group] = [];
    acc[group].push(option);
    return acc;
  }, {});

  // Get display value
  const getDisplayValue = () => {
    if (!value || (Array.isArray(value) && value.length === 0)) {
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

  // Handle option selection
  const handleSelect = (option) => {
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

  // Handle clear
  const handleClear = (e) => {
    e.stopPropagation();
    onChange(multiple ? [] : null);
  };

  // Check if option is selected
  const isSelected = (option) => {
    if (multiple && Array.isArray(value)) {
      return value.includes(option.value);
    }
    return value === option.value;
  };

  // Size classes
  const sizeClasses = {
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
      
      {/* Select Input */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`
          w-full border rounded-lg cursor-pointer
          flex items-center justify-between
          ${sizeClasses[size]}
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white hover:border-gray-400'}
          ${isOpen ? 'ring-2 ring-blue-500 border-blue-500' : 'border-gray-300'}
          ${error ? 'border-red-500' : ''}
        `}
      >
        <span className={`flex-1 truncate ${!value ? 'text-gray-400' : ''}`}>
          {getDisplayValue()}
        </span>
        
        <div className="flex items-center gap-1">
          {clearable && value && !disabled && (
            <X
              className="w-4 h-4 text-gray-400 hover:text-gray-600"
              onClick={handleClear}
            />
          )}
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform ${
              isOpen ? 'transform rotate-180' : ''
            }`}
          />
        </div>
      </div>

      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}

      {/* Dropdown */}
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
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              </div>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto">
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
                  {groupOptions.map((option, index) => (
                    <div
                      key={option.value}
                      onClick={() => handleSelect(option)}
                      className={`
                        px-3 py-2 cursor-pointer flex items-center justify-between
                        ${option.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}
                        ${isSelected(option) ? 'bg-blue-50' : ''}
                      `}
                    >
                      <div className="flex items-center gap-2">
                        {multiple && (
                          <input
                            type="checkbox"
                            checked={isSelected(option)}
                            onChange={() => {}}
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
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          {multiple && (
            <div className="px-3 py-2 border-t border-gray-200 flex justify-between">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onChange([]);
                }}
                className="text-sm text-gray-600 hover:text-gray-800"
              >
                Clear all
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                }}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
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