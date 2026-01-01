import React from 'react';
import { FileText } from 'lucide-react';

/**
 * NotesSection - A reusable component for adding notes/remarks to documents
 * Used across invoices, orders, purchase flows, credit/debit notes, etc.
 */

interface NotesSectionProps {
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    label?: string;
    maxLength?: number;
    rows?: number;
    disabled?: boolean;
    className?: string;
}

const NotesSection: React.FC<NotesSectionProps> = ({
    value = '',
    onChange,
    placeholder = 'Add notes or remarks...',
    label = 'Notes / Remarks',
    maxLength = 500,
    rows = 3,
    disabled = false,
    className = ''
}) => {
    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        if (onChange) {
            onChange(e.target.value);
        }
    };

    return (
        <div className={`bg-white border border-gray-200 rounded-lg p-4 ${className}`}>
            <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-gray-500" />
                <label className="text-sm font-medium text-gray-700">{label}</label>
                {maxLength && (
                    <span className="ml-auto text-xs text-gray-400">
                        {value.length}/{maxLength}
                    </span>
                )}
            </div>
            <textarea
                value={value}
                onChange={handleChange}
                placeholder={placeholder}
                maxLength={maxLength}
                rows={rows}
                disabled={disabled}
                className={`
          w-full px-3 py-2 text-sm
          border border-gray-300 rounded-lg
          focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          disabled:bg-gray-100 disabled:cursor-not-allowed
          resize-none
          transition-colors duration-200
        `}
            />
        </div>
    );
};

export default NotesSection;
