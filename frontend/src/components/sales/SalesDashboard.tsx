import React, { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Users, Package, IndianRupee, 
  FileText, Clock, Calendar, Filter, Download, RefreshCw,
  ChevronRight, Eye, Edit, Plus, Search, BarChart3
} from 'lucide-react';
import { Card, Button, StatusBadge, DataTable } from '../global';

interface SalesDashboardProps {
  open?: boolean;
  onClose?: () => void;
}

// Quick stats card
const StatsCard: React.FC<{
  title: string;
  value: string | number;
  change?: number;
  icon: React.ElementType;
  color: string;
  subtitle?: string;
}> = ({ title, value, change, icon: Icon, color, subtitle }) => {
  const colorMap = {
    blue: 'bg-blue-500',
    green: 'bg-green-500', 
    amber: 'bg-amber-500',
    purple: 'bg-purple-500',
    red: 'bg-red-500',
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
          )}
          {change !== undefined && (
            <div className="flex items-center mt-3">
              {change > 0 ? (
                <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
              )}
              <span className={`text-sm font-medium ${change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {Math.abs(change)}%
              </span>
              <span className="text-sm text-gray-500 ml-1">vs last month</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg ${colorMap[color]} bg-opacity-10`}>
          <Icon className={`w-6 h-6 text-${color}-600`} />
        </div>
      </div>
    </div>
  );
};

// Action card component
const ActionCard: React.FC<{
  title: string;
  description: string;
  icon: React.ElementType;
  onClick: () => void;
  urgent?: boolean;
}> = ({ title, description, icon: Icon, onClick, urgent = false }) => {
  return (
    <div 
      className={`p-4 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${
        urgent 
          ? 'bg-red-50 border-red-200 hover:border-red-300' 
          : 'bg-white border-gray-200 hover:border-blue-300'
      }`}
      onClick={onClick}
    >
      <div className="flex items-center">
        <div className={`p-2 rounded-lg ${urgent ? 'bg-red-100' : 'bg-blue-100'}`}>
          <Icon className={`w-5 h-5 ${urgent ? 'text-red-600' : 'text-blue-600'}`} />
        </div>
        <div className="ml-3 flex-1">
          <p className={`font-medium ${urgent ? 'text-red-900' : 'text-gray-900'}`}>{title}</p>
          <p className={`text-sm ${urgent ? 'text-red-600' : 'text-gray-600'} mt-0.5`}>{description}</p>
        </div>
        <ChevronRight className={`w-5 h-5 ${urgent ? 'text-red-400' : 'text-gray-400'}`} />
      </div>
    </div>
  );
};

const SalesDashboard: React.FC<SalesDashboardProps> = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [loading, setLoading] = useState(false);

  // Mock data - replace with API calls
  const [dashboardData] = useState({
    stats: {
      totalSales: 2845000,
      totalInvoices: 342,
      avgOrderValue: 8316,
      pendingOrders: 23,
      totalCustomers: 156,
      newCustomers: 12,
    },
    recentInvoices: [
      { id: 'INV-001', customer: 'Apollo Pharmacy', amount: 45000, date: '2025-01-06', status: 'Paid' },
      { id: 'INV-002', customer: 'MedPlus', amount: 32000, date: '2025-01-05', status: 'Pending' },
      { id: 'INV-003', customer: 'City Hospital', amount: 67000, date: '2025-01-04', status: 'Overdue' },
    ],
    topProducts: [
      { name: 'Paracetamol 500mg', sold: 2500, revenue: 125000 },
      { name: 'Amoxicillin 250mg', sold: 1800, revenue: 90000 },
      { name: 'Omeprazole 20mg', sold: 1200, revenue: 84000 },
    ],
    salesTrend: [
      { month: 'Sep', sales: 2100000 },
      { month: 'Oct', sales: 2300000 },
      { month: 'Nov', sales: 2600000 },
      { month: 'Dec', sales: 2800000 },
      { month: 'Jan', sales: 2845000 },
    ],
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusColor = (status: string): 'solid' | 'light' | 'outline' => {
    return 'light'; // Always use light variant for status badges
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Sales Dashboard</h1>
              <p className="text-sm text-gray-500 mt-1">
                {new Date().toLocaleDateString('en-IN', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="quarter">This Quarter</option>
                <option value="year">This Year</option>
              </select>
              <Button
                variant="outline"
                size="sm"
                icon={<RefreshCw className="w-4 h-4" />}
                iconPosition="left"
              >
                Refresh
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<Plus className="w-4 h-4" />}
                iconPosition="left"
              >
                New Invoice
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 max-w-7xl mx-auto">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <StatsCard
            title="Total Sales"
            value={formatCurrency(dashboardData.stats.totalSales)}
            change={12.5}
            icon={IndianRupee}
            color="green"
            subtitle="This month"
          />
          <StatsCard
            title="Total Invoices"
            value={dashboardData.stats.totalInvoices}
            change={8.2}
            icon={FileText}
            color="blue"
            subtitle={`Avg: ${formatCurrency(dashboardData.stats.avgOrderValue)}`}
          />
          <StatsCard
            title="Active Customers"
            value={dashboardData.stats.totalCustomers}
            change={5.1}
            icon={Users}
            color="purple"
            subtitle={`+${dashboardData.stats.newCustomers} new`}
          />
          <StatsCard
            title="Pending Orders"
            value={dashboardData.stats.pendingOrders}
            change={-15.3}
            icon={Clock}
            color="amber"
            subtitle="Need attention"
          />
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <ActionCard
              title="Create Invoice"
              description="Generate new sales invoice"
              icon={FileText}
              onClick={() => console.log('Create Invoice')}
            />
            <ActionCard
              title="Record Payment"
              description="Update payment status"
              icon={IndianRupee}
              onClick={() => console.log('Record Payment')}
            />
            <ActionCard
              title="Overdue Follow-up"
              description="3 invoices overdue"
              icon={Clock}
              onClick={() => console.log('Overdue Follow-up')}
              urgent={true}
            />
            <ActionCard
              title="Sales Reports"
              description="View detailed analytics"
              icon={BarChart3}
              onClick={() => console.log('Sales Reports')}
            />
          </div>
        </div>

        {/* Recent Activity and Top Products */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Recent Invoices */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Recent Invoices</h2>
              <Button variant="ghost" size="sm">
                View All
              </Button>
            </div>
            <div className="space-y-3">
              {dashboardData.recentInvoices.map((invoice) => (
                <div key={invoice.id} className="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-gray-900">{invoice.id}</p>
                      <StatusBadge 
                        status={invoice.status}
                        variant={getStatusColor(invoice.status)}
                      />
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5">{invoice.customer}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm font-medium text-gray-900">
                        {formatCurrency(invoice.amount)}
                      </span>
                      <span className="text-xs text-gray-500">{invoice.date}</span>
                    </div>
                  </div>
                  <div className="ml-3 flex space-x-1">
                    <Button variant="ghost" size="sm">
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Edit className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Products */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Top Products</h2>
            </div>
            <div className="space-y-4">
              {dashboardData.topProducts.map((product, index) => (
                <div key={product.name} className="flex items-center">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-medium text-blue-600">
                    {index + 1}
                  </div>
                  <div className="flex-1 ml-3">
                    <p className="text-sm font-medium text-gray-900">{product.name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-gray-500">{product.sold} units</span>
                      <span className="text-sm font-medium text-gray-900">
                        {formatCurrency(product.revenue)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sales Trend Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Sales Trend</h2>
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
          <div className="h-64 flex items-end space-x-4">
            {dashboardData.salesTrend.map((item) => {
              const maxSales = Math.max(...dashboardData.salesTrend.map(s => s.sales));
              const height = (item.sales / maxSales) * 200;
              return (
                <div key={item.month} className="flex-1 flex flex-col items-center">
                  <div 
                    className="w-full bg-blue-500 rounded-t-lg transition-all hover:bg-blue-600"
                    style={{ height: `${height}px` }}
                  />
                  <p className="text-sm text-gray-600 mt-2">{item.month}</p>
                  <p className="text-xs text-gray-500">{formatCurrency(item.sales)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesDashboard;