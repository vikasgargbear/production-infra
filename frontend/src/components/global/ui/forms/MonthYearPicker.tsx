import React, { useState, useEffect, useRef, ChangeEvent, KeyboardEvent, FocusEvent } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

// ==================== TYPE DEFINITIONS ====================

export interface MonthYearPickerProps {
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    minDate?: Date | null;
    maxDate?: Date | null;
    className?: string;
}

// ==================== COMPONENT ====================

const MonthYearPicker: React.FC<MonthYearPickerProps> = ({
    value = '',
    onChange = () => { },
    placeholder = 'MM/YYYY',
    className = ''
}) => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [inputValue, setInputValue] = useState<string>('');
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
    const pickerRef = useRef<HTMLDivElement>(null);

    const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];

    useEffect(() => {
        if (value) {
            const parts = value.split('-');
            if (parts.length === 2) {
                setInputValue(`${parts[1]}/${parts[0]}`);
                setSelectedYear(parseInt(parts[0]));
                setSelectedMonth(parseInt(parts[1]) - 1);
            }
        }
    }, [value]);

    useEffect(() => {
        const handleClickOutside = (event: Event) => {
            if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
        let input = e.target.value;

        input = input.replace(/[^\d/]/g, '');

        if (input.length === 2 && !input.includes('/')) {
            input = input + '/';
        }

        if (input.length <= 7) {
            setInputValue(input);

            const match = input.match(/^(\d{2})\/(\d{4})$/);
            if (match) {
                const month = parseInt(match[1]);
                const year = parseInt(match[2]);

                if (month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
                    setSelectedMonth(month - 1);
                    setSelectedYear(year);
                    onChange(`${year}-${String(month).padStart(2, '0')}`);
                }
            }
        }
    };

    const handleInputBlur = (): void => {
        const match = inputValue.match(/^(\d{1,2})\/(\d{4})$/);
        if (match) {
            const month = parseInt(match[1]);
            const year = parseInt(match[2]);

            if (month >= 1 && month <= 12) {
                const formattedInput = `${String(month).padStart(2, '0')}/${year}`;
                setInputValue(formattedInput);
                onChange(`${year}-${String(month).padStart(2, '0')}`);
            }
        }
    };

    const selectMonth = (monthIndex: number): void => {
        setSelectedMonth(monthIndex);
        const month = monthIndex + 1;
        const formattedInput = `${String(month).padStart(2, '0')}/${selectedYear}`;
        setInputValue(formattedInput);
        onChange(`${selectedYear}-${String(month).padStart(2, '0')}`);
        setIsOpen(false);
    };

    const changeYear = (direction: number): void => {
        const newYear = selectedYear + direction;
        if (newYear >= 1900 && newYear <= 2100) {
            setSelectedYear(newYear);
        }
    };

    const getYearOptions = (): number[] => {
        const currentYear = new Date().getFullYear();
        const years: number[] = [];
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
                    onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === 'Tab') {
                            setIsOpen(false);
                        }
                    }}
                    placeholder={placeholder}
                    className={`w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all ${className}`}
                />
            </div>

            {isOpen && (
                <div className="absolute top-full mt-2 bg-white rounded-xl shadow-lg border border-gray-200 p-4 w-80" style={{ zIndex: 9999 }}>
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
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedYear(parseInt(e.target.value))}
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
