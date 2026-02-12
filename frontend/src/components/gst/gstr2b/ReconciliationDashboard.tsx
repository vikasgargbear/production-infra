import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    RefreshCw,
    AlertTriangle,
    CheckCircle,
    XCircle,
    Download,
    Search,
    Loader2,
    AlertCircle,
    ArrowRight,
    ArrowLeft,
    FileText,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { apiClient } from '../../../services/api';

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
    resolution?: 'accept_2b' | 'keep_books' | 'skipped';
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

type ReviewPhase = 'pre-review' | 'reviewing' | 'completed';

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
    const [reviewPhase, setReviewPhase] = useState<ReviewPhase>('pre-review');
    const [currentIndex, setCurrentIndex] = useState(0);
    const [autoResolveThreshold] = useState(10);

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
            setMismatches(
                (statusResponse.data?.mismatches || mismatchResponse.data?.mismatches || []).map((m: any) => ({
                    ...m,
                    resolution: m.resolution || undefined
                }))
            );
        } catch (err) {
            setSummary(null);
            setMismatches([]);
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
        const csvHeader = 'Invoice No,Date,Supplier,GSTIN,2B Value,Books Value,Diff,2B Tax,Books Tax,Tax Diff,Type,Status,Resolution\n';
        const csvRows = mismatches.map(item =>
            `"${item.invoice_number}","${item.invoice_date}","${item.supplier_name}","${item.supplier_gstin}",${item.gstr2b_value},${item.books_value},${item.value_diff},${item.gstr2b_tax},${item.books_tax},${item.tax_diff},"${item.mismatch_type}","${item.status}","${item.resolution || ''}"`
        ).join('\n');

        const blob = new Blob([csvHeader + csvRows], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gstr2b_reconciliation_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Pending mismatches (not yet reviewed)
    const pendingMismatches = useMemo(() =>
        mismatches.filter(m => !m.resolution),
        [mismatches]
    );

    // Minor difference count (< threshold)
    const minorDiffCount = useMemo(() =>
        pendingMismatches.filter(m => Math.abs(m.value_diff) < autoResolveThreshold && Math.abs(m.tax_diff) < autoResolveThreshold).length,
        [pendingMismatches, autoResolveThreshold]
    );

    // Auto-resolve minor differences
    const handleAutoResolve = () => {
        setMismatches(prev => prev.map(m => {
            if (!m.resolution && Math.abs(m.value_diff) < autoResolveThreshold && Math.abs(m.tax_diff) < autoResolveThreshold) {
                return { ...m, resolution: 'accept_2b', status: 'accepted' as const };
            }
            return m;
        }));
    };

    // Start card-by-card review
    const handleStartReview = () => {
        setCurrentIndex(0);
        setReviewPhase('reviewing');
    };

    // Resolve current mismatch
    const resolveItem = (resolution: 'accept_2b' | 'keep_books' | 'skipped') => {
        const currentItem = pendingMismatches[currentIndex];
        if (!currentItem) return;

        setMismatches(prev => prev.map(m => {
            if (m.id === currentItem.id) {
                return {
                    ...m,
                    resolution,
                    status: resolution === 'accept_2b' ? 'accepted' as const :
                        resolution === 'keep_books' ? 'rejected' as const : 'pending' as const
                };
            }
            return m;
        }));

        // Move to next or complete
        if (currentIndex >= pendingMismatches.length - 1) {
            setReviewPhase('completed');
        } else {
            setCurrentIndex(prev => prev + 1);
        }
    };

    // Format currency
    const formatCurrency = (amount: number): string => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount);
    };

    // Resolution counts
    const resolutionCounts = useMemo(() => ({
        accepted: mismatches.filter(m => m.resolution === 'accept_2b').length,
        kept: mismatches.filter(m => m.resolution === 'keep_books').length,
        skipped: mismatches.filter(m => m.resolution === 'skipped').length,
        pending: mismatches.filter(m => !m.resolution).length,
    }), [mismatches]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Keyboard navigation
    useEffect(() => {
        if (reviewPhase !== 'reviewing') return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft' && currentIndex > 0) {
                setCurrentIndex(prev => prev - 1);
            } else if (e.key === 'ArrowRight' && currentIndex < pendingMismatches.length - 1) {
                setCurrentIndex(prev => prev + 1);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [reviewPhase, currentIndex, pendingMismatches.length]);

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

            {/* Summary Strip (light-themed) */}
            {summary && (
                <div className="flex items-center gap-4 bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border-l-4 border-amber-400 rounded">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <span className="text-sm font-medium text-amber-800">{summary.mismatched} need review</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border-l-4 border-green-400 rounded">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium text-green-800">{summary.matched} matched</span>
                    </div>
                    {Math.abs(summary.tax_difference) > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border-l-4 border-red-400 rounded">
                            <AlertCircle className="h-4 w-4 text-red-600" />
                            <span className="text-sm font-medium text-red-800">ITC at risk: {formatCurrency(Math.abs(summary.tax_difference))}</span>
                        </div>
                    )}
                    <div className="ml-auto">
                        <button
                            onClick={handleExport}
                            className="inline-flex items-center px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm text-gray-600"
                        >
                            <Download className="h-4 w-4 mr-1" />
                            Export
                        </button>
                    </div>
                </div>
            )}

            {/* Review Section */}
            {mismatches.length > 0 && reviewPhase === 'pre-review' && (
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Review Mismatches</h3>

                    {/* Bulk action */}
                    {minorDiffCount > 0 && (
                        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                            <span className="text-sm text-blue-800">
                                {minorDiffCount} invoice{minorDiffCount > 1 ? 's' : ''} have differences under ₹{autoResolveThreshold}
                            </span>
                            <button
                                onClick={handleAutoResolve}
                                className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200"
                            >
                                Auto-accept minor differences
                            </button>
                        </div>
                    )}

                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleStartReview}
                            disabled={pendingMismatches.length === 0}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            Start Review ({pendingMismatches.length} items)
                            <ArrowRight className="h-4 w-4 ml-2" />
                        </button>

                        {resolutionCounts.accepted + resolutionCounts.kept > 0 && (
                            <span className="text-sm text-gray-500">
                                {resolutionCounts.accepted} accepted, {resolutionCounts.kept} kept, {resolutionCounts.skipped} skipped
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Card-by-Card Review Mode */}
            {reviewPhase === 'reviewing' && pendingMismatches.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    {/* Progress bar */}
                    <div className="px-6 py-3 bg-gray-50 border-b">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-700">
                                Reviewing {currentIndex + 1} of {pendingMismatches.length} mismatches
                            </span>
                            <button
                                onClick={() => setReviewPhase('pre-review')}
                                className="text-sm text-gray-500 hover:text-gray-700"
                            >
                                Exit Review
                            </button>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                                className="h-2 rounded-full bg-blue-600 transition-all"
                                style={{ width: `${((currentIndex + 1) / pendingMismatches.length) * 100}%` }}
                            />
                        </div>
                    </div>

                    {/* Mismatch Card */}
                    {(() => {
                        const item = pendingMismatches[currentIndex];
                        if (!item) return null;

                        const valueDiffSign = item.value_diff > 0 ? '+' : '';
                        const taxDiffSign = item.tax_diff > 0 ? '+' : '';

                        return (
                            <div className="p-6 space-y-6">
                                {/* Supplier Info */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900">{item.supplier_name}</h3>
                                        <p className="text-sm text-gray-500 font-mono">{item.supplier_gstin}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-medium text-gray-900">{item.invoice_number}</p>
                                        <p className="text-sm text-gray-500">{item.invoice_date}</p>
                                    </div>
                                </div>

                                {/* Side-by-side comparison */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                                        <div className="text-xs font-medium text-purple-600 uppercase mb-2">GSTR-2B Says</div>
                                        <div className="text-2xl font-bold text-gray-900">{formatCurrency(item.gstr2b_value)}</div>
                                        <div className="text-sm text-gray-600 mt-1">Tax: {formatCurrency(item.gstr2b_tax)}</div>
                                    </div>
                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                        <div className="text-xs font-medium text-blue-600 uppercase mb-2">Your Books Say</div>
                                        <div className="text-2xl font-bold text-gray-900">{formatCurrency(item.books_value)}</div>
                                        <div className="text-sm text-gray-600 mt-1">Tax: {formatCurrency(item.books_tax)}</div>
                                    </div>
                                </div>

                                {/* Difference explanation */}
                                <div className={`p-4 rounded-lg border-l-4 ${item.value_diff > 0 ? 'bg-amber-50 border-amber-400' : 'bg-green-50 border-green-400'}`}>
                                    <p className="text-sm font-medium text-gray-900">
                                        {formatCurrency(Math.abs(item.value_diff))} {item.value_diff > 0 ? 'more' : 'less'} in 2B
                                    </p>
                                    <p className="text-sm text-gray-600 mt-1">
                                        {item.value_diff > 0
                                            ? `Supplier reported higher value. If correct, your ITC increases by ${formatCurrency(Math.abs(item.tax_diff))}.`
                                            : `Supplier reported lower value. Your ITC may decrease by ${formatCurrency(Math.abs(item.tax_diff))}.`
                                        }
                                    </p>
                                </div>

                                {/* Action buttons */}
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => resolveItem('accept_2b')}
                                        className="flex-1 px-4 py-3 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                                    >
                                        Accept 2B Value
                                    </button>
                                    <button
                                        onClick={() => resolveItem('keep_books')}
                                        className="flex-1 px-4 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                                    >
                                        Keep My Value
                                    </button>
                                    <button
                                        onClick={() => resolveItem('skipped')}
                                        className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                                    >
                                        Skip for Now
                                    </button>
                                </div>

                                {/* Navigation */}
                                <div className="flex items-center justify-between pt-4 border-t">
                                    <button
                                        onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                                        disabled={currentIndex === 0}
                                        className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 disabled:opacity-30"
                                    >
                                        <ChevronLeft className="h-4 w-4 mr-1" />
                                        Previous
                                    </button>
                                    <span className="text-xs text-gray-400">Use arrow keys to navigate</span>
                                    <button
                                        onClick={() => setCurrentIndex(prev => Math.min(pendingMismatches.length - 1, prev + 1))}
                                        disabled={currentIndex >= pendingMismatches.length - 1}
                                        className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 disabled:opacity-30"
                                    >
                                        Next
                                        <ChevronRight className="h-4 w-4 ml-1" />
                                    </button>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* Completion Screen */}
            {reviewPhase === 'completed' && (
                <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                    <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">All Done!</h3>
                    <p className="text-gray-600 mb-6">
                        {resolutionCounts.accepted} accepted 2B values, {resolutionCounts.kept} kept your values, {resolutionCounts.skipped} skipped.
                    </p>

                    <div className="flex items-center justify-center gap-4">
                        <button
                            onClick={handleExport}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            <Download className="h-4 w-4 mr-2" />
                            Export Reconciliation Report
                        </button>
                        {resolutionCounts.skipped > 0 && (
                            <button
                                onClick={() => {
                                    setCurrentIndex(0);
                                    setReviewPhase('reviewing');
                                }}
                                className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"
                            >
                                Review Skipped ({resolutionCounts.skipped})
                                <ArrowRight className="h-4 w-4 ml-2" />
                            </button>
                        )}
                    </div>

                    <button
                        onClick={() => setReviewPhase('pre-review')}
                        className="mt-4 text-sm text-gray-500 hover:text-gray-700 underline"
                    >
                        Back to overview
                    </button>
                </div>
            )}
        </div>
    );
};

export default ReconciliationDashboard;
