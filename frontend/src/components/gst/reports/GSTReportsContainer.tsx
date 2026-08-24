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
import { getFinancialYearRange } from '../utils';
import { useGSTExport } from '../hooks/useGSTExport';

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
    const [dateRange, setDateRange] = useState<DateRange>(() => {
        const now = new Date();
        return {
            from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
            to: now.toISOString().split('T')[0]
        };
    });
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [showTaxBreakdown, setShowTaxBreakdown] = useState(false);
    const [reportData, setReportData] = useState<any>(null);
    const { exportToCSV } = useGSTExport();

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
    const calculateDateRange = (period: string): DateRange => {
        const now = new Date();
        let from: string, to: string;

        switch (period) {
            case 'current':
                from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                to = now.toISOString().split('T')[0];
                break;
            case 'previous':
                from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
                to = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
                break;
            case 'quarter':
                const currentMonth = now.getMonth();
                const fyStartYear = currentMonth >= 3 ? now.getFullYear() : now.getFullYear() - 1;
                const fyMonth = currentMonth >= 3 ? currentMonth - 3 : currentMonth + 9;
                const quarter = Math.floor(fyMonth / 3);
                const quarterStartMonth = quarter * 3 + 3;
                const quarterStartYear = quarterStartMonth >= 12 ? fyStartYear + 1 : fyStartYear;
                const adjustedMonth = quarterStartMonth >= 12 ? quarterStartMonth - 12 : quarterStartMonth;
                from = new Date(quarterStartYear, adjustedMonth, 1).toISOString().split('T')[0];
                to = now.toISOString().split('T')[0];
                break;
            case 'year':
                const fyRange = getFinancialYearRange();
                from = fyRange.from;
                to = now.toISOString().split('T')[0];
                break;
            default:
                from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                to = now.toISOString().split('T')[0];
        }

        return { from, to };
    };

    // Update date range when period changes
    useEffect(() => {
        if (selectedPeriod !== 'custom') {
            setDateRange(calculateDateRange(selectedPeriod));
        }
    }, [selectedPeriod]);

    // Handle refresh
    const handleRefresh = () => {
        setRefreshTrigger(prev => prev + 1);
    };

    const selectReport = (report: GSTReportType) => {
        setReportData(null);
        setSelectedReport(report);
    };

    // Handle export
    const handleExport = () => {
        if (reportData) {
            exportToCSV(reportData, { filename: `gst_${selectedReport}`, reportType: selectedReport });
        }
    };

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
                    <div className="hidden space-x-2 sm:flex">
                        {['current', 'previous', 'quarter', 'year', 'custom'].map((period) => (
                            <button
                                key={period}
                                type="button"
                                onClick={() => setSelectedPeriod(period)}
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
                                value={new Date(dateRange.from)}
                                onChange={(value: Date | string) => setDateRange(prev => ({ ...prev, from: typeof value === 'string' ? value : value.toISOString().split('T')[0] }))}
                                placeholder="From"
                            />
                            <span className="text-gray-400">to</span>
                            <DatePicker
                                value={new Date(dateRange.to)}
                                onChange={(value: Date | string) => setDateRange(prev => ({ ...prev, to: typeof value === 'string' ? value : value.toISOString().split('T')[0] }))}
                                placeholder="To"
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
                    {reportData && (
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

            {/* Report Content */}
            <div>
                {renderReport()}
            </div>
            </div>
        </div>
    );
};

export default GSTReportsContainer;
