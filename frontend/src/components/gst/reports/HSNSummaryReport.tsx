/**
 * The current backend HSN endpoint groups by mutable product-master facts and
 * derives an effective rate. Do not present that projection as statutory data.
 */

import React, { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import type { DateRange } from '../types';

interface HSNSummaryReportProps {
    dateRange: DateRange;
    refreshTrigger: number;
    onRefresh?: () => void;
    showTaxBreakdown?: boolean;
    onDataReady?: (data: unknown) => void;
    onExport?: () => void;
}

const HSNSummaryReport: React.FC<HSNSummaryReportProps> = ({ onDataReady }) => {
    useEffect(() => onDataReady?.(null), [onDataReady]);

    return (
        <section aria-labelledby="hsn-unavailable-title" className="rounded-lg border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
                <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div>
                    <h2 id="hsn-unavailable-title" className="font-semibold text-amber-950">HSN summary unavailable</h2>
                    <p className="mt-1 text-sm text-amber-900">
                        The API does not yet publish a date-bounded HSN projection from immutable invoice-line classification
                        and tax-version facts. Current product-master values are not shown as a substitute.
                    </p>
                </div>
            </div>
        </section>
    );
};

export default HSNSummaryReport;
