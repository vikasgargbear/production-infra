import React, { useState, useEffect } from 'react';
import { 
  FileText, Search, Filter, Calendar, Download, 
  Eye, Edit, Printer, MessageCircle, DollarSign,
  CheckCircle, XCircle, Clock, AlertCircle, ChevronDown
} from 'lucide-react';
import { invoicesApi } from '../../services/api';
import { formatDate, formatCurrency } from '../../utils/formatters';
import PaymentRecordingModal from './components/PaymentRecordingModal';
import jsPDF from 'jspdf';

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
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [dateFilter, setDateFilter] = useState('all');

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
    const searchMatch = searchQuery === '' || 
      invoice.invoice_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      invoice.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      invoice.customer_phone?.includes(searchQuery);
    
    const statusMatch = filterStatus === 'all' || 
      invoice.payment_status?.toLowerCase() === filterStatus.toLowerCase();

    const invoiceDate = new Date(invoice.invoice_date);
    const now = new Date();
    let dateMatch = true;
    if (dateFilter !== 'all') {
      const daysAgo = parseInt(dateFilter);
      const cutoffDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
      dateMatch = invoiceDate >= cutoffDate;
    }
    
    return searchMatch && statusMatch && dateMatch;
  });

  // Multi-select functionality
  const isAllSelected = filteredInvoices.length > 0 && filteredInvoices.every(invoice => selectedIds.has(invoice.invoice_id));
  const selectedCount = Array.from(selectedIds).filter(id => filteredInvoices.some(f => f.invoice_id === id)).length;

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredInvoices.forEach(invoice => next.delete(invoice.invoice_id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredInvoices.forEach(invoice => next.add(invoice.invoice_id));
        return next;
      });
    }
  };

  const exportSelectedPDF = () => {
    const itemsToExport = filteredInvoices.filter(invoice => selectedIds.has(invoice.invoice_id));
    if (itemsToExport.length === 0) return;

    try {
      // Try to use jspdf-autotable if available
      const autoTable = require('jspdf-autotable');
      
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Invoices Report', 20, 20);
      
      const tableData = itemsToExport.map(invoice => [
        invoice.invoice_number,
        formatDate(invoice.invoice_date),
        invoice.customer_name || 'N/A',
        formatCurrency(invoice.final_amount || 0),
        invoice.payment_status || 'pending'
      ]);

      doc.autoTable({
        head: [['Invoice #', 'Date', 'Customer', 'Amount', 'Status']],
        body: tableData,
        startY: 30,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [59, 130, 246] }
      });

      doc.save('invoices-export.pdf');
    } catch (error) {
      // Fallback to simple PDF
      console.warn('jspdf-autotable not available, using simple PDF export');
      
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Invoices Report', 20, 20);
      
      let yPos = 40;
      doc.setFontSize(10);
      doc.text('Invoice # | Date | Customer | Amount | Status', 20, yPos);
      yPos += 10;
      
      itemsToExport.forEach(invoice => {
        const rowText = `${invoice.invoice_number} | ${formatDate(invoice.invoice_date)} | ${invoice.customer_name || 'N/A'} | ${formatCurrency(invoice.final_amount || 0)} | ${invoice.payment_status || 'pending'}`;
        doc.text(rowText, 20, yPos);
        yPos += 8;
        
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
      });
      
      doc.save('invoices-export.pdf');
    }
  };

  const printSelected = () => {
    const itemsToPrint = filteredInvoices.filter(invoice => selectedIds.has(invoice.invoice_id));
    const html = `<!DOCTYPE html><html><head><title>Print Invoices</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;} table{width:100%;border-collapse:collapse;} th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left;} th{background:#f5f5f5;}</style>
      </head><body>
      <h2>Invoices Report</h2>
      <table><thead><tr><th>Invoice #</th><th>Date</th><th>Customer</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>
      ${itemsToPrint.map(invoice => `<tr><td>${invoice.invoice_number}</td><td>${formatDate(invoice.invoice_date)}</td><td>${invoice.customer_name || 'N/A'}</td><td>${formatCurrency(invoice.final_amount || 0)}</td><td>${invoice.payment_status || 'pending'}</td></tr>`).join('')}
      </tbody></table>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  const whatsappSelected = () => {
    const itemsToSend = filteredInvoices.filter(invoice => selectedIds.has(invoice.invoice_id));
    if (itemsToSend.length === 0) return;
    
    const message = encodeURIComponent(
      `Invoices Report:\n\n${itemsToSend.map(invoice => 
        `${invoice.invoice_number} - ${formatDate(invoice.invoice_date)} - ${invoice.customer_name} - ${formatCurrency(invoice.final_amount || 0)} (${invoice.payment_status})`
      ).join('\n')}`
    );
    
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  if (loading) {
    return <div className="p-8 text-center">Loading invoices...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Invoice Management</h2>
        <p className="text-gray-600">View and manage all sales invoices</p>
      </div>

      {/* Enhanced Filter Bar */}
      <div className="mb-6 border border-gray-200 rounded-lg bg-gray-50 p-4">
        <div className="flex items-center space-x-4">
          {/* Select All */}
          <label className="inline-flex items-center space-x-2">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-gray-300"
            />
            <span className="text-sm text-gray-600">Select All</span>
          </label>

          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search invoices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
            >
              <option value="all">Status: All</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          {/* Date Filter */}
          <div className="relative">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
            >
              <option value="all">Last 30 days</option>
              <option value="7">Last 7 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last year</option>
            </select>
            <Calendar className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          {/* Bulk Actions */}
          {selectedCount > 0 ? (
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-700 mr-1">Selected: {selectedCount}</span>
              <button 
                onClick={exportSelectedPDF} 
                className="px-3 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 text-sm flex items-center space-x-2"
              >
                <Download className="w-4 h-4" />
                <span>PDF</span>
              </button>
              <button 
                onClick={printSelected} 
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center space-x-1"
              >
                <Printer className="w-4 h-4" />
                <span>Print</span>
              </button>
              <button 
                onClick={whatsappSelected} 
                className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center space-x-1"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp</span>
              </button>
            </div>
          ) : (
            <button 
              onClick={exportSelectedPDF}
              className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Export PDF</span>
            </button>
          )}
        </div>
        
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-gray-300"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredInvoices.map((invoice) => (
              <tr key={invoice.invoice_id} className={`hover:bg-gray-50 ${selectedIds.has(invoice.invoice_id) ? 'bg-blue-50' : ''}`}>
                <td className="px-4 py-4 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(invoice.invoice_id)}
                    onChange={() => toggleSelect(invoice.invoice_id)}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                </td>
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
                      {formatCurrency(invoice.final_amount || 0)}
                    </div>
                    {invoice.amount_paid > 0 && invoice.amount_paid < invoice.final_amount && (
                      <div className="text-xs text-gray-500">
                        Paid: {formatCurrency(invoice.amount_paid)}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getPaymentStatusBadge(invoice.payment_status)}
                  {getDocumentLinks(invoice) && (
                    <div className="mt-1">{getDocumentLinks(invoice)}</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex gap-1">
                    {/* View */}
                    <button
                      onClick={() => {/* TODO: Navigate to invoice view */}}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="View Invoice"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    
                    {/* Print */}
                    <button
                      onClick={() => {
                        setSelectedIds(new Set([invoice.invoice_id]));
                        setTimeout(() => printSelected(), 0);
                      }}
                      className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="Print"
                    >
                      <Printer className="w-4 h-4" />
                    </button>

                    {/* Download */}
                    <button
                      onClick={() => {
                        setSelectedIds(new Set([invoice.invoice_id]));
                        setTimeout(() => exportSelectedPDF(), 0);
                      }}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Download PDF"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    
                    {/* WhatsApp */}
                    <button
                      onClick={() => handleWhatsApp(invoice)}
                      className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="Send WhatsApp"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                    
                    {/* Record Payment */}
                    {invoice.payment_status !== 'paid' && invoice.payment_status !== 'cancelled' && (
                      <button
                        onClick={() => handleRecordPayment(invoice)}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Record Payment"
                      >
                        <DollarSign className="w-4 h-4" />
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