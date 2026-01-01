import React, { useState } from 'react';
import { AlertTriangle, X, Edit, Trash2, Package, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';
import offlineDB from '../../services/offline/core/offlineDatabase';
import syncEngine from '../../services/offline/sync/syncEngine';

interface ConflictDetails {
    invoiceNumber?: string;
    productId?: number;
    batchId?: number;
    requiredQty?: number;
    availableQty?: number;
}

interface Conflict {
    itemId: string;
    error: string;
    details?: ConflictDetails;
}

interface InvoiceItem {
    product_id?: number;
    batch_id?: number;
    quantity?: number;
    unit_price?: number;
    line_total?: number;
    [key: string]: unknown;
}

interface Invoice {
    items: InvoiceItem[];
    updated_at?: string;
    [key: string]: unknown;
}

interface ConflictResolutionModalProps {
    isOpen: boolean;
    onClose: () => void;
    conflicts?: Conflict[];
    onResolved?: () => void;
}

/**
 * ConflictResolutionModal
 * 
 * Displays sync conflicts (insufficient stock) and allows user to:
 * 1. Adjust quantity to available amount
 * 2. Cancel the invoice
 * 3. Keep for later (when stock arrives)
 */
const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
    isOpen,
    onClose,
    conflicts = [],
    onResolved
}) => {
    const [resolving, setResolving] = useState<Record<string, boolean>>({});

    if (!isOpen || conflicts.length === 0) return null;

    const handleAdjustQuantity = async (conflict: Conflict, newQuantity: number): Promise<void> => {
        setResolving(prev => ({ ...prev, [conflict.itemId]: true }));

        try {
            // Get the invoice from offline DB
            const invoice = await offlineDB.get('invoices', conflict.itemId) as Invoice | undefined;

            if (!invoice) {
                toast.error('Invoice not found in offline storage');
                return;
            }

            // Update the item quantity to available amount
            const updatedItems = invoice.items.map(item => {
                if (item.product_id === conflict.details?.productId &&
                    item.batch_id === conflict.details?.batchId) {
                    return {
                        ...item,
                        quantity: newQuantity,
                        // Recalculate totals
                        line_total: newQuantity * (item.unit_price || 0)
                    };
                }
                return item;
            });

            // Update invoice in offline DB
            await offlineDB.update('invoices', {
                ...invoice,
                items: updatedItems,
                updated_at: new Date().toISOString()
            });

            toast.success(`Updated quantity to ${newQuantity} - ready to re-sync`);

            // Trigger re-sync
            setTimeout(async () => {
                const result = await syncEngine.forceSync();
                if (result.success) {
                    onResolved?.();
                }
            }, 500);

        } catch (error) {
            console.error('Failed to adjust quantity:', error);
            toast.error('Failed to adjust quantity');
        } finally {
            setResolving(prev => ({ ...prev, [conflict.itemId]: false }));
        }
    };

    const handleCancelInvoice = async (conflict: Conflict): Promise<void> => {
        if (!window.confirm('Are you sure you want to cancel this invoice? This cannot be undone.')) {
            return;
        }

        setResolving(prev => ({ ...prev, [conflict.itemId]: true }));

        try {
            // Remove from offline DB
            await offlineDB.delete('invoices', conflict.itemId);

            // Remove from sync queue
            const queue = await offlineDB.getSyncQueue();
            const queueItem = queue.find((q: any) => String(q.entity_id) === String(conflict.itemId));
            if (queueItem && queueItem.id !== undefined) {
                await offlineDB.removeFromSyncQueue(queueItem.id);
            }

            toast.success('Invoice cancelled');

            // Refresh conflicts
            onResolved?.();

        } catch (error) {
            console.error('Failed to cancel invoice:', error);
            toast.error('Failed to cancel invoice');
        } finally {
            setResolving(prev => ({ ...prev, [conflict.itemId]: false }));
        }
    };

    const handleKeepForLater = async (conflict: Conflict): Promise<void> => {
        setResolving(prev => ({ ...prev, [conflict.itemId]: true }));

        try {
            // Mark as "hold" status in sync queue
            const queue = await offlineDB.getSyncQueue();
            const queueItem = queue.find((q: any) => String(q.entity_id) === String(conflict.itemId));

            if (queueItem && queueItem.id !== undefined) {
                // Don't retry automatically - user will manually retry when stock arrives
                await offlineDB.markSyncConflict(queueItem.id, 'ON_HOLD: Waiting for stock');
            }

            toast.info('Invoice kept for later - you can retry when stock arrives');
            onResolved?.();

        } catch (error) {
            console.error('Failed to mark as hold:', error);
            toast.error('Failed to update status');
        } finally {
            setResolving(prev => ({ ...prev, [conflict.itemId]: false }));
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-orange-50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-100 rounded-lg">
                            <AlertTriangle className="w-6 h-6 text-orange-600" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">Sync Conflicts Detected</h2>
                            <p className="text-sm text-gray-600 mt-1">
                                {conflicts.length} invoice{conflicts.length > 1 ? 's' : ''} couldn't be synced due to insufficient stock
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="space-y-4">
                        {conflicts.map((conflict, index) => (
                            <div
                                key={conflict.itemId || index}
                                className="border border-orange-200 rounded-lg p-4 bg-orange-50/50 hover:bg-orange-50 transition-colors"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    {/* Conflict Info */}
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Package className="w-4 h-4 text-orange-600" />
                                            <h3 className="font-semibold text-gray-900">
                                                Invoice: {conflict.details?.invoiceNumber || conflict.itemId}
                                            </h3>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                            <div>
                                                <span className="text-gray-600">Product ID:</span>
                                                <span className="ml-2 font-medium text-gray-900">
                                                    {conflict.details?.productId}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-gray-600">Batch ID:</span>
                                                <span className="ml-2 font-medium text-gray-900">
                                                    {conflict.details?.batchId}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-gray-600">Required Qty:</span>
                                                <span className="ml-2 font-semibold text-red-600">
                                                    {conflict.details?.requiredQty}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-gray-600">Available Qty:</span>
                                                <span className="ml-2 font-semibold text-green-600">
                                                    {conflict.details?.availableQty}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="mt-3 p-3 bg-white rounded border border-orange-200">
                                            <p className="text-sm text-gray-700">
                                                <span className="font-medium">Error:</span> {conflict.error}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex flex-col gap-2 min-w-[200px]">
                                        {/* Adjust to Available */}
                                        {(conflict.details?.availableQty || 0) > 0 && (
                                            <button
                                                onClick={() => handleAdjustQuantity(conflict, conflict.details!.availableQty!)}
                                                disabled={resolving[conflict.itemId]}
                                                className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                                            >
                                                <Edit className="w-4 h-4" />
                                                {resolving[conflict.itemId] ? 'Updating...' : `Adjust to ${conflict.details?.availableQty}`}
                                            </button>
                                        )}

                                        {/* Keep for Later */}
                                        <button
                                            onClick={() => handleKeepForLater(conflict)}
                                            disabled={resolving[conflict.itemId]}
                                            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                                        >
                                            <RefreshCw className="w-4 h-4" />
                                            Keep for Later
                                        </button>

                                        {/* Cancel Invoice */}
                                        <button
                                            onClick={() => handleCancelInvoice(conflict)}
                                            disabled={resolving[conflict.itemId]}
                                            className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            Cancel Invoice
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-gray-200 p-4 bg-gray-50">
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-600">
                            <span className="font-medium">Tip:</span> You can adjust quantities now or keep them for later when stock arrives
                        </p>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConflictResolutionModal;
