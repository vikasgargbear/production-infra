import React, { useState, useEffect } from 'react';
import { 
  Warehouse, Search, Plus, Edit2, Trash2, 
  MapPin, Phone, Mail, Package, User,
  Download, Upload, Loader2, AlertCircle, Check,
  ChevronRight, BarChart3, Clock, Settings, X,
  QrCode, Wifi, Thermometer, Lock, Activity, RefreshCw
} from 'lucide-react';
import { settingsApi } from '../../services/api/modules/settings.api';
import { DataTable, StatusBadge, Toast } from '../global/ui';

const WarehouseMaster = ({ open, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState(null);
  const [selectedWarehouses, setSelectedWarehouses] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  
  // Load warehouses on component mount
  useEffect(() => {
    if (open) {
      loadWarehouses();
    }
  }, [open]);
  
  // Load warehouses from backend
  const loadWarehouses = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await settingsApi.warehouses.getAll();
      console.log('Warehouses API Response:', response);
      
      // Handle different response formats
      let warehouseData = [];
      if (response?.data) {
        warehouseData = Array.isArray(response.data) ? response.data : response.data.warehouses || [];
      } else if (Array.isArray(response)) {
        warehouseData = response;
      }
      
      setWarehouses(warehouseData || []);
    } catch (error) {
      console.error('Error loading warehouses:', error);
      setError('Failed to load warehouses. Please try again.');
      setWarehouses([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await loadWarehouses();
    } catch (error) {
      console.error('Refresh failed:', error);
      setError('Failed to refresh data');
    } finally {
      setRefreshing(false);
    }
  };

  const warehouseTypes = [
    { value: 'all', label: 'All Types' },
    { value: 'warehouse', label: 'Warehouse' },
    { value: 'coldStorage', label: 'Cold Storage' },
    { value: 'store', label: 'Store' },
    { value: 'primary', label: 'Primary' },
    { value: 'specialized', label: 'Specialized' }
  ];

  const filteredWarehouses = warehouses.filter(warehouse => {
    const matchesSearch = searchTerm === '' ||
                         warehouse.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         warehouse.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         warehouse.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         warehouse.manager?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || warehouse.type === filterType;
    return matchesSearch && matchesType;
  });

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    type: 'warehouse',
    address: '',
    city: '',
    state: '',
    pincode: '',
    phone: '',
    email: '',
    manager: '',
    capacity: '',
    description: '',
    temperature: 'Ambient',
    isActive: true,
    isDefault: false
  });

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    
    try {
      const warehouseData = {
        ...formData,
        capacity: parseInt(formData.capacity) || 0
      };
      
      if (editingWarehouse) {
        // Update existing warehouse
        const response = await settingsApi.warehouses.update(editingWarehouse.id, warehouseData);
        if (response.success || response.data) {
          setSuccessMessage('Warehouse updated successfully!');
          await loadWarehouses(); // Reload data
        }
      } else {
        // Add new warehouse
        const response = await settingsApi.warehouses.create(warehouseData);
        if (response.success || response.data) {
          setSuccessMessage('Warehouse added successfully!');
          await loadWarehouses(); // Reload data
        }
      }
      
      setTimeout(() => setSuccessMessage(''), 3000);
      handleCloseModal();
    } catch (error) {
      console.error('Error saving warehouse:', error);
      setError('Failed to save warehouse. Please try again.');
    }
  };

  const handleEdit = (warehouse) => {
    setEditingWarehouse(warehouse);
    setFormData({
      code: warehouse.code || '',
      name: warehouse.name || '',
      type: warehouse.type || 'warehouse',
      address: warehouse.address || '',
      city: warehouse.city || '',
      state: warehouse.state || '',
      pincode: warehouse.pincode || '',
      phone: warehouse.phone || '',
      email: warehouse.email || '',
      manager: warehouse.manager || '',
      capacity: warehouse.capacity || warehouse.occupancy || '',
      description: warehouse.description || '',
      temperature: warehouse.temperature || 'Ambient',
      isActive: warehouse.isActive !== false,
      isDefault: warehouse.isDefault || false
    });
    setShowAddModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this warehouse?')) {
      try {
        await settingsApi.warehouses.delete(id);
        setSuccessMessage('Warehouse deleted successfully!');
        await loadWarehouses();
        setTimeout(() => setSuccessMessage(''), 3000);
      } catch (error) {
        console.error('Error deleting warehouse:', error);
        setError('Failed to delete warehouse. Please try again.');
      }
    }
  };

  const handleToggleActive = async (id) => {
    try {
      const warehouse = warehouses.find(w => w.id === id);
      const updatedWarehouse = { ...warehouse, isActive: !warehouse.isActive };
      await settingsApi.warehouses.update(id, updatedWarehouse);
      setSuccessMessage(`Warehouse ${updatedWarehouse.isActive ? 'activated' : 'deactivated'} successfully!`);
      await loadWarehouses();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error updating warehouse status:', error);
      setError('Failed to update warehouse status. Please try again.');
    }
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingWarehouse(null);
    setFormData({
      code: '',
      name: '',
      type: 'warehouse',
      address: '',
      city: '',
      state: '',
      pincode: '',
      phone: '',
      email: '',
      manager: '',
      capacity: '',
      description: '',
      temperature: 'Ambient',
      isActive: true,
      isDefault: false
    });
  };

  const handleExport = () => {
    // TODO: Implement export functionality
    setError('Export functionality coming soon!');
    setTimeout(() => setError(null), 3000);
  };

  const handleImport = () => {
    // TODO: Implement import functionality
    setError('Import functionality coming soon!');
    setTimeout(() => setError(null), 3000);
  };

  const getWarehouseTypeColor = (type) => {
    const colors = {
      'warehouse': 'blue',
      'coldStorage': 'cyan',
      'store': 'green',
      'primary': 'purple',
      'specialized': 'orange'
    };
    return colors[type] || 'gray';
  };

  const getWarehouseTypeIcon = (type) => {
    const icons = {
      'warehouse': Warehouse,
      'coldStorage': Thermometer,
      'store': Package,
      'primary': Warehouse,
      'specialized': Settings
    };
    return icons[type] || Warehouse;
  };

  const getUtilizationPercent = (warehouse) => {
    const capacity = warehouse.capacity || warehouse.occupancy || 0;
    const current = warehouse.currentStock || warehouse.occupancy || 0;
    if (capacity === 0) return 0;
    return Math.round((current / capacity) * 100);
  };

  if (!open) return null;

  return (
    <div className="flex-1 flex flex-col bg-gray-50 h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Warehouse className="w-6 h-6 text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900">Warehouse Master</h1>
            <span className="text-sm text-gray-500">({warehouses.length} warehouses)</span>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-2 disabled:opacity-50"
            >
              {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
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
              <span>Add Warehouse</span>
            </button>
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
              placeholder="Search by name, code, city, or manager..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            {warehouseTypes.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center">
          <AlertCircle className="w-5 h-5 mr-2" />
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      
      {successMessage && (
        <div className="mx-6 mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center">
          <Check className="w-5 h-5 mr-2" />
          {successMessage}
          <button
            onClick={() => setSuccessMessage('')}
            className="ml-auto text-green-400 hover:text-green-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Warehouses Table */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">Loading warehouses...</span>
          </div>
        ) : filteredWarehouses.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Warehouse className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No warehouses found</p>
              {searchTerm && (
                <p className="text-sm text-gray-500 mt-2">Try adjusting your search criteria</p>
              )}
            </div>
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
                            setSelectedWarehouses(filteredWarehouses.map(w => w.id));
                          } else {
                            setSelectedWarehouses([]);
                          }
                        }}
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Warehouse Details</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Manager</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Capacity</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredWarehouses.map((warehouse) => {
                    const utilizationPercent = getUtilizationPercent(warehouse);
                    return (
                      <tr key={warehouse.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={selectedWarehouses.includes(warehouse.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedWarehouses([...selectedWarehouses, warehouse.id]);
                              } else {
                                setSelectedWarehouses(selectedWarehouses.filter(id => id !== warehouse.id));
                              }
                            }}
                            className="rounded border-gray-300"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{warehouse.name}</p>
                            <p className="text-xs text-gray-500">Code: {warehouse.code}</p>
                            {warehouse.description && (
                              <p className="text-xs text-gray-500">{warehouse.description}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs rounded-full bg-${getWarehouseTypeColor(warehouse.type)}-100 text-${getWarehouseTypeColor(warehouse.type)}-800`}>
                            {warehouse.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm">
                            <p className="text-gray-900">{warehouse.city}, {warehouse.state}</p>
                            {warehouse.address && (
                              <p className="text-xs text-gray-500">{warehouse.address}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm">
                            <p className="text-gray-900">{warehouse.manager}</p>
                            {warehouse.phone && (
                              <p className="text-xs text-gray-500">{warehouse.phone}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="text-sm">
                            <p className="font-medium">{warehouse.capacity || warehouse.occupancy || 0}</p>
                            <p className="text-xs text-gray-500">{utilizationPercent}% utilized</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => handleToggleActive(warehouse.id)}
                            className={`px-2 py-1 text-xs rounded-full ${
                              warehouse.isActive !== false
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {warehouse.isActive !== false ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={() => handleEdit(warehouse)}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(warehouse.id)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl m-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingWarehouse ? 'Edit Warehouse' : 'Add New Warehouse'}
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
                    Warehouse Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => handleInputChange('code', e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., WH-001"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Warehouse Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Main Warehouse"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => handleInputChange('type', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="warehouse">Warehouse</option>
                    <option value="coldStorage">Cold Storage</option>
                    <option value="store">Store</option>
                    <option value="primary">Primary</option>
                    <option value="specialized">Specialized</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
                  <input
                    type="number"
                    value={formData.capacity}
                    onChange={(e) => handleInputChange('capacity', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 5000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Temperature</label>
                  <input
                    type="text"
                    value={formData.temperature}
                    onChange={(e) => handleInputChange('temperature', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Ambient, 2-8°C"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Manager</label>
                  <input
                    type="text"
                    value={formData.manager}
                    onChange={(e) => handleInputChange('manager', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., John Doe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., +91 98765 43210"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., warehouse@company.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Mumbai"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <input
                    type="text"
                    value={formData.state}
                    onChange={(e) => handleInputChange('state', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Maharashtra"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pincode</label>
                  <input
                    type="text"
                    value={formData.pincode}
                    onChange={(e) => handleInputChange('pincode', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 400001"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <textarea
                    value={formData.address}
                    onChange={(e) => handleInputChange('address', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={2}
                    placeholder="Full address..."
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={2}
                    placeholder="Optional description..."
                  />
                </div>

                <div className="md:col-span-2 flex items-center space-x-6">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => handleInputChange('isActive', e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Active</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.isDefault}
                      onChange={(e) => handleInputChange('isDefault', e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Default Warehouse</span>
                  </label>
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
                  {editingWarehouse ? 'Update Warehouse' : 'Add Warehouse'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default WarehouseMaster;