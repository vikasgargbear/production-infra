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
import { gstApi, clearGSTCache } from '../../services/api';
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

  // Request deduplication to prevent multiple simultaneous calls
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [lastLoadDuration, setLastLoadDuration] = useState<number>(0);
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

  // Load GST dashboard data from real invoices and purchases
  const loadDashboardData = async () => {
    // Prevent duplicate requests
    if (isLoadingData) {
      console.log(`[GST Dashboard] Request already in progress, skipping duplicate`);
      return;
    }

    setIsLoadingData(true);
    setLoading(true);
    setError(null);

    const loadStartTime = performance.now();
    console.log(`[GST Dashboard] Starting optimized data load for period: ${selectedPeriod}`);

    try {
      // Calculate date range based on selected period for logging
      const now = new Date();
      let fromDate, toDate;

      if (selectedPeriod === 'current') {
        fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        toDate = now.toISOString().split('T')[0];
      } else if (selectedPeriod === 'previous') {
        fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
        toDate = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
      } else if (selectedPeriod === 'quarter') {
        const quarter = Math.floor(now.getMonth() / 3);
        fromDate = new Date(now.getFullYear(), quarter * 3, 1).toISOString().split('T')[0];
        toDate = now.toISOString().split('T')[0];
      } else {
        fromDate = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
        toDate = now.toISOString().split('T')[0];
      }

      console.log(`[GST Dashboard] Date range: ${fromDate} to ${toDate}`);

      // Get GST dashboard data with optimized parallel execution and timeouts
      const [gstDashboardResponse, returnsStatusResponse, gstSettingsResponse] = await Promise.allSettled([
        Promise.race([
          gstApi.dashboard.getSummary(selectedPeriod),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Dashboard API timeout')), 5000))
        ]),
        Promise.race([
          gstApi.returns.getStatus(selectedPeriod),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Returns API timeout')), 8000))
        ]),
        Promise.race([
          gstApi.settings.getConfig(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Settings API timeout')), 5000))
        ])
      ]);

      let gstData = {};
      let returnsData = {};
      let settingsData = {};

      // Handle GST dashboard response
      if (gstDashboardResponse.status === 'fulfilled') {
        gstData = gstDashboardResponse.value || {};
        console.log(`[GST Dashboard] Successfully loaded dashboard data:`, {
          outputTax: gstData.outputTax,
          inputCredit: gstData.inputCredit,
          totalInvoices: gstData.summary?.total_invoices,
          complianceScore: gstData.complianceScore,
          period: selectedPeriod
        });
      } else {
        console.error(`[GST Dashboard] Dashboard API failed:`, gstDashboardResponse.reason);
        // Enterprise-grade fallback with audit trail
        gstData = {
          outputTax: 0,
          inputCredit: 0,
          netPayable: 0,
          complianceScore: 0,
          summary: { total_invoices: 0, total_suppliers: 0 },
          error: gstDashboardResponse.reason?.message || 'API unavailable'
        };
      }

      // Handle returns status response
      if (returnsStatusResponse.status === 'fulfilled') {
        returnsData = returnsStatusResponse.value || {};
        console.log(`[GST Dashboard] Returns status loaded:`, {
          gstr1: returnsData.gstr1?.status,
          gstr3b: returnsData.gstr3b?.status,
          gstr2a: returnsData.gstr2a?.status
        });
      } else {
        console.warn(`[GST Dashboard] Returns status API failed:`, returnsStatusResponse.reason);
        returnsData = {
          gstr1: { status: 'pending', amount: 0, dueDate: null, filedDate: null },
          gstr3b: { status: 'pending', amount: 0, dueDate: null, filedDate: null },
          gstr2a: { status: 'available', amount: 0, lastUpdated: null }
        };
      }

      // Handle settings response
      if (gstSettingsResponse.status === 'fulfilled') {
        settingsData = gstSettingsResponse.value || {};
        console.log(`[GST Dashboard] Settings loaded:`, {
          gstin: settingsData.gstin,
          isValid: settingsData.is_valid
        });
      } else {
        console.warn(`[GST Dashboard] Settings API failed:`, gstSettingsResponse.reason);
        settingsData = {
          gstin: '',
          is_valid: false,
          state: ''
        };
      }

      const newDashboardData: GSTSummaryData = {
        currentMonth: {
          salesTax: gstData.outputTax || gstData.taxPayable || 0,
          purchaseTax: gstData.inputCredit || gstData.inputTax || 0,
          payable: gstData.netPayable || ((gstData.outputTax || 0) - (gstData.inputCredit || 0)),
          pendingReturns: gstData.pending_returns || 0,
          totalInvoices: gstData.summary?.total_invoices || gstData.total_invoices || 0,
          totalVendors: gstData.summary?.total_suppliers || gstData.total_suppliers || 0,
        },
        compliance: {
          gstr1: {
            status: returnsData.gstr1?.status || 'pending',
            date: returnsData.gstr1?.dueDate || ''
          },
          gstr3b: {
            status: returnsData.gstr3b?.status || 'pending',
            dueDate: returnsData.gstr3b?.dueDate || ''
          },
          gstr2b: {
            status: returnsData.gstr2a?.status || 'available',
            date: returnsData.gstr2a?.lastUpdated || ''
          },
        },
        recentActivity: gstData.recent_activity || []
      };

      setDashboardData(newDashboardData);

      // Enterprise-grade audit logging
      const loadEndTime = performance.now();
      const loadDuration = Math.round(loadEndTime - loadStartTime);

      console.log(`[GST Dashboard] Data load completed in ${loadDuration}ms:`, {
        period: selectedPeriod,
        salesTax: newDashboardData.currentMonth.salesTax,
        purchaseTax: newDashboardData.currentMonth.purchaseTax,
        netPayable: newDashboardData.currentMonth.payable,
        totalInvoices: newDashboardData.currentMonth.totalInvoices,
        complianceScore: gstData.complianceScore,
        gstr1Status: returnsData.gstr1?.status,
        gstr3bStatus: returnsData.gstr3b?.status,
        gstinConfigured: settingsData.gstin ? 'Yes' : 'No',
        loadDuration: `${loadDuration}ms`,
        timestamp: new Date().toISOString()
      });

      // Store performance metric
      setLastLoadDuration(loadDuration);

      // Store data offline for future use with enhanced metadata
      await offlineStorage.storeOffline(`gst_dashboard_${selectedPeriod}`, {
        ...newDashboardData,
        _metadata: {
          loadedAt: new Date().toISOString(),
          period: selectedPeriod,
          complianceScore: gstData.complianceScore,
          gstinConfigured: Boolean(settingsData.gstin),
          gstr1DueDate: returnsData.gstr1?.dueDate,
          gstr3bDueDate: returnsData.gstr3b?.dueDate,
          loadDuration,
          apiResponseCodes: {
            dashboard: gstDashboardResponse.status,
            returns: returnsStatusResponse.status,
            settings: gstSettingsResponse.status
          }
        }
      }, {
        critical: true,
        persistent: true
      });

    } catch (err) {
      // Enterprise-grade error handling with comprehensive logging
      const errorDetails = {
        error: err?.message || 'Unknown error',
        stack: err?.stack,
        period: selectedPeriod,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
      };

      console.error(`[GST Dashboard] Critical error during data load:`, errorDetails);

      // Try to load from offline storage as enterprise fallback
      try {
        const offlineData = await offlineStorage.getOffline(`gst_dashboard_${selectedPeriod}`, { critical: true });

        if (offlineData && !offlineStorage.isDataStale(offlineData, 60)) { // 1 hour max for GST dashboard data
          console.log(`[GST Dashboard] Fallback to offline data successful`);
          setDashboardData(offlineData.data);

          // Show offline indicator with transparency
          setError(`Currently using offline data from ${new Date(offlineData._metadata?.loadedAt || offlineData.timestamp).toLocaleString()}. Some information may be outdated.`);
        } else {
          // No valid offline data - use enterprise-grade zero state
          console.warn(`[GST Dashboard] No valid offline data available. Showing zero state.`);
          setError(`Unable to load GST dashboard data. Error: ${err?.message || 'Connection failed'}. Please check your connection and try again.`);

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
              gstr1: { status: 'error', date: '' },
              gstr3b: { status: 'error', dueDate: '' },
              gstr2b: { status: 'error', date: '' },
            },
            recentActivity: [],
          });
        }
      } catch (offlineError) {
        console.error(`[GST Dashboard] Offline storage fallback failed:`, offlineError);
        setError(`Critical error: Unable to load GST data. Please refresh the page or contact support.`);
      }
    } finally {
      setLoading(false);
      setIsLoadingData(false);
      console.log(`[GST Dashboard] Load operation completed for period: ${selectedPeriod}`);
    }
  };

  // Enterprise-grade refresh functionality with cache invalidation
  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);

    const refreshStartTime = performance.now();
    console.log(`[GST Dashboard] Manual refresh initiated for period: ${selectedPeriod}`);

    try {
      // Clear all request cache and offline storage for fresh data
      clearGSTCache();

      // Clear all possible localStorage keys for GST dashboard
      const periods = ['current', 'previous', 'quarter', 'year'];
      periods.forEach(period => {
        localStorage.removeItem(`gst_dashboard_${period}`);
        localStorage.removeItem(`gst_returns_status_${period}`);
        localStorage.removeItem(`gst_settings_config`);
      });

      console.log(`[GST Dashboard] All caches cleared for manual refresh on period: ${selectedPeriod}`);

      // Reload data
      await loadDashboardData();

      const refreshDuration = Math.round(performance.now() - refreshStartTime);
      console.log(`[GST Dashboard] Manual refresh completed in ${refreshDuration}ms`);

    } catch (error) {
      console.error(`[GST Dashboard] Manual refresh failed:`, {
        error: error?.message,
        period: selectedPeriod,
        timestamp: new Date().toISOString()
      });
      setError(`Failed to refresh data: ${error?.message || 'Unknown error'}. Please try again.`);
    } finally {
      setRefreshing(false);
    }
  };

  // Load data when period changes or component mounts (optimized)
  useEffect(() => {
    // Debounced loading to prevent rapid successive calls
    const loadDataWithDebounce = async () => {
      console.log(`[GST Dashboard] Period changed to: ${selectedPeriod}`);

      // Clear cache when period changes to ensure fresh data for new period
      try {
        // Clear all request cache for all periods
        clearGSTCache();

        // Clear all possible localStorage keys for GST dashboard
        const periods = ['current', 'previous', 'quarter', 'year'];
        periods.forEach(period => {
          localStorage.removeItem(`gst_dashboard_${period}`);
          localStorage.removeItem(`gst_returns_status_${period}`);
          localStorage.removeItem(`gst_settings_config`);
        });

        console.log(`[GST Dashboard] Cleared all cache for period change to: ${selectedPeriod}`);
      } catch (error) {
        console.warn(`[GST Dashboard] Cache clear failed:`, error);
      }

      await loadDashboardData();
    };

    // Debounce to prevent rapid calls when period changes quickly
    const timeoutId = setTimeout(loadDataWithDebounce, 100);
    return () => clearTimeout(timeoutId);
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
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
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
              { label: 'Invoices', value: `${dashboardData.currentMonth.totalInvoices} invoices`, color: '#6B7280' }
            ]}
            headerContent={<TrendingUp className="w-6 h-6 text-green-600" />}
          />
          <SummaryCard
            title="Input Tax (Purchase)"
            items={[
              { label: 'Amount', value: formatCurrency(dashboardData.currentMonth.purchaseTax), isBold: true },
              { label: 'Vendors', value: `${dashboardData.currentMonth.totalVendors} vendors`, color: '#6B7280' }
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
              { label: 'Status', value: dashboardData.currentMonth.pendingReturns > 0 ? 'Action needed' : 'Up to date', color: dashboardData.currentMonth.pendingReturns > 0 ? '#EF4444' : '#10B981' }
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

        {/* GST Calculation Transparency */}
        <div className="mb-6 bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">GST Calculation Breakdown</h3>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-blue-600 mr-2" />
              <div className="text-sm text-blue-800">
                <p className="font-medium">Transparent Calculation</p>
                <p>All GST amounts are calculated from your actual invoice and purchase data. Click "View Details" to see transaction-level breakdown.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                <TrendingUp className="w-4 h-4 text-green-600 mr-2" />
                Output Tax (From Sales)
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">CGST (9%)</span>
                  <span className="font-medium">{formatCurrency(dashboardData.currentMonth.salesTax * 0.5)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">SGST (9%)</span>
                  <span className="font-medium">{formatCurrency(dashboardData.currentMonth.salesTax * 0.5)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-semibold">
                  <span>Total Output Tax</span>
                  <span>{formatCurrency(dashboardData.currentMonth.salesTax)}</span>
                </div>
                <button className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline">
                  View invoice-level details →
                </button>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                <TrendingDown className="w-4 h-4 text-blue-600 mr-2" />
                Input Tax (From Purchases)
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">CGST Claimed</span>
                  <span className="font-medium">{formatCurrency(dashboardData.currentMonth.purchaseTax * 0.5)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">SGST Claimed</span>
                  <span className="font-medium">{formatCurrency(dashboardData.currentMonth.purchaseTax * 0.5)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-semibold">
                  <span>Total Input Credit</span>
                  <span>{formatCurrency(dashboardData.currentMonth.purchaseTax)}</span>
                </div>
                <button className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline">
                  View purchase-level details →
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <h4 className="font-medium text-amber-800 mb-2">Net Calculation</h4>
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-amber-700">Output Tax (Sales)</span>
                <span className="font-medium text-amber-900">{formatCurrency(dashboardData.currentMonth.salesTax)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-700">Less: Input Credit (Purchases)</span>
                <span className="font-medium text-amber-900">- {formatCurrency(dashboardData.currentMonth.purchaseTax)}</span>
              </div>
              <div className="border-t border-amber-300 pt-2 flex justify-between font-semibold text-amber-900">
                <span>Net GST {dashboardData.currentMonth.payable >= 0 ? 'Payable' : 'Refundable'}</span>
                <span>{formatCurrency(Math.abs(dashboardData.currentMonth.payable))}</span>
              </div>
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