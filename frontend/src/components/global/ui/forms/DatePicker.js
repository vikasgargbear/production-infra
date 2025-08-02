import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * DatePicker Component
 * A customizable date picker with calendar view
 * 
 * @param {Date} value - Selected date
 * @param {Function} onChange - Change handler
 * @param {String} placeholder - Placeholder text
 * @param {Date} minDate - Minimum selectable date
 * @param {Date} maxDate - Maximum selectable date
 * @param {Boolean} disabled - Disabled state
 * @param {String} error - Error message
 * @param {String} label - Field label
 * @param {Boolean} required - Required field
 * @param {String} format - Date format (default: DD/MM/YYYY)
 * @param {Boolean} showToday - Show today button
 */
const DatePicker = ({
  value,
  onChange,
  placeholder = "Select date",
  minDate,
  maxDate,
  disabled = false,
  error,
  label,
  required = false,
  format = "DD/MM/YYYY",
  showToday = true,
  className = "",
  size = "md"
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(value ? new Date(value) : new Date());
  const dropdownRef = useRef(null);

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const daysOfWeek = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Format date for display
  const formatDate = (date) => {
    if (!date) return '';
    
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    
    if (format === 'DD/MM/YYYY') {
      return `${day}/${month}/${year}`;
    } else if (format === 'MM/DD/YYYY') {
      return `${month}/${day}/${year}`;
    } else if (format === 'YYYY-MM-DD') {
      return `${year}-${month}-${day}`;
    }
    
    return `${day}/${month}/${year}`;
  };

  // Get days in month
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    
    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add days of month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    
    return days;
  };

  // Check if date is disabled
  const isDateDisabled = (date) => {
    if (!date) return true;
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;
    return false;
  };

  // Check if date is selected
  const isDateSelected = (date) => {
    if (!date || !value) return false;
    return (
      date.getDate() === value.getDate() &&
      date.getMonth() === value.getMonth() &&
      date.getFullYear() === value.getFullYear()
    );
  };

  // Check if date is today
  const isToday = (date) => {
    if (!date) return false;
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  // Handle date selection
  const handleDateSelect = (date) => {
    if (!date || isDateDisabled(date)) return;
    onChange(date);
    setIsOpen(false);
  };

  // Handle month navigation
  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  // Handle today selection
  const selectToday = () => {
    const today = new Date();
    onChange(today);
    setCurrentMonth(today);
    setIsOpen(false);
  };

  // Size classes
  const sizeClasses = {
    sm: 'py-1.5 px-3 text-sm',
    md: 'py-2 px-3',
    lg: 'py-3 px-4 text-lg'
  };

  const days = getDaysInMonth(currentMonth);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      {/* Date Input */}
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
        <span className={`flex-1 ${!value ? 'text-gray-400' : ''}`}>
          {value ? formatDate(value) : placeholder}
        </span>
        <Calendar className="w-4 h-4 text-gray-400" />
      </div>

      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}

      {/* Calendar Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={goToPreviousMonth}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-sm font-medium">
              {months[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </div>
            <button
              onClick={goToNextMonth}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Days of Week */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {daysOfWeek.map(day => (
              <div
                key={day}
                className="text-xs font-medium text-gray-500 text-center py-1"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((date, index) => (
              <button
                key={index}
                onClick={() => handleDateSelect(date)}
                disabled={!date || isDateDisabled(date)}
                className={`
                  p-2 text-sm rounded
                  ${!date ? 'invisible' : ''}
                  ${isDateDisabled(date) ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-100'}
                  ${isDateSelected(date) ? 'bg-blue-500 text-white hover:bg-blue-600' : ''}
                  ${isToday(date) && !isDateSelected(date) ? 'border border-blue-500 text-blue-600' : ''}
                `}
              >
                {date?.getDate()}
              </button>
            ))}
          </div>

          {/* Today Button */}
          {showToday && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <button
                onClick={selectToday}
                className="w-full py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg font-medium"
              >
                Today
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DatePicker;