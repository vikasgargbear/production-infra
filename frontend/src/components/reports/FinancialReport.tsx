import React, { useState, useMemo } from 'react';
import { DollarSign, TrendingUp, CreditCard, PiggyBank, Download, Calendar, AlertCircle, ArrowUpRight, ArrowDownRight, Wallet } from 'lucide-react';
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
  previous: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
}

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

  const metrics: FinancialMetric[] = [
    { label: 'Total Revenue', current: 2456780, previous: 2234500, change: 222280, changePercent: 9.95, trend: 'up' },
    { label: 'Gross Profit', current: 645230, previous: 589000, change: 56230, changePercent: 9.54, trend: 'up' },
    { label: 'Net Profit', current: 321450, previous: 298000, change: 23450, changePercent: 7.87, trend: 'up' },
    { label: 'Operating Expenses', current: 423780, previous: 391000, change: 32780, changePercent: 8.38, trend: 'down' },
    { label: 'Accounts Receivable', current: 321450, previous: 345000, change: -23550, changePercent: -6.83, trend: 'up' },
    { label: 'Accounts Payable', current: 187650, previous: 201000, change: -13350, changePercent: -6.64, trend: 'up' },
  ];

  const transactions: Transaction[] = [
    { id: '1', date: '2024-01-30', type: 'Income', category: 'Sales', description: 'Invoice #INV-2024-0145', amount: 45670, status: 'Completed', reference: 'Apollo Pharmacy' },
    { id: '2', date: '2024-01-29', type: 'Expense', category: 'Purchase', description: 'PO #PO-2024-0089', amount: 32100, status: 'Pending', reference: 'Cipla Ltd' },
    { id: '3', date: '2024-01-29', type: 'Income', category: 'Sales', description: 'Invoice #INV-2024-0144', amount: 78900, status: 'Completed', reference: 'City Hospital' },
    { id: '4', date: '2024-01-28', type: 'Expense', category: 'Operating', description: 'Rent Payment', amount: 50000, status: 'Completed', reference: 'Property Owner' },
    { id: '5', date: '2024-01-28', type: 'Income', category: 'Sales', description: 'Invoice #INV-2024-0143', amount: 23450, status: 'Overdue', reference: 'MedPlus' },
    { id: '6', date: '2024-01-27', type: 'Expense', category: 'Purchase', description: 'PO #PO-2024-0088', amount: 67890, status: 'Completed', reference: 'Sun Pharma' },
  ];

  const cashFlowData = useMemo(() => {
    const labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
    return {
      labels,
      datasets: [
        {
          label: 'Cash Inflow',
          data: [450000, 520000, 480000, 510000],
          backgroundColor: 'rgba(34, 197, 94, 0.8)',
          borderWidth: 0
        },
        {
          label: 'Cash Outflow',
          data: [380000, 420000, 390000, 410000],
          backgroundColor: 'rgba(239, 68, 68, 0.8)',
          borderWidth: 0
        }
      ]
    };
  }, []);

  const revenueVsExpensesTrend = useMemo(() => {
    const labels = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan'];
    return {
      labels,
      datasets: [
        {
          label: 'Revenue',
          data: [2100000, 2200000, 2280000, 2350000, 2400000, 2456780],
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.3,
          fill: true
        },
        {
          label: 'Expenses',
          data: [1850000, 1920000, 1980000, 2020000, 2080000, 2135330],
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.3,
          fill: true
        },
        {
          label: 'Profit',
          data: [250000, 280000, 300000, 330000, 320000, 321450],
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          tension: 0.3,
          fill: true
        }
      ]
    };
  }, []);

  const expenseBreakdown = useMemo(() => {
    return {
      labels: ['Purchases', 'Salaries', 'Rent', 'Utilities', 'Marketing', 'Others'],
      datasets: [{
        data: [1234560, 345670, 78900, 23450, 56780, 396970],
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
  }, []);

  const formatCurrency = (amount: number) => {
    return `₹${Math.abs(amount).toLocaleString('en-IN')}`;
  };

  const getChangeIcon = (trend: 'up' | 'down' | 'stable', isPositive: boolean) => {
    if (trend === 'up' && isPositive) {
      return <ArrowUpRight className="h-4 w-4 text-green-600" />;
    } else if (trend === 'down' || !isPositive) {
      return <ArrowDownRight className="h-4 w-4 text-red-600" />;
    }
    return null;
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
              <button className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                <Download className="h-4 w-4" />
                Export
              </button>
            </div>
          </div>

          {/* View Tabs */}
          <div className="flex gap-4 mt-6 border-b border-gray-200">
            {(['overview', 'cashflow', 'receivables', 'payables'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setView(tab)}
                className={`pb-3 px-1 border-b-2 transition-colors ${
                  view === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1).replace('flow', ' Flow')}
              </button>
            ))}
          </div>
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
                {getChangeIcon(metric.trend, metric.change > 0)}
              </div>
              <p className="text-xs text-gray-600 mb-1">{metric.label}</p>
              <p className="text-lg font-bold text-gray-900">
                {formatCurrency(metric.current)}
              </p>
              <p className={`text-xs mt-1 ${
                metric.change > 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {metric.change > 0 ? '+' : ''}{metric.changePercent.toFixed(1)}% from last period
              </p>
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
                            return `${context.dataset.label}: ₹${(context.parsed.y / 100000).toFixed(1)}L`;
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
                <button className="text-sm text-blue-600 hover:text-blue-700">
                  View All →
                </button>
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
                        return `${context.dataset.label}: ₹${(context.parsed.y / 1000).toFixed(0)}K`;
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-700">Net Cash Flow</p>
                <p className="text-2xl font-bold text-green-900">₹3,60,000</p>
                <p className="text-xs text-green-600 mt-1">+12.5% from last period</p>
              </div>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-700">Operating Cash Flow</p>
                <p className="text-2xl font-bold text-blue-900">₹4,20,000</p>
                <p className="text-xs text-blue-600 mt-1">Healthy cash generation</p>
              </div>
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-sm text-purple-700">Cash Conversion Cycle</p>
                <p className="text-2xl font-bold text-purple-900">32 days</p>
                <p className="text-xs text-purple-600 mt-1">-3 days improvement</p>
              </div>
            </div>
          </div>
        )}

        {(view === 'receivables' || view === 'payables') && (
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              <p className="text-gray-700">
                {view === 'receivables' 
                  ? 'Total Outstanding Receivables: ₹3,21,450 across 45 invoices'
                  : 'Total Outstanding Payables: ₹1,87,650 across 28 bills'
                }
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-600">Current (0-30 days)</p>
                <p className="text-xl font-bold text-green-600">
                  {view === 'receivables' ? '₹1,45,000' : '₹88,000'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {view === 'receivables' ? '18 invoices' : '12 bills'}
                </p>
              </div>
              <div className="p-4 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-600">31-60 days</p>
                <p className="text-xl font-bold text-yellow-600">
                  {view === 'receivables' ? '₹98,450' : '₹56,650'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {view === 'receivables' ? '15 invoices' : '9 bills'}
                </p>
              </div>
              <div className="p-4 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-600">61-90 days</p>
                <p className="text-xl font-bold text-orange-600">
                  {view === 'receivables' ? '₹56,000' : '₹32,000'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {view === 'receivables' ? '9 invoices' : '5 bills'}
                </p>
              </div>
              <div className="p-4 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-600">90+ days</p>
                <p className="text-xl font-bold text-red-600">
                  {view === 'receivables' ? '₹22,000' : '₹11,000'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {view === 'receivables' ? '3 invoices' : '2 bills'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FinancialReport;