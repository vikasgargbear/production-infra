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
    const discountPercent = parseFloat(item.discount_percent || 0);
    const taxPercent = parseFloat(item.tax_percent || 0);
    
    const baseAmount = qty * cost;
    const discountAmount = baseAmount * (discountPercent / 100);
    const discountedAmount = baseAmount - discountAmount;
    const taxAmount = discountedAmount * (taxPercent / 100);
    
    return discountedAmount + taxAmount;
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

  const InputField = ({ value, onChange, type = 'text', placeholder, width = 'w-full', align = 'left', min, max, step, disabled = false }) => {
    const isEditable = !readOnly && !disabled;
    const isFocused = focusedField === `${type}-${value}`;
    
    return (
      <div className={`relative ${width}`}>
        <input
          type={type}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocusedField(`${type}-${value}`)}
          onBlur={() => setFocusedField(null)}
          disabled={!isEditable}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          className={`
            w-full px-2 py-1.5 text-sm rounded-md transition-all duration-200
            ${align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'}
            ${isEditable 
              ? isFocused
                ? 'bg-blue-50 border-2 border-blue-500 ring-2 ring-blue-200 outline-none'
                : 'bg-white border border-gray-300 hover:border-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'
              : 'bg-gray-50 border border-gray-200 text-gray-600 cursor-not-allowed'
            }
            ${type === 'number' ? '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none' : ''}
          `}
        />
        {isEditable && !isFocused && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-0 hover:opacity-30 transition-opacity"></div>
          </div>
        )}
      </div>
    );
  };

  const SelectField = ({ value, onChange, options, width = 'w-full', disabled = false }) => {
    const isEditable = !readOnly && !disabled;
    
    return (
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={!isEditable}
        className={`
          ${width} px-2 py-1.5 text-sm rounded-md transition-all duration-200
          ${isEditable 
            ? 'bg-white border border-gray-300 hover:border-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'
            : 'bg-gray-50 border border-gray-200 text-gray-600 cursor-not-allowed'
          }
        `}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
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
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Product</span>
                  <span className="text-[10px] text-gray-500 font-normal">Name & HSN</span>
                </div>
              </th>
              <th className="px-3 py-3 text-center">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Batch</span>
                  <span className="text-[10px] text-gray-500 font-normal">Number</span>
                </div>
              </th>
              <th className="px-3 py-3 text-center">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Pack</span>
                  <span className="text-[10px] text-gray-500 font-normal">Type</span>
                </div>
              </th>
              <th className="px-3 py-3 text-center">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Pack Type</span>
                  <span className="text-[10px] text-gray-500 font-normal">Config</span>
                </div>
              </th>
              <th className="px-3 py-3 text-center">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Expiry</span>
                  <span className="text-[10px] text-gray-500 font-normal">MM/YYYY</span>
                </div>
              </th>
              <th className="px-3 py-3 text-center">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Qty</span>
                  <span className="text-[10px] text-gray-500 font-normal">Purchase</span>
                </div>
              </th>
              <th className="px-3 py-3 text-center">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Free</span>
                  <span className="text-[10px] text-gray-500 font-normal">Bonus</span>
                </div>
              </th>
              <th className="px-3 py-3 text-right">
                <div className="flex flex-col items-end">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">MRP</span>
                  <span className="text-[10px] text-gray-500 font-normal">Max Price</span>
                </div>
              </th>
              <th className="px-3 py-3 text-right">
                <div className="flex flex-col items-end">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Cost</span>
                  <span className="text-[10px] text-gray-500 font-normal">Purchase</span>
                </div>
              </th>
              <th className="px-3 py-3 text-right">
                <div className="flex flex-col items-end">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Rate</span>
                  <span className="text-[10px] text-gray-500 font-normal">Selling</span>
                </div>
              </th>
              <th className="px-3 py-3 text-center">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Disc%</span>
                  <span className="text-[10px] text-gray-500 font-normal">Discount</span>
                </div>
              </th>
              <th className="px-3 py-3 text-center">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Tax%</span>
                  <span className="text-[10px] text-gray-500 font-normal">GST</span>
                </div>
              </th>
              <th className="px-3 py-3 text-right">
                <div className="flex flex-col items-end">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Total</span>
                  <span className="text-[10px] text-gray-500 font-normal">Amount</span>
                </div>
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
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-gray-900">{item.product_name}</p>
                        {item.hsn_code && (
                          <p className="text-xs text-gray-500">HSN: {item.hsn_code}</p>
                        )}
                      </div>
                    </td>

                    {/* Batch Number */}
                    <td className="px-3 py-3">
                      <InputField
                        value={item.batch_no || item.batch_number}
                        onChange={(value) => onUpdateItem(index, 'batch_no', value)}
                        placeholder="Batch"
                        width="w-24"
                        align="center"
                      />
                    </td>

                    {/* Pack Type */}
                    <td className="px-3 py-3">
                      <SelectField
                        value={item.pack_type || 'STRIP'}
                        onChange={(value) => onUpdateItem(index, 'pack_type', value)}
                        options={[
                          { value: 'STRIP', label: 'STRIP' },
                          { value: 'BOX', label: 'BOX' },
                          { value: 'BOTTLE', label: 'BTL' },
                          { value: 'VIAL', label: 'VIAL' },
                          { value: 'TUBE', label: 'TUBE' }
                        ]}
                        width="w-20"
                      />
                    </td>

                    {/* Pack Configuration */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <InputField
                          type="number"
                          value={item.pack_size || 10}
                          onChange={(value) => onUpdateItem(index, 'pack_size', parseInt(value) || 1)}
                          width="w-10"
                          align="center"
                          min="1"
                          placeholder="U"
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
                        />
                      </div>
                    </td>

                    {/* Expiry Date with Enhanced Picker */}
                    <td className="px-3 py-3 relative">
                      <div className="relative" style={{ zIndex: openDatePicker === index ? 9999 : 1 }}>
                        <div 
                          onClick={() => setOpenDatePicker(openDatePicker === index ? null : index)}
                          className={`
                            px-2 py-1.5 text-sm rounded-md cursor-pointer transition-all
                            ${isExpiryNear ? 'bg-amber-50 border border-amber-300 text-amber-700' : 'bg-white border border-gray-300'}
                            hover:border-gray-400 flex items-center justify-center gap-1
                          `}
                        >
                          <Calendar className="w-3 h-3" />
                          <span className="text-xs">{item.expiry_date ? formatDate(item.expiry_date) : 'Select'}</span>
                        </div>
                        
                        {/* Enhanced Date Picker Dropdown */}
                        {openDatePicker === index && (
                          <div 
                            className="absolute top-full mt-1 left-1/2 transform -translate-x-1/2 z-[9999]"
                            style={{ 
                              position: 'absolute',
                              zIndex: 99999
                            }}
                          >
                            <div className="bg-white rounded-lg shadow-2xl border border-gray-200 p-2">
                              <MonthYearPicker
                                value={item.expiry_date}
                                onChange={(value) => {
                                  onUpdateItem(index, 'expiry_date', value);
                                  setOpenDatePicker(null);
                                }}
                                width="w-32"
                                className="text-xs"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      {isExpiryNear && (
                        <div className="absolute -bottom-5 left-0 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-amber-500" />
                          <span className="text-[10px] text-amber-600">Expires soon</span>
                        </div>
                      )}
                    </td>

                    {/* Quantity */}
                    <td className="px-3 py-3">
                      <InputField
                        type="number"
                        value={item.quantity}
                        onChange={(value) => onUpdateItem(index, 'quantity', value)}
                        width="w-16"
                        align="center"
                        min="1"
                        placeholder="0"
                      />
                    </td>

                    {/* Free Quantity */}
                    <td className="px-3 py-3">
                      <InputField
                        type="number"
                        value={item.free_quantity || item.free}
                        onChange={(value) => onUpdateItem(index, 'free_quantity', value)}
                        width="w-14"
                        align="center"
                        min="0"
                        placeholder="0"
                      />
                    </td>

                    {/* MRP */}
                    <td className="px-3 py-3">
                      <InputField
                        type="number"
                        value={item.mrp}
                        onChange={(value) => onUpdateItem(index, 'mrp', value)}
                        width="w-20"
                        align="right"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                      />
                    </td>

                    {/* Cost Price */}
                    <td className="px-3 py-3">
                      <InputField
                        type="number"
                        value={item.purchase_price || item.cost_price || item.rate}
                        onChange={(value) => onUpdateItem(index, 'purchase_price', value)}
                        width="w-20"
                        align="right"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                      />
                    </td>

                    {/* Selling Price (Rate) */}
                    <td className="px-3 py-3">
                      <InputField
                        type="number"
                        value={item.selling_price || item.ptr}
                        onChange={(value) => onUpdateItem(index, 'selling_price', value)}
                        width="w-20"
                        align="right"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                      />
                    </td>

                    {/* Discount % */}
                    <td className="px-3 py-3">
                      <InputField
                        type="number"
                        value={item.discount_percent}
                        onChange={(value) => onUpdateItem(index, 'discount_percent', value)}
                        width="w-14"
                        align="center"
                        min="0"
                        max="100"
                        step="0.1"
                        placeholder="0"
                      />
                    </td>

                    {/* Tax % */}
                    <td className="px-3 py-3">
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
                        width="w-16"
                      />
                    </td>

                    {/* Total */}
                    <td className="px-3 py-3 text-right">
                      <div className="text-sm font-semibold text-green-600">
                        {formatCurrency(lineTotal)}
                      </div>
                    </td>

                    {/* Actions */}
                    {!readOnly && (
                      <td className="px-3 py-3 text-center">
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

      {/* Summary Section */}
      {items.length > 0 && (
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-600">
                Total Items: <span className="font-semibold text-gray-900">{items.length}</span>
              </span>
              <span className="text-gray-600">
                Total Qty: <span className="font-semibold text-gray-900">
                  {items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0)}
                </span>
              </span>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Total Amount</p>
              <p className="text-xl font-bold text-green-600">
                {formatCurrency(items.reduce((sum, item) => sum + calculateLineTotal(item), 0))}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Helper Text */}
      <div className="px-6 py-3 bg-blue-50 border-t border-blue-100">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 mt-0.5" />
          <div className="text-xs text-blue-700">
            <p className="font-medium mb-1">Quick Tips:</p>
            <ul className="space-y-0.5 text-blue-600">
              <li>• White fields are editable, gray fields are read-only or calculated</li>
              <li>• Click on date field to select expiry month/year</li>
              <li>• Pack config: First number is units per pack, second is packs per box</li>
              <li>• Total is calculated as: (Qty × Cost) - Discount% + Tax%</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnhancedPurchaseItemsTable;