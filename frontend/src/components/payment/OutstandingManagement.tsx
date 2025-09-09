import React, { useState, useEffect } from 'react';
import { Users, Search, Filter, Download, AlertTriangle, TrendingUp, Loader2, RefreshCw } from 'lucide-react';
import { ModuleHeader } from '../global';
import { customersApi, suppliersApi, paymentsApi } from '../../services/api';
import offlineStorage from '../../services/offlineStorage';

interface OutstandingManagementProps {
  onClose?: () => void;
}

interface OutstandingParty {
  id: number;
  name: string;
  phone: string;
  outstanding: number;
  overdue: number;
  days: number;
  email?: string;
  address?: string;
  credit_limit?: number;
}

const OutstandingManagement: React.FC<OutstandingManagementProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'customers' | 'suppliers'>('customers');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [customerOutstanding, setCustomerOutstanding] = useState<OutstandingParty[]>([]);
  const [supplierOutstanding, setSupplierOutstanding] = useState<OutstandingParty[]>([]);

  // Load outstanding data with offline fallback
  const loadOutstandingData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Load customer and supplier outstanding data
      const [customersResponse, suppliersResponse] = await Promise.all([
        customersApi.getOutstanding(),
        suppliersApi.getOutstanding()
      ]);
      
      if (customersResponse?.data && Array.isArray(customersResponse.data)) {
        setCustomerOutstanding(customersResponse.data);
      } else {
        setCustomerOutstanding([]);
      }
      
      if (suppliersResponse?.data && Array.isArray(suppliersResponse.data)) {
        setSupplierOutstanding(suppliersResponse.data);
      } else {
        setSupplierOutstanding([]);
      }
      
      // Store data offline for future use
      await offlineStorage.storeOffline('outstanding_management_data', {
        customers: customersResponse?.data || [],
        suppliers: suppliersResponse?.data || [],
        timestamp: new Date().toISOString()
      }, { 
        critical: true, 
        persistent: true 
      });
      
    } catch (err) {
      
      // Try to load from offline storage instead of using mock data
      const offlineData = await offlineStorage.getOffline('outstanding_management_data', { critical: true });
      
      if (offlineData && !offlineStorage.isDataStale(offlineData, 60)) { // 1 hour max for outstanding data
        setCustomerOutstanding(offlineData.data.customers || []);
        setSupplierOutstanding(offlineData.data.suppliers || []);
        
        // Show offline indicator
        setError('Currently using offline data. Some information may be outdated.');
      } else {
        // No offline data available - show proper error instead of mock data
        setError('Unable to load outstanding data. Please check your connection and try again.');
        setCustomerOutstanding([]);
        setSupplierOutstanding([]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Refresh outstanding data
  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    
    try {
      await loadOutstandingData();
    } catch (error) {
      setError('Failed to refresh data. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  // Load data when component mounts
  useEffect(() => {
    loadOutstandingData();
  }, []);

  // Clear old offline data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      offlineStorage.clearOldData(24); // Clear data older than 24 hours
    }, 60 * 60 * 1000); // Check every hour

    return () => clearInterval(interval);
  }, []);

  const currentData = activeTab === 'customers' ? customerOutstanding : supplierOutstanding;
  const totalOutstanding = currentData.reduce((sum, item) => sum + item.outstanding, 0);
  const totalOverdue = currentData.reduce((sum, item) => sum + item.overdue, 0);

  const filteredData = currentData.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.phone.includes(searchTerm)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading outstanding data...</span>
      </div>
    );
  }

  return (
    <div className="h-full bg-green-50">
      <div className="h-full flex flex-col">
        {/* Header */}
        <ModuleHeader
          title="Outstanding Management"
          documentNumber={`OUT-${new Date().getFullYear()}`}
          status={`Total Outstanding: ₹${totalOutstanding.toLocaleString()}`}
          icon={Users}
          iconColor="text-amber-600"
          onClose={onClose}
          historyType="outstanding"
          onSaveDraft={() => {}}
          additionalActions={[
            {
              label: 'Refresh',
              onClick: handleRefresh,
              variant: 'outline',
              disabled: refreshing,
              icon: RefreshCw
            },
            {
              label: 'Export Report',
              onClick: () => console.log('Export outstanding report'),
              variant: 'secondary'
            }
          ] as any}
        />

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 px-4 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <AlertTriangle className="h-4 w-4 text-red-600 mr-2" />
                <span className="text-red-800 text-sm">{error}</span>
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

        {/* Keyboard Shortcuts Help */}
        <div className="bg-green-50 px-4 py-2 text-xs text-green-700 border-b border-green-200">
          Keyboard shortcuts: <strong>Ctrl+F</strong> - Search | <strong>Ctrl+D</strong> - Download Report | <strong>Esc</strong> - Close
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-green-50">
          <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
            
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-8 h-8 text-blue-600" />
                  <div>
                    <p className="text-sm text-gray-600">Total Outstanding</p>
                    <p className="text-2xl font-bold text-blue-600">₹{totalOutstanding.toLocaleString()}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-8 h-8 text-red-600" />
                  <div>
                    <p className="text-sm text-gray-600">Overdue Amount</p>
                    <p className="text-2xl font-bold text-red-600">₹{totalOverdue.toLocaleString()}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center gap-3">
                  <Users className="w-8 h-8 text-green-600" />
                  <div>
                    <p className="text-sm text-gray-600">Total Parties</p>
                    <p className="text-2xl font-bold text-green-600">{currentData.length}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs and Search */}
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex space-x-1">
                    <button
                      onClick={() => setActiveTab('customers')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        activeTab === 'customers'
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      Customers ({customerOutstanding.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('suppliers')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        activeTab === 'suppliers'
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      Suppliers ({supplierOutstanding.length})
                    </button>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search parties..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <button className="p-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg">
                      <Filter className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Party Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Contact
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Outstanding Amount
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Overdue Amount
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Days
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredData.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                          <Users className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                          <p>No outstanding parties found</p>
                          <p className="text-sm">All parties are up to date with payments</p>
                        </td>
                      </tr>
                    ) : (
                      filteredData.map((party) => (
                        <tr key={party.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-gray-900">{party.name}</div>
                              {party.email && (
                                <div className="text-sm text-gray-500">{party.email}</div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{party.phone}</div>
                            {party.address && (
                              <div className="text-sm text-gray-500">{party.address}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className="text-sm font-medium text-gray-900">
                              ₹{party.outstanding.toLocaleString()}
                            </div>
                            {party.credit_limit && (
                              <div className="text-xs text-gray-500">
                                Limit: ₹{party.credit_limit.toLocaleString()}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className={`text-sm font-medium ${
                              party.overdue > 0 ? 'text-red-600' : 'text-green-600'
                            }`}>
                              ₹{party.overdue.toLocaleString()}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              party.days > 30 ? 'bg-red-100 text-red-800' :
                              party.days > 15 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-green-100 text-green-800'
                            }`}>
                              {party.days} days
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <div className="flex items-center justify-center space-x-2">
                              <button className="text-blue-600 hover:text-blue-800 text-sm">
                                View Details
                              </button>
                              <button className="text-green-600 hover:text-green-800 text-sm">
                                Send Reminder
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OutstandingManagement;