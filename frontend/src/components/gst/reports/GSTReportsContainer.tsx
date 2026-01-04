/**
 * GST Reports Container
 * 
 * Manages report selection, date range, and common functionality
 * Routes to individual report components
 */

import React, { useState, useEffect } from 'react';
import {
    BarChart3, Download, Calendar, RefreshCw, Loader2
} from 'lucide-react';
import { Button, DatePicker } from '../../global';
import type { DateRange, GSTReportType, ReportTypeConfig } from '../types';
import { getFinancialYearRange, formatCurrency } from '../utils';

// Import individual reports
import GSTR1Report from './GSTR1Report';
import GSTR2BReport from './GSTR2BReport';
import GSTR3BReport from './GSTR3BReport';
import HSNSummaryReport from './HSNSummaryReport';
import PartyWiseReport from './PartyWiseReport';
import GSTPayableReport from './GSTPayableReport';
import InputCreditReport from './InputCreditReport';

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

    // Report type configurations
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
            description: 'Summary Return',
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
        },
        {
            id: 'payable',
            name: 'GST Payable',
            description: 'Tax liability',
            icon: BarChart3,
            color: 'red'
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

    // Handle export
    const handleExport = (format: 'excel' | 'pdf') => {
        console.log(`Export ${selectedReport} as ${format}`);
        // Export logic will be in individual reports
    };

    // Render current report
    const renderReport = () => {
        const commonProps = {
            dateRange,
            refreshTrigger,
            onRefresh: handleRefresh
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
            case 'payable':
                return <GSTPayableReport {...commonProps} />;
            default:
                return <GSTR1Report {...commonProps} />;
        }
    };

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">GST Reports</h1>
                    <p className="text-gray-600">Tax reports and analysis</p>
                </div>
                <div className="flex items-center space-x-3">
                    <Button
                        onClick={handleRefresh}
                        variant="outline"
                        size="sm"
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Report Type Selector */}
            <div className="flex space-x-2 overflow-x-auto pb-2">
                {reportTypes.map((report) => {
                    const Icon = report.icon;
                    return (
                        <button
                            key={report.id}
                            onClick={() => setSelectedReport(report.id)}
                            className={`
                flex items-center px-4 py-2 rounded-lg whitespace-nowrap transition-colors
                ${selectedReport === report.id
                                    ? `bg-${report.color}-100 text-${report.color}-700 border-2 border-${report.color}-500`
                                    : 'bg-white text-gray-600 border-2 border-gray-200 hover:bg-gray-50'
                                }
              `}
                        >
                            <Icon className="h-4 w-4 mr-2" />
                            <div className="text-left">
                                <div className="font-medium text-sm">{report.name}</div>
                                <div className="text-xs opacity-75">{report.description}</div>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Period Selector */}
            <div className="flex items-center space-x-4 bg-white p-4 rounded-lg border border-gray-200">
                <div className="flex items-center space-x-2">
                    <Calendar className="h-5 w-5 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">Period:</span>
                </div>
                <div className="flex space-x-2">
                    {['current', 'previous', 'quarter', 'year', 'custom'].map((period) => (
                        <button
                            key={period}
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
                    <div className="flex items-center space-x-2">
                        <DatePicker
                            value={dateRange.from}
                            onChange={(value) => setDateRange(prev => ({ ...prev, from: value }))}
                            placeholder="From"
                        />
                        <span className="text-gray-400">to</span>
                        <DatePicker
                            value={dateRange.to}
                            onChange={(value) => setDateRange(prev => ({ ...prev, to: value }))}
                            placeholder="To"
                        />
                    </div>
                )}
            </div>

            {/* Report Content */}
            <div>
                {renderReport()}
            </div>
        </div>
    );
};

export default GSTReportsContainer;
