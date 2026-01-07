/**
 * PaymentDashboard Component
 * 
 * Refactored from PaymentDashboard.js (545 lines)
 * Now uses usePaymentAnalytics hook for all logic.
 */

import React from 'react';
import {
    IndianRupee,
    TrendingUp,
    TrendingDown,
    Download,
    RefreshCw,
    AlertCircle,
    CreditCard,
    Banknote,
    Smartphone,
    Building,
    FileText,
    CheckCircle,
    Clock,
    Target,
    Activity,
    Loader2
} from 'lucide-react';
import { usePaymentAnalytics, type DateRangeType } from '../hooks/usePaymentAnalytics';

// Payment mode config
const paymentModeConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
    cash: { icon: Banknote, color: 'green', label: 'Cash' },
    upi: { icon: Smartphone, color: 'purple', label: 'UPI' },
    cheque: { icon: FileText, color: 'blue', label: 'Cheque' },
    rtgs_neft: { icon: Building, color: 'orange', label: 'RTGS/NEFT' },
    card: { icon: CreditCard, color: 'pink', label: 'Card' }
};

const PaymentDashboard: React.FC = () => {
    const {
        analytics,
        dateRange,
        loading,
        refreshing,
        error,
        setDateRange,
        handleRefresh,
        formatCurrency,
        calculateGrowth
    } = usePaymentAnalytics();

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
            </div>
        );
    }

    if (!analytics) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
                    <p className="text-gray-600">No analytics data available</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Payment Analytics</h2>
                    <p className="text-gray-600">Real-time insights into your payment collections</p>
                </div>
                <div className="flex items-center space-x-3">
                    <select
                        value={dateRange}
                        onChange={(e) => setDateRange(e.target.value as DateRangeType)}
                        className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="today">Today</option>
                        <option value="week">This Week</option>
                        <option value="month">This Month</option>
                        <option value="quarter">This Quarter</option>
                        <option value="year">This Year</option>
                    </select>
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
                    </button>
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center">
                        <Download className="w-4 h-4 mr-2" />
                        Export Report
                    </button>
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center">
                        <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
                        <span className="text-red-800">{error}</span>
                    </div>
                </div>
            )}

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Total Collected</p>
                            <p className="text-2xl font-bold text-gray-900">
                                {formatCurrency(analytics.totalCollected)}
                            </p>
                        </div>
                        <div className="p-2 bg-green-100 rounded-lg">
                            <IndianRupee className="w-6 h-6 text-green-600" />
                        </div>
                    </div>
                    <div className="mt-4 flex items-center text-sm">
                        {analytics.previousPeriod?.totalCollected > 0 ? (
                            <>
                                {analytics.totalCollected > analytics.previousPeriod.totalCollected ? (
                                    <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                                ) : (
                                    <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
                                )}
                                <span className={analytics.totalCollected > analytics.previousPeriod.totalCollected ? 'text-green-600' : 'text-red-600'}>
                                    {calculateGrowth(analytics.totalCollected, analytics.previousPeriod.totalCollected)}%
                                </span>
                                <span className="text-gray-500 ml-1">vs previous period</span>
                            </>
                        ) : (
                            <span className="text-gray-500">No previous data</span>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Payment Count</p>
                            <p className="text-2xl font-bold text-gray-900">{analytics.paymentCount}</p>
                        </div>
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <CreditCard className="w-6 h-6 text-blue-600" />
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Collection Rate</p>
                            <p className="text-2xl font-bold text-gray-900">{analytics.collectionRate}%</p>
                        </div>
                        <div className="p-2 bg-purple-100 rounded-lg">
                            <Target className="w-6 h-6 text-purple-600" />
                        </div>
                    </div>
                    <div className="mt-4">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                                className="bg-purple-600 h-2 rounded-full"
                                style={{ width: `${Math.min(analytics.collectionRate, 100)}%` }}
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-600">Avg Collection Days</p>
                            <p className="text-2xl font-bold text-gray-900">{analytics.avgCollectionDays}</p>
                        </div>
                        <div className="p-2 bg-orange-100 rounded-lg">
                            <Clock className="w-6 h-6 text-orange-600" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Reconciliation Metrics */}
            {analytics.reconciliationMetrics && (
                <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Reconciliation Status</h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="text-center">
                            <div className="p-3 bg-green-100 rounded-full inline-block mb-2">
                                <CheckCircle className="w-6 h-6 text-green-600" />
                            </div>
                            <p className="text-2xl font-bold text-gray-900">{analytics.reconciliationMetrics.autoReconciled}</p>
                            <p className="text-sm text-gray-600">Auto Reconciled</p>
                        </div>
                        <div className="text-center">
                            <div className="p-3 bg-yellow-100 rounded-full inline-block mb-2">
                                <Clock className="w-6 h-6 text-yellow-600" />
                            </div>
                            <p className="text-2xl font-bold text-gray-900">{analytics.reconciliationMetrics.pending}</p>
                            <p className="text-sm text-gray-600">Pending</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {(!analytics.totalCollected && !analytics.paymentCount) && (
                <div className="text-center py-12">
                    <Activity className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Payment Data Available</h3>
                    <p className="text-gray-500">Start recording payments to see analytics here.</p>
                </div>
            )}
        </div>
    );
};

export default PaymentDashboard;
