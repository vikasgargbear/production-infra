import React, { ChangeEvent } from 'react';
import { Search, X } from 'lucide-react';

// ==================== TYPE DEFINITIONS ====================

export interface SearchBarProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    onClear?: () => void;
    disabled?: boolean;
}

// ==================== COMPONENT ====================

const SearchBar: React.FC<SearchBarProps> = ({
    value,
    onChange,
    placeholder = "Search...",
    className = "",
    onClear = undefined,
    disabled = false
}) => {
    const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
        onChange(e.target.value);
    };

    return (
        <div className={`relative ${className}`}>
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
                type="text"
                value={value}
                onChange={handleChange}
                placeholder={placeholder}
                disabled={disabled}
                className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            {value && onClear && (
                <button
                    onClick={onClear}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                    <X className="w-4 h-4" />
                </button>
            )}
        </div>
    );
};

export default SearchBar;
