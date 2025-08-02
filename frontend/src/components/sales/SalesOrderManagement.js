import React, { useState, useEffect } from 'react';
import { 
  FileText, Package, Truck, Search, Filter, 
  MoreVertical, Eye, Edit, CheckCircle, XCircle 
} from 'lucide-react';
import { salesOrdersAPI } from '../../services/api';
import ConvertToInvoiceButton from './components/ConvertToInvoiceButton';

const SalesOrderManagement = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    loadOrders();
  }, [filterStatus]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus !== 'all') {
        params.order_status = filterStatus;
      }
      
      const response = await salesOrdersAPI.list(params);
      setOrders(response.data || []);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInvoiceCreated = (orderId, invoiceData) => {
    // Update the order to show it has been invoiced
    setOrders(prev => prev.map(order => 
      order.order_id === orderId 
        ? { ...order, invoice_number: invoiceData.invoice_number, invoice_created: true }
        : order
    ));
  };

  const getStatusBadge = (order) => {
    const badges = [];
    
    // Order status
    badges.push(
      <span key="status" className={`px-2 py-1 text-xs rounded ${
        order.order_status === 'approved' ? 'bg-green-100 text-green-800' :
        order.order_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
        'bg-gray-100 text-gray-800'
      }`}>
        {order.order_status}
      </span>
    );
    
    // Invoice status
    if (order.invoice_number || order.invoice_created) {
      badges.push(
        <span key="invoice" className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">
          <FileText className="w-3 h-3 inline mr-1" />
          Invoiced
        </span>
      );
    }
    
    // Challan status
    if (order.challan_created) {
      badges.push(
        <span key="challan" className="px-2 py-1 text-xs rounded bg-purple-100 text-purple-800">
          <Truck className="w-3 h-3 inline mr-1" />
          Challan Created
        </span>
      );
    }
    
    return badges;
  };

  const filteredOrders = orders.filter(order => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        order.order_number?.toLowerCase().includes(query) ||
        order.customer_name?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  if (loading) {
    return <div className="p-8 text-center">Loading sales orders...</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Sales Order Management</h2>
        <p className="text-gray-600">Convert sales orders to invoices or delivery challans</p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search orders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 w-full border rounded-lg"
            />
          </div>
        </div>
        
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2 border rounded-lg"
        >
          <option value="all">All Orders</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredOrders.map((order) => (
              <tr key={order.order_id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {order.order_number || `ORD-${order.order_id}`}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(order.order_date).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{order.customer_name}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  ₹{order.final_amount || order.total_amount || 0}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex gap-2">
                    {getStatusBadge(order)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex gap-2">
                    {/* View Button */}
                    <button
                      onClick={() => console.log('View order:', order.order_id)}
                      className="text-gray-600 hover:text-gray-900"
                      title="View Order"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    
                    {/* Convert to Invoice Button */}
                    {!order.invoice_created && order.order_status === 'approved' && (
                      <ConvertToInvoiceButton
                        orderId={order.order_id}
                        orderNumber={order.order_number}
                        onSuccess={(invoiceData) => handleInvoiceCreated(order.order_id, invoiceData)}
                        className="text-sm py-1 px-3"
                      />
                    )}
                    
                    {/* Convert to Challan Button */}
                    {!order.challan_created && (
                      <button
                        onClick={() => console.log('Convert to challan:', order.order_id)}
                        className="flex items-center gap-1 text-sm px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
                      >
                        <Truck className="w-3 h-3" />
                        Challan
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {filteredOrders.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No sales orders found
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesOrderManagement;