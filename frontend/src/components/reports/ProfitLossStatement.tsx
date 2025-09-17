import React, { useState, useEffect, useMemo } from 'react';
import { FileText, Download, Printer, Calendar, TrendingUp, TrendingDown, Filter, ChevronRight, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import apiClient from '../../services/api/apiClient';
import { formatCurrency } from '../../utils/formatters';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface PLItem {
  label: string;
  amount: number;
  previousAmount?: number;
  isHeader?: boolean;
  isSubtotal?: boolean;
  indent?: number;
  expandable?: boolean;
  children?: PLItem[];
}

interface ComparisonData {
  currentPeriod: number;
  previousPeriod: number;
  variance: number;
  variancePercent: number;
}

interface PLData {
  items: PLItem[];
  trends: {
    labels: string[];
    revenue: number[];
    netProfit: number[];
    expenses: number[];
  };
  categoryBreakdown: {
    labels: string[];
    values: number[];
  };
  summary: {
    grossMargin: number;
    operatingMargin: number;
    netMargin: number;
    ebitdaMargin: number;
    grossMarginChange?: number;
    operatingMarginChange?: number;
    netMarginChange?: number;
    ebitdaMarginChange?: number;
  };
}

const ProfitLossStatement: React.FC = () => {
  const [period, setPeriod] = useState('month');
  const [year, setYear] = useState('2024');
  const [month, setMonth] = useState('01');
  const [comparisonMode, setComparisonMode] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showChart, setShowChart] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PLData>({
    items: [],
    trends: { labels: [], revenue: [], netProfit: [], expenses: [] },
    categoryBreakdown: { labels: [], values: [] },
    summary: { grossMargin: 0, operatingMargin: 0, netMargin: 0, ebitdaMargin: 0 }
  });

  useEffect(() => {
    loadPLData();
  }, [period, year, month, comparisonMode]);

  const loadPLData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = {
        period,
        year: parseInt(year)
      };

      if (period === 'month') {
        params.month = parseInt(month);
      }

      if (comparisonMode) {
        params.comparison = true;
      }

      const [plResponse, trendsResponse, summaryResponse] = await Promise.all([
        apiClient.get('/reports/profit-loss', { params }),
        apiClient.get('/reports/profit-loss/trends', { params }),
        apiClient.get('/reports/profit-loss/summary', { params })
      ]);

      const plItems = plResponse.data?.items || [];
      const trends = trendsResponse.data || { labels: [], revenue: [], netProfit: [], expenses: [] };
      const summary = summaryResponse.data || { grossMargin: 0, operatingMargin: 0, netMargin: 0, ebitdaMargin: 0 };

      // Process category breakdown from PL items
      const categoryBreakdown = {
        labels: ['Sales Revenue', 'COGS', 'Operating Expenses', 'Other Expenses', 'Tax'],
        values: [
          plItems.find(item => item.label === 'Sales Revenue')?.amount || 0,
          plItems.find(item => item.label === 'Total COGS')?.amount || 0,
          plItems.find(item => item.label === 'Total Operating Expenses')?.amount || 0,
          plItems.find(item => item.label === 'Total Other Expenses')?.amount || 0,
          plItems.find(item => item.label === 'Income Tax')?.amount || 0
        ]
      };

      setData({
        items: plItems,
        trends,
        categoryBreakdown,
        summary
      });
    } catch (err) {
      console.error('Error loading P&L data:', err);
      setError('Failed to load profit & loss statement. Please try again.');
      // Set empty state instead of mock data
      setData({
        items: [],
        trends: { labels: [], revenue: [], netProfit: [], expenses: [] },
        categoryBreakdown: { labels: [], values: [] },
        summary: { grossMargin: 0, operatingMargin: 0, netMargin: 0, ebitdaMargin: 0 }
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPLData();
    setRefreshing(false);
  };

  // Use API data only - no mock fallback
  const plData = data.items || [];

  const toggleRowExpansion = (label: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(label)) {
      newExpanded.delete(label);
    } else {
      newExpanded.add(label);
    }
    setExpandedRows(newExpanded);
  };

  const getVariance = (current: number, previous: number) => {
    const variance = current - previous;
    const variancePercent = previous !== 0 ? (variance / previous) * 100 : 0;
    return { variance, variancePercent };
  };

  const trendData = useMemo(() => {
    return {
      labels: data.trends.labels.length > 0 ? data.trends.labels : ['No Data'],
      datasets: [
        {
          label: 'Revenue',
          data: data.trends.revenue.length > 0 ? data.trends.revenue : [0],
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.3,
          fill: true
        },
        {
          label: 'Net Profit',
          data: data.trends.netProfit.length > 0 ? data.trends.netProfit : [0],
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          tension: 0.3,
          fill: true
        },
        {
          label: 'Operating Expenses',
          data: data.trends.expenses.length > 0 ? data.trends.expenses : [0],
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.3,
          fill: true
        }
      ]
    };
  }, [data.trends]);

  const categoryBreakdown = useMemo(() => {
    return {
      labels: data.categoryBreakdown.labels.length > 0 ? data.categoryBreakdown.labels : ['No Data'],
      datasets: [{
        label: 'Amount',
        data: data.categoryBreakdown.values.length > 0 ? data.categoryBreakdown.values : [0],
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(239, 68, 68, 0.8)',
          'rgba(251, 146, 60, 0.8)',
          'rgba(163, 163, 163, 0.8)',
          'rgba(147, 51, 234, 0.8)'
        ],
        borderWidth: 0
      }]
    };
  }, [data.categoryBreakdown]);

  const formatCurrencyPL = (amount: number) => {
    if (amount === 0) return '';
    const isNegative = amount < 0;
    const absAmount = Math.abs(amount);
    const formatted = `₹${absAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return isNegative ? `(${formatted})` : formatted;
  };

  const formatVariance = (variance: number, percent: number) => {
    const isPositive = variance >= 0;
    const color = isPositive ? 'text-green-600' : 'text-red-600';
    const icon = isPositive ? '↑' : '↓';
    return (
      <span className={`${color} text-sm`}>
        {icon} {Math.abs(percent).toFixed(1)}%
      </span>
    );
  };

  const getRowClass = (item: PLItem) => {
    if (item.isHeader) return 'font-bold text-gray-700 bg-gray-100';
    if (item.isSubtotal) return 'font-bold text-gray-900 border-t border-b border-gray-300';
    if (item.indent === 2) return 'text-gray-500 text-sm';
    if (item.indent) return 'text-gray-600';
    return '';
  };

  const renderTableRows = (data: PLItem[]) => {
    const rows: JSX.Element[] = [];
    
    data.forEach((item, index) => {
      const isExpanded = expandedRows.has(item.label);
      const { variance, variancePercent } = getVariance(item.amount, item.previousAmount || 0);
      
      rows.push(
        <tr key={index} className={getRowClass(item)}>
          <td className={`py-2 ${item.indent ? `pl-${item.indent * 8}` : ''}`}>
            <div className="flex items-center">
              {item.expandable && (
                <button
                  onClick={() => toggleRowExpansion(item.label)}
                  className="mr-2 text-gray-500 hover:text-gray-700"
                >
                  <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </button>
              )}
              {item.label}
            </div>
          </td>
          <td className="text-right py-2">
            {formatCurrencyPL(item.amount)}
          </td>
          {comparisonMode && (
            <>
              <td className="text-right py-2 text-gray-500">
                {formatCurrencyPL(item.previousAmount || 0)}
              </td>
              <td className="text-right py-2">
                {item.previousAmount && !item.isHeader && formatVariance(variance, variancePercent)}
              </td>
            </>
          )}
        </tr>
      );
      
      if (item.expandable && isExpanded && item.children) {
        item.children.forEach((child, childIndex) => {
          const childVariance = getVariance(child.amount, child.previousAmount || 0);
          rows.push(
            <tr key={`${index}-${childIndex}`} className={getRowClass(child)}>
              <td className={`py-1 pl-${(child.indent || 0) * 8}`}>
                {child.label}
              </td>
              <td className="text-right py-1">
                {formatCurrencyPL(child.amount)}
              </td>
              {comparisonMode && (
                <>
                  <td className="text-right py-1 text-gray-500">
                    {formatCurrencyPL(child.previousAmount || 0)}
                  </td>
                  <td className="text-right py-1">
                    {child.previousAmount && formatVariance(childVariance.variance, childVariance.variancePercent)}
                  </td>
                </>
              )}
            </tr>
          );
        });
      }
    });
    
    return rows;
  };

  const exportToPDF = () => {
  };

  const exportToExcel = () => {
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Profit & Loss Statement</h1>
              <p className="text-gray-600 mt-1">Financial performance overview</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
              >
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </button>
              <button
                onClick={() => setComparisonMode(!comparisonMode)}
                className={`px-4 py-2 border rounded-lg flex items-center gap-2 ${
                  comparisonMode
                    ? 'bg-blue-50 text-blue-700 border-blue-300'
                    : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50'
                }`}
              >
                <Filter className="h-4 w-4" />
                Compare
              </button>
              <button
                onClick={exportToExcel}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Excel
              </button>
              <button
                onClick={exportToPDF}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
              >
                <FileText className="h-4 w-4" />
                PDF
              </button>
              <button
                onClick={handlePrint}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
              >
                <Printer className="h-4 w-4" />
                Print
              </button>
            </div>
          </div>

          {/* Period Selector */}
          <div className="flex gap-4 mt-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Period</label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="month">Monthly</option>
                <option value="quarter">Quarterly</option>
                <option value="year">Yearly</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="2024">2024</option>
                <option value="2023">2023</option>
                <option value="2022">2022</option>
              </select>
            </div>
            {period === 'month' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                <select
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="01">January</option>
                  <option value="02">February</option>
                  <option value="03">March</option>
                  <option value="04">April</option>
                  <option value="05">May</option>
                  <option value="06">June</option>
                  <option value="07">July</option>
                  <option value="08">August</option>
                  <option value="09">September</option>
                  <option value="10">October</option>
                  <option value="11">November</option>
                  <option value="12">December</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-gray-600">Loading profit & loss statement...</p>
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

        {/* Charts Section */}
        {!loading && showChart && data.trends.labels.length > 0 && (
          <div className="p-6 border-b border-gray-200">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Trend Analysis</h3>
                <Line
                  data={trendData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom' as const,
                      },
                      tooltip: {
                        callbacks: {
                          label: (context) => {
                            return `${context.dataset.label}: ₹${context.parsed.y.toLocaleString('en-IN')}`;
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
                  height={250}
                />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Category Breakdown</h3>
                <Bar
                  data={categoryBreakdown}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        display: false
                      },
                      tooltip: {
                        callbacks: {
                          label: (context) => {
                            return `₹${context.parsed.y.toLocaleString('en-IN')}`;
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
                  height={250}
                />
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && plData.length === 0 && !error && (
          <div className="p-12 text-center border-b border-gray-200">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No P&L Data Available</h3>
            <p className="text-gray-600 mb-4">There is no profit & loss data for the selected period.</p>
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Refresh Data
            </button>
          </div>
        )}

        {/* Statement Table */}
        {!loading && plData.length > 0 && (
          <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Detailed Statement</h3>
            <button
              onClick={() => setShowChart(!showChart)}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              {showChart ? 'Hide Charts' : 'Show Charts'}
            </button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="text-left py-2 text-gray-700">Particulars</th>
                <th className="text-right py-2 text-gray-700">Current Period (₹)</th>
                {comparisonMode && (
                  <>
                    <th className="text-right py-2 text-gray-700">Previous Period (₹)</th>
                    <th className="text-right py-2 text-gray-700">Variance</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {renderTableRows(plData)}
            </tbody>
          </table>

          {/* Summary Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8 pt-8 border-t border-gray-200">
            <div className="text-center">
              <p className="text-sm text-gray-600">Gross Margin</p>
              <p className="text-2xl font-bold text-gray-900">{data.summary.grossMargin.toFixed(1)}%</p>
              {data.summary.grossMarginChange !== undefined && (
                <div className="flex items-center justify-center mt-1">
                  {data.summary.grossMarginChange >= 0 ? (
                    <>
                      <TrendingUp className="h-4 w-4 text-green-600 mr-1" />
                      <span className="text-sm text-green-600">+{Math.abs(data.summary.grossMarginChange).toFixed(1)}%</span>
                    </>
                  ) : (
                    <>
                      <TrendingDown className="h-4 w-4 text-red-600 mr-1" />
                      <span className="text-sm text-red-600">{data.summary.grossMarginChange.toFixed(1)}%</span>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Operating Margin</p>
              <p className="text-2xl font-bold text-gray-900">{data.summary.operatingMargin.toFixed(1)}%</p>
              {data.summary.operatingMarginChange !== undefined && (
                <div className="flex items-center justify-center mt-1">
                  {data.summary.operatingMarginChange >= 0 ? (
                    <>
                      <TrendingUp className="h-4 w-4 text-green-600 mr-1" />
                      <span className="text-sm text-green-600">+{Math.abs(data.summary.operatingMarginChange).toFixed(1)}%</span>
                    </>
                  ) : (
                    <>
                      <TrendingDown className="h-4 w-4 text-red-600 mr-1" />
                      <span className="text-sm text-red-600">{data.summary.operatingMarginChange.toFixed(1)}%</span>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Net Margin</p>
              <p className="text-2xl font-bold text-gray-900">{data.summary.netMargin.toFixed(1)}%</p>
              {data.summary.netMarginChange !== undefined && (
                <div className="flex items-center justify-center mt-1">
                  {data.summary.netMarginChange >= 0 ? (
                    <>
                      <TrendingUp className="h-4 w-4 text-green-600 mr-1" />
                      <span className="text-sm text-green-600">+{Math.abs(data.summary.netMarginChange).toFixed(1)}%</span>
                    </>
                  ) : (
                    <>
                      <TrendingDown className="h-4 w-4 text-red-600 mr-1" />
                      <span className="text-sm text-red-600">{data.summary.netMarginChange.toFixed(1)}%</span>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">EBITDA Margin</p>
              <p className="text-2xl font-bold text-gray-900">{data.summary.ebitdaMargin.toFixed(1)}%</p>
              {data.summary.ebitdaMarginChange !== undefined && (
                <div className="flex items-center justify-center mt-1">
                  {data.summary.ebitdaMarginChange >= 0 ? (
                    <>
                      <TrendingUp className="h-4 w-4 text-green-600 mr-1" />
                      <span className="text-sm text-green-600">+{Math.abs(data.summary.ebitdaMarginChange).toFixed(1)}%</span>
                    </>
                  ) : (
                    <>
                      <TrendingDown className="h-4 w-4 text-red-600 mr-1" />
                      <span className="text-sm text-red-600">{data.summary.ebitdaMarginChange.toFixed(1)}%</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfitLossStatement;