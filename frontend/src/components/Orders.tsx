import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Search, Edit, Trash2, ShoppingCart, Loader2, FileText, Download } from 'lucide-react';
import api from '../services/api';
import invoiceService from '../services/invoiceService';
import { downloadInvoicePDF } from '../utils/invoicePdfGenerator';

// Type definitions
interface Order {
  order_id: number;
  customer_id: number;
  order_date?: string;
  delivery_date?: string;
  status?: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  payment_status?: 'pending' | 'partial' | 'completed' | 'refunded';
  payment_mode?: 'cash' | 'card' | 'upi' | 'netbanking' | 'cheque';
  total_amount?: number;
  discount?: number;
  final_amount?: number;
  notes?: string;
  org_id?: string;
  items?: OrderItem[];
}

interface OrderItem {
  product_id: number;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  discount_amount: number;
  tax_percent: number;
  tax_amount: number;
  line_total: number;
}

interface Customer {
  customer_id: number;
  customer_name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
}

interface Product {
  product_id: number;
  product_name: string;
  sale_price?: number;
}

interface OrderFormData {
  customer_id: string;
  order_date: string;
  delivery_date?: string;
  status?: string;
  payment_status?: string;
  payment_mode?: string;
  total_amount?: string;
  discount?: string;
  final_amount?: string;
  notes?: string;
  org_id?: string;
}

interface OrderFormElements extends HTMLFormControlsCollection {
  customer_id: HTMLSelectElement;
  order_date: HTMLInputElement;
  delivery_date: HTMLInputElement;
  status: HTMLSelectElement;
  payment_status: HTMLSelectElement;
  payment_mode: HTMLSelectElement;
  total_amount: HTMLInputElement;
  discount: HTMLInputElement;
  final_amount: HTMLInputElement;
  notes: HTMLTextAreaElement;
}

interface OrderFormElement extends HTMLFormElement {
  readonly elements: OrderFormElements;
}

interface InvoiceDetails {
  invoice_number: string;
  invoice_date: string;
  amount: number;
  [key: string]: any;
}

interface GeneratingInvoiceState {
  [orderId: number]: boolean;
}

interface OrderInvoicesState {
  [orderId: number]: InvoiceDetails;
}

// Organization ID - This should be managed in a global context or environment variable
const ORG_ID = 'ad808530-1ddb-4377-ab20-67bef145d80d';

// Define the Orders component with uncontrolled inputs for better typing performance
const Orders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage] = useState<number>(10);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [generatingInvoice, setGeneratingInvoice] = useState<GeneratingInvoiceState>({});
  const [orderInvoices, setOrderInvoices] = useState<OrderInvoicesState>({});

  // Fetch orders, customers, and products from API
  const fetchData = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const [ordersResponse, customersResponse, productsResponse] = await Promise.all([
        api.orders.getAll(),
        api.customers.getAll(),
        api.products.getAll()
      ]);
      
      setOrders(ordersResponse.data || []);
      setCustomers(customersResponse.data || []);
      setProducts(productsResponse.data || []);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load orders. Please refresh the page.');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter orders based on search term
  const filteredOrders = orders.filter(order => {
    const searchLower = searchTerm.toLowerCase();
    const customer = customers.find(c => c.customer_id === order.customer_id);
    const customerName = customer ? customer.customer_name : '';
    
    return (
      order.order_id.toString().toLowerCase().includes(searchLower) ||
      customerName.toLowerCase().includes(searchLower) ||
      (order.order_date && order.order_date.toLowerCase().includes(searchLower))
    );
  });

  // Pagination
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedOrders = filteredOrders.slice(startIndex, startIndex + itemsPerPage);
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);

  // Search handler
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset to first page when searching
  };

  const handleSubmit = useCallback(async (e: React.FormEvent<OrderFormElement>): Promise<void> => {
    e.preventDefault();
    
    if (submitting) return; // Prevent double submission

    setSubmitting(true);
    setError('');
    
    try {
      // Get form data directly from the form element
      const form = e.currentTarget;
      const formData = new FormData(form);
      const orderData: Partial<OrderFormData & { items?: OrderItem[] }> = {};
      
      // Convert FormData to a regular object
      for (let [key, value] of formData.entries()) {
        (orderData as any)[key] = value;
      }
      
      // Add organization ID
      orderData.org_id = ORG_ID;
      
      // Ensure required fields are present
      if (!orderData.customer_id) {
        throw new Error('Customer is required');
      }
      
      if (!orderData.order_date) {
        throw new Error('Order date is required');
      }

      // Add default items if creating new order (temporary fix)
      if (!editingOrder && !orderData.items) {
        orderData.items = [{
          product_id: 15,  // API Test Product
          quantity: 1,
          unit_price: 100.00,
          discount_percent: 0,
          discount_amount: 0,
          tax_percent: 12,
          tax_amount: 12.00,
          line_total: 112.00
        }];
      }

      if (editingOrder) {
        // Use API service instead of direct axios calls
        await api.orders.update(editingOrder.order_id, orderData);
      } else {
        // Use API service instead of direct axios calls
        await api.orders.create(orderData);
      }

      // Reset form and close modal
      form.reset();
      setShowAddModal(false);
      setEditingOrder(null);
      
      // Refresh the orders list
      await fetchData();
    } catch (err: any) {
      console.error('Error saving order:', err);
      setError('Failed to save order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [editingOrder, fetchData, submitting]);

  const handleEdit = useCallback((order: Order): void => {
    setEditingOrder(order);
    setShowAddModal(true);
  }, []);

  const handleDelete = useCallback(async (orderId: number): Promise<void> => {
    // Show a confirmation dialog with more details
    if (window.confirm('Are you sure you want to delete this order? This action cannot be undone.')) {
      try {
        setLoading(true);
        // Use the centralized API service instead of ordersApi
        await api.orders.delete(orderId);
        console.log('Order deleted successfully');
        await fetchData(); // Refresh the orders list
      } catch (err) {
        console.error('Error deleting order:', err);
        setError('Failed to delete order. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  }, [fetchData]);

  const handleModalClose = useCallback((): void => {
    setShowAddModal(false);
    setEditingOrder(null);
  }, []);

  // Handle invoice generation
  const handleGenerateInvoice = useCallback(async (order: Order): Promise<void> => {
    const orderId = order.order_id;
    
    // Check if order is eligible
    if (!invoiceService.isOrderEligibleForInvoice(order)) {
      setError('Order must be confirmed before generating invoice');
      return;
    }
    
    setGeneratingInvoice(prev => ({ ...prev, [orderId]: true }));
    setError(null);
    
    try {
      // Generate invoice and get details
      const invoiceDetails = await invoiceService.generateInvoiceForOrder(orderId);
      
      // Store invoice info
      setOrderInvoices(prev => ({
        ...prev,
        [orderId]: invoiceDetails
      }));
      
      // Generate and download PDF
      try {
        downloadInvoicePDF(invoiceDetails);
        console.log('Invoice PDF generated successfully:', invoiceDetails.invoice_number);
      } catch (pdfError) {
        console.error('PDF generation failed:', pdfError);
        // Fallback to JSON download if PDF fails
        const dataStr = JSON.stringify(invoiceDetails, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const exportFileDefaultName = `${invoiceDetails.invoice_number}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
      }
      
    } catch (err: any) {
      console.error('Failed to generate invoice:', err);
      setError(err.response?.data?.detail || 'Failed to generate invoice');
    } finally {
      setGeneratingInvoice(prev => ({ ...prev, [orderId]: false }));
    }
  }, []);

  // Order Modal Component - using uncontrolled inputs for better typing performance
  const OrderModal: React.FC = () => {
    // Use a ref for the form to access it directly
    const formRef = useRef<HTMLFormElement>(null);
    
    // When editing an order, populate the form fields after the component mounts
    useEffect(() => {
      if (editingOrder && formRef.current) {
        const form = formRef.current;
        const elements = form.elements as OrderFormElements;
        
        // Set initial values for all fields when editing
        if (editingOrder.customer_id) elements.customer_id.value = editingOrder.customer_id.toString();
        if (editingOrder.order_date) elements.order_date.value = editingOrder.order_date;
        if (editingOrder.delivery_date) elements.delivery_date.value = editingOrder.delivery_date;
        if (editingOrder.status) elements.status.value = editingOrder.status;
        if (editingOrder.payment_status) elements.payment_status.value = editingOrder.payment_status;
        if (editingOrder.payment_mode) elements.payment_mode.value = editingOrder.payment_mode;
        if (editingOrder.total_amount !== undefined) elements.total_amount.value = editingOrder.total_amount.toString();
        if (editingOrder.discount !== undefined) elements.discount.value = editingOrder.discount.toString();
        if (editingOrder.final_amount !== undefined) elements.final_amount.value = editingOrder.final_amount.toString();
        if (editingOrder.notes) elements.notes.value = editingOrder.notes;
      }
    }, [editingOrder]);
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
        <div className="bg-white rounded-lg shadow-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto transform transition-all">
          <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {editingOrder ? "Edit Order" : "Add New Order"}
              </h2>
              <button
                onClick={handleModalClose}
                className="text-gray-400 hover:text-gray-600 transition-colors p-2 rounded hover:bg-gray-100"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          
          <form ref={formRef} onSubmit={handleSubmit} className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="customer_id" className="block text-sm font-medium text-gray-700 mb-2">
                  Customer *
                </label>
                <select
                  id="customer_id"
                  name="customer_id"
                  required
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                >
                  <option value="">Select a customer</option>
                  {customers.map(customer => (
                    <option key={customer.customer_id} value={customer.customer_id}>
                      {customer.customer_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="order_date" className="block text-sm font-medium text-gray-700 mb-2">
                  Order Date *
                </label>
                <input
                  type="date"
                  id="order_date"
                  name="order_date"
                  required
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label htmlFor="delivery_date" className="block text-sm font-medium text-gray-700 mb-2">
                  Delivery Date
                </label>
                <input
                  type="date"
                  id="delivery_date"
                  name="delivery_date"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <select
                  id="status"
                  name="status"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                >
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="shipped">Shipped</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label htmlFor="payment_status" className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Status
                </label>
                <select
                  id="payment_status"
                  name="payment_status"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                >
                  <option value="pending">Pending</option>
                  <option value="partial">Partial</option>
                  <option value="completed">Completed</option>
                  <option value="refunded">Refunded</option>
                </select>
              </div>

              <div>
                <label htmlFor="payment_mode" className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Mode
                </label>
                <select
                  id="payment_mode"
                  name="payment_mode"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                >
                  <option value="">Select payment mode</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="upi">UPI</option>
                  <option value="netbanking">Net Banking</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>

              <div>
                <label htmlFor="total_amount" className="block text-sm font-medium text-gray-700 mb-2">
                  Total Amount
                </label>
                <input
                  type="number"
                  id="total_amount"
                  name="total_amount"
                  step="0.01"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label htmlFor="discount" className="block text-sm font-medium text-gray-700 mb-2">
                  Discount
                </label>
                <input
                  type="number"
                  id="discount"
                  name="discount"
                  step="0.01"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label htmlFor="final_amount" className="block text-sm font-medium text-gray-700 mb-2">
                  Final Amount
                </label>
                <input
                  type="number"
                  id="final_amount"
                  name="final_amount"
                  step="0.01"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                ></textarea>
              </div>
            </div>
            
            <div className="mt-8 flex justify-end">
              <button
                type="button"
                onClick={handleModalClose}
                className="mr-4 px-6 py-3 text-base font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-3 text-base font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-all flex items-center"
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" />
                    Saving...
                  </>
                ) : (
                  <>Save Order</>
                )}
              </button>
            </div>
            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          </form>
        </div>
      </div>
    );
  };
  
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white shadow-sm">
        <div className="px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            <Plus className="h-5 w-5 mr-2" />
            Add Order
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="px-6 py-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:w-64 mb-4 md:mb-0">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search orders..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      <div className="px-6 py-4">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 text-red-600 animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        ) : (
          <>
            {/* Orders Table */}
            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Order ID
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Customer
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedOrders.length > 0 ? (
                    paginatedOrders.map((order) => {
                      const customer = customers.find(c => c.customer_id === order.customer_id);
                      return (
                        <tr key={order.order_id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="flex-shrink-0 h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center">
                                <ShoppingCart className="h-5 w-5 text-gray-500" />
                              </div>
                              <div className="ml-4">
                                <div className="text-sm font-medium text-gray-900">#{order.order_id}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{customer ? customer.customer_name : 'Unknown'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{order.order_date || 'N/A'}</div>
                            {order.delivery_date && (
                              <div className="text-xs text-gray-500">Delivery: {order.delivery_date}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                              ${order.status === 'delivered' ? 'bg-green-100 text-green-800' : ''}
                              ${order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : ''}
                              ${order.status === 'processing' ? 'bg-blue-100 text-blue-800' : ''}
                              ${order.status === 'cancelled' ? 'bg-red-100 text-red-800' : ''}
                              ${order.status === 'shipped' ? 'bg-indigo-100 text-indigo-800' : ''}
                            `}>
                              {order.status || 'N/A'}
                            </span>
                            <div className="text-xs text-gray-500 mt-1">
                              Payment: {order.payment_status || 'N/A'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">₹{order.final_amount?.toFixed(2) || '0.00'}</div>
                            {order.payment_mode && (
                              <div className="text-xs text-gray-500">{order.payment_mode}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <button
                              onClick={() => handleEdit(order)}
                              className="text-indigo-600 hover:text-indigo-900 mr-3"
                              title="Edit Order"
                            >
                              <Edit className="h-5 w-5" />
                            </button>
                            {invoiceService.isOrderEligibleForInvoice(order) && (
                              <button
                                onClick={() => handleGenerateInvoice(order)}
                                disabled={generatingInvoice[order.order_id]}
                                className="text-green-600 hover:text-green-900 mr-3 disabled:opacity-50"
                                title={orderInvoices[order.order_id] ? 'Download Invoice' : 'Generate Invoice'}
                              >
                                {generatingInvoice[order.order_id] ? (
                                  <Loader2 className="h-5 w-5 animate-spin" />
                                ) : orderInvoices[order.order_id] ? (
                                  <Download className="h-5 w-5" />
                                ) : (
                                  <FileText className="h-5 w-5" />
                                )}
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(order.order_id)}
                              className="text-red-600 hover:text-red-900"
                              title="Delete Order"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                        No orders found. {searchTerm && "Try a different search term."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <div>
                  <p className="text-sm text-gray-700">
                    Showing <span className="font-medium">{startIndex + 1}</span> to{" "}
                    <span className="font-medium">
                      {Math.min(startIndex + itemsPerPage, filteredOrders.length)}
                    </span>{" "}
                    of <span className="font-medium">{filteredOrders.length}</span> orders
                  </p>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Order Modal */}
      {showAddModal && <OrderModal />}
    </div>
  );
};

export default Orders;