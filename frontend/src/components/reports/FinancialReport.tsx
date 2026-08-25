import React, { useState, useMemo, useEffect } from 'react';
import { DollarSign, TrendingUp, CreditCard, Calendar, AlertCircle, ArrowUpRight, ArrowDownRight, Wallet } from 'lucide-react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
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
import apiClient from '../../services/api/apiClient';
import { format, startOfWeek, startOfMonth, startOfQuarter, startOfYear } from 'date-fns';

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

interface FinancialMetric {
  label: string;
  current: number;
  previous: number | null;
  change: number | null;
  changePercent: number | null;
  trend: 'up' | 'down' | null;
}

const requiredNumberFact = (source: Record<string, unknown>, key: string): number => {
  const raw = source[key];
  if ((typeof raw !== 'number' && typeof raw !== 'string') || raw === '') {
    throw new Error(`Financial summary is missing authoritative ${key}.`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Financial summary ${key} is not a finite number.`);
  }
  return value;
};

const optionalNumberFact = (source: Record<string, unknown>, key: string): number | null => (
  source[key] === null || source[key] === undefined
    ? null
    : requiredNumberFact(source, key)
);

const requiredTextFact = (source: Record<string, unknown>, key: string): string => {
  const value = source[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Financial transaction is missing authoritative ${key}.`);
  }
  return value;
};

const transactionStatus = (value: unknown): Transaction['status'] => {
  if (value === 'posted' || value === 'paid' || value === 'completed') return 'Completed';
  if (value === 'draft' || value === 'submitted' || value === 'approved' || value === 'pending') return 'Pending';
  if (value === 'overdue') return 'Overdue';
  throw new Error('Financial transaction status is outside the canonical lifecycle.');
};

interface Transaction {
  id: string;
  date: string;
  type: 'Income' | 'Expense';
  category: string;
  description: string;
  amount: number;
  status: 'Completed' | 'Pending' | 'Overdue';
  reference: string;
}

const FinancialReport: React.FC = () => {
  const [period, setPeriod] = useState('month');
  const [view, setView] = useState<'overview' | 'cashflow' | 'receivables' | 'payables'>('overview');
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<FinancialMetric[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [chartData, setChartData] = useState<any>({});

  useEffect(() => {
    loadFinancialData();
  }, [period, view]);

  const loadFinancialData = async () => {
    setLoading(true);
    try {
      // Calculate date range based on period
      const endDate = new Date();
      let startDate = new Date();

      switch (period) {
        case 'week':
          startDate = startOfWeek(endDate);
          break;
        case 'month':
          startDate = startOfMonth(endDate);
          break;
        case 'quarter':
          startDate = startOfQuarter(endDate);
          break;
        case 'year':
          startDate = startOfYear(endDate);
          break;
      }

      const dateParams = {
        date_from: format(startDate, 'yyyy-MM-dd'),
        date_to: format(endDate, 'yyyy-MM-dd')
      };

      // Fetch real data from API endpoints
      const [financialSummary, cashFlow, recentTransactions, expenseAnalysis] = await Promise.all([
        apiClient.get('/financial/summary', { params: dateParams }),
        apiClient.get('/financial/cash-flow', { params: dateParams }),
        apiClient.get('/financial/transactions', { params: { ...dateParams, limit: 10 } }),
        apiClient.get('/financial/expense-breakdown', { params: dateParams })
      ]);

      // Process metrics
      if (!financialSummary.data || typeof financialSummary.data !== 'object' || Array.isArray(financialSummary.data)) {
        throw new Error('Financial summary response is not an authoritative object.');
      }
      const summaryData = financialSummary.data as Record<string, unknown>;
      const metric = (
        label: string,
        currentKey: string,
        previousKey: string,
        changeKey: string,
        percentKey: string,
        lowerIsBetter = false,
      ): FinancialMetric => {
        const change = optionalNumberFact(summaryData, changeKey);
        return {
          label,
          current: requiredNumberFact(summaryData, currentKey),
          previous: optionalNumberFact(summaryData, previousKey),
          change,
          changePercent: optionalNumberFact(summaryData, percentKey),
          trend: change === null ? null : (
            (lowerIsBetter ? change <= 0 : change >= 0) ? 'up' : 'down'
          ),
        };
      };
      const calculatedMetrics: FinancialMetric[] = [
        metric('Total Revenue', 'total_revenue', 'previous_revenue', 'revenue_change', 'revenue_change_percent'),
        metric('Gross Profit', 'gross_profit', 'previous_gross_profit', 'gross_profit_change', 'gross_profit_change_percent'),
        metric('Net Profit', 'net_profit', 'previous_net_profit', 'net_profit_change', 'net_profit_change_percent'),
        metric('Operating Expenses', 'operating_expenses', 'previous_operating_expenses', 'operating_expenses_change', 'operating_expenses_change_percent', true),
        metric('Accounts Receivable', 'accounts_receivable', 'previous_accounts_receivable', 'receivable_change', 'receivable_change_percent', true),
        metric('Accounts Payable', 'accounts_payable', 'previous_accounts_payable', 'payable_change', 'payable_change_percent', true),
      ];
      setMetrics(calculatedMetrics);

      // Process transactions
      if (!Array.isArray(recentTransactions.data)) {
        throw new Error('Financial transactions response is not an authoritative list.');
      }
      const processedTransactions: Transaction[] = recentTransactions.data.map((item: Record<string, unknown>) => ({
        id: requiredTextFact(item, 'id'),
        date: requiredTextFact(item, 'date'),
        type: item.type === 'income' ? 'Income' : item.type === 'expense' ? 'Expense' : (() => {
          throw new Error('Financial transaction type is outside the canonical contract.');
        })(),
        category: requiredTextFact(item, 'category'),
        description: typeof item.description === 'string' ? item.description : '',
        amount: requiredNumberFact(item, 'amount'),
        status: transactionStatus(item.status),
        reference: typeof item.reference === 'string' ? item.reference : '',
      }));
      setTransactions(processedTransactions);

      // Store chart data for later use
      setChartData({
        cashFlow: cashFlow.data,
        expenseBreakdown: expenseAnalysis.data
      });

    } catch (error) {
      console.error('Error loading financial data:', error);
      // Set empty state on error
      setMetrics([]);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const cashFlowData = useMemo(() => {
    if (!chartData.cashFlow || chartData.cashFlow.length === 0) {
      return { labels: [], datasets: [] };
    }

    const labels = chartData.cashFlow.map((item: Record<string, unknown>) => requiredTextFact(item, 'period'));
    return {
      labels,
      datasets: [
        {
          label: 'Cash Inflow',
          data: chartData.cashFlow.map((item: Record<string, unknown>) => requiredNumberFact(item, 'income')),
          backgroundColor: 'rgba(34, 197, 94, 0.8)',
          borderWidth: 0
        },
        {
          label: 'Cash Outflow',
          data: chartData.cashFlow.map((item: Record<string, unknown>) => requiredNumberFact(item, 'expenses')),
          backgroundColor: 'rgba(239, 68, 68, 0.8)',
          borderWidth: 0
        }
      ]
    };
  }, [chartData]);

  const revenueVsExpensesTrend = useMemo(() => {
    // This will be populated from API data in loadFinancialData
    // For now return empty structure that will be filled with real data
    return {
      labels: [],
      datasets: [
        {
          label: 'Revenue',
          data: [],
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.3,
          fill: true
        },
        {
          label: 'Expenses',
          data: [],
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.3,
          fill: true
        },
        {
          label: 'Profit',
          data: [],
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          tension: 0.3,
          fill: true
        }
      ]
    };
  }, []);

  const expenseBreakdown = useMemo(() => {
    if (!chartData.expenseBreakdown) {
      return { labels: [], datasets: [] };
    }

    const breakdown = chartData.expenseBreakdown;
    return {
      labels: Object.keys(breakdown),
      datasets: [{
        data: Object.values(breakdown),
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(147, 51, 234, 0.8)',
          'rgba(251, 146, 60, 0.8)',
          'rgba(34, 197, 94, 0.8)',
          'rgba(239, 68, 68, 0.8)',
          'rgba(156, 163, 175, 0.8)'
        ],
        borderWidth: 0
      }]
    };
  }, [chartData]);

  const formatCurrency = (amount: number) => {
    return `₹${Math.abs(amount).toLocaleString('en-IN')}`;
  };

  const getChangeIcon = (trend: 'up' | 'down' | null) => {
    if (trend === null) return null;
    if (trend === 'up') {
      return <ArrowUpRight className="h-4 w-4 text-green-600" />;
    } else {
      return <ArrowDownRight className="h-4 w-4 text-red-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      Completed: 'bg-green-100 text-green-800',
      Pending: 'bg-yellow-100 text-yellow-800',
      Overdue: 'bg-red-100 text-red-800'
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status as keyof typeof colors]}`}>
        {status}
      </span>
    );
  };
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading financial data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Financial Report</h1>
              <p className="text-gray-600 mt-1">Revenue, expenses, and cash flow analysis</p>
            </div>
            <div className="flex gap-2">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="quarter">This Quarter</option>
                <option value="year">This Year</option>
              </select>
            </div>
          </div>

          {/* View Tabs */}
          <nav aria-label="Financial report views" className="mt-6 flex gap-4 overflow-x-auto border-b border-gray-200">
            {(['overview', 'cashflow', 'receivables', 'payables'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setView(tab)}
                className={`min-h-11 shrink-0 whitespace-nowrap border-b-2 px-1 pb-3 transition-colors ${
                  view === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1).replace('flow', ' Flow')}
              </button>
            ))}
          </nav>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 p-6 border-b border-gray-200">
          {metrics.map((metric, index) => (
            <div key={index} className="p-4 border border-gray-200 rounded-lg">
              <div className="flex items-start justify-between mb-2">
                <div className="p-2 bg-gray-100 rounded-lg">
                  {index === 0 && <DollarSign className="h-5 w-5 text-green-600" />}
                  {index === 1 && <TrendingUp className="h-5 w-5 text-blue-600" />}
                  {index === 2 && <Wallet className="h-5 w-5 text-purple-600" />}
                  {index === 3 && <CreditCard className="h-5 w-5 text-orange-600" />}
                  {index === 4 && <ArrowUpRight className="h-5 w-5 text-indigo-600" />}
                  {index === 5 && <ArrowDownRight className="h-5 w-5 text-red-600" />}
                </div>
                {getChangeIcon(metric.trend)}
              </div>
              <p className="text-xs text-gray-600 mb-1">{metric.label}</p>
              <p className="text-lg font-bold text-gray-900">
                {formatCurrency(metric.current)}
              </p>
              {metric.change === null || metric.changePercent === null ? (
                <p className="mt-1 text-xs text-slate-500">Previous-period comparison unavailable</p>
              ) : (
                <p className={`mt-1 text-xs ${metric.trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                  {metric.change > 0 ? '+' : ''}{metric.changePercent.toFixed(1)}% from last period
                </p>
              )}
            </div>
          ))}
        </div>

        {view === 'overview' && (
          <>
            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 border-b border-gray-200">
              <div className="lg:col-span-2">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue vs Expenses Trend</h3>
                <Line
                  data={revenueVsExpensesTrend}
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
                            return `${context.dataset.label}: ₹${((context.parsed.y ?? 0) / 100000).toFixed(1)}L`;
                          }
                        }
                      }
                    },
                    scales: {
                      y: {
                        ticks: {
                          callback: (value) => `₹${(value as number / 100000).toFixed(0)}L`
                        }
                      }
                    }
                  }}
                  height={300}
                />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Expense Breakdown</h3>
                <Doughnut
                  data={expenseBreakdown}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom' as const,
                        labels: {
                          padding: 10,
                          font: {
                            size: 11
                          }
                        }
                      },
                      tooltip: {
                        callbacks: {
                          label: (context) => {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            return `${label}: ₹${(value / 1000).toFixed(0)}K`;
                          }
                        }
                      }
                    }
                  }}
                  height={300}
                />
              </div>
            </div>

            {/* Recent Transactions */}
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Recent Transactions</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-gray-700">Date</th>
                      <th className="text-left py-3 px-4 text-gray-700">Type</th>
                      <th className="text-left py-3 px-4 text-gray-700">Description</th>
                      <th className="text-left py-3 px-4 text-gray-700">Reference</th>
                      <th className="text-center py-3 px-4 text-gray-700">Status</th>
                      <th className="text-right py-3 px-4 text-gray-700">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((transaction, index) => (
                      <tr key={transaction.id} className={`border-b border-gray-100 hover:bg-gray-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                        <td className="py-3 px-4">
                          <div className="flex items-center">
                            <Calendar className="h-3 w-3 mr-2 text-gray-400" />
                            {new Date(transaction.date).toLocaleDateString('en-IN')}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`font-medium ${
                            transaction.type === 'Income' ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {transaction.type}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-medium text-gray-900">{transaction.description}</p>
                          <p className="text-xs text-gray-500">{transaction.category}</p>
                        </td>
                        <td className="py-3 px-4 text-gray-600">{transaction.reference}</td>
                        <td className="py-3 px-4 text-center">
                          {getStatusBadge(transaction.status)}
                        </td>
                        <td className="py-3 px-4 text-right font-medium">
                          <span className={transaction.type === 'Income' ? 'text-green-600' : 'text-red-600'}>
                            {transaction.type === 'Income' ? '+' : '-'}{formatCurrency(transaction.amount)}
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

        {view === 'cashflow' && (
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Cash Flow Analysis</h3>
            <Bar
              data={cashFlowData}
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
                        return `${context.dataset.label}: ₹${((context.parsed.y ?? 0) / 1000).toFixed(0)}K`;
                      }
                    }
                  }
                },
                scales: {
                  y: {
                    ticks: {
                      callback: (value) => `₹${(value as number / 1000).toFixed(0)}K`
                    }
                  }
                }
              }}
              height={400}
            />
            <div
              className="mt-6 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600"
              role="status"
            >
              Cash-flow summary metrics are unavailable until the canonical reporting API publishes
              their exact values and comparison periods.
            </div>
          </div>
        )}

        {(view === 'receivables' || view === 'payables') && (
          <div className="p-6">
            <div className="flex items-start gap-2 mb-4" role="status">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              <p className="text-gray-700">
                {view === 'receivables' ? 'Receivable' : 'Payable'} aging is unavailable until the
                canonical ledger API publishes exact bucket balances and source-document counts.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FinancialReport;
