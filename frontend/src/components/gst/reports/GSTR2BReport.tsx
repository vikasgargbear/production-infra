/**
 * GSTR-2B is a GST-portal statement, not a report that can be reconstructed
 * from local supplier invoices. Keep this surface unavailable until the API
 * publishes the parsed portal document and its reconciliation lineage.
 */

import React, { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import type { DateRange } from '../types';

interface GSTR2BReportProps {
    dateRange: DateRange;
    refreshTrigger: number;
    onRefresh?: () => void;
    showTaxBreakdown?: boolean;
    onDataReady?: (data: unknown) => void;
    onExport?: () => void;
}

const GSTR2BReport: React.FC<GSTR2BReportProps> = ({ onDataReady }) => {
    useEffect(() => {
        // Prevent exporting the previous tab's payload under a GSTR-2B name.
        onDataReady?.(null);
    }, [onDataReady]);

    return (
        <section
            aria-labelledby="gstr2b-unavailable-title"
            className="rounded-lg border border-amber-200 bg-amber-50 p-5"
        >
            <div className="flex items-start gap-3">
                <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div>
                    <h2 id="gstr2b-unavailable-title" className="font-semibold text-amber-950">
                        GSTR-2B unavailable
                    </h2>
                    <p className="mt-1 text-sm text-amber-900">
                        No canonical GST-portal GSTR-2B projection is available for this organisation and period.
                        Local purchase invoices are not shown as a substitute.
                    </p>
                </div>
            </div>
        </section>
    );
};

export default GSTR2BReport;
