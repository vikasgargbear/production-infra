import React, { forwardRef, useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input, InputProps } from './Input';

export interface DatePickerProps extends Omit<InputProps, 'type' | 'value' | 'onChange'> {
  value?: Date | string | null;
  onChange?: (date: Date | null) => void;
  minDate?: Date | string;
  maxDate?: Date | string;
  dateFormat?: string;
  showCalendarIcon?: boolean;
  disabledDates?: (date: Date) => boolean;
  highlightedDates?: Date[];
  locale?: string;
}

const formatDate = (date: Date | string | null, format = 'yyyy-MM-dd'): string => {
  if (!date) return '';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  // Simple format replacement
  return format
    .replace('yyyy', String(year))
    .replace('MM', month)
    .replace('dd', day);
};

const parseDate = (dateString: string): Date | null => {
  if (!dateString) return null;
  
  // Try parsing ISO format first
  const date = new Date(dateString);
  if (!isNaN(date.getTime())) return date;
  
  // Try parsing common formats
  const parts = dateString.split(/[-/]/);
  if (parts.length === 3) {
    // Assume yyyy-mm-dd or dd/mm/yyyy
    const year = parts[0].length === 4 ? parseInt(parts[0]) : parseInt(parts[2]);
    const month = parseInt(parts[1]) - 1;
    const day = parts[0].length === 4 ? parseInt(parts[2]) : parseInt(parts[0]);
    
    const parsed = new Date(year, month, day);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  
  return null;
};

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(({
  value,
  onChange,
  minDate,
  maxDate,
  dateFormat = 'yyyy-MM-dd',
  showCalendarIcon = true,
  disabledDates,
  highlightedDates = [],
  locale = 'en-US',
  disabled,
  ...inputProps
}, ref) => {
  const [showCalendar, setShowCalendar] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const calendarRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Convert value to Date object
  const selectedDate = value ? (typeof value === 'string' ? parseDate(value) : value) : null;
  
  // Update input value when prop changes
  useEffect(() => {
    setInputValue(formatDate(selectedDate, dateFormat));
  }, [selectedDate, dateFormat]);
  
  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowCalendar(false);
      }
    };
    
    if (showCalendar) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCalendar]);
  
  // Calendar navigation
  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };
  
  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };
  
  // Get days in month
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days: (Date | null)[] = [];
    
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
  const isDateDisabled = (date: Date) => {
    if (disabled) return true;
    if (disabledDates && disabledDates(date)) return true;
    
    if (minDate) {
      const min = typeof minDate === 'string' ? new Date(minDate) : minDate;
      if (date < min) return true;
    }
    
    if (maxDate) {
      const max = typeof maxDate === 'string' ? new Date(maxDate) : maxDate;
      if (date > max) return true;
    }
    
    return false;
  };
  
  // Check if date is highlighted
  const isDateHighlighted = (date: Date) => {
    return highlightedDates.some(
      highlighted => highlighted.toDateString() === date.toDateString()
    );
  };
  
  // Handle date selection
  const handleDateSelect = (date: Date) => {
    if (!isDateDisabled(date)) {
      onChange?.(date);
      setShowCalendar(false);
    }
  };
  
  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    
    const parsed = parseDate(value);
    if (parsed && !isDateDisabled(parsed)) {
      onChange?.(parsed);
      setCurrentMonth(parsed);
    }
  };
  
  // Handle input blur
  const handleInputBlur = () => {
    // Reformat the input value if it's a valid date
    const parsed = parseDate(inputValue);
    if (parsed) {
      setInputValue(formatDate(parsed, dateFormat));
    } else if (inputValue) {
      // Reset to previous valid value
      setInputValue(formatDate(selectedDate, dateFormat));
    }
  };
  
  const days = getDaysInMonth(currentMonth);
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={ref}
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        onFocus={() => setShowCalendar(true)}
        disabled={disabled}
        rightIcon={showCalendarIcon && <Calendar className="w-5 h-5" />}
        {...inputProps}
      />
      
      {showCalendar && !disabled && (
        <div
          ref={calendarRef}
          className="absolute z-50 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 p-3"
        >
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={goToPreviousMonth}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <h3 className="text-sm font-medium">
              {currentMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
            </h3>
            
            <button
              type="button"
              onClick={goToNextMonth}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          
          {/* Week days */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {weekDays.map(day => (
              <div
                key={day}
                className="text-xs font-medium text-gray-500 text-center py-1"
              >
                {day}
              </div>
            ))}
          </div>
          
          {/* Calendar days */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((date, index) => {
              if (!date) {
                return <div key={`empty-${index}`} className="w-8 h-8" />;
              }
              
              const isSelected = selectedDate && 
                date.toDateString() === selectedDate.toDateString();
              const isToday = date.toDateString() === new Date().toDateString();
              const isDisabled = isDateDisabled(date);
              const isHighlighted = isDateHighlighted(date);
              
              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  onClick={() => handleDateSelect(date)}
                  disabled={isDisabled}
                  className={`
                    w-8 h-8 text-sm rounded flex items-center justify-center
                    ${isSelected ? 'bg-blue-600 text-white' : ''}
                    ${!isSelected && isToday ? 'bg-gray-100 font-semibold' : ''}
                    ${!isSelected && isHighlighted ? 'bg-blue-100 text-blue-700' : ''}
                    ${!isSelected && !isToday && !isHighlighted ? 'hover:bg-gray-100' : ''}
                    ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          
          {/* Today button */}
          <div className="mt-3 pt-3 border-t border-gray-200">
            <button
              type="button"
              onClick={() => handleDateSelect(new Date())}
              className="w-full text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

DatePicker.displayName = 'DatePicker';