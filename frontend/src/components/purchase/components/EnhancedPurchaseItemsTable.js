import React, { useState, useRef, useEffect } from 'react';
import { Trash2, Package, Calendar, Info, AlertCircle, Edit2 } from 'lucide-react';
import { MonthYearPicker } from '../../global';
import { formatCurrency } from '../../../utils/formatters';
import PurchaseItemEditModal from './PurchaseItemEditModal';

/**
 * Enhanced Purchase Items Table with better spacing and modern input design
 */
const EnhancedPurchaseItemsTable = ({ 
  items = [], 
  onUpdateItem,
  onRemoveItem,
  readOnly = false,
  className = ''
}) => {
  
  const [focusedField, setFocusedField] = useState(null);
  const [openDatePicker, setOpenDatePicker] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const tableRef = useRef(null);

  const formatDate = (date) => {
    if (!date) return '';
    // Handle if date is already a string in MM/YYYY format
    if (typeof date === 'string' && date.includes('/')) {
      return date;
    }
    // Convert Date object to MM/YYYY format
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return '';
      return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
    } catch (e) {
      return '';
    }
  };

  // Calculate line total with proper tax calculation
  const calculateLineTotal = (item) => {
    const qty = parseFloat(item.quantity || 0);
    const cost = parseFloat(item.purchase_price || item.cost_price || item.rate || 0);
    const taxPercent = parseFloat(item.tax_percent || 0);
    
    const baseAmount = qty * cost;
    const taxAmount = baseAmount * (taxPercent / 100);
    
    return baseAmount + taxAmount;
  };

  // Close date picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (tableRef.current && !tableRef.current.contains(event.target)) {
        setOpenDatePicker(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle opening edit modal
  const handleEditItem = (item, index) => {
    setEditingItem(item);
    setEditingIndex(index);
    setEditModalOpen(true);
  };

  // Handle saving edited item
  const handleSaveEditedItem = (editedItem) => {
    if (editingIndex !== null) {
      // Update all fields of the item
      Object.keys(editedItem).forEach(key => {
        if (key !== 'product_name' && key !== 'hsn_code') {
          onUpdateItem(editingIndex, key, editedItem[key]);
        }
      });
    }
    setEditModalOpen(false);
    setEditingItem(null);
    setEditingIndex(null);
  };

  // Remove the complex InputField component - not needed

  const SelectField = ({ value, onChange, options, width = 'w-full', disabled = false }) => {
    const isEditable = !readOnly && !disabled;
    
    return (
      <div className={`relative ${width}`}>
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={!isEditable}
          className={`
            w-full px-3 py-2 text-sm rounded-lg transition-all duration-200
            ${isEditable 
              ? 'border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 cursor-pointer'
              : 'bg-gray-100 text-gray-600 cursor-not-allowed border border-transparent'
            }
            appearance-none text-center
          `}
          style={{
            backgroundImage: isEditable ? `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")` : 'none',
            backgroundPosition: 'right 0.5rem center',
            backgroundRepeat: 'no-repeat',
            backgroundSize: '1.5em 1.5em',
            paddingRight: isEditable ? '2rem' : '0.5rem'
          }}
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <>
    <div ref={tableRef} className={`bg-white rounded-xl shadow-sm border border-gray-200 ${className}`}>
      {/* Table */}
      <div className="overflow-x-auto" style={{ overflowY: 'visible', position: 'relative' }}>
        <table className="w-full">
          <thead>
            <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
              <th className="px-4 py-3 text-left" style={{ width: '22%' }}>
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Product</span>
              </th>
              <th className="px-3 py-3 text-center" style={{ width: '10%' }}>
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Pack Type</span>
              </th>
              <th className="px-3 py-3 text-center" style={{ width: '12%' }}>
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Pack Config</span>
              </th>
              <th className="px-3 py-3 text-center" style={{ width: '11%' }}>
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Expiry</span>
              </th>
              <th className="px-3 py-3 text-center" style={{ width: '8%' }}>
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Qty</span>
              </th>
              <th className="px-3 py-3 text-right" style={{ width: '9%' }}>
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">MRP</span>
              </th>
              <th className="px-3 py-3 text-right" style={{ width: '9%' }}>
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Cost</span>
              </th>
              <th className="px-3 py-3 text-right" style={{ width: '9%' }}>
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Rate</span>
              </th>
              <th className="px-3 py-3 text-center" style={{ width: '8%' }}>
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">GST%</span>
              </th>
              {!readOnly && (
                <th className="px-3 py-3 text-center" style={{ width: '8%' }}>
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={readOnly ? 9 : 10} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center">
                    <Package className="w-12 h-12 text-gray-300 mb-3" />
                    <p className="text-gray-500 text-sm">No items added</p>
                    <p className="text-gray-400 text-xs mt-1">Add products to start building your purchase entry</p>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item, index) => {
                const isExpiryNear = item.expiry_date && new Date(item.expiry_date) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
                
                return (
                  <tr key={index} className="hover:bg-gray-50 transition-colors">
                    {/* Product Name & HSN */}
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-gray-900" title={item.product_name}>
                          {item.product_name}
                        </p>
                        {item.hsn_code && (
                          <p className="text-xs text-gray-500">HSN: {item.hsn_code}</p>
                        )}
                      </div>
                    </td>

                    {/* Pack Type */}
                    <td className="px-3 py-3">
                      <SelectField
                        value={item.pack_type || 'STRIP'}
                        onChange={(value) => onUpdateItem(index, 'pack_type', value)}
                        options={[
                          { value: 'STRIP', label: 'STRIP' },
                          { value: 'BOTTLE', label: 'BOTTLE' },
                          { value: 'VIAL', label: 'VIAL' },
                          { value: 'TUBE', label: 'TUBE' },
                          { value: 'SACHET', label: 'SACHET' },
                          { value: 'POUCH', label: 'POUCH' },
                          { value: 'BOX', label: 'BOX' }
                        ]}
                        width="w-full"
                      />
                    </td>

                    {/* Pack Configuration */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={item.pack_size || item.units_per_pack || ''}
                          onChange={(e) => onUpdateItem(index, 'pack_size', e.target.value)}
                          className="w-12 px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center"
                          placeholder="1"
                          min="1"
                        />
                        <span className="text-gray-400 text-xs">×</span>
                        <input
                          type="number"
                          value={item.strips_per_box || item.packages_per_box || ''}
                          onChange={(e) => onUpdateItem(index, 'strips_per_box', e.target.value)}
                          className="w-12 px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center"
                          placeholder="1"
                          min="1"
                        />
                      </div>
                    </td>

                    {/* Expiry Date */}
                    <td className="px-3 py-3">
                      <input
                        type="text"
                        value={item.expiry_date ? (typeof item.expiry_date === 'string' ? item.expiry_date : formatDate(item.expiry_date)) : ''}
                        onChange={(e) => onUpdateItem(index, 'expiry_date', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center"
                        placeholder="MM/YYYY"
                        maxLength="7"
                      />
                    </td>

                    {/* Quantity */}
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        value={item.quantity || ''}
                        onChange={(e) => onUpdateItem(index, 'quantity', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center"
                        placeholder="1"
                        min="1"
                      />
                    </td>

                    {/* MRP */}
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        value={item.mrp || ''}
                        onChange={(e) => onUpdateItem(index, 'mrp', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right"
                        placeholder="0"
                        min="0"
                        step="0.01"
                      />
                    </td>

                    {/* Cost Price */}
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        value={item.purchase_price || item.cost_price || item.rate || ''}
                        onChange={(e) => onUpdateItem(index, 'purchase_price', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right"
                        placeholder="0"
                        min="0"
                        step="0.01"
                      />
                    </td>

                    {/* Selling Price */}
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        value={item.selling_price || item.sale_price || ''}
                        onChange={(e) => onUpdateItem(index, 'selling_price', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right"
                        placeholder="0"
                        min="0"
                        step="0.01"
                      />
                    </td>

                    {/* Tax Percent */}
                    <td className="px-3 py-3">
                      <SelectField
                        value={item.tax_percent || 0}
                        onChange={(value) => onUpdateItem(index, 'tax_percent', value)}
                        options={[
                          { value: '0', label: '0%' },
                          { value: '5', label: '5%' },
                          { value: '12', label: '12%' },
                          { value: '18', label: '18%' },
                          { value: '28', label: '28%' }
                        ]}
                        width="w-full"
                      />
                    </td>

                    {/* Actions */}
                    {!readOnly && (
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleEditItem(item, index)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit all details"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onRemoveItem(index)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remove item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>

    {/* Edit Modal */}
    <PurchaseItemEditModal
      isOpen={editModalOpen}
      onClose={() => {
        setEditModalOpen(false);
        setEditingItem(null);
        setEditingIndex(null);
      }}
      item={editingItem}
      onSave={handleSaveEditedItem}
      title="Edit Purchase Item Details"
    />
    </>
  );
};

export default EnhancedPurchaseItemsTable;