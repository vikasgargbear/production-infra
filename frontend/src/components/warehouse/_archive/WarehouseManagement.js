import React, { useState, useEffect } from 'react';
import { 
  Warehouse, 
  MapPin, 
  Package, 
  Users,
  Plus,
  Edit,
  Trash2,
  X,
  Save,
  ArrowRight,
  Building2,
  Phone,
  Mail
} from 'lucide-react';
import { searchCache } from '../../utils/searchCache';

const WarehouseManagement = ({ open, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [showAddWarehouse, setShowAddWarehouse] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    type: 'main', // main, branch, temporary
    address: '',
    city: '',
    state: '',
    pincode: '',
    phone: '',
    email: '',
    manager: '',
    gstNumber: '',
    capacity: '',
    isActive: true
  });

  useEffect(() => {
    if (open) {
      loadWarehouses();
    }
  }, [open]);

  const loadWarehouses = async () => {
    setLoading(true);
    try {
      // For now, using mock data - replace with actual API call
      const mockWarehouses = [
        {
          id: 'WH001',
          name: 'Main Warehouse',
          code: 'MAIN',
          type: 'main',
          address: '123, Industrial Area',
          city: 'Bangalore',
          state: 'Karnataka',
          pincode: '560001',
          phone: '080-12345678',
          email: 'main@warehouse.com',
          manager: 'John Doe',
          gstNumber: '29ABCDE1234F1Z5',
          capacity: 10000,
          currentStock: 7500,
          isActive: true,
          stats: {
            totalProducts: 450,
            totalValue: 2500000,
            inTransit: 25,
            lowStock: 12
          }
        },
        {
          id: 'WH002',
          name: 'North Branch',
          code: 'NORTH',
          type: 'branch',
          address: '456, Commercial Complex',
          city: 'Delhi',
          state: 'Delhi',
          pincode: '110001',
          phone: '011-98765432',
          email: 'north@warehouse.com',
          manager: 'Jane Smith',
          gstNumber: '07ABCDE1234F1Z5',
          capacity: 5000,
          currentStock: 3200,
          isActive: true,
          stats: {
            totalProducts: 280,
            totalValue: 1200000,
            inTransit: 10,
            lowStock: 5
          }
        }
      ];
      
      setWarehouses(mockWarehouses);
      if (mockWarehouses.length > 0 && !selectedWarehouse) {
        setSelectedWarehouse(mockWarehouses[0]);
      }
    } catch (error) {
      console.error('Error loading warehouses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddWarehouse = () => {
    setFormData({
      name: '',
      code: '',
      type: 'branch',
      address: '',
      city: '',
      state: '',
      pincode: '',
      phone: '',
      email: '',
      manager: '',
      gstNumber: '',
      capacity: '',
      isActive: true
    });
    setEditingWarehouse(null);
    setShowAddWarehouse(true);
  };

  const handleEditWarehouse = (warehouse) => {
    setFormData({
      name: warehouse.name,
      code: warehouse.code,
      type: warehouse.type,
      address: warehouse.address,
      city: warehouse.city,
      state: warehouse.state,
      pincode: warehouse.pincode,
      phone: warehouse.phone,
      email: warehouse.email,
      manager: warehouse.manager,
      gstNumber: warehouse.gstNumber,
      capacity: warehouse.capacity.toString(),
      isActive: warehouse.isActive
    });
    setEditingWarehouse(warehouse);
    setShowAddWarehouse(true);
  };

  const handleSaveWarehouse = async () => {
    try {
      if (editingWarehouse) {
        // Update existing warehouse
        const updatedWarehouses = warehouses.map(wh => 
          wh.id === editingWarehouse.id 
            ? { ...wh, ...formData, capacity: parseInt(formData.capacity) }
            : wh
        );
        setWarehouses(updatedWarehouses);
      } else {
        // Add new warehouse
        const newWarehouse = {
          id: `WH${String(warehouses.length + 1).padStart(3, '0')}`,
          ...formData,
          capacity: parseInt(formData.capacity),
          currentStock: 0,
          stats: {
            totalProducts: 0,
            totalValue: 0,
            inTransit: 0,
            lowStock: 0
          }
        };
        setWarehouses([...warehouses, newWarehouse]);
      }
      
      setShowAddWarehouse(false);
      alert(editingWarehouse ? 'Warehouse updated successfully' : 'Warehouse added successfully');
    } catch (error) {
      console.error('Error saving warehouse:', error);
      alert('Failed to save warehouse');
    }
  };

  const handleDeleteWarehouse = (warehouseId) => {
    if (confirm('Are you sure you want to delete this warehouse?')) {
      setWarehouses(warehouses.filter(wh => wh.id !== warehouseId));
      if (selectedWarehouse?.id === warehouseId) {
        setSelectedWarehouse(null);
      }
    }
  };

  const getWarehouseTypeColor = (type) => {
    switch (type) {
      case 'main': return 'bg-blue-100 text-blue-800';
      case 'branch': return 'bg-green-100 text-green-800';
      case 'temporary': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCapacityPercentage = (warehouse) => {
    return (warehouse.currentStock / warehouse.capacity) * 100;
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl m-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Warehouse className="w-8 h-8 text-gray-700" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Warehouse Management</h1>
                <p className="text-gray-600 mt-1">Manage multiple warehouse locations and inventory</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Warehouse List */}
          <div className="w-1/3 border-r border-gray-200 overflow-y-auto">
            <div className="p-4">
              <button
                onClick={handleAddWarehouse}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Warehouse</span>
              </button>
            </div>
            
            <div className="px-4 pb-4 space-y-2">
              {warehouses.map((warehouse) => (
                <div
                  key={warehouse.id}
                  onClick={() => setSelectedWarehouse(warehouse)}
                  className={`p-4 rounded-lg border cursor-pointer transition-all ${
                    selectedWarehouse?.id === warehouse.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{warehouse.name}</h3>
                      <p className="text-sm text-gray-600 mt-1">{warehouse.city}, {warehouse.state}</p>
                      <div className="flex items-center space-x-2 mt-2">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${getWarehouseTypeColor(warehouse.type)}`}>
                          {warehouse.type}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          warehouse.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {warehouse.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Code</p>
                      <p className="font-mono text-sm font-medium">{warehouse.code}</p>
                    </div>
                  </div>
                  
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Capacity Usage</span>
                      <span>{warehouse.currentStock} / {warehouse.capacity}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${
                          getCapacityPercentage(warehouse) > 90 
                            ? 'bg-red-500' 
                            : getCapacityPercentage(warehouse) > 70 
                            ? 'bg-yellow-500' 
                            : 'bg-green-500'
                        }`}
                        style={{ width: `${getCapacityPercentage(warehouse)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Warehouse Details */}
          <div className="flex-1 overflow-y-auto">
            {selectedWarehouse ? (
              <div className="p-8">
                {/* Warehouse Header */}
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">{selectedWarehouse.name}</h2>
                    <p className="text-gray-600 mt-1">Warehouse Code: {selectedWarehouse.code}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleEditWarehouse(selectedWarehouse)}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-2"
                    >
                      <Edit className="w-4 h-4" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => handleDeleteWarehouse(selectedWarehouse.id)}
                      className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 flex items-center space-x-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-blue-600 font-medium">Total Products</p>
                        <p className="text-2xl font-bold text-blue-900 mt-1">
                          {selectedWarehouse.stats.totalProducts}
                        </p>
                      </div>
                      <Package className="w-8 h-8 text-blue-500" />
                    </div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-green-600 font-medium">Stock Value</p>
                        <p className="text-2xl font-bold text-green-900 mt-1">
                          ₹{selectedWarehouse.stats.totalValue.toLocaleString()}
                        </p>
                      </div>
                      <ArrowRight className="w-8 h-8 text-green-500" />
                    </div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-purple-600 font-medium">In Transit</p>
                        <p className="text-2xl font-bold text-purple-900 mt-1">
                          {selectedWarehouse.stats.inTransit}
                        </p>
                      </div>
                      <ArrowRight className="w-8 h-8 text-purple-500" />
                    </div>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-orange-600 font-medium">Low Stock</p>
                        <p className="text-2xl font-bold text-orange-900 mt-1">
                          {selectedWarehouse.stats.lowStock}
                        </p>
                      </div>
                      <Package className="w-8 h-8 text-orange-500" />
                    </div>
                  </div>
                </div>

                {/* Warehouse Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-gray-50 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <MapPin className="w-5 h-5 mr-2" />
                      Location Details
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm text-gray-600">Address</p>
                        <p className="font-medium">{selectedWarehouse.address}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-600">City</p>
                          <p className="font-medium">{selectedWarehouse.city}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">State</p>
                          <p className="font-medium">{selectedWarehouse.state}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Pincode</p>
                        <p className="font-medium">{selectedWarehouse.pincode}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">GST Number</p>
                        <p className="font-medium font-mono">{selectedWarehouse.gstNumber}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <Users className="w-5 h-5 mr-2" />
                      Contact Information
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm text-gray-600">Manager</p>
                        <p className="font-medium">{selectedWarehouse.manager}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Phone</p>
                        <p className="font-medium flex items-center">
                          <Phone className="w-4 h-4 mr-1 text-gray-500" />
                          {selectedWarehouse.phone}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Email</p>
                        <p className="font-medium flex items-center">
                          <Mail className="w-4 h-4 mr-1 text-gray-500" />
                          {selectedWarehouse.email}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Type</p>
                        <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${getWarehouseTypeColor(selectedWarehouse.type)}`}>
                          {selectedWarehouse.type.charAt(0).toUpperCase() + selectedWarehouse.type.slice(1)} Warehouse
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Capacity Chart */}
                <div className="mt-8 bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Storage Capacity</h3>
                  <div>
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>Used: {selectedWarehouse.currentStock} units</span>
                      <span>Total: {selectedWarehouse.capacity} units</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-8">
                      <div 
                        className={`h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                          getCapacityPercentage(selectedWarehouse) > 90 
                            ? 'bg-red-500' 
                            : getCapacityPercentage(selectedWarehouse) > 70 
                            ? 'bg-yellow-500' 
                            : 'bg-green-500'
                        }`}
                        style={{ width: `${getCapacityPercentage(selectedWarehouse)}%` }}
                      >
                        {getCapacityPercentage(selectedWarehouse).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Building2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900">Select a Warehouse</h3>
                  <p className="text-gray-600 mt-2">Choose a warehouse from the list to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Add/Edit Warehouse Modal */}
        {showAddWarehouse && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl m-4">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingWarehouse ? 'Edit Warehouse' : 'Add New Warehouse'}
                </h2>
              </div>
              
              <div className="p-6 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Warehouse Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Warehouse Code <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="main">Main Warehouse</option>
                      <option value="branch">Branch Warehouse</option>
                      <option value="temporary">Temporary Storage</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Capacity (units) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={formData.capacity}
                      onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      City <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      State <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Pincode <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.pincode}
                      onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      GST Number
                    </label>
                    <input
                      type="text"
                      value={formData.gstNumber}
                      onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Manager Name
                    </label>
                    <input
                      type="text"
                      value={formData.manager}
                      onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="isActive"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">
                      Active Warehouse
                    </label>
                  </div>
                </div>
              </div>
              
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
                <button
                  onClick={() => setShowAddWarehouse(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveWarehouse}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingWarehouse ? 'Update' : 'Save'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WarehouseManagement;