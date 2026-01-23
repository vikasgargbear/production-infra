import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    RefreshCw,
    AlertTriangle,
    CheckCircle,
    XCircle,
    Download,
    Filter,
    Search,
    Loader2,
    AlertCircle,
    ArrowRight,
    FileText,
    Clock,
    TrendingUp,
    TrendingDown,
    Info,
    ChevronDown,
    ChevronUp
} from 'lucide-react';
import { apiClient } from '../../../services/api';
import offlineStorage from '../../../services/offlineStorage';

// ==================== TYPES ====================

interface MismatchItem {
    id: string;
    supplier_gstin: string;
    supplier_name: string;
    invoice_number: string;
    invoice_date: string;
    gstr2b_value: number;
    books_value: number;
    gstr2b_tax: number;
    books_tax: number;
    value_diff: number;
    tax_diff: number;
    mismatch_type: 'value' | 'tax' | 'both' | 'missing_in_books' | 'missing_in_2b';
    status: 'pending' | 'resolved' | 'accepted' | 'rejected';
    resolution_notes?: string;
}

interface ReconciliationSummary {
    total_2b_invoices: number;
    total_books_invoices: number;
    matched: number;
    mismatched: number;
    missing_in_books: number;
    missing_in_2b: number;
    total_2b_value: number;
    total_books_value: number;
    total_2b_tax: number;
    total_books_tax: number;
    value_difference: number;
    tax_difference: number;
    reconciliation_date: string;
    period: string;
}

interface ReconciliationDashboardProps {
    onStartReconcile?: () => void;
    uploadComplete?: boolean;
}

type MismatchFilter = 'all' | 'value' | 'tax' | 'both' | 'missing_in_books' | 'missing_in_2b';
type StatusFilter = 'all' | 'pending' | 'resolved' | 'accepted' | 'rejected';

// ==================== COMPONENT ====================

const ReconciliationDashboard: React.FC<ReconciliationDashboardProps> = ({
    onStartReconcile,
    uploadComplete = false
}) => {
    const [isLoading, setIsLoading] = useState(true);
    const [isReconciling, setIsReconciling] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
    const [mismatches, setMismatches] = useState<MismatchItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [mismatchFilter, setMismatchFilter] = useState<MismatchFilter>('all');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [sortField, setSortField] = useState<'value_diff' | 'tax_diff' | 'invoice_date'>('value_diff');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    // Load reconciliation data
    const loadData = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const [statusResponse, mismatchResponse] = await Promise.all([
                apiClient.get('/gst/gstr2b/status'),
                apiClient.get('/gst/gstr2b/mismatches')
            ]);

            setSummary(statusResponse.data?.summary || null);
            setMismatches(statusResponse.data?.mismatches || mismatchResponse.data?.mismatches || []);

            // Cache for offline use
            await offlineStorage.storeOffline('gstr2b_reconciliation', {
                summary: statusResponse.data?.summary,
                mismatches: statusResponse.data?.mismatches || mismatchResponse.data?.mismatches || []
            }, { critical: true });

        } catch (err) {
            console.error('[ReconciliationDashboard] Load error:', err);

            // Try offline fallback
            const cached = await offlineStorage.getOffline('gstr2b_reconciliation', { critical: true });
            if (cached && cached.data) {
                setSummary(cached.data.summary);
                setMismatches(cached.data.mismatches || []);
                setError('Using cached data. Some information may be outdated.');
            } else {
                // No data available - show empty state
                setSummary(null);
                setMismatches([]);
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Run reconciliation
    const handleReconcile = async () => {
        setIsReconciling(true);
        setError(null);

        try {
            await apiClient.post('/gst/gstr2b/reconcile');
            await loadData();
            onStartReconcile?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Reconciliation failed');
        } finally {
            setIsReconciling(false);
        }
    };

    // Export mismatches
    const handleExport = () => {
        const csvHeader = 'Invoice No,Date,Supplier,GSTIN,2B Value,Books Value,Diff,2B Tax,Books Tax,Tax Diff,Type,Status\n';
        const csvRows = filteredMismatches.map(item =>
            `"${item.invoice_number}","${item.invoice_date}","${item.supplier_name}","${item.supplier_gstin}",${item.gstr2b_value},${item.books_value},${item.value_diff},${item.gstr2b_tax},${item.books_tax},${item.tax_diff},"${item.mismatch_type}","${item.status}"`
        ).join('\n');

        const blob = new Blob([csvHeader + csvRows], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gstr2b_mismatches_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Filter and sort mismatches
    const filteredMismatches = useMemo(() => {
        let items = [...mismatches];

        // Search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            items = items.filter(item =>
                item.invoice_number.toLowerCase().includes(term) ||
                item.supplier_name.toLowerCase().includes(term) ||
                item.supplier_gstin.toLowerCase().includes(term)
            );
        }

        // Mismatch type filter
        if (mismatchFilter !== 'all') {
            items = items.filter(item => item.mismatch_type === mismatchFilter);
        }

        // Status filter
        if (statusFilter !== 'all') {
            items = items.filter(item => item.status === statusFilter);
        }

        // Sort
        items.sort((a, b) => {
            const aVal = a[sortField];
            const bVal = b[sortField];
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
            }
            return sortDir === 'asc'
                ? String(aVal).localeCompare(String(bVal))
                : String(bVal).localeCompare(String(aVal));
        });

        return items;
    }, [mismatches, searchTerm, mismatchFilter, statusFilter, sortField, sortDir]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Format currency
    const formatCurrency = (amount: number): string => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount);
    };

    // Get mismatch type badge
    const getMismatchBadge = (type: MismatchItem['mismatch_type']) => {
        const config = {
            value: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Value Diff' },
            tax: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Tax Diff' },
            both: { bg: 'bg-red-100', text: 'text-red-800', label: 'Both Diff' },
            missing_in_books: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Missing in Books' },
            missing_in_2b: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Missing in 2B' }
        };
        const c = config[type];
        return (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
                {c.label}
            </span>
        );
    };

    // Get status badge
    const getStatusBadge = (status: MismatchItem['status']) => {
        const config = {
            pending: { bg: 'bg-gray-100', text: 'text-gray-800', icon: Clock },
            resolved: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle },
            accepted: { bg: 'bg-blue-100', text: 'text-blue-800', icon: CheckCircle },
            rejected: { bg: 'bg-red-100', text: 'text-red-800', icon: XCircle }
        };
        const c = config[status];
        const Icon = c.icon;
        return (
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
                <Icon className="h-3 w-3 mr-1" />
                {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
        );
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <span className="ml-2 text-gray-600">Loading reconciliation data...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-gray-900">GSTR-2B Reconciliation</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Compare GSTR-2B data with your purchase records
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={loadData}
                        disabled={isLoading}
                        className="inline-flex items-center px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                        <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                    <button
                        onClick={handleReconcile}
                        disabled={isReconciling}
                        className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        {isReconciling ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Reconciling...
                            </>
                        ) : (
                            <>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Run Reconciliation
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <AlertCircle className="h-5 w-5 text-red-500" />
                    <p className="text-sm text-red-800">{error}</p>
                    <button onClick={() => setError(null)} className="ml-auto text-red-600 hover:underline text-sm">
                        Dismiss
                    </button>
                </div>
            )}

            {/* Empty State */}
            {!summary && mismatches.length === 0 && (
                <div className="text-center py-16 bg-gray-50 rounded-xl border border-gray-200">
                    <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900">No Reconciliation Data</h3>
                    <p className="text-gray-500 mt-2 max-w-md mx-auto">
                        Upload a GSTR-2B file first, then run reconciliation to compare with your purchase records.
                    </p>
                    {onStartReconcile && (
                        <button
                            onClick={onStartReconcile}
                            className="mt-6 inline-flex items-center px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"
                        >
                            Upload GSTR-2B
                            <ArrowRight className="h-4 w-4 ml-2" />
                        </button>
                    )}
                </div>
            )}

            {/* Summary Cards */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-800 rounded-xl p-5">
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-slate-400">Matched</p>
                            <CheckCircle className="h-5 w-5 text-emerald-400" />
                        </div>
                        <p className="text-2xl font-bold text-white mt-2">{summary.matched}</p>
                        <p className="text-xs text-emerald-400 mt-1">
                            {summary.total_2b_invoices > 0
                                ? `${Math.round((summary.matched / summary.total_2b_invoices) * 100)}% match rate`
                                : '0%'}
                        </p>
                    </div>

                    <div className="bg-slate-800 rounded-xl p-5">
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-slate-400">Mismatched</p>
                            <AlertTriangle className="h-5 w-5 text-amber-400" />
                        </div>
                        <p className="text-2xl font-bold text-amber-400 mt-2">{summary.mismatched}</p>
                        <p className="text-xs text-slate-400 mt-1">Require review</p>
                    </div>

                    <div className="bg-slate-800 rounded-xl p-5">
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-slate-400">Value Difference</p>
                            {summary.value_difference >= 0 ? (
                                <TrendingUp className="h-5 w-5 text-red-400" />
                            ) : (
                                <TrendingDown className="h-5 w-5 text-green-400" />
                            )}
                        </div>
                        <p className={`text-2xl font-bold mt-2 ${summary.value_difference >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                            {formatCurrency(Math.abs(summary.value_difference))}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                            {summary.value_difference >= 0 ? 'Higher in 2B' : 'Lower in 2B'}
                        </p>
                    </div>

                    <div className="bg-slate-800 rounded-xl p-5">
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-slate-400">ITC at Risk</p>
                            <AlertCircle className="h-5 w-5 text-red-400" />
                        </div>
                        <p className="text-2xl font-bold text-red-400 mt-2">
                            {formatCurrency(Math.abs(summary.tax_difference))}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">Review mismatches</p>
                    </div>
                </div>
            )}

            {/* Mismatch Details Section */}
            {mismatches.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    {/* Filters */}
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                            <div className="flex-1 max-w-md">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Search invoices..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <select
                                    value={mismatchFilter}
                                    onChange={(e) => setMismatchFilter(e.target.value as MismatchFilter)}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                >
                                    <option value="all">All Types</option>
                                    <option value="value">Value Diff</option>
                                    <option value="tax">Tax Diff</option>
                                    <option value="both">Both Diff</option>
                                    <option value="missing_in_books">Missing in Books</option>
                                    <option value="missing_in_2b">Missing in 2B</option>
                                </select>

                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                >
                                    <option value="all">All Status</option>
                                    <option value="pending">Pending</option>
                                    <option value="resolved">Resolved</option>
                                    <option value="accepted">Accepted</option>
                                    <option value="rejected">Rejected</option>
                                </select>

                                <button
                                    onClick={handleExport}
                                    className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-sm"
                                >
                                    <Download className="h-4 w-4 mr-1" />
                                    Export
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                        Invoice Details
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                        Supplier
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                                        onClick={() => {
                                            if (sortField === 'value_diff') setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                                            else { setSortField('value_diff'); setSortDir('desc'); }
                                        }}
                                    >
                                        <span className="inline-flex items-center">
                                            Value Diff
                                            {sortField === 'value_diff' && (
                                                sortDir === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                                            )}
                                        </span>
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                                        onClick={() => {
                                            if (sortField === 'tax_diff') setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                                            else { setSortField('tax_diff'); setSortDir('desc'); }
                                        }}
                                    >
                                        <span className="inline-flex items-center">
                                            Tax Diff
                                            {sortField === 'tax_diff' && (
                                                sortDir === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                                            )}
                                        </span>
                                    </th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                                        Type
                                    </th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                                        Status
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredMismatches.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                                            <p>No mismatches found matching your filters</p>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredMismatches.map((item) => (
                                        <React.Fragment key={item.id}>
                                            <tr
                                                className="hover:bg-gray-50 cursor-pointer"
                                                onClick={() => setExpandedRow(expandedRow === item.id ? null : item.id)}
                                            >
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm font-medium text-gray-900">{item.invoice_number}</div>
                                                    <div className="text-sm text-gray-500">{item.invoice_date}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm font-medium text-gray-900">{item.supplier_name}</div>
                                                    <div className="text-xs text-gray-500 font-mono">{item.supplier_gstin}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                                    <div className={`text-sm font-medium ${item.value_diff > 0 ? 'text-red-600' : item.value_diff < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                                                        {item.value_diff > 0 ? '+' : ''}{formatCurrency(item.value_diff)}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                                    <div className={`text-sm font-medium ${item.tax_diff > 0 ? 'text-red-600' : item.tax_diff < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                                                        {item.tax_diff > 0 ? '+' : ''}{formatCurrency(item.tax_diff)}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                                    {getMismatchBadge(item.mismatch_type)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                                    {getStatusBadge(item.status)}
                                                </td>
                                            </tr>
                                            {/* Expanded Row Detail */}
                                            {expandedRow === item.id && (
                                                <tr className="bg-gray-50">
                                                    <td colSpan={6} className="px-6 py-4">
                                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                            <div>
                                                                <p className="text-xs text-gray-500">GSTR-2B Value</p>
                                                                <p className="text-sm font-medium text-gray-900">{formatCurrency(item.gstr2b_value)}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-xs text-gray-500">Books Value</p>
                                                                <p className="text-sm font-medium text-gray-900">{formatCurrency(item.books_value)}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-xs text-gray-500">GSTR-2B Tax</p>
                                                                <p className="text-sm font-medium text-gray-900">{formatCurrency(item.gstr2b_tax)}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-xs text-gray-500">Books Tax</p>
                                                                <p className="text-sm font-medium text-gray-900">{formatCurrency(item.books_tax)}</p>
                                                            </div>
                                                        </div>
                                                        {item.resolution_notes && (
                                                            <div className="mt-3 p-3 bg-amber-50 rounded-lg">
                                                                <p className="text-xs text-amber-700">
                                                                    <strong>Notes:</strong> {item.resolution_notes}
                                                                </p>
                                                            </div>
                                                        )}
                                                        <div className="mt-4 flex gap-2">
                                                            <button className="px-3 py-1.5 text-xs text-white bg-green-600 rounded hover:bg-green-700">
                                                                Accept 2B Value
                                                            </button>
                                                            <button className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded hover:bg-blue-700">
                                                                Accept Books Value
                                                            </button>
                                                            <button className="px-3 py-1.5 text-xs text-gray-700 bg-gray-200 rounded hover:bg-gray-300">
                                                                Add Note
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
                        <p className="text-sm text-gray-500">
                            Showing {filteredMismatches.length} of {mismatches.length} mismatches
                        </p>
                        <div className="flex items-center gap-2">
                            <Info className="h-4 w-4 text-gray-400" />
                            <span className="text-xs text-gray-500">Click a row to expand details</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReconciliationDashboard;
