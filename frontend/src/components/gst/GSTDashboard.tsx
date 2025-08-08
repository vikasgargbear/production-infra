import React, { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Calendar, Download, RefreshCw,
  AlertCircle, CheckCircle, Clock, FileText, ChevronRight,
  Filter, IndianRupee, Users, Package, Building
} from 'lucide-react';
import { Card, Button, StatusBadge, DataTable } from '../global';

interface GSTDashboardProps {
  open?: boolean;
  onClose?: () => void;
}

// Clean summary card component
const SummaryCard: React.FC<{
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: number;
  icon: React.ElementType;
  color: 'blue' | 'green' | 'amber' | 'red' | 'purple';
}> = ({ title, value, subtitle, trend, icon: Icon, color }) => {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    amber: 'bg-amber-50 text-amber-600 border-amber-200',
    red: 'bg-red-50 text-red-600 border-red-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
  };

  return (
    <div className={`p-6 rounded-xl border-2 ${colorClasses[color]} transition-all hover:shadow-md`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium opacity-80">{title}</p>
          <p className="text-2xl font-bold mt-2">{value}</p>
          {subtitle && (
            <p className="text-xs mt-1 opacity-70">{subtitle}</p>
          )}
          {trend !== undefined && (
            <div className="flex items-center mt-3 text-sm">
              {trend > 0 ? (
                <TrendingUp className="w-4 h-4 mr-1" />
              ) : (
                <TrendingDown className="w-4 h-4 mr-1" />
              )}
              <span className="font-medium">{Math.abs(trend)}%</span>
              <span className="ml-1 opacity-70">vs last month</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg bg-white bg-opacity-50`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
};

// Quick action button component
const QuickAction: React.FC<{
  title: string;
  description: string;
  icon: React.ElementType;
  onClick: () => void;
  badge?: string;
}> = ({ title, description, icon: Icon, onClick, badge }) => {
  return (
    <button
      onClick={onClick}
      className="flex items-center p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all group text-left w-full"
    >
      <div className="p-3 bg-gray-50 rounded-lg group-hover:bg-blue-50 transition-colors">
        <Icon className="w-5 h-5 text-gray-600 group-hover:text-blue-600" />
      </div>
      <div className="flex-1 ml-4">
        <div className="flex items-center">
          <p className="font-medium text-gray-900">{title}</p>
          {badge && (
            <span className="ml-2 px-2 py-0.5 text-xs bg-red-100 text-red-600 rounded-full">
              {badge}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-0.5">{description}</p>
      </div>
      <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600" />
    </button>
  );
};

const GSTDashboard: React.FC<GSTDashboardProps> = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('current');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Mock data - replace with actual API calls
  const [dashboardData] = useState({
    currentMonth: {
      salesTax: 245000,
      purchaseTax: 185000,
      payable: 60000,
      pendingReturns: 2,
      totalInvoices: 342,
      totalVendors: 45,
    },
    compliance: {
      gstr1: { status: 'filed', date: '2025-01-10' },
      gstr3b: { status: 'pending', dueDate: '2025-01-20' },
      gstr2b: { status: 'available', date: '2025-01-12' },
    },
    recentActivity: [
      { type: 'GSTR-1', action: 'Filed', date: '2025-01-10', status: 'success' },
      { type: 'GSTR-3B', action: 'Draft Saved', date: '2025-01-08', status: 'draft' },
      { type: 'E-Invoice', action: 'Generated', date: '2025-01-07', status: 'success' },
    ],
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    // Simulate API call
    setTimeout(() => setRefreshing(false), 1500);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'filed':
      case 'success':
        return 'green';
      case 'pending':
      case 'draft':
        return 'amber';
      case 'overdue':
        return 'red';
      default:
        return 'gray';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Clean Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">GST Dashboard</h1>
              <p className="text-sm text-gray-500 mt-1">
                Tax Period: {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="current">Current Month</option>
                <option value="previous">Previous Month</option>
                <option value="quarter">Current Quarter</option>
                <option value="year">Current Year</option>
              </select>
              <Button
                onClick={handleRefresh}
                variant="outline"
                icon={<RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />}
                iconPosition="left"
              >
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 max-w-7xl mx-auto">
        {/* Tax Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <SummaryCard
            title="Output Tax (Sales)"
            value={formatCurrency(dashboardData.currentMonth.salesTax)}
            subtitle={`${dashboardData.currentMonth.totalInvoices} invoices`}
            trend={8.5}
            icon={TrendingUp}
            color="green"
          />
          <SummaryCard
            title="Input Tax (Purchase)"
            value={formatCurrency(dashboardData.currentMonth.purchaseTax)}
            subtitle={`${dashboardData.currentMonth.totalVendors} vendors`}
            trend={-3.2}
            icon={TrendingDown}
            color="blue"
          />
          <SummaryCard
            title="Tax Payable"
            value={formatCurrency(dashboardData.currentMonth.payable)}
            subtitle="After ITC adjustment"
            icon={IndianRupee}
            color="amber"
          />
          <SummaryCard
            title="Pending Returns"
            value={dashboardData.currentMonth.pendingReturns}
            subtitle="Action required"
            icon={Clock}
            color="red"
          />
        </div>

        {/* Compliance Status Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Compliance Status</h2>
            <Button variant="ghost" size="sm">
              View All Returns
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* GSTR-1 Status */}
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-gray-900">GSTR-1</p>
                  <p className="text-sm text-gray-600 mt-1">Outward Supplies</p>
                  <div className="flex items-center mt-3">
                    <CheckCircle className="w-4 h-4 text-green-600 mr-2" />
                    <span className="text-sm text-green-600">Filed on {dashboardData.compliance.gstr1.date}</span>
                  </div>
                </div>
                <StatusBadge status="Filed" variant="success" />
              </div>
            </div>

            {/* GSTR-3B Status */}
            <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-gray-900">GSTR-3B</p>
                  <p className="text-sm text-gray-600 mt-1">Summary Return</p>
                  <div className="flex items-center mt-3">
                    <Clock className="w-4 h-4 text-amber-600 mr-2" />
                    <span className="text-sm text-amber-600">Due by {dashboardData.compliance.gstr3b.dueDate}</span>
                  </div>
                </div>
                <StatusBadge status="Pending" variant="warning" />
              </div>
            </div>

            {/* GSTR-2B Status */}
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-gray-900">GSTR-2B</p>
                  <p className="text-sm text-gray-600 mt-1">ITC Statement</p>
                  <div className="flex items-center mt-3">
                    <FileText className="w-4 h-4 text-blue-600 mr-2" />
                    <span className="text-sm text-blue-600">Available from {dashboardData.compliance.gstr2b.date}</span>
                  </div>
                </div>
                <StatusBadge status="Ready" variant="info" />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions and Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Actions */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <QuickAction
                title="File GSTR-3B"
                description="Summary return for January 2025"
                icon={FileText}
                onClick={() => console.log('File GSTR-3B')}
                badge="Due Soon"
              />
              <QuickAction
                title="Generate GSTR-1"
                description="Prepare outward supply statement"
                icon={TrendingUp}
                onClick={() => console.log('Generate GSTR-1')}
              />
              <QuickAction
                title="Reconcile ITC"
                description="Match GSTR-2B with purchase register"
                icon={Users}
                onClick={() => console.log('Reconcile ITC')}
              />
              <QuickAction
                title="Download Reports"
                description="Export GST returns and summaries"
                icon={Download}
                onClick={() => console.log('Download Reports')}
              />
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
            <div className="space-y-3">
              {dashboardData.recentActivity.map((activity, index) => (
                <div key={index} className="flex items-center p-3 bg-gray-50 rounded-lg">
                  <div className={`p-2 rounded-lg ${
                    activity.status === 'success' ? 'bg-green-100' :
                    activity.status === 'draft' ? 'bg-amber-100' : 'bg-gray-100'
                  }`}>
                    <FileText className={`w-4 h-4 ${
                      activity.status === 'success' ? 'text-green-600' :
                      activity.status === 'draft' ? 'text-amber-600' : 'text-gray-600'
                    }`} />
                  </div>
                  <div className="flex-1 ml-3">
                    <p className="text-sm font-medium text-gray-900">{activity.type}</p>
                    <p className="text-xs text-gray-500">{activity.action} • {activity.date}</p>
                  </div>
                  <StatusBadge 
                    status={activity.status === 'success' ? 'Success' : activity.status === 'draft' ? 'Draft' : 'Pending'}
                    variant={activity.status === 'success' ? 'success' : activity.status === 'draft' ? 'warning' : 'default'}
                  />
                </div>
              ))}
            </div>
            <Button variant="ghost" className="w-full mt-4">
              View All Activity
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GSTDashboard;