import React, { useState, useEffect } from 'react';
import {
  Calendar, Download, Filter, TrendingUp, Users,
  Package, DollarSign, FileText, ChevronDown,
  ChevronUp, RefreshCw, Printer
} from 'lucide-react';
import { Line, Bar } from 'react-chartjs-2';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { invoicesApi, customersApi } from '../../services/api';
import { DatePicker, Select, DataTable } from '../global';

interface SalesMetric {
  label: string;
  value: string;
  trend: number;
  comparison: string;
}

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
    if (dateRange.start && dateRange.end) {
      loadSalesData();
    }
  }, [dateRange, reportType, groupBy, filters]);

  const loadSalesData = async () => {
    setLoading(true);
    try {
      // Mock data - replace with actual API calls
      const mockMetrics: SalesMetric[] = [
        {
          label: 'Total Sales',
          value: '₹15,67,890',
          trend: 12.5,
          comparison: 'vs last period'
        },
        {
          label: 'Total Orders',
          value: '1,456',
          trend: 8.3,
          comparison: 'vs last period'
        },
        {
          label: 'Average Order Value',
          value: '₹1,076',
          trend: 4.2,
          comparison: 'vs last period'
        },
        {
          label: 'Conversion Rate',
          value: '68.5%',
          trend: -2.1,
          comparison: 'vs last period'
        }
      ];
      setMetrics(mockMetrics);

      // Generate chart data based on groupBy
      const labels = generateDateLabels();
      setChartData({
        labels,
        datasets: [
          {
            label: 'Sales Amount',
            data: generateRandomData(labels.length, 10000, 50000),
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            yAxisID: 'y',
            tension: 0.3,
            fill: true
          },
          {
            label: 'Order Count',
            data: generateRandomData(labels.length, 20, 100),
            borderColor: 'rgb(156, 163, 175)',
            backgroundColor: 'rgba(156, 163, 175, 0.1)',
            yAxisID: 'y1',
            tension: 0.3,
            fill: false
          }
        ]
      });

      // Generate table data
      const mockTableData = [
        { date: '2024-01-15', orders: 45, sales: '₹45,678', customers: 38, avgOrder: '₹1,015' },
        { date: '2024-01-14', orders: 52, sales: '₹52,340', customers: 44, avgOrder: '₹1,006' },
        { date: '2024-01-13', orders: 38, sales: '₹38,900', customers: 32, avgOrder: '₹1,023' },
        { date: '2024-01-12', orders: 61, sales: '₹61,234', customers: 51, avgOrder: '₹1,003' },
        { date: '2024-01-11', orders: 49, sales: '₹49,567', customers: 41, avgOrder: '₹1,011' }
      ];
      setTableData(mockTableData);

    } catch (error) {
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

  const generateRandomData = (length: number, min: number, max: number) => {
    return Array.from({ length }, () => Math.floor(Math.random() * (max - min + 1)) + min);
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

  const handleExport = (format: 'pdf' | 'excel' | 'csv') => {
    // Implement export functionality
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
              onClick={() => handleExport('pdf')}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              <FileText className="h-4 w-4" />
              PDF
            </button>
            <button
              onClick={() => handleExport('excel')}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Excel
            </button>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
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
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {metrics.map((metric, index) => (
          <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <p className="text-sm text-gray-600">{metric.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{metric.value}</p>
            <div className="flex items-center mt-2">
              {metric.trend > 0 ? (
                <ChevronUp className="h-4 w-4 text-green-600" />
              ) : (
                <ChevronDown className="h-4 w-4 text-red-600" />
              )}
              <span className={`text-sm font-medium ${metric.trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {Math.abs(metric.trend)}%
              </span>
              <span className="text-xs text-gray-500 ml-2">{metric.comparison}</span>
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