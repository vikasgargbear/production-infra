/**
 * GST Reports Container
 * 
 * Manages report selection, date range, and common functionality
 * Routes to individual report components
 */

import React, { useState, useEffect } from 'react';
import {
    BarChart3, Calendar, RefreshCw, Columns3, Download
} from 'lucide-react';
import { DatePicker } from '../../global';
import ModuleHeader from '../../global/ui/ModuleHeader';
import type { DateRange, GSTReportType, ReportTypeConfig } from '../types';
import { useGSTExport } from '../hooks/useGSTExport';
import { useCanonicalBusinessDate } from '../../../hooks/useCanonicalBusinessDate';
import {
    calendarDateToPickerDate,
    organizationPeriodRange,
    requireCalendarDate,
    serializeCalendarDateInput,
    type OrganizationPeriod,
} from '../../../utils/calendarDate';

// Import individual reports
import GSTR1Report from './GSTR1Report';
import GSTR2BReport from './GSTR2BReport';
import GSTR3BReport from './GSTR3BReport';
import HSNSummaryReport from './HSNSummaryReport';
import PartyWiseReport from './PartyWiseReport';

interface GSTReportsContainerProps {
    onClose?: () => void;
}

const GSTReportsContainer: React.FC<GSTReportsContainerProps> = ({ onClose }) => {
    const [selectedReport, setSelectedReport] = useState<GSTReportType>('gstr-1');
    const [selectedPeriod, setSelectedPeriod] = useState<string>('current');
    const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' });
    const [dateSelectionError, setDateSelectionError] = useState('');
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [showTaxBreakdown, setShowTaxBreakdown] = useState(false);
    const [reportData, setReportData] = useState<any>(null);
    const [exportError, setExportError] = useState('');
    const { exportToCSV } = useGSTExport();
    const { businessDate, loading: businessDateLoading, error: businessDateError } = useCanonicalBusinessDate();

    // Static Tailwind class maps (dynamic classes like `bg-${color}-100` are purged by Tailwind)
    const activeStyles: Record<string, string> = {
        green: 'bg-green-100 text-green-700 border-green-500',
        blue: 'bg-blue-100 text-blue-700 border-blue-500',
        purple: 'bg-purple-100 text-purple-700 border-purple-500',
        amber: 'bg-amber-100 text-amber-700 border-amber-500',
        teal: 'bg-teal-100 text-teal-700 border-teal-500',
        red: 'bg-red-100 text-red-700 border-red-500',
    };

    // Report type configurations (GSTR-3B absorbs Payable, GSTR-2B absorbs Input Credit)
    const reportTypes: ReportTypeConfig[] = [
        {
            id: 'gstr-1',
            name: 'GSTR-1',
            description: 'Outward Supplies',
            icon: BarChart3,
            color: 'green'
        },
        {
            id: 'gstr-3b',
            name: 'GSTR-3B',
            description: 'Summary & Payable',
            icon: BarChart3,
            color: 'blue'
        },
        {
            id: 'gstr-2b',
            name: 'GSTR-2B',
            description: 'Input Tax Credit',
            icon: BarChart3,
            color: 'purple'
        },
        {
            id: 'hsn-summary',
            name: 'HSN Summary',
            description: 'Product-wise GST',
            icon: BarChart3,
            color: 'amber'
        },
        {
            id: 'party-wise',
            name: 'Party-wise GST',
            description: 'Customer GST details',
            icon: BarChart3,
            color: 'teal'
        }
    ];

    // Calculate date range based on period
    // Update date range when period changes
    useEffect(() => {
        if (selectedPeriod !== 'custom' && businessDate) {
            setDateRange(organizationPeriodRange(businessDate, selectedPeriod as OrganizationPeriod));
            setDateSelectionError('');
        }
    }, [businessDate, selectedPeriod]);

    useEffect(() => {
        if (!businessDateLoading && businessDateError && !businessDate) {
            setSelectedPeriod('custom');
            setDateSelectionError(`${businessDateError} Select an explicit valid date range to continue.`);
        }
    }, [businessDate, businessDateError, businessDateLoading]);

    const updateCustomDate = (field: keyof DateRange, value: Date | string): void => {
        try {
            const serialized = serializeCalendarDateInput(value, `GST ${field} date`);
            setDateRange(previous => ({ ...previous, [field]: serialized }));
            setDateSelectionError('');
        } catch (error) {
            setDateSelectionError(error instanceof Error ? error.message : 'Select a valid GST date.');
        }
    };

    const hasValidRange = (() => {
        try {
            const from = requireCalendarDate(dateRange.from, 'GST from date');
            const to = requireCalendarDate(dateRange.to, 'GST to date');
            return from <= to;
        } catch {
            return false;
        }
    })();

    // Handle refresh
    const handleRefresh = () => {
        if (!hasValidRange) {
            setDateSelectionError('Select a valid GST date range before loading the report.');
            return;
        }
        setRefreshTrigger(prev => prev + 1);
    };

    const selectReport = (report: GSTReportType) => {
        setReportData(null);
        setExportError('');
        setSelectedReport(report);
    };

    // Handle export
    const handleExport = () => {
        if (reportData) {
            try {
                exportToCSV(reportData, { filename: `gst_${selectedReport}`, reportType: selectedReport });
                setExportError('');
            } catch (caught) {
                setExportError(caught instanceof Error ? caught.message : 'GST export is unavailable.');
            }
        }
    };

    const canExport = reportData && ['gstr-1', 'hsn-summary', 'party-wise'].includes(selectedReport);

    // Render current report
    const renderReport = () => {
        const commonProps = {
            dateRange,
            refreshTrigger,
            onRefresh: handleRefresh,
            showTaxBreakdown,
            onDataReady: setReportData,
            onExport: handleExport
        };

        switch (selectedReport) {
            case 'gstr-1':
                return <GSTR1Report {...commonProps} />;
            case 'gstr-2b':
                return <GSTR2BReport {...commonProps} />;
            case 'gstr-3b':
                return <GSTR3BReport {...commonProps} />;
            case 'hsn-summary':
                return <HSNSummaryReport {...commonProps} />;
            case 'party-wise':
                return <PartyWiseReport {...commonProps} />;
            default:
                return <GSTR1Report {...commonProps} />;
        }
    };

    return (
        <div>
            {/* Header */}
            <ModuleHeader
                title="GST Reports"
                icon={BarChart3}
                iconColor="text-purple-600"
                additionalActions={[
                    {
                        label: 'Refresh',
                        icon: RefreshCw,
                        onClick: handleRefresh,
                        variant: 'secondary',
                    },
                ]}
            />

            <div className="space-y-6 p-4 sm:p-6">
            {/* Report Type Selector */}
            <div className="md:hidden">
                <label htmlFor="gst-report-mobile" className="mb-1.5 block text-sm font-medium text-gray-700">
                    Choose GST report
                </label>
                <select
                    id="gst-report-mobile"
                    value={selectedReport}
                    onChange={(event) => selectReport(event.target.value as GSTReportType)}
                    className="min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    {reportTypes.map(report => (
                        <option key={report.id} value={report.id}>
                            {report.name} — {report.description}
                        </option>
                    ))}
                </select>
            </div>
            <nav aria-label="GST report tabs" className="hidden space-x-2 overflow-x-auto pb-2 md:flex">
                {reportTypes.map((report) => {
                    const Icon = report.icon;
                    return (
                        <button
                            key={report.id}
                            type="button"
                            onClick={() => selectReport(report.id)}
                            aria-current={selectedReport === report.id ? 'page' : undefined}
                            className={`flex min-h-11 items-center whitespace-nowrap rounded-lg border px-4 py-2 transition-colors ${
                                selectedReport === report.id
                                    ? activeStyles[report.color] || 'bg-blue-100 text-blue-700 border-blue-500'
                                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                            <Icon className="h-4 w-4 mr-2" />
                            <div className="text-left">
                                <div className="font-medium text-sm">{report.name}</div>
                                <div className="text-xs opacity-75">{report.description}</div>
                            </div>
                        </button>
                    );
                })}
            </nav>

            {/* Period Selector + Tax Breakdown Toggle */}
            <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex items-center space-x-2">
                        <Calendar className="h-5 w-5 text-gray-400" />
                        <span className="text-sm font-medium text-gray-700">Period:</span>
                    </div>
                    <select
                        aria-label="GST report period"
                        value={selectedPeriod}
                        onChange={(event) => setSelectedPeriod(event.target.value)}
                        className="min-h-11 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 sm:hidden"
                    >
                        <option value="current">Current month</option>
                        <option value="previous">Previous month</option>
                        <option value="quarter">Current quarter</option>
                        <option value="year">Financial year</option>
                        <option value="custom">Custom dates</option>
                    </select>
                    <div role="group" aria-label="GST report period shortcuts" className="hidden space-x-2 sm:flex">
                        {['current', 'previous', 'quarter', 'year', 'custom'].map((period) => (
                            <button
                                key={period}
                                type="button"
                                onClick={() => setSelectedPeriod(period)}
                                aria-pressed={selectedPeriod === period}
                                className={`
                    px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                    ${selectedPeriod === period
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }
                  `}
                            >
                                {period.charAt(0).toUpperCase() + period.slice(1)}
                            </button>
                        ))}
                    </div>
                    {selectedPeriod === 'custom' && (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <DatePicker
                                value={dateRange.from ? calendarDateToPickerDate(dateRange.from) : null}
                                onChange={(value: Date) => updateCustomDate('from', value)}
                                placeholder="From"
                                showToday={false}
                            />
                            <span className="text-gray-400">to</span>
                            <DatePicker
                                value={dateRange.to ? calendarDateToPickerDate(dateRange.to) : null}
                                onChange={(value: Date) => updateCustomDate('to', value)}
                                placeholder="To"
                                showToday={false}
                            />
                        </div>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setShowTaxBreakdown(!showTaxBreakdown)}
                        className={`inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            showTaxBreakdown
                                ? 'bg-blue-100 text-blue-700 border border-blue-300'
                                : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                        }`}
                    >
                        <Columns3 className="h-4 w-4 mr-1.5" />
                        {showTaxBreakdown ? 'Hide' : 'Show'} CGST/SGST/IGST
                    </button>
                    {canExport && (
                        <button
                            type="button"
                            onClick={handleExport}
                            className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200 transition-colors"
                        >
                            <Download className="h-4 w-4 mr-1.5" />
                            Export CSV
                        </button>
                    )}
                </div>
            </div>

            {exportError && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    {exportError}
                </div>
            )}

            {/* Report Content */}
            <div>
                {businessDateLoading && !hasValidRange ? (
                    <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">Loading the organization business date…</div>
                ) : !hasValidRange ? (
                    <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{dateSelectionError || 'Select a valid GST date range to load the report.'}</div>
                ) : renderReport()}
            </div>
            </div>
        </div>
    );
};

export default GSTReportsContainer;
