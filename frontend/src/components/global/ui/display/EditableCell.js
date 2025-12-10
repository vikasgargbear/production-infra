import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

/**
 * EditableCell Component - Keyboard-navigable editable cell
 * Supports Tab, Enter, Arrow keys for navigation
 * Similar to Excel/Marg software experience
 */
const EditableCell = forwardRef(({ 
  value,
  type = 'number',
  onSave,
  onChange, // NEW: Fires on every keystroke for real-time updates
  onNavigate, // (direction: 'up'|'down'|'left'|'right'|'next') => void
  readOnly = false,
  min = 0,
  max,
  step = 1,
  suffix = '', // '%', '₹', etc.
  prefix = '',
  placeholder = '0',
  className = '',
  selectOnFocus = true,
  allowNegative = false,
  decimalPlaces = 2,
  onFocus: onFocusProp,
  onBlur: onBlurProp
}, ref) => {
  const [localValue, setLocalValue] = useState(value);
  const [isEditing, setIsEditing] = useState(false);
  const [originalValue, setOriginalValue] = useState(value);
  const inputRef = useRef(null);

  // Update local value when prop changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Expose focus method to parent
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
    setValue: (val) => setLocalValue(val)
  }));

  const formatValue = (val) => {
    if (type === 'number') {
      const num = parseFloat(val);
      if (isNaN(num)) return '';
      return num.toFixed(decimalPlaces);
    }
    return val;
  };

  const handleSave = (val) => {
    let processedValue = val;
    
    if (type === 'number') {
      // Clean and parse number
      const cleaned = val.toString().replace(/[^0-9.-]/g, '');
      let num = parseFloat(cleaned);
      
      if (isNaN(num)) {
        num = 0;
      }
      
      // Apply constraints
      if (!allowNegative && num < 0) num = 0;
      if (min !== undefined && num < min) num = min;
      if (max !== undefined && num > max) num = max;
      
      processedValue = num;
    }
    
    setLocalValue(processedValue);
    
    // Always save - let parent decide if it needs to update
    // Fire both onChange (for real-time calc) and onSave (for state update)
    if (onChange) {
      onChange(processedValue);
    }
    if (onSave && processedValue !== originalValue) {
      onSave(processedValue);
      setOriginalValue(processedValue);
    }
  };

  const handleKeyDown = (e) => {
    if (readOnly) return;

    switch(e.key) {
      case 'Enter':
        e.preventDefault();
        handleSave(localValue);
        setIsEditing(false);
        if (onNavigate) {
          onNavigate('next'); // Move to next field
        }
        break;
        
      case 'Tab':
        e.preventDefault();
        handleSave(localValue);
        setIsEditing(false);
        if (onNavigate) {
          onNavigate(e.shiftKey ? 'left' : 'right');
        }
        break;
        
      case 'ArrowDown':
        // Only navigate if not editing text at the moment
        if (!e.shiftKey && !e.ctrlKey) {
          e.preventDefault();
          handleSave(localValue);
          setIsEditing(false);
          if (onNavigate) {
            onNavigate('down');
          }
        }
        break;
        
      case 'ArrowUp':
        if (!e.shiftKey && !e.ctrlKey) {
          e.preventDefault();
          handleSave(localValue);
          setIsEditing(false);
          if (onNavigate) {
            onNavigate('up');
          }
        }
        break;
        
      case 'Escape':
        e.preventDefault();
        // Restore original value
        setLocalValue(originalValue);
        setIsEditing(false);
        if (inputRef.current) {
          inputRef.current.blur();
        }
        break;
        
      default:
        break;
    }
  };

  const handleFocus = (e) => {
    setIsEditing(true);
    setOriginalValue(localValue);
    
    if (selectOnFocus) {
      // Select all text for easy override
      setTimeout(() => {
        e.target.select();
      }, 0);
    }
    
    if (onFocusProp) {
      onFocusProp(e);
    }
  };

  const handleBlur = (e) => {
    handleSave(localValue);
    setIsEditing(false);
    
    if (onBlurProp) {
      onBlurProp(e);
    }
  };

  const handleChange = (e) => {
    const val = e.target.value;
    
    if (type === 'number') {
      // Allow typing numbers, decimal point, and minus
      const cleaned = val.replace(/[^0-9.-]/g, '');
      setLocalValue(cleaned);
      
      // DON'T fire onChange immediately - only fire on blur/enter
      // This prevents flickering/jumping when user is typing
      // The parent state update causes re-render which interferes with typing
    } else {
      setLocalValue(val);
      if (onChange) {
        onChange(val);
      }
    }
  };

  const displayValue = type === 'number' && !isEditing 
    ? formatValue(localValue)
    : localValue;

  return (
    <div className={`relative flex items-center ${className}`}>
      {prefix && (
        <span className="text-gray-600 mr-1 text-sm">{prefix}</span>
      )}
      
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
      
      {suffix && (
        <span className="text-gray-600 ml-1 text-sm">{suffix}</span>
      )}
    </div>
  );
});

EditableCell.displayName = 'EditableCell';

export default EditableCell;
