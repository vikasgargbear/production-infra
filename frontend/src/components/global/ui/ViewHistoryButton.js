import React, { useState, useEffect } from 'react';
import { 
  History, Eye, Edit, Download, Printer, X, Search, Filter, Calendar, 
  ChevronDown, CheckSquare, MoreVertical, Mail, MessageSquare, FileText,
  Share2, Copy, Trash2, RefreshCw, Send, Clock, Sparkles
} from 'lucide-react';
import GlobalPDFGenerator from '../pdf/GlobalPDFGenerator';
import { ordersAPI, purchasesAPI, paymentAPI, challansAPI, invoiceAPI, salesOrdersAPI, purchasesApi, returnsApi, stockApi } from '../../../services/api';

const ViewHistoryButton = React.forwardRef(({ 
  historyType = 'invoice', // 'invoice', 'challan', 'payment', 'purchase', 'order', 'sales-order'
  onViewItem,
  onEditItem,
  className = '',
  buttonText = ''
}, ref) => {
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [loadSuccess, setLoadSuccess] = useState(false);

  // Expose click handler via ref
  React.useImperativeHandle(ref, () => ({
    click: () => {
      handleOpenHistory();
    }
  }), []);

  const getHistoryTitle = () => {
    switch (historyType) {
      case 'invoice': return 'Invoice History';
      case 'challan': return 'Delivery Challan History';
      case 'payment': return 'Payment History';
      case 'purchase': return 'Purchase History';
      case 'returns': return 'Returns History';
      case 'stock': return 'Stock Movement History';
      case 'order': return 'Order History';
      case 'sales-order': return 'Sales Order History';
      default: return 'History';
    }
  };

  const loadHistory = async () => {
    setLoading(true);
    try {
      let response;
      let formattedItems = [];

      switch (historyType) {
        case 'invoice':
          try {
            response = await invoiceAPI.search({ limit: 10 });
          } catch (e1) {
            console.error('Invoice API failed, trying orders as fallback:', e1);
            try {
              response = await ordersAPI.search({ limit: 10 });
            } catch (e2) {
              console.error('Orders API also failed:', e2);
              response = { data: [] };
            }
          }
          const actualResponse = response.data || response;
          const invoiceData = Array.isArray(actualResponse) ? actualResponse : 
                             (actualResponse.data && Array.isArray(actualResponse.data)) ? actualResponse.data :
                             (actualResponse.invoices && Array.isArray(actualResponse.invoices)) ? actualResponse.invoices :
                             (actualResponse.orders && Array.isArray(actualResponse.orders)) ? actualResponse.orders : [];
          formattedItems = invoiceData.map(invoice => ({
            id: invoice.invoice_id || invoice.id || invoice.order_id,
            number: invoice.invoice_number || invoice.invoice_no || `INV-${invoice.invoice_id || invoice.order_id || invoice.id}`,
            date: invoice.invoice_date || invoice.created_at || invoice.order_date,
            customerName: invoice.customer_name || 'N/A',
            customerPhone: invoice.customer_phone || invoice.phone || invoice.primary_phone || '',
            amount: invoice.final_amount || invoice.net_amount || invoice.total_amount || 0,
            status: invoice.payment_status || invoice.status || 'pending',
            rawData: invoice
          }));
          break;

        case 'challan':
          try {
            response = await challansAPI.search({ limit: 20 });
            const challanData = response.data || response;
            // Handle both array response and object with data property
            const challans = Array.isArray(challanData) ? challanData : 
                           (challanData.data && Array.isArray(challanData.data)) ? challanData.data :
                           (challanData.challans && Array.isArray(challanData.challans)) ? challanData.challans : [];
            
            formattedItems = challans.map(challan => ({
              id: challan.challan_id || challan.id,
              number: challan.challan_number || `DC-${challan.challan_id || challan.id}`,
              date: challan.challan_date || challan.created_at,
              customerName: challan.customer_name || 'N/A',
              amount: challan.total_amount || 0,
              status: challan.status || challan.delivery_status || 'pending',
              rawData: challan
            }));
          } catch (error) {
            console.error('Error loading challan history:', error);
            formattedItems = [];
          }
          break;

        case 'payment':
          response = await paymentAPI.search({ limit: 10 });
          const paymentResponse = response.data || response;
          if (paymentResponse.data && Array.isArray(paymentResponse.data)) {
            formattedItems = paymentResponse.data.map(payment => ({
              id: payment.payment_id,
              number: payment.reference_number || `PAY-${payment.payment_id}`,
              date: payment.payment_date || payment.created_at,
              customerName: payment.party_name || payment.customer_name || 'N/A',
              amount: payment.amount || 0,
              status: payment.status || 'completed',
              paymentMode: payment.payment_mode,
              rawData: payment
            }));
          }
          break;

        case 'purchase':
          try {
            response = await purchasesApi.getAll({ limit: 20 });
            const purchaseData = response.data?.purchases || response.data || [];
            formattedItems = purchaseData.map(purchase => ({
              id: purchase.id,
              number: purchase.invoice_no || `PUR-${purchase.id}`,
              date: purchase.invoice_date || purchase.created_at,
              customerName: purchase.supplier_name || 'Unknown Supplier',
              amount: purchase.total_amount || 0,
              status: purchase.payment_status || 'pending',
              rawData: purchase
            }));
          } catch (error) {
            console.error('Error loading purchase history:', error);
            formattedItems = [];
          }
          break;
        
        case 'returns':
          try {
            const [salesReturns, purchaseReturns] = await Promise.all([
              returnsApi.getSaleReturns(),
              returnsApi.getPurchaseReturns()
            ]);
            const salesData = salesReturns.data?.returns || [];
            const purchaseData = purchaseReturns.data?.returns || [];
            const allReturns = [
              ...salesData.map(ret => ({
                id: ret.id,
                number: ret.return_no || `SR-${ret.id}`,
                date: ret.return_date,
                customerName: ret.customer_name || 'N/A',
                amount: ret.total_amount || 0,
                status: ret.status || 'pending',
                type: 'Sales Return',
                rawData: ret
              })),
              ...purchaseData.map(ret => ({
                id: ret.id,
                number: ret.return_no || `PR-${ret.id}`,
                date: ret.return_date,
                customerName: ret.supplier_name || 'N/A',
                amount: ret.total_amount || 0,
                status: ret.status || 'pending',
                type: 'Purchase Return',
                rawData: ret
              }))
            ];
            formattedItems = allReturns.sort((a, b) => new Date(b.date) - new Date(a.date));
          } catch (error) {
            console.error('Error loading returns history:', error);
            formattedItems = [];
          }
          break;
        
        case 'stock':
          try {
            response = await stockApi.getMovements({ limit: 20 });
            const movementData = response.data?.movements || response.data || [];
            formattedItems = movementData.map(movement => ({
              id: movement.id,
              number: movement.movement_no || `STK-${movement.id}`,
              date: movement.movement_date || movement.created_at,
              customerName: movement.product_name || 'Unknown Product',
              amount: 0,
              status: movement.status || 'completed',
              type: movement.movement_type || 'movement',
              quantity: movement.quantity,
              rawData: movement
            }));
          } catch (error) {
            console.error('Error loading stock history:', error);
            formattedItems = [];
          }
          break;

        case 'order':
        case 'sales-order':
          try {
            response = await salesOrdersAPI.getAll({ limit: 10 });
          } catch (error) {
            console.error('Sales orders API failed:', error);
            try {
              response = await ordersAPI.search({ 
                limit: 10
              });
            } catch (orderError) {
              console.error('Orders API also failed:', orderError);
              response = { data: [] };
            }
          }
          const orderResponse = response.data || response;
          const orderData = Array.isArray(orderResponse) ? orderResponse : 
                           (orderResponse.data && Array.isArray(orderResponse.data)) ? orderResponse.data :
                           (orderResponse.orders && Array.isArray(orderResponse.orders)) ? orderResponse.orders : [];
          formattedItems = orderData.map(order => ({
            id: order.order_id || order.id,
            number: order.order_number || `ORD-${order.order_id || order.id}`,
            date: order.order_date || order.created_at,
            customerName: order.customer_name || 'N/A',
            amount: order.final_amount || order.total_amount || 0,
            status: order.order_status || order.status || 'pending',
            rawData: order
          }));
          break;

        default:
          formattedItems = [];
      }
      setHistoryItems(formattedItems);
      setSelectedIds(new Set());
    } catch (error) {
      console.error(`Error loading ${historyType} history:`, error);
      setHistoryItems([]);
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  };

  const handleOpenHistory = async () => {
    setShowHistory(true);
    setLoading(true);
    await loadHistory();
    setLoadSuccess(true);
    setTimeout(() => setLoadSuccess(false), 2000);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  // Filter history items based on search and filters
  const filteredItems = historyItems.filter(item => {
    const searchMatch = searchTerm === '' || 
      item.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.number.toLowerCase().includes(searchTerm.toLowerCase());
    const statusMatch = statusFilter === 'all' || 
      (item.status && item.status.toLowerCase() === statusFilter.toLowerCase());
    const itemDate = new Date(item.date);
    const now = new Date();
    let dateMatch = true;
    if (dateFilter !== 'all') {
      const daysAgo = parseInt(dateFilter);
      const cutoffDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
      dateMatch = itemDate >= cutoffDate;
    }
    return searchMatch && statusMatch && dateMatch;
  });

  const isAllSelected = filteredItems.length > 0 && filteredItems.every(item => selectedIds.has(item.id));
  const selectedCount = Array.from(selectedIds).filter(id => filteredItems.some(f => f.id === id)).length;

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (isAllSelected) {
      // Deselect all visible
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredItems.forEach(item => next.delete(item.id));
        return next;
      });
    } else {
      // Select all visible
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredItems.forEach(item => next.add(item.id));
        return next;
      });
    }
  };

  const exportSelected = () => {
    const itemsToExport = filteredItems.filter(item => selectedIds.has(item.id));
    const rows = [
      ['Date', 'Customer', 'Amount', 'Status', 'Number'],
      ...itemsToExport.map(i => [
        formatDate(i.date),
        i.customerName,
        i.amount ? String(i.amount) : '0',
        i.status || '',
        i.number
      ])
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${historyType}-history-export.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const printSelected = () => {
    const itemsToPrint = filteredItems.filter(item => selectedIds.has(item.id));
    const html = `<!DOCTYPE html><html><head><title>Print ${getHistoryTitle()}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;} table{width:100%;border-collapse:collapse;} th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left;} th{background:#f5f5f5;}</style>
      </head><body>
      <h2>${getHistoryTitle()}</h2>
      <table><thead><tr><th>Date</th><th>Customer</th><th>Amount</th><th>Status</th><th>Number</th></tr></thead>
      <tbody>
      ${itemsToPrint.map(i => `<tr><td>${formatDate(i.date)}</td><td>${i.customerName}</td><td>${i.amount ? formatCurrency(i.amount) : '-'}</td><td>${i.status || ''}</td><td>${i.number}</td></tr>`).join('')}
      </tbody></table>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  // Generate beautiful PDF
  const printPDF = (theme = 'digital') => {
    const itemsToPrint = selectedIds.size > 0 
      ? filteredItems.filter(item => selectedIds.has(item.id))
      : filteredItems;
    
    if (itemsToPrint.length === 0) return;
    
    const pdfGenerator = new GlobalPDFGenerator(theme);
    const doc = pdfGenerator.doc;
    
    // Add header
    pdfGenerator.addHeader(getHistoryTitle());
    
    // Add party summary if single item
    if (itemsToPrint.length === 1) {
      const item = itemsToPrint[0];
      pdfGenerator.addPartyDetails({
        name: item.customerName,
        phone: item.customerPhone || '',
        address: item.address || '',
        gst: item.gst || ''
      }, historyType === 'purchase' ? 'supplier' : 'customer');
    }
    
    // Prepare table data
    const headers = ['Date', 'Customer/Supplier', 'Document No.', 'Amount', 'Status'];
    const rows = itemsToPrint.map(item => [
      formatDate(item.date),
      item.customerName,
      item.number,
      item.amount ? formatCurrency(item.amount) : '-',
      item.status || '-'
    ]);
    
    // Add table
    pdfGenerator.addTable(headers, rows, historyType === 'purchase' ? 'supplier' : 'customer');
    
    // Add summary for financial documents
    if (['invoice', 'purchase', 'challan', 'payment'].includes(historyType)) {
      const totalAmount = itemsToPrint.reduce((sum, item) => sum + (item.amount || 0), 0);
      pdfGenerator.addSummary({
        subtotal: totalAmount,
        tax: 0,
        discount: 0,
        total: totalAmount
      });
    }
    
    // Add footer
    pdfGenerator.addFooter();
    
    // Save the PDF
    doc.save(`${historyType}-history-${new Date().getTime()}.pdf`);
  };

  // Email selected items
  const emailSelected = () => {
    const itemsToEmail = filteredItems.filter(item => selectedIds.has(item.id));
    if (itemsToEmail.length === 0) return;
    
    const subject = encodeURIComponent(`${getHistoryTitle()} - ${itemsToEmail.length} items`);
    const body = encodeURIComponent(itemsToEmail.map(i => 
      `${formatDate(i.date)} - ${i.customerName} - ${i.amount ? formatCurrency(i.amount) : ''} (${i.number})`
    ).join('\n'));
    
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  };

  // SMS selected items
  const smsSelected = () => {
    const itemsToSend = filteredItems.filter(item => selectedIds.has(item.id));
    if (itemsToSend.length === 0) return;
    
    const target = itemsToSend.find(i => i.customerPhone);
    if (target && target.customerPhone) {
      const message = encodeURIComponent(itemsToSend.map(i => 
        `${i.number} - ${i.amount ? formatCurrency(i.amount) : ''}`
      ).join(', '));
      window.open(`sms:${target.customerPhone}?body=${message}`, '_blank');
    }
  };

  // Copy to clipboard
  const copyToClipboard = () => {
    const itemsToCopy = filteredItems.filter(item => selectedIds.has(item.id));
    if (itemsToCopy.length === 0) return;
    
    const text = itemsToCopy.map(i => 
      `${formatDate(i.date)} - ${i.customerName} - ${i.amount ? formatCurrency(i.amount) : ''} (${i.number})`
    ).join('\n');
    
    navigator.clipboard.writeText(text);
  };

  // Share using Web Share API
  const shareSelected = () => {
    const itemsToShare = filteredItems.filter(item => selectedIds.has(item.id));
    if (itemsToShare.length === 0) return;
    
    const text = itemsToShare.map(i => 
      `${formatDate(i.date)} - ${i.customerName} - ${i.amount ? formatCurrency(i.amount) : ''} (${i.number})`
    ).join('\n');
    
    if (navigator.share) {
      navigator.share({
        title: getHistoryTitle(),
        text: text
      });
    } else {
      copyToClipboard();
    }
  };

  // Duplicate selected items
  const duplicateSelected = () => {
    const itemsToDuplicate = filteredItems.filter(item => selectedIds.has(item.id));
    if (itemsToDuplicate.length === 0) return;
    
    // This would typically call an API to duplicate items
    console.log('Duplicating items:', itemsToDuplicate);
  };

  // Refresh history
  const refreshHistory = () => {
    loadHistory();
  };

  const whatsappSelected = () => {
    const itemsToSend = filteredItems.filter(item => selectedIds.has(item.id));
    if (itemsToSend.length === 0) return;
    // Find first item with a phone number
    const target = itemsToSend.find(i => i.customerPhone);
    const message = encodeURIComponent(itemsToSend.map(i => `${formatDate(i.date)} - ${i.customerName} - ${i.amount ? formatCurrency(i.amount) : ''} (${i.number})`).join('\n'));
    if (target && target.customerPhone) {
      let phone = String(target.customerPhone).replace(/\s+/g, '');
      if (!phone.startsWith('+')) phone = '+91' + phone;
      window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
    } else {
      // Fallback: open WhatsApp without a specific phone
      window.open(`https://wa.me/?text=${message}`, '_blank');
    }
  };

  return (
    <>
      {/* Modern Animated History Button */}
      <style>{`
        @keyframes timeline-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }
        
        @keyframes sparkle {
          0% { transform: scale(0) rotate(0deg); opacity: 0; }
          50% { transform: scale(1) rotate(180deg); opacity: 1; }
          100% { transform: scale(0) rotate(360deg); opacity: 0; }
        }
        
        .history-icon-animated {
          animation: timeline-pulse 2s ease-in-out infinite;
        }
        
        .sparkle-effect {
          position: absolute;
          inset: -8px;
          pointer-events: none;
        }
        
        .sparkle-effect::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 20px;
          height: 20px;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle, rgba(99, 102, 241, 0.6) 0%, transparent 70%);
          animation: sparkle 1.5s ease-in-out;
        }
      `}</style>
      
      <button
        onClick={handleOpenHistory}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={className || `
          relative px-4 py-2.5 rounded-xl transition-all duration-300 ease-out
          flex items-center space-x-2.5
          ${loadSuccess 
            ? 'bg-gradient-to-r from-purple-400 to-pink-400 text-white shadow-lg shadow-purple-200/50' 
            : isHovered
              ? 'bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-300 shadow-md'
              : 'bg-white hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 border border-gray-200 hover:border-indigo-300 hover:shadow-md text-gray-700'
          }
          group transform hover:scale-105 active:scale-95
          font-medium text-sm cursor-pointer
        `}
        title={`View ${getHistoryTitle()}`}
        style={className ? {} : {}}
      >
        {/* Sparkle effect on hover */}
        {isHovered && <div className="sparkle-effect" />}
        
        {/* Modern animated icon */}
        <div className="relative">
          {loadSuccess ? (
            <Sparkles className="w-4 h-4 text-white animate-pulse" />
          ) : (
            <History className={`w-4 h-4 transition-all duration-500 ${
              isHovered 
                ? 'text-indigo-600 history-icon-animated' 
                : 'text-gray-600 group-hover:text-indigo-600'
            }`} />
          )}
          
          {/* Modern ripple effect */}
          {isHovered && (
            <div className="absolute inset-0 -m-2">
              <div className="w-8 h-8 rounded-full bg-indigo-400 opacity-20 animate-ping" />
            </div>
          )}
        </div>
        
        {/* Text label with gradient on hover */}
        {buttonText && (
          <span className={`relative ${
            loadSuccess 
              ? 'text-white' 
              : isHovered 
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent font-semibold' 
                : 'text-gray-700'
          }`}>
            {buttonText}
          </span>
        )}
      </button>

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl m-4 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">{getHistoryTitle()}</h2>
              <button
                onClick={() => setShowHistory(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Search and Filters */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
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
                    placeholder="Search transactions..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>

                {/* Status Filter */}
                <div className="relative">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                  >
                    <option value="all">Status: All</option>
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
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
                    {/* Export Button */}
                    <button 
                      onClick={exportSelected} 
                      className="px-3 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm flex items-center space-x-2 shadow-sm"
                      title="Export to CSV"
                    >
                      <Download className="w-4 h-4" />
                      <span>Export</span>
                    </button>
                    
                    {/* Print Button */}
                    <button 
                      onClick={printPDF} 
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex items-center space-x-2 shadow-sm"
                      title="Generate PDF"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Print PDF</span>
                    </button>
                    
                    {/* WhatsApp Button with Logo */}
                    <button 
                      onClick={whatsappSelected} 
                      className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm flex items-center space-x-2 shadow-sm"
                      title="Share on WhatsApp"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.149-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                      </svg>
                      <span>WhatsApp</span>
                    </button>
                    
                    {/* More Options Menu */}
                    <div className="relative">
                      <button 
                        onClick={() => setShowMoreMenu(!showMoreMenu)}
                        className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm flex items-center space-x-2 shadow-sm"
                        title="More options"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      
                      {showMoreMenu && (
                        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                          <button
                            onClick={() => { emailSelected(); setShowMoreMenu(false); }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                          >
                            <Mail className="w-4 h-4" />
                            <span>Email</span>
                          </button>
                          <button
                            onClick={() => { smsSelected(); setShowMoreMenu(false); }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                          >
                            <MessageSquare className="w-4 h-4" />
                            <span>SMS</span>
                          </button>
                          <button
                            onClick={() => { copyToClipboard(); setShowMoreMenu(false); }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                          >
                            <Copy className="w-4 h-4" />
                            <span>Copy</span>
                          </button>
                          <button
                            onClick={() => { shareSelected(); setShowMoreMenu(false); }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                          >
                            <Share2 className="w-4 h-4" />
                            <span>Share</span>
                          </button>
                          <div className="border-t border-gray-200 my-1"></div>
                          <button
                            onClick={() => { duplicateSelected(); setShowMoreMenu(false); }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                          >
                            <Copy className="w-4 h-4" />
                            <span>Duplicate</span>
                          </button>
                          <button
                            onClick={() => { refreshHistory(); setShowMoreMenu(false); }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                          >
                            <RefreshCw className="w-4 h-4" />
                            <span>Refresh</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <button className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm flex items-center space-x-2">
                    <Download className="w-4 h-4" />
                    <span>Export</span>
                  </button>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-12">
                  <History className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600">No history found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredItems.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4 flex-1">
                          {/* Row checkbox */}
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelect(item.id)}
                            className="w-4 h-4 rounded border-gray-300"
                          />

                          {/* Date - Primary Information */}
                          <div className="min-w-[120px]">
                            <div className="text-sm font-medium text-gray-900">
                              {formatDate(item.date)}
                            </div>
                            <div className="text-xs text-gray-500">
                              {new Date(item.date).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          </div>

                          {/* Customer Name - Secondary Information */}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {item.customerName}
                            </div>
                            <div className="text-xs text-gray-500">
                              {item.number}
                            </div>
                          </div>

                          {/* Amount - Financial Information */}
                          {item.amount && (
                            <div className="text-right min-w-[100px]">
                              <div className="text-sm font-semibold text-gray-900">
                                {formatCurrency(item.amount)}
                              </div>
                              {item.type && (
                                <div className="text-xs text-gray-500 capitalize">
                                  {item.type}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Status - Visual Indicator */}
                          {item.status && (
                            <div className="min-w-[100px] text-center">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                (item.status === 'paid' || item.status === 'completed')
                                  ? 'bg-green-100 text-green-800'
                                  : (item.status === 'pending')
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : (item.status === 'cancelled' || item.status === 'canceled')
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                <span className={`w-2 h-2 rounded-full mr-1.5 ${
                                  (item.status === 'paid' || item.status === 'completed')
                                    ? 'bg-green-400'
                                    : (item.status === 'pending')
                                    ? 'bg-yellow-400'
                                    : (item.status === 'cancelled' || item.status === 'canceled')
                                    ? 'bg-red-400'
                                    : 'bg-gray-400'
                                }`}></span>
                                {item.status}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center space-x-1 ml-4">
                          <button
                            onClick={() => {
                              if (onViewItem) onViewItem(item);
                              setShowHistory(false);
                            }}
                            className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (onEditItem) onEditItem(item);
                              setShowHistory(false);
                            }}
                            className="p-2 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            className="p-2 text-green-500 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors"
                            title="Print PDF"
                            onClick={() => {
                              setSelectedIds(new Set([item.id]));
                              setTimeout(() => printPDF(), 0);
                            }}
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            className="p-2 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors"
                            title="Download"
                            onClick={() => {
                              setSelectedIds(new Set([item.id]));
                              setTimeout(() => exportSelected(), 0);
                            }}
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
});

ViewHistoryButton.displayName = 'ViewHistoryButton';

export default ViewHistoryButton;