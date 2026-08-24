import React, { useState, useMemo, useEffect } from 'react';
import { Users, UserPlus, UserCheck, TrendingUp, Download, Search, Filter, MapPin, ShoppingBag, Calendar, Award } from 'lucide-react';
import { Line, Bar, Doughnut, Scatter } from 'react-chartjs-2';
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
import { format, subMonths } from 'date-fns';
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

// Analytics-specific customer type - NOT the canonical Customer
interface AnalyticsCustomer {
  id: string;
  name: string;
  type: 'Retail' | 'Wholesale' | 'Hospital' | 'Clinic';
  location: string;
  joinDate: string;
  totalPurchases: number;
  lastPurchase: string;
  avgOrderValue: number;
  frequency: number;
  lifetimeValue: number;
  status: 'Active' | 'Inactive' | 'Churned';
  creditLimit: number;
  outstanding: number;
}

const CustomerAnalytics: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [dateRange, setDateRange] = useState('6months');
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<AnalyticsCustomer[]>([]);
  const [analyticsData, setAnalyticsData] = useState<any>({});

  useEffect(() => {
    loadCustomerData();
  }, [dateRange]);

  const loadCustomerData = async () => {
    setLoading(true);
    try {
      // Calculate date range
      const endDate = new Date();
      const startDate = dateRange === '6months' ? subMonths(endDate, 6) :
        dateRange === '12months' ? subMonths(endDate, 12) :
          subMonths(endDate, 3);

      const dateParams = {
        date_from: format(startDate, 'yyyy-MM-dd'),
        date_to: format(endDate, 'yyyy-MM-dd')
      };

      // Fetch real customer data from API endpoints
      const [customerList, customerAnalytics, segmentAnalysis, acquisitionData] = await Promise.all([
        apiClient.get('/customers/analytics/list', { params: dateParams }),
        apiClient.get('/customers/analytics/summary', { params: dateParams }),
        apiClient.get('/customers/analytics/segments', { params: dateParams }),
        apiClient.get('/customers/analytics/acquisition', { params: dateParams })
      ]);

      // Process customer list
      const processedCustomers: AnalyticsCustomer[] = (customerList.data || []).map((customer: any) => {
        // Determine customer status based on last purchase
        let status: AnalyticsCustomer['status'] = 'Active';
        if (customer.last_purchase_date) {
          const daysSinceLastPurchase = Math.ceil(
            (new Date().getTime() - new Date(customer.last_purchase_date).getTime()) / (1000 * 60 * 60 * 24)
          );
          if (daysSinceLastPurchase > 180) {
            status = 'Churned';
          } else if (daysSinceLastPurchase > 60) {
            status = 'Inactive';
          }
        }

        // Determine customer type
        const type = customer.customer_type === 'hospital' ? 'Hospital' :
          customer.customer_type === 'clinic' ? 'Clinic' :
            customer.customer_type === 'wholesale' ? 'Wholesale' : 'Retail';

        return {
          id: customer.id || customer.customer_id,
          name: customer.name || customer.customer_name,
          type,
          location: customer.city || customer.location || '',
          joinDate: customer.created_at || customer.join_date || '',
          totalPurchases: customer.total_purchases || customer.total_amount || 0,
          lastPurchase: customer.last_purchase_date || '',
          avgOrderValue: customer.avg_order_value || 0,
          frequency: customer.purchase_frequency || 0,
          lifetimeValue: customer.lifetime_value || customer.total_purchases || 0,
          status,
          creditLimit: customer.credit_limit || 0,
          outstanding: customer.outstanding_amount || 0
        };
      });
      setCustomers(processedCustomers);

      // Store analytics data for charts
      setAnalyticsData({
        summary: customerAnalytics.data,
        segments: segmentAnalysis.data,
        acquisition: acquisitionData.data
      });

    } catch (error) {
      console.error('Error loading customer data:', error);
      setCustomers([]);
      setAnalyticsData({});
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = useMemo(() => {
    let filtered = customers;

    if (selectedType !== 'all') {
      filtered = filtered.filter(c => c.type === selectedType);
    }

    if (selectedStatus !== 'all') {
      filtered = filtered.filter(c => c.status === selectedStatus);
    }

    if (searchQuery) {
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.location.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return filtered;
  }, [searchQuery, selectedType, selectedStatus]);

  const segmentationData = useMemo(() => {
    // Use API data if available, otherwise calculate from customers
    if (analyticsData.segments) {
      return {
        labels: Object.keys(analyticsData.segments),
        datasets: [{
          data: Object.values(analyticsData.segments),
          backgroundColor: [
            'rgba(59, 130, 246, 0.8)',
            'rgba(34, 197, 94, 0.8)',
            'rgba(251, 146, 60, 0.8)',
            'rgba(147, 51, 234, 0.8)'
          ],
          borderWidth: 0
        }]
      };
    }

    const segmentCounts = customers.reduce((acc, customer) => {
      acc[customer.type] = (acc[customer.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      labels: Object.keys(segmentCounts),
      datasets: [{
        data: Object.values(segmentCounts),
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(34, 197, 94, 0.8)',
          'rgba(251, 146, 60, 0.8)',
          'rgba(147, 51, 234, 0.8)'
        ],
        borderWidth: 0
      }]
    };
  }, [customers, analyticsData]);

  const acquisitionTrend = useMemo(() => {
    if (analyticsData.acquisition && analyticsData.acquisition.length > 0) {
      const data = analyticsData.acquisition;
      const labels = data.map((item: any) => item.month || item.period);
      return {
        labels,
        datasets: [
          {
            label: 'New Customers',
            data: data.map((item: any) => item.new_customers || 0),
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.3,
            fill: true
          },
          {
            label: 'Active Customers',
            data: data.map((item: any) => item.active_customers || 0),
            borderColor: 'rgb(34, 197, 94)',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            tension: 0.3,
            fill: true,
            yAxisID: 'y1'
          }
        ]
      };
    }
    return { labels: [], datasets: [] };
  }, [analyticsData]);

  const revenueBySegment = useMemo(() => {
    const segmentRevenue = customers.reduce((acc, customer) => {
      acc[customer.type] = (acc[customer.type] || 0) + customer.lifetimeValue;
      return acc;
    }, {} as Record<string, number>);

    return {
      labels: Object.keys(segmentRevenue),
      datasets: [{
        label: 'Lifetime Value',
        data: Object.values(segmentRevenue),
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(34, 197, 94, 0.8)',
          'rgba(251, 146, 60, 0.8)',
          'rgba(147, 51, 234, 0.8)'
        ],
        borderWidth: 0
      }]
    };
  }, []);

  const rfmAnalysis = useMemo(() => {
    return {
      datasets: [{
        label: 'Customers',
        data: customers.map(c => ({
          x: c.frequency,
          y: c.avgOrderValue / 1000,
          label: c.name
        })),
        backgroundColor: customers.map(c =>
          c.status === 'Active' ? 'rgba(34, 197, 94, 0.6)' :
            c.status === 'Inactive' ? 'rgba(251, 146, 60, 0.6)' :
              'rgba(239, 68, 68, 0.6)'
        ),
        pointRadius: 8,
        pointHoverRadius: 10
      }]
    };
  }, []);

  const getStatusBadge = (status: string) => {
    const colors = {
      Active: 'bg-green-100 text-green-800',
      Inactive: 'bg-yellow-100 text-yellow-800',
      Churned: 'bg-red-100 text-red-800'
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status as keyof typeof colors]}`}>
        {status}
      </span>
    );
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN')}`;
  };
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading customer analytics...</p>
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
              <h1 className="text-2xl font-bold text-gray-900">Customer Analytics</h1>
              <p className="text-gray-600 mt-1">Customer behavior, segmentation, and lifetime value analysis</p>
            </div>
            <button className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export Report
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-4 mt-6">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search customers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              <option value="Retail">Retail</option>
              <option value="Wholesale">Wholesale</option>
              <option value="Hospital">Hospital</option>
              <option value="Clinic">Clinic</option>
            </select>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Churned">Churned</option>
            </select>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="1month">Last Month</option>
              <option value="3months">Last 3 Months</option>
              <option value="6months">Last 6 Months</option>
              <option value="1year">Last Year</option>
            </select>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 p-6 border-b border-gray-200">
          <div className="p-4 border border-gray-200 rounded-lg">
            <Users className="h-8 w-8 text-blue-600 mb-2" />
            <p className="text-sm text-gray-600">Total</p>
            <p className="text-xl font-bold">{customers.length}</p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <UserPlus className="h-8 w-8 text-green-600 mb-2" />
            <p className="text-sm text-gray-600">New (30d)</p>
            <p className="text-xl font-bold">31</p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <UserCheck className="h-8 w-8 text-purple-600 mb-2" />
            <p className="text-sm text-gray-600">Active</p>
            <p className="text-xl font-bold">{customers.filter(c => c.status === 'Active').length}</p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <TrendingUp className="h-8 w-8 text-indigo-600 mb-2" />
            <p className="text-sm text-gray-600">Avg LTV</p>
            <p className="text-xl font-bold">
              ₹{customers.length > 0 ? Math.round(customers.reduce((acc, c) => acc + c.lifetimeValue, 0) / customers.length / 1000) : 0}K
            </p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <ShoppingBag className="h-8 w-8 text-orange-600 mb-2" />
            <p className="text-sm text-gray-600">Avg Order</p>
            <p className="text-xl font-bold">
              ₹{customers.length > 0 ? Math.round(customers.reduce((acc, c) => acc + c.avgOrderValue, 0) / customers.length / 1000) : 0}K
            </p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <Award className="h-8 w-8 text-yellow-600 mb-2" />
            <p className="text-sm text-gray-600">Retention</p>
            <p className="text-xl font-bold">87%</p>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Acquisition Trend</h3>
            <Line
              data={acquisitionTrend}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'bottom' as const
                  }
                },
                scales: {
                  y: {
                    type: 'linear' as const,
                    display: true,
                    position: 'left' as const,
                    title: {
                      display: true,
                      text: 'New Customers'
                    }
                  },
                  y1: {
                    type: 'linear' as const,
                    display: true,
                    position: 'right' as const,
                    title: {
                      display: true,
                      text: 'Active Customers'
                    },
                    grid: {
                      drawOnChartArea: false
                    }
                  }
                }
              }}
              height={250}
            />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Segmentation</h3>
            <Doughnut
              data={segmentationData}
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
                        const label = context.label || '';
                        const value = context.parsed || 0;
                        const total = context.dataset.data.reduce((a: any, b: any) => a + b, 0);
                        const percentage = ((value / total) * 100).toFixed(1);
                        return `${label}: ${value} (${percentage}%)`;
                      }
                    }
                  }
                }
              }}
              height={250}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue by Segment</h3>
            <Bar
              data={revenueBySegment}
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
                        return `₹${((context.parsed.y ?? 0) / 100000).toFixed(1)}L`;
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
            <h3 className="text-lg font-semibold text-gray-900 mb-4">RFM Analysis (Frequency vs Value)</h3>
            <Scatter
              data={rfmAnalysis}
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
                        const point = context.raw as any;
                        return [`Frequency: ${point.x}`, `Avg Order: ₹${point.y}K`];
                      }
                    }
                  }
                },
                scales: {
                  x: {
                    title: {
                      display: true,
                      text: 'Purchase Frequency'
                    }
                  },
                  y: {
                    title: {
                      display: true,
                      text: 'Avg Order Value (₹K)'
                    }
                  }
                }
              }}
              height={250}
            />
          </div>
        </div>

        {/* Customer List */}
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Details</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-gray-700">Customer</th>
                  <th className="text-left py-3 px-4 text-gray-700">Type</th>
                  <th className="text-left py-3 px-4 text-gray-700">Location</th>
                  <th className="text-center py-3 px-4 text-gray-700">Status</th>
                  <th className="text-right py-3 px-4 text-gray-700">Lifetime Value</th>
                  <th className="text-right py-3 px-4 text-gray-700">Avg Order</th>
                  <th className="text-right py-3 px-4 text-gray-700">Frequency</th>
                  <th className="text-right py-3 px-4 text-gray-700">Outstanding</th>
                  <th className="text-left py-3 px-4 text-gray-700">Last Purchase</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer, index) => (
                  <tr key={customer.id} className={`border-b border-gray-100 hover:bg-gray-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-gray-900">{customer.name}</p>
                        <p className="text-xs text-gray-500">Since {new Date(customer.joinDate).toLocaleDateString('en-IN')}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{customer.type}</td>
                    <td className="py-3 px-4 text-gray-600">
                      <div className="flex items-center">
                        <MapPin className="h-3 w-3 mr-1 text-gray-400" />
                        {customer.location}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {getStatusBadge(customer.status)}
                    </td>
                    <td className="py-3 px-4 text-right font-medium">
                      {formatCurrency(customer.lifetimeValue)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {formatCurrency(customer.avgOrderValue)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {customer.frequency}x/month
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={customer.outstanding > customer.creditLimit * 0.8 ? 'text-red-600 font-medium' : ''}>
                        {formatCurrency(customer.outstanding)}
                      </span>
                      <p className="text-xs text-gray-500">of {formatCurrency(customer.creditLimit)}</p>
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      <div className="flex items-center">
                        <Calendar className="h-3 w-3 mr-1 text-gray-400" />
                        {new Date(customer.lastPurchase).toLocaleDateString('en-IN')}
                      </div>
                    </td>
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

export default CustomerAnalytics;
