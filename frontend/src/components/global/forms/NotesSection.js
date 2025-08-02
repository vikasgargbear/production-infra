import React from 'react';
import { FileText } from 'lucide-react';

/**
 * Global NotesSection Component
 * Reusable notes section for forms across the application
 */
const NotesSection = ({ 
  value = '',
  onChange,
  placeholder = "Add any additional notes or comments...",
  title = "Notes",
  rows = 3,
  required = false,
  maxLength = 1000,
  className = "",
  showCharacterCount = false
}) => {
  const handleChange = (e) => {
    if (onChange) {
      onChange(e.target.value);
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-5 h-5 text-gray-600" />
        <h3 className="text-lg font-semibold text-gray-900">
          {title}
          {required && <span className="text-red-500 ml-1">*</span>}
        </h3>
      </div>
      
      <textarea
        value={value}
        onChange={handleChange}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
      />
      
      {showCharacterCount && (
        <div className="flex justify-end mt-2">
          <span className="text-xs text-gray-500">
            {value.length}/{maxLength} characters
          </span>
        </div>
      )}
    </div>
  );
};

export default NotesSection;