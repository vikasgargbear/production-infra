import React, { useCallback, useState, useEffect } from 'react';
import {
  ChevronDown, ChevronUp, Printer
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
import apiClient from '../../services/api/apiClient';
import { formatCurrency } from '../../utils/formatters';
import { isValidReportDateRange } from './utils/reportDateRange';
import { useCanonicalBusinessDate } from '../../hooks/useCanonicalBusinessDate';
import { addCalendarDays, formatCalendarDate, requireCalendarDate } from '../../utils/calendarDate';

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

interface SalesDailyRow {
  date: string;
  invoiceCount: number;
  customerCount: number;
  totalSales: number;
  averageInvoiceValue: number;
}

const requiredCountFact = (record: Record<string, unknown>, field: string): number => {
  const value = requiredNumberFact(record, field);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Sales report has invalid canonical ${field}.`);
  }
  return value;
};

export const projectSalesDailyRows = (payload: unknown): SalesDailyRow[] => {
  if (!Array.isArray(payload)) throw new Error('Sales daily projection is not a list.');
  return payload.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Sales daily row ${index + 1} is invalid.`);
    }
    const row = item as Record<string, unknown>;
    return {
      date: requireCalendarDate(row.date, `Sales daily row ${index + 1} date`),
      invoiceCount: requiredCountFact(row, 'invoice_count'),
      customerCount: requiredCountFact(row, 'customer_count'),
      totalSales: requiredNumberFact(row, 'total_sales'),
      averageInvoiceValue: requiredNumberFact(row, 'avg_order_value'),
    };
  });
};

const SalesReport: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [metrics, setMetrics] = useState<SalesMetric[]>([]);
  const [chartData, setChartData] = useState<any>(null);
  const [tableData, setTableData] = useState<any[]>([]);
  const { businessDate, loading: businessDateLoading, error: businessDateError } = useCanonicalBusinessDate();

  useEffect(() => {
    if (!businessDate) return;
    setDateRange({
      start: addCalendarDays(businessDate, -29),
      end: businessDate,
    });
  }, [businessDate]);

  const dateRangeInvalid = Boolean(
    dateRange.start &&
    dateRange.end &&
    !isValidReportDateRange(dateRange.start, dateRange.end)
  );

  const loadSalesData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [salesSummary, salesTrend, salesByDate] = await Promise.all([
        apiClient.get('/sales/analytics/summary', {
          params: {
            date_from: dateRange.start,
            date_to: dateRange.end,
          }
        }),
        apiClient.get('/sales/analytics/trend', {
          params: {
            date_from: dateRange.start,
            date_to: dateRange.end,
          }
        }),
        apiClient.get('/sales/analytics/by-date', {
          params: {
            date_from: dateRange.start,
            date_to: dateRange.end,
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

      const trendData = projectSalesDailyRows(salesTrend.data);
      if (trendData.length > 0) {
        const labels = trendData.map(item => formatCalendarDate(item.date));

        setChartData({
          labels,
          datasets: [
            {
              label: 'Sales Amount',
              data: trendData.map(item => item.totalSales),
              borderColor: 'rgb(59, 130, 246)',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              yAxisID: 'y',
              tension: 0.3,
              fill: true
            },
            {
              label: 'Order Count',
              data: trendData.map(item => item.invoiceCount),
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

      const detailedData = projectSalesDailyRows(salesByDate.data);
      const processedTableData = detailedData.map(item => ({
        date: formatCalendarDate(item.date),
        orders: item.invoiceCount,
        sales: formatCurrency(item.totalSales),
        customers: item.customerCount,
        avgOrder: formatCurrency(item.averageInvoiceValue),
      }));
      setTableData(processedTableData);

    } catch (error) {
      console.error('Error loading sales data:', error);
      setError(error instanceof Error ? error.message : 'Canonical sales report is unavailable.');
      setMetrics([]);
      setChartData(null);
      setTableData([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange.end, dateRange.start]);

  useEffect(() => {
    if (dateRange.start && dateRange.end && isValidReportDateRange(dateRange.start, dateRange.end)) {
      loadSalesData();
    } else if (dateRange.start && dateRange.end) {
      setMetrics([]);
      setChartData(null);
      setTableData([]);
    }
  }, [dateRange.end, dateRange.start, loadSalesData]);

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
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
        </div>
        {dateRangeInvalid && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-700">
            Start date must be on or before end date.
          </p>
        )}
      </div>

      {(businessDateError || error) && (
        <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          {businessDateError || error}
        </div>
      )}

      {(businessDateLoading || loading) && (
        <div role="status" className="mb-6 rounded-lg border border-gray-200 bg-white p-4 text-gray-600">
          Loading canonical sales report…
        </div>
      )}

      {/* Metrics Cards */}
      {!error && !businessDateError && <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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
      </div>}

      {/* Chart */}
      {!error && !businessDateError && <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Sales Trend</h3>
        <div style={{ height: '400px' }}>
          {chartData && <Line data={chartData} options={chartOptions} />}
        </div>
      </div>}

      {/* Data Table */}
      {!error && !businessDateError && <div className="bg-white rounded-lg shadow-sm border border-gray-200">
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
      </div>}
    </div>
  );
};

export default SalesReport;
