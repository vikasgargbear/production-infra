import React, { useState, useEffect, useMemo } from 'react';
import {
  Wallet, TrendingUp, CreditCard, Clock, DollarSign, CheckCircle,
  XCircle, AlertCircle, Download, RefreshCw, Loader2
} from 'lucide-react';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { format, subDays } from 'date-fns';
import apiClient from '../../services/api/apiClient';
import { formatCurrency } from '../../utils/formatters';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface PaymentData {
  id: string;
  amount: number;
  method: string;
  status: string;
  date: string;
  reference: string;
  customer: string;
  type: 'received' | 'sent';
}

interface PaymentSummary {
  totalReceived: number;
  totalSent: number;
  netFlow: number;
  pendingPayments: number;
  completedPayments: number;
  failedPayments: number;
  avgTransactionValue: number;
}

interface PaymentAnalyticsData {
  payments: PaymentData[];
  summary: PaymentSummary;
  methodBreakdown: { [key: string]: number };
  statusBreakdown: { [key: string]: number };
  trends: {
    labels: string[];
    received: number[];
    sent: number[];
  };
  dailyFlow: {
    labels: string[];
    inflow: number[];
    outflow: number[];
  };
}

const PaymentAnalytics: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [selectedMethod, setSelectedMethod] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [data, setData] = useState<PaymentAnalyticsData>({
    payments: [],
    summary: {
      totalReceived: 0,
      totalSent: 0,
      netFlow: 0,
      pendingPayments: 0,
      completedPayments: 0,
      failedPayments: 0,
      avgTransactionValue: 0
    },
    methodBreakdown: {},
    statusBreakdown: {},
    trends: { labels: [], received: [], sent: [] },
    dailyFlow: { labels: [], inflow: [], outflow: [] }
  });

  useEffect(() => {
    // Set default date range to last 30 days
    const end = new Date();
    const start = subDays(end, 30);
    setDateRange({
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd')
    });
  }, []);

  useEffect(() => {
    if (dateRange.start && dateRange.end) {
      loadPaymentData();
    }
  }, [dateRange, selectedMethod, selectedStatus]);

  const loadPaymentData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [paymentsResponse, analyticsResponse, trendsResponse] = await Promise.all([
        apiClient.get('/payments/analytics/list', {
          params: {
            date_from: dateRange.start,
            date_to: dateRange.end,
            method: selectedMethod !== 'all' ? selectedMethod : undefined,
            status: selectedStatus !== 'all' ? selectedStatus : undefined
          }
        }),
        apiClient.get('/payments/analytics/summary', {
          params: {
            date_from: dateRange.start,
            date_to: dateRange.end
          }
        }),
        apiClient.get('/payments/analytics/trends', {
          params: {
            date_from: dateRange.start,
            date_to: dateRange.end
          }
        })
      ]);

      const payments = paymentsResponse.data?.payments || [];
      const analytics = analyticsResponse.data || {};
      const trends = trendsResponse.data || {};

      setData({
        payments,
        summary: {
          totalReceived: analytics.total_received || 0,
          totalSent: analytics.total_sent || 0,
          netFlow: analytics.net_flow || 0,
          pendingPayments: analytics.pending_payments || 0,
          completedPayments: analytics.completed_payments || 0,
          failedPayments: analytics.failed_payments || 0,
          avgTransactionValue: analytics.avg_transaction_value || 0
        },
        methodBreakdown: analytics.method_breakdown || {},
        statusBreakdown: analytics.status_breakdown || {},
        trends: trends.monthly || { labels: [], received: [], sent: [] },
        dailyFlow: trends.daily || { labels: [], inflow: [], outflow: [] }
      });
    } catch (err) {
      console.error('Error loading payment data:', err);
      setError('Failed to load payment analytics. Please try again.');
      // Set empty state instead of mock data
      setData({
        payments: [],
        summary: {
          totalReceived: 0,
          totalSent: 0,
          netFlow: 0,
          pendingPayments: 0,
          completedPayments: 0,
          failedPayments: 0,
          avgTransactionValue: 0
        },
        methodBreakdown: {},
        statusBreakdown: {},
        trends: { labels: [], received: [], sent: [] },
        dailyFlow: { labels: [], inflow: [], outflow: [] }
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPaymentData();
    setRefreshing(false);
  };

  const filteredPayments = useMemo(() => {
    let filtered = data.payments;

    if (selectedMethod !== 'all') {
      filtered = filtered.filter(p => p.method === selectedMethod);
    }

    if (selectedStatus !== 'all') {
      filtered = filtered.filter(p => p.status === selectedStatus);
    }

    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [data.payments, selectedMethod, selectedStatus]);

  const methodChartData = useMemo(() => {
    const methods = Object.keys(data.methodBreakdown);
    const values = Object.values(data.methodBreakdown);

    return {
      labels: methods.map(method => method.charAt(0).toUpperCase() + method.slice(1)),
      datasets: [{
        data: values,
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(34, 197, 94, 0.8)',
          'rgba(251, 146, 60, 0.8)',
          'rgba(147, 51, 234, 0.8)',
          'rgba(239, 68, 68, 0.8)',
          'rgba(156, 163, 175, 0.8)'
        ],
        borderWidth: 0
      }]
    };
  }, [data.methodBreakdown]);

  const trendsChartData = useMemo(() => {
    return {
      labels: data.trends.labels.length > 0 ? data.trends.labels : ['No Data'],
      datasets: [
        {
          label: 'Payments Received',
          data: data.trends.received.length > 0 ? data.trends.received : [0],
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          tension: 0.3,
          fill: true
        },
        {
          label: 'Payments Sent',
          data: data.trends.sent.length > 0 ? data.trends.sent : [0],
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.3,
          fill: true
        }
      ]
    };
  }, [data.trends]);

  const dailyFlowChartData = useMemo(() => {
    return {
      labels: data.dailyFlow.labels.length > 0 ? data.dailyFlow.labels : ['No Data'],
      datasets: [
        {
          label: 'Inflow',
          data: data.dailyFlow.inflow.length > 0 ? data.dailyFlow.inflow : [0],
          backgroundColor: 'rgba(34, 197, 94, 0.8)',
          borderWidth: 0
        },
        {
          label: 'Outflow',
          data: data.dailyFlow.outflow.length > 0 ? data.dailyFlow.outflow : [0],
          backgroundColor: 'rgba(239, 68, 68, 0.8)',
          borderWidth: 0
        }
      ]
    };
  }, [data.dailyFlow]);

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'paid':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'failed':
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'paid':
        return 'text-green-600 bg-green-50';
      case 'pending':
        return 'text-yellow-600 bg-yellow-50';
      case 'failed':
      case 'cancelled':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const paymentMethods = ['all', 'cash', 'card', 'upi', 'bank', 'check'];
  const paymentStatuses = ['all', 'completed', 'pending', 'failed'];

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Payment Analytics</h1>
              <p className="text-gray-600 mt-1">Payment collection, processing, and financial flow analysis</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
              >
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </button>
              <button className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                <Download className="h-4 w-4" />
                Export Report
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-4 mt-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <span className="flex items-center text-gray-500">to</span>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
              <select
                value={selectedMethod}
                onChange={(e) => setSelectedMethod(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {paymentMethods.map(method => (
                  <option key={method} value={method}>
                    {method === 'all' ? 'All Methods' : method.charAt(0).toUpperCase() + method.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {paymentStatuses.map(status => (
                  <option key={status} value={status}>
                    {status === 'all' ? 'All Statuses' : status.charAt(0).toUpperCase() + status.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-gray-600">Loading payment analytics...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-6 border-b border-gray-200">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
                <span className="text-red-700">{error}</span>
                <button
                  onClick={() => setError(null)}
                  className="ml-auto text-red-500 hover:text-red-700"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 border-b border-gray-200">
            <div className="p-4 border border-gray-200 rounded-lg">
              <Wallet className="h-8 w-8 text-green-600 mb-2" />
              <p className="text-sm text-gray-600">Total Received</p>
              <p className="text-xl font-bold text-green-600">{formatCurrency(data.summary.totalReceived)}</p>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg">
              <CreditCard className="h-8 w-8 text-red-600 mb-2" />
              <p className="text-sm text-gray-600">Total Sent</p>
              <p className="text-xl font-bold text-red-600">{formatCurrency(data.summary.totalSent)}</p>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg">
              <TrendingUp className="h-8 w-8 text-blue-600 mb-2" />
              <p className="text-sm text-gray-600">Net Flow</p>
              <p className={`text-xl font-bold ${data.summary.netFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(data.summary.netFlow)}
              </p>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg">
              <DollarSign className="h-8 w-8 text-purple-600 mb-2" />
              <p className="text-sm text-gray-600">Avg Transaction</p>
              <p className="text-xl font-bold">{formatCurrency(data.summary.avgTransactionValue)}</p>
            </div>
          </div>
        )}

        {/* Status Summary */}
        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 border-b border-gray-200">
            <div className="p-4 border border-green-200 rounded-lg bg-green-50">
              <CheckCircle className="h-8 w-8 text-green-600 mb-2" />
              <p className="text-sm text-green-700">Completed</p>
              <p className="text-xl font-bold text-green-700">{data.summary.completedPayments}</p>
            </div>
            <div className="p-4 border border-yellow-200 rounded-lg bg-yellow-50">
              <Clock className="h-8 w-8 text-yellow-600 mb-2" />
              <p className="text-sm text-yellow-700">Pending</p>
              <p className="text-xl font-bold text-yellow-700">{data.summary.pendingPayments}</p>
            </div>
            <div className="p-4 border border-red-200 rounded-lg bg-red-50">
              <XCircle className="h-8 w-8 text-red-600 mb-2" />
              <p className="text-sm text-red-700">Failed</p>
              <p className="text-xl font-bold text-red-700">{data.summary.failedPayments}</p>
            </div>
          </div>
        )}

        {/* Charts */}
        {!loading && Object.keys(data.methodBreakdown).length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 border-b border-gray-200">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Methods</h3>
              <Doughnut
                data={methodChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'bottom' as const
                    },
                    tooltip: {
                      callbacks: {
                        label: (context) => {
                          return `${context.label}: ${formatCurrency(context.parsed)}`;
                        }
                      }
                    }
                  }
                }}
                height={250}
              />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Trends</h3>
              <Line
                data={trendsChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'bottom' as const
                    },
                    tooltip: {
                      callbacks: {
                        label: (context) => {
                          return `${context.dataset.label}: ${formatCurrency(context.parsed.y ?? 0)}`;
                        }
                      }
                    }
                  },
                  scales: {
                    y: {
                      ticks: {
                        callback: (value) => formatCurrency(value as number)
                      }
                    }
                  }
                }}
                height={250}
              />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Cash Flow</h3>
              <Bar
                data={dailyFlowChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'bottom' as const
                    },
                    tooltip: {
                      callbacks: {
                        label: (context) => {
                          return `${context.dataset.label}: ${formatCurrency(context.parsed.y ?? 0)}`;
                        }
                      }
                    }
                  },
                  scales: {
                    y: {
                      ticks: {
                        callback: (value) => formatCurrency(value as number)
                      }
                    }
                  }
                }}
                height={250}
              />
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && data.payments.length === 0 && !error && (
          <div className="p-12 text-center border-b border-gray-200">
            <Wallet className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Payment Data Found</h3>
            <p className="text-gray-600 mb-4">There are no payments to analyze for the selected period.</p>
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Refresh Data
            </button>
          </div>
        )}

        {/* Payment List */}
        {!loading && filteredPayments.length > 0 && (
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Payments</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-gray-700">Date</th>
                    <th className="text-left py-3 px-4 text-gray-700">Reference</th>
                    <th className="text-left py-3 px-4 text-gray-700">Customer</th>
                    <th className="text-left py-3 px-4 text-gray-700">Method</th>
                    <th className="text-right py-3 px-4 text-gray-700">Amount</th>
                    <th className="text-center py-3 px-4 text-gray-700">Type</th>
                    <th className="text-center py-3 px-4 text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.slice(0, 50).map((payment, index) => (
                    <tr key={payment.id} className={`border-b border-gray-100 hover:bg-gray-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {format(new Date(payment.date), 'MMM dd, yyyy')}
                      </td>
                      <td className="py-3 px-4 font-medium text-gray-900">{payment.reference}</td>
                      <td className="py-3 px-4 text-gray-600">{payment.customer}</td>
                      <td className="py-3 px-4 text-gray-600 capitalize">{payment.method}</td>
                      <td className={`py-3 px-4 text-right font-medium ${payment.type === 'received' ? 'text-green-600' : 'text-red-600'}`}>
                        {payment.type === 'received' ? '+' : '-'}{formatCurrency(payment.amount)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          payment.type === 'received' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {payment.type === 'received' ? 'Received' : 'Sent'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(payment.status)}`}>
                          {getStatusIcon(payment.status)}
                          <span className="ml-1 capitalize">{payment.status}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentAnalytics;
