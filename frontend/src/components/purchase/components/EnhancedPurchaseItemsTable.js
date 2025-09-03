import React, { useState, useRef, useEffect } from 'react';
import { Trash2, Package, Calendar, Info, AlertCircle } from 'lucide-react';
import { MonthYearPicker } from '../../global';

/**
 * Enhanced Purchase Items Table with better spacing and clear input fields
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
  const tableRef = useRef(null);

  const formatCurrency = (amount) => {
    return `₹${(parseFloat(amount) || 0).toFixed(2)}`;
  };

  const formatDate = (date) => {
    if (!date) return '-';
    const d = new Date(date);
    return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
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

  const InputField = ({ value, onChange, type = 'text', placeholder, width = 'w-full', align = 'left', min, max, step, disabled = false, fieldId }) => {
    const isEditable = !readOnly && !disabled;
    const uniqueId = fieldId || `${type}-${Math.random()}`;
    const isFocused = focusedField === uniqueId;
    
    return (
      <div className={`relative ${width}`}>
        <div className={`
          relative rounded-lg transition-all duration-200
          ${isEditable ? 'bg-white shadow-sm border-2 border-blue-200 hover:border-blue-400' : 'bg-gray-100'}
        `}>
          <input
            type={type}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocusedField(uniqueId)}
            onBlur={() => setFocusedField(null)}
            onKeyDown={(e) => {
              // Prevent keyboard events from triggering navigation
              if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                e.stopPropagation();
              }
            }}
            disabled={!isEditable}
            placeholder={placeholder}
            min={min}
            max={max}
            step={step}
            className={`
              w-full px-1 py-1 text-xs rounded-md transition-all duration-200 bg-transparent
              ${align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'}
              ${isEditable 
                ? isFocused
                  ? 'ring-2 ring-blue-400 outline-none font-semibold'
                  : 'outline-none hover:font-medium'
                : 'text-gray-600 cursor-not-allowed'
              }
              ${type === 'number' ? '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none' : ''}
            `}
            onClick={(e) => {
              if (type === 'number' && isEditable) {
                e.target.select();
              }
            }}
          />
        </div>
      </div>
    );
  };

  const SelectField = ({ value, onChange, options, width = 'w-full', disabled = false }) => {
    const isEditable = !readOnly && !disabled;
    
    return (
      <div className={`relative ${width}`}>
        <div className={`
          rounded-lg transition-all duration-200
          ${isEditable ? 'bg-white shadow-sm border-2 border-blue-200 hover:border-blue-400' : 'bg-gray-100'}
        `}>
          <select
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              // Prevent keyboard events from triggering navigation
              if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                e.stopPropagation();
              }
            }}
            disabled={!isEditable}
            className={`
              w-full px-2 py-1.5 text-sm rounded-md transition-all duration-200 bg-transparent
              ${isEditable 
                ? 'outline-none cursor-pointer hover:font-medium'
                : 'text-gray-600 cursor-not-allowed'
              }
            `}
          >
            {options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  return (
    <div ref={tableRef} className={`bg-white rounded-xl shadow-sm border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-center gap-3">
          <Package className="w-5 h-5 text-indigo-600" />
          <h3 className="text-base font-semibold text-gray-800">PURCHASE ITEMS</h3>
          <span className="ml-auto text-sm text-gray-500">{items.length} items</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto overflow-y-visible relative" style={{ maxHeight: '500px' }}>
        <table className="w-full table-fixed">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2 text-left" style={{ width: '20%' }}>
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Product</span>
              </th>
              <th className="px-3 py-2 text-center" style={{ width: '10%' }}>
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Batch</span>
              </th>
              <th className="px-2 py-2 text-center" style={{ width: '8%' }}>
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Pack</span>
              </th>
              <th className="px-2 py-2 text-center" style={{ width: '10%' }}>
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Config</span>
              </th>
              <th className="px-3 py-2 text-center" style={{ width: '10%' }}>
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Expiry</span>
              </th>
              <th className="px-2 py-2 text-center" style={{ width: '6%' }}>
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Qty</span>
              </th>
              <th className="px-3 py-2 text-right" style={{ width: '8%' }}>
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">MRP</span>
              </th>
              <th className="px-3 py-2 text-right" style={{ width: '8%' }}>
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Cost</span>
              </th>
              <th className="px-3 py-2 text-right" style={{ width: '8%' }}>
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Rate</span>
              </th>
              <th className="px-2 py-2 text-center" style={{ width: '6%' }}>
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Tax%</span>
              </th>
              <th className="px-3 py-2 text-right" style={{ width: '10%' }}>
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Total</span>
              </th>
              {!readOnly && (
                <th className="px-3 py-3 text-center">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Action</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={readOnly ? 13 : 14} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center">
                    <Package className="w-12 h-12 text-gray-300 mb-3" />
                    <p className="text-gray-500 text-sm">No items added</p>
                    <p className="text-gray-400 text-xs mt-1">Add products to start building your purchase entry</p>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item, index) => {
                const lineTotal = calculateLineTotal(item);
                const isExpiryNear = item.expiry_date && new Date(item.expiry_date) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
                
                return (
                  <tr key={index} className="hover:bg-gray-50 transition-colors">
                    {/* Product Name & HSN */}
                    <td className="px-3 py-2" style={{ width: '20%' }}>
                      <div className="space-y-0.5">
                        <p className="text-xs font-medium text-gray-900 truncate" title={item.product_name}>
                          {item.product_name}
                        </p>
                        {item.hsn_code && (
                          <p className="text-[10px] text-gray-500">HSN: {item.hsn_code}</p>
                        )}
                      </div>
                    </td>

                    {/* Batch Number */}
                    <td className="px-3 py-2" style={{ width: '10%' }}>
                      <InputField
                        value={item.batch_no || item.batch_number}
                        onChange={(value) => onUpdateItem(index, 'batch_no', value)}
                        placeholder="Batch"
                        width="w-full"
                        align="center"
                        fieldId={`batch-${index}`}
                      />
                    </td>

                    {/* Pack Type */}
                    <td className="px-2 py-2" style={{ width: '8%' }}>
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
                          { value: 'JAR', label: 'JAR' },
                          { value: 'BOX', label: 'BOX' },
                          { value: 'PACK', label: 'PACK' },
                          { value: 'UNIT', label: 'UNIT' }
                        ]}
                        width="w-full"
                      />
                    </td>

                    {/* Pack Configuration */}
                    <td className="px-2 py-2" style={{ width: '10%' }}>
                      <div className="flex items-center gap-0.5">
                        <InputField
                          type="number"
                          value={item.pack_size || 10}
                          onChange={(value) => onUpdateItem(index, 'pack_size', parseInt(value) || 1)}
                          width="w-10"
                          align="center"
                          min="1"
                          placeholder="U"
                          fieldId={`pack-size-${index}`}
                        />
                        <span className="text-xs text-gray-400">×</span>
                        <InputField
                          type="number"
                          value={item.strips_per_box || 10}
                          onChange={(value) => onUpdateItem(index, 'strips_per_box', parseInt(value) || 1)}
                          width="w-10"
                          align="center"
                          min="1"
                          placeholder="P"
                          fieldId={`strips-per-box-${index}`}
                        />
                      </div>
                    </td>

                    {/* Expiry Date - Fixed Positioning */}
                    <td className="px-3 py-2" style={{ width: '10%' }}>
                      <div className="relative z-50">
                        <div className="relative">
                          <MonthYearPicker
                            value={item.expiry_date}
                            onChange={(value) => onUpdateItem(index, 'expiry_date', value)}
                            width="w-full"
                            className={`text-xs relative z-[100] ${isExpiryNear ? 'border-amber-300 bg-amber-50' : ''}`}
                            style={{ position: 'relative', zIndex: openDatePicker === index ? 9999 : 1 }}
                          />
                        </div>
                        {isExpiryNear && (
                          <div className="absolute -bottom-4 left-0 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-amber-500" />
                            <span className="text-[10px] text-amber-600">Soon</span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Quantity */}
                    <td className="px-2 py-2" style={{ width: '6%' }}>
                      <InputField
                        type="number"
                        value={item.quantity}
                        onChange={(value) => onUpdateItem(index, 'quantity', value)}
                        width="w-full"
                        align="center"
                        min="1"
                        placeholder="0"
                        fieldId={`qty-${index}`}
                      />
                    </td>

                    {/* MRP */}
                    <td className="px-3 py-2" style={{ width: '8%' }}>
                      <InputField
                        type="number"
                        value={item.mrp}
                        onChange={(value) => onUpdateItem(index, 'mrp', value)}
                        width="w-full"
                        align="right"
                        min="0"
                        step="0.01"
                        placeholder="0"
                        fieldId={`mrp-${index}`}
                      />
                    </td>

                    {/* Cost Price */}
                    <td className="px-3 py-2" style={{ width: '8%' }}>
                      <InputField
                        type="number"
                        value={item.purchase_price || item.cost_price || item.rate}
                        onChange={(value) => onUpdateItem(index, 'purchase_price', value)}
                        width="w-full"
                        align="right"
                        min="0"
                        step="0.01"
                        placeholder="0"
                        fieldId={`cost-${index}`}
                      />
                    </td>

                    {/* Selling Price (Rate) */}
                    <td className="px-3 py-2" style={{ width: '8%' }}>
                      <InputField
                        type="number"
                        value={item.selling_price || item.ptr}
                        onChange={(value) => onUpdateItem(index, 'selling_price', value)}
                        width="w-full"
                        align="right"
                        min="0"
                        step="0.01"
                        placeholder="0"
                        fieldId={`rate-${index}`}
                      />
                    </td>

                    {/* Tax % */}
                    <td className="px-2 py-2" style={{ width: '6%' }}>
                      <SelectField
                        value={item.tax_percent || 12}
                        onChange={(value) => onUpdateItem(index, 'tax_percent', value)}
                        options={[
                          { value: 0, label: '0%' },
                          { value: 5, label: '5%' },
                          { value: 12, label: '12%' },
                          { value: 18, label: '18%' },
                          { value: 28, label: '28%' }
                        ]}
                        width="w-full"
                      />
                    </td>

                    {/* Total */}
                    <td className="px-3 py-2 text-right" style={{ width: '10%' }}>
                      <div className="text-sm font-semibold text-green-600">
                        {formatCurrency(lineTotal)}
                      </div>
                    </td>

                    {/* Actions */}
                    {!readOnly && (
                      <td className="px-2 py-2 text-center">
                        <button
                          onClick={() => onRemoveItem(index)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
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
  );
};

export default EnhancedPurchaseItemsTable;