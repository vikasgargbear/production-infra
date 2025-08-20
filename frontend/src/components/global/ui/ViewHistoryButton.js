import React, { useState } from 'react';
import { History, Eye, Edit, Download, Printer, X, Search, Filter, Calendar, ChevronDown, CheckSquare } from 'lucide-react';
import { ordersAPI, purchasesAPI, paymentAPI, challansAPI, invoiceAPI, salesOrdersAPI, purchasesApi, returnsApi, stockApi } from '../../../services/api';

const ViewHistoryButton = ({ 
  historyType = 'invoice', // 'invoice', 'challan', 'payment', 'purchase', 'order', 'sales-order'
  onViewItem,
  onEditItem,
  className = '',
  buttonText = ''
}) => {
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());

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
          response = await challansAPI.search({ limit: 10 });
          const challanResponse = response.data || response;
          if (challanResponse.data && Array.isArray(challanResponse.data)) {
            formattedItems = challanResponse.data.map(challan => ({
              id: challan.challan_id,
              number: challan.challan_number || `DC-${challan.challan_id}`,
              date: challan.challan_date || challan.created_at,
              customerName: challan.customer_name || 'N/A',
              amount: challan.total_amount || 0,
              status: challan.status || 'pending',
              rawData: challan
            }));
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

  const handleOpenHistory = () => {
    setShowHistory(true);
    loadHistory();
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
      {/* History Button */}
      <button
        onClick={handleOpenHistory}
        className={className || `flex items-center space-x-2 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 hover:border-blue-300 transition-colors shadow-sm`}
        title={`View ${getHistoryTitle()}`}
        style={className ? { background: '', border: '' } : {}}
      >
        <History className="w-4 h-4 text-blue-600" />
        {buttonText && <span className="text-sm font-medium text-blue-700">{buttonText}</span>}
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
                    <button onClick={exportSelected} className="px-3 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 text-sm flex items-center space-x-2">
                      <Download className="w-4 h-4" />
                      <span>Export</span>
                    </button>
                    <button onClick={printSelected} className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                      Print
                    </button>
                    <button onClick={whatsappSelected} className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
                      WhatsApp
                    </button>
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
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (onEditItem) onEditItem(item);
                              setShowHistory(false);
                            }}
                            className="p-2 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Print"
                            onClick={() => {
                              setSelectedIds(new Set([item.id]));
                              setTimeout(() => printSelected(), 0);
                            }}
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
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
};

export default ViewHistoryButton;