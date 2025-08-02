import React, { useState, useEffect } from 'react';
import { 
  FileText, Search, Filter, Calendar, Download, 
  Eye, Edit, Printer, MessageCircle, DollarSign,
  CheckCircle, XCircle, Clock, AlertCircle
} from 'lucide-react';
import { invoicesApi } from '../../services/api';
import { formatDate, formatCurrency } from '../../utils/formatters';
import PaymentRecordingModal from './components/PaymentRecordingModal';

const InvoiceManagement = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  useEffect(() => {
    loadInvoices();
  }, [filterStatus, dateRange]);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const params = {
        from_date: dateRange.from,
        to_date: dateRange.to
      };
      
      if (filterStatus !== 'all') {
        params.payment_status = filterStatus;
      }
      
      const response = await invoicesApi.getAll(params);
      setInvoices(response.data || []);
    } catch (error) {
      console.error('Error loading invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async (invoiceId) => {
    try {
      await invoicesApi.getPDF(invoiceId);
    } catch (error) {
      console.error('Error printing invoice:', error);
      alert('Failed to download invoice PDF');
    }
  };

  const handleWhatsApp = async (invoice) => {
    try {
      if (!invoice.customer_phone) {
        alert('Customer phone number not available');
        return;
      }
      
      await invoicesApi.sendWhatsApp(invoice.invoice_id, invoice.customer_phone);
      alert('WhatsApp message sent successfully');
    } catch (error) {
      console.error('Error sending WhatsApp:', error);
      alert('Failed to send WhatsApp message');
    }
  };

  const handleRecordPayment = (invoice) => {
    setSelectedInvoice(invoice);
    setShowPaymentModal(true);
  };

  const handlePaymentRecorded = (paymentData) => {
    // Reload invoices to reflect the payment
    loadInvoices();
    setShowPaymentModal(false);
    setSelectedInvoice(null);
    alert('Payment recorded successfully');
  };

  const handleCancelInvoice = async (invoice) => {
    const reason = prompt('Please provide a reason for cancellation:');
    if (!reason) return;
    
    if (!window.confirm(`Are you sure you want to cancel invoice ${invoice.invoice_number}?`)) {
      return;
    }
    
    try {
      await invoicesApi.cancel(invoice.invoice_id, reason);
      alert('Invoice cancelled successfully');
      loadInvoices();
    } catch (error) {
      console.error('Error cancelling invoice:', error);
      alert('Failed to cancel invoice');
    }
  };

  const getPaymentStatusBadge = (status) => {
    const statusConfig = {
      paid: { 
        color: 'bg-green-100 text-green-800', 
        icon: CheckCircle,
        label: 'Paid'
      },
      pending: { 
        color: 'bg-yellow-100 text-yellow-800', 
        icon: Clock,
        label: 'Pending'
      },
      partial: { 
        color: 'bg-blue-100 text-blue-800', 
        icon: AlertCircle,
        label: 'Partial'
      },
      cancelled: { 
        color: 'bg-red-100 text-red-800', 
        icon: XCircle,
        label: 'Cancelled'
      }
    };
    
    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;
    
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${config.color}`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    );
  };

  const getDocumentLinks = (invoice) => {
    const links = [];
    
    if (invoice.order_id) {
      links.push(
        <span key="order" className="text-xs text-gray-500">
          Order #{invoice.order_number || invoice.order_id}
        </span>
      );
    }
    
    if (invoice.challan_id) {
      links.push(
        <span key="challan" className="text-xs text-gray-500">
          Challan #{invoice.challan_number || invoice.challan_id}
        </span>
      );
    }
    
    return links.length > 0 ? (
      <div className="flex gap-2">{links}</div>
    ) : null;
  };

  const filteredInvoices = invoices.filter(invoice => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        invoice.invoice_number?.toLowerCase().includes(query) ||
        invoice.customer_name?.toLowerCase().includes(query) ||
        invoice.customer_phone?.includes(query)
      );
    }
    return true;
  });

  if (loading) {
    return <div className="p-8 text-center">Loading invoices...</div>;
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Invoice Management</h2>
        <p className="text-gray-600">View and manage all sales invoices</p>
      </div>

      {/* Filters */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search invoices..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2 w-full border rounded-lg"
          />
        </div>
        
        {/* Date Range */}
        <div className="flex gap-2">
          <input
            type="date"
            value={dateRange.from}
            onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
            className="px-3 py-2 border rounded-lg flex-1"
          />
          <input
            type="date"
            value={dateRange.to}
            onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
            className="px-3 py-2 border rounded-lg flex-1"
          />
        </div>
        
        {/* Status Filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2 border rounded-lg"
        >
          <option value="all">All Status</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="partial">Partial</option>
          <option value="cancelled">Cancelled</option>
        </select>
        
        {/* Summary Stats */}
        <div className="flex items-center justify-end gap-4 text-sm">
          <div>
            <span className="text-gray-500">Total:</span>
            <span className="ml-1 font-semibold">
              ₹{filteredInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0).toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Count:</span>
            <span className="ml-1 font-semibold">{filteredInvoices.length}</span>
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Links</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredInvoices.map((invoice) => (
              <tr key={invoice.invoice_id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-900">
                      {invoice.invoice_number}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(invoice.invoice_date)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="text-sm text-gray-900">{invoice.customer_name}</div>
                    <div className="text-xs text-gray-500">{invoice.customer_phone}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(invoice.total_amount || 0)}
                    </div>
                    {invoice.amount_paid > 0 && invoice.amount_paid < invoice.total_amount && (
                      <div className="text-xs text-gray-500">
                        Paid: {formatCurrency(invoice.amount_paid)}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getPaymentStatusBadge(invoice.payment_status)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getDocumentLinks(invoice)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex gap-1">
                    {/* View */}
                    <button
                      onClick={() => console.log('View invoice:', invoice)}
                      className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
                      title="View Invoice"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    
                    {/* Print */}
                    <button
                      onClick={() => handlePrint(invoice.invoice_id)}
                      className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
                      title="Print Invoice"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                    
                    {/* WhatsApp */}
                    <button
                      onClick={() => handleWhatsApp(invoice)}
                      className="p-1 text-green-600 hover:text-green-700 hover:bg-green-50 rounded"
                      title="Send WhatsApp"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                    
                    {/* Record Payment */}
                    {invoice.payment_status !== 'paid' && invoice.payment_status !== 'cancelled' && (
                      <button
                        onClick={() => handleRecordPayment(invoice)}
                        className="p-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded"
                        title="Record Payment"
                      >
                        <DollarSign className="w-4 h-4" />
                      </button>
                    )}
                    
                    {/* Cancel */}
                    {invoice.payment_status !== 'cancelled' && (
                      <button
                        onClick={() => handleCancelInvoice(invoice)}
                        className="p-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
                        title="Cancel Invoice"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {filteredInvoices.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No invoices found
          </div>
        )}
      </div>

      {/* Payment Recording Modal */}
      <PaymentRecordingModal
        isOpen={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          setSelectedInvoice(null);
        }}
        invoice={selectedInvoice}
        onPaymentRecorded={handlePaymentRecorded}
      />
    </div>
  );
};

export default InvoiceManagement;