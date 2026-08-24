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
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center">
                    <span className="text-sm font-medium text-blue-900">
                        {selectedCount} invoice{selectedCount > 1 ? 's' : ''} selected
                    </span>
                </div>
                <div className="flex items-center space-x-2">
                    <Button variant="outline" size="sm" onClick={onExport}>
                        <Download className="w-4 h-4 mr-2" />
                        Export
                    </Button>
                    <Button variant="ghost" size="sm" onClick={onClear}>
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
});

InvoiceBulkActions.displayName = 'InvoiceBulkActions';
