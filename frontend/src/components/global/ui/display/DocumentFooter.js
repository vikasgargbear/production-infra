import React from 'react';
import { ArrowRight } from 'lucide-react';

/**
 * Standardized Document Footer Component
 * Provides consistent footer layout across all document types (Invoice, Challan, Sales Order, etc.)
 */
const DocumentFooter = ({
  totalItems = 0,
  totalAmount = 0,
  additionalInfo = null, // For freight, tax, etc.
  onCancel,
  onContinue,
  cancelLabel = "Cancel",
  continueLabel = "Continue",
  continueDisabled = false,
  continueButtonColor = "blue", // blue, purple, green, etc.
  showContinueButton = true,
  className = ""
}) => {
  const getButtonColorClasses = (color) => {
    switch (color) {
      case 'purple':
        return 'bg-purple-600 hover:bg-purple-700';
      case 'green':
        return 'bg-green-600 hover:bg-green-700';
      case 'orange':
        return 'bg-orange-600 hover:bg-orange-700';
      case 'red':
        return 'bg-red-600 hover:bg-red-700';
      default:
        return 'bg-blue-600 hover:bg-blue-700';
    }
  };

  return (
    <div className={`border-t border-blue-200 bg-white px-6 py-4 ${className}`}>
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-600">
            Items: <strong>{totalItems}</strong>
          </span>
          <span className="text-gray-600">
            Amount: <strong>₹{totalAmount.toFixed(2)}</strong>
          </span>
          {additionalInfo && (
            <span className="text-gray-600">
              {additionalInfo}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-6 py-2 text-blue-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {cancelLabel}
            </button>
          )}
          {showContinueButton && onContinue && (
            <button
              onClick={onContinue}
              disabled={continueDisabled}
              className={`px-6 py-2 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${getButtonColorClasses(continueButtonColor)}`}
            >
              {continueLabel}
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentFooter; 