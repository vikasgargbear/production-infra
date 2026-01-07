/**
 * Manual Return Entry Component
 * For returns without invoices (enterprise feature)
 */
import React, { useState } from 'react';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import { ProductSearchSimple, NumberInput, Select } from '../../global';
import { batchesApi } from '../../../services/api';

const DISPOSITION_OPTIONS = [
  { value: 'RESTOCK', label: 'Restock - Good Condition' },
  { value: 'QUARANTINE', label: 'Quarantine - Needs Inspection' },
  { value: 'DESTROY', label: 'Destroy - Damaged/Expired' },
  { value: 'RETURN_TO_VENDOR', label: 'Return to Vendor' }
];

export default function ManualReturnEntry({ items, onItemsChange, onClose }) {
  const [manualItems, setManualItems] = useState(items || []);
  const [errors, setErrors] = useState({});

  const handleAddItem = () => {
    setManualItems([...manualItems, {
      id: Date.now(),
      product_id: null,
      product_name: '',
      batch_id: null,
      batch_number: '',
      return_quantity: 1,
      unit_price: 0,
      tax_percent: 0,
      disposition: 'QUARANTINE', // Default to quarantine for manual returns
      reason: '',
      selected: true
    }]);
  };

  const handleRemoveItem = (index) => {
    setManualItems(manualItems.filter((_, i) => i !== index));
  };

  const handleProductSelect = async (product, index) => {
    if (!product) {
      const newItems = [...manualItems];
      newItems[index] = {
        ...newItems[index],
        product_id: null,
        product_name: '',
        batches: [],
        batch_id: null,
        batch_number: '',
        unit_price: 0,
        tax_percent: 0
      };
      setManualItems(newItems);
      return;
    }

    try {
      // Load batches for the product
      const batchResponse = await batchesApi.getByProduct(product.product_id);
      const batches = batchResponse?.data || [];

      const newItems = [...manualItems];
      newItems[index] = {
        ...newItems[index],
        product_id: product.product_id,
        product_name: product.product_name,
        batches: batches,
        batch_id: batches.length === 1 ? batches[0].batch_id : null,
        batch_number: batches.length === 1 ? batches[0].batch_number : '',
        unit_price: product.mrp || product.sale_price || 0,
        tax_percent: product.gst_rate || 0
      };
      setManualItems(newItems);
    } catch (error) {
      const newItems = [...manualItems];
      newItems[index] = {
        ...newItems[index],
        product_id: product.product_id,
        product_name: product.product_name,
        batches: [],
        unit_price: product.mrp || product.sale_price || 0,
        tax_percent: product.gst_rate || 0
      };
      setManualItems(newItems);
    }
  };

  const handleBatchSelect = (batchId, index) => {
    const newItems = [...manualItems];
    const batch = newItems[index].batches?.find(b => b.batch_id === batchId);
    if (batch) {
      newItems[index] = {
        ...newItems[index],
        batch_id: batch.batch_id,
        batch_number: batch.batch_number,
        expiry_date: batch.expiry_date
      };
    }
    setManualItems(newItems);
  };

  const handleFieldChange = (value, field, index) => {
    const newItems = [...manualItems];
    newItems[index][field] = value;
    setManualItems(newItems);
  };

  const validateItems = () => {
    const newErrors = {};
    let isValid = true;

    manualItems.forEach((item, index) => {
      if (!item.product_id) {
        newErrors[`product_${index}`] = 'Product is required';
        isValid = false;
      }
      if (!item.batch_id && item.batches?.length > 0) {
        newErrors[`batch_${index}`] = 'Batch selection is mandatory';
        isValid = false;
      }
      if (!item.return_quantity || item.return_quantity <= 0) {
        newErrors[`quantity_${index}`] = 'Valid quantity is required';
        isValid = false;
      }
      if (!item.disposition) {
        newErrors[`disposition_${index}`] = 'Disposition is required';
        isValid = false;
      }
    });

    setErrors(newErrors);
    return isValid;
  };

  const handleSave = () => {
    if (validateItems()) {
      onItemsChange(manualItems);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold">Manual Return Entry</h2>
          <p className="text-sm text-gray-600 mt-1">
            Add products for return without invoice reference
          </p>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {manualItems.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">No items added yet</p>
              <button
                onClick={handleAddItem}
                className="btn-primary"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add First Item
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {manualItems.map((item, index) => (
                <div key={item.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-medium">Item {index + 1}</h3>
                    <button
                      onClick={() => handleRemoveItem(index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-12 gap-4">
                    {/* Product Selection */}
                    <div className="col-span-4">
                      <label className="block text-sm font-medium mb-1">
                        Product *
                      </label>
                      <ProductSearchSimple
                        value={item.product_id ? { 
                          product_id: item.product_id, 
                          product_name: item.product_name 
                        } : null}
                        onChange={(product) => handleProductSelect(product, index)}
                        placeholder="Search product..."
                      />
                      {errors[`product_${index}`] && (
                        <p className="text-red-500 text-xs mt-1">{errors[`product_${index}`]}</p>
                      )}
                    </div>

                    {/* Batch Selection */}
                    <div className="col-span-3">
                      <label className="block text-sm font-medium mb-1">
                        Batch * {item.batches?.length > 0 && `(${item.batches.length} available)`}
                      </label>
                      <Select
                        value={item.batch_id}
                        onChange={(value) => handleBatchSelect(value, index)}
                        options={item.batches?.map(b => ({
                          value: b.batch_id,
                          label: `${b.batch_number} (Exp: ${b.expiry_date || 'N/A'})`
                        })) || []}
                        placeholder="Select batch..."
                        disabled={!item.product_id || !item.batches?.length}
                      />
                      {errors[`batch_${index}`] && (
                        <p className="text-red-500 text-xs mt-1">{errors[`batch_${index}`]}</p>
                      )}
                    </div>

                    {/* Quantity */}
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1">
                        Return Qty *
                      </label>
                      <NumberInput
                        value={item.return_quantity}
                        onChange={(value) => handleFieldChange(value, 'return_quantity', index)}
                        min={0.01}
                        step={1}
                        placeholder="0"
                      />
                      {errors[`quantity_${index}`] && (
                        <p className="text-red-500 text-xs mt-1">{errors[`quantity_${index}`]}</p>
                      )}
                    </div>

                    {/* Disposition */}
                    <div className="col-span-3">
                      <label className="block text-sm font-medium mb-1">
                        Disposition *
                      </label>
                      <Select
                        value={item.disposition}
                        onChange={(value) => handleFieldChange(value, 'disposition', index)}
                        options={DISPOSITION_OPTIONS}
                        placeholder="Select..."
                      />
                      {errors[`disposition_${index}`] && (
                        <p className="text-red-500 text-xs mt-1">{errors[`disposition_${index}`]}</p>
                      )}
                    </div>

                    {/* Reason */}
                    <div className="col-span-12">
                      <label className="block text-sm font-medium mb-1">
                        Return Reason
                      </label>
                      <input
                        type="text"
                        value={item.reason || ''}
                        onChange={(e) => handleFieldChange(e.target.value, 'reason', index)}
                        className="input-field w-full"
                        placeholder="Optional: Specific reason for this item"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <button
                onClick={handleAddItem}
                className="btn-secondary w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Another Item
              </button>
            </div>
          )}

          {/* Enterprise Compliance Notice */}
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 mr-2 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-yellow-800">Enterprise Compliance Requirements:</p>
                <ul className="mt-1 text-yellow-700 list-disc list-inside">
                  <li><strong>Batch selection is MANDATORY</strong> - Required by FDA 21 CFR Part 211 for pharmaceutical traceability</li>
                  <li><strong>Default Quarantine</strong> - All manual returns quarantined pending physical verification</li>
                  <li><strong>Manager Approval Required</strong> - Returns without invoice need authorization</li>
                  <li><strong>Physical Verification</strong> - Match batch number on product with selected batch</li>
                  <li><strong>Disposition Tracking</strong> - Each item's fate must be documented for audit</li>
                </ul>
                <p className="mt-2 text-yellow-800 font-medium">
                  Why Batch Tracking? Enables product recalls, expiry management, and regulatory compliance
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="btn-primary"
            disabled={manualItems.length === 0}
          >
            Save Items ({manualItems.length})
          </button>
        </div>
      </div>
    </div>
  );
}