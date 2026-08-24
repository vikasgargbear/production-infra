/**
 * DocumentFooter Component
 * Standardized footer for all document types (Invoice, Challan, Sales Order, etc.)
 */

import React, { useState, RefObject } from 'react';
import { ArrowRight, Save, Printer, Receipt } from 'lucide-react';
import {
    compareExactDecimals,
    formatExactCurrency,
    formatExactDecimal,
    type EditableDecimalValue,
} from '../../../../utils/exactDecimal';

// ==================== TYPE DEFINITIONS ====================

export interface DocumentFooterProps {
    // Amounts
    totalItems?: number;
    totalAmount?: EditableDecimalValue;
    subtotalAmount?: EditableDecimalValue;
    discountAmount?: EditableDecimalValue;
    deliveryCharges?: EditableDecimalValue;
    taxAmount?: EditableDecimalValue;
    roundOffAmount?: EditableDecimalValue;
    grandTotal?: EditableDecimalValue;
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
    saveDisabled?: boolean;
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
    saveDisabled = false,
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

    // Keep the main forward action visually identical in every document flow.
    // The legacy color prop remains accepted so existing callers do not break.
    const getButtonColorClasses = (_color: string): string =>
        'bg-blue-600 hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2';
    const positiveMoney = (value: EditableDecimalValue, label: string) =>
        compareExactDecimals(value, '0.00', label, { scale: 2, maximumWholeDigits: 20, allowNegative: true }) > 0;
    const nonZeroMoney = (value: EditableDecimalValue, label: string) =>
        compareExactDecimals(value, '0.00', label, { scale: 2, maximumWholeDigits: 20, allowNegative: true }) !== 0;

    return (
        <div className={`border-t border-gray-200 bg-white px-3 py-3 sm:px-6 ${className}`}>
            {showActionButtons ? (
                // Review page layout - single line like step 1
                <div className="flex min-h-[36px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-3 text-sm sm:gap-6">
                        {compareExactDecimals(totalItems, '0', 'Document item count', { scale: 6, maximumWholeDigits: 14 }) > 0 && (
                            <span className="text-gray-600">
                                Items: <strong>{formatExactDecimal(totalItems, 'Document item count', { scale: 6, maximumWholeDigits: 14 })}</strong>
                            </span>
                        )}
                        {additionalInfo && (
                            <span className="text-gray-600">{additionalInfo}</span>
                        )}
                        {positiveMoney(subtotalAmount, 'Document subtotal') && (
                            <span className="text-gray-600">
                                Sub Total: <strong>{formatExactCurrency(subtotalAmount, 'Document subtotal')}</strong>
                            </span>
                        )}
                        {positiveMoney(discountAmount, 'Document discount') && (
                            <span className="text-gray-600">
                                Discount: <strong>-{formatExactCurrency(discountAmount, 'Document discount')}</strong>
                            </span>
                        )}
                        {positiveMoney(deliveryCharges, 'Document delivery charges') && (
                            <span className="text-gray-600">
                                Delivery: <strong>+{formatExactCurrency(deliveryCharges, 'Document delivery charges')}</strong>
                            </span>
                        )}
                        {positiveMoney(taxAmount, 'Document tax') && (
                            <span className="text-gray-600">
                                Tax: <strong>{formatExactCurrency(taxAmount, 'Document tax')}</strong>
                            </span>
                        )}
                        {nonZeroMoney(roundOffAmount, 'Document round off') && (
                            <span className="text-gray-600">
                                Round Off: <strong>{formatExactCurrency(roundOffAmount, 'Document round off')}</strong>
                            </span>
                        )}
                        {positiveMoney(grandTotal, 'Document grand total') && (
                            <span className="text-lg font-semibold text-gray-900">
                                Total: <strong>{formatExactCurrency(grandTotal, 'Document grand total')}</strong>
                            </span>
                        )}
                    </div>

                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end sm:gap-3">
                        {/* Thermal Print button with dropdown */}
                        {onThermalPrint && (
                            <div className="relative">
                                <button
                                    onClick={() => setShowThermalOptions(!showThermalOptions)}
                                    className="min-h-11 px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg transition-colors flex items-center gap-2"
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
                                className="min-h-11 px-6 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg transition-colors flex items-center gap-2"
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
                                disabled={isSaving || saveDisabled}
                                className="min-h-11 flex-1 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2 disabled:bg-gray-300 disabled:text-gray-600 disabled:cursor-not-allowed font-medium sm:flex-none sm:px-8"
                            >
                                <Save className="w-5 h-5" />
                                {isSaving ? 'Generating...' : saveLabel}
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                // Standard layout for create/edit pages - optimized for speed
                <div className="flex min-h-[36px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

                    <div className="flex w-full items-center gap-2 sm:w-auto sm:gap-3">
                        {onCancel && (
                            <button
                                onClick={onCancel}
                                className="min-h-11 flex-1 px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors sm:flex-none sm:px-6"
                            >
                                {cancelLabel}
                            </button>
                        )}
                        {showContinueButton && onContinue && (
                            <button
                                onClick={onContinue}
                                disabled={continueDisabled}
                                className={`min-h-11 flex-1 justify-center px-4 py-2 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed sm:flex-none sm:px-6 ${getButtonColorClasses(continueButtonColor)}`}
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
