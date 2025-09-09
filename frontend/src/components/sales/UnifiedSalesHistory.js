import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Package, 
  ShoppingCart, 
  Search, 
  Calendar,
  Download,
  Eye,
  Filter,
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { invoicesApi } from '../../services/api/modules/invoices.api';
import { salesOrdersApi } from '../../services/api/modules/salesOrders.api';
import { challansApi } from '../../services/api/modules/challans.api';
import { Pagination, StatusBadge, useToast } from '../global';
import { format } from 'date-fns';

/**
 * UnifiedSalesHistory Component
 * Shows all sales documents (invoices, challans, sales orders) in one unified view
 * Enterprise-grade with filtering, search, and pagination
 */
const UnifiedSalesHistory = ({ onClose, onSelectDocument }) => {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [filteredDocuments, setFilteredDocuments] = useState([]);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 20;
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [documentType, setDocumentType] = useState('all'); // all, invoice, challan, sales_order
  const [statusFilter, setStatusFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('');
  
  // Active tab
  const [activeTab, setActiveTab] = useState('all');

  // Document type configurations
  const documentTypes = [
    { id: 'all', label: 'All Documents', icon: FileText, color: 'gray' },
    { id: 'invoice', label: 'Invoices', icon: FileText, color: 'blue' },
    { id: 'challan', label: 'Delivery Challans', icon: Package, color: 'green' },
    { id: 'sales_order', label: 'Sales Orders', icon: ShoppingCart, color: 'purple' }
  ];

  // Fetch all documents
  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const requests = [];
      const documentList = [];
      
      // Fetch based on active tab
      if (activeTab === 'all' || activeTab === 'invoice') {
        requests.push(
          invoicesApi.getAll({
            page: 1,
            limit: 100,
            search: searchTerm,
            from_date: dateFrom,
            to_date: dateTo
          }).then(res => {
            const invoices = (res.data?.invoices || res.data || []).map(inv => ({
              ...inv,
              document_type: 'invoice',
              document_number: inv.invoice_number,
              document_date: inv.invoice_date,
              party_name: inv.customer_name || inv.customer?.name,
              amount: inv.final_amount || inv.total_amount,
              status: inv.payment_status || 'pending',
              icon: FileText,
              color: 'blue'
            }));
            return invoices;
          }).catch(err => {
            return [];
          })
        );
      }
      
      if (activeTab === 'all' || activeTab === 'challan') {
        requests.push(
          challansApi.getAll({
            page: 1,
            limit: 100,
            search: searchTerm,
            from_date: dateFrom,
            to_date: dateTo
          }).then(res => {
            const challans = (res.data?.challans || res.data || []).map(ch => ({
              ...ch,
              document_type: 'challan',
              document_number: ch.challan_number,
              document_date: ch.challan_date,
              party_name: ch.customer_name || ch.customer?.name,
              amount: ch.total_amount || 0,
              status: ch.delivery_status || 'pending',
              icon: Package,
              color: 'green'
            }));
            return challans;
          }).catch(err => {
            return [];
          })
        );
      }
      
      if (activeTab === 'all' || activeTab === 'sales_order') {
        requests.push(
          salesOrdersApi.list({
            page: 1,
            limit: 100,
            search: searchTerm,
            from_date: dateFrom,
            to_date: dateTo
          }).then(res => {
            const orders = (res.data?.orders || res.data || []).map(ord => ({
              ...ord,
              document_type: 'sales_order',
              document_number: ord.order_number,
              document_date: ord.order_date,
              party_name: ord.customer_name || ord.customer?.name,
              amount: ord.total_amount || ord.final_amount,
              status: ord.order_status || 'pending',
              icon: ShoppingCart,
              color: 'purple'
            }));
            return orders;
          }).catch(err => {
            return [];
          })
        );
      }
      
      // Wait for all requests
      const results = await Promise.all(requests);
      results.forEach(docs => {
        documentList.push(...docs);
      });
      
      // Sort by date (newest first)
      documentList.sort((a, b) => {
        const dateA = new Date(a.document_date);
        const dateB = new Date(b.document_date);
        return dateB - dateA;
      });
      
      setDocuments(documentList);
      applyFilters(documentList);
    } catch (error) {
      toast.error('Failed to fetch documents');
    } finally {
      setLoading(false);
    }
  };

  // Apply filters to documents
  const applyFilters = (docs = documents) => {
    let filtered = [...docs];
    
    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(doc => 
        doc.document_number?.toLowerCase().includes(search) ||
        doc.party_name?.toLowerCase().includes(search) ||
        doc.status?.toLowerCase().includes(search)
      );
    }
    
    // Customer filter
    if (customerFilter) {
      const customer = customerFilter.toLowerCase();
      filtered = filtered.filter(doc => 
        doc.party_name?.toLowerCase().includes(customer)
      );
    }
    
    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(doc => 
        doc.status?.toLowerCase() === statusFilter.toLowerCase()
      );
    }
    
    // Pagination
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginated = filtered.slice(startIndex, endIndex);
    
    setFilteredDocuments(paginated);
    setTotalItems(filtered.length);
    setTotalPages(Math.ceil(filtered.length / itemsPerPage));
  };

  // Load documents on mount and filter changes
  useEffect(() => {
    fetchDocuments();
  }, [activeTab, dateFrom, dateTo]);

  useEffect(() => {
    applyFilters();
  }, [searchTerm, customerFilter, statusFilter, currentPage]);

  // Handle document selection
  const handleSelectDocument = (doc) => {
    if (onSelectDocument) {
      onSelectDocument(doc.document_type, doc);
    }
  };

  // Get status color
  const getStatusColor = (status) => {
    const statusLower = status?.toLowerCase() || '';
    if (statusLower.includes('paid') || statusLower.includes('delivered') || statusLower.includes('completed')) 
      return 'green';
    if (statusLower.includes('partial')) return 'yellow';
    if (statusLower.includes('pending') || statusLower.includes('draft')) return 'gray';
    if (statusLower.includes('cancelled') || statusLower.includes('failed')) return 'red';
    return 'gray';
  };

  // Format date
  const formatDate = (date) => {
    if (!date) return '-';
    try {
      return format(new Date(date), 'dd MMM yyyy');
    } catch {
      return date;
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '-';
    return `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Sales History</h2>
            <p className="text-sm text-gray-500 mt-1">View all sales documents in one place</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 py-3 border-b border-gray-200">
          <div className="flex space-x-1">
            {documentTypes.map(type => {
              const Icon = type.icon;
              const isActive = activeTab === type.id;
              return (
                <button
                  key={type.id}
                  onClick={() => {
                    setActiveTab(type.id);
                    setCurrentPage(1);
                  }}
                  className={`
                    flex items-center px-4 py-2 rounded-lg font-medium transition-all
                    ${isActive 
                      ? `bg-${type.color}-50 text-${type.color}-700 border border-${type.color}-200` 
                      : 'text-gray-600 hover:bg-gray-50'
                    }
                  `}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {type.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-5 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search documents..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Customer Filter */}
            <input
              type="text"
              placeholder="Filter by customer..."
              value={customerFilter}
              onChange={(e) => {
                setCustomerFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="delivered">Delivered</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>

            {/* Date From */}
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="From date"
            />

            {/* Date To */}
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="To date"
            />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Document No
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-6 py-4 text-center text-gray-500">
                    Loading documents...
                  </td>
                </tr>
              ) : filteredDocuments.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-4 text-center text-gray-500">
                    No documents found
                  </td>
                </tr>
              ) : (
                filteredDocuments.map((doc, index) => {
                  const Icon = doc.icon;
                  return (
                    <tr key={`${doc.document_type}-${doc.document_number}-${index}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`flex items-center text-${doc.color}-600`}>
                          <Icon className="h-4 w-4 mr-2" />
                          <span className="text-sm font-medium capitalize">
                            {doc.document_type.replace('_', ' ')}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-gray-900">
                          {doc.document_number}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(doc.document_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">
                          {doc.party_name || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-gray-900">
                          {formatCurrency(doc.amount)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge 
                          status={doc.status} 
                          color={getStatusColor(doc.status)}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleSelectDocument(doc)}
                            className="text-blue-600 hover:text-blue-900"
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              // Handle download
                              toast.info('Download feature coming soon');
                            }}
                            className="text-gray-600 hover:text-gray-900"
                            title="Download"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer with Pagination */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            loading={loading}
            itemName="documents"
          />
        </div>
      </div>
    </div>
  );
};

export default UnifiedSalesHistory;