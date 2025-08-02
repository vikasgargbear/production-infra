import React, { useState, useEffect } from 'react';
import { 
  Warehouse, Search, Plus, Edit2, Trash2, 
  MapPin, Phone, Mail, Package, User,
  Download, Upload, Loader2, AlertCircle, Check,
  ChevronRight, BarChart3, Clock, Settings, X,
  QrCode, Wifi, Thermometer, Lock, Activity
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
      
      // If no data from API, use mock data as fallback
      if (!warehouseData || warehouseData.length === 0) {
        warehouseData = [
        {
          id: 1,
          code: 'WH-001',
          name: 'Main Warehouse',
          type: 'primary',
          address: '123 Industrial Area, Sector 15',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          phone: '+91 98765 43210',
          email: 'main.warehouse@pharmaerp.com',
          manager: 'Rajesh Kumar',
          capacity: 5000,
          currentStock: 3750,
          utilizationPercent: 75,
          status: 'active',
          features: {
            temperatureControlled: true,
            securitySystem: true,
            inventoryTracking: true,
            barcodeScanning: true,
            rfidEnabled: false
          },
          operatingHours: {
            weekdays: '9:00 AM - 6:00 PM',
            saturday: '9:00 AM - 2:00 PM',
            sunday: 'Closed'
          },
          createdAt: '2024-01-15',
          lastInspection: '2024-07-15',
          compliance: {
            drugLicense: 'DL-MH-001-2024',
            gstRegistration: 'GST-MH-001',
            fireNoc: 'FIRE-001-2024'
          }
        },
        {
          id: 2,
          code: 'WH-002',
          name: 'Cold Storage Unit',
          type: 'specialized',
          address: '456 Pharma Complex, MIDC',
          city: 'Pune',
          state: 'Maharashtra',
          pincode: '411019',
          phone: '+91 98765 43211',
          email: 'cold.storage@pharmaerp.com',
          manager: 'Priya Sharma',
          capacity: 1500,
          currentStock: 1200,
          utilizationPercent: 80,
          status: 'active',
          features: {
            temperatureControlled: true,
            securitySystem: true,
            inventoryTracking: true,
            barcodeScanning: true,
            rfidEnabled: true
          },
          temperatureRange: '2°C - 8°C',
          operatingHours: {
            weekdays: '24/7 Monitoring',
            saturday: '24/7 Monitoring',
            sunday: '24/7 Monitoring'
          },
          createdAt: '2024-02-01',
          lastInspection: '2024-07-10',
          compliance: {
            drugLicense: 'DL-MH-002-2024',
            gstRegistration: 'GST-MH-002',
            temperatureCertification: 'TEMP-CERT-2024'
          }
        },
        {
          id: 3,
          code: 'WH-003',
          name: 'Main Warehouse',
          type: 'warehouse',
          address: '123 Industrial Area, Phase 1',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          phone: '+91 22 1234 5678',
          email: 'main.warehouse@pharma.com',
          manager: 'Rajesh Kumar',
          capacity: 10000,
          occupancy: 7500,
          isActive: true,
          isDefault: true,
          temperature: 'Ambient',
          description: 'Primary distribution center',
          stockValue: 5250000,
          totalProducts: 245
        },
        {
          id: 2,
          code: 'WH-002',
          name: 'Cold Storage Facility',
          type: 'coldStorage',
          address: '456 Cold Chain Park',
          city: 'Pune',
          state: 'Maharashtra',
          pincode: '411001',
          phone: '+91 20 9876 5432',
          email: 'cold.storage@pharma.com',
          manager: 'Priya Sharma',
          capacity: 5000,
          occupancy: 3200,
          isActive: true,
          isDefault: false,
          temperature: '2-8°C',
          description: 'Temperature controlled storage for vaccines and biologics',
          stockValue: 8750000,
          totalProducts: 89
        },
        {
          id: 3,
          code: 'ST-001',
          name: 'City Center Store',
          type: 'store',
          address: '789 Main Street',
          city: 'Delhi',
          state: 'Delhi',
          pincode: '110001',
          phone: '+91 11 5555 1234',
          email: 'delhi.store@pharma.com',
          manager: 'Amit Singh',
          capacity: 2000,
          occupancy: 1500,
          isActive: true,
          isDefault: false,
          temperature: 'Ambient',
          description: 'Retail pharmacy outlet',
          stockValue: 1250000,
          totalProducts: 156
        },
        {
          id: 4,
          code: 'WH-003',
          name: 'Regional Distribution Center',
          type: 'warehouse',
          address: '321 Logistics Hub',
          city: 'Bangalore',
          state: 'Karnataka',
          pincode: '560001',
          phone: '+91 80 4444 5678',
          email: 'bangalore.warehouse@pharma.com',
          manager: 'Suresh Reddy',
          capacity: 8000,
          occupancy: 5600,
          isActive: true,
          isDefault: false,
          temperature: 'Ambient',
          description: 'South region distribution hub',
          stockValue: 4100000,
          totalProducts: 198
        },
        {
          id: 5,
          code: 'ST-002',
          name: 'Hospital Pharmacy',
          type: 'store',
          address: 'City Hospital Complex',
          city: 'Chennai',
          state: 'Tamil Nadu',
          pincode: '600001',
          phone: '+91 44 3333 4567',
          email: 'hospital.pharmacy@pharma.com',
          manager: 'Dr. Lakshmi Iyer',
          capacity: 1500,
          occupancy: 1200,
          isActive: true,
          isDefault: false,
          temperature: 'Ambient',
          description: 'In-hospital pharmacy',
          stockValue: 2100000,
          totalProducts: 134
        },
        {
          id: 6,
          code: 'QT-001',
          name: 'Quarantine Area',
          type: 'quarantine',
          address: 'Quality Control Building',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          phone: '+91 22 2222 3333',
          email: 'qc.warehouse@pharma.com',
          manager: 'Dr. Anil Verma',
          capacity: 1000,
          occupancy: 300,
          isActive: true,
          isDefault: false,
          temperature: 'Controlled',
          description: 'Holding area for quality testing',
          stockValue: 450000,
          totalProducts: 23
        }
        ];
      }
      
      setWarehouses(warehouseData);
    } catch (error) {
      console.error('Error loading warehouses:', error);
      setError('Failed to load warehouses. Please try again.');
      // Use empty array on error
      setWarehouses([]);
    } finally {
      setIsLoading(false);
    }
  };

  const warehouseTypes = [
    { value: 'all', label: 'All Locations' },
    { value: 'warehouse', label: 'Warehouses' },
    { value: 'store', label: 'Stores' },
    { value: 'coldStorage', label: 'Cold Storage' },
    { value: 'quarantine', label: 'Quarantine' }
  ];

  const temperatureOptions = [
    { value: 'ambient', label: 'Ambient (15-25°C)' },
    { value: 'cool', label: 'Cool (8-15°C)' },
    { value: 'cold', label: 'Cold (2-8°C)' },
    { value: 'frozen', label: 'Frozen (-20°C)' },
    { value: 'controlled', label: 'Controlled' }
  ];

  const filteredWarehouses = warehouses.filter(warehouse => {
    const matchesSearch = searchTerm === '' ||
                         warehouse.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         warehouse.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         warehouse.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         warehouse.manager.toLowerCase().includes(searchTerm.toLowerCase());
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
    temperature: 'ambient',
    description: '',
    isDefault: false,
    isActive: true
  });

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (editingWarehouse) {
      // Update existing warehouse
      setWarehouses(prev => prev.map(w => 
        w.id === editingWarehouse.id 
          ? { ...w, ...formData, occupancy: w.occupancy, stockValue: w.stockValue, totalProducts: w.totalProducts }
          : w
      ));
      setSuccessMessage('Warehouse updated successfully!');
    } else {
      // Add new warehouse
      const newWarehouse = {
        ...formData,
        id: Date.now(),
        occupancy: 0,
        stockValue: 0,
        totalProducts: 0,
        capacity: parseInt(formData.capacity) || 0
      };
      setWarehouses(prev => [...prev, newWarehouse]);
      setSuccessMessage('Warehouse added successfully!');
    }
    
    setTimeout(() => setSuccessMessage(''), 3000);
    handleCloseModal();
  };

  const handleEdit = (warehouse) => {
    setEditingWarehouse(warehouse);
    setFormData({
      code: warehouse.code,
      name: warehouse.name,
      type: warehouse.type,
      address: warehouse.address,
      city: warehouse.city,
      state: warehouse.state,
      pincode: warehouse.pincode,
      phone: warehouse.phone,
      email: warehouse.email,
      manager: warehouse.manager,
      capacity: warehouse.capacity,
      temperature: warehouse.temperature,
      description: warehouse.description || '',
      isDefault: warehouse.isDefault,
      isActive: warehouse.isActive
    });
    setShowAddModal(true);
  };

  const handleDelete = (id) => {
    const warehouse = warehouses.find(w => w.id === id);
    
    if (warehouse.isDefault) {
      alert('Cannot delete default warehouse. Please set another warehouse as default first.');
      return;
    }
    
    if (warehouse.occupancy > 0) {
      alert(`Cannot delete ${warehouse.name}. It has stock worth ₹${warehouse.stockValue.toLocaleString()}.`);
      return;
    }
    
    if (window.confirm('Are you sure you want to delete this warehouse?')) {
      setWarehouses(prev => prev.filter(w => w.id !== id));
      setSuccessMessage('Warehouse deleted successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  };

  const handleToggleActive = (id) => {
    setWarehouses(prev => prev.map(w => 
      w.id === id ? { ...w, isActive: !w.isActive } : w
    ));
  };

  const handleSetDefault = (id) => {
    setWarehouses(prev => prev.map(w => ({
      ...w,
      isDefault: w.id === id
    })));
    setSuccessMessage('Default warehouse updated!');
    setTimeout(() => setSuccessMessage(''), 3000);
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
      temperature: 'ambient',
      description: '',
      isDefault: false,
      isActive: true
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

  const getTypeColor = (type) => {
    const colors = {
      warehouse: 'blue',
      store: 'green',
      coldStorage: 'cyan',
      quarantine: 'orange'
    };
    return colors[type] || 'gray';
  };

  const getTypeIcon = (type) => {
    const icons = {
      warehouse: '🏭',
      store: '🏪',
      coldStorage: '❄️',
      quarantine: '⚠️'
    };
    return icons[type] || '📦';
  };

  const getOccupancyPercentage = (warehouse) => {
    return warehouse.capacity > 0 ? Math.round((warehouse.occupancy / warehouse.capacity) * 100) : 0;
  };

  const getOccupancyColor = (percentage) => {
    if (percentage >= 90) return 'red';
    if (percentage >= 70) return 'amber';
    if (percentage >= 50) return 'yellow';
    return 'green';
  };

  const totalCapacity = warehouses.reduce((sum, w) => sum + w.capacity, 0);
  const totalOccupancy = warehouses.reduce((sum, w) => sum + w.occupancy, 0);
  const totalStockValue = warehouses.reduce((sum, w) => sum + w.stockValue, 0);
  const activeWarehouses = warehouses.filter(w => w.isActive).length;

  return (
    <div className="flex-1 flex flex-col bg-gray-50 h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Warehouse className="w-6 h-6 text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900">Warehouse Master</h1>
            <span className="text-sm text-gray-500">({warehouses.length} locations)</span>
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
              <span>Add Location</span>
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Total Locations</p>
                <p className="text-lg font-semibold text-gray-900">{warehouses.length}</p>
              </div>
              <Warehouse className="w-8 h-8 text-gray-400" />
            </div>
          </div>
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Active Locations</p>
                <p className="text-lg font-semibold text-blue-900">{activeWarehouses}</p>
              </div>
              <MapPin className="w-8 h-8 text-blue-400" />
            </div>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Total Capacity</p>
                <p className="text-lg font-semibold text-green-900">{totalCapacity.toLocaleString()}</p>
                <p className="text-xs text-gray-500">{Math.round((totalOccupancy / totalCapacity) * 100)}% occupied</p>
              </div>
              <Package className="w-8 h-8 text-green-400" />
            </div>
          </div>
          <div className="bg-purple-50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Total Stock Value</p>
                <p className="text-lg font-semibold text-purple-900">₹{(totalStockValue / 1000000).toFixed(1)}M</p>
              </div>
              <BarChart3 className="w-8 h-8 text-purple-400" />
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
        </div>
      )}
      
      {successMessage && (
        <div className="mx-6 mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center">
          <Check className="w-5 h-5 mr-2" />
          {successMessage}
        </div>
      )}

      {/* Warehouses Table */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">Loading warehouses...</span>
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location Details</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Capacity</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock Value</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredWarehouses.map((warehouse) => {
                    const occupancyPercentage = getOccupancyPercentage(warehouse);
                    const occupancyColor = getOccupancyColor(occupancyPercentage);
                    
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
                            <div className="flex items-center space-x-2">
                              <span className="text-lg">{getTypeIcon(warehouse.type)}</span>
                              <div>
                                <p className="text-sm font-medium text-gray-900">
                                  {warehouse.name}
                                  {warehouse.isDefault && (
                                    <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                                      Default
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {warehouse.code} • {warehouse.city}, {warehouse.state}
                                </p>
                                {warehouse.temperature !== 'Ambient' && (
                                  <p className="text-xs text-blue-600 mt-1">
                                    🌡️ {warehouse.temperature}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm">
                            <p className="text-gray-900">
                              <User className="w-3 h-3 inline mr-1" />
                              {warehouse.manager}
                            </p>
                            <p className="text-xs text-gray-500">
                              <Phone className="w-3 h-3 inline mr-1" />
                              {warehouse.phone}
                            </p>
                            <p className="text-xs text-gray-500">
                              <Mail className="w-3 h-3 inline mr-1" />
                              {warehouse.email}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm text-gray-900">
                                {warehouse.occupancy.toLocaleString()} / {warehouse.capacity.toLocaleString()}
                              </span>
                              <span className={`text-xs font-medium text-${occupancyColor}-600`}>
                                {occupancyPercentage}%
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className={`bg-${occupancyColor}-500 h-2 rounded-full transition-all duration-300`}
                                style={{ width: `${occupancyPercentage}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm">
                            <p className="font-medium text-gray-900">
                              ₹{(warehouse.stockValue / 1000000).toFixed(2)}M
                            </p>
                            <p className="text-xs text-gray-500">
                              {warehouse.totalProducts} products
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => handleToggleActive(warehouse.id)}
                            className={`px-2 py-1 text-xs rounded-full ${
                              warehouse.isActive 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {warehouse.isActive ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center space-x-2">
                            {!warehouse.isDefault && warehouse.isActive && (
                              <button
                                onClick={() => handleSetDefault(warehouse.id)}
                                className="p-1 text-gray-600 hover:bg-gray-50 rounded"
                                title="Set as default"
                              >
                                <Settings className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleEdit(warehouse)}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(warehouse.id)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              disabled={warehouse.isDefault || warehouse.occupancy > 0}
                              title={warehouse.isDefault ? 'Cannot delete default warehouse' : warehouse.occupancy > 0 ? 'Warehouse has stock' : ''}
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
                  {editingWarehouse ? 'Edit Location' : 'Add New Location'}
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
                    Location Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => handleInputChange('code', e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., WH-001, ST-001"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Location Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Main Warehouse, City Store"
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
                    <option value="store">Store</option>
                    <option value="coldStorage">Cold Storage</option>
                    <option value="quarantine">Quarantine</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Temperature Control</label>
                  <select
                    value={formData.temperature}
                    onChange={(e) => handleInputChange('temperature', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {temperatureOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => handleInputChange('address', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Street address"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <input
                    type="text"
                    value={formData.state}
                    onChange={(e) => handleInputChange('state', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pincode</label>
                  <input
                    type="text"
                    value={formData.pincode}
                    onChange={(e) => handleInputChange('pincode', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="+91 12345 67890"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="warehouse@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Manager Name</label>
                  <input
                    type="text"
                    value={formData.manager}
                    onChange={(e) => handleInputChange('manager', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
                  <input
                    type="number"
                    value={formData.capacity}
                    onChange={(e) => handleInputChange('capacity', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 1000"
                    min="0"
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

                <div className="md:col-span-2 space-y-2">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.isDefault}
                      onChange={(e) => handleInputChange('isDefault', e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Set as default location</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => handleInputChange('isActive', e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Active</span>
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
                  {editingWarehouse ? 'Update Location' : 'Add Location'}
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