/**
 * ReturnReviewPanel Component
 * Final review and confirmation for sales returns
 * Optimized with React.memo
 */

import React, { useMemo } from 'react';
import { Save, Printer, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import CreditNotePreview from '../ui/CreditNotePreview';
import type { ReturnReviewPanelProps } from '../types/return.types';

export const ReturnReviewPanel = React.memo<ReturnReviewPanelProps>(({
    returnData,
    selectedCustomer,
    customerDues,
    onSave,
    onPrint,
    onBack,
    saving
}) => {
    const selectedItems = useMemo(() =>
        returnData.items.filter(item => item.selected && item.return_quantity > 0),
        [returnData.items]
    );

    const formatCurrency = (amount: number) => {
        return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    return (
        <div className="max-w-4xl mx-auto px-6 py-6">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Review Sales Return</h2>
                    <p className="text-sm text-gray-600 mt-1">
                        Please verify all details before submitting
                    </p>
                </div>
                <button
                    onClick={onBack}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors flex items-center space-x-2"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Edit</span>
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="text-sm text-blue-600 font-medium">Return Amount</div>
                    <div className="text-2xl font-bold text-blue-900 mt-1">
                        {formatCurrency(returnData.total_amount)}
                    </div>
                </div>
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <div className="text-sm text-green-600 font-medium">Items Returned</div>
                    <div className="text-2xl font-bold text-green-900 mt-1">
                        {selectedItems.length}
                    </div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                    <div className="text-sm text-purple-600 font-medium">Outstanding</div>
                    <div className="text-2xl font-bold text-purple-900 mt-1">
                        {formatCurrency(customerDues)}
                    </div>
                </div>
            </div>

            {/* Return Details */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Return Details</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span className="font-medium text-gray-700">Return Number:</span>{' '}
                        <span className="text-gray-900">{returnData.return_no}</span>
                    </div>
                    <div>
                        <span className="font-medium text-gray-700">Return Date:</span>{' '}
                        <span className="text-gray-900">
                            {new Date(returnData.return_date).toLocaleDateString('en-IN')}
                        </span>
                    </div>
                    <div>
                        <span className="font-medium text-gray-700">Customer:</span>{' '}
                        <span className="text-gray-900">{(selectedCustomer as any)?.customer_name || (selectedCustomer as any)?.name}</span>
                    </div>
                    <div>
                        <span className="font-medium text-gray-700">Invoice:</span>{' '}
                        <span className="text-gray-900">{returnData.invoice_number || 'Manual Entry'}</span>
                    </div>
                    <div>
                        <span className="font-medium text-gray-700">Return Reason:</span>{' '}
                        <span className="text-gray-900">{returnData.return_reason}</span>
                    </div>
                    <div>
                        <span className="font-medium text-gray-700">Return Method:</span>{' '}
                        <span className="text-gray-900 capitalize">{returnData.return_method.replace('_', ' ')}</span>
                    </div>
                </div>
            </div>

            {/* Items Summary */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Items Summary</h3>
                <div className="space-y-2">
                    {selectedItems.map((item, index) => (
                        <div key={index} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                            <div className="flex-1">
                                <div className="font-medium text-gray-900">{item.product_name}</div>
                                <div className="text-sm text-gray-500">
                                    Qty: {item.return_quantity} {item.unit} | Batch: {item.batch_number}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="font-medium text-gray-900">
                                    {formatCurrency(item.return_quantity * item.unit_price * (1 + item.tax_percent / 100))}
                                </div>
                                <div className="text-sm text-gray-500">
                                    @{formatCurrency(item.unit_price)} + {item.tax_percent}% tax
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Totals */}
                <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Subtotal:</span>
                        <span className="text-gray-900">{formatCurrency(returnData.subtotal_amount)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Tax Amount:</span>
                        <span className="text-gray-900">{formatCurrency(returnData.tax_amount)}</span>
                    </div>
                    <div className="flex items-center justify-between text-lg font-bold border-t border-gray-200 pt-2">
                        <span className="text-gray-900">Total Return Amount:</span>
                        <span className="text-blue-600">{formatCurrency(returnData.total_amount)}</span>
                    </div>
                </div>
            </div>

            {/* Credit Note Preview */}
            {returnData.return_method === 'credit_note' && selectedCustomer && (
                <div className="mb-6">
                    <CreditNotePreview
                        returnData={returnData}
                        customer={selectedCustomer}
                    />
                </div>
            )}

            {/* Verification Checklist */}
            <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200 mb-6">
                <div className="flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <h4 className="font-medium text-yellow-900 mb-2">Pre-submission Checklist</h4>
                        <ul className="text-sm text-yellow-800 space-y-1">
                            <li className="flex items-center space-x-2">
                                <CheckCircle className="w-4 h-4 text-yellow-600" />
                                <span>All return quantities are correct</span>
                            </li>
                            <li className="flex items-center space-x-2">
                                <CheckCircle className="w-4 h-4 text-yellow-600" />
                                <span>Return reason is accurately selected</span>
                            </li>
                            <li className="flex items-center space-x-2">
                                <CheckCircle className="w-4 h-4 text-yellow-600" />
                                <span>Customer and invoice details are verified</span>
                            </li>
                            <li className="flex items-center space-x-2">
                                <CheckCircle className="w-4 h-4 text-yellow-600" />
                                <span>Batch information is correct (for pharma compliance)</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end space-x-3">
                <button
                    onClick={onPrint}
                    disabled={saving}
                    className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Printer className="w-4 h-4" />
                    <span>Print Preview</span>
                </button>
                <button
                    onClick={onSave}
                    disabled={saving}
                    className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {saving ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Creating Return...</span>
                        </>
                    ) : (
                        <>
                            <Save className="w-4 h-4" />
                            <span>Confirm Return</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
});

ReturnReviewPanel.displayName = 'ReturnReviewPanel';
