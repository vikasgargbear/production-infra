import React, { useState } from 'react';
import { Building, Plus } from 'lucide-react';
import { usePurchase } from '../../../contexts/PurchaseContext';
import { SupplierSearch, SupplierCreationModal } from '../../global';

interface Supplier {
  id: string;
  name: string;
  [key: string]: any;
}

interface SupplierSelectorProps {}

const SupplierSelector: React.FC<SupplierSelectorProps> = () => {
  const { purchase, setSupplier, clearError, errors } = usePurchase();
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  
  const handleSelectSupplier = (supplier: Supplier): void => {
    setSupplier(supplier);
    clearError('supplier');
  };
  
  const handleCreateSupplier = (): void => {
    setShowCreateModal(true);
  };
  
  const handleSupplierCreated = (newSupplier: Supplier): void => {
    handleSelectSupplier(newSupplier);
    setShowCreateModal(false);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wider">SUPPLIER DETAILS</h3>
        <button
          onClick={handleCreateSupplier}
          className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Supplier
        </button>
      </div>
      
      {purchase.supplier_id ? (
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex justify-between items-start">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <Building className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{purchase.supplier_name}</p>
                <p className="text-sm text-gray-600 mt-1">ID: {purchase.supplier_id}</p>
              </div>
            </div>
            <button
              onClick={() => setSupplier(null)}
              className="text-sm text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              Change
            </button>
          </div>
        </div>
      ) : (
        <SupplierSearch
          value={null}
          onChange={handleSelectSupplier}
          onCreateNew={handleCreateSupplier}
          placeholder="Search suppliers by name, phone, or GSTIN..."
          error={errors.supplier}
          className="w-full"
        />
      )}
      
      {/* Supplier Creation Modal */}
      <SupplierCreationModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleSupplierCreated}
      />
    </div>
  );
};

export default SupplierSelector;