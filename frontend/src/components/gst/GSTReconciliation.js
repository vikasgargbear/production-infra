import React, { useState } from 'react';
import { 
  RefreshCw, AlertTriangle, CheckCircle, XCircle,
  Upload, Download, Search, Filter, FileText,
  TrendingUp, TrendingDown, Info, ArrowRight
} from 'lucide-react';

const GSTReconciliation = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState('purchase');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  
  // Mock reconciliation data
  const reconciliationData = {
    purchase: {
      matched: 145,
      mismatched: 23,
      missing: 12,
      total: 180,
      items: [
        {
          id: 1,
          supplierGSTIN: '29AABCT1332L1ZN',
          supplierName: 'Apollo Pharma Distributors',
          invoiceNo: 'APL/2024/1234',
          invoiceDate: '2024-01-15',
          ourAmount: 125000,
          gstPortalAmount: 125000,
          ourGST: 22500,
          portalGST: 22500,
          status: 'matched'
        },
        {
          id: 2,
          supplierGSTIN: '27AABCT1332L2ZN',
          supplierName: 'MedPlus Suppliers',
          invoiceNo: 'MED/2024/5678',
          invoiceDate: '2024-01-18',
          ourAmount: 85000,
          gstPortalAmount: 84500,
          ourGST: 15300,
          portalGST: 15210,
          status: 'mismatched'
        },
        {
          id: 3,
          supplierGSTIN: '29AABCT1332L3ZN',
          supplierName: 'HealthKart Wholesale',
          invoiceNo: 'HK/2024/9012',
          invoiceDate: '2024-01-20',
          ourAmount: 45000,
          gstPortalAmount: 0,
          ourGST: 8100,
          portalGST: 0,
          status: 'missing'
        }
      ]
    },
    sales: {
      matched: 189,
      mismatched: 15,
      missing: 8,
      total: 212,
      items: []
    }
  };

  const getStatusBadge = (status) => {
    const config = {
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

  const currentData = reconciliationData[activeTab];
  const filteredItems = currentData.items.filter(item => {
    const matchesSearch = searchTerm === '' || 
      item.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.invoiceNo.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterStatus === 'all' || item.status === filterStatus;
    
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="flex-1 flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">GST Reconciliation</h1>
            <p className="text-gray-600 mt-1">Match your records with GST portal data</p>
          </div>
          <div className="flex items-center space-x-3">
            <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-2">
              <Upload className="w-4 h-4" />
              <span>Import GSTR-2A</span>
            </button>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2">
              <RefreshCw className="w-4 h-4" />
              <span>Auto Reconcile</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex space-x-8">
          <button
            onClick={() => setActiveTab('purchase')}
            className={`py-3 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'purchase'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Purchase Reconciliation
          </button>
          <button
            onClick={() => setActiveTab('sales')}
            className={`py-3 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'sales'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Sales Reconciliation
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Records</p>
                <p className="text-2xl font-bold text-gray-900">{currentData.total}</p>
              </div>
              <FileText className="w-8 h-8 text-gray-400" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Matched</p>
                <p className="text-2xl font-bold text-green-600">{currentData.matched}</p>
                <p className="text-xs text-gray-500">{((currentData.matched / currentData.total) * 100).toFixed(1)}%</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Mismatched</p>
                <p className="text-2xl font-bold text-yellow-600">{currentData.mismatched}</p>
                <p className="text-xs text-gray-500">{((currentData.mismatched / currentData.total) * 100).toFixed(1)}%</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-yellow-500" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Missing</p>
                <p className="text-2xl font-bold text-red-600">{currentData.missing}</p>
                <p className="text-xs text-gray-500">{((currentData.missing / currentData.total) * 100).toFixed(1)}%</p>
              </div>
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex items-center space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by supplier name or invoice number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="matched">Matched</option>
              <option value="mismatched">Mismatched</option>
              <option value="missing">Missing</option>
            </select>
            <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-2">
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
          </div>
        </div>

        {/* Reconciliation Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier Details</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice Info</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Our Records</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">GST Portal</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.supplierName}</p>
                        <p className="text-xs text-gray-500">GSTIN: {item.supplierGSTIN}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm text-gray-900">{item.invoiceNo}</p>
                        <p className="text-xs text-gray-500">{item.invoiceDate}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div>
                        <p className="text-sm font-medium text-gray-900">₹{item.ourAmount.toLocaleString()}</p>
                        <p className="text-xs text-gray-500">GST: ₹{item.ourGST.toLocaleString()}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {item.gstPortalAmount > 0 ? `₹${item.gstPortalAmount.toLocaleString()}` : '-'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {item.portalGST > 0 ? `GST: ₹${item.portalGST.toLocaleString()}` : '-'}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {getStatusBadge(item.status)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {item.status === 'mismatched' && (
                        <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                          Review
                        </button>
                      )}
                      {item.status === 'missing' && (
                        <button className="text-red-600 hover:text-red-800 text-sm font-medium">
                          Report
                        </button>
                      )}
                      {item.status === 'matched' && (
                        <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 rounded-lg p-4 mt-6 flex items-start space-x-3">
          <Info className="w-5 h-5 text-blue-600 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-blue-900">Reconciliation Tips</p>
            <ul className="mt-1 space-y-1 text-blue-800">
              <li>• Mismatches can occur due to rounding differences or delayed filing by suppliers</li>
              <li>• Missing records should be followed up with suppliers for filing corrections</li>
              <li>• Regular reconciliation helps maximize ITC claims and avoid notices</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GSTReconciliation;