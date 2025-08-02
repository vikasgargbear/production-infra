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
  ArrowDownRight
} from 'lucide-react';
import { customersApi, salesApi } from '../services/api';

const PaymentDashboard = () => {
  const [dateRange, setDateRange] = useState('month');
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
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

  const loadAnalytics = () => {
    setLoading(true);
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
    }

    // Simulate API call
    setTimeout(() => {
      // TODO: Implement payment service
      const data = {};
      
      // Add some sample data for demonstration
      setAnalytics({
        ...data,
        totalCollected: 12500000,
        paymentCount: 347,
        averagePaymentAmount: 36023,
        previousPeriod: {
          totalCollected: 11200000,
          paymentCount: 312
        },
        collectionRate: 92.5,
        avgCollectionDays: 23,
        paymentModes: {
          upi: { count: 125, amount: 4500000 },
          cheque: { count: 89, amount: 5200000 },
          rtgs_neft: { count: 67, amount: 2300000 },
          cash: { count: 45, amount: 450000 },
          card: { count: 21, amount: 50000 }
        },
        reconciliationMetrics: {
          autoReconciled: 298,
          manualReview: 35,
          pending: 14,
          duplicates: 0,
          failed: 0
        },
        topCustomers: [
          { name: 'City Hospital Pharmacy', totalAmount: 2500000, paymentCount: 24 },
          { name: 'Apollo Pharmacy', totalAmount: 1800000, paymentCount: 18 },
          { name: 'MedPlus Store', totalAmount: 1500000, paymentCount: 15 },
          { name: 'Wellness Medical', totalAmount: 1200000, paymentCount: 12 },
          { name: 'Krishna Pharmacy', totalAmount: 950000, paymentCount: 20 }
        ],
        overdueAnalysis: {
          totalOverdue: 3500000,
          overdueCount: 45,
          agingBuckets: {
            '0-30': { count: 20, amount: 1200000 },
            '31-60': { count: 15, amount: 1300000 },
            '61-90': { count: 7, amount: 700000 },
            '90+': { count: 3, amount: 300000 }
          }
        },
        dailyTrends: generateDailyTrends(30)
      });
      setLoading(false);
    }, 1000);
  };

  // Generate sample daily trends
  function generateDailyTrends(days) {
    const trends = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      trends.push({
        date: date.toISOString().split('T')[0],
        amount: Math.floor(Math.random() * 500000) + 200000,
        count: Math.floor(Math.random() * 20) + 5
      });
    }
    return trends;
  }

  const formatCurrency = (amount) => {
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
    if (!previous) return 0;
    return ((current - previous) / previous * 100).toFixed(1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
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
            onClick={loadAnalytics}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center">
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Collected</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {formatCurrency(analytics.totalCollected)}
              </p>
              <div className="flex items-center mt-2">
                {analytics.previousPeriod && (
                  <>
                    {parseFloat(calculateGrowth(analytics.totalCollected, analytics.previousPeriod.totalCollected)) > 0 ? (
                      <>
                        <ArrowUpRight className="w-4 h-4 text-green-500 mr-1" />
                        <span className="text-sm text-green-600">
                          {calculateGrowth(analytics.totalCollected, analytics.previousPeriod.totalCollected)}%
                        </span>
                      </>
                    ) : (
                      <>
                        <ArrowDownRight className="w-4 h-4 text-red-500 mr-1" />
                        <span className="text-sm text-red-600">
                          {Math.abs(calculateGrowth(analytics.totalCollected, analytics.previousPeriod.totalCollected))}%
                        </span>
                      </>
                    )}
                    <span className="text-sm text-gray-500 ml-2">vs last period</span>
                  </>
                )}
              </div>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <IndianRupee className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Payment Count</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">{analytics.paymentCount}</p>
              <div className="flex items-center mt-2">
                <span className="text-sm text-gray-500">
                  Avg: {formatCurrency(analytics.averagePaymentAmount)}
                </span>
              </div>
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <Activity className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Collection Rate</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">{analytics.collectionRate}%</p>
              <div className="flex items-center mt-2">
                <span className="text-sm text-gray-500">
                  Avg days: {analytics.avgCollectionDays}
                </span>
              </div>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg">
              <Target className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Outstanding</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {formatCurrency(analytics.overdueAnalysis.totalOverdue)}
              </p>
              <div className="flex items-center mt-2">
                <span className="text-sm text-orange-600">
                  {analytics.overdueAnalysis.overdueCount} overdue
                </span>
              </div>
            </div>
            <div className="p-3 bg-orange-50 rounded-lg">
              <AlertCircle className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex space-x-8">
          {['overview', 'modes', 'customers', 'reconciliation', 'trends'].map(tab => (
            <button
              key={tab}
              onClick={() => setSelectedMetric(tab)}
              className={`pb-3 px-1 border-b-2 transition-colors ${
                selectedMetric === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {selectedMetric === 'overview' && (
          <>
            {/* Payment Modes Distribution */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <h3 className="text-lg font-semibold mb-4">Payment Mode Distribution</h3>
              <div className="space-y-4">
                {Object.entries(analytics.paymentModes).map(([mode, data]) => {
                  const config = paymentModeConfig[mode];
                  const Icon = config?.icon || CreditCard;
                  const percentage = (data.amount / analytics.totalCollected * 100).toFixed(1);
                  
                  return (
                    <div key={mode} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <Icon className={`w-5 h-5 text-${config?.color || 'gray'}-600 mr-2`} />
                          <span className="font-medium">{config?.label || mode}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-semibold">{formatCurrency(data.amount)}</span>
                          <span className="text-sm text-gray-500 ml-2">({percentage}%)</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`bg-${config?.color || 'gray'}-500 h-2 rounded-full transition-all duration-500`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <p className="text-sm text-gray-500">{data.count} transactions</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Overdue Analysis */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <h3 className="text-lg font-semibold mb-4">Overdue Aging Analysis</h3>
              <div className="space-y-4">
                {Object.entries(analytics.overdueAnalysis.agingBuckets).map(([bucket, data]) => (
                  <div key={bucket} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <span className="font-medium">{bucket} days</span>
                      <p className="text-sm text-gray-500">{data.count} invoices</p>
                    </div>
                    <span className="font-semibold text-orange-600">
                      {formatCurrency(data.amount)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-700">Total Overdue</span>
                  <span className="text-xl font-bold text-orange-600">
                    {formatCurrency(analytics.overdueAnalysis.totalOverdue)}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        {selectedMetric === 'customers' && (
          <>
            {/* Top Customers */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 lg:col-span-2">
              <h3 className="text-lg font-semibold mb-4">Top Paying Customers</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-medium text-gray-700">Customer</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-700">Total Paid</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-700">Payments</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-700">Avg Payment</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-700">% of Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.topCustomers.map((customer, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <div className="flex items-center">
                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                              <span className="text-sm font-medium text-blue-600">
                                {customer.name.charAt(0)}
                              </span>
                            </div>
                            <span className="font-medium">{customer.name}</span>
                          </div>
                        </td>
                        <td className="text-right py-3 px-4 font-semibold">
                          {formatCurrency(customer.totalAmount)}
                        </td>
                        <td className="text-right py-3 px-4">{customer.paymentCount}</td>
                        <td className="text-right py-3 px-4">
                          {formatCurrency(customer.totalAmount / customer.paymentCount)}
                        </td>
                        <td className="text-right py-3 px-4">
                          <span className="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                            {((customer.totalAmount / analytics.totalCollected) * 100).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {selectedMetric === 'reconciliation' && (
          <>
            {/* Reconciliation Status */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <h3 className="text-lg font-semibold mb-4">Reconciliation Status</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                    <div>
                      <p className="font-medium">Auto Reconciled</p>
                      <p className="text-sm text-gray-600">Automatically matched and verified</p>
                    </div>
                  </div>
                  <span className="text-2xl font-bold text-green-600">
                    {analytics.reconciliationMetrics.autoReconciled}
                  </span>
                </div>

                <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg">
                  <div className="flex items-center">
                    <AlertCircle className="w-5 h-5 text-yellow-600 mr-3" />
                    <div>
                      <p className="font-medium">Manual Review</p>
                      <p className="text-sm text-gray-600">Requires manual verification</p>
                    </div>
                  </div>
                  <span className="text-2xl font-bold text-yellow-600">
                    {analytics.reconciliationMetrics.manualReview}
                  </span>
                </div>

                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center">
                    <Clock className="w-5 h-5 text-blue-600 mr-3" />
                    <div>
                      <p className="font-medium">Pending</p>
                      <p className="text-sm text-gray-600">Awaiting reconciliation</p>
                    </div>
                  </div>
                  <span className="text-2xl font-bold text-blue-600">
                    {analytics.reconciliationMetrics.pending}
                  </span>
                </div>
              </div>
            </div>

            {/* Reconciliation Efficiency */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <h3 className="text-lg font-semibold mb-4">Reconciliation Efficiency</h3>
              <div className="flex items-center justify-center h-48">
                <div className="relative">
                  <div className="w-40 h-40 rounded-full border-8 border-gray-200"></div>
                  <div 
                    className="absolute top-0 left-0 w-40 h-40 rounded-full border-8 border-green-500"
                    style={{
                      clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%)`,
                      transform: `rotate(${(analytics.reconciliationMetrics.autoReconciled / analytics.paymentCount * 360)}deg)`
                    }}
                  ></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-gray-900">
                        {((analytics.reconciliationMetrics.autoReconciled / analytics.paymentCount) * 100).toFixed(1)}%
                      </p>
                      <p className="text-sm text-gray-600">Auto Rate</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {selectedMetric === 'trends' && (
          <>
            {/* Daily Collection Trend */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 lg:col-span-2">
              <h3 className="text-lg font-semibold mb-4">Daily Collection Trend</h3>
              <div className="h-64 flex items-end space-x-2">
                {analytics.dailyTrends.slice(-30).map((day, index) => {
                  const maxAmount = Math.max(...analytics.dailyTrends.map(d => d.amount));
                  const height = (day.amount / maxAmount) * 100;
                  
                  return (
                    <div
                      key={index}
                      className="flex-1 bg-blue-500 hover:bg-blue-600 rounded-t transition-all duration-200 relative group"
                      style={{ height: `${height}%` }}
                    >
                      <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {new Date(day.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        <br />
                        {formatCurrency(day.amount)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2 text-xs text-gray-500">
                <span>{new Date(analytics.dailyTrends[0].date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                <span>{new Date(analytics.dailyTrends[analytics.dailyTrends.length - 1].date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
              </div>
            </div>
          </>
        )}

        {selectedMetric === 'modes' && (
          <>
            {/* Payment Mode Performance */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 lg:col-span-2">
              <h3 className="text-lg font-semibold mb-4">Payment Mode Performance</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {Object.entries(analytics.paymentModes).map(([mode, data]) => {
                  const config = paymentModeConfig[mode];
                  const Icon = config?.icon || CreditCard;
                  
                  return (
                    <div key={mode} className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className={`w-12 h-12 mx-auto mb-3 bg-${config?.color || 'gray'}-100 rounded-lg flex items-center justify-center`}>
                        <Icon className={`w-6 h-6 text-${config?.color || 'gray'}-600`} />
                      </div>
                      <h4 className="font-medium mb-2">{config?.label || mode}</h4>
                      <p className="text-2xl font-bold text-gray-900">{data.count}</p>
                      <p className="text-sm text-gray-600">transactions</p>
                      <p className="text-lg font-semibold text-gray-700 mt-2">
                        {formatCurrency(data.amount)}
                      </p>
                      <p className="text-xs text-gray-500">
                        Avg: {formatCurrency(data.amount / data.count)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PaymentDashboard;