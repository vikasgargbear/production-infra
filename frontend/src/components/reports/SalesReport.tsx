import React, { useState, useEffect } from 'react';
import {
  ChevronDown, ChevronUp, Printer
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
import { format, subDays } from 'date-fns';
import apiClient from '../../services/api/apiClient';
import { formatCurrency } from '../../utils/formatters';
import { isValidReportDateRange } from './utils/reportDateRange';

interface SalesMetric {
  label: string;
  value: string;
  trend: number | null;
  comparison: string;
}

const requiredNumberFact = (record: Record<string, unknown>, field: string): number => {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Sales report is missing canonical ${field}.`);
  }
  return value;
};

const optionalNumberFact = (record: Record<string, unknown>, field: string): number | null => {
  const value = record[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Sales report has invalid canonical ${field}.`);
  }
  return value;
};

const SalesReport: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [reportType, setReportType] = useState('summary');
  const [groupBy, setGroupBy] = useState('day');
  const [metrics, setMetrics] = useState<SalesMetric[]>([]);
  const [chartData, setChartData] = useState<any>(null);
  const [tableData, setTableData] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    customer: '',
    product: '',
    category: '',
    paymentStatus: 'all'
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
    if (dateRange.start && dateRange.end && isValidReportDateRange(dateRange.start, dateRange.end)) {
      loadSalesData();
    } else if (dateRange.start && dateRange.end) {
      setMetrics([]);
      setChartData(null);
      setTableData([]);
    }
  }, [dateRange, reportType, groupBy, filters]);

  const dateRangeInvalid = Boolean(
    dateRange.start &&
    dateRange.end &&
    !isValidReportDateRange(dateRange.start, dateRange.end)
  );

  const loadSalesData = async () => {
    setLoading(true);
    try {
      // Fetch real sales data from multiple endpoints
      const [salesSummary, salesTrend, salesByDate] = await Promise.all([
        // Get sales summary metrics
        apiClient.get('/sales/analytics/summary', {
          params: {
            date_from: dateRange.start,
            date_to: dateRange.end,
            report_type: reportType,
            group_by: groupBy
          }
        }),
        // Get sales trend data for chart
        apiClient.get('/sales/analytics/trend', {
          params: {
            date_from: dateRange.start,
            date_to: dateRange.end,
            group_by: groupBy
          }
        }),
        // Get detailed sales data for table
        apiClient.get('/sales/analytics/by-date', {
          params: {
            date_from: dateRange.start,
            date_to: dateRange.end,
            customer: filters.customer || undefined,
            product: filters.product || undefined,
            category: filters.category || undefined,
            payment_status: filters.paymentStatus !== 'all' ? filters.paymentStatus : undefined
          }
        })
      ]);

      // Process metrics from API response
      const summaryData: Record<string, unknown> = salesSummary.data;
      const calculatedMetrics: SalesMetric[] = [
        {
          label: 'Total Sales',
          value: formatCurrency(requiredNumberFact(summaryData, 'total_sales')),
          trend: optionalNumberFact(summaryData, 'sales_growth'),
          comparison: 'vs last period'
        },
        {
          label: 'Total Invoices',
          value: String(requiredNumberFact(summaryData, 'total_invoices')),
          trend: optionalNumberFact(summaryData, 'invoices_growth'),
          comparison: 'vs last period'
        },
        {
          label: 'Average Invoice Value',
          value: formatCurrency(requiredNumberFact(summaryData, 'avg_invoice_value')),
          trend: optionalNumberFact(summaryData, 'average_invoice_growth'),
          comparison: 'vs last period'
        },
        {
          label: 'Unique Customers',
          value: String(requiredNumberFact(summaryData, 'unique_customers')),
          trend: optionalNumberFact(summaryData, 'customers_growth'),
          comparison: 'vs last period'
        }
      ];
      setMetrics(calculatedMetrics);

      // Process chart data from API response
      const trendData = salesTrend.data || [];
      if (trendData.length > 0) {
        const labels = trendData.map((item: any) => {
          if (groupBy === 'day') {
            return format(new Date(item.date || item.period), 'MMM dd');
          } else if (groupBy === 'week') {
            return `Week ${item.week || item.period}`;
          } else {
            return item.month || item.period;
          }
        });

        setChartData({
          labels,
          datasets: [
            {
              label: 'Sales Amount',
              data: trendData.map((item: any) => item.total_sales || item.revenue || 0),
              borderColor: 'rgb(59, 130, 246)',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              yAxisID: 'y',
              tension: 0.3,
              fill: true
            },
            {
              label: 'Order Count',
              data: trendData.map((item: any) => item.order_count || item.orders || 0),
              borderColor: 'rgb(156, 163, 175)',
              backgroundColor: 'rgba(156, 163, 175, 0.1)',
              yAxisID: 'y1',
              tension: 0.3,
              fill: false
            }
          ]
        });
      } else {
        // If no data, show empty chart
        setChartData(null);
      }

      // Process table data from API response
      const detailedData = salesByDate.data || [];
      const processedTableData = detailedData.map((item: any) => ({
        date: item.date || item.invoice_date,
        orders: item.order_count || item.invoice_count || 0,
        sales: formatCurrency(item.total_sales || item.total_amount || 0),
        customers: item.customer_count || item.unique_customers || 0,
        avgOrder: formatCurrency(item.avg_order_value ||
          ((item.total_sales || item.total_amount || 0) / (item.order_count || 1)))
      }));
      setTableData(processedTableData);

    } catch (error) {
      console.error('Error loading sales data:', error);
      // Set empty state on error
      setMetrics([]);
      setChartData(null);
      setTableData([]);
    } finally {
      setLoading(false);
    }
  };

  const generateDateLabels = () => {
    const days = parseInt((new Date(dateRange.end).getTime() - new Date(dateRange.start).getTime()) / (1000 * 60 * 60 * 24) + '');
    
    if (groupBy === 'day' && days <= 31) {
      return Array.from({ length: Math.min(days, 31) }, (_, i) => 
        format(subDays(new Date(dateRange.end), days - i - 1), 'MMM dd')
      );
    } else if (groupBy === 'week') {
      return ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
    } else if (groupBy === 'month') {
      return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    }
    return [];
  };


  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8
      }
    },
    scales: {
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        },
        ticks: {
          callback: function(value: any) {
            return '₹' + value.toLocaleString('en-IN');
          }
        }
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        grid: {
          drawOnChartArea: false,
        },
      },
    },
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sales Report</h1>
            <p className="text-gray-600 mt-1">Analyze sales performance and trends</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div>
            <label htmlFor="sales-report-start-date" className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              id="sales-report-start-date"
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="sales-report-end-date" className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              id="sales-report-end-date"
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="summary">Summary</option>
              <option value="detailed">Detailed</option>
              <option value="by-customer">By Customer</option>
              <option value="by-product">By Product</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Group By</label>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </div>
        </div>
        {dateRangeInvalid && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-700">
            Start date must be on or before end date.
          </p>
        )}
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {metrics.map((metric, index) => (
          <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <p className="text-sm text-gray-600">{metric.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{metric.value}</p>
            <div className="flex items-center mt-2">
              {metric.trend === null ? (
                <span className="text-xs text-gray-500">Comparison unavailable</span>
              ) : (
                <>
                  {metric.trend >= 0 ? (
                    <ChevronUp className="h-4 w-4 text-green-600" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-red-600" />
                  )}
                  <span className={`text-sm font-medium ${metric.trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {Math.abs(metric.trend)}%
                  </span>
                  <span className="text-xs text-gray-500 ml-2">{metric.comparison}</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Sales Trend</h3>
        <div style={{ height: '400px' }}>
          {chartData && <Line data={chartData} options={chartOptions} />}
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Sales Data</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Orders
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sales Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customers
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Avg Order Value
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tableData.map((row, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {row.date}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {row.orders}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {row.sales}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {row.customers}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {row.avgOrder}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SalesReport;
