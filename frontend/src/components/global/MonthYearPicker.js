import React, { useState, useEffect, useRef } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

const MonthYearPicker = ({ 
  value = '', 
  onChange = () => {}, 
  placeholder = 'MM/YYYY',
  minDate = null,
  maxDate = null,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const pickerRef = useRef(null);

  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  // Initialize input value from prop
  useEffect(() => {
    if (value) {
      // Convert YYYY-MM to MM/YYYY for display
      const parts = value.split('-');
      if (parts.length === 2) {
        setInputValue(`${parts[1]}/${parts[0]}`);
        setSelectedYear(parseInt(parts[0]));
        setSelectedMonth(parseInt(parts[1]) - 1);
      }
    }
  }, [value]);

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle manual input
  const handleInputChange = (e) => {
    let input = e.target.value;
    
    // Remove any non-digit characters except /
    input = input.replace(/[^\d/]/g, '');
    
    // Auto-insert slash after 2 digits
    if (input.length === 2 && !input.includes('/')) {
      input = input + '/';
    }
    
    // Limit to MM/YYYY format
    if (input.length <= 7) {
      setInputValue(input);
      
      // Parse if complete
      const match = input.match(/^(\d{2})\/(\d{4})$/);
      if (match) {
        const month = parseInt(match[1]);
        const year = parseInt(match[2]);
        
        if (month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
          setSelectedMonth(month - 1);
          setSelectedYear(year);
          // Convert to YYYY-MM format for the onChange callback
          onChange(`${year}-${String(month).padStart(2, '0')}`);
        }
      }
    }
  };

  // Handle blur - validate and format
  const handleInputBlur = () => {
    const match = inputValue.match(/^(\d{1,2})\/(\d{4})$/);
    if (match) {
      const month = parseInt(match[1]);
      const year = parseInt(match[2]);
      
      if (month >= 1 && month <= 12) {
        // Format with leading zero
        const formattedInput = `${String(month).padStart(2, '0')}/${year}`;
        setInputValue(formattedInput);
        onChange(`${year}-${String(month).padStart(2, '0')}`);
      }
    }
  };

  // Handle month selection
  const selectMonth = (monthIndex) => {
    setSelectedMonth(monthIndex);
    const month = monthIndex + 1;
    const formattedInput = `${String(month).padStart(2, '0')}/${selectedYear}`;
    setInputValue(formattedInput);
    onChange(`${selectedYear}-${String(month).padStart(2, '0')}`);
    setIsOpen(false);
  };

  // Navigate years
  const changeYear = (direction) => {
    const newYear = selectedYear + direction;
    if (newYear >= 1900 && newYear <= 2100) {
      setSelectedYear(newYear);
    }
  };

  // Get year range for dropdown
  const getYearOptions = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let year = currentYear + 10; year >= currentYear - 50; year--) {
      years.push(year);
    }
    return years;
  };

  return (
    <div className="relative" ref={pickerRef}>
      <div className="relative">
        <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onFocus={() => setIsOpen(true)}
          onClick={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              setIsOpen(false);
            }
          }}
          placeholder={placeholder}
          className={`w-full pl-10 pr-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 transition-all ${className}`}
        />
      </div>

      {/* Calendar Picker */}
      {isOpen && (
        <div className="absolute z-50 top-full mt-2 bg-white rounded-xl shadow-lg border border-gray-200 p-4 w-80">
          {/* Year selector */}
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => changeYear(-1)}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="px-3 py-1 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              {getYearOptions().map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            
            <button
              type="button"
              onClick={() => changeYear(1)}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-3 gap-2">
            {months.map((month, index) => (
              <button
                key={month}
                type="button"
                onClick={() => selectMonth(index)}
                className={`
                  py-2 px-3 rounded-lg text-sm font-medium transition-all
                  ${selectedMonth === index && selectedYear === parseInt(value?.split('-')[0])
                    ? 'bg-green-500 text-white'
                    : 'hover:bg-gray-100 text-gray-700'
                  }
                `}
              >
                {month}
              </button>
            ))}
          </div>

          {/* Quick actions */}
          <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between">
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                selectMonth(now.getMonth());
                setSelectedYear(now.getFullYear());
              }}
              className="text-sm text-green-600 hover:text-green-700 font-medium"
            >
              Current Month
            </button>
            
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MonthYearPicker;