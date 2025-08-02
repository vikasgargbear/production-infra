import React, { useState, useEffect } from 'react';
import { Plus, Search, AlertTriangle, Package2, Calendar, Archive, TrendingDown, TrendingUp } from 'lucide-react';

const BatchesInventory = () => {
  const [batches, setBatches] = useState([]);
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);

  const [formData, setFormData] = useState({
    product_id: '',
    batch_number: '',
    mfg_date: '',
    expiry_date: '',
    purchase_price: '',
    selling_price: '',
    quantity_available: '',
    location: ''
  });

  // Sample data
  useEffect(() => {
    setProducts([
      { product_id: '1', product_name: 'Paracetamol 500mg', sale_price: 23.00 },
      { product_id: '2', product_name: 'Cough Syrup', sale_price: 78.00 },
      { product_id: '3', product_name: 'Vitamin D3 Injection', sale_price: 135.00 }
    ]);

    setBatches([
      {
        batch_id: 'BAT-001',
        product_id: '1',
        product_name: 'Paracetamol 500mg',
        batch_number: 'PCM001',
        mfg_date: '2023-12-01',
        expiry_date: '2025-12-01',
        purchase_price: 20.00,
        selling_price: 23.00,
        quantity_available: 500,
        location: 'A-01-001',
        created_at: '2024-01-01',
        status: 'good'
      },
      {
        batch_id: 'BAT-002',
        product_id: '2',
        product_name: 'Cough Syrup',
        batch_number: 'CS002',
        mfg_date: '2023-11-15',
        expiry_date: '2025-11-15',
        purchase_price: 70.00,
        selling_price: 78.00,
        quantity_available: 200,
        location: 'B-02-003',
        created_at: '2024-01-05',
        status: 'good'
      },
      {
        batch_id: 'BAT-003',
        product_id: '3',
        product_name: 'Vitamin D3 Injection',
        batch_number: 'VD003',
        mfg_date: '2023-10-01',
        expiry_date: '2024-06-30',
        purchase_price: 120.00,
        selling_price: 135.00,
        quantity_available: 50,
        location: 'C-03-002',
        created_at: '2024-01-10',
        status: 'expiring_soon'
      }
    ]);
  }, []);

  // Input change handler (not using useCallback to fix continuous typing issue)
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Search handler (not using useCallback to fix continuous typing issue)
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  // Filter batches based on search term and status filter
  const filteredBatches = batches.filter(batch => {
    // Filter by search term
    const matchesSearch = 
      batch.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      batch.batch_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      batch.location.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Filter by status
    const matchesStatus = 
      statusFilter === 'all' ||
      (statusFilter === 'expiring_soon' && batch.status === 'expiring_soon') ||
      (statusFilter === 'expired' && batch.status === 'expired') ||
      (statusFilter === 'good' && batch.status === 'good');
    
    return matchesSearch && matchesStatus;
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Convert string values to numbers for numeric fields
    const batchData = {
      ...formData,
      purchase_price: parseFloat(formData.purchase_price),
      selling_price: parseFloat(formData.selling_price),
      quantity_available: parseInt(formData.quantity_available, 10)
    };
    
    // Add new batch (in a real app, this would be an API call)
    const newBatch = {
      batch_id: `BAT-${batches.length + 1}`.padStart(7, '0'),
      ...batchData,
      product_name: products.find(p => p.product_id === batchData.product_id)?.product_name,
      created_at: new Date().toISOString().split('T')[0],
      status: new Date(batchData.expiry_date) < new Date() ? 'expired' :
        new Date(batchData.expiry_date) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) ? 'expiring_soon' : 'good'
    };
    
    setBatches([...batches, newBatch]);
    setShowAddModal(false);
    setFormData({
      product_id: '',
      batch_number: '',
      mfg_date: '',
      expiry_date: '',
      purchase_price: '',
      selling_price: '',
      quantity_available: '',
      location: ''
    });
  };

  const handleModalClose = () => {
    setShowAddModal(false);
    setFormData({
      product_id: '',
      batch_number: '',
      mfg_date: '',
      expiry_date: '',
      purchase_price: '',
      selling_price: '',
      quantity_available: '',
      location: ''
    });
  };

  // Calculate stats
  const totalBatches = batches.length;
  const totalQuantity = batches.reduce((sum, batch) => sum + batch.quantity_available, 0);
  const expiringBatches = batches.filter(batch => batch.status === 'expiring_soon').length;
  const expiredBatches = batches.filter(batch => batch.status === 'expired').length;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">
                Batches Inventory
              </h1>
              <p className="text-gray-500 text-xs">Manage your product batches and inventory</p>
            </div>
            
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-md hover:bg-red-700 transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Batch
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
                placeholder="Search batches..."
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
                  <Package2 className="w-4 h-4 text-blue-600" />
                </div>
                <span className="text-xs font-medium text-gray-500">Total Batches</span>
              </div>
            </div>
            <div className="text-xl font-bold text-gray-900">
              {totalBatches}
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-3 border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center mr-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-600" />
                </div>
                <span className="text-xs font-medium text-gray-500">Expiring Soon</span>
              </div>
            </div>
            <div className="text-xl font-bold text-gray-900">
              {expiringBatches}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              statusFilter === 'all'
                ? 'bg-red-600 text-white'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            All Batches
          </button>
          <button
            onClick={() => setStatusFilter('good')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              statusFilter === 'good'
                ? 'bg-green-600 text-white'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            Good
          </button>
          <button
            onClick={() => setStatusFilter('expiring_soon')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              statusFilter === 'expiring_soon'
                ? 'bg-yellow-600 text-white'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            Expiring Soon
          </button>
          <button
            onClick={() => setStatusFilter('expired')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              statusFilter === 'expired'
                ? 'bg-red-600 text-white'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            Expired
          </button>
        </div>

        {/* Batches Table */}
        <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-3 mb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-2 font-medium text-gray-500">Batch #</th>
                  <th className="text-left py-2 px-2 font-medium text-gray-500">Product</th>
                  <th className="text-left py-2 px-2 font-medium text-gray-500">Mfg Date</th>
                  <th className="text-left py-2 px-2 font-medium text-gray-500">Expiry Date</th>
                  <th className="text-left py-2 px-2 font-medium text-gray-500">Quantity</th>
                  <th className="text-left py-2 px-2 font-medium text-gray-500">Location</th>
                  <th className="text-left py-2 px-2 font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredBatches.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center py-6 text-gray-500">
                      <Package2 className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      <p className="font-medium text-xs mb-1">No batches found</p>
                      <p className="text-xs">Add your first batch to get started</p>
                    </td>
                  </tr>
                ) : (
                  filteredBatches.map((batch) => (
                    <tr key={batch.batch_id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-2 px-2 font-medium text-gray-900 text-xs">
                        {batch.batch_number}
                      </td>
                      <td className="py-2 px-2 text-gray-700 text-xs">
                        {batch.product_name}
                      </td>
                      <td className="py-2 px-2 text-gray-700 text-xs">
                        <div className="flex items-center">
                          <Calendar className="w-3 h-3 mr-1 text-gray-400" />
                          {batch.mfg_date}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-gray-700 text-xs">
                        <div className="flex items-center">
                          <Calendar className="w-3 h-3 mr-1 text-gray-400" />
                          {batch.expiry_date}
                        </div>
                      </td>
                      <td className="py-2 px-2 font-medium text-gray-900 text-xs">
                        {batch.quantity_available}
                      </td>
                      <td className="py-2 px-2 text-gray-700 text-xs">
                        <div className="flex items-center">
                          <Archive className="w-3 h-3 mr-1 text-gray-400" />
                          {batch.location}
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                          batch.status === 'good'
                            ? 'bg-green-100 text-green-700'
                            : batch.status === 'expiring_soon'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {batch.status === 'good' ? 'Good' : batch.status === 'expiring_soon' ? 'Expiring Soon' : 'Expired'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Batch Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto transform transition-all">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 rounded-t-lg">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">
                  Add New Batch
                </h2>
                <button
                  onClick={handleModalClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 rounded hover:bg-gray-100"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <form onSubmit={handleSubmit} className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="product_id" className="block text-xs font-medium text-gray-600 mb-1">
                    Product *
                  </label>
                  <select
                    id="product_id"
                    name="product_id"
                    value={formData.product_id}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-transparent transition-all"
                  >
                    <option value="">Select Product</option>
                    {products.map(product => (
                      <option key={product.product_id} value={product.product_id}>
                        {product.product_name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label htmlFor="batch_number" className="block text-xs font-medium text-gray-600 mb-1">
                    Batch Number *
                  </label>
                  <input
                    type="text"
                    id="batch_number"
                    name="batch_number"
                    value={formData.batch_number}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-transparent transition-all"
                  />
                </div>
                
                <div>
                  <label htmlFor="mfg_date" className="block text-xs font-medium text-gray-600 mb-1">
                    Manufacturing Date *
                  </label>
                  <input
                    type="date"
                    id="mfg_date"
                    name="mfg_date"
                    value={formData.mfg_date}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-transparent transition-all"
                  />
                </div>
                
                <div>
                  <label htmlFor="expiry_date" className="block text-xs font-medium text-gray-600 mb-1">
                    Expiry Date *
                  </label>
                  <input
                    type="date"
                    id="expiry_date"
                    name="expiry_date"
                    value={formData.expiry_date}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-transparent transition-all"
                  />
                </div>
                
                <div>
                  <label htmlFor="purchase_price" className="block text-xs font-medium text-gray-600 mb-1">
                    Purchase Price *
                  </label>
                  <input
                    type="number"
                    id="purchase_price"
                    name="purchase_price"
                    value={formData.purchase_price}
                    onChange={handleInputChange}
                    step="0.01"
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-transparent transition-all"
                  />
                </div>
                
                <div>
                  <label htmlFor="selling_price" className="block text-xs font-medium text-gray-600 mb-1">
                    Selling Price *
                  </label>
                  <input
                    type="number"
                    id="selling_price"
                    name="selling_price"
                    value={formData.selling_price}
                    onChange={handleInputChange}
                    step="0.01"
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-transparent transition-all"
                  />
                </div>
                
                <div>
                  <label htmlFor="quantity_available" className="block text-xs font-medium text-gray-600 mb-1">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    id="quantity_available"
                    name="quantity_available"
                    value={formData.quantity_available}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-transparent transition-all"
                  />
                </div>
                
                <div>
                  <label htmlFor="location" className="block text-xs font-medium text-gray-600 mb-1">
                    Storage Location *
                  </label>
                  <input
                    type="text"
                    id="location"
                    name="location"
                    value={formData.location}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium text-white bg-red-600 border border-transparent rounded hover:bg-red-700 transition-colors"
                >
                  Add Batch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchesInventory;
