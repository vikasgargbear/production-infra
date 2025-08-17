import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  Loader2,
  AlertCircle
} from 'lucide-react';
import Button from '../global/ui/Button';
import SummaryCard from '../global/ui/display/SummaryCard';
import { reportsApi } from '../../services/api';
import offlineStorage from '../../services/offlineStorage';

interface GSTDashboardProps {
  // Add any props if needed
}

interface GSTSummaryData {
  currentMonth: {
    salesTax: number;
    purchaseTax: number;
    payable: number;
    pendingReturns: number;
    totalInvoices: number;
    totalVendors: number;
  };
  compliance: {
    gstr1: { status: string; date: string };
    gstr3b: { status: string; dueDate: string };
    gstr2b: { status: string; date: string };
  };
  recentActivity: Array<{
    type: string;
    action: string;
    date: string;
    status: string;
  }>;
}

const GSTDashboard: React.FC<GSTDashboardProps> = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('current');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<GSTSummaryData>({
    currentMonth: {
      salesTax: 0,
      purchaseTax: 0,
      payable: 0,
      pendingReturns: 0,
      totalInvoices: 0,
      totalVendors: 0,
    },
    compliance: {
      gstr1: { status: 'pending', date: '' },
      gstr3b: { status: 'pending', dueDate: '' },
      gstr2b: { status: 'pending', date: '' },
    },
    recentActivity: [],
  });

  // Load GST dashboard data with offline fallback
  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Load GST summary data for the selected period
      const [gstSummaryResponse, complianceResponse, activityResponse] = await Promise.all([
        reportsApi.tax.gstSummary({ period: selectedPeriod }),
        reportsApi.tax.gstR1({ period: selectedPeriod }),
        reportsApi.tax.gstR3B({ period: selectedPeriod })
      ]);
      
      // Transform the API responses into dashboard format
      const gstData = gstSummaryResponse.data || {};
      const gstr1Data = complianceResponse.data || {};
      const gstr3bData = activityResponse.data || {};
      
      const newDashboardData: GSTSummaryData = {
        currentMonth: {
          salesTax: gstData.output_tax || gstData.sales_tax || 0,
          purchaseTax: gstData.input_tax || gstData.purchase_tax || 0,
          payable: (gstData.output_tax || 0) - (gstData.input_tax || 0),
          pendingReturns: gstData.pending_returns || 0,
          totalInvoices: gstData.total_invoices || 0,
          totalVendors: gstData.total_vendors || 0,
        },
        compliance: {
          gstr1: {
            status: gstr1Data.status || 'pending',
            date: gstr1Data.filing_date || gstr1Data.date || ''
          },
          gstr3b: {
            status: gstr3bData.status || 'pending',
            dueDate: gstr3bData.due_date || ''
          },
          gstr2b: {
            status: gstData.gstr2b_status || 'pending',
            date: gstData.gstr2b_date || ''
          },
        },
        recentActivity: gstData.recent_activity || gstr1Data.activity || []
      };
      
      setDashboardData(newDashboardData);
      
      // Store data offline for future use
      await offlineStorage.storeOffline(`gst_dashboard_${selectedPeriod}`, newDashboardData, { 
        critical: true, 
        persistent: true 
      });
      
    } catch (err) {
      console.error('Error loading GST dashboard data:', err);
      
      // Try to load from offline storage instead of using mock data
      const offlineData = await offlineStorage.getOffline(`gst_dashboard_${selectedPeriod}`, { critical: true });
      
      if (offlineData && !offlineStorage.isDataStale(offlineData, 60)) { // 1 hour max for GST dashboard data
        console.log('📱 Using offline GST dashboard data');
        setDashboardData(offlineData.data);
        
        // Show offline indicator
        setError('Currently using offline data. Some information may be outdated.');
      } else {
        // No offline data available - show proper error instead of mock data
        setError('Unable to load GST dashboard data. Please check your connection and try again.');
        setDashboardData({
          currentMonth: {
            salesTax: 0,
            purchaseTax: 0,
            payable: 0,
            pendingReturns: 0,
            totalInvoices: 0,
            totalVendors: 0,
          },
          compliance: {
            gstr1: { status: 'pending', date: '' },
            gstr3b: { status: 'pending', dueDate: '' },
            gstr2b: { status: 'pending', date: '' },
          },
          recentActivity: [],
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Refresh dashboard data
  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    
    try {
      await loadDashboardData();
    } catch (error) {
      console.error('Error refreshing GST dashboard data:', error);
      setError('Failed to refresh data. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  // Load data when period changes or component mounts
  useEffect(() => {
    loadDashboardData();
  }, [selectedPeriod]);

  // Clear old offline data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      offlineStorage.clearOldData(24); // Clear data older than 24 hours
    }, 60 * 60 * 1000); // Check every hour

    return () => clearInterval(interval);
  }, []);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading GST dashboard data...</span>
      </div>
    );
  }

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

      {/* Error Display */}
      {error && (
        <div className="mx-6 mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
              <span className="text-red-800">{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-sm text-red-600 hover:text-red-800 underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="px-6 py-6 max-w-7xl mx-auto">
        {/* Tax Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <SummaryCard
            title="Output Tax (Sales)"
            items={[
              { label: 'Amount', value: formatCurrency(dashboardData.currentMonth.salesTax), isBold: true },
              { label: 'Trend', value: '+12.5%', color: '#10B981' }
            ]}
            headerContent={<TrendingUp className="w-6 h-6 text-green-600" />}
          />
          <SummaryCard
            title="Input Tax (Purchase)"
            items={[
              { label: 'Amount', value: formatCurrency(dashboardData.currentMonth.purchaseTax), isBold: true },
              { label: 'Trend', value: '+8.2%', color: '#3B82F6' }
            ]}
            headerContent={<TrendingDown className="w-6 h-6 text-blue-600" />}
          />
          <SummaryCard
            title="Net GST Payable"
            items={[
              { label: 'Amount', value: formatCurrency(dashboardData.currentMonth.payable), isBold: true },
              { label: 'Status', value: dashboardData.currentMonth.payable > 0 ? "Payable" : "Refundable", color: dashboardData.currentMonth.payable > 0 ? '#F59E0B' : '#10B981' }
            ]}
            headerContent={<FileText className="w-6 h-6 text-amber-600" />}
          />
          <SummaryCard
            title="Pending Returns"
            items={[
              { label: 'Count', value: dashboardData.currentMonth.pendingReturns.toString(), isBold: true },
              { label: 'Status', value: '2 overdue', color: '#EF4444' }
            ]}
            headerContent={<AlertTriangle className="w-6 h-6 text-red-600" />}
          />
        </div>

        {/* Compliance Status */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Compliance Status</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <FileText className="w-5 h-5 text-blue-600 mr-3" />
                  <div>
                    <p className="font-medium text-gray-900">GSTR-1</p>
                    <p className="text-sm text-gray-500">Sales Return</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium bg-${getStatusColor(dashboardData.compliance.gstr1.status)}-100 text-${getStatusColor(dashboardData.compliance.gstr1.status)}-800`}>
                    {dashboardData.compliance.gstr1.status}
                  </span>
                  {dashboardData.compliance.gstr1.date && (
                    <span className="text-sm text-gray-500">{dashboardData.compliance.gstr1.date}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <FileText className="w-5 h-5 text-green-600 mr-3" />
                  <div>
                    <p className="font-medium text-gray-900">GSTR-3B</p>
                    <p className="text-sm text-gray-500">Monthly Return</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium bg-${getStatusColor(dashboardData.compliance.gstr3b.status)}-100 text-${getStatusColor(dashboardData.compliance.gstr3b.status)}-800`}>
                    {dashboardData.compliance.gstr3b.status}
                  </span>
                  {dashboardData.compliance.gstr3b.dueDate && (
                    <span className="text-sm text-gray-500">Due: {dashboardData.compliance.gstr3b.dueDate}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <FileText className="w-5 h-5 text-purple-600 mr-3" />
                  <div>
                    <p className="font-medium text-gray-900">GSTR-2B</p>
                    <p className="text-sm text-gray-500">Purchase Return</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium bg-${getStatusColor(dashboardData.compliance.gstr2b.status)}-100 text-${getStatusColor(dashboardData.compliance.gstr2b.status)}-800`}>
                    {dashboardData.compliance.gstr2b.status}
                  </span>
                  {dashboardData.compliance.gstr2b.date && (
                    <span className="text-sm text-gray-500">{dashboardData.compliance.gstr2b.date}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
            <div className="space-y-3">
              {dashboardData.recentActivity.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Clock className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>No recent activity</p>
                </div>
              ) : (
                dashboardData.recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center">
                      <div className={`w-2 h-2 rounded-full bg-${getStatusColor(activity.status)}-500 mr-3`} />
                      <div>
                        <p className="font-medium text-gray-900">{activity.type}</p>
                        <p className="text-sm text-gray-500">{activity.action}</p>
                      </div>
                    </div>
                    <span className="text-sm text-gray-500">{activity.date}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Additional Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Invoice Summary</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{dashboardData.currentMonth.totalInvoices}</p>
                <p className="text-sm text-gray-500">Total Invoices</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{dashboardData.currentMonth.totalVendors}</p>
                <p className="text-sm text-gray-500">Active Vendors</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <button className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                Generate E-Invoice
              </button>
              <button className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                File GSTR-1
              </button>
              <button className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
                Download GSTR-2B
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GSTDashboard;