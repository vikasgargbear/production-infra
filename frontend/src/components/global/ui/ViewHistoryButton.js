import React, { useState } from 'react';
import { History, Eye, Edit, Download, Printer, X } from 'lucide-react';
import { ordersApi, purchasesApi, paymentsApi, challansApi, invoicesApi, salesOrdersAPI } from '../../../services/api';

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

  const getHistoryTitle = () => {
    switch (historyType) {
      case 'invoice': return 'Invoice History';
      case 'challan': return 'Delivery Challan History';
      case 'payment': return 'Payment History';
      case 'purchase': return 'Purchase History';
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
          // Try multiple endpoints to find invoices
          try {
            // Skip trying invoice endpoints since they don't exist yet
            // Just use orders API directly
            try {
              response = await ordersApi.getAll({ limit: 10 });
              console.log('Loaded orders as invoices:', response);
            } catch (e1) {
              console.error('Orders API failed:', e1);
              throw e1;
            }
          } catch (e2) {
            console.log('All invoice endpoints failed, using orders as fallback');
            // Fallback to orders without order_type filter to avoid validation errors
            // Use limit=10 which we know works
            response = await ordersApi.getAll({ limit: 10 });
          }
          
          // Handle both array response and object with data property
          // Check if response.data exists (axios wraps responses in data property)
          const actualResponse = response.data || response;
          
          const invoiceData = Array.isArray(actualResponse) ? actualResponse : 
                             (actualResponse.data && Array.isArray(actualResponse.data)) ? actualResponse.data :
                             (actualResponse.invoices && Array.isArray(actualResponse.invoices)) ? actualResponse.invoices :
                             (actualResponse.orders && Array.isArray(actualResponse.orders)) ? actualResponse.orders : [];
          
          console.log('Processing invoice data:', invoiceData);
          console.log('Full response:', response);
          console.log('Actual response:', actualResponse);
          
          formattedItems = invoiceData.map(invoice => ({
            id: invoice.invoice_id || invoice.id || invoice.order_id,
            number: invoice.invoice_number || invoice.invoice_no || `INV-${invoice.invoice_id || invoice.order_id || invoice.id}`,
            date: invoice.invoice_date || invoice.created_at || invoice.order_date,
            customerName: invoice.customer_name || 'N/A',
            amount: invoice.final_amount || invoice.net_amount || invoice.total_amount || 0,
            status: invoice.payment_status || invoice.status || 'pending',
            rawData: invoice
          }));
          break;

        case 'challan':
          response = await challansApi.getAll({ limit: 10 });
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
          response = await paymentsApi.getAll({ limit: 10 });
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
          response = await purchasesApi.getAll({ limit: 10 });
          const purchaseResponse = response.data || response;
          if (purchaseResponse.data && Array.isArray(purchaseResponse.data)) {
            formattedItems = purchaseResponse.data.map(purchase => ({
              id: purchase.purchase_id,
              number: purchase.invoice_number || `BILL-${purchase.purchase_id}`,
              date: purchase.invoice_date || purchase.created_at,
              customerName: purchase.supplier_name || 'N/A',
              amount: purchase.final_amount || purchase.total_amount || 0,
              status: purchase.payment_status || 'pending',
              rawData: purchase
            }));
          }
          break;

        case 'order':
        case 'sales-order':
          try {
            // salesOrdersAPI uses getAll not list
            response = await salesOrdersAPI.getAll({ limit: 10 });
            console.log('Loaded sales orders:', response);
          } catch (error) {
            console.error('Sales orders API failed:', error);
            // Fallback to orders endpoint with limit=10 which works
            try {
              response = await ordersApi.getAll({ 
                limit: 10
              });
            } catch (orderError) {
              console.error('Orders API also failed:', orderError);
              response = { data: [] };
            }
          }
          
          // Handle response structure - axios wraps in data property
          const orderResponse = response.data || response;
          const orderData = Array.isArray(orderResponse) ? orderResponse : 
                           (orderResponse.data && Array.isArray(orderResponse.data)) ? orderResponse.data :
                           (orderResponse.orders && Array.isArray(orderResponse.orders)) ? orderResponse.orders : [];
          
          console.log('Processing order data:', orderData);
          
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
    } catch (error) {
      console.error(`Error loading ${historyType} history:`, error);
      setHistoryItems([]);
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

  return (
    <>
      {/* History Button */}
      <button
        onClick={handleOpenHistory}
        className={className || `flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors`}
        title={`View ${getHistoryTitle()}`}
        style={className ? { background: '', border: '' } : {}}
      >
        <History className="w-4 h-4" style={{ color: className?.includes('text-white') ? 'white' : '#4B5563' }} />
        {buttonText && <span className={`text-sm font-medium ${className?.includes('text-white') ? 'text-white' : 'text-gray-700'}`}>{buttonText}</span>}
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

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : historyItems.length === 0 ? (
                <div className="text-center py-12">
                  <History className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600">No history found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {historyItems.map((item) => (
                    <div
                      key={item.id}
                      className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <h3 className="font-semibold text-gray-900">{item.number}</h3>
                            <span className="text-sm text-gray-500">{formatDate(item.date)}</span>
                            {item.status && (
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                item.status === 'paid' 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {item.status}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-sm text-gray-600">
                            <span>{item.customerName}</span>
                            {item.amount && (
                              <span className="ml-3 font-medium">{formatCurrency(item.amount)}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => {
                              if (onViewItem) onViewItem(item);
                              setShowHistory(false);
                            }}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="View"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (onEditItem) onEditItem(item);
                              setShowHistory(false);
                            }}
                            className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                            title="Print"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            title="Download"
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