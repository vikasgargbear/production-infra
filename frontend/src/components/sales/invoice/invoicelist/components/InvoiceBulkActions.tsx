/**
 * InvoiceBulkActions Component
 * Bulk operations bar for selected invoices
 * Optimized with React.memo
 */

import React from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '../../../../global';
import type { InvoiceBulkActionsProps } from '../types/invoicelist.types';

export const InvoiceBulkActions = React.memo<InvoiceBulkActionsProps>(({
    selectedCount,
    onExport,
    onClear
}) => {
    if (selectedCount === 0) return null;

    return (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center">
                    <span className="text-sm font-medium text-blue-900">
                        {selectedCount} invoice{selectedCount > 1 ? 's' : ''} selected
                    </span>
                </div>
                <div className="flex items-center space-x-2">
                    <Button variant="outline" size="sm" onClick={onExport}>
                        <Download className="w-4 h-4 mr-2" />
                        Export Selected
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClear}
                        aria-label="Clear invoice selection"
                        title="Clear selection"
                        className="min-w-11"
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
});

InvoiceBulkActions.displayName = 'InvoiceBulkActions';
