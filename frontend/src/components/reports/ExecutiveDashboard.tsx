import React, { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Users, Package, DollarSign,
  ShoppingCart, Calendar, Download, Filter, RefreshCw,
  ArrowUp, ArrowDown, Minus
} from 'lucide-react';
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
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { dashboardApi } from '../../services/api';

// Register ChartJS components
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

interface MetricCard {
  title: string;
  value: string | number;
  change: number;
  changeType: 'increase' | 'decrease' | 'neutral';
  icon: React.ComponentType<{ className?: string }>;
  subtitle?: string;
}

const ExecutiveDashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30days');
  const [metrics, setMetrics] = useState<MetricCard[]>([]);
  const [salesData, setSalesData] = useState<any>(null);
  const [inventoryData, setInventoryData] = useState<any>(null);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [topCustomers, setTopCustomers] = useState<any[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, [dateRange]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Calculate date range
      const endDate = new Date();
      let startDate = new Date();
      
      switch (dateRange) {
        case '7days':
          startDate = subDays(endDate, 7);
          break;
        case '30days':
          startDate = subDays(endDate, 30);
          break;
        case 'month':
          startDate = startOfMonth(endDate);
          break;
        case '90days':
          startDate = subDays(endDate, 90);
          break;
        default:
          startDate = subDays(endDate, 30);
      }

      // Mock data for now - should be replaced with actual API calls
      const mockMetrics: MetricCard[] = [
        {
          title: 'Total Revenue',
          value: '₹12,45,678',
          change: 12.5,
          changeType: 'increase',
          icon: DollarSign,
          subtitle: 'This period'
        },
        {
          title: 'Total Orders',
          value: '1,234',
          change: 8.3,
          changeType: 'increase',
          icon: ShoppingCart,
          subtitle: `${dateRange} orders`
        },
        {
          title: 'Active Customers',
          value: '456',
          change: 5.2,
          changeType: 'increase',
          icon: Users,
          subtitle: 'Active this period'
        },
        {
          title: 'Inventory Value',
          value: '₹45,67,890',
          change: -2.1,
          changeType: 'decrease',
          icon: Package,
          subtitle: 'Current stock value'
        }
      ];

      setMetrics(mockMetrics);

      // Mock sales trend data
      const labels = Array.from({ length: 30 }, (_, i) => 
        format(subDays(new Date(), 29 - i), 'MMM dd')
      );
      
      setSalesData({
        labels: labels.filter((_, i) => i % 5 === 0), // Show every 5th label
        datasets: [{
          label: 'Sales',
          data: Array.from({ length: 6 }, () => Math.floor(Math.random() * 50000) + 20000),
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.3,
          fill: true
        }]
      });

      // Mock inventory distribution
      setInventoryData({
        labels: ['In Stock', 'Low Stock', 'Out of Stock', 'Expired'],
        datasets: [{
          data: [65, 20, 10, 5],
          backgroundColor: [
            'rgb(34, 197, 94)',
            'rgb(251, 191, 36)',
            'rgb(239, 68, 68)',
            'rgb(156, 163, 175)'
          ],
          borderWidth: 0
        }]
      });

      // Mock top products
      setTopProducts([
        { name: 'Paracetamol 500mg', sales: 2345, revenue: '₹45,678' },
        { name: 'Amoxicillin 250mg', sales: 1890, revenue: '₹38,900' },
        { name: 'Vitamin C Tablets', sales: 1567, revenue: '₹31,340' },
        { name: 'Cough Syrup 100ml', sales: 1234, revenue: '₹24,680' },
        { name: 'Aspirin 100mg', sales: 987, revenue: '₹19,740' }
      ]);

      // Mock top customers
      setTopCustomers([
        { name: 'Apollo Pharmacy', orders: 234, value: '₹2,34,567' },
        { name: 'MedPlus', orders: 189, value: '₹1,89,000' },
        { name: 'City Hospital', orders: 156, value: '₹1,56,789' },
        { name: 'Wellness Clinic', orders: 134, value: '₹1,34,567' },
        { name: 'HealthMart', orders: 98, value: '₹98,765' }
      ]);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getChangeIcon = (changeType: string) => {
    switch (changeType) {
      case 'increase':
        return <ArrowUp className="h-4 w-4" />;
      case 'decrease':
        return <ArrowDown className="h-4 w-4" />;
      default:
        return <Minus className="h-4 w-4" />;
    }
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8,
        titleFont: {
          size: 14
        },
        bodyFont: {
          size: 13
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        }
      },
      y: {
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        },
        ticks: {
          callback: function(value: any) {
            return '₹' + value.toLocaleString('en-IN');
          }
        }
      }
    }
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          padding: 15,
          font: {
            size: 12
          }
        }
      }
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Executive Dashboard</h1>
            <p className="text-gray-600 mt-1">Business overview and key metrics</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Date Range Selector */}
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="month">This Month</option>
              <option value="90days">Last 90 Days</option>
            </select>
            
            {/* Action Buttons */}
            <button
              onClick={loadDashboardData}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className="h-5 w-5 text-gray-600" />
            </button>
            <button
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Export"
            >
              <Download className="h-5 w-5 text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          const changeColor = metric.changeType === 'increase' ? 'text-green-600' : 
                             metric.changeType === 'decrease' ? 'text-red-600' : 
                             'text-gray-600';
          
          return (
            <div key={index} className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">{metric.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{metric.value}</p>
                  <div className={`flex items-center mt-2 ${changeColor}`}>
                    {getChangeIcon(metric.changeType)}
                    <span className="text-sm font-medium ml-1">
                      {Math.abs(metric.change)}%
                    </span>
                    <span className="text-xs text-gray-500 ml-2">{metric.subtitle}</span>
                  </div>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <Icon className="h-6 w-6 text-gray-600" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Sales Trend */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Sales Trend</h3>
          <div style={{ height: '300px' }}>
            {salesData && (
              <Line data={salesData} options={chartOptions} />
            )}
          </div>
        </div>

        {/* Inventory Distribution */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Inventory Status</h3>
          <div style={{ height: '300px' }}>
            {inventoryData && (
              <Doughnut data={inventoryData} options={doughnutOptions} />
            )}
          </div>
        </div>
      </div>

      {/* Tables Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Products */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Top Products</h3>
          </div>
          <div className="p-6">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm font-medium text-gray-500">
                  <th className="pb-3">Product</th>
                  <th className="pb-3 text-right">Sales</th>
                  <th className="pb-3 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {topProducts.map((product, index) => (
                  <tr key={index} className="border-t border-gray-100">
                    <td className="py-3 font-medium text-gray-900">{product.name}</td>
                    <td className="py-3 text-right text-gray-600">{product.sales}</td>
                    <td className="py-3 text-right font-medium text-gray-900">{product.revenue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Customers */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Top Customers</h3>
          </div>
          <div className="p-6">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm font-medium text-gray-500">
                  <th className="pb-3">Customer</th>
                  <th className="pb-3 text-right">Orders</th>
                  <th className="pb-3 text-right">Value</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {topCustomers.map((customer, index) => (
                  <tr key={index} className="border-t border-gray-100">
                    <td className="py-3 font-medium text-gray-900">{customer.name}</td>
                    <td className="py-3 text-right text-gray-600">{customer.orders}</td>
                    <td className="py-3 text-right font-medium text-gray-900">{customer.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveDashboard;