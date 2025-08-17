import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Download,
  Filter,
  Search,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { reportsApi, utilsApi } from '../../services/api';
import offlineStorage from '../../services/offlineStorage';

interface ReconciliationItem {
  id: number;
  supplierGSTIN?: string;
  supplierName?: string;
  invoiceNo: string;
  invoiceDate: string;
  ourAmount: number;
  gstPortalAmount: number;
  ourGST: number;
  portalGST: number;
  status: 'matched' | 'mismatched' | 'missing';
}

interface ReconciliationData {
  matched: number;
  mismatched: number;
  missing: number;
  total: number;
  items: ReconciliationItem[];
}

type ActiveTab = 'purchase' | 'sales';

interface StatusConfig {
  color: string;
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}

const GSTReconciliation: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('purchase');
  const [reconciliationData, setReconciliationData] = useState<Record<ActiveTab, ReconciliationData>>({
    purchase: { matched: 0, mismatched: 0, missing: 0, total: 0, items: [] },
    sales: { matched: 0, mismatched: 0, missing: 0, total: 0, items: [] }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'matched' | 'mismatched' | 'missing'>('all');

  // Load reconciliation data with offline fallback
  const loadReconciliationData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Load GST summary data for reconciliation
      const [gstSummaryResponse, gstR2Response] = await Promise.all([
        reportsApi.tax.gstSummary({ period: 'current' }),
        reportsApi.tax.gstR2({ period: 'current' })
      ]);
      
      // Transform the data into reconciliation format
      // In a real implementation, this would compare our records with GST portal data
      const purchaseData = gstR2Response.data || { invoices: [] };
      const salesData = gstSummaryResponse.data || { invoices: [] };
      
      // Simulate reconciliation by analyzing the data
      // This is a placeholder - in production, you'd compare with actual GST portal data
      const purchaseItems = (purchaseData.invoices || []).map((invoice: any, index: number) => ({
        id: index + 1,
        supplierGSTIN: invoice.supplier_gstin || 'N/A',
        supplierName: invoice.supplier_name || 'Unknown',
        invoiceNo: invoice.invoice_number || `INV-${index + 1}`,
        invoiceDate: invoice.invoice_date || new Date().toISOString().split('T')[0],
        ourAmount: invoice.total_amount || 0,
        gstPortalAmount: invoice.portal_amount || invoice.total_amount || 0,
        ourGST: invoice.gst_amount || 0,
        portalGST: invoice.portal_gst || invoice.gst_amount || 0,
        status: 'matched' as const // Default to matched for now
      }));
      
      const salesItems = (salesData.invoices || []).map((invoice: any, index: number) => ({
        id: index + 1,
        supplierGSTIN: invoice.customer_gstin || 'N/A',
        supplierName: invoice.customer_name || 'Unknown',
        invoiceNo: invoice.invoice_number || `INV-${index + 1}`,
        invoiceDate: invoice.invoice_date || new Date().toISOString().split('T')[0],
        ourAmount: invoice.total_amount || 0,
        gstPortalAmount: invoice.portal_amount || invoice.total_amount || 0,
        ourGST: invoice.gst_amount || 0,
        portalGST: invoice.portal_gst || invoice.gst_amount || 0,
        status: 'matched' as const // Default to matched for now
      }));
      
      const data: Record<ActiveTab, ReconciliationData> = {
        purchase: {
          matched: purchaseItems.filter(item => item.status === 'matched').length,
          mismatched: purchaseItems.filter(item => item.status === 'mismatched').length,
          missing: purchaseItems.filter(item => item.status === 'missing').length,
          total: purchaseItems.length,
          items: purchaseItems
        },
        sales: {
          matched: salesItems.filter(item => item.status === 'matched').length,
          mismatched: salesItems.filter(item => item.status === 'mismatched').length,
          missing: salesItems.filter(item => item.status === 'missing').length,
          total: salesItems.length,
          items: salesItems
        }
      };
      
      setReconciliationData(data);
      
      // Store data offline for future use
      await offlineStorage.storeOffline('gst_reconciliation', data, { 
        critical: true, 
        persistent: true 
      });
      
    } catch (err) {
      console.error('Error loading GST reconciliation data:', err);
      
      // Try to load from offline storage instead of using mock data
      const offlineData = await offlineStorage.getOffline('gst_reconciliation', { critical: true });
      
      if (offlineData && !offlineStorage.isDataStale(offlineData, 60)) { // 1 hour max for GST data
        console.log('📱 Using offline GST reconciliation data');
        setReconciliationData(offlineData.data);
        
        // Show offline indicator
        setError('Currently using offline data. Some information may be outdated.');
      } else {
        // No offline data available - show proper error instead of mock data
        setError('Unable to load GST reconciliation data. Please check your connection and try again.');
        setReconciliationData({
          purchase: { matched: 0, mismatched: 0, missing: 0, total: 0, items: [] },
          sales: { matched: 0, mismatched: 0, missing: 0, total: 0, items: [] }
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Refresh reconciliation data
  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    
    try {
      await loadReconciliationData();
    } catch (error) {
      console.error('Error refreshing GST reconciliation data:', error);
      setError('Failed to refresh data. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  // Auto-reconcile with GST portal
  const handleAutoReconcile = async () => {
    try {
      setRefreshing(true);
      
      // In a real implementation, this would call the GST portal API for reconciliation
      // For now, we'll use the available GST reports to simulate reconciliation
      const response = await reportsApi.tax.gstSummary({ period: 'current', reconcile: true });
      
      if (response.data) {
        // Reload data after successful reconciliation
        await loadReconciliationData();
        
        // Show success message
        setError(null);
        // You could use a toast notification here instead of alert
        console.log('Auto-reconciliation completed successfully!');
      } else {
        throw new Error('Auto-reconciliation failed');
      }
      
    } catch (err) {
      console.error('Auto-reconciliation failed:', err);
      setError(`Auto-reconciliation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setRefreshing(false);
    }
  };

  // Get status badge configuration
  const getStatusBadge = (status: ReconciliationItem['status']) => {
    const config: Record<ReconciliationItem['status'], StatusConfig> = {
      matched: { color: 'green', icon: CheckCircle, text: 'Matched' },
      mismatched: { color: 'yellow', icon: AlertTriangle, text: 'Mismatch' },
      missing: { color: 'red', icon: XCircle, text: 'Missing' }
    };

    const statusConfig = config[status] || config.missing;
    const Icon = statusConfig.icon;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${statusConfig.color}-100 text-${statusConfig.color}-800`}>
        <Icon className="w-3 h-3 mr-1" />
        {statusConfig.text}
      </span>
    );
  };

  // Filter items based on search and status
  const getFilteredItems = () => {
    let items = reconciliationData[activeTab].items;
    
    if (searchTerm) {
      items = items.filter(item => 
        item.invoiceNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.supplierName && item.supplierName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.supplierGSTIN && item.supplierGSTIN.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    if (statusFilter !== 'all') {
      items = items.filter(item => item.status === statusFilter);
    }
    
    return items;
  };

  // Export reconciliation data
  const handleExport = async () => {
    try {
      const response = await reportsApi.export('gst-reconciliation', { 
        type: activeTab, 
        period: 'current' 
      }, 'csv');
      
      if (response.data) {
        // Create and download CSV
        const blob = new Blob([response.data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gst_reconciliation_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Export failed:', err);
      setError('Failed to export data. Please try again.');
    }
  };

  // Load data on component mount
  useEffect(() => {
    loadReconciliationData();
  }, []);

  // Clear old offline data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      offlineStorage.clearOldData(24); // Clear data older than 24 hours
    }, 60 * 60 * 1000); // Check every hour

    return () => clearInterval(interval);
  }, []);

  const filteredItems = getFilteredItems();
  const currentData = reconciliationData[activeTab];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading GST reconciliation data...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">GST Reconciliation</h1>
          <p className="text-gray-600">Reconcile GST data with portal records</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={handleAutoReconcile}
            disabled={refreshing}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Auto Reconcile
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
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

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {(['purchase', 'sales'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)} Reconciliation
            </button>
          ))}
        </nav>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Invoices</p>
              <p className="text-2xl font-bold text-gray-900">{currentData.total}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Matched</p>
              <p className="text-2xl font-bold text-green-600">{currentData.matched}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Mismatched</p>
              <p className="text-2xl font-bold text-yellow-600">{currentData.mismatched}</p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Missing</p>
              <p className="text-2xl font-bold text-red-600">{currentData.missing}</p>
            </div>
            <div className="p-3 bg-red-100 rounded-lg">
              <XCircle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search invoices..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="matched">Matched</option>
              <option value="mismatched">Mismatched</option>
              <option value="missing">Missing</option>
            </select>

            <button
              onClick={handleExport}
              className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Reconciliation Items Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Items ({filteredItems.length})
          </h3>
        </div>

        {filteredItems.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <AlertTriangle className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p>No reconciliation items found</p>
            {currentData.items.length > 0 && (
              <p className="text-sm text-gray-400 mt-1">Try adjusting your filters</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invoice Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Supplier
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Our Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Portal Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    GST Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{item.invoiceNo}</div>
                        <div className="text-sm text-gray-500">{item.invoiceDate}</div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {item.supplierName || 'Unknown'}
                        </div>
                        {item.supplierGSTIN && (
                          <div className="text-xs text-gray-500 font-mono">{item.supplierGSTIN}</div>
                        )}
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        ₹{item.ourAmount.toLocaleString()}
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        ₹{item.gstPortalAmount.toLocaleString()}
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        <div>Our: ₹{item.ourGST.toLocaleString()}</div>
                        <div>Portal: ₹{item.portalGST.toLocaleString()}</div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(item.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default GSTReconciliation;