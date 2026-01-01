import React, { useState, useEffect } from 'react';
import {
  Building2, CheckCircle, FileText, Calendar, Info, X, ArrowLeft
} from 'lucide-react';
import { SupplierSearch } from '../../global';

// Import the creation form content from global component
import SupplierCreationForm from './SupplierCreationForm';

/**
 * SupplierVerificationModal - Verify or create supplier from extracted data
 * Uses inline creation form based on global component design
 */
const SupplierVerificationModal = ({
  extractedSupplier,
  onVerified,
  onCancel
}) => {
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [suggestedSupplier, setSuggestedSupplier] = useState<any>(null);

  // Pre-populate with extracted data if available
  useEffect(() => {
    if (extractedSupplier?.name) {
      // Set suggested supplier for creation with all extracted data
      // Map to match the global component's field names
      setSuggestedSupplier({
        supplier_name: extractedSupplier.name,
        gstin: extractedSupplier.gstin || '',
        phone: extractedSupplier.mobile || extractedSupplier.phone || '',
        email: extractedSupplier.email || '',
        address: extractedSupplier.address || '',
        // Parse address if it's a single string
        address_line1: extractedSupplier.address?.split(',')[0] || extractedSupplier.address || '',
        address_line2: extractedSupplier.address?.split(',').slice(1).join(',').trim() || '',
        city: extractedSupplier.city || '',
        state: extractedSupplier.state || 'Maharashtra',
        pincode: extractedSupplier.pincode || '',
        // Additional fields that might be extracted
        drug_license_no: extractedSupplier.drug_license || '',
        pan_number: extractedSupplier.pan || ''
      });
    }
  }, [extractedSupplier]);

  const handleSupplierSelect = (supplier) => {
    setSelectedSupplier(supplier);
    setShowCreateForm(false);
  };

  const handleConfirm = () => {
    if (selectedSupplier) {
      onVerified(selectedSupplier);
    }
  };

  const handleSupplierCreated = (newSupplier) => {
    setSelectedSupplier(newSupplier);
    setShowCreateForm(false);
    // Auto-confirm after creation
    onVerified(newSupplier);
  };

  return (
    <div className="space-y-4">
      {/* Invoice Info - Compact horizontal layout */}
      {!showCreateForm && (
        <div className="bg-blue-50 rounded-lg px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FileText className="w-4 h-4 text-blue-600" />
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-medium text-blue-900">Invoice #:</span>
                  <span className="text-sm font-semibold text-blue-700">{extractedSupplier?.invoice_number}</span>
                </div>
                <div className="w-px h-4 bg-blue-300"></div>
                <div className="flex items-center space-x-2">
                  <Calendar className="w-3 h-3 text-blue-600" />
                  <span className="text-xs font-medium text-blue-900">Date:</span>
                  <span className="text-sm font-semibold text-blue-700">{extractedSupplier?.invoice_date}</span>
                </div>
              </div>
            </div>
            {extractedSupplier?.total_amount && (
              <>
                <div className="w-px h-4 bg-blue-300"></div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-medium text-blue-900">Amount:</span>
                  <span className="text-sm font-bold text-blue-700">₹{extractedSupplier.total_amount}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Extracted Supplier Info */}
      {extractedSupplier?.name && !showCreateForm && (
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-start space-x-3">
            <Building2 className="w-4 h-4 text-gray-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Extracted Supplier Info:</p>
              <div className="mt-1 text-xs text-gray-600 space-y-0.5">
                <p><span className="font-medium">Name:</span> {extractedSupplier.name}</p>
                {extractedSupplier.gstin && (
                  <p><span className="font-medium">GSTIN:</span> {extractedSupplier.gstin}</p>
                )}
                {extractedSupplier.address && (
                  <p><span className="font-medium">Address:</span> {extractedSupplier.address}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content - Show Create Form or Search */}
      {showCreateForm ? (
        /* Inline Create Form */
        <div className="">
          {/* Header with Back Button */}
          <div className="flex items-center justify-between pb-2 mb-3 border-b">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowCreateForm(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                Create New Supplier: {extractedSupplier?.name || 'New'}
              </h3>
            </div>
          </div>

          {/* Use the creation form component */}
          <SupplierCreationForm
            initialData={suggestedSupplier || {}}
            onSupplierCreated={handleSupplierCreated}
            onCancel={() => setShowCreateForm(false)}
            embedded={true}
          />
        </div>
      ) : (
        /* Search or Select Mode */
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select or Create Supplier
            </label>
            {!selectedSupplier ? (
              <div className="space-y-2">
                <SupplierSearch
                  value={selectedSupplier}
                  onChange={handleSupplierSelect}
                  onCreateNew={() => setShowCreateForm(true)}
                  placeholder="Search by name, GSTIN, phone..."
                  required={true}
                  className="w-full"
                />

                {/* Quick Create Button with Extracted Info */}
                {extractedSupplier?.name && (
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center justify-center space-x-2"
                  >
                    <Building2 className="w-4 h-4" />
                    <span>Create "{extractedSupplier.name}" as New Supplier</span>
                  </button>
                )}
              </div>
            ) : (
              /* Selected Supplier Details with Clear Button */
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="text-sm font-medium text-green-900">
                        Selected: {selectedSupplier.supplier_name}
                      </p>
                      {selectedSupplier.gst_number && (
                        <p className="text-xs text-green-700">GSTIN: {selectedSupplier.gst_number}</p>
                      )}
                      {selectedSupplier.primary_phone && (
                        <p className="text-xs text-green-700">Phone: {selectedSupplier.primary_phone}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setSelectedSupplier(null)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                      title="Clear selection"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Helper Text - Only show if no extracted supplier and nothing selected */}
            {!selectedSupplier && !extractedSupplier?.name && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                <div className="flex items-center space-x-2">
                  <Info className="w-4 h-4 text-yellow-600 flex-shrink-0" />
                  <p className="text-xs text-yellow-800">
                    Start typing to search existing suppliers or click "Create New" to add a new supplier
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {!showCreateForm && (
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedSupplier}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <CheckCircle className="w-4 h-4" />
            <span>Use This Supplier</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default SupplierVerificationModal;