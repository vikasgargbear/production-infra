import React, { useState, useEffect } from 'react';
import {
  Plus, Minus, Save, X, AlertCircle, 
  Package, TrendingUp, TrendingDown,
  ChevronRight, Trash2, Upload, Download, FileText
} from 'lucide-react';
import { stockApi, productsApi } from '../../services/api';
import { formatCurrency } from '../../utils/formatters';
import { DataTable, ProductSearchSimple, Select, DatePicker, StatusBadge } from '../global';

const StockAdjustment = ({ open = true, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1: Input, 2: Review
  const [adjustmentType, setAdjustmentType] = useState('');
  const [reason, setReason] = useState('');
  const [adjustmentDate, setAdjustmentDate] = useState(new Date());
  const [notes, setNotes] = useState('');
  const [adjustmentItems, setAdjustmentItems] = useState([]);
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkFile, setBulkFile] = useState(null);
  
  // Auto-open product search when both adjustment type and reason are selected
  useEffect(() => {
    if (adjustmentType && reason && !adjustmentItems.length && !showBulkUpload) {
      setShowProductSearch(true);
    }
  }, [adjustmentType, reason, adjustmentItems.length, showBulkUpload]);

  const adjustmentReasons = {
    increase: [
      { value: 'physical_count', label: 'Physical Count Correction' },
      { value: 'found_stock', label: 'Found Missing Stock' },
      { value: 'return_from_customer', label: 'Customer Return' },
      { value: 'other_increase', label: 'Other Increase' }
    ],
    decrease: [
      { value: 'damage', label: 'Damaged Goods' },
      { value: 'expiry', label: 'Expired Products' },
      { value: 'theft', label: 'Theft/Loss' },
      { value: 'sample', label: 'Sample Given' },
      { value: 'other_decrease', label: 'Other Decrease' }
    ]
  };

  const handleProductSelect = async (product) => {
    if (!product) return;
    
    try {
      // Get current stock info
      const stockResponse = await stockApi.getCurrentStock({ 
        product_id: product.product_id || product.id,
        include_batches: false 
      });
      const stockData = stockResponse.data?.[0] || {};
      
      // Check if product already added
      if (adjustmentItems.find(item => item.product_id === (product.product_id || product.id))) {
        alert('Product already added');
        return;
      }
      
      const newItem = {
        id: Date.now(),
        product_id: product.product_id || product.id,
        product_name: product.product_name || product.name,
        product_code: product.product_code || product.code,
        current_stock: stockData.current_stock || 0,
        adjustment_quantity: 1,
        unit: product.unit || 'Units',
        after_adjustment: adjustmentType === 'increase' 
          ? (stockData.current_stock || 0) + 1
          : Math.max(0, (stockData.current_stock || 0) - 1)
      };
      
      setAdjustmentItems([...adjustmentItems, newItem]);
      setShowProductSearch(false);
    } catch (error) {
      console.error('Error adding product:', error);
      alert('Failed to get stock information');
    }
  };
  
  const updateItemQuantity = (itemId, quantity) => {
    const qty = parseInt(quantity) || 0;
    if (qty < 0) return;
    
    setAdjustmentItems(items => items.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          adjustment_quantity: qty,
          after_adjustment: adjustmentType === 'increase' 
            ? item.current_stock + qty
            : Math.max(0, item.current_stock - qty)
        };
      }
      return item;
    }));
  };

  const handleRemoveItem = (itemId) => {
    setAdjustmentItems(items => items.filter(item => item.id !== itemId));
  };

  const handleSubmit = async () => {
    if (adjustmentItems.length === 0) {
      alert('Please add at least one product');
      return;
    }

    setLoading(true);
    try {
      const adjustmentData = {
        adjustment_type: adjustmentType,
        reason: reason,
        notes: notes,
        adjustment_date: adjustmentDate.toISOString(),
        items: adjustmentItems.map(item => ({
          product_id: item.product_id,
          quantity: adjustmentType === 'decrease' ? -item.adjustment_quantity : item.adjustment_quantity,
          batch_number: null // Let backend handle batch selection
        }))
      };

      await stockApi.createAdjustment(adjustmentData);
      
      alert('Stock adjustment completed successfully');
      
      // Reset form
      setStep(1);
      setAdjustmentType('');
      setReason('');
      setNotes('');
      setAdjustmentItems([]);
      setAdjustmentDate(new Date());
      
    } catch (error) {
      console.error('Error creating adjustment:', error);
      alert('Failed to create stock adjustment');
    } finally {
      setLoading(false);
    }
  };

  const getTotalValue = () => {
    return adjustmentItems.reduce((sum, item) => sum + item.adjustment_quantity, 0);
  };

  const downloadTemplate = () => {
    const csvContent = `Product Code,Product Name,Adjustment Quantity,Reason,Notes
PARA500,Paracetamol 500mg,50,physical_count,Found extra stock during count
AMOX250,Amoxicillin 250mg,-10,damage,Water damage in storage
VITC100,Vitamin C Tablets,100,physical_count,Stock correction
COUGH100,Cough Syrup 100ml,-25,expiry,Expired products removed
Note: Use positive numbers for increase and negative for decrease. Reason codes: physical_count, found_stock, return_from_customer, damage, expiry, theft, sample, other_decrease`;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock_adjustment_template.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleBulkUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setBulkFile(file);
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        
        const newItems = [];
        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          
          const values = lines[i].split(',').map(v => v.trim());
          const productCode = values[0];
          const productName = values[1];
          const adjustmentQty = parseInt(values[2]) || 0;
          const reason = values[3] || 'physical_count';
          const itemNotes = values[4] || '';
          
          if (!productCode || adjustmentQty === 0) continue;
          
          // Get actual stock data from API
          let currentStock = 0;
          try {
            const stockResponse = await stockApi.getCurrentStock({ 
              product_code: productCode,
              include_batches: false 
            });
            currentStock = stockResponse.data?.[0]?.current_stock || 0;
          } catch (stockError) {
            console.warn(`Could not fetch stock for ${productCode}:`, stockError);
            currentStock = 0; // Default to 0 if can't fetch
          }
          
          const isIncrease = adjustmentQty > 0;
          newItems.push({
            id: Date.now() + i,
            product_code: productCode,
            product_name: productName,
            product_id: i, // In real implementation, would need to look up product ID
            current_stock: currentStock,
            adjustment_quantity: Math.abs(adjustmentQty),
            adjustment_type: isIncrease ? 'increase' : 'decrease',
            reason: reason,
            unit: 'Units',
            after_adjustment: isIncrease 
              ? currentStock + Math.abs(adjustmentQty)
              : Math.max(0, currentStock - Math.abs(adjustmentQty)),
            notes: itemNotes
          });
        }
        
        // Group items by adjustment type
        const increaseItems = newItems.filter(item => item.adjustment_type === 'increase');
        const decreaseItems = newItems.filter(item => item.adjustment_type === 'decrease');
        
        if (increaseItems.length > 0 && decreaseItems.length > 0) {
          alert(`Loaded ${newItems.length} items: ${increaseItems.length} increases and ${decreaseItems.length} decreases. Please process them separately.`);
          // For now, we'll process all as the first type found
          const firstType = newItems[0].adjustment_type;
          setAdjustmentType(firstType);
          setReason(newItems[0].reason || '');
          setAdjustmentItems(newItems.filter(item => item.adjustment_type === firstType));
        } else {
          // All items are same type
          const itemType = newItems[0].adjustment_type;
          setAdjustmentType(itemType);
          setReason(newItems[0].reason || '');
          setAdjustmentItems(newItems);
          alert(`Successfully loaded ${newItems.length} ${itemType} adjustments from CSV`);
        }
        
        setShowBulkUpload(false);
      } catch (error) {
        console.error('Error parsing CSV:', error);
        alert('Failed to parse CSV file. Please check the format.');
      }
    };
    
    reader.readAsText(file);
  };

  if (!open) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Stock Adjustment</h1>
              <p className="text-sm text-gray-600">Adjust inventory for corrections or losses</p>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={() => {
                  setShowBulkUpload(!showBulkUpload);
                  setShowProductSearch(false);
                }}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                <Upload className="w-4 h-4" />
                <span>Bulk Adjust</span>
              </button>
              
              {/* Step Indicator */}
              <div className="flex items-center space-x-2">
                <div className={`flex items-center px-3 py-1 rounded-full ${
                  step >= 1 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'
                }`}>
                  <span className="text-sm font-medium">1. Input</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
                <div className={`flex items-center px-3 py-1 rounded-full ${
                  step >= 2 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'
                }`}>
                  <span className="text-sm font-medium">2. Review</span>
                </div>
              </div>
              
              <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="px-4 sm:px-6 lg:px-8 py-8">
          
          {/* Step 1: Input */}
          {step === 1 && (
            <div className="space-y-6">
              {/* Type & Details Section */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Adjustment Details</h3>
                
                {/* Adjustment Type Selection */}
                <div className="flex items-center space-x-4 mb-6">
                  <button
                    onClick={() => setAdjustmentType('increase')}
                    className={`flex-1 flex items-center justify-center space-x-2 p-3 rounded-lg border-2 transition-all ${
                      adjustmentType === 'increase'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <TrendingUp className="w-5 h-5" />
                    <span className="font-medium">Increase Stock</span>
                  </button>

                  <button
                    onClick={() => setAdjustmentType('decrease')}
                    className={`flex-1 flex items-center justify-center space-x-2 p-3 rounded-lg border-2 transition-all ${
                      adjustmentType === 'decrease'
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <TrendingDown className="w-5 h-5" />
                    <span className="font-medium">Decrease Stock</span>
                  </button>
                </div>
                
                {/* Reason and Date Row */}
                {adjustmentType && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Reason for Adjustment
                      </label>
                      <Select
                        value={reason}
                        onChange={setReason}
                        options={[
                          { value: '', label: 'Select reason...' },
                          ...adjustmentReasons[adjustmentType].map(r => ({
                            value: r.value,
                            label: r.label
                          }))
                        ]}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Adjustment Date
                      </label>
                      <DatePicker
                        value={adjustmentDate}
                        onChange={setAdjustmentDate}
                        maxDate={new Date()}
                      />
                    </div>
                  </div>
                )}
              </div>
              
              {/* Bulk Upload Section */}
              {showBulkUpload && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-medium text-gray-900">Bulk Upload</h3>
                    <button
                      onClick={() => setShowBulkUpload(false)}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleBulkUpload}
                        className="hidden"
                        id="bulk-upload-top"
                      />
                      <label
                        htmlFor="bulk-upload-top"
                        className="cursor-pointer"
                      >
                        <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                        <p className="text-sm text-gray-600">
                          Drop CSV file here or <span className="text-blue-600 font-medium">browse</span>
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Supports both positive and negative adjustments
                        </p>
                      </label>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <button
                        onClick={downloadTemplate}
                        className="flex items-center space-x-2 text-blue-600 hover:text-blue-700"
                      >
                        <Download className="w-4 h-4" />
                        <span className="text-sm">Download Template</span>
                      </button>
                      
                      <div className="text-xs text-gray-500">
                        <span className="font-medium">Format:</span> Product Code, Name, Quantity (+/-), Reason, Notes
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Product Selection Section */}
              {adjustmentType && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900">Products to Adjust</h3>
                    <button
                        onClick={() => {
                          setShowProductSearch(true);
                          setShowBulkUpload(false);
                        }}
                        className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Product</span>
                      </button>
                  </div>
                  
                  {/* Product Search Modal */}
                  {showProductSearch && (
                    <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-gray-900">Search Product</h4>
                        <button
                          onClick={() => setShowProductSearch(false)}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <ProductSearchSimple
                        onAddItem={handleProductSelect}
                        showBatchSelection={false}
                        placeholder="Search and select product..."
                      />
                    </div>
                  )}
                  
                  {/* Selected Products Table */}
                  {adjustmentItems.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Current Stock</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Adjustment Qty</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">New Stock</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {adjustmentItems.map((item) => (
                            <tr key={item.id}>
                              <td className="px-4 py-3">
                                <div>
                                  <div className="font-medium text-gray-900">{item.product_name}</div>
                                  <div className="text-sm text-gray-500">{item.product_code}</div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">{item.current_stock}</td>
                              <td className="px-4 py-3 text-center">
                                <input
                                  type="number"
                                  value={item.adjustment_quantity}
                                  onChange={(e) => updateItemQuantity(item.id, e.target.value)}
                                  min="1"
                                  className="w-24 px-2 py-1 border border-gray-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`font-medium ${
                                  adjustmentType === 'increase' ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {item.after_adjustment}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={() => handleRemoveItem(item.id)}
                                  className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                      <p>No products added yet</p>
                      <p className="text-sm mt-1">Click "Add Product" to start</p>
                    </div>
                  )}
                </div>
              )}
              
              {/* Navigation */}
              {adjustmentItems.length > 0 && (adjustmentType && reason) && (
                <div className="flex justify-end">
                  <button
                    onClick={() => setStep(2)}
                    className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <span>Review Adjustment</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Review and Confirm */}
          {step === 2 && (
            <div className="space-y-6">
              {/* Warning Message */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Please Review Carefully</p>
                    <p className="text-sm text-amber-700 mt-1">
                      Stock adjustments cannot be reversed. Make sure all quantities and products are correct before confirming.
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Summary Card */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Adjustment Summary</h3>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div>
                    <p className="text-sm text-gray-600">Type</p>
                    <p className="font-medium flex items-center space-x-2">
                      {adjustmentType === 'increase' ? (
                        <>
                          <TrendingUp className="w-4 h-4 text-green-600" />
                          <span className="text-green-600">Stock Increase</span>
                        </>
                      ) : (
                        <>
                          <TrendingDown className="w-4 h-4 text-red-600" />
                          <span className="text-red-600">Stock Decrease</span>
                        </>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Reason</p>
                    <p className="font-medium">
                      {adjustmentReasons[adjustmentType].find(r => r.value === reason)?.label}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Date</p>
                    <p className="font-medium">{adjustmentDate.toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Items</p>
                    <p className="font-medium">{adjustmentItems.length} products</p>
                  </div>
                </div>

                {/* Products Table */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Current Stock</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Adjustment</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">New Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {adjustmentItems.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{item.product_name}</div>
                            <div className="text-sm text-gray-500">{item.product_code}</div>
                          </td>
                          <td className="px-4 py-3 text-center">{item.current_stock}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`font-medium ${
                              adjustmentType === 'increase' ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {adjustmentType === 'increase' ? '+' : '-'}{item.adjustment_quantity}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-medium">{item.after_adjustment}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              
              {/* Notes Input */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Additional Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any additional notes about this adjustment..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="px-6 py-3 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  ← Back to Input
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Confirm Adjustment</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StockAdjustment;