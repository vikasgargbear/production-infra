/**
 * ReturnInvoiceSelector Component
 * Invoice search and selection for sales returns
 * Optimized with React.memo
 */

import React from 'react';
import { FileText, ChevronRight } from 'lucide-react';
import { InvoiceSelector } from '../../global';
import type { ReturnInvoiceSelectorProps } from '../types/return.types';

export const ReturnInvoiceSelector = React.memo<ReturnInvoiceSelectorProps>(({
    selectedCustomer,
    selectedInvoice,
    onInvoiceSelect,
    onSkipInvoice,
    showInvoiceSection,
    invoiceSearchRef
}) => {
    // State to manage modal open - must be before any early returns
    const [showModal, setShowModal] = React.useState(false);

    if (!selectedCustomer || !showInvoiceSection) return null;

    // Handle invoice selection from modal
    const handleInvoiceSelect = (invoice: any) => {
        onInvoiceSelect(invoice);
    };

    return (
        <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
                    <FileText className="w-4 h-4 mr-2" />
                    INVOICE (Optional)
                </h3>
            </div>

            <div className="flex items-center space-x-3">
                <button
                    onClick={() => setShowModal(true)}
                    className="flex-1 px-4 py-3 text-left border border-gray-300 rounded-lg hover:border-blue-500 transition-colors"
                >
                    {selectedInvoice ? (
                        <span className="font-medium text-gray-900">
                            {selectedInvoice.invoice_number}
                        </span>
                    ) : (
                        <span className="text-gray-500">
                            Click to search invoice by number or date... (Ctrl+I)
                        </span>
                    )}
                </button>
                <button
                    onClick={onSkipInvoice}
                    className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center space-x-2"
                    title="Skip invoice and enter items manually"
                >
                    <span>Manual Entry</span>
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            {showModal && (
                <InvoiceSelector
                    customerId={String(selectedCustomer.customer_id)}
                    onSelect={handleInvoiceSelect}
                    onClose={() => setShowModal(false)}
                />
            )}

            {selectedInvoice && (
                <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                            <span className="font-medium text-gray-700">Invoice #:</span>{' '}
                            <span className="text-gray-900">{selectedInvoice.invoice_number}</span>
                        </div>
                        <div>
                            <span className="font-medium text-gray-700">Date:</span>{' '}
                            <span className="text-gray-900">
                                {new Date(selectedInvoice.invoice_date).toLocaleDateString('en-IN')}
                            </span>
                        </div>
                        <div>
                            <span className="font-medium text-gray-700">Amount:</span>{' '}
                            <span className="text-gray-900">₹{(selectedInvoice as any).final_amount?.toLocaleString('en-IN')}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

ReturnInvoiceSelector.displayName = 'ReturnInvoiceSelector';
