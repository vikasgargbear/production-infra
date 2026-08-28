import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import CanonicalWriteNotice from '../../global/ui/CanonicalWriteNotice';

interface CancelInvoiceData {
    invoice_id?: number | string;
    id?: number | string;
    invoice_number?: string;
    customer_name?: string;
    total_amount?: number;
    final_amount?: number;
    amount_paid?: number;
    invoice_status?: string;
}

interface CancelInvoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoice: CancelInvoiceData | null;
    onCancelled?: () => void;
}

const CancelInvoiceModal: React.FC<CancelInvoiceModalProps> = ({ isOpen, onClose, invoice }) => {
    if (!isOpen || !invoice) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div
                className="w-full max-w-md rounded-lg border border-gray-200 bg-white"
                role="dialog"
                aria-modal="true"
                aria-labelledby="cancel-invoice-title"
            >
                <div className="flex items-center justify-between border-b border-gray-200 p-4">
                    <h3 id="cancel-invoice-title" className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                        Cancel Invoice
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-md hover:bg-gray-100"
                        aria-label="Close cancellation notice"
                        title="Close"
                    >
                        <X className="h-5 w-5 text-gray-500" />
                    </button>
                </div>
                <div className="space-y-4 p-4">
                    <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
                        <span className="text-gray-600">Invoice</span>
                        <div className="mt-1 font-medium text-gray-900">
                            {invoice.invoice_number || String(invoice.invoice_id || invoice.id || '')}
                        </div>
                    </div>
                    <CanonicalWriteNotice
                        title="Invoice cancellation is not available yet"
                        description="A canonical reversal command must atomically reverse inventory, receivables, ledger, and GST effects. Nothing was changed or queued."
                    />
                </div>
                <div className="flex justify-end border-t border-gray-200 p-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="min-h-11 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CancelInvoiceModal;
