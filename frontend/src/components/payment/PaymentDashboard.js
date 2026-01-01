import React, { useState, useEffect } from 'react';
import {
  IndianRupee,
  TrendingUp,
  TrendingDown,
  Calendar,
  Download,
  Filter,
  RefreshCw,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Clock,
  CreditCard,
  Banknote,
  Smartphone,
  Building,
  FileText,
  Users,
  BarChart3,
  PieChart,
  Activity,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Loader2
} from 'lucide-react';
import { customersApi, invoicesApi, paymentsApi } from '../../services/api';

const PaymentDashboard = () => {
  const [dateRange, setDateRange] = useState('month');
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState('overview');

  // Payment mode configurations
  const paymentModeConfig = {
    cash: { icon: Banknote, color: 'green', label: 'Cash' },
    upi: { icon: Smartphone, color: 'purple', label: 'UPI' },
    cheque: { icon: FileText, color: 'blue', label: 'Cheque' },
    rtgs_neft: { icon: Building, color: 'orange', label: 'RTGS/NEFT' },
    card: { icon: CreditCard, color: 'pink', label: 'Card' }
  };

  useEffect(() => {
    loadAnalytics();
  }, [dateRange]);

  const loadAnalytics = async () => {
    setLoading(true);
    setError(null);

    const endDate = new Date();
    const startDate = new Date();

    switch (dateRange) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate.setMonth(startDate.getMonth() - 1);
    }

    try {
      // Temporarily skip non-existent analytics endpoints; use safe defaults
      const analyticsData = {
        totalCollected: 0,
        paymentCount: 0,
        averagePaymentAmount: 0,
        previousPeriod: { totalCollected: 0, paymentCount: 0 },
        collectionRate: 0,
        avgCollectionDays: 0,
        paymentModes: {},
        reconciliationMetrics: {
          autoReconciled: 0,
          manualReview: 0,
          pending: 0,
          duplicates: 0,
          failed: 0
        },
        topCustomers: [],
        overdueAnalysis: {
          totalOverdue: 0,
          overdueCount: 0,
          agingBuckets: {
            '0-30': { count: 0, amount: 0 },
            '31-60': { count: 0, amount: 0 },
            '61-90': { count: 0, amount: 0 },
            '90+': { count: 0, amount: 0 }
          }
        },
        dailyTrends: []
      };

      setAnalytics(analyticsData);

      // Store data offline for future use
      await offlineStorage.storeOffline(`payment_analytics_${dateRange}`, analyticsData, {
        persistent: true
      });

    } catch (error) {

      // Try to load from offline storage instead of using mock data
      const offlineData = await offlineStorage.getOffline(`payment_analytics_${dateRange}`, { persistent: true });

      if (offlineData && !offlineStorage.isDataStale(offlineData, 60)) { // 1 hour max for analytics
        setAnalytics(offlineData.data);

        // Show offline indicator
        setError('Currently using offline data. Some information may be outdated.');
      } else {
        // No offline data available - show proper error instead of mock data
        setError('Unable to load payment analytics. Please check your connection and try again.');
        setAnalytics({
          totalCollected: 0,
          paymentCount: 0,
          averagePaymentAmount: 0,
          previousPeriod: { totalCollected: 0, paymentCount: 0 },
          collectionRate: 0,
          avgCollectionDays: 0,
          paymentModes: {},
          reconciliationMetrics: {
            autoReconciled: 0,
            manualReview: 0,
            pending: 0,
            duplicates: 0,
            failed: 0
          },
          topCustomers: [],
          overdueAnalysis: {
            totalOverdue: 0,
            overdueCount: 0,
            agingBuckets: {
              '0-30': { count: 0, amount: 0 },
              '31-60': { count: 0, amount: 0 },
              '61-90': { count: 0, amount: 0 },
              '90+': { count: 0, amount: 0 }
            }
          },
          dailyTrends: []
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);

    try {
      await loadAnalytics();
    } catch (error) {
      setError('Failed to refresh data. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const formatCurrency = (amount) => {
    if (!amount || amount === 0) return '₹0';

    if (amount >= 10000000) {
      return `₹${(amount / 10000000).toFixed(1)}Cr`;
    } else if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(1)}L`;
    } else if (amount >= 1000) {
      return `₹${(amount / 1000).toFixed(1)}K`;
    }
    return `₹${amount}`;
  };

  const calculateGrowth = (current, previous) => {
    if (!previous || previous === 0) return 0;
    return ((current - previous) / previous * 100).toFixed(1);
  };

  // Load data on component mount
  useEffect(() => {
    loadAnalytics();
  }, []);

  // Clear old offline data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      offlineStorage.clearOldData(24); // Clear data older than 24 hours
    }, 60 * 60 * 1000); // Check every hour

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
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
            onChange={(e) => setDateRange(e.target.value)}
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
            <Download className="w-4 w-4 mr-2" />
            Export Report
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
              <span className="text-red-800">{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-sm text-red-600 hover:text-red-800 underline"
            >
              Dismiss
            </button>
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
          <div className="mt-4 flex items-center text-sm">
            {analytics.previousPeriod?.paymentCount > 0 ? (
              <>
                {analytics.paymentCount > analytics.previousPeriod.paymentCount ? (
                  <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
                )}
                <span className={analytics.paymentCount > analytics.previousPeriod.paymentCount ? 'text-green-600' : 'text-red-600'}>
                  {calculateGrowth(analytics.paymentCount, analytics.previousPeriod.paymentCount)}%
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
              ></div>
            </div>
            <p className="text-sm text-gray-500 mt-1">Target: 95%</p>
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
          <div className="mt-4">
            <p className="text-sm text-gray-500">
              {analytics.avgCollectionDays <= 30 ? 'Excellent' :
                analytics.avgCollectionDays <= 45 ? 'Good' :
                  analytics.avgCollectionDays <= 60 ? 'Fair' : 'Needs Attention'}
            </p>
          </div>
        </div>
      </div>

      {/* Payment Modes Distribution */}
      {Object.keys(analytics.paymentModes).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Modes Distribution</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {Object.entries(analytics.paymentModes).map(([mode, data]) => {
              const config = paymentModeConfig[mode] || { icon: CreditCard, color: 'gray', label: mode };
              const IconComponent = config.icon;
              const percentage = analytics.totalCollected > 0 ? ((data.amount / analytics.totalCollected) * 100).toFixed(1) : 0;

              return (
                <div key={mode} className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className={`inline-flex p-3 bg-${config.color}-100 rounded-full mb-3`}>
                    <IconComponent className={`w-6 h-6 text-${config.color}-600`} />
                  </div>
                  <p className="font-medium text-gray-900">{config.label}</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(data.amount)}</p>
                  <p className="text-sm text-gray-500">{data.count} payments</p>
                  <p className="text-xs text-gray-400">{percentage}% of total</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
              <p className="text-2xl font-bold text-gray-900">{analytics.reconciliationMetrics.manualReview}</p>
              <p className="text-sm text-gray-600">Manual Review</p>
            </div>
            <div className="text-center">
              <div className="p-3 bg-orange-100 rounded-full inline-block mb-2">
                <AlertCircle className="w-6 h-6 text-orange-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{analytics.reconciliationMetrics.pending}</p>
              <p className="text-sm text-gray-600">Pending</p>
            </div>
            <div className="text-center">
              <div className="p-3 bg-red-100 rounded-full inline-block mb-2">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{analytics.reconciliationMetrics.failed}</p>
              <p className="text-sm text-gray-600">Failed</p>
            </div>
            <div className="text-center">
              <div className="p-3 bg-gray-100 rounded-full inline-block mb-2">
                <FileText className="w-6 h-6 text-gray-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{analytics.reconciliationMetrics.duplicates}</p>
              <p className="text-sm text-gray-600">Duplicates</p>
            </div>
          </div>
        </div>
      )}

      {/* Top Customers */}
      {analytics.topCustomers && analytics.topCustomers.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Customers by Collection</h3>
          <div className="space-y-3">
            {analytics.topCustomers.map((customer, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <span className="text-lg font-bold text-gray-400 mr-3">#{index + 1}</span>
                  <div>
                    <p className="font-medium text-gray-900">{customer.name}</p>
                    <p className="text-sm text-gray-500">{customer.paymentCount} payments</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-900">{formatCurrency(customer.totalAmount)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overdue Analysis */}
      {analytics.overdueAnalysis && (
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Overdue Analysis</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <p className="text-2xl font-bold text-red-600">{formatCurrency(analytics.overdueAnalysis.totalOverdue)}</p>
              <p className="text-sm text-gray-600">Total Overdue</p>
              <p className="text-xs text-gray-500">{analytics.overdueAnalysis.overdueCount} invoices</p>
            </div>
            {Object.entries(analytics.overdueAnalysis.agingBuckets).map(([range, data]) => (
              <div key={range} className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-lg font-bold text-gray-900">{formatCurrency(data.amount)}</p>
                <p className="text-sm text-gray-600">{range} days</p>
                <p className="text-xs text-gray-500">{data.count} invoices</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily Trends Chart */}
      {analytics.dailyTrends && analytics.dailyTrends.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Collection Trends</h3>
          <div className="h-64 flex items-end justify-between space-x-1">
            {analytics.dailyTrends.map((day, index) => {
              const maxAmount = Math.max(...analytics.dailyTrends.map(d => d.amount));
              const height = maxAmount > 0 ? (day.amount / maxAmount) * 100 : 0;

              return (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div className="w-full bg-blue-200 rounded-t" style={{ height: `${height}%` }}>
                    <div className="bg-blue-600 h-full rounded-t"></div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    {new Date(day.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                  </p>
                  <p className="text-xs font-medium text-gray-700 mt-1">
                    {formatCurrency(day.amount)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {(!analytics.totalCollected && !analytics.paymentCount) && (
        <div className="text-center py-12">
          <Activity className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Payment Data Available</h3>
          <p className="text-gray-500 mb-4">
            {error ? 'Unable to load payment analytics at this time.' : 'Start recording payments to see analytics here.'}
          </p>
          {!error && (
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Refresh Data
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default PaymentDashboard;