import React from 'react';
import { ArrowRight, Save, MessageCircle, Printer } from 'lucide-react';

/**
 * Standardized Document Footer Component
 * Provides consistent footer layout across all document types (Invoice, Challan, Sales Order, etc.)
 */
const DocumentFooter = ({
  totalItems = 0,
  totalAmount = 0,
  subtotalAmount = 0,
  taxAmount = 0,
  roundOffAmount = 0,
  grandTotal = 0,
  additionalInfo = null, // For freight, tax, etc.
  onCancel,
  onContinue,
  onSave,
  onPrint,
  onWhatsApp,
  isSaving = false,
  customerPhone = null,
  cancelLabel = "Cancel",
  continueLabel = "Continue",
  continueDisabled = false,
  continueButtonColor = "blue", // blue, purple, green, etc.
  showContinueButton = true,
  showActionButtons = false, // Show save/print/whatsapp buttons
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
      {showActionButtons && (subtotalAmount > 0 || grandTotal > 0) ? (
        // Review page layout - single line like step 1
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-6 text-sm">
            <span className="text-gray-600">
              Items: <strong>{totalItems}</strong>
            </span>
            <span className="text-gray-600">
              Sub Total: <strong>₹{subtotalAmount.toFixed(2)}</strong>
            </span>
            <span className="text-gray-600">
              Tax: <strong>₹{taxAmount.toFixed(2)}</strong>
            </span>
            {roundOffAmount !== 0 && (
              <span className="text-gray-600">
                Round Off: <strong>₹{roundOffAmount.toFixed(2)}</strong>
              </span>
            )}
            <span className="text-lg font-semibold text-gray-900">
              Total: <strong>₹{grandTotal.toFixed(2)}</strong>
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Print button first (left) */}
            {onPrint && (
              <button
                onClick={onPrint}
                className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
            )}
            
            {/* Generate Invoice button (right, primary) */}
            {onSave && (
              <button
                onClick={onSave}
                disabled={isSaving}
                className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm"
              >
                <Save className="w-5 h-5" />
                {isSaving ? 'Generating...' : 'Generate Invoice'}
              </button>
            )}
          </div>
        </div>
      ) : (
        // Standard layout for create/edit pages - optimized for speed
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4 text-sm">
            {totalItems > 0 && (
              <span className="text-gray-600">
                <strong>{totalItems}</strong> {totalItems === 1 ? 'item' : 'items'} added
              </span>
            )}
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
      )}
    </div>
  );
};

export default DocumentFooter; 