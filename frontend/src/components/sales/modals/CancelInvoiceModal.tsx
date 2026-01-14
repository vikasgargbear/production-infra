import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { invoicesApi } from '../../../services/api';

// Flexible interface to work with different invoice shapes
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

const CancelInvoiceModal: React.FC<CancelInvoiceModalProps> = ({
    isOpen,
    onClose,
    invoice,
    onCancelled
}) => {
    const [reason, setReason] = useState('');
    const [cancelling, setCancelling] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!invoice) return;

        if (!reason.trim()) {
            setError('Please provide a reason for cancellation');
            return;
        }

        setCancelling(true);
        try {
            await invoicesApi.cancel(invoice.invoice_id || invoice.id!, reason.trim());

            setReason('');
            onClose();

            if (onCancelled) {
                onCancelled();
            }
        } catch (error: any) {
            let errorMessage = 'Failed to cancel invoice';
            if (error.response?.data?.detail) {
                if (typeof error.response.data.detail === 'string') {
                    errorMessage = error.response.data.detail;
                } else if (Array.isArray(error.response.data.detail)) {
                    errorMessage = error.response.data.detail
                        .map((err: any) => typeof err === 'string' ? err : (err.msg || JSON.stringify(err)))
                        .join(', ');
                } else {
                    errorMessage = JSON.stringify(error.response.data.detail);
                }
            } else if (error.message) {
                errorMessage = error.message;
            }
            setError(errorMessage);
        } finally {
            setCancelling(false);
        }
    };

    if (!isOpen || !invoice) return null;

    const hasPaidAmount = (invoice.amount_paid || 0) > 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b bg-red-50">
                    <h3 className="text-lg font-semibold flex items-center gap-2 text-red-700">
                        <AlertTriangle className="w-5 h-5" />
                        Cancel Invoice
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} className="p-4">
                    {/* Invoice Summary */}
                    <div className="bg-gray-50 rounded-lg p-3 mb-4">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-gray-600">Invoice #</span>
                            <span className="font-medium">{invoice.invoice_number}</span>
                        </div>
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-gray-600">Customer</span>
                            <span className="font-medium">{invoice.customer_name}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Amount</span>
                            <span className="font-medium">₹{(invoice.total_amount || invoice.final_amount || 0).toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Warning */}
                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-yellow-800">
                                <p className="font-medium">This action cannot be undone!</p>
                                <p className="mt-1">Cancelling this invoice will:</p>
                                <ul className="list-disc list-inside mt-1 text-yellow-700">
                                    <li>Mark the invoice as cancelled</li>
                                    <li>Restore inventory stock (if posted)</li>
                                    <li>Remove from customer outstanding</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Error if paid */}
                    {hasPaidAmount && (
                        <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-lg text-sm">
                            <strong>Cannot cancel:</strong> This invoice has ₹{(invoice.amount_paid || 0).toFixed(2)} in payments.
                            Please reverse all payments first.
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    {/* Reason Input */}
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Cancellation Reason <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="px-3 py-2 w-full border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                            rows={3}
                            placeholder="Enter reason for cancellation..."
                            disabled={hasPaidAmount}
                            required
                        />
                    </div>
                </form>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-4 border-t bg-gray-50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 bg-white border rounded-lg hover:bg-gray-50"
                    >
                        Keep Invoice
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={cancelling || !reason.trim() || hasPaidAmount}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        {cancelling ? 'Cancelling...' : 'Cancel Invoice'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CancelInvoiceModal;
