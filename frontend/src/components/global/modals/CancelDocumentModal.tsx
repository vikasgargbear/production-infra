import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { ordersApi } from '../../../services/api';

// Document types that can be cancelled
export type CancellableDocumentType = 'order' | 'challan' | 'payment' | 'credit_note' | 'debit_note' | 'return';

interface CancelDocumentData {
    id: number | string;
    document_number?: string;
    customer_name?: string;
    supplier_name?: string;
    amount?: number;
    status?: string;
}

interface CancelDocumentModalProps {
    isOpen: boolean;
    onClose: () => void;
    documentType: CancellableDocumentType;
    document: CancelDocumentData | null;
    onCancelled?: () => void;
}

// Document type configurations
const DOCUMENT_CONFIG: Record<CancellableDocumentType, {
    title: string;
    labelField: string;
    partyLabel: string;
    apiEndpoint: string;
    warnings: string[];
}> = {
    order: {
        title: 'Cancel Order',
        labelField: 'Order #',
        partyLabel: 'Customer',
        apiEndpoint: '/orders/{id}/cancel/',
        warnings: [
            'Mark the order as cancelled',
            'Release any reserved inventory',
            'Cannot convert to invoice after cancellation'
        ]
    },
    challan: {
        title: 'Cancel Challan',
        labelField: 'Challan #',
        partyLabel: 'Customer',
        apiEndpoint: '/orders/{id}/cancel/',
        warnings: [
            'Mark the challan as cancelled',
            'Cannot convert to invoice after cancellation'
        ]
    },
    payment: {
        title: 'Cancel Payment',
        labelField: 'Payment #',
        partyLabel: 'Party',
        apiEndpoint: '/payments/{id}/cancel/',
        warnings: [
            'Mark the payment as cancelled',
            'Update invoice/bill outstanding amount',
            'Reverse ledger entries'
        ]
    },
    credit_note: {
        title: 'Cancel Credit Note',
        labelField: 'Credit Note #',
        partyLabel: 'Customer',
        apiEndpoint: '/credit-notes/{id}/cancel/',
        warnings: [
            'Mark the credit note as cancelled',
            'Reverse customer credit balance',
            'Update ledger entries'
        ]
    },
    debit_note: {
        title: 'Cancel Debit Note',
        labelField: 'Debit Note #',
        partyLabel: 'Supplier',
        apiEndpoint: '/debit-notes/{id}/cancel/',
        warnings: [
            'Mark the debit note as cancelled',
            'Reverse supplier debit balance',
            'Update ledger entries'
        ]
    },
    return: {
        title: 'Cancel Return',
        labelField: 'Return #',
        partyLabel: 'Customer',
        apiEndpoint: '/returns/{id}/cancel/',
        warnings: [
            'Mark the return as cancelled',
            'Reverse inventory movements',
            'Update customer account'
        ]
    }
};

const CancelDocumentModal: React.FC<CancelDocumentModalProps> = ({
    isOpen,
    onClose,
    documentType,
    document,
    onCancelled
}) => {
    const [reason, setReason] = useState('');
    const [cancelling, setCancelling] = useState(false);
    const [error, setError] = useState('');

    const config = DOCUMENT_CONFIG[documentType];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!document) return;

        if (!reason.trim()) {
            setError('Please provide a reason for cancellation');
            return;
        }

        setCancelling(true);
        try {
            // Call appropriate API based on document type
            const endpoint = config.apiEndpoint.replace('{id}', String(document.id));

            // Use the appropriate API - for now using ordersApi for orders/challans
            if (documentType === 'order' || documentType === 'challan') {
                await ordersApi.cancel(document.id, reason.trim());
            } else {
                // Generic POST for other types - would need specific APIs
                const { apiHelpers } = await import('../../../services/api/apiClient');
                await apiHelpers.post(endpoint, { reason: reason.trim() });
            }

            setReason('');
            onClose();

            if (onCancelled) {
                onCancelled();
            }
        } catch (error: any) {
            let errorMessage = `Failed to cancel ${documentType}`;
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

    if (!isOpen || !document) return null;

    const partyName = document.customer_name || document.supplier_name || 'N/A';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b bg-red-50">
                    <h3 className="text-lg font-semibold flex items-center gap-2 text-red-700">
                        <AlertTriangle className="w-5 h-5" />
                        {config.title}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} className="p-4">
                    {/* Document Summary */}
                    <div className="bg-gray-50 rounded-lg p-3 mb-4">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-gray-600">{config.labelField}</span>
                            <span className="font-medium">{document.document_number || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-gray-600">{config.partyLabel}</span>
                            <span className="font-medium">{partyName}</span>
                        </div>
                        {document.amount !== undefined && (
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600">Amount</span>
                                <span className="font-medium">₹{(document.amount || 0).toFixed(2)}</span>
                            </div>
                        )}
                    </div>

                    {/* Warning */}
                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-yellow-800">
                                <p className="font-medium">This action cannot be undone!</p>
                                <p className="mt-1">Cancelling will:</p>
                                <ul className="list-disc list-inside mt-1 text-yellow-700">
                                    {config.warnings.map((warning, idx) => (
                                        <li key={idx}>{warning}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>

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
                        Keep {documentType.replace('_', ' ')}
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={cancelling || !reason.trim()}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        {cancelling ? 'Cancelling...' : `Cancel ${documentType.replace('_', ' ')}`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CancelDocumentModal;
