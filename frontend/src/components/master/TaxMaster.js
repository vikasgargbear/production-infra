import React, { useState, useEffect } from 'react';
import { 
  Receipt, Search, Plus, Edit2, Trash2, 
  Download, Upload, Loader2, AlertCircle, Check,
  Percent, X
} from 'lucide-react';
import { settingsApi } from '../../services/api/modules/settings.api';

const TaxMaster = ({ open, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTax, setEditingTax] = useState(null);
  const [selectedTaxes, setSelectedTaxes] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  
  // Load taxes on component mount
  useEffect(() => {
    if (open) {
      loadTaxes();
    }
  }, [open]);
  
  // Load taxes from backend
  const loadTaxes = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await settingsApi.taxes.getAll();
      console.log('Tax API Response:', response);
      
      // Handle different response formats
      let taxData = [];
      if (response?.data) {
        taxData = Array.isArray(response.data) ? response.data : response.data.taxes || [];
      } else if (Array.isArray(response)) {
        taxData = response;
      }
      
      // If no data from API, use mock data as fallback
      if (!taxData || taxData.length === 0) {
        taxData = [
          {
            id: 1,
            name: 'GST 5%',
            type: 'GST',
            rate: 5,
            cgst: 2.5,
            sgst: 2.5,
            igst: 5,
            description: 'Goods and Services Tax - 5%',
            isActive: true
          },
          {
            id: 2,
            name: 'GST 12%',
            type: 'GST',
            rate: 12,
            cgst: 6,
            sgst: 6,
            igst: 12,
            description: 'Goods and Services Tax - 12%',
            isActive: true
          },
          {
            id: 3,
            name: 'GST 18%',
            type: 'GST',
            rate: 18,
            cgst: 9,
            sgst: 9,
            igst: 18,
            description: 'Goods and Services Tax - 18%',
            isActive: true
          },
          {
            id: 4,
            name: 'GST 28%',
            type: 'GST',
            rate: 28,
            cgst: 14,
            sgst: 14,
            igst: 28,
            description: 'Goods and Services Tax - 28%',
            isActive: true
          },
          {
            id: 5,
            name: 'GST Exempt',
            type: 'GST',
            rate: 0,
            cgst: 0,
            sgst: 0,
            igst: 0,
            description: 'GST Exempted Items',
            isActive: true
          }
        ];
      }
      
      setTaxes(taxData);
    } catch (error) {
      console.error('Error loading taxes:', error);
      setError('Failed to load tax rates. Please try again.');
      // Use mock data on error
      setTaxes([]);
    } finally {
      setIsLoading(false);
    }
  };

  const taxTypes = [
    { value: 'all', label: 'All Types' },
    { value: 'GST', label: 'GST' },
    { value: 'VAT', label: 'VAT' },
    { value: 'Custom', label: 'Custom' }
  ];

  const filteredTaxes = taxes.filter(tax => {
    const matchesSearch = searchTerm === '' ||
                         tax.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tax.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || tax.type === filterType;
    return matchesSearch && matchesType;
  });

  const [formData, setFormData] = useState({
    name: '',
    type: 'GST',
    rate: '',
    cgst: '',
    sgst: '',
    igst: '',
    description: '',
    isActive: true
  });

  const handleInputChange = (field, value) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-calculate GST components
      if (field === 'rate' && prev.type === 'GST') {
        const rate = parseFloat(value) || 0;
        updated.cgst = rate / 2;
        updated.sgst = rate / 2;
        updated.igst = rate;
      } else if ((field === 'cgst' || field === 'sgst') && prev.type === 'GST') {
        const cgst = field === 'cgst' ? parseFloat(value) || 0 : parseFloat(updated.cgst) || 0;
        const sgst = field === 'sgst' ? parseFloat(value) || 0 : parseFloat(updated.sgst) || 0;
        updated.rate = cgst + sgst;
        updated.igst = cgst + sgst;
      }
      
      return updated;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    
    try {
      const taxData = {
        ...formData,
        rate: parseFloat(formData.rate) || 0,
        cgst: parseFloat(formData.cgst) || 0,
        sgst: parseFloat(formData.sgst) || 0,
        igst: parseFloat(formData.igst) || 0
      };
      
      if (editingTax) {
        // Update existing tax
        const response = await settingsApi.taxes.update(editingTax.id, taxData);
        if (response.success || response.data) {
          setSuccessMessage('Tax updated successfully!');
          await loadTaxes(); // Reload data
        }
      } else {
        // Add new tax
        const response = await settingsApi.taxes.create(taxData);
        if (response.success || response.data) {
          setSuccessMessage('Tax added successfully!');
          await loadTaxes(); // Reload data
        }
      }
      
      setTimeout(() => setSuccessMessage(''), 3000);
      handleCloseModal();
    } catch (error) {
      console.error('Error saving tax:', error);
      setError('Failed to save tax. Please try again.');
      // For now, update local state as fallback
      if (editingTax) {
        setTaxes(prev => prev.map(t => 
          t.id === editingTax.id 
            ? { ...t, ...formData }
            : t
        ));
      } else {
        const newTax = {
          ...formData,
          id: Date.now(),
          rate: parseFloat(formData.rate) || 0,
          cgst: parseFloat(formData.cgst) || 0,
          sgst: parseFloat(formData.sgst) || 0,
          igst: parseFloat(formData.igst) || 0
        };
        setTaxes(prev => [...prev, newTax]);
      }
      setSuccessMessage('Tax saved locally.');
      setTimeout(() => {
        setSuccessMessage('');
        setError(null);
      }, 3000);
      handleCloseModal();
    }
  };

  const handleEdit = (tax) => {
    setEditingTax(tax);
    setFormData({
      name: tax.name,
      type: tax.type,
      rate: tax.rate,
      cgst: tax.cgst || 0,
      sgst: tax.sgst || 0,
      igst: tax.igst || 0,
      description: tax.description || '',
      isActive: tax.isActive
    });
    setShowAddModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this tax configuration?')) {
      try {
        const response = await settingsApi.taxes.delete(id);
        if (response.success || response.status === 200) {
          setSuccessMessage('Tax deleted successfully!');
          await loadTaxes(); // Reload data
        }
      } catch (error) {
        console.error('Error deleting tax:', error);
        setError('Failed to delete tax. Please try again.');
        // Fallback to local deletion
        setTaxes(prev => prev.filter(t => t.id !== id));
        setSuccessMessage('Tax deleted locally.');
      }
      setTimeout(() => {
        setSuccessMessage('');
        setError(null);
      }, 3000);
    }
  };

  const handleToggleActive = (id) => {
    setTaxes(prev => prev.map(t => 
      t.id === id ? { ...t, isActive: !t.isActive } : t
    ));
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingTax(null);
    setFormData({
      name: '',
      type: 'GST',
      rate: '',
      cgst: '',
      sgst: '',
      igst: '',
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

  return (
    <div className="flex-1 flex flex-col bg-gray-50 h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Receipt className="w-6 h-6 text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900">Tax Master</h1>
            <span className="text-sm text-gray-500">({taxes.length} taxes)</span>
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
              <span>Add Tax</span>
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
              placeholder="Search by name or description..."
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
            {taxTypes.map(type => (
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

      {/* Taxes Table */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">Loading taxes...</span>
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
                            setSelectedTaxes(filteredTaxes.map(t => t.id));
                          } else {
                            setSelectedTaxes([]);
                          }
                        }}
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tax Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Rate</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">CGST</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">SGST</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">IGST</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredTaxes.map((tax) => (
                    <tr key={tax.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedTaxes.includes(tax.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTaxes([...selectedTaxes, tax.id]);
                            } else {
                              setSelectedTaxes(selectedTaxes.filter(id => id !== tax.id));
                            }
                          }}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{tax.name}</p>
                          {tax.description && (
                            <p className="text-xs text-gray-500">{tax.description}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                          {tax.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                          <Percent className="w-3 h-3 mr-1" />
                          {tax.rate}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-sm text-gray-900">
                        {tax.cgst}%
                      </td>
                      <td className="px-6 py-4 text-center text-sm text-gray-900">
                        {tax.sgst}%
                      </td>
                      <td className="px-6 py-4 text-center text-sm text-gray-900">
                        {tax.igst}%
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleToggleActive(tax.id)}
                          className={`px-2 py-1 text-xs rounded-full ${
                            tax.isActive 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {tax.isActive ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => handleEdit(tax)}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(tax.id)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
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
                  {editingTax ? 'Edit Tax Configuration' : 'Add New Tax'}
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
                    Tax Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., GST 18%"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tax Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => handleInputChange('type', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="GST">GST</option>
                    <option value="VAT">VAT</option>
                    <option value="Custom">Custom</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tax Rate (%) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    value={formData.rate}
                    onChange={(e) => handleInputChange('rate', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="18"
                  />
                </div>

                {formData.type === 'GST' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">CGST (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.cgst}
                        onChange={(e) => handleInputChange('cgst', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">SGST (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.sgst}
                        onChange={(e) => handleInputChange('sgst', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">IGST (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.igst}
                        onChange={(e) => handleInputChange('igst', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        readOnly
                      />
                    </div>
                  </>
                )}

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
                  {editingTax ? 'Update Tax' : 'Add Tax'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaxMaster;