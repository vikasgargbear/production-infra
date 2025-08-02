import React, { useState, useEffect } from 'react';
import { 
  Package2, Search, Plus, Edit2, Trash2, 
  Calendar, AlertTriangle, Clock, CheckCircle,
  Download, Upload, Loader2, AlertCircle, Check,
  ArrowRight, TrendingUp, Activity, Filter, X
} from 'lucide-react';
import { settingsApi } from '../../services/api/modules/settings.api';
import { productsApi } from '../../services/api/modules/products.api';

const BatchMaster = ({ open, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingBatch, setEditingBatch] = useState(null);
  const [selectedBatches, setSelectedBatches] = useState([]);
  const [batches, setBatches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [products, setProducts] = useState([]);
  
  // Load batches on component mount
  useEffect(() => {
    if (open) {
      loadBatches();
      loadProducts();
    }
  }, [open]);
  
  // Load batches from backend API
  const loadBatches = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await settingsApi.batches.getAll();
      
      if (response?.data && Array.isArray(response.data)) {
        setBatches(response.data);
      } else {
        // Use mock data as fallback
        setBatches(mockBatches);
      }
    } catch (error) {
      console.error('Error loading batches:', error);
      setError('Failed to load batches. Using offline data.');
      // Use mock data on error
      setBatches(mockBatches);
    } finally {
      setIsLoading(false);
    }
  };

  // Load products for dropdown
  const loadProducts = async () => {
    try {
      const response = await productsApi.getAll();
      if (response?.data && Array.isArray(response.data)) {
        setProducts(response.data.map(product => ({
          id: product.id,
          name: product.product_name || product.generic_name,
          code: product.product_code
        })));
      }
    } catch (error) {
      console.error('Error loading products:', error);
      // Use mock products as fallback
      setProducts([
        { id: 1, name: 'Paracetamol 500mg', code: 'PCM-500' },
        { id: 2, name: 'Amoxicillin 250mg', code: 'AMX-250' },
        { id: 3, name: 'Ibuprofen 400mg', code: 'IBU-400' }
      ]);
    }
  };

  // Mock batches data as fallback
  const mockBatches = [
        {
          id: 1,
          batchNo: 'BT-2024-001',
          productId: 1,
          productName: 'Paracetamol 500mg',
          productCode: 'PCM-500',
          manufacturingDate: '2024-01-15',
          expiryDate: '2026-01-14',
          quantity: 5000,
          availableQty: 3200,
          mrp: 10.00,
          purchasePrice: 6.50,
          salePrice: 8.50,
          status: 'active',
          location: 'WH-001',
          supplier: 'ABC Pharmaceuticals',
          invoiceNo: 'INV-2024-0123',
          description: 'Batch received in good condition'
        },
        {
          id: 2,
          batchNo: 'BT-2024-002',
          productId: 2,
          productName: 'Amoxicillin 250mg',
          productCode: 'AMX-250',
          manufacturingDate: '2024-02-01',
          expiryDate: '2025-01-31',
          quantity: 3000,
          availableQty: 2100,
          mrp: 25.00,
          purchasePrice: 18.00,
          salePrice: 22.00,
          status: 'active',
          location: 'WH-002',
          supplier: 'XYZ Pharma Ltd',
          invoiceNo: 'INV-2024-0156',
          description: ''
        },
        {
          id: 3,
          batchNo: 'BT-2023-089',
          productId: 3,
          productName: 'Vitamin C 500mg',
          productCode: 'VTC-500',
          manufacturingDate: '2023-12-01',
          expiryDate: '2024-11-30',
          quantity: 2000,
          availableQty: 500,
          mrp: 15.00,
          purchasePrice: 10.00,
          salePrice: 13.00,
          status: 'expiring',
          location: 'ST-001',
          supplier: 'Health Supplements Inc',
          invoiceNo: 'INV-2023-0789',
          description: 'Nearing expiry - priority sales'
        },
        {
          id: 4,
          batchNo: 'BT-2024-003',
          productId: 4,
          productName: 'Insulin Glargine 100IU',
          productCode: 'INS-100',
          manufacturingDate: '2024-03-01',
          expiryDate: '2025-03-01',
          quantity: 1000,
          availableQty: 800,
          mrp: 450.00,
          purchasePrice: 350.00,
          salePrice: 420.00,
          status: 'active',
          location: 'WH-002',
          supplier: 'BioPharm Solutions',
          invoiceNo: 'INV-2024-0234',
          description: 'Cold chain maintained'
        },
        {
          id: 5,
          batchNo: 'BT-2023-056',
          productId: 5,
          productName: 'Cough Syrup 100ml',
          productCode: 'CS-100',
          manufacturingDate: '2023-06-15',
          expiryDate: '2024-06-14',
          quantity: 500,
          availableQty: 0,
          mrp: 85.00,
          purchasePrice: 60.00,
          salePrice: 75.00,
          status: 'expired',
          location: 'QT-001',
          supplier: 'Herbal Medicines Ltd',
          invoiceNo: 'INV-2023-0456',
          description: 'Expired - awaiting disposal'
        },
        {
          id: 6,
          batchNo: 'BT-2024-004',
          productId: 1,
          productName: 'Paracetamol 500mg',
          productCode: 'PCM-500',
          manufacturingDate: '2024-03-10',
          expiryDate: '2026-03-09',
          quantity: 10000,
          availableQty: 10000,
          mrp: 10.00,
          purchasePrice: 6.00,
          salePrice: 8.50,
          status: 'active',
          location: 'WH-001',
          supplier: 'ABC Pharmaceuticals',
          invoiceNo: 'INV-2024-0345',
          description: 'New stock arrival'
        }
      ];

  // Remove duplicate loadProducts function - already defined above
  const loadProductsOld = () => {
    // Mock product list for dropdown
    const mockProducts = [
      { id: 1, name: 'Paracetamol 500mg', code: 'PCM-500' },
      { id: 2, name: 'Amoxicillin 250mg', code: 'AMX-250' },
      { id: 3, name: 'Vitamin C 500mg', code: 'VTC-500' },
      { id: 4, name: 'Insulin Glargine 100IU', code: 'INS-100' },
      { id: 5, name: 'Cough Syrup 100ml', code: 'CS-100' }
    ];
    setProducts(mockProducts);
  };

  const batchStatuses = [
    { value: 'all', label: 'All Batches' },
    { value: 'active', label: 'Active' },
    { value: 'expiring', label: 'Expiring Soon' },
    { value: 'expired', label: 'Expired' },
    { value: 'finished', label: 'Finished' }
  ];

  const filteredBatches = batches.filter(batch => {
    const matchesSearch = searchTerm === '' ||
                         batch.batchNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         batch.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         batch.productCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         batch.supplier.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || batch.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const [formData, setFormData] = useState({
    batchNo: '',
    productId: '',
    manufacturingDate: '',
    expiryDate: '',
    quantity: '',
    mrp: '',
    purchasePrice: '',
    salePrice: '',
    location: '',
    supplier: '',
    invoiceNo: '',
    description: ''
  });

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Auto-calculate expiry date based on product shelf life
    if (field === 'manufacturingDate' && value) {
      // Assume 2 years shelf life for demo
      const mfgDate = new Date(value);
      const expDate = new Date(mfgDate);
      expDate.setFullYear(expDate.getFullYear() + 2);
      setFormData(prev => ({
        ...prev,
        expiryDate: expDate.toISOString().split('T')[0]
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const selectedProduct = products.find(p => p.id === parseInt(formData.productId));
    
    try {
      if (editingBatch) {
        // Update existing batch
        const batchData = {
          ...formData,
          productName: selectedProduct?.name || formData.productName,
          productCode: selectedProduct?.code || formData.productCode,
          availableQty: parseInt(formData.quantity),
          quantity: parseInt(formData.quantity),
          mrp: parseFloat(formData.mrp),
          purchasePrice: parseFloat(formData.purchasePrice),
          salePrice: parseFloat(formData.salePrice),
          status: getStatus(formData.expiryDate)
        };
        
        const response = await settingsApi.batches.update(editingBatch.id, batchData);
        if (response?.success) {
          setBatches(prev => prev.map(b => 
            b.id === editingBatch.id ? { ...b, ...batchData } : b
          ));
          setSuccessMessage('Batch updated successfully!');
        }
      } else {
        // Add new batch
        const newBatch = {
          ...formData,
          productName: selectedProduct?.name || '',
          productCode: selectedProduct?.code || '',
          availableQty: parseInt(formData.quantity),
          quantity: parseInt(formData.quantity),
          mrp: parseFloat(formData.mrp),
          purchasePrice: parseFloat(formData.purchasePrice),
          salePrice: parseFloat(formData.salePrice),
          status: getStatus(formData.expiryDate)
        };
        
        const response = await settingsApi.batches.create(newBatch);
        if (response?.success && response.data) {
          setBatches(prev => [...prev, response.data]);
          setSuccessMessage('Batch added successfully!');
        }
      }
      
      setTimeout(() => setSuccessMessage(''), 3000);
      handleCloseModal();
    } catch (error) {
      console.error('Error saving batch:', error);
      setError('Failed to save batch. Please try again.');
      // Fallback to local state update
      if (editingBatch) {
        const batchData = {
          ...formData,
          productName: selectedProduct?.name || formData.productName,
          productCode: selectedProduct?.code || formData.productCode,
          availableQty: parseInt(formData.quantity),
          quantity: parseInt(formData.quantity),
          mrp: parseFloat(formData.mrp),
          purchasePrice: parseFloat(formData.purchasePrice),
          salePrice: parseFloat(formData.salePrice),
          status: getStatus(formData.expiryDate)
        };
        setBatches(prev => prev.map(b => 
          b.id === editingBatch.id ? { ...b, ...batchData } : b
        ));
      } else {
        const newBatch = {
          ...formData,
          id: Date.now(),
          productName: selectedProduct?.name || '',
          productCode: selectedProduct?.code || '',
          availableQty: parseInt(formData.quantity),
          quantity: parseInt(formData.quantity),
          mrp: parseFloat(formData.mrp),
          purchasePrice: parseFloat(formData.purchasePrice),
          salePrice: parseFloat(formData.salePrice),
          status: getStatus(formData.expiryDate)
        };
        setBatches(prev => [...prev, newBatch]);
      }
      setSuccessMessage('Batch saved locally!');
      setTimeout(() => setSuccessMessage(''), 3000);
      handleCloseModal();
    }
  };

  const getStatus = (expiryDate) => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const daysUntilExpiry = Math.floor((expiry - today) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry < 0) return 'expired';
    if (daysUntilExpiry <= 90) return 'expiring';
    return 'active';
  };

  const handleEdit = (batch) => {
    setEditingBatch(batch);
    setFormData({
      batchNo: batch.batchNo,
      productId: batch.productId,
      manufacturingDate: batch.manufacturingDate,
      expiryDate: batch.expiryDate,
      quantity: batch.quantity,
      mrp: batch.mrp,
      purchasePrice: batch.purchasePrice,
      salePrice: batch.salePrice,
      location: batch.location,
      supplier: batch.supplier,
      invoiceNo: batch.invoiceNo,
      description: batch.description || ''
    });
    setShowAddModal(true);
  };

  const handleDelete = async (id) => {
    const batch = batches.find(b => b.id === id);
    
    if (batch.availableQty > 0) {
      alert(`Cannot delete batch ${batch.batchNo}. It still has ${batch.availableQty} units in stock.`);
      return;
    }
    
    if (window.confirm('Are you sure you want to delete this batch?')) {
      try {
        await settingsApi.batches.delete(id);
        setBatches(prev => prev.filter(b => b.id !== id));
        setSuccessMessage('Batch deleted successfully!');
      } catch (error) {
        console.error('Error deleting batch:', error);
        // Fallback to local state update
        setBatches(prev => prev.filter(b => b.id !== id));
        setSuccessMessage('Batch deleted locally!');
      }
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingBatch(null);
    setFormData({
      batchNo: '',
      productId: '',
      manufacturingDate: '',
      expiryDate: '',
      quantity: '',
      mrp: '',
      purchasePrice: '',
      salePrice: '',
      location: '',
      supplier: '',
      invoiceNo: '',
      description: ''
    });
  };

  const handleExport = () => {
    // TODO: Implement export functionality
    alert('Export functionality coming soon!');
  };

  const handleImport = () => {
    // TODO: Implement import functionality
    alert('Import functionality coming soon!');
  };

  const getStatusColor = (status) => {
    const colors = {
      active: 'green',
      expiring: 'amber',
      expired: 'red',
      finished: 'gray'
    };
    return colors[status] || 'gray';
  };

  const getStatusIcon = (status) => {
    const icons = {
      active: CheckCircle,
      expiring: AlertTriangle,
      expired: AlertCircle,
      finished: Package2
    };
    return icons[status] || Package2;
  };

  const getDaysUntilExpiry = (expiryDate) => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const days = Math.floor((expiry - today) / (1000 * 60 * 60 * 24));
    return days;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  // Summary statistics
  const totalBatches = batches.length;
  const activeBatches = batches.filter(b => b.status === 'active').length;
  const expiringBatches = batches.filter(b => b.status === 'expiring').length;
  const expiredBatches = batches.filter(b => b.status === 'expired').length;
  const totalStockValue = batches.reduce((sum, b) => sum + (b.availableQty * b.purchasePrice), 0);

  return (
    <div className="flex-1 flex flex-col bg-gray-50 h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Package2 className="w-6 h-6 text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900">Batch Master</h1>
            <span className="text-sm text-gray-500">({totalBatches} batches)</span>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleImport}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-2"
            >
              <Upload className="w-4 h-4" />
              <span>Import</span>
            </button>
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Batch</span>
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Total Batches</p>
                <p className="text-lg font-semibold text-gray-900">{totalBatches}</p>
              </div>
              <Package2 className="w-8 h-8 text-gray-400" />
            </div>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Active</p>
                <p className="text-lg font-semibold text-green-900">{activeBatches}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
          </div>
          <div className="bg-amber-50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Expiring Soon</p>
                <p className="text-lg font-semibold text-amber-900">{expiringBatches}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-amber-400" />
            </div>
          </div>
          <div className="bg-red-50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Expired</p>
                <p className="text-lg font-semibold text-red-900">{expiredBatches}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
          </div>
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Stock Value</p>
                <p className="text-lg font-semibold text-blue-900">₹{(totalStockValue / 100000).toFixed(1)}L</p>
              </div>
              <TrendingUp className="w-8 h-8 text-blue-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by batch no, product, or supplier..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            {batchStatuses.map(status => (
              <option key={status.value} value={status.value}>{status.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center">
          <AlertCircle className="w-5 h-5 mr-2" />
          {error}
        </div>
      )}
      
      {successMessage && (
        <div className="mx-6 mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center">
          <Check className="w-5 h-5 mr-2" />
          {successMessage}
        </div>
      )}

      {/* Batches Table */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">Loading batches...</span>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 h-full flex flex-col">
            <div className="flex-1 overflow-auto">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300"
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedBatches(filteredBatches.map(b => b.id));
                          } else {
                            setSelectedBatches([]);
                          }
                        }}
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Batch Details</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dates</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pricing</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredBatches.map((batch) => {
                    const StatusIcon = getStatusIcon(batch.status);
                    const daysUntilExpiry = getDaysUntilExpiry(batch.expiryDate);
                    
                    return (
                      <tr key={batch.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={selectedBatches.includes(batch.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedBatches([...selectedBatches, batch.id]);
                              } else {
                                setSelectedBatches(selectedBatches.filter(id => id !== batch.id));
                              }
                            }}
                            className="rounded border-gray-300"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {batch.batchNo}
                            </p>
                            <p className="text-xs text-gray-500">
                              {batch.location} • {batch.supplier}
                            </p>
                            {batch.invoiceNo && (
                              <p className="text-xs text-gray-400">
                                Invoice: {batch.invoiceNo}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm">
                            <p className="font-medium text-gray-900">{batch.productName}</p>
                            <p className="text-xs text-gray-500">{batch.productCode}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm">
                            <p className="text-gray-900">
                              <span className="text-xs text-gray-500">MFG:</span> {formatDate(batch.manufacturingDate)}
                            </p>
                            <p className={`font-medium ${
                              daysUntilExpiry < 0 ? 'text-red-600' : 
                              daysUntilExpiry <= 90 ? 'text-amber-600' : 'text-gray-900'
                            }`}>
                              <span className="text-xs text-gray-500">EXP:</span> {formatDate(batch.expiryDate)}
                            </p>
                            {daysUntilExpiry >= 0 && (
                              <p className="text-xs text-gray-500">
                                {daysUntilExpiry} days remaining
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm">
                            <p className="font-medium text-gray-900">
                              {batch.availableQty} / {batch.quantity}
                            </p>
                            <div className="w-24 bg-gray-200 rounded-full h-2 mt-1">
                              <div
                                className="bg-blue-500 h-2 rounded-full"
                                style={{ width: `${(batch.availableQty / batch.quantity) * 100}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm">
                            <p className="text-gray-900">
                              MRP: ₹{batch.mrp.toFixed(2)}
                            </p>
                            <p className="text-xs text-gray-500">
                              PP: ₹{batch.purchasePrice.toFixed(2)} • SP: ₹{batch.salePrice.toFixed(2)}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center">
                            <StatusIcon className={`w-5 h-5 text-${getStatusColor(batch.status)}-500 mr-2`} />
                            <span className={`px-2 py-1 text-xs rounded-full bg-${getStatusColor(batch.status)}-100 text-${getStatusColor(batch.status)}-800 capitalize`}>
                              {batch.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={() => handleEdit(batch)}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(batch.id)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              disabled={batch.availableQty > 0}
                              title={batch.availableQty > 0 ? 'Cannot delete batch with stock' : ''}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl m-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingBatch ? 'Edit Batch' : 'Add New Batch'}
                </h2>
                <button
                  onClick={handleCloseModal}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Batch Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.batchNo}
                    onChange={(e) => handleInputChange('batchNo', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., BT-2024-001"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Product <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.productId}
                    onChange={(e) => handleInputChange('productId', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Product</option>
                    {products.map(product => (
                      <option key={product.id} value={product.id}>
                        {product.name} ({product.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Manufacturing Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.manufacturingDate}
                    onChange={(e) => handleInputChange('manufacturingDate', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expiry Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.expiryDate}
                    onChange={(e) => handleInputChange('expiryDate', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Quantity <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    value={formData.quantity}
                    onChange={(e) => handleInputChange('quantity', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    min="1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Location/Warehouse
                  </label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => handleInputChange('location', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., WH-001"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    MRP <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    value={formData.mrp}
                    onChange={(e) => handleInputChange('mrp', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    min="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Purchase Price <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    value={formData.purchasePrice}
                    onChange={(e) => handleInputChange('purchasePrice', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    min="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sale Price <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    value={formData.salePrice}
                    onChange={(e) => handleInputChange('salePrice', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    min="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Supplier
                  </label>
                  <input
                    type="text"
                    value={formData.supplier}
                    onChange={(e) => handleInputChange('supplier', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Invoice Number
                  </label>
                  <input
                    type="text"
                    value={formData.invoiceNo}
                    onChange={(e) => handleInputChange('invoiceNo', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description/Notes
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={2}
                    placeholder="Optional notes about this batch..."
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingBatch ? 'Update Batch' : 'Add Batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchMaster;