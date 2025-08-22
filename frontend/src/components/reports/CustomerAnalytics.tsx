import React, { useState, useMemo } from 'react';
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

interface Customer {
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

  // Mock customer data
  const customers: Customer[] = [
    { id: '1', name: 'Apollo Pharmacy - MG Road', type: 'Retail', location: 'Mumbai', joinDate: '2022-03-15', totalPurchases: 145000, lastPurchase: '2024-01-28', avgOrderValue: 12500, frequency: 8.5, lifetimeValue: 456000, status: 'Active', creditLimit: 100000, outstanding: 25000 },
    { id: '2', name: 'City Hospital', type: 'Hospital', location: 'Delhi', joinDate: '2021-06-20', totalPurchases: 890000, lastPurchase: '2024-01-30', avgOrderValue: 45000, frequency: 12, lifetimeValue: 2340000, status: 'Active', creditLimit: 500000, outstanding: 120000 },
    { id: '3', name: 'MedPlus Wholesale', type: 'Wholesale', location: 'Bangalore', joinDate: '2021-01-10', totalPurchases: 1250000, lastPurchase: '2024-01-29', avgOrderValue: 75000, frequency: 15, lifetimeValue: 3450000, status: 'Active', creditLimit: 750000, outstanding: 180000 },
    { id: '4', name: 'Green Cross Clinic', type: 'Clinic', location: 'Chennai', joinDate: '2022-09-05', totalPurchases: 67000, lastPurchase: '2024-01-15', avgOrderValue: 8500, frequency: 6, lifetimeValue: 125000, status: 'Active', creditLimit: 50000, outstanding: 12000 },
    { id: '5', name: 'Wellness Pharmacy', type: 'Retail', location: 'Pune', joinDate: '2023-02-12', totalPurchases: 89000, lastPurchase: '2023-12-20', avgOrderValue: 9800, frequency: 5, lifetimeValue: 98000, status: 'Inactive', creditLimit: 75000, outstanding: 5000 },
    { id: '6', name: 'District Hospital', type: 'Hospital', location: 'Kolkata', joinDate: '2020-11-30', totalPurchases: 560000, lastPurchase: '2024-01-25', avgOrderValue: 38000, frequency: 10, lifetimeValue: 1890000, status: 'Active', creditLimit: 400000, outstanding: 95000 },
    { id: '7', name: 'QuickMed Store', type: 'Retail', location: 'Hyderabad', joinDate: '2023-05-18', totalPurchases: 34000, lastPurchase: '2023-10-10', avgOrderValue: 6500, frequency: 3, lifetimeValue: 45000, status: 'Churned', creditLimit: 40000, outstanding: 0 },
    { id: '8', name: 'Central Medical Supplies', type: 'Wholesale', location: 'Ahmedabad', joinDate: '2021-08-25', totalPurchases: 780000, lastPurchase: '2024-01-27', avgOrderValue: 62000, frequency: 11, lifetimeValue: 2100000, status: 'Active', creditLimit: 600000, outstanding: 145000 },
  ];

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
  }, []);

  const acquisitionTrend = useMemo(() => {
    const labels = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan'];
    return {
      labels,
      datasets: [
        {
          label: 'New Customers',
          data: [12, 15, 18, 22, 25, 28, 31],
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.3,
          fill: true
        },
        {
          label: 'Active Customers',
          data: [380, 395, 410, 425, 440, 455, 467],
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          tension: 0.3,
          fill: true,
          yAxisID: 'y1'
        }
      ]
    };
  }, []);

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
              ₹{Math.round(customers.reduce((acc, c) => acc + c.lifetimeValue, 0) / customers.length / 1000)}K
            </p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <ShoppingBag className="h-8 w-8 text-orange-600 mb-2" />
            <p className="text-sm text-gray-600">Avg Order</p>
            <p className="text-xl font-bold">
              ₹{Math.round(customers.reduce((acc, c) => acc + c.avgOrderValue, 0) / customers.length / 1000)}K
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
                        return `₹${(context.parsed.y / 100000).toFixed(1)}L`;
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