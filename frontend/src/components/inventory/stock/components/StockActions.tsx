/**
 * StockActions Component
 * Bulk action buttons for export/print/whatsapp
 * Optimized with React.memo
 */

import React from 'react';
import { Download, Printer, MessageCircle } from 'lucide-react';
import type { StockActionsProps } from '../types/stock.types';

export const StockActions = React.memo<StockActionsProps>(({
    selectedCount,
    onExport,
    onPrint,
    onWhatsApp
}) => {
    if (selectedCount === 0) {
        return null;
    }

    return (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 bg-white border border-gray-200 rounded-xl shadow-2xl py-3 px-6 flex items-center space-x-4">
            <span className="text-sm font-medium text-gray-700">
                {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
            </span>

            <div className="h-6 w-px bg-gray-300"></div>

            <button
                onClick={onExport}
                className="flex min-h-11 items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Export to CSV"
            >
                <Download className="w-4 h-4" />
                <span>Export</span>
            </button>

            <button
                onClick={onPrint}
                className="flex min-h-11 items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Print"
            >
                <Printer className="w-4 h-4" />
                <span>Print</span>
            </button>

            <button
                onClick={onWhatsApp}
                className="flex min-h-11 items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Send via WhatsApp"
            >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp</span>
            </button>
        </div>
    );
});

StockActions.displayName = 'StockActions';
