import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Search, Edit, Trash2, User, Loader2, Users, Phone, Mail, MapPin } from 'lucide-react';
import api from '../services/api';
import { customersApi } from '../services/api';

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    customer_name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    gst_number: '',
    customer_type: '',
    credit_limit: '',
    payment_terms: ''
  });

  // Fetch customers from API
  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await customersApi.getAll();
      setCustomers(response.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching customers:', err);
      setError('Failed to fetch customers. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Simplified filtering to reduce lag
  const filteredCustomers = (() => {
    if (!searchTerm.trim()) return customers;
    const searchLower = searchTerm.toLowerCase();
    return customers.filter(customer =>
      customer.customer_name?.toLowerCase().includes(searchLower) ||
      customer.contact_person?.toLowerCase().includes(searchLower) ||
      customer.phone?.includes(searchTerm) ||
      customer.email?.toLowerCase().includes(searchLower)
    );
  })();

  // Simplified pagination to reduce lag
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedCustomers = filteredCustomers.slice(startIndex, startIndex + itemsPerPage);

  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);

  // Using uncontrolled components with refs instead of controlled components
  // This approach is used by production applications like AWS, Zomato, and Google Forms
  const formRef = useRef(null);

  // Search handler (not using useCallback to fix continuous typing issue)
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset to first page when searching
  };

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    
    if (submitting) return; // Prevent double submission

    setSubmitting(true);
    setError("");
    
    try {
      // Get form data directly from the form element
      const form = e.target;
      const formData = new FormData(form);
      const customerData = {};
      
      // Convert FormData to a regular object
      for (let [key, value] of formData.entries()) {
        // Skip empty values
        if (value === '') continue;
        
        // Convert numeric fields to numbers
        if (['credit_limit'].includes(key) && value !== '') {
          customerData[key] = parseFloat(value);
        } else {
          customerData[key] = value;
        }
      }
      
      // Ensure required fields are present
      if (!customerData.customer_name) {
        throw new Error('Customer name is required');
      }
      if (!customerData.phone) {
        throw new Error('Phone number is required');
      }
      if (!customerData.address) {
        throw new Error('Address is required');
      }
      
      // Generate a simple customer code if not provided
      if (!customerData.customer_code) {
        customerData.customer_code = `CUST${Date.now()}`;
      }
      
      console.log('Saving customer with data:', customerData);

      if (editingCustomer) {
        // Use API service instead of direct axios calls
        await api.put(`/customers/${editingCustomer.customer_id}`, customerData);
        setEditingCustomer(null);
      } else {
        // Use API service instead of direct axios calls
        await api.post('/customers/', customerData);
      }
      
      // Refresh the customers list
      await fetchCustomers();
      
      // Reset form and close modal
      form.reset();
      setShowAddModal(false);
    } catch (err) {
      console.error('Error saving customer:', err);
      setError('Failed to save customer. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [editingCustomer, fetchCustomers, submitting]);

  const handleEdit = useCallback((customer) => {
    setEditingCustomer(customer);
    setShowAddModal(true);
  }, []);

  const handleDelete = useCallback(async (customerId) => {
    // Show a confirmation dialog with more details
    if (window.confirm('Are you sure you want to delete this customer? This action cannot be undone.')) {
      try {
        setLoading(true);
        // Use the centralized API service instead of customersApi
        await api.delete(`/customers/${customerId}`);
        console.log('Customer deleted successfully');
        await fetchCustomers(); // Refresh the customers list
      } catch (err) {
        console.error('Error deleting customer:', err);
        setError('Failed to delete customer. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  }, [fetchCustomers]);

  const handleModalClose = useCallback(() => {
    setShowAddModal(false);
    setEditingCustomer(null);
  }, []);

  // Customer Modal Component - using uncontrolled inputs like AWS, Zomato, and Google Forms
  // Customer Modal Component - using uncontrolled inputs for better typing performance
  const CustomerModal = () => {
    // Use a ref for the form to access it directly
    const formRef = useRef(null);
    
    // When editing a customer, populate the form fields after the component mounts
    useEffect(() => {
      if (editingCustomer && formRef.current) {
        const form = formRef.current;
        
        // Set initial values for all fields when editing
        if (editingCustomer.customer_name) form.customer_name.value = editingCustomer.customer_name;
        if (editingCustomer.contact_person) form.contact_person.value = editingCustomer.contact_person;
        if (editingCustomer.phone) form.phone.value = editingCustomer.phone;
        if (editingCustomer.email) form.email.value = editingCustomer.email;
        if (editingCustomer.address) form.address.value = editingCustomer.address;
        if (editingCustomer.city) form.city.value = editingCustomer.city;
        if (editingCustomer.state) form.state.value = editingCustomer.state;
        if (editingCustomer.gst_number) form.gst_number.value = editingCustomer.gst_number;
        if (editingCustomer.customer_type) form.customer_type.value = editingCustomer.customer_type;
        if (editingCustomer.credit_limit) form.credit_limit.value = editingCustomer.credit_limit;
        if (editingCustomer.payment_terms) form.payment_terms.value = editingCustomer.payment_terms;
      }
    }, [editingCustomer]);
    
    return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto transform transition-all">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-lg">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">
              {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
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
              <label htmlFor="customer_name" className="block text-sm font-medium text-gray-700 mb-2">
                Customer Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="customer_name"
                name="customer_name"
                required
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                placeholder="Enter customer name"
              />
            </div>
            
            <div>
              <label htmlFor="contact_person" className="block text-sm font-medium text-gray-700 mb-2">
                Contact Person
              </label>
              <input
                type="text"
                id="contact_person"
                name="contact_person"
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
              />
            </div>
            
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                Phone <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                id="phone"
                name="phone"
                required
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                placeholder="Enter phone number"
              />
            </div>
            
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
              />
            </div>
            
            <div>
              <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-2">
                Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="address"
                name="address"
                required
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                placeholder="Enter customer address"
              />
            </div>
            
            <div>
              <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-2">
                City
              </label>
              <input
                type="text"
                id="city"
                name="city"
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
              />
            </div>
            
            <div>
              <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-2">
                State
              </label>
              <input
                type="text"
                id="state"
                name="state"
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
              />
            </div>
            
            <div>
              <label htmlFor="gst_number" className="block text-sm font-medium text-gray-700 mb-2">
                GST Number
              </label>
              <input
                type="text"
                id="gst_number"
                name="gst_number"
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
              />
            </div>
            
            <div>
              <label htmlFor="customer_type" className="block text-sm font-medium text-gray-700 mb-2">
                Customer Type
              </label>
              <select
                id="customer_type"
                name="customer_type"
                defaultValue="retail"
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
              >
                <option value="retail">Retail</option>
                <option value="wholesale">Wholesale</option>
                <option value="hospital">Hospital</option>
                <option value="clinic">Clinic</option>
                <option value="distributor">Distributor</option>
                <option value="other">Other</option>
              </select>
            </div>
            
            <div>
              <label htmlFor="credit_limit" className="block text-sm font-medium text-gray-700 mb-2">
                Credit Limit
              </label>
              <input
                type="number"
                id="credit_limit"
                name="credit_limit"
                step="0.01"
                defaultValue="0"
                min="0"
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                placeholder="Enter credit limit"
              />
            </div>
            
            <div>
              <label htmlFor="payment_terms" className="block text-sm font-medium text-gray-700 mb-2">
                Payment Terms (Days)
              </label>
              <input
                type="number"
                id="payment_terms"
                name="payment_terms"
                defaultValue="30"
                min="0"
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                placeholder="Enter payment terms in days"
              />
            </div>
          </div>
          
          <div className="flex justify-end space-x-4 mt-8">
            <button
              type="button"
              onClick={handleModalClose}
              className="px-5 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-3 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{submitting ? 'Saving...' : (editingCustomer ? 'Update Customer' : 'Add Customer')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">
                Customers
              </h1>
              <p className="text-gray-500 text-xs">Manage your customer relationships</p>
            </div>
            
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-md hover:bg-red-700 transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Customer
            </button>
          </div>
        </div>
      </div>
      
      <div className="px-4 py-3">
        {/* Search and Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          {/* Search Box */}
          <div className="md:col-span-2 bg-white rounded-lg p-3 border border-gray-100 shadow-sm">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search customers..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg w-full focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-transparent text-sm transition-all"
              />
            </div>
          </div>
          
          {/* Stats Cards */}
          <div className="bg-white rounded-lg p-3 border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center mr-2">
                  <Users className="w-4 h-4 text-blue-600" />
                </div>
                <span className="text-xs font-medium text-gray-500">Total Customers</span>
              </div>
            </div>
            <div className="text-xl font-bold text-gray-900">
              {customers.length}
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-3 border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center mr-2">
                  <MapPin className="w-4 h-4 text-purple-600" />
                </div>
                <span className="text-xs font-medium text-gray-500">Cities</span>
              </div>
            </div>
            <div className="text-xl font-bold text-gray-900">
              {new Set(customers.map(c => c.city).filter(Boolean)).size}
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-3 p-3 bg-red-50 border border-red-100 rounded-lg shadow-sm">
            <p className="text-red-800 text-xs">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-red-600" />
            <span className="ml-2 text-gray-600 text-xs">Loading customers...</span>
          </div>
        ) : (
          <>
            {/* Customers Table */}
            <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-3 mb-4">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 px-2 font-medium text-gray-500">Customer Name</th>
                      <th className="text-left py-2 px-2 font-medium text-gray-500">Contact Person</th>
                      <th className="text-left py-2 px-2 font-medium text-gray-500">Phone</th>
                      <th className="text-left py-2 px-2 font-medium text-gray-500">Email</th>
                      <th className="text-left py-2 px-2 font-medium text-gray-500">City</th>
                      <th className="text-left py-2 px-2 font-medium text-gray-500">Type</th>
                      <th className="text-right py-2 px-2 font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paginatedCustomers.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="text-center py-6 text-gray-500">
                          <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                          <p className="font-medium text-xs mb-1">No customers found</p>
                          <p className="text-xs">Add your first customer to get started</p>
                        </td>
                      </tr>
                    ) : (
                      paginatedCustomers.map((customer) => (
                        <tr key={customer.customer_id} className="hover:bg-gray-50 transition-colors">
                          <td className="py-2 px-2">
                            <div className="font-medium text-gray-900 text-xs">
                              {customer.customer_name}
                            </div>
                            {customer.gst_number && (
                              <div className="text-[10px] text-gray-500">GST: {customer.gst_number}</div>
                            )}
                          </td>
                          <td className="py-2 px-2 text-gray-700 text-xs">
                            {customer.contact_person || 'N/A'}
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex items-center text-gray-700 text-xs">
                              <Phone className="w-3 h-3 mr-1 text-gray-400" />
                              {customer.phone || 'N/A'}
                            </div>
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex items-center text-gray-700 text-xs">
                              <Mail className="w-3 h-3 mr-1 text-gray-400" />
                              {customer.email || 'N/A'}
                            </div>
                          </td>
                          <td className="py-2 px-2 text-gray-700 text-xs">
                            {customer.city ? (
                              <div className="flex items-center">
                                <MapPin className="w-3 h-3 mr-1 text-gray-400" />
                                {customer.city}{customer.state ? `, ${customer.state}` : ''}
                              </div>
                            ) : 'N/A'}
                          </td>
                          <td className="py-2 px-2">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">
                              {customer.customer_type || 'N/A'}
                            </span>
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                onClick={() => handleEdit(customer)}
                                className="p-1 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                title="Edit customer"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(customer.customer_id)}
                                className="p-1 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                title="Delete customer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <div className="text-xs text-gray-500">
                    Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredCustomers.length)} of {filteredCustomers.length} customers
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="px-2 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Previous
                    </button>
                    
                    <div className="flex items-center space-x-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                            currentPage === page
                              ? 'bg-red-600 text-white'
                              : 'text-gray-700 bg-white border border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                    </div>
                    
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="px-2 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Customer Modal */}
      {showAddModal && <CustomerModal />}
    </div>
  );
};

export default Customers;
