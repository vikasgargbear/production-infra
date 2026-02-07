/**
 * DocumentFooter Component
 * Standardized footer for all document types (Invoice, Challan, Sales Order, etc.)
 */

import React, { useState, RefObject } from 'react';
import { ArrowRight, Save, Printer, Receipt } from 'lucide-react';

// ==================== TYPE DEFINITIONS ====================

export interface DocumentFooterProps {
    // Amounts
    totalItems?: number;
    totalAmount?: number;
    subtotalAmount?: number;
    discountAmount?: number;
    deliveryCharges?: number;
    taxAmount?: number;
    roundOffAmount?: number;
    grandTotal?: number;
    additionalInfo?: React.ReactNode;

    // Actions - all optional for flexibility
    onCancel?: () => void;
    onContinue?: () => void;
    onSave?: () => void;
    onPrint?: () => void;
    onThermalPrint?: (size?: string) => void;
    onGenerate?: () => void;
    onWhatsApp?: () => void;

    // State
    isSaving?: boolean;
    customerPhone?: string | null;

    // Labels
    cancelLabel?: string;
    continueLabel?: string;
    saveLabel?: string;
    generateLabel?: string;

    // UI Options
    continueDisabled?: boolean;
    continueButtonColor?: 'blue' | 'purple' | 'green' | 'orange' | 'red';
    showContinueButton?: boolean;
    showActionButtons?: boolean;
    showPrintOptions?: boolean;
    showSaveOption?: boolean;
    saveButtonRef?: RefObject<HTMLButtonElement>;
    className?: string;
    documentType?: string;
}

// ==================== COMPONENT ====================

const DocumentFooter: React.FC<DocumentFooterProps> = ({
    totalItems = 0,
    totalAmount = 0,
    subtotalAmount = 0,
    discountAmount = 0,
    deliveryCharges = 0,
    taxAmount = 0,
    roundOffAmount = 0,
    grandTotal = 0,
    additionalInfo = null,
    onCancel,
    onContinue,
    onSave,
    onPrint,
    onThermalPrint,
    onWhatsApp,
    isSaving = false,
    customerPhone = null,
    cancelLabel = "Cancel",
    continueLabel = "Continue",
    saveLabel = "Generate Invoice",
    continueDisabled = false,
    continueButtonColor = "blue",
    showContinueButton = true,
    showActionButtons = false,
    saveButtonRef = null,
    className = ""
}) => {
    const [showThermalOptions, setShowThermalOptions] = useState(false);

    const getButtonColorClasses = (color: string): string => {
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
            {showActionButtons ? (
                // Review page layout - single line like step 1
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-6 text-sm">
                        {totalItems > 0 && (
                            <span className="text-gray-600">
                                Items: <strong>{totalItems}</strong>
                            </span>
                        )}
                        {subtotalAmount > 0 && (
                            <span className="text-gray-600">
                                Sub Total: <strong>₹{subtotalAmount.toFixed(2)}</strong>
                            </span>
                        )}
                        {discountAmount > 0 && (
                            <span className="text-gray-600">
                                Discount: <strong>-₹{discountAmount.toFixed(2)}</strong>
                            </span>
                        )}
                        {deliveryCharges > 0 && (
                            <span className="text-gray-600">
                                Delivery: <strong>+₹{deliveryCharges.toFixed(2)}</strong>
                            </span>
                        )}
                        {taxAmount > 0 && (
                            <span className="text-gray-600">
                                Tax: <strong>₹{taxAmount.toFixed(2)}</strong>
                            </span>
                        )}
                        {roundOffAmount !== 0 && (
                            <span className="text-gray-600">
                                Round Off: <strong>{roundOffAmount >= 0 ? '+' : '-'}₹{Math.abs(roundOffAmount).toFixed(2)}</strong>
                            </span>
                        )}
                        {grandTotal > 0 && (
                            <span className="text-lg font-semibold text-gray-900">
                                Total: <strong>₹{grandTotal.toFixed(2)}</strong>
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Thermal Print button with dropdown */}
                        {onThermalPrint && (
                            <div className="relative">
                                <button
                                    onClick={() => setShowThermalOptions(!showThermalOptions)}
                                    className="px-4 py-2.5 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
                                >
                                    <Receipt className="w-4 h-4" />
                                    Thermal Print
                                </button>
                                {showThermalOptions && (
                                    <div className="absolute bottom-full mb-2 right-0 bg-white rounded-lg shadow-xl border border-gray-200 p-2 z-50 min-w-[150px]">
                                        <button
                                            onClick={() => {
                                                onThermalPrint('80mm');
                                                setShowThermalOptions(false);
                                            }}
                                            className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm"
                                        >
                                            80mm Width
                                        </button>
                                        <button
                                            onClick={() => {
                                                onThermalPrint('58mm');
                                                setShowThermalOptions(false);
                                            }}
                                            className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm"
                                        >
                                            58mm Width
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Digital/Color Print button */}
                        {onPrint && (
                            <button
                                onClick={onPrint}
                                className="px-6 py-2.5 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                                <Printer className="w-4 h-4" />
                                Print
                            </button>
                        )}

                        {/* Generate Invoice button (right, primary) */}
                        {onSave && (
                            <button
                                ref={saveButtonRef}
                                onClick={onSave}
                                disabled={isSaving}
                                className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm"
                            >
                                <Save className="w-5 h-5" />
                                {isSaving ? 'Generating...' : saveLabel}
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
                                className="px-6 py-2.5 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                            >
                                {cancelLabel}
                            </button>
                        )}
                        {showContinueButton && onContinue && (
                            <button
                                onClick={onContinue}
                                disabled={continueDisabled}
                                className={`px-6 py-2.5 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${getButtonColorClasses(continueButtonColor)}`}
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
