import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import CanonicalWriteNotice from '../ui/CanonicalWriteNotice';
import type { EditableDecimalValue } from '../../../utils/exactDecimal';

export type CancellableDocumentType =
    | 'order'
    | 'challan'
    | 'payment'
    | 'credit_note'
    | 'debit_note'
    | 'return';

interface CancelDocumentData {
    id: number | string;
    document_number?: string;
    customer_name?: string;
    supplier_name?: string;
    amount?: EditableDecimalValue;
}

interface CancelDocumentModalProps {
    isOpen: boolean;
    onClose: () => void;
    documentType: CancellableDocumentType;
    document: CancelDocumentData | null;
    onCancelled?: () => void;
}

const readableType = (value: CancellableDocumentType): string => value.replace('_', ' ');

/** Consequential reversal stays read-only until one canonical transaction exists. */
const CancelDocumentModal: React.FC<CancelDocumentModalProps> = ({
    isOpen,
    onClose,
    documentType,
    document,
}) => {
    if (!isOpen || !document) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div
                className="w-full max-w-md rounded-lg border border-gray-200 bg-white"
                role="dialog"
                aria-modal="true"
                aria-labelledby="cancel-document-title"
            >
                <div className="flex items-center justify-between border-b border-gray-200 p-4">
                    <h3 id="cancel-document-title" className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                        Cancel {readableType(documentType)}
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
                        <span className="text-gray-600">Document</span>
                        <div className="mt-1 font-medium text-gray-900">
                            {document.document_number || String(document.id)}
                        </div>
                    </div>
                    <CanonicalWriteNotice
                        title="Cancellation is not available yet"
                        description={`A canonical ${readableType(documentType)} reversal command must update the document, stock, ledger, and tax records atomically. Nothing was changed or queued.`}
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

export default CancelDocumentModal;
