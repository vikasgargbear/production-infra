import React from 'react';
import { ArrowRight, ArrowLeft, CheckCircle } from 'lucide-react';

/**
 * Global Proceed to Review Component
 * Reusable component for footer action buttons across all templates
 * 
 * Props:
 * - currentStep: Current step number
 * - canProceed: Boolean to enable/disable proceed button
 * - onBack: Function to handle back action
 * - onProceed: Function to handle proceed action
 * - onReset: Function to handle reset action
 * - totalItems: Number of items
 * - totalAmount: Total amount
 * - proceedText: Text for proceed button (default: "Continue")
 * - resetText: Text for reset button (default: "Reset")
 * - backText: Text for back button (default: "Back to Edit")
 * - saving: Boolean to show saving state
 * - disabled: Boolean to disable buttons
 * - showTotals: Boolean to show/hide totals (default: true)
 * - className: Additional CSS classes
 */

const ProceedToReviewComponent = ({
  currentStep = 1,
  canProceed = false,
  onBack,
  onProceed,
  onReset,
  totalItems = 0,
  totalAmount = 0,
  proceedText,
  resetText = "Reset",
  backText = "Back to Edit",
  saving = false,
  disabled = false,
  showTotals = true,
  className = ""
}) => {
  // Default proceed text based on step
  const defaultProceedText = currentStep === 1 ? "Continue" : "Save";
  const finalProceedText = proceedText || defaultProceedText;

  return (
    <div className={`border-t border-gray-200 bg-white px-6 py-4 ${className}`}>
      <div className="flex justify-between items-center">
        {/* Left side - Totals or back button */}
        <div className="text-sm text-gray-600">
          {currentStep === 1 && showTotals ? (
            <>
              Total Items: {totalItems} | Total Amount: <span className="text-2xl font-bold text-gray-900">₹{totalAmount.toFixed(2)}</span>
            </>
          ) : currentStep > 1 && showTotals ? (
            <>
              Total Amount: <span className="text-2xl font-bold text-gray-900">₹{totalAmount.toFixed(2)}</span>
            </>
          ) : (
            <div></div>
          )}
        </div>
        
        {/* Right side - Action buttons */}
        <div className="flex items-center gap-3">
          {/* Back button - only show in step 2+ */}
          {currentStep > 1 && onBack && (
            <button
              onClick={onBack}
              disabled={disabled || saving}
              className="px-6 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              {backText}
            </button>
          )}

          {/* Reset button - only show in step 1 */}
          {currentStep === 1 && onReset && (
            <button
              onClick={onReset}
              disabled={disabled || saving}
              className="px-6 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resetText}
            </button>
          )}
          
          {/* Proceed button */}
          <button
            onClick={onProceed}
            disabled={!canProceed || disabled || saving}
            className="px-8 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Saving...</span>
              </>
            ) : currentStep === 1 ? (
              <>
                <span>{finalProceedText}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                <span>{finalProceedText}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProceedToReviewComponent;