import React, { useState, useEffect } from 'react';
import { 
  Ruler, Search, Plus, Edit2, Trash2, 
  Download, Upload, Loader2, AlertCircle, Check,
  ArrowRight, Hash, X
} from 'lucide-react';
import { settingsApi } from '../../services/api/modules/settings.api';

const UnitMaster = ({ open, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [selectedUnits, setSelectedUnits] = useState([]);
  const [units, setUnits] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  
  // Load units on component mount
  useEffect(() => {
    if (open) {
      loadUnits();
    }
  }, [open]);
  
  // Load units from backend
  const loadUnits = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await settingsApi.units.getAll();
      console.log('Units API Response:', response);
      
      // Handle different response formats
      let unitData = [];
      if (response?.data) {
        unitData = Array.isArray(response.data) ? response.data : response.data.units || [];
      } else if (Array.isArray(response)) {
        unitData = response;
      }
      
      // If no data from API, use mock data as fallback
      if (!unitData || unitData.length === 0) {
        unitData = [
          // Quantity Units
        {
          id: 1,
          code: 'NOS',
          name: 'Numbers',
          symbol: 'Nos',
          category: 'quantity',
          baseUnit: null,
          conversionFactor: 1,
          isBase: true,
          isActive: true,
          description: 'Individual count'
        },
        {
          id: 2,
          code: 'TAB',
          name: 'Tablet',
          symbol: 'Tab',
          category: 'quantity',
          baseUnit: 'NOS',
          conversionFactor: 1,
          isBase: false,
          isActive: true,
          description: 'Single tablet'
        },
        {
          id: 3,
          code: 'STRIP',
          name: 'Strip',
          symbol: 'Strip',
          category: 'quantity',
          baseUnit: 'TAB',
          conversionFactor: 10,
          isBase: false,
          isActive: true,
          description: 'Strip of 10 tablets'
        },
        {
          id: 4,
          code: 'BOX',
          name: 'Box',
          symbol: 'Box',
          category: 'quantity',
          baseUnit: 'STRIP',
          conversionFactor: 10,
          isBase: false,
          isActive: true,
          description: 'Box of 10 strips'
        },
        // Volume Units
        {
          id: 5,
          code: 'ML',
          name: 'Milliliter',
          symbol: 'ml',
          category: 'volume',
          baseUnit: null,
          conversionFactor: 1,
          isBase: true,
          isActive: true,
          description: 'Base volume unit'
        },
        {
          id: 6,
          code: 'L',
          name: 'Liter',
          symbol: 'L',
          category: 'volume',
          baseUnit: 'ML',
          conversionFactor: 1000,
          isBase: false,
          isActive: true,
          description: '1000 milliliters'
        },
        {
          id: 7,
          code: 'BOTTLE',
          name: 'Bottle',
          symbol: 'Btl',
          category: 'volume',
          baseUnit: 'ML',
          conversionFactor: 100,
          isBase: false,
          isActive: true,
          description: 'Standard 100ml bottle'
        },
        // Weight Units
        {
          id: 8,
          code: 'MG',
          name: 'Milligram',
          symbol: 'mg',
          category: 'weight',
          baseUnit: null,
          conversionFactor: 1,
          isBase: true,
          isActive: true,
          description: 'Base weight unit'
        },
        {
          id: 9,
          code: 'G',
          name: 'Gram',
          symbol: 'g',
          category: 'weight',
          baseUnit: 'MG',
          conversionFactor: 1000,
          isBase: false,
          isActive: true,
          description: '1000 milligrams'
        },
        {
          id: 10,
          code: 'KG',
          name: 'Kilogram',
          symbol: 'kg',
          category: 'weight',
          baseUnit: 'G',
          conversionFactor: 1000,
          isBase: false,
          isActive: true,
          description: '1000 grams'
        },
        // Special Units
        {
          id: 11,
          code: 'VIAL',
          name: 'Vial',
          symbol: 'Vial',
          category: 'special',
          baseUnit: 'NOS',
          conversionFactor: 1,
          isBase: false,
          isActive: true,
          description: 'Single vial container'
        },
        {
          id: 12,
          code: 'TUBE',
          name: 'Tube',
          symbol: 'Tube',
          category: 'special',
          baseUnit: 'NOS',
          conversionFactor: 1,
          isBase: false,
          isActive: true,
          description: 'Single tube container'
        }
        ];
      }
      
      setUnits(unitData);
    } catch (error) {
      console.error('Error loading units:', error);
      setError('Failed to load units. Please try again.');
      // Use empty array on error
      setUnits([]);
    } finally {
      setIsLoading(false);
    }
  };

  const unitCategories = [
    { value: 'all', label: 'All Categories' },
    { value: 'quantity', label: 'Quantity' },
    { value: 'volume', label: 'Volume' },
    { value: 'weight', label: 'Weight' },
    { value: 'special', label: 'Special' }
  ];

  const filteredUnits = units.filter(unit => {
    const matchesSearch = searchTerm === '' ||
                         unit.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         unit.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         unit.symbol.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || unit.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    symbol: '',
    category: 'quantity',
    baseUnit: '',
    conversionFactor: 1,
    description: '',
    isActive: true
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
      const unitData = {
        ...formData,
        isBase: !formData.baseUnit,
        conversionFactor: parseFloat(formData.conversionFactor) || 1
      };
      
      if (editingUnit) {
        // Update existing unit
        const response = await settingsApi.units.update(editingUnit.id, unitData);
        if (response.success || response.data) {
          setSuccessMessage('Unit updated successfully!');
          await loadUnits(); // Reload data
        }
      } else {
        // Add new unit
        const response = await settingsApi.units.create(unitData);
        if (response.success || response.data) {
          setSuccessMessage('Unit added successfully!');
          await loadUnits(); // Reload data
        }
      }
      
      setTimeout(() => setSuccessMessage(''), 3000);
      handleCloseModal();
    } catch (error) {
      console.error('Error saving unit:', error);
      setError('Failed to save unit. Please try again.');
      // Fallback to local state update
      if (editingUnit) {
        setUnits(prev => prev.map(u => 
          u.id === editingUnit.id 
            ? { ...u, ...formData, isBase: !formData.baseUnit, conversionFactor: parseFloat(formData.conversionFactor) || 1 }
            : u
        ));
      } else {
        const newUnit = {
          ...formData,
          id: Date.now(),
          isBase: !formData.baseUnit,
          conversionFactor: parseFloat(formData.conversionFactor) || 1
        };
        setUnits(prev => [...prev, newUnit]);
      }
      setSuccessMessage('Unit saved locally.');
      setTimeout(() => {
        setSuccessMessage('');
        setError(null);
      }, 3000);
      handleCloseModal();
    }
  };

  const handleEdit = (unit) => {
    setEditingUnit(unit);
    setFormData({
      code: unit.code,
      name: unit.name,
      symbol: unit.symbol,
      category: unit.category,
      baseUnit: unit.baseUnit || '',
      conversionFactor: unit.conversionFactor,
      description: unit.description || '',
      isActive: unit.isActive
    });
    setShowAddModal(true);
  };

  const handleDelete = (id) => {
    const unit = units.find(u => u.id === id);
    // Check if any other unit depends on this unit
    const dependentUnits = units.filter(u => u.baseUnit === unit.code);
    
    if (dependentUnits.length > 0) {
      alert(`Cannot delete ${unit.name}. ${dependentUnits.length} units depend on it.`);
      return;
    }
    
    if (window.confirm('Are you sure you want to delete this unit?')) {
      setUnits(prev => prev.filter(u => u.id !== id));
      setSuccessMessage('Unit deleted successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  };

  const handleToggleActive = (id) => {
    setUnits(prev => prev.map(u => 
      u.id === id ? { ...u, isActive: !u.isActive } : u
    ));
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingUnit(null);
    setFormData({
      code: '',
      name: '',
      symbol: '',
      category: 'quantity',
      baseUnit: '',
      conversionFactor: 1,
      description: '',
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

  const getCategoryColor = (category) => {
    const colors = {
      quantity: 'blue',
      volume: 'green',
      weight: 'purple',
      special: 'orange'
    };
    return colors[category] || 'gray';
  };

  const getCategoryIcon = (category) => {
    const icons = {
      quantity: Hash,
      volume: '🧪',
      weight: '⚖️',
      special: '📦'
    };
    return icons[category] || '📏';
  };

  const getAvailableBaseUnits = (category) => {
    return units.filter(u => u.category === category && u.isActive);
  };

  const getConversionChain = (unit) => {
    const chain = [unit];
    let currentUnit = unit;
    
    while (currentUnit.baseUnit) {
      const baseUnit = units.find(u => u.code === currentUnit.baseUnit);
      if (!baseUnit) break;
      chain.push(baseUnit);
      currentUnit = baseUnit;
    }
    
    return chain.reverse();
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-50 h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Ruler className="w-6 h-6 text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900">Unit Master</h1>
            <span className="text-sm text-gray-500">({units.length} units)</span>
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
              <span>Add Unit</span>
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
              placeholder="Search by name, code, or symbol..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            {unitCategories.map(cat => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
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

      {/* Units Table */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">Loading units...</span>
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
                            setSelectedUnits(filteredUnits.map(u => u.id));
                          } else {
                            setSelectedUnits([]);
                          }
                        }}
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit Details</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Conversion</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredUnits.map((unit) => {
                    const conversionChain = getConversionChain(unit);
                    return (
                      <tr key={unit.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={selectedUnits.includes(unit.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedUnits([...selectedUnits, unit.id]);
                              } else {
                                setSelectedUnits(selectedUnits.filter(id => id !== unit.id));
                              }
                            }}
                            className="rounded border-gray-300"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {unit.name} ({unit.symbol})
                            </p>
                            <p className="text-xs text-gray-500">
                              Code: {unit.code}
                              {unit.description && ` • ${unit.description}`}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs rounded-full bg-${getCategoryColor(unit.category)}-100 text-${getCategoryColor(unit.category)}-800`}>
                            {unit.category}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm">
                            {unit.isBase ? (
                              <span className="text-gray-500">Base Unit</span>
                            ) : (
                              <div className="flex items-center space-x-1 text-gray-700">
                                {conversionChain.map((u, index) => (
                                  <React.Fragment key={u.id}>
                                    {index > 0 && <ArrowRight className="w-3 h-3 text-gray-400" />}
                                    <span className={index === conversionChain.length - 1 ? 'font-medium' : ''}>
                                      {index === 0 ? '1' : u.conversionFactor} {u.symbol}
                                    </span>
                                  </React.Fragment>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => handleToggleActive(unit.id)}
                            className={`px-2 py-1 text-xs rounded-full ${
                              unit.isActive 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {unit.isActive ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={() => handleEdit(unit)}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(unit.id)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              disabled={unit.isBase}
                              title={unit.isBase ? 'Cannot delete base unit' : ''}
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl m-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingUnit ? 'Edit Unit' : 'Add New Unit'}
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
                    Unit Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => handleInputChange('code', e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., TAB, ML, KG"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unit Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Tablet, Milliliter, Kilogram"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Symbol <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.symbol}
                    onChange={(e) => handleInputChange('symbol', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Tab, ml, kg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => {
                      handleInputChange('category', e.target.value);
                      handleInputChange('baseUnit', ''); // Reset base unit when category changes
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="quantity">Quantity</option>
                    <option value="volume">Volume</option>
                    <option value="weight">Weight</option>
                    <option value="special">Special</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Base Unit</label>
                  <select
                    value={formData.baseUnit}
                    onChange={(e) => handleInputChange('baseUnit', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- None (This is base unit) --</option>
                    {getAvailableBaseUnits(formData.category).map(unit => (
                      <option key={unit.id} value={unit.code}>
                        {unit.name} ({unit.symbol})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Conversion Factor
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={formData.conversionFactor}
                    onChange={(e) => handleInputChange('conversionFactor', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    disabled={!formData.baseUnit}
                    placeholder="e.g., 10, 1000"
                  />
                  {formData.baseUnit && (
                    <p className="text-xs text-gray-500 mt-1">
                      1 {formData.symbol || 'unit'} = {formData.conversionFactor} {
                        getAvailableBaseUnits(formData.category).find(u => u.code === formData.baseUnit)?.symbol
                      }
                    </p>
                  )}
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

                <div className="md:col-span-2">
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
                  {editingUnit ? 'Update Unit' : 'Add Unit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnitMaster;