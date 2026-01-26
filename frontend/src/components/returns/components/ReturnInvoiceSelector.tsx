/**
 * ReturnInvoiceSelector Component
 * Inline invoice search for sales returns - uses InvoiceSearch pattern
 * Follows CustomerSearch inline pattern for consistent UX
 */

import React from 'react';
import { FileText, ChevronRight } from 'lucide-react';
import { InvoiceSearch } from '../../global';
import type { ReturnInvoiceSelectorProps } from '../types/return.types';

export const ReturnInvoiceSelector = React.memo<ReturnInvoiceSelectorProps>(({
    selectedCustomer,
    selectedInvoice,
    onInvoiceSelect,
    onSkipInvoice,
    showInvoiceSection,
    invoiceSearchRef
}) => {
    if (!selectedCustomer || !showInvoiceSection) return null;

    // Handle invoice selection from inline search
    const handleInvoiceSelect = (invoice: any) => {
        if (invoice) {
            onInvoiceSelect(invoice);
        }
    };

    return (
        <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
                    <FileText className="w-4 h-4 mr-2" />
                    INVOICE (Optional)
                </h3>
                <button
                    onClick={onSkipInvoice}
                    className="min-w-[140px] px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                    title="Skip invoice and enter items manually"
                >
                    <span>Manual Entry</span>
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            {/* White card wrapper - consistent with CustomerSearch pattern */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
                {!selectedInvoice ? (
                    <InvoiceSearch
                        onSelect={handleInvoiceSelect}
                        customerId={selectedCustomer.customer_id}
                        placeholder="Search invoice by number or date... (Ctrl+I)"
                        autoFocus={false}
                    />
                ) : (
                    /* Selected invoice display - inline green card */
                    <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                                    <FileText className="w-5 h-5 text-green-600" />
                                </div>
                                <div>
                                    <span className="font-semibold text-gray-900 block">
                                        {selectedInvoice.invoice_number}
                                    </span>
                                    <div className="flex items-center gap-3 text-sm text-gray-600">
                                        <span>
                                            {new Date(selectedInvoice.invoice_date).toLocaleDateString('en-IN', {
                                                day: '2-digit',
                                                month: 'short',
                                                year: 'numeric'
                                            })}
                                        </span>
                                        <span className="font-medium text-green-700">
                                            ₹{((selectedInvoice as any).final_amount || 0).toLocaleString('en-IN')}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => onInvoiceSelect(null as any)}
                                className="px-3 py-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
                            >
                                Change
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});

ReturnInvoiceSelector.displayName = 'ReturnInvoiceSelector';
