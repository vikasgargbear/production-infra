import React, { useState, useEffect } from 'react';
import { 
  Building2, Search, CheckCircle, AlertCircle, 
  Plus, MapPin, Phone, FileText, Calendar
} from 'lucide-react';
import { suppliersApi } from '../../../services/api';
import { debounce } from 'lodash';

/**
 * SupplierVerificationModal - Verify or create supplier from extracted data
 */
const SupplierVerificationModal = ({ 
  extractedSupplier, 
  onVerified, 
  onCancel 
}) => {
  const [mode, setMode] = useState('searching'); // 'searching', 'found', 'create'
  const [searchResults, setSearchResults] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [supplierForm, setSupplierForm] = useState({
    supplier_name: extractedSupplier?.name || '',
    gstin: extractedSupplier?.gstin || '',
    address: extractedSupplier?.address || '',
    mobile: '',
    email: '',
    state: '',
    city: ''
  });
  const [loading, setLoading] = useState(false);

  // Search for existing supplier
  useEffect(() => {
    searchSupplier();
  }, []);

  const searchSupplier = async () => {
    setLoading(true);
    try {
      // Search by GSTIN first (most accurate)
      if (extractedSupplier?.gstin) {
        const response = await suppliersApi.search({ 
          gstin: extractedSupplier.gstin 
        });
        if (response.data && response.data.length > 0) {
          setSearchResults(response.data);
          setMode('found');
          setLoading(false);
          return;
        }
      }

      // Search by name
      if (extractedSupplier?.name) {
        const response = await suppliersApi.search({ 
          search: extractedSupplier.name,
          limit: 5
        });
        if (response.data && response.data.length > 0) {
          setSearchResults(response.data);
          setMode('found');
        } else {
          setMode('create');
        }
      } else {
        setMode('create');
      }
    } catch (error) {
      console.error('Error searching supplier:', error);
      setMode('create');
    } finally {
      setLoading(false);
    }
  };

  // Select existing supplier
  const handleSelectSupplier = (supplier) => {
    setSelectedSupplier(supplier);
    onVerified(supplier);
  };

  // Create new supplier
  const handleCreateSupplier = async () => {
    setLoading(true);
    try {
      const response = await suppliersApi.create(supplierForm);
      if (response.data) {
        onVerified({
          supplier_id: response.data.supplier_id,
          supplier_name: supplierForm.supplier_name,
          gstin: supplierForm.gstin,
          address: supplierForm.address
        });
      }
    } catch (error) {
      console.error('Error creating supplier:', error);
      alert('Failed to create supplier');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Invoice Info */}
      <div className="bg-blue-50 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <FileText className="w-5 h-5 text-blue-600 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-900">Invoice Details</p>
            <div className="mt-1 text-sm text-blue-700">
              <p>Invoice #: {extractedSupplier?.invoice_number}</p>
              <p>Date: {extractedSupplier?.invoice_date}</p>
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      )}

      {!loading && mode === 'found' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Select Matching Supplier</h3>
            <button
              onClick={() => setMode('create')}
              className="text-sm text-indigo-600 hover:text-indigo-700"
            >
              Create New Instead
            </button>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {searchResults.map((supplier) => (
              <div
                key={supplier.supplier_id}
                onClick={() => handleSelectSupplier(supplier)}
                className="p-4 border rounded-lg hover:bg-indigo-50 hover:border-indigo-300 cursor-pointer transition"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium">{supplier.supplier_name}</p>
                    {supplier.gstin && (
                      <p className="text-sm text-gray-600 mt-1">
                        GSTIN: {supplier.gstin}
                        {supplier.gstin === extractedSupplier?.gstin && (
                          <span className="ml-2 text-green-600 font-medium">
                            <CheckCircle className="w-3 h-3 inline mr-1" />
                            Exact Match
                          </span>
                        )}
                      </p>
                    )}
                    {supplier.address && (
                      <p className="text-sm text-gray-500 mt-1">
                        <MapPin className="w-3 h-3 inline mr-1" />
                        {supplier.address}
                      </p>
                    )}
                  </div>
                  <CheckCircle className="w-5 h-5 text-gray-400" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && mode === 'create' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Create New Supplier</h3>
            {searchResults.length > 0 && (
              <button
                onClick={() => setMode('found')}
                className="text-sm text-indigo-600 hover:text-indigo-700"
              >
                View Matches
              </button>
            )}
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium">New supplier will be created</p>
                <p className="mt-1">Please verify the information below:</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Supplier Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={supplierForm.supplier_name}
                onChange={(e) => setSupplierForm(prev => ({ 
                  ...prev, 
                  supplier_name: e.target.value 
                }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                GSTIN
              </label>
              <input
                type="text"
                value={supplierForm.gstin}
                onChange={(e) => setSupplierForm(prev => ({ 
                  ...prev, 
                  gstin: e.target.value 
                }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="22AAAAA0000A1Z5"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mobile
              </label>
              <input
                type="text"
                value={supplierForm.mobile}
                onChange={(e) => setSupplierForm(prev => ({ 
                  ...prev, 
                  mobile: e.target.value 
                }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="9876543210"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Address
              </label>
              <textarea
                value={supplierForm.address}
                onChange={(e) => setSupplierForm(prev => ({ 
                  ...prev, 
                  address: e.target.value 
                }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                rows="2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                City
              </label>
              <input
                type="text"
                value={supplierForm.city}
                onChange={(e) => setSupplierForm(prev => ({ 
                  ...prev, 
                  city: e.target.value 
                }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                State
              </label>
              <input
                type="text"
                value={supplierForm.state}
                onChange={(e) => setSupplierForm(prev => ({ 
                  ...prev, 
                  state: e.target.value 
                }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateSupplier}
              disabled={!supplierForm.supplier_name || loading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Create Supplier</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierVerificationModal;