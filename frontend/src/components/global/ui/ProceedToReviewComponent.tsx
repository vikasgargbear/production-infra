import React from 'react';
import { ArrowRight, ArrowLeft, CheckCircle } from 'lucide-react';

// ==================== TYPE DEFINITIONS ====================

export interface ProceedToReviewComponentProps {
    currentStep?: number;
    canProceed?: boolean;
    onBack?: () => void;
    onProceed?: () => void;
    onReset?: () => void;
    totalItems?: number;
    totalAmount?: number | string;
    proceedText?: string;
    resetText?: string;
    backText?: string;
    saving?: boolean;
    disabled?: boolean;
    showTotals?: boolean;
    className?: string;
}

// ==================== COMPONENT ====================

/**
 * Global Proceed to Review Component
 * Reusable component for footer action buttons across all templates
 */
const ProceedToReviewComponent: React.FC<ProceedToReviewComponentProps> = ({
    currentStep = 1,
    canProceed = false,
    onBack,
    onProceed,
    onReset,
    totalItems = 0,
    totalAmount = 0,
    proceedText,
    resetText = "Reset",
    backText = "Back",
    saving = false,
    disabled = false,
    showTotals = true,
    className = ""
}) => {
    const defaultProceedText = currentStep === 1 ? "Continue" : "Save";
    const finalProceedText = proceedText || defaultProceedText;
    const formattedTotalAmount = typeof totalAmount === 'string'
        ? totalAmount
        : totalAmount.toFixed(2);

    return (
        <div data-testid="erp-action-footer" className={`erp-action-footer ${className}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {/* Left side - Totals or back button */}
                <div className="min-w-0 text-sm text-gray-600">
                    {currentStep === 1 && showTotals ? (
                        <>
                            <span className="mr-2 whitespace-nowrap">{totalItems} item{totalItems === 1 ? '' : 's'}</span>
                            <span className="whitespace-nowrap">Total <strong className="text-lg text-gray-900 sm:text-2xl">₹{formattedTotalAmount}</strong></span>
                        </>
                    ) : currentStep > 1 && showTotals ? (
                        <>
                            Total <strong className="text-lg text-gray-900 sm:text-2xl">₹{formattedTotalAmount}</strong>
                        </>
                    ) : (
                        <div></div>
                    )}
                </div>

                {/* Right side - Action buttons */}
                <div className="flex w-full items-center gap-2 sm:w-auto sm:gap-3">
                    {/* Back button - only show in step 2+ */}
                    {currentStep > 1 && onBack && (
                        <button
                            onClick={onBack}
                            disabled={disabled || saving}
                            className="erp-secondary-action min-w-11 flex-1 gap-2 sm:flex-none sm:px-6"
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
                            className="erp-secondary-action min-w-11 flex-1 sm:flex-none sm:px-6"
                        >
                            {resetText}
                        </button>
                    )}

                    {/* Proceed button */}
                    <button
                        onClick={onProceed}
                        disabled={!canProceed || disabled || saving}
                        className="erp-primary-action min-w-0 flex-[2] gap-2 sm:flex-none sm:px-8"
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
